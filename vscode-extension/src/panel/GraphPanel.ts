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
import { createGenerator, UnsupportedLanguageError } from '../codegen';
import { validateExternalSymbols } from '../codegen/externalSymbolResolver';
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
  findMulticodeClassBindingsInSource,
  injectOrReplaceMulticodeClassBindingsBlock,
  type MulticodeClassBinding,
} from '../shared/classBinding';
import { deserializeClassSidecar, serializeClassSidecar, type BlueprintClassSidecar } from '../shared/classSidecar';
import {
  extensionToWebviewMessageSchema,
  type ClassNodesConfig,
  type ClassStorageStatus,
  type ClassStorageStatusItem,
  type ExternalIpcResponse,
  blueprintClassSchema,
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
import type { SourceIntegration } from '../shared/externalSymbols';

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
import { SymbolIndexerRegistry } from './symbol-indexer';
import { buildCodeWithUnifiedIncludes } from './includeBlock';
import {
  createBoundSourceSeedGraphState,
  createDetachedSourceGraphCacheKey,
  createDetachedSourceGraphState,
} from './sourceGraphFallback';
import {
  handleDependencyMapGet as orchestrateDependencyMapGet,
  handleClassDelete as orchestrateClassDelete,
  handleClassReorderMember as orchestrateClassReorderMember,
  handleClassReorderMethod as orchestrateClassReorderMethod,
  handleClassUpsert as orchestrateClassUpsert,
  handleIntegrationAdd as orchestrateIntegrationAdd,
  handleIntegrationReindex as orchestrateIntegrationReindex,
  mapToIpcError,
  safeExternalIpcResponse,
} from './ipcOrchestration';
import type { ExternalIncludePathMode } from './externalIncludePath';

type ToastKind = 'info' | 'success' | 'warning' | 'error';
type GeneratedCodeWriteResult =
  | { status: 'written'; uri: vscode.Uri }
  | { status: 'no-target' }
  | { status: 'failed'; reason: string };
type CodegenOutputProfile = 'clean' | 'learn' | 'debug' | 'recovery';
type CodegenEntrypointMode = 'auto' | 'executable' | 'library';
type ClassStorageMode = 'embedded' | 'sidecar';
type NormalizedClassBinding = { classId: string; file: string };
type ClassStorageItemState = ClassStorageStatusItem['status'];
type ClassStorageItemSource = NonNullable<ClassStorageStatusItem['source']>;
type ClassStorageDiagnosticItem = {
  classId: string;
  className?: string;
  bindingFile?: string;
  filePath?: string;
  source?: ClassStorageItemSource;
  existsOnDisk?: boolean;
  lastCheckedAt?: string;
  status: ClassStorageItemState;
  reason?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getVariablesStats = (variables: unknown): { hasVariables: boolean; variablesCount: number } => {
  if (!Array.isArray(variables)) {
    return { hasVariables: false, variablesCount: 0 };
  }
  return { hasVariables: true, variablesCount: variables.length };
};

const CPP_FILE_EXTENSIONS = new Set(['.h', '.hpp', '.hh', '.hxx', '.ipp', '.c', '.cc', '.cpp', '.cxx']);
const CPP_SOURCE_EXTENSIONS = new Set(['.c', '.cc', '.cpp', '.cxx']);
const CPP_HEADER_EXTENSIONS = new Set(['.h', '.hpp', '.hh', '.hxx', '.ipp']);
const CPP_SIBLING_SOURCE_EXTENSIONS = ['.cpp', '.cc', '.cxx', '.c'];
const LOCAL_INCLUDE_DIRECTIVE = /^\s*#\s*include\s*"([^"]+)"/gm;

const normalizeFsPath = (filePath: string): string => filePath.replace(/\\/g, '/');
const normalizeFsPathForMatch = (filePath: string): string => normalizeFsPath(filePath).toLowerCase();

const dedupeNormalizedPaths = (paths: string[]): string[] => {
  const unique = new Set<string>();
  for (const filePath of paths) {
    const trimmed = filePath.trim();
    if (!trimmed) {
      continue;
    }
    unique.add(normalizeFsPath(trimmed));
  }
  return Array.from(unique);
};

const hashString = (value: string): string => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};

const toSafeIdSegment = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'file';

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
  private enableUePackage: boolean;
  private translator: MarianTranslator | undefined;
  private boundCodeDocumentUri: vscode.Uri | undefined;
  private boundGraphBinding:
    | {
        binding: MulticodeGraphBinding;
        graphUri: vscode.Uri;
        rootFsPath: string;
      }
    | undefined;
  private lastPersistedClassIdSignature: string;
  private readonly graphBindingIdUsage = new Map<string, Set<string>>();
  private readonly warnedDuplicateGraphIds = new Set<string>();
  private readonly detachedGraphStateBySource = new Map<string, GraphState>();
  private graphBindingLoadSeq = 0;
  private graphBindingAutoSaveTimer: ReturnType<typeof setTimeout> | undefined;
  private classStorageDiagnostics = new Map<string, ClassStorageDiagnosticItem>();
  private classStorageStatusUpdatedAt: string;
  private readonly extensionUri: vscode.Uri;
  private readonly symbolIndexerRegistry: SymbolIndexerRegistry;
  private reindexIntegrationSymbols: (integrationId: string | undefined, force: boolean) => Promise<number>;

  private readonly GRAPH_BINDING_AUTOSAVE_DELAY_MS = 450;

  private static readonly BOUND_GRAPH_READ_RESULT_LOADED = 'loaded';
  private static readonly BOUND_GRAPH_READ_RESULT_MISSING = 'missing';
  private static readonly BOUND_GRAPH_READ_RESULT_FAILED = 'failed';

  private static readonly BOUND_CLASS_READ_RESULT_LOADED = 'loaded';
  private static readonly BOUND_CLASS_READ_RESULT_MISSING = 'missing';
  private static readonly BOUND_CLASS_READ_RESULT_FAILED = 'failed';

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
    this.enableUePackage = this.readEnableUePackage();
    const translationConfig = this.readTranslationConfig();
    this.translationEngine = translationConfig.engine;
    this.translationModels = translationConfig.models;
    this.translationCacheLimit = translationConfig.cacheLimit;
    this.translator = undefined;
    this.boundCodeDocumentUri = this.resolveWritableEditorUri(vscode.window.activeTextEditor);
    this.boundGraphBinding = undefined;
    this.lastPersistedClassIdSignature = '';
    this.classStorageStatusUpdatedAt = new Date().toISOString();
    this.symbolIndexerRegistry = new SymbolIndexerRegistry();
    this.reindexIntegrationSymbols = async (integrationId: string | undefined, force: boolean) => {
      const bindings = this.graphState.integrationBindings ?? [];
      return this.symbolIndexerRegistry.reindexIntegrations(bindings, integrationId, force);
    };

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
        if (event.affectsConfiguration('multicode.codegen.entrypointMode')) {
          this.postCodegenEntrypointMode();
        }
        if (event.affectsConfiguration('multicode.classStorage.mode')) {
          this.touchClassStorageDiagnostics();
          this.postClassStorageStatus();
        }
        if (event.affectsConfiguration('multicode.classNodes.advanced')) {
          this.postClassNodesConfig();
        }
        if (event.affectsConfiguration('multicode.packages.enableUe')) {
          this.enableUePackage = this.readEnableUePackage();
          this.updateWebviewHtml();
          this.postState();
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
      vscode.window.onDidChangeActiveTextEditor((editor) => this.bindActiveEditorDocument(editor)),
      vscode.window.onDidChangeVisibleTextEditors(() => this.postEditableFiles()),
      vscode.workspace.onDidOpenTextDocument(() => this.postEditableFiles()),
      vscode.workspace.onDidCloseTextDocument(() => this.postEditableFiles())
    );

    if (this.boundCodeDocumentUri) {
      void this.handleBoundSourceChanged(this.boundCodeDocumentUri);
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
        let next = this.injectOrReplaceGraphBindingLine(original, bindingLine, graphBindingConfig.maxLines);

        if (this.readClassStorageMode() === 'sidecar') {
          const rawClasses = Array.isArray(this.graphState.classes) ? this.graphState.classes : [];
          const parsedClasses = blueprintClassSchema.array().safeParse(rawClasses);
          const bindings = parsedClasses.success
            ? this.buildCanonicalClassBindings(parsedClasses.data, graphBindingConfig.folder)
            : rawClasses
                .filter((value): value is Record<string, unknown> => isRecord(value))
                .map((entry) => (typeof entry.id === 'string' ? entry.id.trim() : ''))
                .filter((id) => id.length > 0)
                .filter((id, index, arr) => arr.indexOf(id) === index)
                .map((id) => ({
                  classId: id,
                  file: this.makeDefaultClassBindingFileRelativePath(id, graphBindingConfig.folder),
                }))
                .sort((left, right) => left.classId.localeCompare(right.classId, 'ru'));

          next = injectOrReplaceMulticodeClassBindingsBlock(next, bindings);
        }

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
    const exportMode = this.readGraphExportMode();
    const payload = isJson
      ? serializeGraphState(this.graphState, { mode: exportMode })
      : ({ ...this.graphState, dirty: false } as GraphState);
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
        const sourceText = document.getText();
        const binding = this.findGraphBindingInSource(sourceText, graphBindingConfig.maxLines);
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

  private resolveSiblingHeaderForSource(sourceUri: vscode.Uri | undefined): vscode.Uri | undefined {
    if (!sourceUri || sourceUri.scheme !== 'file') {
      return undefined;
    }

    const ext = path.extname(sourceUri.fsPath).toLowerCase();
    if (!CPP_SOURCE_EXTENSIONS.has(ext)) {
      return undefined;
    }

    const parsed = path.parse(sourceUri.fsPath);
    for (const headerExt of ['.hpp', '.h', '.hh', '.hxx'] as const) {
      const candidate = vscode.Uri.file(path.join(parsed.dir, `${parsed.name}${headerExt}`));
      try {
        if (fs.existsSync(candidate.fsPath) && fs.statSync(candidate.fsPath).isFile()) {
          return candidate;
        }
      } catch {
        // ignore file-system races
      }
    }

    return undefined;
  }

  private shouldUseSplitClassOutput(targetUri: vscode.Uri | undefined, classCount: number): boolean {
    if (this.graphState.language !== 'cpp') {
      return false;
    }
    if (!targetUri || targetUri.scheme !== 'file') {
      return false;
    }
    if (classCount === 0) {
      return false;
    }
    return this.resolveSiblingHeaderForSource(targetUri) !== undefined;
  }

  private ensureLeadingInclude(code: string, includeToken: string): string {
    const includeLine = `#include ${includeToken}`;
    const lines = code.split(/\r?\n/).filter((line) => line.trim() !== includeLine);
    return [includeLine, ...lines].join('\n');
  }

  public async handleGenerateCode(): Promise<void> {
    const blueprintState = migrateToBlueprintFormat(this.graphState);
    const verboseCodegenLogs = this.readCodegenVerboseLogs();
    const outputProfile = this.readCodegenOutputProfile();
    let generator;

    try {
      generator = createGenerator(this.graphState.language);
    } catch (error) {
      if (error instanceof UnsupportedLanguageError) {
        this.postToast(
          'warning',
          this.translate('codegen.unsupportedLanguage', { language: error.language.toUpperCase() })
        );
        return;
      }
      throw error;
    }

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

    await this.reindexIntegrationSymbols(undefined, false);
    const externalValidation = this.validateExternalSymbolsForCodegen(blueprintState);
    if (externalValidation.errors.length > 0) {
      this.outputChannel.appendLine('[CodeGen] Внешние символы невалидны. Генерация остановлена.');
      for (const error of externalValidation.errors) {
        this.outputChannel.appendLine(`[CodeGen]   ✗ ${error.message}`);
      }
      this.postToast('error', 'Внешние символы устарели. Запустите integration/reindex.');
      return;
    }

    const blueprintStateForCodegen = this.applyResolvedExternalSymbolNamesForCodegen(
      blueprintState,
      externalValidation.resolvedSymbolsByNodeId
    );
    const codegenOptions = this.resolveCodegenOptionsForProfile(outputProfile, blueprintStateForCodegen);
    const targetUri = this.boundCodeDocumentUri ?? this.resolveWritableEditorUri(vscode.window.activeTextEditor);
    const classesCount = Array.isArray(blueprintStateForCodegen.classes)
      ? blueprintStateForCodegen.classes.length
      : 0;
    const splitClassOutput = this.shouldUseSplitClassOutput(targetUri, classesCount);
    const headerUri = splitClassOutput ? this.resolveSiblingHeaderForSource(targetUri) : undefined;

    if (splitClassOutput && targetUri && headerUri) {
      const headerIncludeToken = `"${path.basename(headerUri.fsPath)}"`;
      const headerResult = generator.generate(blueprintStateForCodegen, {
        ...codegenOptions,
        generateMainWrapper: false,
        classEmissionMode: 'declarations-only',
        emitGraphBody: false,
      });
      const sourceResult = generator.generate(blueprintStateForCodegen, {
        ...codegenOptions,
        classEmissionMode: 'definitions-only',
        forcedIncludes: [headerIncludeToken],
      });

      if (!headerResult.success || !sourceResult.success) {
        const errors = [...headerResult.errors, ...sourceResult.errors];
        this.outputChannel.appendLine('');
        this.outputChannel.appendLine('═'.repeat(60));
        this.outputChannel.appendLine('// ОШИБКИ ГЕНЕРАЦИИ (split class output):');
        for (const error of errors) {
          this.outputChannel.appendLine(`//   ✗ ${error.message}`);
        }
        this.outputChannel.appendLine('═'.repeat(60));
        this.outputChannel.show(true);
        this.postToast('error', `Ошибки генерации: ${errors.length}`);
        return;
      }

      let sourceCode = this.prependRequiredIncludes(
        sourceResult.code,
        externalValidation.requiredIncludes,
        targetUri
      );
      sourceCode = this.ensureLeadingInclude(sourceCode, headerIncludeToken);
      const preparedSource = await this.prepareGeneratedCodeForWrite(sourceCode, targetUri, outputProfile);

      await vscode.workspace.fs.writeFile(headerUri, Buffer.from(headerResult.code, 'utf8'));
      const writeResult = await this.writeGeneratedCodeToBoundDocument(preparedSource.code);

      this.outputChannel.appendLine('');
      this.outputChannel.appendLine('═'.repeat(60));
      this.outputChannel.appendLine(`[MultiCode] Режим split class output активирован`);
      this.outputChannel.appendLine(`[MultiCode] Header обновлён: ${headerUri.fsPath}`);
      this.outputChannel.appendLine(`[MultiCode] Source обновлён: ${targetUri.fsPath}`);
      this.outputChannel.appendLine('═'.repeat(60));

      if (writeResult.status === 'written') {
        this.postToast('success', this.translate('toasts.generatedToFile', { file: path.basename(targetUri.fsPath) }));
      } else if (writeResult.status === 'no-target') {
        this.postToast('warning', this.translate('errors.codeWriteTargetMissing'));
      } else {
        this.outputChannel.appendLine(`[MultiCode] Не удалось записать source файл: ${writeResult.reason}`);
        this.postToast('warning', this.translate('errors.codeWriteFailed', { reason: writeResult.reason }));
      }
      this.outputChannel.show(true);
      return;
    }

    const result = generator.generate(blueprintStateForCodegen, codegenOptions);

    if (!result.success) {
      this.outputChannel.appendLine('');
      this.outputChannel.appendLine('═'.repeat(60));
      this.outputChannel.appendLine('// ОШИБКИ ГЕНЕРАЦИИ:');
      for (const error of result.errors) {
        this.outputChannel.appendLine(`//   ✗ ${error.message}`);
      }
      this.outputChannel.appendLine('═'.repeat(60));
      this.outputChannel.show(true);
      this.postToast('error', `Ошибки генерации: ${result.errors.length}`);
      return;
    }

    const codeWithIntegrationIncludes = this.prependRequiredIncludes(
      result.code,
      externalValidation.requiredIncludes,
      targetUri
    );
    const prepared = targetUri
      ? await this.prepareGeneratedCodeForWrite(codeWithIntegrationIncludes, targetUri, outputProfile)
      : { code: codeWithIntegrationIncludes };

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

  private resolveCompileTranslationUnits(rootFilePath?: string): string[] {
    const rootMatchPath = rootFilePath ? normalizeFsPathForMatch(rootFilePath) : null;
    const collected = new Set<string>();

    const tryAddSource = (candidatePath: string): void => {
      const trimmed = candidatePath.trim();
      if (!trimmed) {
        return;
      }

      const normalized = normalizeFsPath(trimmed);
      const matchPath = normalizeFsPathForMatch(normalized);
      if (rootMatchPath && matchPath === rootMatchPath) {
        return;
      }

      const ext = path.extname(normalized).toLowerCase();
      if (!CPP_SOURCE_EXTENSIONS.has(ext)) {
        return;
      }

      if (!path.isAbsolute(normalized)) {
        return;
      }

      try {
        if (!fs.existsSync(normalized) || !fs.statSync(normalized).isFile()) {
          return;
        }
      } catch {
        return;
      }

      collected.add(normalized);
    };

    const tryAddSiblingSources = (headerPath: string): void => {
      const parsed = path.parse(headerPath);
      for (const ext of CPP_SIBLING_SOURCE_EXTENSIONS) {
        tryAddSource(path.join(parsed.dir, `${parsed.name}${ext}`));
      }
    };

    for (const integration of this.graphState.integrationBindings ?? []) {
      if ((integration.kind ?? 'file') !== 'file') {
        continue;
      }

      const consumers = dedupeNormalizedPaths(integration.consumerFiles ?? []);
      if (
        rootMatchPath &&
        consumers.length > 0 &&
        !consumers.some((filePath) => normalizeFsPathForMatch(filePath) === rootMatchPath)
      ) {
        continue;
      }

      for (const attachedFile of integration.attachedFiles ?? []) {
        const normalized = normalizeFsPath(attachedFile);
        const ext = path.extname(normalized).toLowerCase();
        if (CPP_SOURCE_EXTENSIONS.has(ext)) {
          tryAddSource(normalized);
          continue;
        }
        if (CPP_HEADER_EXTENSIONS.has(ext)) {
          tryAddSiblingSources(normalized);
        }
      }
    }

    return Array.from(collected).sort((left, right) => left.localeCompare(right, 'ru'));
  }

  public async handleCompileAndRun(standardOverride?: CppStandard): Promise<void> {
    console.log('[EXTENSION DEBUG] handleCompileAndRun called with standardOverride:', standardOverride);
    this.outputChannel.appendLine('[Compile & Run] Запуск функции компиляции...');

    if (this.graphState.language !== 'cpp') {
      const targetLabel = this.graphState.language.toUpperCase();
      this.outputChannel.appendLine(
        `[Compile & Run] ⚠ Локальный запуск поддерживается только для CPP target. Текущий target: ${targetLabel}.`
      );
      if (this.graphState.language === 'ue') {
        this.outputChannel.appendLine(
          '[Compile & Run] Для UE используйте "Сгенерировать код" и собирайте результат через Unreal Build Tool / проект Unreal Engine.'
        );
        this.postToast('warning', 'UE target нельзя запускать как обычный C++ файл. Сначала сгенерируйте код.');
      } else {
        this.postToast('warning', `Локальный запуск не поддерживается для target ${targetLabel}.`);
      }
      this.outputChannel.show(true);
      return;
    }
    
    // Сначала генерируем код
    const generator = createGenerator('cpp');
    const blueprintState = migrateToBlueprintFormat(this.graphState);
    await this.reindexIntegrationSymbols(undefined, false);
    const externalValidation = this.validateExternalSymbolsForCodegen(blueprintState);
    if (externalValidation.errors.length > 0) {
      this.outputChannel.appendLine('[Compile & Run] ✗ Внешние символы устарели.');
      for (const error of externalValidation.errors) {
        this.outputChannel.appendLine(`  - ${error.message}`);
      }
      this.postToast('error', 'Внешние символы устарели. Выполните integration/reindex');
      this.outputChannel.show(true);
      return;
    }

    const blueprintStateForCodegen = this.applyResolvedExternalSymbolNamesForCodegen(
      blueprintState,
      externalValidation.resolvedSymbolsByNodeId
    );
    const preferredCodegenOptions = this.resolveCodegenOptionsForProfile('clean', blueprintStateForCodegen);
    if (!preferredCodegenOptions.generateMainWrapper) {
      this.outputChannel.appendLine('[Compile & Run] ⚠ Для запуска требуется main(). Временное выполнение: принудительно добавляю main().');
    }
    const result = generator.generate(blueprintStateForCodegen, {
      ...preferredCodegenOptions,
      generateMainWrapper: true,
    });

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
      this.postToast('warning', this.translate('warnings.cpp23RequiredForModernStd', { standard: standardOverride }));
    }

    this.outputChannel.appendLine(`[Compile & Run] Стандарт C++: ${cppStandard} (strict)`);

    // Сохранить код во временный файл
    const tempDir = os.tmpdir();
    const tempSourceFile = path.join(tempDir, `multicode_temp_${Date.now()}.cpp`);
    const tempExe = getTempOutputPath(tempSourceFile);

    try {
      const compileCode = this.prependRequiredIncludes(result.code, externalValidation.requiredIncludes);
      fs.writeFileSync(tempSourceFile, compileCode, 'utf8');
      this.outputChannel.appendLine(`[Compile & Run] Источник: ${tempSourceFile}`);

      const additionalSourceFiles = this.resolveCompileTranslationUnits(this.boundCodeDocumentUri?.fsPath);
      if (additionalSourceFiles.length > 0) {
        this.outputChannel.appendLine(`[Compile & Run] Доп. translation units: ${additionalSourceFiles.length}`);
        for (const sourceFile of additionalSourceFiles) {
          this.outputChannel.appendLine(`  + ${sourceFile}`);
        }
      }

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
        additionalSourceFiles,
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
    this.postEditableFiles();
    this.postClassStorageStatus();
    this.postClassNodesConfig();
    this.postCodegenProfile();
    this.postCodegenEntrypointMode();
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

  private postEditableFiles(): void {
    this.sendToWebview({
      type: 'editableFilesChanged',
      payload: {
        files: this.getEditableFiles(),
      },
    });
  }

  private getEditableFiles(): Array<{ fileName: string; filePath: string }> {
    const expectedLanguageIds = this.getExpectedLanguageIds();
    const seen = new Set<string>();
    const files: Array<{ fileName: string; filePath: string }> = [];

    const pushFile = (uri: vscode.Uri): void => {
      if (uri.scheme !== 'file') {
        return;
      }
      const filePath = uri.fsPath;
      if (!filePath || seen.has(filePath)) {
        return;
      }
      seen.add(filePath);
      files.push({
        fileName: path.basename(filePath),
        filePath,
      });
    };

    for (const document of vscode.workspace.textDocuments) {
      if (document.uri.scheme !== 'file') {
        continue;
      }
      if (expectedLanguageIds.length > 0 && !expectedLanguageIds.includes(document.languageId)) {
        continue;
      }
      pushFile(document.uri);
    }

    if (this.boundCodeDocumentUri) {
      pushFile(this.boundCodeDocumentUri);
    }

    files.sort((left, right) => left.fileName.localeCompare(right.fileName, 'ru'));
    return files;
  }

  private postCodegenProfile(): void {
    this.sendToWebview({
      type: 'codegenProfileChanged',
      payload: {
        profile: this.readCodegenOutputProfile(),
      }
    });
  }

  private postCodegenEntrypointMode(): void {
    this.sendToWebview({
      type: 'codegenEntrypointModeChanged',
      payload: {
        mode: this.readCodegenEntrypointMode(),
      }
    });
  }

  private upsertClassStorageDiagnostic(item: ClassStorageDiagnosticItem): void {
    const classId = item.classId.trim();
    if (!classId) {
      return;
    }
    const next: ClassStorageDiagnosticItem = {
      classId,
      status: item.status,
      ...(item.className ? { className: item.className } : {}),
      ...(item.bindingFile ? { bindingFile: item.bindingFile } : {}),
      ...(item.filePath ? { filePath: item.filePath } : {}),
      ...(item.source ? { source: item.source } : {}),
      ...(typeof item.existsOnDisk === 'boolean' ? { existsOnDisk: item.existsOnDisk } : {}),
      ...(item.lastCheckedAt ? { lastCheckedAt: item.lastCheckedAt } : {}),
      ...(item.reason ? { reason: item.reason } : {}),
    };
    this.classStorageDiagnostics.set(classId, next);
    this.classStorageStatusUpdatedAt = new Date().toISOString();
  }

  private replaceClassStorageDiagnostics(items: ClassStorageDiagnosticItem[]): void {
    this.classStorageDiagnostics.clear();
    for (const item of items) {
      this.upsertClassStorageDiagnostic(item);
    }
    this.classStorageStatusUpdatedAt = new Date().toISOString();
  }

  private touchClassStorageDiagnostics(): void {
    this.classStorageStatusUpdatedAt = new Date().toISOString();
  }

  private resolveSidecarClassesDirPath(): string | null {
    if (!this.boundGraphBinding) {
      return null;
    }
    const config = this.readGraphBindingConfig();
    const normalizedFolder = (config.folder ?? '.multicode').replace(/\\/g, '/').replace(/\/+$/g, '') || '.multicode';
    return resolveGraphBindingFilePath(this.boundGraphBinding.rootFsPath, `${normalizedFolder}/classes`);
  }

  private buildClassStorageStatusPayload(): ClassStorageStatus {
    const storageMode = this.readClassStorageMode();
    const classes = Array.isArray(this.graphState.classes) ? this.graphState.classes : [];
    const classBindings = Array.isArray(this.graphState.classBindings) ? this.graphState.classBindings : [];
    const activeClassIds = new Set<string>();
    const classNameById = new Map<string, string>();
    const bindingFileByClassId = new Map<string, string>();
    for (const rawBinding of classBindings) {
      const classId = typeof rawBinding.classId === 'string' ? rawBinding.classId.trim() : '';
      if (classId) {
        activeClassIds.add(classId);
      }
    }
    for (const rawClass of classes) {
      if (!isRecord(rawClass)) {
        continue;
      }
      const classId = typeof rawClass.id === 'string' ? rawClass.id.trim() : '';
      if (classId) {
        activeClassIds.add(classId);
        const codeName = typeof rawClass.name === 'string' ? rawClass.name.trim() : '';
        const nameRu = typeof rawClass.nameRu === 'string' ? rawClass.nameRu.trim() : '';
        const className = nameRu || codeName;
        if (className.length > 0) {
          classNameById.set(classId, className);
        }
      }
    }

    const diagnostics = new Map<string, ClassStorageDiagnosticItem>();
    for (const [classId, item] of this.classStorageDiagnostics.entries()) {
      if (activeClassIds.has(classId)) {
        diagnostics.set(classId, item);
      }
    }
    const sidecarByClassId = new Map<string, string>();

    if (storageMode === 'sidecar' && this.boundGraphBinding) {
      const config = this.readGraphBindingConfig();
      for (const rawBinding of classBindings) {
        const classId = typeof rawBinding.classId === 'string' ? rawBinding.classId.trim() : '';
        if (!classId) {
          continue;
        }
        const rawFile = typeof rawBinding.file === 'string' ? rawBinding.file.trim() : '';
        const relativeFile = rawFile || this.makeDefaultClassBindingFileRelativePath(classId, config.folder);
        const absoluteFile = resolveGraphBindingFilePath(this.boundGraphBinding.rootFsPath, relativeFile);
        sidecarByClassId.set(classId, absoluteFile);
        bindingFileByClassId.set(classId, relativeFile);
      }
    }

    for (const [classId, filePath] of sidecarByClassId.entries()) {
      if (!diagnostics.has(classId)) {
        diagnostics.set(classId, {
          classId,
          className: classNameById.get(classId),
          bindingFile: bindingFileByClassId.get(classId),
          filePath,
          source: 'binding',
          existsOnDisk: fs.existsSync(filePath),
          lastCheckedAt: this.classStorageStatusUpdatedAt,
          status: 'unbound',
        });
      }
    }

    for (const rawClass of classes) {
      if (!isRecord(rawClass)) {
        continue;
      }
      const classId = typeof rawClass.id === 'string' ? rawClass.id.trim() : '';
      if (!classId) {
        continue;
      }
      if (diagnostics.has(classId)) {
        continue;
      }
      diagnostics.set(classId, {
        classId,
        className: classNameById.get(classId),
        bindingFile: bindingFileByClassId.get(classId),
        status: storageMode === 'embedded' ? 'unbound' : 'ok',
        ...(sidecarByClassId.has(classId) ? { filePath: sidecarByClassId.get(classId) } : {}),
        source: storageMode === 'embedded' ? 'embedded' : (sidecarByClassId.has(classId) ? 'binding' : 'inferred'),
        ...(sidecarByClassId.has(classId)
          ? {
              existsOnDisk: fs.existsSync(sidecarByClassId.get(classId)!),
              lastCheckedAt: this.classStorageStatusUpdatedAt,
            }
          : {}),
      });
    }

    const classItems = Array.from(diagnostics.values())
      .sort((left, right) => left.classId.localeCompare(right.classId, 'ru'))
      .map<ClassStorageStatusItem>((item) => ({
        classId: item.classId,
        ...(item.className ? { className: item.className } : {}),
        ...(item.bindingFile ? { bindingFile: item.bindingFile } : {}),
        status: item.status,
        ...(item.source ? { source: item.source } : {}),
        ...(item.filePath ? { filePath: item.filePath } : {}),
        ...(typeof item.existsOnDisk === 'boolean' ? { existsOnDisk: item.existsOnDisk } : {}),
        ...(item.lastCheckedAt ? { lastCheckedAt: item.lastCheckedAt } : {}),
        ...(item.reason ? { reason: item.reason } : {}),
      }));

    const missing = classItems.filter((item) => item.status === 'missing').length;
    const failed = classItems.filter((item) => item.status === 'failed').length;
    const fallbackEmbedded = classItems.filter((item) => item.status === 'fallbackEmbedded').length;
    const unbound = classItems.filter((item) => item.status === 'unbound').length;
    const dirty = classItems.filter((item) => item.status === 'dirty').length;
    const conflict = classItems.filter((item) => item.status === 'conflict').length;

    return {
      mode: storageMode,
      isBoundSource: Boolean(this.boundCodeDocumentUri?.scheme === 'file'),
      graphFilePath: this.boundGraphBinding?.graphUri.fsPath ?? null,
      classesDirPath: storageMode === 'sidecar' ? this.resolveSidecarClassesDirPath() : null,
      bindingsTotal: classBindings.length,
      classesLoaded: classes.length,
      missing,
      failed,
      fallbackEmbedded,
      unbound,
      dirty,
      conflict,
      updatedAt: this.classStorageStatusUpdatedAt,
      classItems,
    };
  }

  private postClassStorageStatus(): void {
    this.sendToWebview({
      type: 'classStorageStatusChanged',
      payload: this.buildClassStorageStatusPayload(),
    });
  }

  private postClassNodesConfig(): void {
    const payload: ClassNodesConfig = {
      advancedEnabled: this.readClassNodesAdvancedEnabled(),
    };
    this.sendToWebview({
      type: 'classNodesConfigChanged',
      payload,
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

  private readEnableUePackage(): boolean {
    return vscode.workspace.getConfiguration('multicode').get<boolean>('packages.enableUe', false);
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

  private readCodegenEntrypointMode(): CodegenEntrypointMode {
    const mode = vscode.workspace
      .getConfiguration('multicode')
      .get<CodegenEntrypointMode>('codegen.entrypointMode', 'auto');
    if (mode === 'executable' || mode === 'library') {
      return mode;
    }
    return 'auto';
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

  private async setCodegenEntrypointMode(mode: CodegenEntrypointMode): Promise<void> {
    const current = this.readCodegenEntrypointMode();
    if (current === mode) {
      this.postCodegenEntrypointMode();
      return;
    }

    const config = vscode.workspace.getConfiguration('multicode');
    const hasWorkspace = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
    const target = hasWorkspace
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;

    try {
      await config.update('codegen.entrypointMode', mode, target);
      this.postCodegenEntrypointMode();
      this.postToast(
        'success',
        this.translate('toasts.codegenEntrypointModeChanged', {
          mode: this.translate(`toolbar.codegenEntrypointMode.${mode}` as TranslationKey),
        })
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      this.postToast('error', `${this.translate('errors.codegenEntrypointModeUpdateFailed')}: ${reason}`);
    }
  }

  private shouldGenerateMainWrapperForGraph(
    mode: CodegenEntrypointMode,
    graphLike: { nodes: Array<{ type: string }> }
  ): boolean {
    if (mode === 'executable') {
      return true;
    }
    if (mode === 'library') {
      return false;
    }
    return graphLike.nodes.some((node) => node.type === 'Start');
  }

  private resolveCodegenOptionsForProfile(
    profile: CodegenOutputProfile,
    graphLike: { nodes: Array<{ type: string }> }
  ): { includeRussianComments: boolean; includeSourceMarkers: boolean; generateMainWrapper: boolean } {
    const mode = this.readCodegenEntrypointMode();
    const generateMainWrapper = this.shouldGenerateMainWrapperForGraph(mode, graphLike);
    switch (profile) {
      case 'clean':
        return { includeRussianComments: false, includeSourceMarkers: false, generateMainWrapper };
      case 'learn':
        return { includeRussianComments: true, includeSourceMarkers: false, generateMainWrapper };
      case 'debug':
      case 'recovery':
        return { includeRussianComments: true, includeSourceMarkers: true, generateMainWrapper };
      default:
        return { includeRussianComments: false, includeSourceMarkers: false, generateMainWrapper };
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
      case 'ue':
        return ['cpp', 'c'];
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
    if (!uri) {
      return;
    }

    const prevUri = this.boundCodeDocumentUri;
    const prevUriKey = prevUri?.toString();
    const nextUriKey = uri.toString();
    if (prevUri && prevUriKey !== nextUriKey) {
      this.rememberDetachedGraphSnapshot(prevUri);
    }

    this.boundCodeDocumentUri = uri;
    this.postBoundFile();
    this.postEditableFiles();
    this.postClassStorageStatus();
    if (!prevUri || prevUriKey !== nextUriKey) {
      void this.handleBoundSourceChanged(uri);
    }
  }

  private rememberDetachedGraphSnapshot(sourceUri: vscode.Uri): void {
    if (sourceUri.scheme !== 'file') {
      return;
    }

    const key = createDetachedSourceGraphCacheKey(sourceUri.fsPath);
    const snapshot = JSON.parse(JSON.stringify(this.graphState)) as GraphState;
    this.detachedGraphStateBySource.set(key, snapshot);
  }

  private restoreDetachedGraphSnapshot(sourceUri: vscode.Uri): GraphState | undefined {
    if (sourceUri.scheme !== 'file') {
      return undefined;
    }
    const key = createDetachedSourceGraphCacheKey(sourceUri.fsPath);
    const snapshot = this.detachedGraphStateBySource.get(key);
    return snapshot ? (JSON.parse(JSON.stringify(snapshot)) as GraphState) : undefined;
  }

  private async handleBoundSourceChanged(sourceUri: vscode.Uri): Promise<void> {
    const loadStatus = await this.tryLoadGraphFromBoundSource(sourceUri);
    if (this.boundCodeDocumentUri?.toString() !== sourceUri.toString()) {
      return;
    }

    if (loadStatus === 'loaded' || loadStatus === 'created') {
      this.rememberDetachedGraphSnapshot(sourceUri);
      return;
    }

    const cachedGraph = this.restoreDetachedGraphSnapshot(sourceUri);
    const fallbackGraph =
      cachedGraph ??
      createDetachedSourceGraphState(sourceUri.fsPath, {
        language: this.graphState.language,
        displayLanguage: this.locale,
      });
    this.boundGraphBinding = undefined;
    this.graphState = this.normalizeState(fallbackGraph);
    this.postState();
    void this.validateAndDispatch(this.graphState);
  }

  private async bindFileFromWebview(filePath: string): Promise<void> {
    const trimmedPath = filePath.trim();
    if (!trimmedPath) {
      this.postToast('warning', 'Не указан путь к файлу для привязки');
      return;
    }

    try {
      const targetUri = vscode.Uri.file(trimmedPath);
      const document = await vscode.workspace.openTextDocument(targetUri);
      const expectedLanguageIds = this.getExpectedLanguageIds();
      if (expectedLanguageIds.length > 0 && !expectedLanguageIds.includes(document.languageId)) {
        this.postToast('warning', `Файл ${path.basename(trimmedPath)} не соответствует текущей целевой платформе`);
        return;
      }

      const editor = await vscode.window.showTextDocument(document, { preserveFocus: false, preview: false });
      this.bindActiveEditorDocument(editor);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      this.postToast('warning', `Не удалось открыть файл: ${reason}`);
    }
  }

  private resolveFilePickOpenLabel(purpose?: 'bind' | 'dependency' | 'working'): string {
    switch (purpose) {
      case 'bind':
        return 'Выбрать рабочий файл';
      case 'dependency':
        return 'Выбрать файл зависимости';
      case 'working':
        return 'Добавить файл в рабочий список';
      default:
        return 'Выбрать файл';
    }
  }

  private getFilePickFilters(): Record<string, string[]> | undefined {
    switch (this.graphState.language) {
      case 'cpp':
      case 'ue':
        return { 'C/C++': ['cpp', 'cc', 'cxx', 'c', 'h', 'hpp', 'hh', 'hxx'] };
      case 'rust':
        return { Rust: ['rs'] };
      case 'asm':
        return { ASM: ['asm', 's', 'nasm', 'masm'] };
      default:
        return undefined;
    }
  }

  private async handleFilePick(
    payload?: { purpose?: 'bind' | 'dependency' | 'working'; openLabel?: string }
  ): Promise<Extract<ExternalIpcResponse, { type: 'file/pick' }>> {
    try {
      const defaultUri =
        this.boundCodeDocumentUri ??
        vscode.workspace.workspaceFolders?.[0]?.uri ??
        vscode.window.activeTextEditor?.document.uri;
      const [uri] =
        (await vscode.window.showOpenDialog({
          canSelectMany: false,
          canSelectFiles: true,
          canSelectFolders: false,
          defaultUri,
          openLabel: payload?.openLabel?.trim() || this.resolveFilePickOpenLabel(payload?.purpose),
          filters: this.getFilePickFilters(),
        })) ?? [];

      if (!uri) {
        return {
          type: 'file/pick',
          ok: true,
          payload: {
            filePath: null,
            fileName: null,
          },
        };
      }

      const document = await vscode.workspace.openTextDocument(uri);
      const expectedLanguageIds = this.getExpectedLanguageIds();
      if (expectedLanguageIds.length > 0 && !expectedLanguageIds.includes(document.languageId)) {
        return {
          type: 'file/pick',
          ok: false,
          error: {
            code: 'E_FILE_PICK_LANGUAGE',
            message: `Файл ${path.basename(uri.fsPath)} не соответствует целевой платформе`,
            details: {
              filePath: uri.fsPath,
              languageId: document.languageId,
              expectedLanguageIds,
            },
          },
        };
      }

      return {
        type: 'file/pick',
        ok: true,
        payload: {
          filePath: uri.fsPath,
          fileName: path.basename(uri.fsPath),
        },
      };
    } catch (error) {
      return {
        type: 'file/pick',
        ok: false,
        error: mapToIpcError(error, 'E_FILE_PICK', 'Не удалось выбрать файл'),
      };
    }
  }

  private async handleFileOpen(
    payload: { filePath: string; preview?: boolean; preserveFocus?: boolean }
  ): Promise<Extract<ExternalIpcResponse, { type: 'file/open' }>> {
    const filePath = payload.filePath.trim();
    if (!filePath) {
      return {
        type: 'file/open',
        ok: false,
        error: {
          code: 'E_FILE_OPEN_PATH',
          message: 'Путь к файлу не указан',
        },
      };
    }

    try {
      const targetUri = vscode.Uri.file(filePath);
      const document = await vscode.workspace.openTextDocument(targetUri);
      await vscode.window.showTextDocument(document, {
        preserveFocus: payload.preserveFocus ?? false,
        preview: payload.preview ?? false,
      });
      return {
        type: 'file/open',
        ok: true,
        payload: {
          filePath: targetUri.fsPath,
          fileName: path.basename(targetUri.fsPath),
        },
      };
    } catch (error) {
      return {
        type: 'file/open',
        ok: false,
        error: mapToIpcError(error, 'E_FILE_OPEN', 'Не удалось открыть файл'),
      };
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
      this.postToast('error', this.translate('errors.ipc.validation.webviewMessage'));
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
    const mapped = mapToIpcError(error, 'E_MESSAGE_HANDLING', context);
    const composed = `${context}: ${mapped.message}`;
    this.outputChannel.appendLine(composed);
    void vscode.window.showErrorMessage(composed);
    this.postLog('error', composed);
  }

  private extractErrorDetails(error: unknown): string {
    return mapToIpcError(error, 'E_UNKNOWN', 'Неизвестная ошибка').message;
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

  private postExternalIpcResponse(response: ExternalIpcResponse): void {
    const parsed = safeExternalIpcResponse(response);
    if (!parsed.success) {
      this.postToast('error', this.translate('errors.ipc.validation.extensionResponse'));
      this.handleMessageError('IPC-ответ не прошёл схему', parsed.error);
      return;
    }

    void this.panel.webview.postMessage(parsed.data);
  }

  private extractQuotedIncludes(sourceText: string): string[] {
    const includes: string[] = [];
    for (const match of sourceText.matchAll(LOCAL_INCLUDE_DIRECTIVE)) {
      const includeTarget = match[1]?.trim();
      if (includeTarget) {
        includes.push(includeTarget);
      }
    }
    return Array.from(new Set(includes));
  }

  private resolveLocalIncludePath(rootFilePath: string, includeTarget: string): string | null {
    const candidates = [path.resolve(path.dirname(rootFilePath), includeTarget)];
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      candidates.push(path.resolve(folder.uri.fsPath, includeTarget));
    }

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return candidate;
        }
      } catch {
        // Ignore missing/unreadable candidate path.
      }
    }

    return null;
  }

  private buildImplicitFileIntegration(sourceFilePath: string, rootFilePath: string): SourceIntegration {
    const normalizedSourcePath = normalizeFsPath(sourceFilePath);
    const normalizedRootPath = normalizeFsPath(rootFilePath);
    const fileName = path.basename(normalizedSourcePath);
    const stem = path.parse(fileName).name;
    const integrationId = `file_${toSafeIdSegment(stem)}_${hashString(normalizedSourcePath.toLowerCase())}`;

    return {
      integrationId,
      attachedFiles: [normalizedSourcePath],
      consumerFiles: [normalizedRootPath],
      mode: 'implicit',
      kind: 'file',
      displayName: fileName,
      location: {
        type: 'local_file',
        value: normalizedSourcePath,
      },
    };
  }

  private async ensureIncludeAutoDependencies(rootFilePath?: string): Promise<void> {
    if (!rootFilePath || !path.isAbsolute(rootFilePath)) {
      return;
    }

    if (!CPP_FILE_EXTENSIONS.has(path.extname(rootFilePath).toLowerCase())) {
      return;
    }

    let sourceText = '';
    try {
      sourceText = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.file(rootFilePath))).toString('utf8');
    } catch {
      return;
    }

    const includeTargets = this.extractQuotedIncludes(sourceText);
    if (includeTargets.length === 0) {
      return;
    }

    const currentBindings = this.graphState.integrationBindings ?? [];
    const nextBindings = [...currentBindings];
    const normalizedRootPath = normalizeFsPath(rootFilePath);
    const normalizedRootPathMatch = normalizeFsPathForMatch(normalizedRootPath);
    let changed = false;

    for (const includeTarget of includeTargets) {
      const resolvedIncludePath = this.resolveLocalIncludePath(rootFilePath, includeTarget);
      const normalizedIncludeTarget = includeTarget.replace(/\\/g, '/').toLowerCase();
      const includeBaseName = path.basename(normalizedIncludeTarget);
      const normalizedResolvedPath = resolvedIncludePath ? normalizeFsPathForMatch(resolvedIncludePath) : null;

      let integrationIndex = nextBindings.findIndex((integration) => {
        if (integration.kind && integration.kind !== 'file') {
          return false;
        }

        return integration.attachedFiles.some((attachedFile) => {
          const normalizedAttachedFile = normalizeFsPathForMatch(attachedFile);
          if (normalizedResolvedPath && normalizedAttachedFile === normalizedResolvedPath) {
            return true;
          }
          if (normalizedAttachedFile.endsWith(`/${normalizedIncludeTarget}`)) {
            return true;
          }
          return path.basename(normalizedAttachedFile) === includeBaseName;
        });
      });

      if (integrationIndex < 0 && resolvedIncludePath) {
        const autoIntegration = this.buildImplicitFileIntegration(resolvedIncludePath, rootFilePath);
        integrationIndex = nextBindings.findIndex((item) => item.integrationId === autoIntegration.integrationId);
        if (integrationIndex < 0) {
          nextBindings.push(autoIntegration);
          changed = true;
          continue;
        }
      }

      if (integrationIndex < 0) {
        continue;
      }

      const integration = nextBindings[integrationIndex];
      const isFileIntegration = (integration.kind ?? 'file') === 'file';
      if (!isFileIntegration) {
        continue;
      }

      // Явные (explicit) интеграции считаем ручным управлением: авто-сканер #include не должен
      // обратно "прикреплять" consumerFiles после Detach в UI.
      if (integration.mode !== 'implicit') {
        continue;
      }

      const scopeFiles = dedupeNormalizedPaths(integration.consumerFiles ?? []);
      const hasRootInScope = scopeFiles.some(
        (filePath) => normalizeFsPathForMatch(filePath) === normalizedRootPathMatch
      );
      if (hasRootInScope) {
        continue;
      }

      nextBindings[integrationIndex] = {
        ...integration,
        consumerFiles: [...scopeFiles, normalizedRootPath],
      };
      changed = true;
    }

    if (!changed) {
      return;
    }

    this.markState({ integrationBindings: nextBindings });
    this.postState();
  }

  private async handleIntegrationList(
    payload?: { includeImplicit?: boolean }
  ): Promise<Extract<ExternalIpcResponse, { type: 'integration/list' }>> {
    try {
      await this.ensureIncludeAutoDependencies(this.boundCodeDocumentUri?.fsPath);
      return {
        type: 'integration/list',
        ok: true,
        payload: {
          integrations: (this.graphState.integrationBindings ?? []).filter(
            (item) => payload?.includeImplicit || item.mode === 'explicit'
          ),
        },
      };
    } catch (error) {
      return {
        type: 'integration/list',
        ok: false,
        error: mapToIpcError(error, 'E_INTEGRATION_LIST', 'Не удалось получить список интеграций'),
      };
    }
  }

  private handleIntegrationAdd(payload: { integration: SourceIntegration }): Promise<Extract<ExternalIpcResponse, { type: 'integration/add' }>> {
    return orchestrateIntegrationAdd(this.graphState, payload, (patch) => {
      this.markState(patch);
      this.postState();
    });
  }

  private handleIntegrationReindex(payload?: { integrationId?: string; force?: boolean }): Promise<Extract<ExternalIpcResponse, { type: 'integration/reindex' }>> {
    return orchestrateIntegrationReindex(payload, (integrationId, force) => this.reindexIntegrationSymbols(integrationId, force));
  }

  private async handleSymbolsQuery(payload: { query: string; integrationId?: string; limit?: number }): Promise<Extract<ExternalIpcResponse, { type: 'symbols/query' }>> {
    const forceReindex = payload.query.trim().length === 0;
    await this.reindexIntegrationSymbols(payload.integrationId, forceReindex);
    return {
      type: 'symbols/query',
      ok: true,
      payload: {
        symbols: this.symbolIndexerRegistry.querySymbols(payload.query, payload.integrationId, payload.limit ?? 50),
      },
    };
  }

  private async handleDependencyMapGet(payload?: { rootFile?: string; includeSystem?: boolean }): Promise<Extract<ExternalIpcResponse, { type: 'dependency-map/get' }>> {
    await this.ensureIncludeAutoDependencies(payload?.rootFile ?? this.boundCodeDocumentUri?.fsPath);
    return orchestrateDependencyMapGet(
      this.graphState,
      payload,
      this.boundCodeDocumentUri?.fsPath ?? 'graph-root'
    );
  }

  private handleClassUpsert(payload: unknown): Promise<Extract<ExternalIpcResponse, { type: 'class/upsert' }>> {
    return orchestrateClassUpsert(this.graphState, payload, (patch) => {
      this.markState(patch);
      this.postState();
    });
  }

  private handleClassDelete(payload: unknown): Promise<Extract<ExternalIpcResponse, { type: 'class/delete' }>> {
    return orchestrateClassDelete(this.graphState, payload, (patch) => {
      this.markState(patch);
      this.postState();
    });
  }

  private handleClassReorderMember(payload: unknown): Promise<Extract<ExternalIpcResponse, { type: 'class/reorderMember' }>> {
    return orchestrateClassReorderMember(this.graphState, payload, (patch) => {
      this.markState(patch);
      this.postState();
    });
  }

  private handleClassReorderMethod(payload: unknown): Promise<Extract<ExternalIpcResponse, { type: 'class/reorderMethod' }>> {
    return orchestrateClassReorderMethod(this.graphState, payload, (patch) => {
      this.markState(patch);
      this.postState();
    });
  }

  private normalizeClassBindingsFromState(folderSetting: string): NormalizedClassBinding[] {
    const seen = new Set<string>();
    const next: NormalizedClassBinding[] = [];
    const rawBindings = Array.isArray(this.graphState.classBindings)
      ? (this.graphState.classBindings as unknown as MulticodeClassBinding[])
      : [];
    for (const binding of rawBindings) {
      const classId = typeof binding.classId === 'string' ? binding.classId.trim() : '';
      if (!classId || seen.has(classId)) {
        continue;
      }
      const rawFile = typeof binding.file === 'string' ? binding.file.trim() : '';
      const file = rawFile || this.makeDefaultClassBindingFileRelativePath(classId, folderSetting);
      seen.add(classId);
      next.push({ classId, file });
    }
    return next.sort((left, right) => left.classId.localeCompare(right.classId, 'ru'));
  }

  private async syncClassBindingMarkersInBoundSource(): Promise<void> {
    if (this.readClassStorageMode() !== 'sidecar') {
      return;
    }
    const codeUri = this.boundCodeDocumentUri;
    if (!codeUri || codeUri.scheme !== 'file') {
      return;
    }
    const graphBindingConfig = this.readGraphBindingConfig();
    const bindings = this.normalizeClassBindingsFromState(graphBindingConfig.folder);
    try {
      const document = await vscode.workspace.openTextDocument(codeUri);
      const original = document.getText();
      const next = injectOrReplaceMulticodeClassBindingsBlock(original, bindings);
      if (next === original) {
        return;
      }

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
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      this.outputChannel.appendLine(`[MultiCode] Не удалось синхронизировать @multicode:class: ${reason}`);
    }
  }

  private async handleClassStorageReload(
    payload?: { classId?: string }
  ): Promise<Extract<ExternalIpcResponse, { type: 'class/storage/reload' }>> {
    try {
      if (this.readClassStorageMode() !== 'sidecar') {
        return {
          type: 'class/storage/reload',
          ok: true,
          payload: {
            reloaded: 0,
            ...(payload?.classId ? { classId: payload.classId } : {}),
          },
        };
      }

      const sourceUri = this.boundCodeDocumentUri;
      const boundGraph = this.boundGraphBinding;
      if (!sourceUri || sourceUri.scheme !== 'file' || !boundGraph) {
        return {
          type: 'class/storage/reload',
          ok: false,
          error: {
            code: 'E_CLASS_STORAGE_RELOAD_UNBOUND',
            message: 'Невозможно перечитать sidecar-классы: исходник не привязан.',
          },
        };
      }

      const sourceDocument = await vscode.workspace.openTextDocument(sourceUri);
      await this.hydrateClassesFromSidecarIfNeeded(sourceDocument.getText(), boundGraph.rootFsPath);
      this.postState();
      void this.validateAndDispatch(this.graphState);

      const requestedClassId = typeof payload?.classId === 'string' ? payload.classId.trim() : '';
      const reloaded = requestedClassId.length > 0
        ? (this.buildClassStorageStatusPayload().classItems.some((item) => item.classId === requestedClassId) ? 1 : 0)
        : this.buildClassStorageStatusPayload().classItems.length;

      return {
        type: 'class/storage/reload',
        ok: true,
        payload: {
          reloaded,
          ...(requestedClassId ? { classId: requestedClassId } : {}),
        },
      };
    } catch (error) {
      return {
        type: 'class/storage/reload',
        ok: false,
        error: mapToIpcError(error, 'E_CLASS_STORAGE_RELOAD', 'Не удалось перечитать class sidecar'),
      };
    }
  }

  private async handleClassStorageRepair(
    payload?: { classId?: string }
  ): Promise<Extract<ExternalIpcResponse, { type: 'class/storage/repair' }>> {
    try {
      if (this.readClassStorageMode() !== 'sidecar') {
        return {
          type: 'class/storage/repair',
          ok: true,
          payload: {
            repaired: 0,
            ...(payload?.classId ? { classId: payload.classId } : {}),
          },
        };
      }

      const boundGraph = this.boundGraphBinding;
      if (!boundGraph) {
        return {
          type: 'class/storage/repair',
          ok: false,
          error: {
            code: 'E_CLASS_STORAGE_REPAIR_UNBOUND',
            message: 'Невозможно починить class sidecar: нет привязки графа к файлу.',
          },
        };
      }

      const graphBindingConfig = this.readGraphBindingConfig();
      const parsedClasses = blueprintClassSchema.array().safeParse(Array.isArray(this.graphState.classes) ? this.graphState.classes : []);
      if (!parsedClasses.success) {
        return {
          type: 'class/storage/repair',
          ok: false,
          error: {
            code: 'E_CLASS_STORAGE_REPAIR_INVALID_CLASSES',
            message: 'Невозможно починить class sidecar: структура classes повреждена.',
          },
        };
      }

      const requestedClassId = typeof payload?.classId === 'string' ? payload.classId.trim() : '';
      const classById = new Map<string, BlueprintClassSidecar>();
      for (const classItem of parsedClasses.data) {
        classById.set(classItem.id, classItem);
      }

      const existingBindings = this.normalizeClassBindingsFromState(graphBindingConfig.folder);
      const bindingById = new Map<string, NormalizedClassBinding>();
      for (const binding of existingBindings) {
        bindingById.set(binding.classId, binding);
      }

      const targetClassIds = (() => {
        if (requestedClassId.length > 0) {
          return [requestedClassId];
        }
        const ids = new Set<string>([...classById.keys(), ...bindingById.keys()]);
        return Array.from(ids).sort((left, right) => left.localeCompare(right, 'ru'));
      })();

      let repaired = 0;
      for (const classId of targetClassIds) {
        if (!bindingById.has(classId)) {
          bindingById.set(classId, {
            classId,
            file: this.makeDefaultClassBindingFileRelativePath(classId, graphBindingConfig.folder),
          });
          repaired += 1;
        }
      }

      const nextBindings = Array.from(bindingById.values()).sort((left, right) =>
        left.classId.localeCompare(right.classId, 'ru')
      );

      for (const binding of nextBindings) {
        if (requestedClassId.length > 0 && binding.classId !== requestedClassId) {
          continue;
        }
        const classItem = classById.get(binding.classId);
        if (!classItem) {
          continue;
        }

        const classFsPath = resolveGraphBindingFilePath(boundGraph.rootFsPath, binding.file);
        const classUri = vscode.Uri.file(classFsPath);
        if (fs.existsSync(classFsPath)) {
          continue;
        }

        const classDir = vscode.Uri.file(path.dirname(classUri.fsPath));
        await vscode.workspace.fs.createDirectory(classDir);
        const payloadData = serializeClassSidecar(classItem);
        await vscode.workspace.fs.writeFile(classUri, Buffer.from(JSON.stringify(payloadData, null, 2), 'utf8'));
        repaired += 1;
      }

      this.markState({
        classBindings: nextBindings,
      });
      await this.tryWriteBoundGraphFile();
      await this.syncClassBindingMarkersInBoundSource();
      this.postState();

      return {
        type: 'class/storage/repair',
        ok: true,
        payload: {
          repaired,
          ...(requestedClassId ? { classId: requestedClassId } : {}),
        },
      };
    } catch (error) {
      return {
        type: 'class/storage/repair',
        ok: false,
        error: mapToIpcError(error, 'E_CLASS_STORAGE_REPAIR', 'Не удалось починить class sidecar'),
      };
    }
  }

  private validateExternalSymbolsForCodegen(blueprintState: ReturnType<typeof migrateToBlueprintFormat>) {
    const integrations = this.graphState.integrationBindings ?? [];
    const symbols = this.symbolIndexerRegistry.querySymbols('', undefined, Number.MAX_SAFE_INTEGER);
    const validation = validateExternalSymbols(
      blueprintState,
      symbols,
      integrations,
      (integrationId, symbolId) => this.symbolIndexerRegistry.getSignatureHash(integrationId, symbolId)
    );

    if (validation.brokenNodeIds.length > 0) {
      const brokenSet = new Set(validation.brokenNodeIds);
      this.markState({
        nodes: this.graphState.nodes.map((node) => {
          if (!brokenSet.has(node.id)) {
            return node;
          }
          const blueprintNode = isRecord(node.blueprintNode) ? node.blueprintNode : {};
          return {
            ...node,
            blueprintNode: {
              ...blueprintNode,
              broken: true,
            },
          };
        }),
      });
      this.postState();
    }

    return validation;
  }

  private resolveQualifiedExternalSymbolName(symbol: { name: string; namespacePath?: string[] }): string {
    if (Array.isArray(symbol.namespacePath) && symbol.namespacePath.length > 0) {
      return `${symbol.namespacePath.join('::')}::${symbol.name}`;
    }
    return symbol.name;
  }

  private applyResolvedExternalSymbolNamesForCodegen(
    blueprintState: ReturnType<typeof migrateToBlueprintFormat>,
    resolvedSymbolsByNodeId: Map<string, { name: string; namespacePath?: string[] }>
  ): ReturnType<typeof migrateToBlueprintFormat> {
    if (resolvedSymbolsByNodeId.size === 0) {
      return blueprintState;
    }

    let changed = false;
    const nextNodes = blueprintState.nodes.map((node) => {
      if (node.type !== 'CallUserFunction' || !isRecord(node.properties)) {
        return node;
      }

      const symbol = resolvedSymbolsByNodeId.get(node.id);
      if (!symbol) {
        return node;
      }

      const qualifiedName = this.resolveQualifiedExternalSymbolName(symbol);
      const currentName =
        typeof node.properties.functionName === 'string' ? node.properties.functionName : undefined;
      const externalSymbol = isRecord(node.properties.externalSymbol)
        ? node.properties.externalSymbol
        : undefined;
      const symbolRef = isRecord(node.properties.symbolRef) ? node.properties.symbolRef : undefined;
      const currentQualifiedName =
        (externalSymbol && typeof externalSymbol.qualifiedName === 'string' ? externalSymbol.qualifiedName : null) ??
        (symbolRef && typeof symbolRef.qualifiedName === 'string' ? symbolRef.qualifiedName : null);

      if (currentName === qualifiedName && currentQualifiedName === qualifiedName) {
        return node;
      }

      changed = true;
      return {
        ...node,
        properties: {
          ...node.properties,
          functionName: qualifiedName,
          ...(externalSymbol
            ? { externalSymbol: { ...externalSymbol, qualifiedName } }
            : undefined),
          ...(symbolRef
            ? { symbolRef: { ...symbolRef, qualifiedName } }
            : undefined),
        },
      };
    });

    if (!changed) {
      return blueprintState;
    }

    return {
      ...blueprintState,
      nodes: nextNodes,
    };
  }

  private prependRequiredIncludes(code: string, includes: string[], targetUri?: vscode.Uri): string {
    const includePathMode = this.readExternalIncludePathMode();
    return buildCodeWithUnifiedIncludes(code, {
      requiredIncludes: includes,
      includePathMode,
      targetFilePath: targetUri?.scheme === 'file' ? targetUri.fsPath : undefined,
    });
  }

  private readExternalIncludePathMode(): ExternalIncludePathMode {
    const configured = vscode.workspace
      .getConfiguration('multicode')
      .get<'absolute' | 'relative'>('externalSymbols.includePathMode', 'relative');
    return configured === 'absolute' ? 'absolute' : 'relative';
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
      case 'bindFile':
        void this.bindFileFromWebview(message.payload.filePath);
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
      case 'setCodegenEntrypointMode':
        void this.setCodegenEntrypointMode(message.payload.mode);
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
      case 'integration/add':
        void this.handleIntegrationAdd(message.payload).then((response) => this.postExternalIpcResponse(response));
        break;
      case 'integration/remove': {
        const current = this.graphState.integrationBindings ?? [];
        const next = current.filter((item) => item.integrationId !== message.payload.integrationId);
        this.markState({ integrationBindings: next });
        this.postState();
        this.postExternalIpcResponse({
          type: 'integration/remove',
          ok: true,
          payload: {
            integrationId: message.payload.integrationId,
            removed: next.length !== current.length,
          },
        });
        break;
      }
      case 'integration/list':
        void this.handleIntegrationList(message.payload).then((response) => this.postExternalIpcResponse(response));
        break;
      case 'integration/reindex':
        void this.handleIntegrationReindex(message.payload).then((response) => this.postExternalIpcResponse(response));
        break;
      case 'integration/diagnostics':
        this.postExternalIpcResponse({
          type: 'integration/diagnostics',
          ok: true,
          payload: {
            diagnostics: (this.graphState.integrationBindings ?? [])
              .filter((item) => !message.payload?.integrationId || item.integrationId === message.payload.integrationId)
              .map((item) => ({
                integrationId: item.integrationId,
                level: 'info' as const,
                message: `Интеграция ${item.integrationId} активна`,
              })),
          },
        });
        break;
      case 'symbols/query':
        void this.handleSymbolsQuery(message.payload).then((response) => this.postExternalIpcResponse(response));
        break;
      case 'dependency-map/get':
        void this.handleDependencyMapGet(message.payload).then((response) => this.postExternalIpcResponse(response));
        break;
      case 'file/pick':
        void this.handleFilePick(message.payload).then((response) => this.postExternalIpcResponse(response));
        break;
      case 'file/open':
        void this.handleFileOpen(message.payload).then((response) => this.postExternalIpcResponse(response));
        break;
      case 'class/storage/reload':
        void this.handleClassStorageReload(message.payload).then((response) => this.postExternalIpcResponse(response));
        break;
      case 'class/storage/repair':
        void this.handleClassStorageRepair(message.payload).then((response) => this.postExternalIpcResponse(response));
        break;
      case 'class/upsert':
        void this.handleClassUpsert(message.payload).then((response) => this.postExternalIpcResponse(response));
        break;
      case 'class/delete':
        void this.handleClassDelete(message.payload).then((response) => this.postExternalIpcResponse(response));
        break;
      case 'class/reorderMember':
        void this.handleClassReorderMember(message.payload).then((response) => this.postExternalIpcResponse(response));
        break;
      case 'class/reorderMethod':
        void this.handleClassReorderMethod(message.payload).then((response) => this.postExternalIpcResponse(response));
        break;
      default:
        break;
    }
  }

  private generateCurrentGraphCode() {
    const blueprintState = migrateToBlueprintFormat(this.graphState);

    try {
      const generator = createGenerator(this.graphState.language);
      const externalValidation = this.validateExternalSymbolsForCodegen(blueprintState);
      if (externalValidation.errors.length > 0) {
        return {
          success: false,
          code: '',
          errors: externalValidation.errors,
          warnings: [],
          sourceMap: [],
          stats: {
            nodesProcessed: 0,
            linesOfCode: 0,
            generationTimeMs: 0,
          },
        };
      }

      const blueprintStateForCodegen = this.applyResolvedExternalSymbolNamesForCodegen(
        blueprintState,
        externalValidation.resolvedSymbolsByNodeId
      );
      const result = generator.generate(
        blueprintStateForCodegen,
        this.resolveCodegenOptionsForProfile(this.readCodegenOutputProfile(), blueprintStateForCodegen)
      );
      if (!result.success) {
        return result;
      }

      return {
        ...result,
        code: this.prependRequiredIncludes(
          result.code,
          externalValidation.requiredIncludes,
          this.boundCodeDocumentUri
        ),
      };
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
    if (payload.graphId && payload.graphId !== this.graphState.id) {
      this.outputChannel.appendLine(
        `[MultiCode] Игнорирован устаревший graphChanged: payload.graphId=${payload.graphId}, active.graphId=${this.graphState.id}`
      );
      return;
    }

    const payloadStats = getVariablesStats(payload.variables);
    debugLog('applyGraphMutation received', {
      hasVariables: payloadStats.hasVariables,
      variablesCount: payloadStats.variablesCount,
      payloadKeys: Object.keys(payload),
    });
    const { graphId: _graphId, nodes, edges, ...rest } = payload;
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

  private readGraphExportMode(): 'modern' | 'legacy' {
    const mode = vscode.workspace
      .getConfiguration('multicode')
      .get<'modern' | 'legacy'>('graphExport.compatibilityMode', 'legacy');
    return mode === 'modern' ? 'modern' : 'legacy';
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
    // Быстрый скан первых строк + fallback по всему файлу (для сценариев, когда marker ниже include-блока).
    const maxLines = Math.max(4, Math.min(200, config.get<number>('graphBinding.maxLines', 10)));
    return { enabled, autoSave, folder, maxLines };
  }

  private readClassStorageMode(): ClassStorageMode {
    const mode = vscode.workspace
      .getConfiguration('multicode')
      .get<string>('classStorage.mode', 'embedded');
    return mode === 'sidecar' ? 'sidecar' : 'embedded';
  }

  private readClassNodesAdvancedEnabled(): boolean {
    return vscode.workspace
      .getConfiguration('multicode')
      .get<boolean>('classNodes.advanced', false);
  }

  private findGraphBindingInSource(sourceText: string, maxLines: number): MulticodeGraphBinding | null {
    const headMatch = findMulticodeGraphBindingInSource(sourceText, maxLines);
    if (headMatch) {
      return headMatch;
    }

    const totalLines = sourceText.split(/\r?\n/).length;
    if (totalLines <= maxLines) {
      return null;
    }

    return findMulticodeGraphBindingInSource(sourceText, totalLines);
  }

  private findClassBindingsInSource(sourceText: string, maxLines: number): MulticodeClassBinding[] {
    const headMatch = findMulticodeClassBindingsInSource(sourceText, maxLines);
    if (headMatch.length > 0) {
      return headMatch;
    }

    const totalLines = sourceText.split(/\r?\n/).length;
    if (totalLines <= maxLines) {
      return [];
    }

    return findMulticodeClassBindingsInSource(sourceText, totalLines);
  }

  private injectOrReplaceGraphBindingLine(sourceText: string, bindingLine: string, maxLines: number): string {
    const hasMarkerInHead = findMulticodeGraphBindingInSource(sourceText, maxLines) !== null;
    if (hasMarkerInHead) {
      return injectOrReplaceMulticodeGraphBinding(sourceText, bindingLine, maxLines);
    }

    const totalLines = sourceText.split(/\r?\n/).length;
    const hasMarkerInWholeSource =
      totalLines > maxLines ? findMulticodeGraphBindingInSource(sourceText, totalLines) !== null : false;
    if (hasMarkerInWholeSource) {
      return injectOrReplaceMulticodeGraphBinding(sourceText, bindingLine, totalLines);
    }

    return injectOrReplaceMulticodeGraphBinding(sourceText, bindingLine, maxLines);
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

  private makeDefaultClassBindingFileRelativePath(classId: string, folderSetting: string): string {
    const safeId = sanitizeGraphBindingFileName(classId);
    const folder = folderSetting.replace(/\\/g, '/').replace(/\/+$/g, '');
    const normalizedFolder = folder.length > 0 ? folder : '.multicode';
    return `${normalizedFolder}/classes/${safeId}.multicode`;
  }

  private buildCanonicalClassBindings(classes: Array<{ id: string }>, folderSetting: string): NormalizedClassBinding[] {
    return classes
      .map((classItem) => ({
        classId: classItem.id,
        file: this.makeDefaultClassBindingFileRelativePath(classItem.id, folderSetting),
      }))
      .sort((left, right) => left.classId.localeCompare(right.classId, 'ru'));
  }

  private computeClassIdSignature(classes: unknown): string {
    if (!Array.isArray(classes)) {
      return '';
    }

    const ids = classes
      .filter((value): value is Record<string, unknown> => isRecord(value))
      .map((entry) => (typeof entry.id === 'string' ? entry.id.trim() : ''))
      .filter((id) => id.length > 0)
      .sort((left, right) => left.localeCompare(right, 'ru'));

    if (ids.length === 0) {
      return '';
    }

    return Array.from(new Set(ids)).join('|');
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
    const codeWithBinding = this.injectOrReplaceGraphBindingLine(code, bindingLine, config.maxLines);
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
      const sourceText = document.getText();
      const binding = this.findGraphBindingInSource(sourceText, config.maxLines);
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
          await this.hydrateClassesFromSidecarIfNeeded(sourceText, rootFsPath);
          this.lastPersistedClassIdSignature = this.computeClassIdSignature(this.graphState.classes);
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
        await this.hydrateClassesFromSidecarIfNeeded(sourceText, rootFsPath);
        this.lastPersistedClassIdSignature = this.computeClassIdSignature(this.graphState.classes);
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
        await this.hydrateClassesFromSidecarIfNeeded(sourceText, rootFsPath);
        this.lastPersistedClassIdSignature = this.computeClassIdSignature(this.graphState.classes);
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
        : createBoundSourceSeedGraphState(codeUri.fsPath, {
            graphId: binding.graphId,
            language: this.graphState.language,
            displayLanguage: this.locale,
          });

      this.graphState = this.normalizeState(seed);
      await this.hydrateClassesFromSidecarIfNeeded(sourceText, rootFsPath);
      this.lastPersistedClassIdSignature = this.computeClassIdSignature(this.graphState.classes);
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

  private async hydrateClassesFromSidecarIfNeeded(sourceText: string, rootFsPath: string): Promise<void> {
    const storageMode = this.readClassStorageMode();
    if (storageMode !== 'sidecar') {
      const classes = Array.isArray(this.graphState.classes) ? this.graphState.classes : [];
      const diagnostics: ClassStorageDiagnosticItem[] = [];
      for (const rawClass of classes) {
        if (!isRecord(rawClass)) {
          continue;
        }
        const classId = typeof rawClass.id === 'string' ? rawClass.id.trim() : '';
        if (!classId) {
          continue;
        }
        diagnostics.push({
          classId,
          source: 'embedded',
          status: 'unbound',
        });
      }
      this.replaceClassStorageDiagnostics(diagnostics);
      return;
    }

    const config = this.readGraphBindingConfig();
    if (!config.enabled) {
      return;
    }

    const embeddedClasses = Array.isArray(this.graphState.classes) ? this.graphState.classes : [];
    const embeddedById = new Map<string, unknown>();
    for (const entry of embeddedClasses) {
      if (!isRecord(entry)) {
        continue;
      }
      const id = typeof entry.id === 'string' ? entry.id.trim() : '';
      if (!id || embeddedById.has(id)) {
        continue;
      }
      embeddedById.set(id, entry);
    }

    let bindings: MulticodeClassBinding[] = Array.isArray(this.graphState.classBindings)
      ? (this.graphState.classBindings as unknown as MulticodeClassBinding[])
      : [];

    const normalizeBinding = (binding: MulticodeClassBinding): NormalizedClassBinding | null => {
      const classId = typeof binding.classId === 'string' ? binding.classId.trim() : '';
      if (!classId) {
        return null;
      }
      const rawFile = typeof binding.file === 'string' ? binding.file.trim() : '';
      const file = rawFile || this.makeDefaultClassBindingFileRelativePath(classId, config.folder);
      return { classId, file };
    };

    if (bindings.length === 0) {
      bindings = this.findClassBindingsInSource(sourceText, config.maxLines);
    }

    const normalizedBindings = bindings
      .map((binding) => normalizeBinding(binding))
      .filter((item): item is NormalizedClassBinding => item !== null);

    if (normalizedBindings.length === 0) {
      const diagnostics: ClassStorageDiagnosticItem[] = [];
      for (const rawClass of embeddedClasses) {
        if (!isRecord(rawClass)) {
          continue;
        }
        const classId = typeof rawClass.id === 'string' ? rawClass.id.trim() : '';
        if (!classId) {
          continue;
        }
        diagnostics.push({
          classId,
          source: 'embedded',
          status: 'unbound',
        });
      }
      this.replaceClassStorageDiagnostics(diagnostics);
      return;
    }

    const seen = new Set<string>();
    const uniqueBindings: NormalizedClassBinding[] = [];
    for (const binding of normalizedBindings) {
      if (seen.has(binding.classId)) {
        continue;
      }
      seen.add(binding.classId);
      uniqueBindings.push(binding);
    }

    const loadedClasses: unknown[] = [];
    const missingBindings: NormalizedClassBinding[] = [];
    const failedBindings: Array<{ binding: NormalizedClassBinding; reason: string }> = [];
    const diagnostics: ClassStorageDiagnosticItem[] = [];

    for (const binding of uniqueBindings) {
      const graphFsPath = resolveGraphBindingFilePath(rootFsPath, binding.file);
      const classUri = vscode.Uri.file(graphFsPath);
      const loaded = await this.tryReadBoundClassFile(classUri);
      const filePath = classUri.fsPath;

      if (loaded.status === GraphPanel.BOUND_CLASS_READ_RESULT_LOADED) {
        loadedClasses.push(loaded.classItem);
        diagnostics.push({
          classId: binding.classId,
          bindingFile: binding.file,
          filePath,
          source: 'binding',
          existsOnDisk: true,
          lastCheckedAt: this.classStorageStatusUpdatedAt,
          status: 'ok',
        });
        continue;
      }

      const embedded = embeddedById.get(binding.classId);
      if (embedded) {
        loadedClasses.push(embedded);
      }

      if (loaded.status === GraphPanel.BOUND_CLASS_READ_RESULT_MISSING) {
        missingBindings.push(binding);
        diagnostics.push({
          classId: binding.classId,
          bindingFile: binding.file,
          filePath,
          source: 'binding',
          existsOnDisk: false,
          lastCheckedAt: this.classStorageStatusUpdatedAt,
          status: embedded ? 'fallbackEmbedded' : 'missing',
          ...(embedded ? { reason: 'Sidecar missing, loaded embedded snapshot' } : { reason: 'Sidecar file is missing' }),
        });
      } else {
        failedBindings.push({ binding, reason: loaded.reason });
        diagnostics.push({
          classId: binding.classId,
          bindingFile: binding.file,
          filePath,
          source: 'binding',
          existsOnDisk: false,
          lastCheckedAt: this.classStorageStatusUpdatedAt,
          status: embedded ? 'fallbackEmbedded' : 'failed',
          reason: loaded.reason,
        });
      }
    }

    if (missingBindings.length > 0 || failedBindings.length > 0) {
      const missingCount = missingBindings.length;
      const failedCount = failedBindings.length;
      this.outputChannel.appendLine(
        `[MultiCode] Class sidecar: missing=${missingCount}, failed=${failedCount}`
      );
      for (const binding of missingBindings) {
        this.outputChannel.appendLine(`[MultiCode]   missing class ${binding.classId}: ${binding.file ?? '—'}`);
      }
      for (const entry of failedBindings) {
        this.outputChannel.appendLine(
          `[MultiCode]   failed class ${entry.binding.classId}: ${entry.binding.file ?? '—'} (${entry.reason})`
        );
      }
      this.postToast(
        'warning',
        missingCount + failedCount > 0
          ? `Часть классов не загружена из sidecar (missing=${missingCount}, failed=${failedCount}).`
          : 'Некоторые классы не удалось загрузить из sidecar.'
      );
    }

    this.graphState = {
      ...this.graphState,
      classes: loadedClasses,
      classBindings: uniqueBindings,
      dirty: false,
    };

    const diagnosticsByClassId = new Map<string, ClassStorageDiagnosticItem>();
    for (const item of diagnostics) {
      diagnosticsByClassId.set(item.classId, item);
    }

    for (const rawClass of loadedClasses) {
      if (!isRecord(rawClass)) {
        continue;
      }
      const classId = typeof rawClass.id === 'string' ? rawClass.id.trim() : '';
      if (!classId || diagnosticsByClassId.has(classId)) {
        continue;
      }
      diagnosticsByClassId.set(classId, {
        classId,
        source: 'inferred',
        status: 'unbound',
      });
    }

    this.replaceClassStorageDiagnostics(Array.from(diagnosticsByClassId.values()));
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

      const exportMode = this.readGraphExportMode();
      const snapshotBase: GraphState = { ...this.graphState, id: effectiveBinding.binding.graphId, dirty: false };
      let snapshotForWrite: GraphState = snapshotBase;

      const storageMode = this.readClassStorageMode();
      if (storageMode === 'sidecar') {
        const rawClasses = Array.isArray(this.graphState.classes) ? this.graphState.classes : [];
        const parsedClasses = blueprintClassSchema.array().safeParse(rawClasses);

        const existingBindings = Array.isArray(this.graphState.classBindings)
          ? (this.graphState.classBindings as unknown as MulticodeClassBinding[])
              .map((binding) => {
                const classId = typeof binding.classId === 'string' ? binding.classId.trim() : '';
                if (!classId) {
                  return null;
                }
                const rawFile = typeof binding.file === 'string' ? binding.file.trim() : '';
                const file = rawFile || this.makeDefaultClassBindingFileRelativePath(classId, config.folder);
                return { classId, file };
              })
              .filter((binding): binding is NormalizedClassBinding => binding !== null)
          : [];

        let bindingsToPersist: NormalizedClassBinding[] = existingBindings;
        const classesForSidecar: BlueprintClassSidecar[] = parsedClasses.success ? parsedClasses.data : [];

        if (classesForSidecar.length > 0) {
          bindingsToPersist = this.buildCanonicalClassBindings(classesForSidecar, config.folder);
        } else if (this.lastPersistedClassIdSignature.length > 0) {
          // Явный сценарий "удалить все классы": ранее классы были, теперь список пуст.
          bindingsToPersist = [];
        } else if (existingBindings.length > 0) {
          // Если классы не загружены (например, missing sidecar), не стираем bindings по автосейву.
          bindingsToPersist = existingBindings;
        } else {
          bindingsToPersist = [];
        }

        let sidecarWriteOk = true;
        const failures: Array<{ classId: string; file: string; reason: string }> = [];
        const successfulClassIds = new Set<string>();

        if (classesForSidecar.length > 0) {
          const classById = new Map<string, BlueprintClassSidecar>();
          for (const classItem of classesForSidecar) {
            classById.set(classItem.id, classItem);
          }

          for (const binding of bindingsToPersist) {
            const classItem = classById.get(binding.classId);
            const bindingFile = binding.file?.trim() || '';
            if (!classItem || !bindingFile) {
              continue;
            }

            try {
              const classFsPath = resolveGraphBindingFilePath(effectiveBinding.rootFsPath, bindingFile);
              const classUri = vscode.Uri.file(classFsPath);
              const classDir = vscode.Uri.file(path.dirname(classUri.fsPath));
              await vscode.workspace.fs.createDirectory(classDir);

              const payload = serializeClassSidecar(classItem);
              const data = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
              await vscode.workspace.fs.writeFile(classUri, data);
              successfulClassIds.add(binding.classId);
            } catch (error) {
              sidecarWriteOk = false;
              const reason = error instanceof Error ? error.message : 'Unknown error';
              failures.push({ classId: binding.classId, file: bindingFile, reason });
            }
          }
        }

        if (failures.length > 0) {
          this.outputChannel.appendLine(`[MultiCode] Не удалось сохранить class sidecar файлов: ${failures.length}`);
          for (const failure of failures) {
            this.outputChannel.appendLine(
              `[MultiCode]   classId=${failure.classId}, file=${failure.file}, reason=${failure.reason}`
            );
          }
        }

        const failureByClassId = new Map<string, { file: string; reason: string }>();
        for (const failure of failures) {
          failureByClassId.set(failure.classId, failure);
        }

        const diagnostics: ClassStorageDiagnosticItem[] = [];
        for (const binding of bindingsToPersist) {
          const filePath = resolveGraphBindingFilePath(effectiveBinding.rootFsPath, binding.file);
          const failure = failureByClassId.get(binding.classId);
          if (failure) {
            diagnostics.push({
              classId: binding.classId,
              bindingFile: binding.file,
              filePath,
              source: 'binding',
              existsOnDisk: false,
              lastCheckedAt: this.classStorageStatusUpdatedAt,
              status: 'fallbackEmbedded',
              reason: failure.reason,
            });
            continue;
          }
          if (successfulClassIds.has(binding.classId)) {
            diagnostics.push({
              classId: binding.classId,
              bindingFile: binding.file,
              filePath,
              source: 'binding',
              existsOnDisk: true,
              lastCheckedAt: this.classStorageStatusUpdatedAt,
              status: 'ok',
            });
            continue;
          }
          diagnostics.push({
            classId: binding.classId,
            bindingFile: binding.file,
            filePath,
            source: 'binding',
            existsOnDisk: fs.existsSync(filePath),
            lastCheckedAt: this.classStorageStatusUpdatedAt,
            status: 'unbound',
          });
        }
        this.replaceClassStorageDiagnostics(diagnostics);

        snapshotForWrite = {
          ...snapshotBase,
          classBindings: bindingsToPersist,
          classes: sidecarWriteOk && classesForSidecar.length > 0 ? [] : snapshotBase.classes,
        };
      } else {
        const diagnostics: ClassStorageDiagnosticItem[] = [];
        for (const rawClass of Array.isArray(this.graphState.classes) ? this.graphState.classes : []) {
          if (!isRecord(rawClass)) {
            continue;
          }
          const classId = typeof rawClass.id === 'string' ? rawClass.id.trim() : '';
          if (!classId) {
            continue;
          }
          diagnostics.push({
            classId,
            source: 'embedded',
            status: 'unbound',
          });
        }
        this.replaceClassStorageDiagnostics(diagnostics);
      }

      const payload = serializeGraphState(snapshotForWrite, { mode: exportMode });
      const data = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
      await vscode.workspace.fs.writeFile(effectiveBinding.graphUri, data);

      if (storageMode === 'sidecar') {
        const classesSignature = this.computeClassIdSignature(this.graphState.classes);
        if (Array.isArray(this.graphState.classes) && (this.graphState.classes?.length ?? 0) > 0) {
          this.lastPersistedClassIdSignature = classesSignature;
        } else if (this.lastPersistedClassIdSignature.length > 0 && classesSignature.length === 0) {
          this.lastPersistedClassIdSignature = '';
        }
      } else {
        this.lastPersistedClassIdSignature = this.computeClassIdSignature(this.graphState.classes);
      }
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

  private async tryReadBoundClassFile(
    uri: vscode.Uri
  ): Promise<
    | { status: typeof GraphPanel.BOUND_CLASS_READ_RESULT_LOADED; classItem: BlueprintClassSidecar }
    | { status: typeof GraphPanel.BOUND_CLASS_READ_RESULT_MISSING }
    | { status: typeof GraphPanel.BOUND_CLASS_READ_RESULT_FAILED; reason: string }
  > {
    try {
      const raw = await vscode.workspace.fs.readFile(uri);
      const parsed = JSON.parse(Buffer.from(raw).toString('utf8'));
      return {
        status: GraphPanel.BOUND_CLASS_READ_RESULT_LOADED,
        classItem: deserializeClassSidecar(parsed),
      };
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
        return { status: GraphPanel.BOUND_CLASS_READ_RESULT_MISSING };
      }
      if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'FileNotFound') {
        return { status: GraphPanel.BOUND_CLASS_READ_RESULT_MISSING };
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { status: GraphPanel.BOUND_CLASS_READ_RESULT_FAILED, reason: message };
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
        overflow: hidden;
      }
      #root {
        height: 100vh;
        min-height: 0;
        overflow: hidden;
      }
      .app-shell {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--mc-body-bg);
        color: var(--mc-body-text);
        min-height: 0;
      }
      * {
        scrollbar-width: thin;
        scrollbar-color: var(--mc-panel-title) rgba(17, 17, 27, 0.65);
      }
      *::-webkit-scrollbar {
        width: 10px;
        height: 10px;
      }
      *::-webkit-scrollbar-track {
        background: rgba(17, 17, 27, 0.68);
      }
      *::-webkit-scrollbar-thumb {
        background: linear-gradient(180deg, rgba(137, 180, 250, 0.75), rgba(108, 112, 134, 0.92));
        border-radius: 999px;
        border: 2px solid rgba(17, 17, 27, 0.68);
      }
      *::-webkit-scrollbar-thumb:hover {
        background: linear-gradient(180deg, rgba(180, 190, 254, 0.85), rgba(137, 180, 250, 0.95));
      }
      .toolbar {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 12px 16px 10px;
        background: linear-gradient(135deg, var(--mc-toolbar-from), var(--mc-toolbar-to));
        border-bottom: 1px solid var(--mc-toolbar-border);
        box-shadow: var(--mc-shadow);
      }
      .toolbar-main {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        flex-wrap: wrap;
      }
      .toolbar-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 220px;
        flex: 1;
      }
      .toolbar-title-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }
      .toolbar-title-stack {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
      }
      .toolbar-title {
        font-size: 16px;
        font-weight: 700;
        white-space: normal;
        line-height: 1.2;
      }
      .toolbar-subtitle {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        font-size: 11px;
        color: var(--mc-muted);
      }
      .toolbar-bound-file {
        display: inline-flex;
        align-items: center;
        font-size: 11px;
        color: var(--mc-accent);
        cursor: default;
      }
      .toolbar-bound-file--none {
        color: var(--mc-muted);
        opacity: 0.7;
        font-style: italic;
      }
      .toolbar-document-status {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        border-radius: 999px;
        font-size: 11px;
        border: 1px solid var(--mc-surface-border);
        background: var(--mc-surface);
        white-space: nowrap;
      }
      .toolbar-document-status--ok {
        border-color: var(--mc-badge-ok-border);
        color: var(--mc-badge-ok-text);
      }
      .toolbar-document-status--warn {
        border-color: var(--mc-badge-warn-border);
        color: var(--mc-badge-warn-text);
      }
      .toolbar-main-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 6px;
        align-items: center;
      }
      .toolbar-context {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        min-width: 0;
        flex-wrap: wrap;
      }
      .toolbar-context-path {
        font-size: 12px;
        color: var(--mc-muted);
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .toolbar-context-chips {
        display: flex;
        gap: 6px;
        align-items: center;
        flex-wrap: wrap;
      }
      .toolbar-context-chip {
        display: inline-flex;
        align-items: center;
        font-size: 11px;
        padding: 4px 8px;
        border-radius: 999px;
        border: 1px solid var(--mc-surface-border);
        background: var(--mc-surface);
        color: var(--mc-muted);
      }
      .toolbar-context-chip--ok {
        border-color: var(--mc-badge-ok-border);
        color: var(--mc-badge-ok-text);
      }
      .toolbar-context-chip--warn {
        border-color: var(--mc-badge-warn-border);
        color: var(--mc-badge-warn-text);
      }
      .toolbar-context-chip--error {
        border-color: color-mix(in srgb, var(--mc-toast-error) 55%, #ef4444);
        color: #fecaca;
      }
      .toolbar-context-chip--feature {
        border-color: var(--mc-accent);
        color: var(--mc-accent);
      }
      .toolbar-menu-popup {
        min-width: 320px;
        max-width: 440px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 12px;
        border: 1px solid var(--mc-surface-border);
        border-radius: 12px;
        background: color-mix(in srgb, var(--mc-surface) 92%, #0b1020);
        box-shadow: var(--mc-shadow);
      }
      .toolbar-menu-popup--overflow {
        max-height: min(80vh, 760px);
        overflow-y: auto;
      }
      .toolbar-menu-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .toolbar-menu-section + .toolbar-menu-section {
        padding-top: 10px;
        border-top: 1px solid var(--mc-surface-border);
      }
      .toolbar-menu-section-title {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--mc-muted);
      }
      .toolbar-menu-field-row,
      .toolbar-menu-button-row {
        display: flex;
        gap: 6px;
        align-items: center;
        flex-wrap: wrap;
      }
      .toolbar-menu-field-row > .toolbar-select {
        flex: 1;
        min-width: 0;
      }
      .toolbar-menu-note {
        font-size: 11px;
        color: var(--mc-muted);
        line-height: 1.4;
      }
      .toolbar-working-file-menu-search {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 4px;
        align-items: center;
      }
      .toolbar .toolbar-working-file-menu-search-input {
        min-width: 0;
        background: var(--mc-button-bg);
        color: var(--mc-button-text);
        border: 1px solid var(--mc-button-border);
        border-radius: 6px;
        padding: 6px 8px;
        font-size: 12px;
        outline: none;
      }
      .toolbar .toolbar-working-file-menu-search-input:focus {
        border-color: var(--mc-panel-title);
      }
      .toolbar .toolbar-working-file-menu-search-clear {
        border: none !important;
        background: transparent !important;
        color: var(--mc-muted) !important;
        padding: 6px !important;
        font-size: 11px;
        min-width: 24px;
      }
      .toolbar .toolbar-working-file-menu-search-clear:hover {
        color: var(--mc-body-text) !important;
        background: var(--mc-surface-strong) !important;
      }
      .toolbar-working-file-menu-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
        max-height: 240px;
        overflow: auto;
      }
      .toolbar-working-file-menu-empty {
        color: var(--mc-muted);
        font-size: 12px;
        padding: 8px;
      }
      .toolbar-working-file-menu-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 6px;
        align-items: center;
      }
      .toolbar .toolbar-working-file-menu-item {
        width: 100%;
        text-align: left;
        background: transparent !important;
        border: none !important;
        border-radius: 6px;
        color: var(--mc-body-text) !important;
        font-size: 12px;
        padding: 6px 8px !important;
        cursor: pointer;
      }
      .toolbar .toolbar-working-file-menu-item:hover {
        color: var(--mc-body-text) !important;
        background: var(--mc-surface-strong) !important;
      }
      .toolbar .toolbar-working-file-menu-open-button {
        border: none !important;
        background: transparent !important;
        color: var(--mc-body-text) !important;
        padding: 6px 8px !important;
        text-align: left;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .toolbar .toolbar-working-file-menu-open-button:hover {
        background: var(--mc-surface-strong) !important;
      }
      .toolbar .toolbar-working-file-menu-remove-button {
        border: none !important;
        background: transparent !important;
        color: var(--mc-muted) !important;
        padding: 6px !important;
        font-size: 11px;
        min-width: 24px;
      }
      .toolbar .toolbar-working-file-menu-remove-button:hover {
        color: var(--mc-body-text) !important;
        background: var(--mc-surface-strong) !important;
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
      .toolbar button.btn-primary {
        background: linear-gradient(135deg, rgba(59, 130, 246, 0.85), rgba(37, 99, 235, 0.92));
        border-color: rgba(96, 165, 250, 0.7);
        color: #eff6ff;
      }
      .toolbar button.btn-primary:hover {
        border-color: rgba(147, 197, 253, 0.8);
      }
      .toolbar button.btn-operational {
        background: linear-gradient(135deg, rgba(16, 185, 129, 0.75), rgba(5, 150, 105, 0.88));
        border-color: rgba(52, 211, 153, 0.65);
        color: #ecfdf5;
      }
      .toolbar button.btn-operational:hover {
        border-color: rgba(110, 231, 183, 0.75);
      }
      .toolbar button.btn-quiet,
      .toolbar button.toolbar-menu-trigger {
        background: var(--mc-button-bg);
        color: var(--mc-button-text);
      }
      .toolbar-action-label {
        display: inline-flex;
        align-items: center;
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
        min-width: 0;
        min-height: 0;
      }
      .workspace.with-sidebar {
        display: grid;
        grid-template-columns: minmax(0, 1fr) clamp(340px, 28vw, 420px);
      }
      .workspace.with-drawer {
        position: relative;
      }
      .canvas-wrapper {
        background: var(--mc-surface-strong);
        flex: 1;
        position: relative;
        overflow: hidden;
        min-width: 0;
        min-height: 0;
      }
      .graph-canvas {
        width: 100%;
        height: 100%;
        position: relative;
      }
      .side-panel {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 10px;
        background: linear-gradient(180deg, rgba(10, 22, 52, 0.96) 0%, rgba(8, 18, 42, 0.98) 100%);
        border-left: 1px solid var(--mc-surface-border);
        overflow-y: auto;
        overflow-x: hidden;
        max-height: 100%;
        min-width: 0;
        min-height: 0;
        scrollbar-gutter: stable;
      }
      .side-panel--drawer {
        position: absolute;
        top: 10px;
        right: 10px;
        bottom: 10px;
        width: min(360px, calc(100vw - 36px));
        z-index: 30;
        border-radius: 16px;
        box-shadow: 0 18px 44px rgba(3, 7, 18, 0.5);
      }
      .side-panel-backdrop {
        position: absolute;
        inset: 0;
        border: 0;
        background: rgba(2, 6, 23, 0.45);
        backdrop-filter: blur(2px);
        z-index: 20;
        cursor: pointer;
      }
      .side-panel__drawer-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        padding-bottom: 4px;
      }
      .side-panel__drawer-title {
        font-size: 13px;
        font-weight: 700;
        color: var(--mc-panel-title);
      }
      .side-panel__drawer-close {
        border: 1px solid var(--mc-surface-border);
        background: var(--mc-surface);
        color: var(--mc-muted);
        border-radius: 8px;
        padding: 6px 10px;
        font-size: 11px;
        cursor: pointer;
      }
      .side-panel__drawer-close:hover {
        color: var(--mc-body-text);
        border-color: var(--mc-panel-title);
      }
      .utility-panel {
        display: flex;
        flex-direction: column;
        min-height: 48px;
        background: linear-gradient(180deg, rgba(12, 18, 36, 0.98), rgba(8, 13, 28, 1));
        border-top: 1px solid var(--mc-surface-border);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
      }
      .utility-panel__tabs {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 10px;
        min-height: 48px;
        overflow-x: auto;
      }
      .utility-panel__tab,
      .utility-panel__collapse {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border: 1px solid var(--mc-surface-border);
        background: var(--mc-surface);
        color: var(--mc-muted);
        border-radius: 10px;
        padding: 7px 12px;
        font-size: 12px;
        cursor: pointer;
        white-space: nowrap;
      }
      .utility-panel__tab.is-active {
        border-color: var(--mc-panel-title);
        color: var(--mc-body-text);
        background: color-mix(in srgb, var(--mc-surface) 70%, rgba(137, 180, 250, 0.14));
      }
      .utility-panel__badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 18px;
        padding: 1px 6px;
        border-radius: 999px;
        background: rgba(137, 180, 250, 0.14);
        color: var(--mc-panel-title);
        font-size: 11px;
        font-weight: 700;
      }
      .utility-panel__spacer {
        flex: 1;
      }
      .utility-panel__body {
        display: flex;
        min-height: 240px;
        height: 280px;
        max-height: 38vh;
        padding: 10px;
        border-top: 1px solid var(--mc-surface-border);
        overflow: hidden;
      }
      .utility-panel__fill {
        flex: 1 1 auto;
        min-height: 0;
        min-width: 0;
        overflow: hidden;
      }
      .utility-panel__fill > * {
        height: 100%;
      }
      .utility-empty-state {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 120px;
        color: var(--mc-muted);
        font-size: 12px;
        text-align: center;
        padding: 16px;
      }
      .utility-console,
      .utility-list-panel {
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-height: 0;
        width: 100%;
      }
      .utility-console__header,
      .utility-list-panel__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
      }
      .utility-console__title,
      .utility-list-panel__title {
        font-size: 13px;
        font-weight: 700;
        color: var(--mc-panel-title);
      }
      .utility-list-panel__meta,
      .utility-console__source,
      .utility-console__time {
        font-size: 11px;
        color: var(--mc-muted);
      }
      .utility-console__clear {
        border: 1px solid var(--mc-surface-border);
        background: transparent;
        color: var(--mc-muted);
        border-radius: 8px;
        padding: 6px 10px;
        font-size: 11px;
        cursor: pointer;
      }
      .utility-console__list,
      .utility-list-panel__list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-height: 0;
        overflow: auto;
      }
      .utility-console__entry,
      .utility-list-panel__item {
        display: grid;
        gap: 8px;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid var(--mc-surface-border);
        background: var(--mc-surface);
      }
      .utility-console__entry {
        grid-template-columns: auto auto minmax(0, 1fr);
        align-items: start;
      }
      .utility-console__entry--warn {
        border-color: var(--mc-badge-warn-border);
      }
      .utility-console__entry--error {
        border-color: color-mix(in srgb, var(--mc-toast-error) 45%, #ef4444);
      }
      .utility-console__message,
      .utility-list-panel__item-meta {
        min-width: 0;
        word-break: break-word;
        font-size: 12px;
      }
      .utility-list-panel__item-title {
        font-size: 13px;
        font-weight: 700;
        color: var(--mc-body-text);
      }
      .app-shell--compact .toolbar-main-actions {
        gap: 4px;
      }
      .app-shell--compact .toolbar-action-label--secondary {
        display: none;
      }
      .app-shell--compact .toolbar button.btn-quiet {
        padding-inline: 10px;
      }
      .app-shell--compact .toolbar-context {
        gap: 8px;
      }
      .app-shell--compact .toolbar-select,
      .app-shell--compact .toolbar select {
        min-width: 0;
      }
      .app-shell--narrow .toolbar {
        gap: 8px;
        padding: 10px 12px 8px;
      }
      .app-shell--narrow .toolbar-main {
        gap: 10px;
      }
      .app-shell--narrow .toolbar-main-actions {
        width: 100%;
        justify-content: flex-start;
      }
      .app-shell--narrow .toolbar-context {
        flex-direction: column;
        align-items: flex-start;
      }
      .app-shell--narrow .toolbar-context-path,
      .app-shell--narrow .toolbar-context-chips {
        width: 100%;
      }
      .app-shell--narrow .toolbar-action-label--secondary {
        display: none;
      }
      .app-shell--narrow .side-panel--drawer {
        top: 6px;
        right: 6px;
        bottom: 6px;
        width: min(340px, calc(100vw - 20px));
      }
      .app-shell--narrow .utility-panel__body {
        height: 240px;
        max-height: 34vh;
      }
      .panel {
        background: var(--mc-surface);
        border: 1px solid var(--mc-surface-border);
        border-radius: 12px;
        padding: 12px;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04), var(--mc-shadow);
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-height: 0;
        overflow: hidden;
      }
      .panel-title {
        font-weight: 700;
        margin-bottom: 10px;
        color: var(--mc-panel-title);
        line-height: 1.25;
      }
      .panel-title-with-action {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }
      .panel-title-action {
        border: 1px solid var(--mc-surface-border);
        background: var(--mc-surface);
        color: var(--mc-muted);
        border-radius: 8px;
        padding: 4px 8px;
        font-size: 11px;
        cursor: pointer;
      }
      .panel-title-action:hover {
        color: var(--mc-body-text);
        border-color: var(--mc-panel-title);
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
        line-height: 1.35;
        word-break: break-word;
      }
      .panel-note {
        margin-top: 10px;
        font-size: 12px;
        line-height: 1.5;
        color: var(--mc-muted);
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
    })}; const initialPackageSettings = ${JSON.stringify({
      enableUePackage: this.enableUePackage,
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

