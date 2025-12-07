import * as vscode from 'vscode';
import {
  GraphState,
  GraphLanguage,
  GraphNode,
  GraphEdge,
  GraphDisplayLanguage,
  GraphNodeType,
  createDefaultGraphState
} from '../shared/graphState';
import { serializeGraphState, deserializeGraphState } from '../shared/serializer';
import { validateGraphState, type ValidationResult } from '../shared/validator';
import { generateCodeFromGraph } from '../shared/codegen';
import { getTranslation, type TranslationKey } from '../shared/translations';
import {
  extensionToWebviewMessageSchema,
  parseWebviewMessage,
  type ExtensionToWebviewMessage,
  type GraphMutationPayload,
  type TranslationDirection,
  type WebviewToExtensionMessage
} from '../shared/messages';
import {
  getThemeTokens,
  resolveEffectiveTheme,
  type EffectiveTheme,
  type ThemeSetting,
  type ThemeTokens
} from '../webview/theme';
import { MarianTranslator } from './marianTranslator';

type ToastKind = 'info' | 'success' | 'warning' | 'error';

export class GraphPanel {
  private static currentPanel: GraphPanel | undefined;
  private static readonly viewType = 'multicodeGraph';

  public static createOrShow(
    context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel
  ): GraphPanel {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (GraphPanel.currentPanel) {
      GraphPanel.currentPanel.panel.reveal(column);
      GraphPanel.currentPanel.postState();
      return GraphPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      GraphPanel.viewType,
      'MultiCode Graph',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')]
      }
    );

    GraphPanel.currentPanel = new GraphPanel(panel, context.extensionUri, outputChannel);
    GraphPanel.currentPanel.updateWebviewHtml();
    GraphPanel.currentPanel.postState();
    return GraphPanel.currentPanel;
  }

  public static getActivePanel(): GraphPanel | undefined {
    return GraphPanel.currentPanel;
  }

  private readonly disposables: vscode.Disposable[] = [];
  private graphState: GraphState;
  private locale: GraphDisplayLanguage;
  private themePreference: ThemeSetting;
  private translationEngine: 'none' | 'marian';
  private translationModels: Partial<Record<TranslationDirection, string>>;
  private translationCacheLimit: number;
  private translator: MarianTranslator | undefined;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly outputChannel: vscode.OutputChannel
  ) {
    const configuredLocale = vscode.workspace
      .getConfiguration('multicode')
      .get<string>('displayLanguage', 'ru');
    this.locale = configuredLocale === 'en' ? 'en' : 'ru';
    this.graphState = this.normalizeState({
      ...createDefaultGraphState(),
      displayLanguage: this.locale
    });
    this.themePreference = this.readThemePreference();
    const translationConfig = this.readTranslationConfig();
    this.translationEngine = translationConfig.engine;
    this.translationModels = translationConfig.models;
    this.translationCacheLimit = translationConfig.cacheLimit;
    this.translator = undefined;

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message: unknown) => this.handleIncomingMessage(message),
      undefined,
      this.disposables
    );

    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('multicode.theme')) {
          this.themePreference = this.readThemePreference();
          this.postTheme();
        }
        if (event.affectsConfiguration('multicode.translation')) {
          const config = this.readTranslationConfig();
          this.translationEngine = config.engine;
          this.translationModels = config.models;
          this.translationCacheLimit = config.cacheLimit;
          this.translator = undefined;
        }
      }),
      vscode.window.onDidChangeActiveColorTheme(() => this.postTheme())
    );
  }

  public focus(): void {
    this.panel.reveal();
  }

  public getState(): GraphState {
    return this.graphState;
  }

  public resetGraph(): void {
    this.graphState = this.normalizeState({
      ...createDefaultGraphState(),
      displayLanguage: this.locale
    });
    this.postState();
    this.postToast('success', this.translate('toasts.graphReset'));
  }

  public addNode(label?: string, nodeType: GraphNodeType = 'Function'): void {
    const nodeLabel = label?.trim() || `Узел ${this.graphState.nodes.length + 1}`;
    const newNode: GraphNode = {
      id: `node-${Date.now()}`,
      label: nodeLabel,
      type: nodeType,
      position: this.computeNextPosition()
    };
    this.markState({
      nodes: [...this.graphState.nodes, newNode]
    });
    this.postState();
    this.postToast('success', this.translate('toasts.nodeAdded', { name: nodeLabel }));
    this.sendToWebview({ type: 'nodeAdded', payload: { node: newNode } });
  }

  public connectNodes(sourceId?: string, targetId?: string, label?: string): void {
    if (!sourceId || !targetId) {
      this.postToast('warning', this.translate('errors.connectionMissing'));
      return;
    }
    if (sourceId === targetId) {
      this.postToast('warning', this.translate('errors.connectionSelf'));
      return;
    }
    const sourceExists = this.graphState.nodes.some((node) => node.id === sourceId);
    const targetExists = this.graphState.nodes.some((node) => node.id === targetId);
    if (!sourceExists || !targetExists) {
      this.postToast('warning', this.translate('errors.connectionMissing'));
      return;
    }
    const hasEdge = this.graphState.edges.some(
      (edge) => edge.source === sourceId && edge.target === targetId
    );
    if (hasEdge) {
      this.postToast('info', this.translate('errors.connectionExists'));
      return;
    }
    const edge: GraphEdge = {
      id: `edge-${Date.now()}`,
      source: sourceId,
      target: targetId,
      label: label?.trim() || 'flow',
      kind: 'execution'
    };
    this.markState({
      edges: [...this.graphState.edges, edge]
    });
    this.postState();
    this.postToast('success', this.translate('toasts.connectionCreated'));
    this.sendToWebview({ type: 'nodesConnected', payload: { edge } });
  }

  public async translateGraphLabels(direction?: TranslationDirection): Promise<void> {
    const targetDirection = direction ?? (await this.pickTranslationDirection());
    if (!targetDirection) {
      return;
    }
    const translator = this.getTranslator();
    if (!translator) {
      this.postToast('warning', 'Перевод отключён: включите Marian в настройках multicode.translation.engine');
      this.sendToWebview({ type: 'translationFinished', payload: { success: false } });
      return;
    }

    this.sendToWebview({ type: 'translationStarted', payload: { direction: targetDirection } });

    const uniqueTexts = new Set<string>();
    if (this.graphState.name) {
      uniqueTexts.add(this.graphState.name);
    }
    this.graphState.nodes.forEach((node) => uniqueTexts.add(node.label));
    this.graphState.edges.forEach((edge) => {
      if (edge.label) {
        uniqueTexts.add(edge.label);
      }
    });

    if (!uniqueTexts.size) {
      this.postToast('info', 'Нет текстов для перевода');
      this.sendToWebview({ type: 'translationFinished', payload: { success: false } });
      return;
    }

    let success = false;
    try {
      const translations = await translator.translateBatch(Array.from(uniqueTexts), targetDirection);
      const updatedNodes = this.graphState.nodes.map((node) => ({
        ...node,
        label: translations.get(node.label) ?? node.label
      }));
      const updatedEdges = this.graphState.edges.map((edge) => ({
        ...edge,
        label: edge.label ? translations.get(edge.label) ?? edge.label : edge.label
      }));
      const translatedName = this.graphState.name
        ? translations.get(this.graphState.name) ?? this.graphState.name
        : this.graphState.name;

      this.markState({
        nodes: updatedNodes,
        edges: updatedEdges,
        name: translatedName ?? this.graphState.name,
        displayLanguage: targetDirection === 'ru-en' ? 'en' : 'ru'
      });
      this.postState();
      this.postToast('success', `Тексты графа переведены (${targetDirection})`);
      success = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      this.postToast('error', `Перевод не выполнен: ${message}`);
    } finally {
      this.sendToWebview({ type: 'translationFinished', payload: { success } });
    }
  }

  public deleteNodes(nodeIds: string[]): void {
    const ids = nodeIds.filter(Boolean);
    if (!ids.length) {
      return;
    }
    const nodesLeft = this.graphState.nodes.filter((node) => !ids.includes(node.id));
    if (nodesLeft.length === this.graphState.nodes.length) {
      this.postToast('warning', this.translate('errors.connectionMissing'));
      return;
    }
    const edgesLeft = this.graphState.edges.filter(
      (edge) => !ids.includes(edge.source) && !ids.includes(edge.target)
    );

    this.markState({
      nodes: nodesLeft,
      edges: edgesLeft
    });
    this.postState();
    this.sendToWebview({ type: 'nodesDeleted', payload: { nodeIds: ids } });
    this.postToast('success', this.translate('toasts.nodesDeleted', { count: ids.length.toString() }));
  }

  public async saveGraph(): Promise<void> {
    const safeName = this.graphState.name.trim().replace(/[^\w-]+/g, '_') || 'graph';
    const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri ?? this.extensionUri;
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.joinPath(workspaceUri, `${safeName}.multicode.json`),
      filters: { JSON: ['json'] }
    });

    if (!uri) {
      return;
    }

    const payload = serializeGraphState(this.graphState);
    const data = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
    await vscode.workspace.fs.writeFile(uri, data);
    this.graphState.dirty = false;
    this.postState();
    this.postToast('success', this.translate('toasts.saved'));
  }

  public async loadGraph(): Promise<void> {
    const [uri] =
      (await vscode.window.showOpenDialog({
        filters: { JSON: ['json'] },
        canSelectMany: false
      })) ?? [];

    if (!uri) {
      return;
    }

    try {
      const raw = await vscode.workspace.fs.readFile(uri);
      const parsed = JSON.parse(Buffer.from(raw).toString('utf8'));
      const graph = deserializeGraphState(parsed);
      this.graphState = this.normalizeState(graph);
      this.postState();
      const validation = this.validateAndDispatch(this.graphState);
      if (validation.errors.length) {
        validation.errors.forEach((message) => this.postToast('error', message));
      } else {
        this.postToast('success', this.translate('toasts.loaded'));
      }
      validation.warnings.forEach((warning) => this.postToast('warning', warning));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : this.translate('errors.graphLoad');
      this.postToast('error', `${this.translate('errors.graphLoad')}: ${message}`);
    }
  }

  public updateLanguage(language: GraphLanguage): void {
    this.graphState = {
      ...this.graphState,
      language,
      updatedAt: new Date().toISOString(),
      dirty: true
    };
    this.postState();
  }

  public async handleGenerateCode(): Promise<void> {
    const code = generateCodeFromGraph(this.graphState);
    this.outputChannel.appendLine(code);
    this.outputChannel.show(true);
    this.postToast('success', this.translate('toasts.generated'));
  }

  public async handleValidateGraph(): Promise<void> {
    this.validateAndDispatch(this.graphState, true);
  }

  private postState(): void {
    this.sendToWebview({
      type: 'setState',
      payload: this.graphState
    });
  }

  private postTheme(): void {
    this.sendToWebview({
      type: 'themeChanged',
      payload: {
        preference: this.themePreference,
        hostTheme: this.getHostTheme(),
        displayLanguage: this.locale
      }
    });
  }

  private validateAndDispatch(state: GraphState, notify = false): ValidationResult {
    const result = validateGraphState(state);

    if (notify) {
      if (result.errors.length) {
        result.errors.forEach((error) => this.postToast('error', error));
      } else {
        this.postToast('success', this.translate('toasts.validationOk'));
      }
      result.warnings.forEach((warning) => this.postToast('warning', warning));
    }

    this.sendToWebview({
      type: 'validationResult',
      payload: result
    });

    return result;
  }

  private postToast(kind: ToastKind, message: string): void {
    this.sendToWebview({
      type: 'toast',
      payload: { kind, message }
    });
  }

  private translate(key: TranslationKey, replacements?: Record<string, string>): string {
    return getTranslation(this.locale, key, replacements);
  }

  private pickTranslationDirection(): Promise<TranslationDirection | undefined> {
    return vscode.window.showQuickPick<
      { label: string; value: TranslationDirection; description: string }
    >(
      [
        { label: 'RU → EN', value: 'ru-en', description: 'Перевести русские подписи на английский' },
        { label: 'EN → RU', value: 'en-ru', description: 'Перевести английские подписи на русский' }
      ],
      {
        placeHolder: 'Направление перевода для Marian MT'
      }
    ).then((selection) => selection?.value);
  }

  private getTranslator(): MarianTranslator | undefined {
    if (this.translationEngine !== 'marian') {
      return undefined;
    }
    if (!this.translator) {
      this.translator = new MarianTranslator(this.translationModels, this.translationCacheLimit);
    }
    return this.translator;
  }

  private markState(partial: Partial<GraphState>): void {
    this.graphState = {
      ...this.graphState,
      ...partial,
      updatedAt: new Date().toISOString(),
      dirty: true
    };
  }

  private readThemePreference(): ThemeSetting {
    const value = vscode.workspace.getConfiguration('multicode').get<string>('theme', 'auto');
    if (value === 'dark' || value === 'light' || value === 'auto') {
      return value;
    }
    return 'auto';
  }

  private getHostTheme(): EffectiveTheme {
    return vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light ? 'light' : 'dark';
  }

  private readTranslationConfig(): {
    engine: 'none' | 'marian';
    models: Partial<Record<TranslationDirection, string>>;
    cacheLimit: number;
  } {
    const config = vscode.workspace.getConfiguration('multicode.translation');
    const engine = config.get<'none' | 'marian'>('engine', 'none');
    const ruEnModel = config.get<string>('model.ruEn', 'Helsinki-NLP/opus-mt-ru-en');
    const enRuModel = config.get<string>('model.enRu', 'Helsinki-NLP/opus-mt-en-ru');
    const cacheLimit = Math.max(50, config.get<number>('cacheLimit', 200));
    return {
      engine,
      models: {
        'ru-en': ruEnModel,
        'en-ru': enRuModel
      },
      cacheLimit
    };
  }

  private buildRootCssVariables(tokens: ThemeTokens, effectiveTheme: EffectiveTheme): string {
    return `
        color-scheme: var(--mc-color-scheme, ${effectiveTheme});
        --mc-color-scheme: ${effectiveTheme};
        --mc-body-bg: ${tokens.ui.bodyBackground};
        --mc-body-text: ${tokens.ui.bodyText};
        --mc-muted: ${tokens.ui.mutedText};
        --mc-toolbar-from: ${tokens.ui.toolbarFrom};
        --mc-toolbar-to: ${tokens.ui.toolbarTo};
        --mc-toolbar-border: ${tokens.ui.toolbarBorder};
        --mc-surface: ${tokens.ui.surface};
        --mc-surface-strong: ${tokens.ui.surfaceStrong};
        --mc-surface-border: ${tokens.ui.surfaceBorder};
        --mc-panel-title: ${tokens.ui.panelTitle};
        --mc-badge-ok-bg: ${tokens.ui.badgeOkBg};
        --mc-badge-ok-text: ${tokens.ui.badgeOkText};
        --mc-badge-ok-border: ${tokens.ui.badgeOkBorder};
        --mc-badge-warn-bg: ${tokens.ui.badgeWarnBg};
        --mc-badge-warn-text: ${tokens.ui.badgeWarnText};
        --mc-badge-warn-border: ${tokens.ui.badgeWarnBorder};
        --mc-toast-info: ${tokens.ui.toastInfo};
        --mc-toast-success: ${tokens.ui.toastSuccess};
        --mc-toast-warning: ${tokens.ui.toastWarning};
        --mc-toast-error: ${tokens.ui.toastError};
        --mc-shadow: ${tokens.ui.shadow};
        --mc-button-bg: ${tokens.ui.buttonBg};
        --mc-button-border: ${tokens.ui.buttonBorder};
        --mc-button-text: ${tokens.ui.buttonText};
        --mc-button-hover-shadow: ${tokens.ui.buttonHoverShadow};
    `;
  }

  private normalizeState(state: GraphState): GraphState {
    const nodes = state.nodes.map((node, index) => ({
      ...node,
      type: node.type ?? 'Function',
      position: node.position ?? {
        x: 80 + (index % 4) * 160,
        y: 80 + Math.floor(index / 4) * 120
      }
    }));
    const edges = state.edges.map((edge) => ({
      ...edge,
      kind: edge.kind ?? 'execution'
    }));
    return {
      ...state,
      nodes,
      edges,
      displayLanguage: state.displayLanguage ?? this.locale,
      updatedAt: new Date().toISOString(),
      dirty: false
    };
  }

  private computeNextPosition(): { x: number; y: number } {
    const index = this.graphState.nodes.length;
    const columns = 4;
    const x = 120 + (index % columns) * 180;
    const y = 80 + Math.floor(index / columns) * 150;
    return { x, y };
  }

  private handleIncomingMessage(message: unknown): void {
    const parsed = parseWebviewMessage(message);
    if (!parsed.success) {
      this.handleMessageError('Некорректное сообщение от webview', parsed.error);
      return;
    }
    this.handleMessage(parsed.data);
  }

  private handleMessageError(context: string, error: unknown): void {
    const details = this.extractErrorDetails(error);
    const composed = `${context}: ${details}`;
    this.outputChannel.appendLine(composed);
    void vscode.window.showErrorMessage(composed);
    this.postLog('error', composed);
  }

  private extractErrorDetails(error: unknown): string {
    if (typeof error === 'string') {
      return error;
    }
    if (error && typeof error === 'object' && 'issues' in error) {
      const issues = (error as { issues?: Array<{ message: string }> }).issues ?? [];
      if (issues.length) {
        return issues.map((issue) => issue.message).join('; ');
      }
    }
    if (error instanceof Error) {
      return error.message;
    }
    return 'Неизвестная ошибка валидации сообщения';
  }

  private postLog(level: 'info' | 'warn' | 'error', message: string): void {
    const parsed = extensionToWebviewMessageSchema.safeParse({
      type: 'log',
      payload: { level, message }
    });
    if (!parsed.success) {
      this.outputChannel.appendLine(`Не удалось подготовить лог для webview: ${message}`);
      return;
    }
    void this.panel.webview.postMessage(parsed.data);
  }

  private sendToWebview(message: ExtensionToWebviewMessage): void {
    const parsed = extensionToWebviewMessageSchema.safeParse(message);
    if (!parsed.success) {
      this.handleMessageError('Сообщение для webview не прошло схему', parsed.error);
      return;
    }
    void this.panel.webview.postMessage(parsed.data);
  }

  private handleMessage(message: WebviewToExtensionMessage): void {
    switch (message.type) {
      case 'ready':
        this.postState();
        this.postTheme();
        break;
      case 'addNode':
        this.addNode(message.payload?.label, message.payload?.nodeType ?? 'Function');
        break;
      case 'connectNodes':
        this.connectNodes(message.payload?.sourceId, message.payload?.targetId, message.payload?.label);
        break;
      case 'deleteNodes':
        this.deleteNodes(message.payload.nodeIds);
        break;
      case 'renameGraph':
        this.markState({
          name: message.payload.name || this.graphState.name
        });
        this.postState();
        break;
      case 'updateLanguage':
        this.updateLanguage(message.payload.language);
        break;
      case 'changeDisplayLanguage':
        this.locale = message.payload.locale;
        this.markState({
          displayLanguage: this.locale
        });
        this.postState();
        break;
      case 'requestNewGraph':
        this.resetGraph();
        break;
      case 'requestSave':
        void this.saveGraph();
        break;
      case 'requestLoad':
        void this.loadGraph();
        break;
      case 'requestGenerate':
        void this.handleGenerateCode();
        break;
      case 'requestTranslate':
        void this.translateGraphLabels(message.payload?.direction);
        break;
      case 'requestValidate':
        void this.handleValidateGraph();
        break;
      case 'graphChanged':
        this.applyGraphMutation(message.payload);
        break;
      case 'reportWebviewError':
        this.handleMessageError('Ошибка в webview', new Error(message.payload.message));
        break;
      default:
        break;
    }
  }

  private applyGraphMutation(payload: GraphMutationPayload): void {
    const { nodes, edges, ...rest } = payload;
    const nextNodes = nodes?.length
      ? nodes.map((node, index) => ({
          ...node,
          type: node.type ?? 'Function',
          position:
            node.position ?? this.graphState.nodes[index]?.position ?? this.computeNextPosition()
        }))
      : undefined;

    const nextEdges = edges?.map((edge) => ({
      ...edge,
      kind: edge.kind ?? 'execution'
    }));

    if (rest.displayLanguage && rest.displayLanguage !== this.locale) {
      this.locale = rest.displayLanguage;
    }

    if (!nextNodes && !nextEdges && !Object.keys(rest).length) {
      return;
    }

    this.markState({
      ...rest,
      nodes: nextNodes ?? this.graphState.nodes,
      edges: nextEdges ?? this.graphState.edges
    });
    this.postState();
    this.validateAndDispatch(this.graphState);
  }

  private updateWebviewHtml(): void {
    const { webview } = this.panel;
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js'));
    const nonce = getNonce();
    const initialState = JSON.stringify(this.graphState).replace(/</g, '\\u003c');
    const effectiveTheme = resolveEffectiveTheme(this.themePreference, this.getHostTheme());
    const tokens = getThemeTokens(effectiveTheme);
    const rootCss = this.buildRootCssVariables(tokens, effectiveTheme);

    this.panel.webview.html = /* html */ `<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource} https:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width,initial-scale=1.0" />
    <title>MultiCode Graph</title>
    <style>
      :root {
        ${rootCss}
      }
      * {
        box-sizing: border-box;
      }
      body {
        padding: 0;
        margin: 0;
        font-family: 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        background: var(--mc-body-bg);
        color: var(--mc-body-text);
        min-height: 100vh;
      }
      #root {
        height: 100vh;
      }
      .app-shell {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--mc-body-bg);
        color: var(--mc-body-text);
      }
      .toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 18px;
        background: linear-gradient(135deg, var(--mc-toolbar-from), var(--mc-toolbar-to));
        border-bottom: 1px solid var(--mc-toolbar-border);
        box-shadow: var(--mc-shadow);
      }
      .toolbar-title {
        font-size: 16px;
        font-weight: 700;
      }
      .toolbar-subtitle {
        font-size: 12px;
        color: var(--mc-muted);
      }
      .toolbar-actions {
        display: flex;
        gap: 8px;
      }
      .toolbar button {
        background: var(--mc-button-bg);
        color: var(--mc-button-text);
        border: 1px solid var(--mc-button-border);
        border-radius: 6px;
        padding: 8px 12px;
        cursor: pointer;
        box-shadow: var(--mc-shadow);
        transition: transform 0.08s ease, box-shadow 0.08s ease;
      }
      .toolbar button:hover {
        transform: translateY(-1px);
        box-shadow: var(--mc-button-hover-shadow);
      }
      .toolbar button:disabled {
        opacity: 0.6;
        cursor: progress;
      }
      .workspace {
        display: grid;
        grid-template-columns: 1fr 320px;
        gap: 12px;
        flex: 1;
        padding: 12px;
      }
      .canvas-wrapper {
        background: var(--mc-surface-strong);
        border: 1px solid var(--mc-surface-border);
        border-radius: 12px;
        box-shadow: var(--mc-shadow);
        position: relative;
        overflow: hidden;
      }
      .graph-canvas {
        width: 100%;
        height: 100%;
        position: relative;
      }
      .side-panel {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .panel {
        background: var(--mc-surface);
        border: 1px solid var(--mc-surface-border);
        border-radius: 12px;
        padding: 12px;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04), var(--mc-shadow);
      }
      .panel-title {
        font-weight: 700;
        margin-bottom: 10px;
        color: var(--mc-panel-title);
      }
      .panel-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      .panel form {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-bottom: 10px;
      }
      .panel input,
      .panel select {
        width: 100%;
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid var(--mc-surface-border);
        background: var(--mc-body-bg);
        color: var(--mc-body-text);
      }
      .panel-action {
        grid-column: span 2;
        justify-self: flex-start;
        background: var(--mc-button-bg);
        color: var(--mc-button-text);
        border: 1px solid var(--mc-button-border);
        border-radius: 8px;
        padding: 8px 12px;
        cursor: pointer;
        box-shadow: var(--mc-shadow);
      }
      .panel-label {
        font-size: 12px;
        color: var(--mc-muted);
      }
      .panel-value {
        font-weight: 700;
        font-size: 14px;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        border-radius: 20px;
        font-size: 12px;
      }
      .badge-ok {
        background: var(--mc-badge-ok-bg);
        color: var(--mc-badge-ok-text);
        border: 1px solid var(--mc-badge-ok-border);
      }
      .badge-warn {
        background: var(--mc-badge-warn-bg);
        color: var(--mc-badge-warn-text);
        border: 1px solid var(--mc-badge-warn-border);
      }
      .validation-list {
        margin: 0;
        padding-left: 16px;
      }
      .validation-list li {
        margin-bottom: 6px;
      }
      .text-error { color: var(--mc-toast-error); }
      .text-warn { color: var(--mc-toast-warning); }
      .toast-container {
        position: fixed;
        top: 16px;
        right: 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        z-index: 10;
      }
      .toast {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 10px 14px;
        border-radius: 10px;
        box-shadow: var(--mc-shadow);
        font-size: 13px;
        border: 1px solid rgba(255, 255, 255, 0.05);
      }
      .toast-info { background: var(--mc-toast-info); color: #e0f2fe; }
      .toast-success { background: var(--mc-toast-success); color: #dcfce7; }
      .toast-warning { background: var(--mc-toast-warning); color: #fef3c7; }
      .toast-error { background: var(--mc-toast-error); color: #fee2e2; }
      .toast-close {
        background: transparent;
        border: none;
        color: inherit;
        cursor: pointer;
        font-size: 16px;
      }
      .context-menu {
        position: absolute;
        min-width: 160px;
        background: var(--mc-surface);
        border: 1px solid var(--mc-surface-border);
        border-radius: 8px;
        box-shadow: var(--mc-shadow);
        padding: 6px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        z-index: 5;
      }
      .context-menu__item {
        background: transparent;
        border: none;
        color: var(--mc-body-text);
        text-align: left;
        padding: 6px 8px;
        border-radius: 6px;
        cursor: pointer;
      }
      .context-menu__item:hover {
        background: var(--mc-toolbar-from);
        color: var(--mc-panel-title);
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}">const initialGraphState = ${initialState}; const initialTheme = ${JSON.stringify({
      preference: this.themePreference,
      hostTheme: this.getHostTheme(),
      displayLanguage: this.locale
    })};</script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }

  private dispose(): void {
    GraphPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const item = this.disposables.pop();
      item?.dispose();
    }
  }
}

const getNonce = (): string => {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 })
    .map(() => possible.charAt(Math.floor(Math.random() * possible.length)))
    .join('');
};





