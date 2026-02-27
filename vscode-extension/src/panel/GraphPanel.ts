import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  GraphState,
  GraphLanguage,
  GraphNode,
  GraphEdge,
  GraphDisplayLanguage,
  GraphNodeType,
  createDefaultGraphState
} from '../shared/graphState';
import { serializeGraphState, deserializeGraphState, parseSerializedGraph } from '../shared/serializer';
import { validateGraphState, type ValidationResult } from '../shared/validator';
import { migrateToBlueprintFormat, normalizePointerMeta } from '../shared/blueprintTypes';
import { CppCodeGenerator } from '../codegen';
import { compileCpp, getTempOutputPath, cleanupTempFiles, type CppStandard } from '../compilation/CppCompiler';
import { ensureCppToolchain, ToolchainError, type ToolchainUi } from '../compilation/ToolchainManager';
import { getTranslation, type TranslationKey } from '../shared/translations';
import {
  findMulticodeGraphBindingInSource,
  formatMulticodeGraphBindingLine,
  injectOrReplaceMulticodeGraphBinding,
  resolveGraphBindingFilePath,
  sanitizeGraphBindingFileName,
  type MulticodeGraphBinding,
} from '../shared/graphBinding';
import {
  injectOrReplaceMulticodeGraphSnapshot,
  removeMulticodeGraphSnapshot,
  tryExtractMulticodeGraphSnapshot,
} from '../shared/graphSnapshot';
import {
  extensionToWebviewMessageSchema,
  parseGraphState,
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

// Debug logging to file
const DEBUG_LOG_ENABLED = true;
let debugLogPath: string | null = null;

function debugLog(message: string, data?: unknown): void {
  if (!DEBUG_LOG_ENABLED) return;
  
  if (!debugLogPath) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      debugLogPath = path.join(workspaceFolders[0].uri.fsPath, 'multicode-debug.log');
    } else {
      return;
    }
  }
  
  const timestamp = new Date().toISOString();
  const logLine = data 
    ? `[${timestamp}] ${message}: ${JSON.stringify(data)}\n`
    : `[${timestamp}] ${message}\n`;
  
  try {
    fs.appendFileSync(debugLogPath, logLine);
  } catch {
    // Ignore write errors
  }
}
import { MarianTranslator } from './marianTranslator';
import {
  appendBindingBlock,
  findBlocksById,
  parseBindingBlocks,
  patchBindingBlock,
  type ParsedBindingBlock
} from './codeBinding';

type ToastKind = 'info' | 'success' | 'warning' | 'error';
type GeneratedCodeWriteResult =
  | { status: 'written'; uri: vscode.Uri }
  | { status: 'no-target' }
  | { status: 'failed'; reason: string };
type CodegenOutputProfile = 'clean' | 'learn' | 'debug' | 'recovery';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getVariablesStats = (variables: unknown): { hasVariables: boolean; variablesCount: number } => {
  if (!Array.isArray(variables)) {
    return { hasVariables: false, variablesCount: 0 };
  }
  return { hasVariables: true, variablesCount: variables.length };
};

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
      GraphPanel.currentPanel.bindActiveEditorDocument(vscode.window.activeTextEditor);
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
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'dist'),
          vscode.Uri.joinPath(context.extensionUri, 'media'),
        ]
      }
    );

    GraphPanel.currentPanel = new GraphPanel(panel, context, outputChannel);
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
  private boundCodeDocumentUri: vscode.Uri | undefined;
  private boundGraphBinding:
    | {
        binding: MulticodeGraphBinding;
        graphUri: vscode.Uri;
        rootFsPath: string;
      }
    | undefined;
  private readonly graphBindingIdUsage = new Map<string, Set<string>>();
  private readonly warnedDuplicateGraphIds = new Set<string>();
  private graphBindingLoadSeq = 0;
  private graphBindingAutoSaveTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly extensionUri: vscode.Uri;

  private readonly GRAPH_BINDING_AUTOSAVE_DELAY_MS = 450;

  private static readonly BOUND_GRAPH_READ_RESULT_LOADED = 'loaded';
  private static readonly BOUND_GRAPH_READ_RESULT_MISSING = 'missing';
  private static readonly BOUND_GRAPH_READ_RESULT_FAILED = 'failed';

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    private readonly outputChannel: vscode.OutputChannel
  ) {
    this.extensionUri = context.extensionUri;
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
    this.boundCodeDocumentUri = this.resolveWritableEditorUri(vscode.window.activeTextEditor);
    this.boundGraphBinding = undefined;

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
        if (event.affectsConfiguration('multicode.codegen.outputProfile')) {
          this.postCodegenProfile();
        }
        if (event.affectsConfiguration('multicode.translation')) {
          const config = this.readTranslationConfig();
          this.translationEngine = config.engine;
          this.translationModels = config.models;
          this.translationCacheLimit = config.cacheLimit;
          this.translator = undefined;
        }
      }),
      vscode.window.onDidChangeActiveColorTheme(() => this.postTheme()),
      vscode.window.onDidChangeActiveTextEditor((editor) => this.bindActiveEditorDocument(editor))
    );

    if (this.boundCodeDocumentUri) {
      void this.tryLoadGraphFromBoundSource(this.boundCodeDocumentUri);
    }
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
    const graphBindingConfig = this.readGraphBindingConfig();
    const codeUri = this.boundCodeDocumentUri;

    // Новый путь: сохраняем в .multicode (sidecar) по привязке к исходнику.
    // Старый путь (save as) остаётся fallback'ом, если нет привязанного файла или привязка отключена.
    if (graphBindingConfig.enabled && codeUri && codeUri.scheme === 'file') {
      const rootFsPath = this.resolveGraphBindingRootFsPath(codeUri);
      const bindingFile = this.makeDefaultBindingFileRelativePath(this.graphState.id, graphBindingConfig.folder);
      const graphFsPath = resolveGraphBindingFilePath(rootFsPath, bindingFile);
      const graphUri = vscode.Uri.file(graphFsPath);
      this.boundGraphBinding = {
        binding: { graphId: this.graphState.id, file: bindingFile },
        graphUri,
        rootFsPath,
      };

      // 1) Сохраняем sidecar
      await this.tryWriteBoundGraphFile();

      // 2) Обновляем/вставляем маркер в исходник, чтобы привязка переживала переименования и перезагрузку VS Code.
      const bindingLine = formatMulticodeGraphBindingLine({ graphId: this.graphState.id, file: bindingFile });
      try {
        const document = await vscode.workspace.openTextDocument(codeUri);
        const original = document.getText();
        const next = injectOrReplaceMulticodeGraphBinding(original, bindingLine, graphBindingConfig.maxLines);
        if (next !== original) {
          const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(original.length)
          );
          const edit = new vscode.WorkspaceEdit();
          edit.replace(codeUri, fullRange, next);
          const applied = await vscode.workspace.applyEdit(edit);
          if (applied && !document.isUntitled) {
            await document.save();
          }
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown error';
        this.outputChannel.appendLine(`[MultiCode] Не удалось записать маркер @multicode:graph: ${reason}`);
      }

      this.graphState.dirty = false;
      this.postState();
      this.postToast('success', this.translate('toasts.saved'));
      return;
    }

    const safeName = this.graphState.name.trim().replace(/[^\w-]+/g, '_') || 'graph';
    const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri ?? this.extensionUri;
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.joinPath(workspaceUri, `${safeName}.multicode`),
      filters: { MultiCode: ['multicode', 'json'] }
    });

    if (!uri) {
      return;
    }

    const isJson = uri.fsPath.toLowerCase().endsWith('.json');
    const payload = isJson ? serializeGraphState(this.graphState) : ({ ...this.graphState, dirty: false } as GraphState);
    const data = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
    await vscode.workspace.fs.writeFile(uri, data);
    this.graphState.dirty = false;
    this.postState();
    this.postToast('success', this.translate('toasts.saved'));
  }

  public async loadGraph(): Promise<void> {
    const graphBindingConfig = this.readGraphBindingConfig();
    const codeUri = this.boundCodeDocumentUri;

    // Новый путь: если в исходнике есть @multicode:graph, загружаем связанный .multicode автоматически.
    if (graphBindingConfig.enabled && codeUri && codeUri.scheme === 'file') {
      try {
        const document = await vscode.workspace.openTextDocument(codeUri);
        const limit = Math.min(graphBindingConfig.maxLines, document.lineCount);
        const headerText = Array.from({ length: limit }, (_, idx) => document.lineAt(idx).text).join('\n');
        const binding = findMulticodeGraphBindingInSource(headerText, graphBindingConfig.maxLines);
        if (binding) {
          const status = await this.tryLoadGraphFromBoundSource(codeUri);
          if (status === 'loaded' || status === 'created') {
            this.postToast('success', this.translate('toasts.loaded'));
          }
          return;
        }
      } catch {
        // Игнорируем и падаем в fallback диалог.
      }
    }

    const [uri] =
      (await vscode.window.showOpenDialog({
        filters: { MultiCode: ['multicode', 'json'] },
        canSelectMany: false
      })) ?? [];

    if (!uri) {
      return;
    }

    try {
      const raw = await vscode.workspace.fs.readFile(uri);
      const parsed = JSON.parse(Buffer.from(raw).toString('utf8'));

      const asGraph = parseGraphState(parsed);
      const asSerialized = parseSerializedGraph(parsed);
      if (!asGraph.success && !asSerialized.success) {
        const validation = this.composeValidationFromIssues(asGraph.error.issues ?? []);
        this.postValidationResult(validation);
        const details = this.extractErrorDetails(asGraph.error);
        this.postToast('error', `${this.translate('errors.graphLoad')}: ${details}`);
        return;
      }

      const graph = asGraph.success ? asGraph.data : deserializeGraphState(parsed);
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
    const generator = new CppCodeGenerator();
    const blueprintState = migrateToBlueprintFormat(this.graphState);
    const verboseCodegenLogs = this.readCodegenVerboseLogs();
    const outputProfile = this.readCodegenOutputProfile();
    const codegenOptions = this.resolveCodegenOptionsForProfile(outputProfile);

    if (verboseCodegenLogs) {
      this.outputChannel.appendLine('');
      this.outputChannel.appendLine(`[CodeGen] Узлов: ${blueprintState.nodes.length}, Переменных: ${(blueprintState.variables ?? []).length}, Связей: ${blueprintState.edges.length}`);
      for (const node of blueprintState.nodes) {
        const props = node.properties as Record<string, unknown> | undefined;
        const varId = props?.variableId ?? '—';
        const varName = props?.name ?? props?.nameRu ?? '—';
        this.outputChannel.appendLine(`[CodeGen]   Узел: type=${node.type}, label="${node.label}", varId=${String(varId)}, varName=${String(varName)}`);
      }
      if (this.boundCodeDocumentUri) {
        this.outputChannel.appendLine(`[CodeGen] Целевой файл: ${this.boundCodeDocumentUri.fsPath}`);
      } else {
        this.outputChannel.appendLine('[CodeGen] Целевой файл: не привязан');
      }

      const variablesSnapshot = Array.isArray(blueprintState.variables) ? blueprintState.variables : [];
      const pointerVariables = variablesSnapshot.filter((variable) => isRecord(variable) && variable.dataType === 'pointer');
      if (pointerVariables.length > 0) {
        this.outputChannel.appendLine(`[CodeGen] Указатели/ссылки: ${pointerVariables.length}`);
        for (const variable of pointerVariables) {
          const id = typeof variable.id === 'string' ? variable.id : '—';
          const displayName = typeof variable.name === 'string'
            ? variable.name
            : typeof variable.nameRu === 'string'
              ? variable.nameRu
              : '—';
          const codeName = typeof variable.codeName === 'string' ? variable.codeName : '—';
          const meta = normalizePointerMeta(variable.pointerMeta);
          const target = meta.targetVariableId
            ? variablesSnapshot.find((candidate) => isRecord(candidate) && candidate.id === meta.targetVariableId)
            : undefined;
          const targetName = target
            ? (typeof target.name === 'string'
              ? target.name
              : typeof target.nameRu === 'string'
                ? target.nameRu
                : meta.targetVariableId)
            : null;
          const defaultValue = variable.defaultValue;

          this.outputChannel.appendLine(
            `[CodeGen]   pointer id=${id}, name=${displayName}, codeName=${codeName}, mode=${meta.mode}, pointee=${meta.pointeeDataType}${meta.pointeeDataType === 'vector' ? `<${meta.pointeeVectorElementType ?? 'double'}>` : ''}, target=${targetName ?? '—'}, default=${JSON.stringify(defaultValue)}`
          );
        }
      }
    }

    const result = generator.generate(blueprintState, codegenOptions);
    
    if (result.success) {
      const targetUri =
        this.boundCodeDocumentUri ?? this.resolveWritableEditorUri(vscode.window.activeTextEditor);

      const prepared = targetUri
        ? await this.prepareGeneratedCodeForWrite(result.code, targetUri, outputProfile)
        : { code: result.code };

      this.outputChannel.appendLine('');
      this.outputChannel.appendLine('═'.repeat(60));
      this.outputChannel.appendLine(prepared.code);
      this.outputChannel.appendLine('═'.repeat(60));
      this.outputChannel.appendLine(`// Узлов обработано: ${result.stats.nodesProcessed}`);
      this.outputChannel.appendLine(`// Строк кода: ${result.stats.linesOfCode}`);
      this.outputChannel.appendLine(`// Время генерации: ${result.stats.generationTimeMs.toFixed(2)} мс`);
      
      if (result.warnings.length > 0) {
        this.outputChannel.appendLine('');
        this.outputChannel.appendLine('// Предупреждения:');
        for (const warning of result.warnings) {
          this.outputChannel.appendLine(`//   - ${warning.message}`);
        }
      }

      const writeResult = await this.writeGeneratedCodeToBoundDocument(prepared.code);
      if (writeResult.status === 'written') {
        const targetPath = writeResult.uri.fsPath || writeResult.uri.toString();
        const fileName = path.basename(targetPath);
        this.outputChannel.appendLine(`[MultiCode] Код записан в файл: ${targetPath}`);
        this.postToast('success', this.translate('toasts.generatedToFile', { file: fileName }));
      } else if (writeResult.status === 'no-target') {
        this.postToast('warning', this.translate('errors.codeWriteTargetMissing'));
        this.postToast('success', this.translate('toasts.generated'));
      } else {
        this.outputChannel.appendLine(`[MultiCode] Не удалось записать код в файл: ${writeResult.reason}`);
        this.postToast('warning', this.translate('errors.codeWriteFailed', { reason: writeResult.reason }));
        this.postToast('success', this.translate('toasts.generated'));
      }

      this.outputChannel.show(true);
    } else {
      this.outputChannel.appendLine('');
      this.outputChannel.appendLine('═'.repeat(60));
      this.outputChannel.appendLine('// ОШИБКИ ГЕНЕРАЦИИ:');
      for (const error of result.errors) {
        this.outputChannel.appendLine(`//   ✗ ${error.message}`);
      }
      this.outputChannel.appendLine('═'.repeat(60));
      this.outputChannel.show(true);
      this.postToast('error', `Ошибки генерации: ${result.errors.length}`);
    }
  }

  public async handleGenerateCodeBinding(): Promise<void> {
    const result = this.generateCurrentGraphCode();
    if (!result || !result.success) {
      return;
    }

    const targetUri = await this.pickTargetCppFile();
    if (!targetUri) {
      return;
    }

    const originalContent = Buffer.from(await vscode.workspace.fs.readFile(targetUri)).toString('utf8');
    const parsed = parseBindingBlocks(originalContent);

    if (!parsed.success) {
      const markerError = parsed.error;
      this.postToast('error', `Ошибка маркеров: ${markerError?.message ?? 'Неизвестная ошибка парсинга маркеров.'}`);
      return;
    }

    if (!parsed.blocks.length) {
      const inserted = await this.tryInsertNewBindingBlock(originalContent, targetUri, result.code);
      if (inserted) {
        this.postToast('success', 'Код вставлен в новый multicode-блок.');
      }
      return;
    }

    const targetBlock = await this.selectBindingBlock(parsed.blocks);
    if (!targetBlock) {
      return;
    }

    const patchedContent = patchBindingBlock(originalContent, targetBlock, result.code);
    await vscode.workspace.fs.writeFile(targetUri, Buffer.from(patchedContent, 'utf8'));
    this.postToast(
      'success',
      `Блок обновлён: ${targetBlock.id ? `id=${targetBlock.id}` : `строки ${targetBlock.beginLine}-${targetBlock.endLine}`}`
    );
  }

  public async handleValidateGraph(): Promise<void> {
    this.validateAndDispatch(this.graphState, true);
  }

  public async handleCompileAndRun(standardOverride?: CppStandard): Promise<void> {
    console.log('[EXTENSION DEBUG] handleCompileAndRun called with standardOverride:', standardOverride);
    this.outputChannel.appendLine('[Compile & Run] Запуск функции компиляции...');
    
    // Сначала генерируем код
    const generator = new CppCodeGenerator();
    const blueprintState = migrateToBlueprintFormat(this.graphState);
    const result = generator.generate(blueprintState, this.resolveCodegenOptionsForProfile('clean'));

    if (!result.success) {
      this.outputChannel.appendLine('[Compile & Run] ✗ Ошибка генерации кода:');
      for (const error of result.errors) {
        this.outputChannel.appendLine(`  - ${error.message}`);
      }
      this.postToast('error', 'Ошибки при генерации кода');
      this.outputChannel.show(true);
      return;
    }

    this.outputChannel.appendLine('');
    this.outputChannel.appendLine('═'.repeat(60));
    this.outputChannel.appendLine('[Compile & Run] ✓ Код успешно сгенерирован');
    this.outputChannel.appendLine('═'.repeat(60));

    // Для "▶ Запустить" используем строго C++23 (без понижения).
    // Параметр standardOverride и настройка cpp.standard сохраняются для совместимости,
    // но на выполнение не влияют.
    const cppStandard: CppStandard = 'cpp23';
    if (standardOverride && standardOverride !== cppStandard) {
      this.outputChannel.appendLine(
        `[Compile & Run] ⚠ Игнорирую стандарт из UI (${standardOverride}). Используется ${cppStandard} (strict).`
      );
    }

    this.outputChannel.appendLine(`[Compile & Run] Стандарт C++: ${cppStandard} (strict)`);

    // Сохранить код во временный файл
    const tempDir = os.tmpdir();
    const tempSourceFile = path.join(tempDir, `multicode_temp_${Date.now()}.cpp`);
    const tempExe = getTempOutputPath(tempSourceFile);

    try {
      fs.writeFileSync(tempSourceFile, result.code, 'utf8');
      this.outputChannel.appendLine(`[Compile & Run] Источник: ${tempSourceFile}`);

      this.outputChannel.appendLine('[Compile & Run] Поиск компилятора...');
      const toolchainUi: ToolchainUi = {
        withProgress: async (title, task) =>
          await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title, cancellable: true },
            async (progress, token) => {
              const controller = new AbortController();
              const subscription = token.onCancellationRequested(() => controller.abort());
              try {
                return await task(
                  (message) => progress.report({ message }),
                  controller.signal
                );
              } finally {
                subscription.dispose();
              }
            }
          ),
        confirm: async (message, acceptLabel, cancelLabel) => {
          const selected = await vscode.window.showInformationMessage(
            message,
            { modal: true },
            acceptLabel,
            cancelLabel
          );
          return selected === acceptLabel;
        },
        showError: async (message) => {
          void vscode.window.showErrorMessage(message);
        },
      };

      const toolchain = await ensureCppToolchain({
        platform: process.platform,
        arch: process.arch as NodeJS.Architecture,
        env: process.env,
        globalStoragePath: this.context.globalStorageUri.fsPath,
        workspaceRootPath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
        getSetting: <T,>(key: string, defaultValue: T): T =>
          vscode.workspace.getConfiguration('multicode').get<T>(key, defaultValue)!,
        globalStateGet: <T,>(key: string): T | undefined => this.context.globalState.get<T>(key),
        globalStateUpdate: async (key: string, value: unknown): Promise<void> => {
          await this.context.globalState.update(key, value);
        },
        translate: (key: TranslationKey, replacements?: Record<string, string>) =>
          this.translate(key, replacements),
        locale: this.locale,
        ui: toolchainUi,
        log: (message, data) => this.outputChannel.appendLine(`[Toolchain] ${message}${data ? ` ${JSON.stringify(data)}` : ''}`),
      });

      this.outputChannel.appendLine(`[Compile & Run] Найден компилятор: ${toolchain.compilerType}`);

      // Компилируем
      this.outputChannel.appendLine('[Compile & Run] Компиляция...');
      const compileResult = await compileCpp(tempSourceFile, tempExe, {
        standard: cppStandard,
        strictStandard: true,
        compiler: toolchain.compilerType,
        compilerPath: toolchain.compilerPath,
        optimization: 'O2',
        env: toolchain.env,
        extraArgs: toolchain.extraCompileArgs,
      });

      if (!compileResult.success) {
        this.outputChannel.appendLine('[Compile & Run] ✗ Ошибка компиляции:');
        this.outputChannel.appendLine(compileResult.stderr || compileResult.errors[0] || 'Неизвестная ошибка');
        this.postToast('error', 'Ошибка компиляции C++');
        this.outputChannel.show(true);
        return;
      }

      if (compileResult.compilerCommand) {
        const compilerLabel = compileResult.compilerType ? `${compileResult.compilerType} (${compileResult.compilerCommand})` : compileResult.compilerCommand;
        this.outputChannel.appendLine(`[Compile & Run] Компилятор: ${compilerLabel}`);
      }

      if (compileResult.standardUsed && compileResult.standardUsed !== cppStandard) {
        this.outputChannel.appendLine(
          `[Compile & Run] ⚠ Неожиданный стандарт: ${compileResult.standardUsed} (ожидался: ${cppStandard})`
        );
      }

      this.outputChannel.appendLine(`[Compile & Run] ✓ Компиляция успешна (${compileResult.duration.toFixed(0)}мс)`);
      this.outputChannel.appendLine(`[Compile & Run] Исполняемый файл: ${tempExe}`);

      this.outputChannel.appendLine('[Compile & Run] Запуск программы в терминале...');
      this.outputChannel.appendLine('─'.repeat(60));
      const startedAt = Date.now();
      const exitCode = await this.runExecutableInTerminal(tempExe, toolchain.env);
      const duration = Date.now() - startedAt;
      this.outputChannel.appendLine('─'.repeat(60));
      if (typeof exitCode === 'number') {
        this.outputChannel.appendLine(
          `[Compile & Run] Программа завершена (exit code: ${exitCode}, ${duration.toFixed(0)}мс)`
        );
        if (exitCode === 0) {
          this.postToast('success', 'Программа успешно выполнена');
        } else {
          this.postToast('warning', `Программа завершилась с кодом ${exitCode}`);
        }
      } else {
        this.outputChannel.appendLine('[Compile & Run] Выполнение завершено (код завершения недоступен)');
        this.postToast('warning', 'Выполнение завершено. Код завершения недоступен.');
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      if (error instanceof ToolchainError) {
        this.outputChannel.appendLine(`[Compile & Run] ✗ Toolchain: ${message}`);
      } else {
        this.outputChannel.appendLine(`[Compile & Run] ✗ Ошибка: ${message}`);
      }
      this.postToast('error', `Ошибка при компиляции/запуске: ${message}`);
    } finally {
      // Очистим временные файлы
      await cleanupTempFiles([tempSourceFile, tempExe]);
      this.outputChannel.appendLine('[Compile & Run] Временные файлы удалены');
      this.outputChannel.appendLine('═'.repeat(60));
      this.outputChannel.show(true);
    }
  }

  private async runExecutableInTerminal(
    executablePath: string,
    env: NodeJS.ProcessEnv
  ): Promise<number | undefined> {
    const scope: vscode.TaskScope | vscode.WorkspaceFolder =
      vscode.workspace.workspaceFolders?.[0] ?? vscode.TaskScope.Global;

    const execution = new vscode.ProcessExecution(executablePath, [], {
      cwd: path.dirname(executablePath),
      env: this.toTaskEnvironment(env),
    });
    const task = new vscode.Task(
      { type: 'process', task: 'multicode.runGenerated' },
      scope,
      'MultiCode: Run Generated Program',
      'multicode',
      execution,
      []
    );
    task.presentationOptions = {
      reveal: vscode.TaskRevealKind.Always,
      panel: vscode.TaskPanelKind.Dedicated,
      clear: true,
      focus: true,
    };

    const taskExecution = await vscode.tasks.executeTask(task);
    return await new Promise<number | undefined>((resolve) => {
      const onEndProcess = vscode.tasks.onDidEndTaskProcess((event) => {
        if (event.execution !== taskExecution) {
          return;
        }
        onEndProcess.dispose();
        onEndTask.dispose();
        resolve(event.exitCode);
      });
      const onEndTask = vscode.tasks.onDidEndTask((event) => {
        if (event.execution !== taskExecution) {
          return;
        }
        onEndProcess.dispose();
        onEndTask.dispose();
        resolve(undefined);
      });
    });
  }

  private toTaskEnvironment(env: NodeJS.ProcessEnv): Record<string, string> {
    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === 'string') {
        next[key] = value;
      }
    }
    return next;
  }

  private postState(): void {
    debugLog('postState called', { variables: this.graphState.variables?.length ?? 0 });
    this.sendToWebview({
      type: 'setState',
      payload: this.graphState
    });
    this.postBoundFile();
    this.postCodegenProfile();
  }

  private postBoundFile(): void {
    const uri = this.boundCodeDocumentUri;
    this.sendToWebview({
      type: 'boundFileChanged',
      payload: {
        fileName: uri ? path.basename(uri.fsPath) : null,
        filePath: uri ? uri.fsPath : null,
      }
    });
  }

  private postCodegenProfile(): void {
    this.sendToWebview({
      type: 'codegenProfileChanged',
      payload: {
        profile: this.readCodegenOutputProfile(),
      }
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

    this.postValidationResult(result);

    return result;
  }

  private composeValidationFromIssues(issues: Array<{ message: string }>): ValidationResult {
    return {
      ok: false,
      errors: issues.map((issue) => issue.message),
      warnings: [],
      issues: issues.map((issue) => ({ severity: 'error' as const, message: issue.message }))
    };
  }

  private postValidationResult(result: ValidationResult): void {
    this.sendToWebview({
      type: 'validationResult',
      payload: result
    });
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

  private async pickTranslationDirection(): Promise<TranslationDirection | undefined> {
    const selection = await vscode.window.showQuickPick<
      { label: string; value: TranslationDirection; description: string }
    >(
      [
        { label: 'RU → EN', value: 'ru-en', description: 'Перевести русские подписи на английский' },
        { label: 'EN → RU', value: 'en-ru', description: 'Перевести английские подписи на русский' }
      ],
      {
        placeHolder: 'Направление перевода для Marian MT'
      }
    );
    return selection?.value;
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

  private readCodegenVerboseLogs(): boolean {
    return vscode.workspace.getConfiguration('multicode').get<boolean>('codegen.verboseLogs', false);
  }

  private readCodegenOutputProfile(): CodegenOutputProfile {
    const profile = vscode.workspace
      .getConfiguration('multicode')
      .get<CodegenOutputProfile>('codegen.outputProfile', 'clean');
    if (profile === 'learn' || profile === 'debug' || profile === 'recovery') {
      return profile;
    }
    return 'clean';
  }

  private async setCodegenOutputProfile(profile: CodegenOutputProfile): Promise<void> {
    const current = this.readCodegenOutputProfile();
    if (current === profile) {
      this.postCodegenProfile();
      return;
    }

    const config = vscode.workspace.getConfiguration('multicode');
    const hasWorkspace = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
    const target = hasWorkspace
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;

    try {
      await config.update('codegen.outputProfile', profile, target);
      this.postCodegenProfile();
      this.postToast(
        'success',
        this.translate('toasts.codegenProfileChanged', {
          profile: this.translate(`toolbar.codegenProfile.${profile}` as TranslationKey),
        })
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      this.postToast('error', `${this.translate('errors.codegenProfileUpdateFailed')}: ${reason}`);
    }
  }

  private resolveCodegenOptionsForProfile(
    profile: CodegenOutputProfile
  ): { includeRussianComments: boolean; includeSourceMarkers: boolean } {
    switch (profile) {
      case 'clean':
        return { includeRussianComments: false, includeSourceMarkers: false };
      case 'learn':
        return { includeRussianComments: true, includeSourceMarkers: false };
      case 'debug':
      case 'recovery':
        return { includeRussianComments: true, includeSourceMarkers: true };
      default:
        return { includeRussianComments: false, includeSourceMarkers: false };
    }
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

  private getExpectedLanguageIds(): ReadonlyArray<string> {
    switch (this.graphState.language) {
      case 'cpp':
        return ['cpp', 'c', 'cuda-cpp', 'objective-cpp'];
      case 'rust':
        return ['rust'];
      case 'asm':
        return ['asm', 'nasm', 'masm'];
      default:
        return [];
    }
  }

  private resolveWritableEditorUri(editor: vscode.TextEditor | undefined): vscode.Uri | undefined {
    if (!editor) {
      return undefined;
    }

    const document = editor.document;
    if (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled') {
      return undefined;
    }

    const expectedLanguageIds = this.getExpectedLanguageIds();
    if (expectedLanguageIds.length > 0 && !expectedLanguageIds.includes(document.languageId)) {
      return undefined;
    }

    return document.uri;
  }

  private bindActiveEditorDocument(editor: vscode.TextEditor | undefined): void {
    const uri = this.resolveWritableEditorUri(editor);
    if (uri) {
      const prevUri = this.boundCodeDocumentUri;
      this.boundCodeDocumentUri = uri;
      this.postBoundFile();
      if (!prevUri || prevUri.toString() !== uri.toString()) {
        void this.tryLoadGraphFromBoundSource(uri);
      }
    }
  }

  private async writeGeneratedCodeToBoundDocument(code: string): Promise<GeneratedCodeWriteResult> {
    const targetUri =
      this.boundCodeDocumentUri ?? this.resolveWritableEditorUri(vscode.window.activeTextEditor);
    if (!targetUri) {
      return { status: 'no-target' };
    }

    try {
      const document = await vscode.workspace.openTextDocument(targetUri);
      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length)
      );
      const edit = new vscode.WorkspaceEdit();
      edit.replace(targetUri, fullRange, code);

      const applied = await vscode.workspace.applyEdit(edit);
      if (!applied) {
        return { status: 'failed', reason: 'Workspace edit was not applied' };
      }

      this.boundCodeDocumentUri = targetUri;
      if (!document.isUntitled) {
        await document.save();
      }

      return { status: 'written', uri: targetUri };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      return { status: 'failed', reason };
    }
  }

  private handleIncomingMessage(message: unknown): void {
    // Логируем сырое сообщение до парсинга
    if (isRecord(message) && (message.type === 'graphChanged' || message.type === 'requestCompileAndRun')) {
      console.log('[EXTENSION DEBUG] Incoming message before parse:', message);
      debugLog(`RAW ${message.type} message`, message);
      
      if (message.type === 'graphChanged') {
        const payload = isRecord(message.payload) ? message.payload : undefined;
        const { hasVariables, variablesCount } = getVariablesStats(payload?.variables);
        debugLog('RAW graphChanged message', {
          hasPayload: !!payload,
          payloadKeys: payload ? Object.keys(payload) : [],
          hasVariables,
          variablesCount
        });
      }
    }
    
    const parsed = parseWebviewMessage(message);
    if (!parsed.success) {
      console.error('[EXTENSION DEBUG] Message parsing failed:', message, parsed.error);
      this.handleMessageError('Некорректное сообщение от webview', parsed.error);
      return;
    }
    
    // Логируем после парсинга
    if (parsed.data.type === 'requestCompileAndRun') {
      console.log('[EXTENSION DEBUG] Parsed requestCompileAndRun:', parsed.data);
      debugLog('PARSED requestCompileAndRun message', parsed.data);
    } else if (parsed.data.type === 'graphChanged') {
      const { hasVariables, variablesCount } = getVariablesStats(parsed.data.payload.variables);
      debugLog('PARSED graphChanged message', {
        payloadKeys: Object.keys(parsed.data.payload),
        hasVariables,
        variablesCount
      });
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
      case 'requestGenerateBinding':
        void this.handleGenerateCodeBinding();
        break;
      case 'requestTranslate':
        void this.translateGraphLabels(message.payload?.direction);
        break;
      case 'requestValidate':
        void this.handleValidateGraph();
        break;
      case 'requestCompileAndRun':
        void this.handleCompileAndRun(message.payload?.standard);
        break;
      case 'setCodegenProfile':
        void this.setCodegenOutputProfile(message.payload.profile);
        break;
      case 'graphChanged':
        this.applyGraphMutation(message.payload);
        break;
      case 'reportWebviewError':
        this.handleMessageError('Ошибка в webview', new Error(message.payload.message));
        break;
      case 'reportWebviewTrace':
        debugLog(`[WEBVIEW_TRACE] ${message.payload.category}: ${message.payload.message}`, message.payload.data);
        this.outputChannel.appendLine(
          `[MultiCode][trace] ${message.payload.category}: ${message.payload.message}`
        );
        break;
      default:
        break;
    }
  }

  private generateCurrentGraphCode() {
    const blueprintState = migrateToBlueprintFormat(this.graphState);

    try {
      const generator = createGenerator(this.graphState.language);
      return generator.generate(blueprintState);
    } catch (error) {
      if (error instanceof UnsupportedLanguageError) {
        this.postToast(
          'warning',
          this.translate('codegen.unsupportedLanguage', { language: error.language.toUpperCase() })
        );
        return undefined;
      }
      throw error;
    }
  }

  private async pickTargetCppFile(): Promise<vscode.Uri | undefined> {
    const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
    const [uri] =
      (await vscode.window.showOpenDialog({
        canSelectMany: false,
        canSelectFiles: true,
        canSelectFolders: false,
        defaultUri: workspaceUri,
        filters: { 'C++': ['cpp', 'cc', 'cxx', 'hpp', 'h'] },
        openLabel: 'Выбрать файл для вставки'
      })) ?? [];

    return uri;
  }

  private async tryInsertNewBindingBlock(
    sourceText: string,
    targetUri: vscode.Uri,
    generatedCode: string
  ): Promise<boolean> {
    const answer = await vscode.window.showWarningMessage(
      'В файле нет маркеров multicode:begin/end. Добавить новый блок в конец файла?',
      { modal: true },
      'Добавить блок'
    );

    if (!answer) {
      return false;
    }

    const defaultBlockId = this.graphState.id;
    const blockId = await vscode.window.showInputBox({
      prompt: 'ID нового multicode-блока',
      value: defaultBlockId,
      validateInput: (value) => (value.trim().length ? null : 'ID блока не может быть пустым')
    });

    if (!blockId?.trim()) {
      return false;
    }

    const patchedContent = appendBindingBlock(sourceText, blockId, generatedCode);
    await vscode.workspace.fs.writeFile(targetUri, Buffer.from(patchedContent, 'utf8'));
    return true;
  }

  private async selectBindingBlock(blocks: ParsedBindingBlock[]): Promise<ParsedBindingBlock | undefined> {
    if (blocks.length === 1) {
      return blocks[0];
    }

    const requestedId = await vscode.window.showInputBox({
      prompt: 'Укажите ID блока (опционально) для точного выбора',
      placeHolder: 'Например: main_loop'
    });

    const candidates = findBlocksById(blocks, requestedId);
    const pool = candidates.length ? candidates : blocks;

    if (pool.length === 1) {
      return pool[0];
    }

    const picked = await vscode.window.showQuickPick(
      pool.map((block) => ({
        label: block.id ? `$(symbol-key) ${block.id}` : `$(symbol-field) Блок ${block.beginLine}`,
        description: `строки ${block.beginLine}-${block.endLine}`,
        detail: block.contextPreview,
        block
      })),
      { title: 'Выберите multicode-блок для обновления' }
    );

    return picked?.block;
  }

  private applyGraphMutation(payload: GraphMutationPayload): void {
    const payloadStats = getVariablesStats(payload.variables);
    debugLog('applyGraphMutation received', {
      hasVariables: payloadStats.hasVariables,
      variablesCount: payloadStats.variablesCount,
      payloadKeys: Object.keys(payload),
    });
    const { nodes, edges, ...rest } = payload;
    const restStats = getVariablesStats(rest.variables);
    debugLog('rest after destructuring', {
      hasVariables: restStats.hasVariables,
      variablesCount: restStats.variablesCount,
      restKeys: Object.keys(rest),
    });
    const nextNodes = nodes?.length
      ? nodes.map((node, index) => ({
          ...node,
          type: node.type ?? 'Function',
          label: node.label ?? node.id,
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
    debugLog('after markState', { variables: this.graphState.variables?.length ?? 0 });
    // НЕ вызываем postState() — webview уже имеет актуальные данные.
    // Обратная отправка создаёт race condition: при быстрых изменениях
    // старый setState перезаписывает свежие данные в Zustand store.
    this.validateAndDispatch(this.graphState);
    this.scheduleBoundGraphAutoSave();
  }

  private readGraphBindingConfig(): {
    enabled: boolean;
    autoSave: boolean;
    folder: string;
    maxLines: number;
  } {
    const config = vscode.workspace.getConfiguration('multicode');
    const enabled = config.get<boolean>('graphBinding.enabled', true);
    const autoSave = config.get<boolean>('graphBinding.autoSave', true);
    const folder = (config.get<string>('graphBinding.folder', '.multicode') ?? '.multicode').trim() || '.multicode';
    // Маркер @multicode:graph попадает в первые строки заголовка генератора. Меньше 4 строк не имеет смысла.
    const maxLines = Math.max(4, Math.min(200, config.get<number>('graphBinding.maxLines', 10)));
    return { enabled, autoSave, folder, maxLines };
  }

  private resolveGraphBindingRootFsPath(codeUri: vscode.Uri): string {
    const folder = vscode.workspace.getWorkspaceFolder(codeUri);
    if (folder?.uri.fsPath) {
      return folder.uri.fsPath;
    }
    return path.dirname(codeUri.fsPath);
  }

  private makeDefaultBindingFileRelativePath(graphId: string, folderSetting: string): string {
    const safeId = sanitizeGraphBindingFileName(graphId);
    const folder = folderSetting.replace(/\\/g, '/').replace(/\/+$/g, '');
    const normalizedFolder = folder.length > 0 ? folder : '.multicode';
    return `${normalizedFolder}/${safeId}.multicode`;
  }

  private registerGraphBindingIdUsage(graphId: string, codeUri: vscode.Uri): void {
    if (!graphId || codeUri.scheme !== 'file') {
      return;
    }

    const fsPath = codeUri.fsPath;
    const set = this.graphBindingIdUsage.get(graphId) ?? new Set<string>();
    const beforeSize = set.size;
    set.add(fsPath);
    this.graphBindingIdUsage.set(graphId, set);

    // Предупреждаем ровно один раз при первом обнаружении конфликта.
    if (beforeSize === 1 && set.size === 2 && !this.warnedDuplicateGraphIds.has(graphId)) {
      this.warnedDuplicateGraphIds.add(graphId);
      const files = Array.from(set)
        .map((value) => path.basename(value))
        .join(', ');
      this.postToast('warning', this.translate('warnings.graphBindingDuplicateId', { id: graphId, files }));
    }
  }

  private async tryBackupGraphFileIfExists(uri: vscode.Uri): Promise<vscode.Uri | null> {
    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      return null;
    }

    try {
      const backupUri = vscode.Uri.file(`${uri.fsPath}.broken-${Date.now()}`);
      await vscode.workspace.fs.rename(uri, backupUri, { overwrite: false });
      return backupUri;
    } catch {
      return null;
    }
  }

  private async prepareGeneratedCodeForWrite(
    code: string,
    targetUri: vscode.Uri,
    outputProfile: CodegenOutputProfile
  ): Promise<{ code: string }> {
    const config = this.readGraphBindingConfig();
    if (!config.enabled) {
      return { code };
    }
    if (targetUri.scheme !== 'file') {
      return { code };
    }

    const rootFsPath = this.resolveGraphBindingRootFsPath(targetUri);
    const bindingFile = this.makeDefaultBindingFileRelativePath(this.graphState.id, config.folder);
    const binding: MulticodeGraphBinding = {
      graphId: this.graphState.id,
      file: bindingFile,
    };

    const bindingLine = formatMulticodeGraphBindingLine(binding);
    const codeWithBinding = injectOrReplaceMulticodeGraphBinding(code, bindingLine, config.maxLines);
    const nextCode =
      outputProfile === 'recovery'
        ? injectOrReplaceMulticodeGraphSnapshot(codeWithBinding, {
            ...this.graphState,
            dirty: false,
          })
        : removeMulticodeGraphSnapshot(codeWithBinding);

    const graphFsPath = resolveGraphBindingFilePath(rootFsPath, bindingFile);
    const graphUri = vscode.Uri.file(graphFsPath);
    this.boundGraphBinding = { binding, graphUri, rootFsPath };

    await this.tryWriteBoundGraphFile();

    return { code: nextCode };
  }

  private async tryLoadGraphFromBoundSource(
    codeUri: vscode.Uri
  ): Promise<'loaded' | 'created' | 'no-binding' | 'failed'> {
    const config = this.readGraphBindingConfig();
    if (!config.enabled) {
      this.boundGraphBinding = undefined;
      return 'no-binding';
    }
    if (codeUri.scheme !== 'file') {
      this.boundGraphBinding = undefined;
      return 'no-binding';
    }

    const seq = (this.graphBindingLoadSeq += 1);
    try {
      const document = await vscode.workspace.openTextDocument(codeUri);
      const limit = Math.min(config.maxLines, document.lineCount);
      const headerText = Array.from({ length: limit }, (_, idx) => document.lineAt(idx).text).join('\n');
      const sourceText = document.getText();
      const binding = findMulticodeGraphBindingInSource(headerText, config.maxLines);
      if (seq !== this.graphBindingLoadSeq) {
        return 'failed';
      }

      if (!binding) {
        this.boundGraphBinding = undefined;
        return 'no-binding';
      }

      const rootFsPath = this.resolveGraphBindingRootFsPath(codeUri);
      // Сбрасываем старую привязку, чтобы не писать автосейвы в чужой файл при ошибках загрузки.
      this.boundGraphBinding = undefined;
      const canonicalFile = this.makeDefaultBindingFileRelativePath(binding.graphId, config.folder);
      const overrideFile = binding.file?.trim() || undefined;

      const candidates: Array<{ kind: 'override' | 'canonical'; file: string }> = [];
      if (overrideFile && overrideFile !== canonicalFile) {
        candidates.push({ kind: 'override', file: overrideFile });
      }
      candidates.push({ kind: 'canonical', file: canonicalFile });

      // Запоминаем, что этот id используется данным исходником (нужно для обнаружения копий/конфликтов).
      this.registerGraphBindingIdUsage(binding.graphId, codeUri);

      let overrideMismatchedGraph: GraphState | null = null;
      let mismatchDetails: { codeId: string; fileId: string; fileName: string } | null = null;
      let backupFileName: string | null = null;
      let canonicalReadFailedReason: string | null = null;
      const recoveredFromSnapshot = tryExtractMulticodeGraphSnapshot(sourceText);

      for (const candidate of candidates) {
        const graphFsPath = resolveGraphBindingFilePath(rootFsPath, candidate.file);
        const graphUri = vscode.Uri.file(graphFsPath);
        const loaded = await this.tryReadBoundGraphFile(graphUri);
        if (seq !== this.graphBindingLoadSeq) {
          return 'failed';
        }

        if (loaded.status === GraphPanel.BOUND_GRAPH_READ_RESULT_MISSING) {
          continue;
        }

        if (loaded.status === GraphPanel.BOUND_GRAPH_READ_RESULT_FAILED) {
          // Если canonical файл повреждён, пытаемся сохранить его как backup и продолжить восстановление.
          if (candidate.kind === 'canonical') {
            const backupUri = await this.tryBackupGraphFileIfExists(graphUri);
            if (backupUri) {
              backupFileName = path.basename(backupUri.fsPath);
              continue;
            }
            // Если бэкап не получился, не перезаписываем файл автоматически — это может привести к потере данных.
            canonicalReadFailedReason = loaded.reason;
            break;
          }
          continue;
        }

        if (loaded.graph.id !== binding.graphId) {
          mismatchDetails = {
            codeId: binding.graphId,
            fileId: loaded.graph.id,
            fileName: path.basename(graphUri.fsPath),
          };

          if (candidate.kind === 'override') {
            // Не трогаем override файл: он может принадлежать другому исходнику.
            overrideMismatchedGraph = loaded.graph;
            continue;
          }

          // canonical файл: считаем, что это наш граф и просто исправляем id.
          const fixedGraph: GraphState = { ...loaded.graph, id: binding.graphId };
          this.boundGraphBinding = {
            binding: { graphId: binding.graphId, file: candidate.file },
            graphUri,
            rootFsPath,
          };
          this.graphState = this.normalizeState(fixedGraph);
          this.postState();
          await this.tryWriteBoundGraphFile();
          void this.validateAndDispatch(this.graphState);
          this.postToast(
            'warning',
            this.translate('warnings.graphBindingIdMismatch', {
              codeId: binding.graphId,
              fileId: loaded.graph.id,
              file: path.basename(graphUri.fsPath),
            })
          );
          return 'loaded';
        }

        // Найден корректный граф.
        this.boundGraphBinding = {
          binding: { graphId: binding.graphId, file: candidate.file },
          graphUri,
          rootFsPath,
        };
        this.graphState = this.normalizeState(loaded.graph);
        this.postState();
        void this.validateAndDispatch(this.graphState);

        if (backupFileName) {
          this.postToast(
            'warning',
            this.translate('warnings.graphBindingBrokenFileRecovered', { file: backupFileName })
          );
        }
        if (mismatchDetails && candidate.kind === 'canonical') {
          // override был указан, но содержал другой id: используем canonical по id.
          this.postToast(
            'warning',
            this.translate('warnings.graphBindingIdMismatch', {
              codeId: mismatchDetails.codeId,
              fileId: mismatchDetails.fileId,
              file: mismatchDetails.fileName,
            })
          );
        }

        return 'loaded';
      }

      if (recoveredFromSnapshot) {
        const canonicalFsPath = resolveGraphBindingFilePath(rootFsPath, canonicalFile);
        const canonicalUri = vscode.Uri.file(canonicalFsPath);
        this.boundGraphBinding = {
          binding: { graphId: binding.graphId, file: canonicalFile },
          graphUri: canonicalUri,
          rootFsPath,
        };
        this.graphState = this.normalizeState({
          ...recoveredFromSnapshot,
          id: binding.graphId,
          updatedAt: new Date().toISOString(),
          dirty: true,
        });
        this.postState();
        await this.tryWriteBoundGraphFile();
        void this.validateAndDispatch(this.graphState);
        this.postToast(
          'warning',
          this.translate('warnings.graphBindingRecoveredFromCode', {
            file: path.basename(codeUri.fsPath),
          })
        );
        return 'loaded';
      }

      if (canonicalReadFailedReason && !backupFileName) {
        this.postToast('warning', `${this.translate('errors.graphLoad')}: ${canonicalReadFailedReason}`);
        return 'failed';
      }

      // Файлы не найдены (или override был с другим id) — создаём/восстанавливаем canonical по id.
      const canonicalFsPath = resolveGraphBindingFilePath(rootFsPath, canonicalFile);
      const canonicalUri = vscode.Uri.file(canonicalFsPath);
      this.boundGraphBinding = {
        binding: { graphId: binding.graphId, file: canonicalFile },
        graphUri: canonicalUri,
        rootFsPath,
      };

      const seed = overrideMismatchedGraph
        ? ({ ...overrideMismatchedGraph, id: binding.graphId } as GraphState)
        : ({
            ...createDefaultGraphState(),
            id: binding.graphId,
            displayLanguage: this.locale,
          } as GraphState);

      this.graphState = this.normalizeState(seed);
      this.postState();
      await this.tryWriteBoundGraphFile();
      void this.validateAndDispatch(this.graphState);

      if (backupFileName) {
        this.postToast(
          'warning',
          this.translate('warnings.graphBindingBrokenFileRecovered', { file: backupFileName })
        );
      }
      if (mismatchDetails) {
        this.postToast(
          'warning',
          this.translate('warnings.graphBindingIdMismatch', {
            codeId: mismatchDetails.codeId,
            fileId: mismatchDetails.fileId,
            file: mismatchDetails.fileName,
          })
        );
      }

      return 'created';
    } catch (error) {
      const message = error instanceof Error ? error.message : this.translate('errors.graphLoad');
      this.postToast('warning', `${this.translate('errors.graphLoad')}: ${message}`);
      return 'failed';
    }
  }

  private scheduleBoundGraphAutoSave(): void {
    const config = this.readGraphBindingConfig();
    if (!config.enabled || !config.autoSave) {
      return;
    }

    if (!this.boundGraphBinding) {
      return;
    }

    if (this.graphBindingAutoSaveTimer) {
      clearTimeout(this.graphBindingAutoSaveTimer);
    }

    this.graphBindingAutoSaveTimer = setTimeout(() => {
      void this.tryWriteBoundGraphFile();
    }, this.GRAPH_BINDING_AUTOSAVE_DELAY_MS);
  }

  private async tryWriteBoundGraphFile(): Promise<void> {
    const config = this.readGraphBindingConfig();
    if (!config.enabled) {
      return;
    }

    const currentBinding = this.boundGraphBinding;
    if (!currentBinding) {
      return;
    }

    try {
      let effectiveBinding = currentBinding;
      if (effectiveBinding.binding.graphId !== this.graphState.id) {
        // Граф сменил id (например, "Новый граф" или загрузка другого графа). Не пишем в старый файл.
        const rootFsPath = effectiveBinding.rootFsPath;
        const bindingFile = this.makeDefaultBindingFileRelativePath(this.graphState.id, config.folder);
        const graphFsPath = resolveGraphBindingFilePath(rootFsPath, bindingFile);
        effectiveBinding = {
          binding: { graphId: this.graphState.id, file: bindingFile },
          graphUri: vscode.Uri.file(graphFsPath),
          rootFsPath,
        };
        this.boundGraphBinding = effectiveBinding;
      }

      const directory = vscode.Uri.file(path.dirname(effectiveBinding.graphUri.fsPath));
      await vscode.workspace.fs.createDirectory(directory);

      const snapshot: GraphState = { ...this.graphState, id: effectiveBinding.binding.graphId, dirty: false };
      const data = Buffer.from(JSON.stringify(snapshot, null, 2), 'utf8');
      await vscode.workspace.fs.writeFile(effectiveBinding.graphUri, data);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      this.outputChannel.appendLine(`[MultiCode] Не удалось сохранить .multicode: ${reason}`);
      this.postToast('warning', `${this.translate('errors.graphSave')}: ${reason}`);
    }
  }

  private async tryReadBoundGraphFile(
    uri: vscode.Uri
  ): Promise<
    | { status: typeof GraphPanel.BOUND_GRAPH_READ_RESULT_LOADED; graph: GraphState }
    | { status: typeof GraphPanel.BOUND_GRAPH_READ_RESULT_MISSING }
    | { status: typeof GraphPanel.BOUND_GRAPH_READ_RESULT_FAILED; reason: string }
  > {
    try {
      const raw = await vscode.workspace.fs.readFile(uri);
      const parsed = JSON.parse(Buffer.from(raw).toString('utf8'));

      const asGraph = parseGraphState(parsed);
      if (asGraph.success) {
        return { status: GraphPanel.BOUND_GRAPH_READ_RESULT_LOADED, graph: asGraph.data };
      }

      const asSerialized = parseSerializedGraph(parsed);
      if (asSerialized.success) {
        return {
          status: GraphPanel.BOUND_GRAPH_READ_RESULT_LOADED,
          graph: deserializeGraphState(parsed),
        };
      }

      const details = this.extractErrorDetails(asGraph.error);
      return { status: GraphPanel.BOUND_GRAPH_READ_RESULT_FAILED, reason: details };
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
        return { status: GraphPanel.BOUND_GRAPH_READ_RESULT_MISSING };
      }
      if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'FileNotFound') {
        return { status: GraphPanel.BOUND_GRAPH_READ_RESULT_MISSING };
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.outputChannel.appendLine(`[MultiCode] Не удалось загрузить .multicode: ${message}`);
      return { status: GraphPanel.BOUND_GRAPH_READ_RESULT_FAILED, reason: message };
    }
  }

  private updateWebviewHtml(): void {
    const { webview } = this.panel;
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js'));
    const mediaBaseUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media'));
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
    <script nonce="${nonce}">window.__MULTICODE_MEDIA_BASE_URI__ = "${mediaBaseUri}";</script>
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
        padding: 8px 16px;
        background: linear-gradient(135deg, var(--mc-toolbar-from), var(--mc-toolbar-to));
        border-bottom: 1px solid var(--mc-toolbar-border);
        box-shadow: var(--mc-shadow);
        gap: 16px;
        flex-wrap: wrap;
      }
      .toolbar-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 120px;
      }
      .toolbar-title {
        font-size: 14px;
        font-weight: 600;
        white-space: nowrap;
      }
      .toolbar-subtitle {
        font-size: 11px;
        color: var(--mc-muted);
        white-space: nowrap;
      }
      .toolbar-bound-file {
        font-size: 11px;
        color: var(--mc-accent);
        cursor: default;
      }
      .toolbar-bound-file--none {
        color: var(--mc-muted);
        opacity: 0.6;
        font-style: italic;
      }
      .toolbar-actions {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        align-items: center;
      }
      .toolbar-group {
        display: flex;
        gap: 4px;
        padding: 0 8px;
        border-right: 1px solid var(--mc-surface-border);
      }
      .toolbar-group:last-child {
        border-right: none;
        padding-right: 0;
      }
      .toolbar button {
        background: var(--mc-button-bg);
        color: var(--mc-button-text);
        border: 1px solid var(--mc-button-border);
        border-radius: 4px;
        padding: 6px 10px;
        cursor: pointer;
        font-size: 12px;
        white-space: nowrap;
        transition: all 0.1s ease;
      }
      .toolbar button:hover {
        background: var(--mc-surface-strong);
        border-color: var(--mc-panel-title);
      }
      .toolbar button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .toolbar button.btn-icon {
        padding: 6px 8px;
        font-size: 14px;
      }
      .toolbar button.btn-active {
        background: var(--mc-badge-ok-bg);
        border-color: var(--mc-badge-ok-border);
      }
      .toolbar-select,
      .toolbar select {
        background: var(--mc-button-bg);
        color: var(--mc-button-text);
        border: 1px solid var(--mc-button-border);
        border-radius: 4px;
        padding: 6px 10px;
        font-size: 12px;
        cursor: pointer;
        outline: none;
      }
      .toolbar-select:hover,
      .toolbar select:hover {
        background: var(--mc-surface-strong);
        border-color: var(--mc-panel-title);
      }
      .workspace {
        display: flex;
        flex: 1;
        overflow: hidden;
      }
      .workspace.with-sidebar {
        display: grid;
        grid-template-columns: 1fr 320px;
      }
      .canvas-wrapper {
        background: var(--mc-surface-strong);
        flex: 1;
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
        gap: 8px;
        padding: 8px;
        background: var(--mc-body-bg);
        border-left: 1px solid var(--mc-surface-border);
        overflow-y: auto;
        max-height: 100%;
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
    if (this.graphBindingAutoSaveTimer) {
      clearTimeout(this.graphBindingAutoSaveTimer);
      this.graphBindingAutoSaveTimer = undefined;
    }
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




