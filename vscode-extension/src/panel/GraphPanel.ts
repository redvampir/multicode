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
    const initialState = JSON.stringify(this.graphState).replace(/</g, '\\u003c');

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
        color-scheme: only dark;
      }
      * {
        box-sizing: border-box;
      }
      body {
        padding: 0;
        margin: 0;
        font-family: 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        background: #0b1021;
        color: #e2e8f0;
        min-height: 100vh;
      }
      #root {
        height: 100vh;
      }
      .app-shell {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      .toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 18px;
        background: linear-gradient(135deg, rgba(12, 20, 36, 0.95), rgba(22, 30, 48, 0.95));
        border-bottom: 1px solid rgba(96, 165, 250, 0.35);
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
      }
      .toolbar-title {
        font-size: 16px;
        font-weight: 700;
      }
      .toolbar-subtitle {
        font-size: 12px;
        color: #94a3b8;
      }
      .toolbar-actions {
        display: flex;
        gap: 8px;
      }
      .toolbar button {
        background: #1e293b;
        color: #e2e8f0;
        border: 1px solid rgba(96, 165, 250, 0.4);
        border-radius: 6px;
        padding: 8px 12px;
        cursor: pointer;
        box-shadow: 0 3px 12px rgba(0, 0, 0, 0.25);
        transition: transform 0.08s ease, box-shadow 0.08s ease;
      }
      .toolbar button:hover {
        transform: translateY(-1px);
        box-shadow: 0 5px 18px rgba(96, 165, 250, 0.25);
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
        background: radial-gradient(circle at 20% 20%, rgba(59, 130, 246, 0.08), transparent 35%),
          radial-gradient(circle at 80% 0%, rgba(16, 185, 129, 0.08), transparent 30%),
          #0f172a;
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 12px;
        box-shadow: 0 12px 48px rgba(0, 0, 0, 0.35);
        position: relative;
        overflow: hidden;
      }
      .graph-canvas {
        width: 100%;
        height: 100%;
      }
      .side-panel {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .panel {
        background: rgba(15, 23, 42, 0.85);
        border: 1px solid rgba(148, 163, 184, 0.25);
        border-radius: 12px;
        padding: 12px;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 10px 36px rgba(0, 0, 0, 0.3);
      }
      .panel-title {
        font-weight: 700;
        margin-bottom: 10px;
        color: #93c5fd;
      }
      .panel-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      .panel-label {
        font-size: 12px;
        color: #94a3b8;
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
        background: rgba(34, 197, 94, 0.15);
        color: #bbf7d0;
        border: 1px solid rgba(34, 197, 94, 0.4);
      }
      .badge-warn {
        background: rgba(251, 191, 36, 0.15);
        color: #fef08a;
        border: 1px solid rgba(251, 191, 36, 0.5);
      }
      .validation-list {
        margin: 0;
        padding-left: 16px;
      }
      .validation-list li {
        margin-bottom: 6px;
      }
      .text-error { color: #fecdd3; }
      .text-warn { color: #fef08a; }
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
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
        font-size: 13px;
        border: 1px solid rgba(255, 255, 255, 0.05);
      }
      .toast-info { background: #0ea5e9; color: #e0f2fe; }
      .toast-success { background: #16a34a; color: #dcfce7; }
      .toast-warning { background: #d97706; color: #fef3c7; }
      .toast-error { background: #b91c1c; color: #fee2e2; }
      .toast-close {
        background: transparent;
        border: none;
        color: inherit;
        cursor: pointer;
        font-size: 16px;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}">const initialGraphState = ${initialState};</script>
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





