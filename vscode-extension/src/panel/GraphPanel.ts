import * as vscode from 'vscode';
import {
  GraphState,
  GraphLanguage,
  GraphNode,
  GraphEdge,
  GraphDisplayLanguage,
  GraphNodeType,
  GraphEdgeKind,
  createDefaultGraphState
} from '../shared/graphState';
import { serializeGraphState, deserializeGraphState } from '../shared/serializer';
import { validateGraphState } from '../shared/validator';
import { generateCodeFromGraph } from '../shared/codegen';
import { getTranslation, type TranslationKey } from '../shared/translations';

type ToastKind = 'info' | 'success' | 'warning' | 'error';

type GraphMutationPayload = {
  nodes?: Array<Pick<GraphNode, 'id' | 'label' | 'type' | 'position'>>;
  edges?: GraphEdge[];
  name?: string;
  language?: GraphLanguage;
  displayLanguage?: GraphDisplayLanguage;
};

type WebviewMessage =
  | { type: 'ready' }
  | { type: 'addNode'; payload?: { label?: string; nodeType?: GraphNodeType } }
  | { type: 'connectNodes'; payload?: { sourceId?: string; targetId?: string; label?: string } }
  | { type: 'renameGraph'; payload: { name: string } }
  | { type: 'updateLanguage'; payload: { language: GraphLanguage } }
  | { type: 'changeDisplayLanguage'; payload: { locale: GraphDisplayLanguage } }
  | { type: 'requestSave' }
  | { type: 'requestLoad' }
  | { type: 'requestNewGraph' }
  | { type: 'requestGenerate' }
  | { type: 'requestValidate' }
  | { type: 'graphChanged'; payload: GraphMutationPayload };

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

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly outputChannel: vscode.OutputChannel
  ) {
    this.locale = (vscode.workspace
      .getConfiguration('multicode')
      .get<string>('displayLanguage', 'ru') ?? 'ru') as GraphDisplayLanguage;
    this.graphState = this.normalizeState({
      ...createDefaultGraphState(),
      displayLanguage: this.locale
    });

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => this.handleMessage(message),
      undefined,
      this.disposables
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
    const nodeLabel = label?.trim() || `Node ${this.graphState.nodes.length + 1}`;
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
      this.postToast('success', this.translate('toasts.loaded'));
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
    const result = validateGraphState(this.graphState);
    if (result.errors.length) {
      result.errors.forEach((error) => this.postToast('error', error));
    } else {
      this.postToast('success', this.translate('toasts.validationOk'));
    }
    result.warnings.forEach((warning) => this.postToast('warning', warning));
    this.panel.webview.postMessage({
      type: 'validationResult',
      payload: result
    });
  }

  private postState(): void {
    this.panel.webview.postMessage({
      type: 'setState',
      payload: this.graphState
    });
  }

  private postToast(kind: ToastKind, message: string): void {
    this.panel.webview.postMessage({
      type: 'toast',
      payload: { kind, message }
    });
  }

  private translate(key: TranslationKey, replacements?: Record<string, string>): string {
    return getTranslation(this.locale, key, replacements);
  }

  private markState(partial: Partial<GraphState>): void {
    this.graphState = {
      ...this.graphState,
      ...partial,
      updatedAt: new Date().toISOString(),
      dirty: true
    };
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

  private handleMessage(message: WebviewMessage): void {
    switch (message.type) {
      case 'ready':
        this.postState();
        break;
      case 'addNode':
        this.addNode(message.payload?.label, message.payload?.nodeType ?? 'Function');
        break;
      case 'connectNodes':
        this.connectNodes(message.payload?.sourceId, message.payload?.targetId, message.payload?.label);
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
      case 'requestValidate':
        void this.handleValidateGraph();
        break;
      case 'graphChanged':
        this.applyGraphMutation(message.payload);
        break;
      default:
        break;
    }
  }

  private applyGraphMutation(payload: GraphMutationPayload): void {
    const { nodes, ...rest } = payload;
    const updates: Partial<GraphState> = { ...rest };

    if (nodes?.length) {
      const incoming = new Map(nodes.map((node) => [node.id, node]));
      updates.nodes = this.graphState.nodes.map((node) => {
        const patch = incoming.get(node.id);
        if (!patch) {
          return node;
        }
        return {
          ...node,
          label: patch.label ?? node.label,
          type: patch.type ?? node.type,
          position: patch.position ?? node.position
        };
      });
    }

    if (updates.displayLanguage && updates.displayLanguage !== this.locale) {
      this.locale = updates.displayLanguage;
    }

    if (!Object.keys(updates).length) {
      return;
    }

    this.markState(updates);
    this.postState();
  }

  private updateWebviewHtml(): void {
    const { webview } = this.panel;
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js'));
    const nonce = getNonce();

    this.panel.webview.html = /* html */ `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource} https:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width,initial-scale=1.0" />
    <title>MultiCode Graph</title>
    <style>
      :root {
        color-scheme: only dark;
      }
      * {
        box-sizing: border-box;
      }
      body {
        padding: 0;
        margin: 0;
        font-family: 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        background: var(--vscode-editor-background);
        color: var(--vscode-editor-foreground);
        min-height: 100vh;
        display: flex;
        flex-direction: column;
      }
      header {
        padding: 12px 16px;
        border-bottom: 1px solid var(--vscode-editorWidget-border);
      }
      #toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        margin-top: 12px;
      }
      #toolbar button {
        margin: 0;
      }
      #toolbar select {
        min-width: 80px;
      }
      .toolbar-right {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      #unsaved-indicator {
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
        display: none;
      }
      #unsaved-indicator.visible {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      #toolbar-spinner {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        border: 2px solid rgba(255,255,255,0.3);
        border-top-color: var(--vscode-button-foreground);
        animation: spin 1s linear infinite;
        display: none;
      }
      #toolbar-spinner.visible {
        display: inline-block;
      }
      main {
        flex: 1;
        display: grid;
        grid-template-columns: minmax(360px, 1fr) 320px;
        gap: 16px;
        padding: 16px;
      }
      .canvas {
        border: 1px solid var(--vscode-editorWidget-border);
        border-radius: 6px;
        padding: 0;
        position: relative;
        background: var(--vscode-editor-background);
        overflow: hidden;
      }
      #graph-canvas {
        width: 100%;
        height: 100%;
        position: relative;
        cursor: grab;
      }
      #graph-canvas.panning {
        cursor: grabbing;
      }
      #graph-viewport {
        position: absolute;
        transform-origin: 0 0;
      }
      #graph-edges {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        overflow: visible;
      }
      #graph-nodes {
        position: absolute;
        inset: 0;
      }
      .graph-node {
        position: absolute;
        padding: 6px 12px;
        border-radius: 6px;
        background: #1e88e5;
        color: #fff;
        font-size: 13px;
        border: 2px solid rgba(255,255,255,0.25);
        transform: translate(-50%, -50%);
        white-space: nowrap;
      }
      .graph-node.type-Start { background: #00897b; }
      .graph-node.type-End { background: #c62828; }
      .graph-node.type-Variable { background: #6a1b9a; }
      .graph-node.type-Custom { background: #5d4037; }
      #mini-map {
        position: absolute;
        bottom: 16px;
        right: 16px;
        border: 1px solid var(--vscode-editorWidget-border);
        border-radius: 6px;
        background: rgba(0,0,0,0.3);
      }
      .side-panel {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .panel-block {
        border: 1px solid var(--vscode-editorWidget-border);
        border-radius: 6px;
        padding: 12px;
      }
      #validation-summary {
        margin-top: 12px;
        font-size: 13px;
      }
      button {
        margin-right: 8px;
        margin-bottom: 8px;
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
      }
      button:hover {
        background: var(--vscode-button-hoverBackground);
      }
      button:disabled {
        opacity: 0.6;
        cursor: progress;
      }
      ul {
        padding-left: 20px;
      }
      label {
        display: block;
        margin-bottom: 6px;
      }
      input, select {
        width: 100%;
        margin-bottom: 8px;
        padding: 6px;
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border);
        border-radius: 4px;
      }
      .muted {
        color: var(--vscode-descriptionForeground);
      }
      #toast-container {
        position: fixed;
        top: 16px;
        right: 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        z-index: 5;
      }
      .toast {
        padding: 10px 14px;
        border-radius: 6px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        font-size: 13px;
        animation: fade-in 0.2s ease;
      }
      .toast.success { background: #1b5e20; color: #fff; }
      .toast.info { background: #1565c0; color: #fff; }
      .toast.warning { background: #ef6c00; color: #fff; }
      .toast.error { background: #b71c1c; color: #fff; }
      @keyframes fade-in {
        from { opacity: 0; transform: translateY(-8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    </style>
  </head>
  <body>
    <div id="toast-container"></div>
    <header>
      <h2 id='app-title'>MultiCode Visual Graph</h2>
      <p id='app-subtitle' class='muted'>Visual graph prototyping workspace.</p>
      <div id="toolbar">
        <div id="toolbar-buttons"></div>
        <div class="toolbar-right">
          <span id="unsaved-indicator"></span>
          <select id="locale-select">
            <option value="ru">RU</option>
            <option value="en">EN</option>
          </select>
          <span id="toolbar-spinner"></span>
        </div>
      </div>
    </header>
    <main>
      <section class="canvas">
        <div id="graph-canvas">
          <div id="graph-viewport">
            <svg id="graph-edges"></svg>
            <div id="graph-nodes"></div>
          </div>
          <canvas id="mini-map" width="160" height="120"></canvas>
        </div>
      </section>
      <section class="side-panel">
        <div class="panel-block">
          <h3 id="overview-title">Graph Overview</h3>
          <div id="graph-info"></div>
        </div>
        <div class="panel-block">
          <h3 id="actions-title">Form</h3>
          <div id="graph-actions"></div>
        </div>
        <div class="panel-block">
          <h3 id="inspector-title">Inspector</h3>
          <div id="inspector"></div>
          <div id="validation-summary"></div>
        </div>
      </section>
    </main>
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





