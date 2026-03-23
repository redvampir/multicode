import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from './ErrorBoundary';
import {
  createDefaultGraphState,
  type GraphNodeType,
  type GraphDisplayLanguage,
  type GraphState
} from '../shared/graphState';
import type { ValidationIssue, ValidationResult } from '../shared/validator';
import { getTranslation, type TranslationKey } from '../shared/translations';
import { GraphEditor } from './GraphEditor';
import { BlueprintEditor } from './BlueprintEditor';
import { EnhancedCodePreviewPanel } from './EnhancedCodePreviewPanel';
import { DependencyViewPanel } from './DependencyViewPanel';
import type { SourceIntegration, SymbolDescriptor } from '../shared/externalSymbols';
import {
  BlueprintGraphState,
  BlueprintNodeType,
  migrateToBlueprintFormat,
  migrateFromBlueprintFormat,
} from '../shared/blueprintTypes';
import { findNonOverlappingPosition } from './variableNodeBinding';
import { createExternalSymbolCallNode, isTransferableExternalSymbol } from './externalSymbolNodeFactory';
import {
  createGraphStore,
  layoutBounds,
  normalizeLayoutSettings,
  type GraphStoreHook,
  type LayoutSettings
} from './store';
import {
  getThemeTokens,
  resolveEffectiveTheme,
  type EffectiveTheme,
  type ThemeTokens
} from './theme';
import {
  type ClassNodesConfig,
  type ClassStorageStatus,
  parseExternalIpcResponse,
  parseExtensionMessage,
  parseThemeMessage,
  webviewToExtensionMessageSchema,
  type ExternalIpcRequest,
  type ExternalIpcResponse,
  type GraphMutationPayload,
  type ThemeMessage,
  type TranslationDirection,
  type WebviewToExtensionMessage
} from '../shared/messages';
import HelpPanel from './HelpPanel';
import { globalRegistry } from '../shared/packageLoader';
import type { BundledPackageSettings } from '../shared/bundledPackages';
import {
  buildValidationIssues,
  filterValidationIssuesBySelection,
  resolveGraphNodeDisplayName,
} from './inspectorUtils';

// Feature toggle: 'blueprint' = Visual Flow (новый), 'cytoscape' = Cytoscape (старый)
type EditorMode = 'blueprint' | 'cytoscape' | 'dependency';
const EDITOR_MODE_KEY = 'multicode.editorMode';
const UI_SCALE_KEY = 'multicode.uiScale';

type CppStandard = 'cpp14' | 'cpp17' | 'cpp20' | 'cpp23';
type CodegenOutputProfile = 'clean' | 'learn' | 'debug' | 'recovery';
type CodegenEntrypointMode = 'auto' | 'executable' | 'library';
type ToolbarTargetPlatform = Extract<GraphState['language'], 'cpp' | 'ue'>;
type ShellMode = 'wide' | 'compact' | 'narrow';
type UtilityTabId = 'problems' | 'generated' | 'console' | 'packages' | 'dependencies';
type UtilityLogEntry = {
  id: number;
  level: 'info' | 'warn' | 'error';
  message: string;
  source: 'extension' | 'webview';
  timestamp: string;
};

const getInitialEditorMode = (): EditorMode => {
  try {
    const saved = localStorage.getItem(EDITOR_MODE_KEY);
    if (saved === 'blueprint' || saved === 'cytoscape' || saved === 'dependency') {
      return saved;
    }
  } catch {
    // Ignore localStorage errors
  }
  // По умолчанию используем новый Visual Flow редактор
  return 'blueprint';
};

const getInitialUiScale = (): number => {
  try {
    const raw = localStorage.getItem(UI_SCALE_KEY);
    if (!raw) {
      return 1;
    }
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0.6 && parsed <= 1.4) {
      return parsed;
    }
  } catch {
    // Ignore localStorage errors
  }
  return 1;
};

type ToastKind = 'info' | 'success' | 'warning' | 'error';

type Toast = { id: number; kind: ToastKind; message: string };

const createDefaultClassStorageStatus = (): ClassStorageStatus => ({
  mode: 'embedded',
  isBoundSource: false,
  graphFilePath: null,
  classesDirPath: null,
  bindingsTotal: 0,
  classesLoaded: 0,
  missing: 0,
  failed: 0,
  fallbackEmbedded: 0,
  unbound: 0,
  dirty: 0,
  conflict: 0,
  updatedAt: new Date().toISOString(),
  classItems: [],
});

const createDefaultClassNodesConfig = (): ClassNodesConfig => ({
  advancedEnabled: false,
});

const getViewportWidth = (): number => {
  if (typeof window === 'undefined' || !Number.isFinite(window.innerWidth) || window.innerWidth <= 0) {
    return 1440;
  }
  return window.innerWidth;
};

const getShellMode = (viewportWidth: number): ShellMode => {
  if (viewportWidth < 1100) {
    return 'narrow';
  }
  if (viewportWidth < 1280) {
    return 'compact';
  }
  return 'wide';
};

type PersistedState = { graph?: GraphState; locale?: GraphDisplayLanguage; layout?: LayoutSettings };

const layoutStorageKey = 'multicode.layout';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isEditorMode = (value: string): value is EditorMode =>
  value === 'blueprint' || value === 'cytoscape' || value === 'dependency';

const isGraphDisplayLanguage = (value: unknown): value is GraphDisplayLanguage =>
  value === 'ru' || value === 'en';

const isToolbarTargetPlatform = (value: unknown): value is ToolbarTargetPlatform =>
  value === 'cpp' || value === 'ue';

const isTranslationDirection = (value: string): value is TranslationDirection =>
  value === 'ru-en' || value === 'en-ru';

const isCodegenOutputProfile = (value: string): value is CodegenOutputProfile =>
  value === 'clean' || value === 'learn' || value === 'debug' || value === 'recovery';

const isCodegenEntrypointMode = (value: string): value is CodegenEntrypointMode =>
  value === 'auto' || value === 'executable' || value === 'library';

const isGraphNodeType = (value: string): value is GraphNodeType =>
  value === 'Start' ||
  value === 'Function' ||
  value === 'End' ||
  value === 'Variable' ||
  value === 'Custom';

const isLayoutRankDir = (value: unknown): value is LayoutSettings['rankDir'] =>
  value === 'LR' || value === 'RL' || value === 'TB' || value === 'BT';

const parsePartialLayoutSettings = (value: unknown): Partial<LayoutSettings> => {
  if (!isRecord(value)) {
    return {};
  }

  const parsed: Partial<LayoutSettings> = {};
  if (value.algorithm === 'dagre' || value.algorithm === 'klay') {
    parsed.algorithm = value.algorithm;
  }
  if (isLayoutRankDir(value.rankDir)) {
    parsed.rankDir = value.rankDir;
  }
  if (typeof value.nodeSep === 'number') {
    parsed.nodeSep = value.nodeSep;
  }
  if (typeof value.edgeSep === 'number') {
    parsed.edgeSep = value.edgeSep;
  }
  if (typeof value.spacing === 'number') {
    parsed.spacing = value.spacing;
  }

  return parsed;
};

const normalizeThemeMessage = (value: unknown): ThemeMessage => {
  const parsed = parseThemeMessage(value);
  if (parsed.success) {
    return parsed.data;
  }
  return { preference: 'auto', hostTheme: 'dark' };
};

declare const initialGraphState: GraphState | undefined;
declare const initialTheme: ThemeMessage | undefined;
const vscode = acquireVsCodeApi<PersistedState>();

const readLayoutFromLocalStorage = (): LayoutSettings | undefined => {
  try {
    const cached = localStorage.getItem(layoutStorageKey);
    if (!cached) {
      return undefined;
    }
    const parsed = JSON.parse(cached);
    return normalizeLayoutSettings(parsePartialLayoutSettings(parsed));
  } catch (error) {
    console.warn('Не удалось загрузить настройки лэйаута из localStorage', error);
    return undefined;
  }
};

const persistedState = vscode.getState();
const persistedGraph = persistedState?.graph;
const persistedLayout = persistedState?.layout;
const bootGraph: GraphState = persistedGraph ?? initialGraphState ?? createDefaultGraphState();
const bootLayout: LayoutSettings = persistedLayout
  ? normalizeLayoutSettings(persistedLayout)
  : readLayoutFromLocalStorage() ?? normalizeLayoutSettings();
const persistedLocale = isGraphDisplayLanguage(persistedState?.locale)
  ? persistedState.locale
  : undefined;
const bootLocale: GraphDisplayLanguage =
  persistedLocale ??
  bootGraph.displayLanguage ??
  'ru';
const useGraphStore: GraphStoreHook = createGraphStore(bootGraph, bootLayout);
const initialThemeMessage: ThemeMessage = normalizeThemeMessage(initialTheme);
const bootPackageSettings: Partial<BundledPackageSettings> = (globalThis as { initialPackageSettings?: Partial<BundledPackageSettings> }).initialPackageSettings ?? {};

const applyUiTheme = (tokens: ThemeTokens, effective: EffectiveTheme): void => {
  const style = document.documentElement.style;
  style.setProperty('--mc-color-scheme', effective);
  style.setProperty('--mc-body-bg', tokens.ui.bodyBackground);
  style.setProperty('--mc-body-text', tokens.ui.bodyText);
  style.setProperty('--mc-muted', tokens.ui.mutedText);
  style.setProperty('--mc-toolbar-from', tokens.ui.toolbarFrom);
  style.setProperty('--mc-toolbar-to', tokens.ui.toolbarTo);
  style.setProperty('--mc-toolbar-border', tokens.ui.toolbarBorder);
  style.setProperty('--mc-surface', tokens.ui.surface);
  style.setProperty('--mc-surface-strong', tokens.ui.surfaceStrong);
  style.setProperty('--mc-surface-border', tokens.ui.surfaceBorder);
  style.setProperty('--mc-panel-title', tokens.ui.panelTitle);
  style.setProperty('--mc-badge-ok-bg', tokens.ui.badgeOkBg);
  style.setProperty('--mc-badge-ok-text', tokens.ui.badgeOkText);
  style.setProperty('--mc-badge-ok-border', tokens.ui.badgeOkBorder);
  style.setProperty('--mc-badge-warn-bg', tokens.ui.badgeWarnBg);
  style.setProperty('--mc-badge-warn-text', tokens.ui.badgeWarnText);
  style.setProperty('--mc-badge-warn-border', tokens.ui.badgeWarnBorder);
  style.setProperty('--mc-toast-info', tokens.ui.toastInfo);
  style.setProperty('--mc-toast-success', tokens.ui.toastSuccess);
  style.setProperty('--mc-toast-warning', tokens.ui.toastWarning);
  style.setProperty('--mc-toast-error', tokens.ui.toastError);
  style.setProperty('--mc-shadow', tokens.ui.shadow);
  style.setProperty('--mc-button-bg', tokens.ui.buttonBg);
  style.setProperty('--mc-button-border', tokens.ui.buttonBorder);
  style.setProperty('--mc-button-text', tokens.ui.buttonText);
  style.setProperty('--mc-button-hover-shadow', tokens.ui.buttonHoverShadow);
};

const formatIssues = (issues: Array<{ message: string }> = []): string =>
  issues.map((issue) => issue.message).join('; ');

const GRAPH_CHANGED_DEBOUNCE_MS = 120;

const buildGraphMutationPayload = (graphState: GraphState): GraphMutationPayload => ({
  graphId: graphState.id,
  nodes: graphState.nodes,
  edges: graphState.edges,
  name: graphState.name,
  language: graphState.language,
  displayLanguage: graphState.displayLanguage,
  variables: graphState.variables,
  functions: graphState.functions,
  classes: graphState.classes,
  ueMacros: graphState.ueMacros,
  integrationBindings: graphState.integrationBindings,
  symbolLocalization: graphState.symbolLocalization,
});

const normalizeFilePath = (filePath: string): string => filePath.replace(/\\/g, '/');
const normalizeFilePathForMatch = (filePath: string): string => normalizeFilePath(filePath).toLowerCase();
const normalizeOptionalFilePath = (filePath: string | null | undefined): string | null =>
  filePath ? normalizeFilePath(filePath) : null;

const normalizeClassStorageStatus = (status: ClassStorageStatus): ClassStorageStatus => ({
  ...status,
  unbound: status.unbound ?? 0,
  dirty: status.dirty ?? 0,
  conflict: status.conflict ?? 0,
  graphFilePath: normalizeOptionalFilePath(status.graphFilePath),
  classesDirPath: normalizeOptionalFilePath(status.classesDirPath),
  classItems: status.classItems.map((item) => ({
    ...item,
    filePath: normalizeOptionalFilePath(item.filePath),
  })),
});

const formatClassStorageBadgeLabel = (
  locale: GraphDisplayLanguage,
  status: ClassStorageStatus,
  sidecarOkCount: number,
): string =>
  status.mode === 'sidecar'
    ? (locale === 'ru'
      ? `Хранение классов: внешние файлы (${sidecarOkCount}/${status.bindingsTotal})`
      : `Class Storage: SIDECAR (${sidecarOkCount}/${status.bindingsTotal})`)
    : (locale === 'ru' ? 'Хранение классов: внутри графа' : 'Class Storage: EMBEDDED');

const formatClassStorageBadgeTitle = (
  locale: GraphDisplayLanguage,
  status: ClassStorageStatus,
  sidecarOkCount: number,
): string => {
  if (status.mode !== 'sidecar') {
    return locale === 'ru'
      ? 'Классы хранятся внутри графового .multicode'
      : 'Classes are stored inside the graph .multicode';
  }

  if (locale === 'ru') {
    return `готово=${sidecarOkCount}, отсутствует=${status.missing}, ошибки=${status.failed}, встроено=${status.fallbackEmbedded}`;
  }

  return `ok=${sidecarOkCount}, missing=${status.missing}, failed=${status.failed}, fallback=${status.fallbackEmbedded}`;
};

const formatClassNodesBadgeLabel = (
  locale: GraphDisplayLanguage,
  classNodesAdvancedEnabled: boolean,
): string =>
  locale === 'ru'
    ? `Узлы классов: ${classNodesAdvancedEnabled ? 'расширенные' : 'базовые'}`
    : `Class Nodes: ${classNodesAdvancedEnabled ? 'ADVANCED' : 'CORE'}`;

const formatClassStorageModeValue = (
  locale: GraphDisplayLanguage,
  status: ClassStorageStatus,
): string =>
  status.mode === 'sidecar'
    ? (locale === 'ru' ? 'внешние файлы' : 'SIDECAR')
    : (locale === 'ru' ? 'внутри графа' : 'EMBEDDED');

const formatClassStorageStatsValue = (
  locale: GraphDisplayLanguage,
  status: ClassStorageStatus,
  sidecarOkCount: number,
): string => {
  if (status.mode !== 'sidecar') {
    return locale === 'ru' ? 'классы встроены в граф' : 'embedded mode';
  }

  if (locale === 'ru') {
    return `готово ${sidecarOkCount} · нет ${status.missing} · ошибки ${status.failed}`;
  }

  return `ok ${sidecarOkCount} · miss ${status.missing} · fail ${status.failed}`;
};

const formatClassNodesValue = (
  locale: GraphDisplayLanguage,
  classNodesAdvancedEnabled: boolean,
): string =>
  locale === 'ru'
    ? (classNodesAdvancedEnabled ? 'расширенные' : 'базовые')
    : (classNodesAdvancedEnabled ? 'ADVANCED' : 'CORE');

const extractFileName = (filePath: string): string => {
  const normalized = normalizeFilePath(filePath);
  const segments = normalized.split('/');
  return segments[segments.length - 1] || filePath;
};

const stripFileExtension = (fileName: string): string => fileName.replace(/\.[^/.]+$/, '');

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

const dedupePaths = (paths: string[]): string[] => {
  const unique = new Set<string>();
  for (const filePath of paths) {
    const trimmed = filePath.trim();
    if (!trimmed) {
      continue;
    }
    unique.add(normalizeFilePath(trimmed));
  }
  return Array.from(unique);
};

const buildFileIntegration = (sourceFilePath: string, consumerFiles: string[]): SourceIntegration => {
  const normalizedPath = normalizeFilePath(sourceFilePath);
  const fileName = extractFileName(normalizedPath);
  const stem = stripFileExtension(fileName);
  const integrationId = `file_${toSafeIdSegment(stem)}_${hashString(normalizedPath.toLowerCase())}`;

  return {
    integrationId,
    attachedFiles: [normalizedPath],
    consumerFiles: dedupePaths(consumerFiles),
    mode: 'explicit',
    kind: 'file',
    displayName: fileName,
    location: {
      type: 'local_file',
      value: normalizedPath,
    },
  };
};

const sendToExtension = (message: WebviewToExtensionMessage): void => {
  console.log('[WEBVIEW DEBUG] sendToExtension called with:', message);
  const parsed = webviewToExtensionMessageSchema.safeParse(message);
  if (!parsed.success) {
    console.error(`Невозможно отправить сообщение в расширение: ${formatIssues(parsed.error.issues)}`);
    console.error('[WEBVIEW DEBUG] Message that failed validation:', message);
    return;
  }

  console.log('[WEBVIEW DEBUG] Message validated and posting to extension:', parsed.data);
  vscode.postMessage(parsed.data);
};

const reportWebviewError = (message: string): void => {
  console.error(message);
  sendToExtension({ type: 'reportWebviewError', payload: { message } });
};

type ToolbarMenuKind = 'files' | 'mode' | 'codegen' | 'view' | 'overflow';

const Toolbar: React.FC<{
  locale: GraphDisplayLanguage;
  onLocaleChange: (locale: GraphDisplayLanguage) => void;
  translate: (key: TranslationKey, fallback: string, replacements?: Record<string, string>) => string;
  onCalculate: () => void;
  onTranslate: () => void;
  translationPending: boolean;
  onCopyGraphId: () => void;
  editorMode: EditorMode;
  onEditorModeChange: (mode: EditorMode) => void;
  onTargetPlatformChange: (language: ToolbarTargetPlatform) => void;
  showCodePreview: boolean;
  onShowCodePreviewChange: (show: boolean) => void;
  onShowHotkeys: () => void;
  onShowHelp: () => void;
  uiScale: number;
  onUiScaleChange: (nextScale: number) => void;
  boundFileName: string | null;
  boundFilePath: string | null;
  classStorageStatus: ClassStorageStatus;
  classNodesAdvancedEnabled: boolean;
  workingFiles: Array<{ fileName: string; filePath: string }>;
  dependencySourceFilePath: string;
  onDependencySourceFileChange: (filePath: string) => void;
  onBindFile: (filePath: string) => void;
  onPickBindFile: () => void;
  onPickDependencyFile: () => void;
  onAddCurrentFileDependency: () => void;
  onAddWorkingFile: () => void;
  onOpenWorkingFile: (filePath: string) => void;
  onRemoveWorkingFile: (filePath: string) => void;
  codegenProfile: CodegenOutputProfile;
  onCodegenProfileChange: (profile: CodegenOutputProfile) => void;
  codegenEntrypointMode: CodegenEntrypointMode;
  onCodegenEntrypointModeChange: (mode: CodegenEntrypointMode) => void;
  shellMode: ShellMode;
  showInspectorToggle: boolean;
  isInspectorOpen: boolean;
  onToggleInspector: () => void;
  validation?: ValidationResult;
}> = ({
  locale,
  onLocaleChange,
  translate,
  onCalculate,
  onTranslate,
  translationPending,
  onCopyGraphId,
  editorMode,
  onEditorModeChange,
  onTargetPlatformChange,
  showCodePreview,
  onShowCodePreviewChange,
  onShowHotkeys,
  onShowHelp,
  uiScale,
  onUiScaleChange,
  boundFileName,
  boundFilePath,
  classStorageStatus,
  classNodesAdvancedEnabled,
  workingFiles,
  dependencySourceFilePath,
  onDependencySourceFileChange,
  onBindFile,
  onPickBindFile,
  onPickDependencyFile,
  onAddCurrentFileDependency,
  onAddWorkingFile,
  onOpenWorkingFile,
  onRemoveWorkingFile,
  codegenProfile,
  onCodegenProfileChange,
  codegenEntrypointMode,
  onCodegenEntrypointModeChange,
  shellMode,
  showInspectorToggle,
  isInspectorOpen,
  onToggleInspector,
  validation,
}) => {
  const graph = useGraphStore((state) => state.graph);
  const [pending, setPending] = useState(false);
  const [activeMenu, setActiveMenu] = useState<{
    kind: ToolbarMenuKind;
    x: number;
    y: number;
  } | null>(null);
  const [workingFilesFilter, setWorkingFilesFilter] = useState('');
  const menuRef = useRef<HTMLDivElement | null>(null);
  const workingFilesSearchRef = useRef<HTMLInputElement | null>(null);
  // Для "▶ Запустить" стандарт фиксирован на C++23 (strict).
  const cppStandard: CppStandard = 'cpp23';
  const sidecarOkCount = classStorageStatus.classItems.filter((item) => item.status === 'ok').length;
  const hasStorageIssues = classStorageStatus.missing > 0 || classStorageStatus.failed > 0;
  const storageBadgeLabel = formatClassStorageBadgeLabel(locale, classStorageStatus, sidecarOkCount);
  const classNodesBadgeLabel = formatClassNodesBadgeLabel(locale, classNodesAdvancedEnabled);
  const showCollapsedMenus = shellMode !== 'wide';

  const flushCurrentGraphState = (): void => {
    const snapshot = useGraphStore.getState().graph;
    sendToExtension({
      type: 'graphChanged',
      payload: buildGraphMutationPayload(snapshot),
    });
  };

  const send = (type: 'requestNewGraph' | 'requestSave' | 'requestLoad' | 'requestGenerate' | 'requestValidate' | 'requestCompileAndRun') => {
    setPending(true);
    if (type === 'requestGenerate' || type === 'requestValidate' || type === 'requestCompileAndRun') {
      flushCurrentGraphState();
    }
    if (type === 'requestCompileAndRun') {
      sendToExtension({ type, payload: { standard: cppStandard } });
    } else {
      sendToExtension({ type });
    }
    setTimeout(() => setPending(false), 2000);
  };

  const filteredWorkingFiles = useMemo(() => {
    const query = workingFilesFilter.trim().toLowerCase();
    if (!query) {
      return workingFiles;
    }
    return workingFiles.filter((file) => (
      file.fileName.toLowerCase().includes(query) || file.filePath.toLowerCase().includes(query)
    ));
  }, [workingFiles, workingFilesFilter]);

  const workingFileOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: Array<{ fileName: string; filePath: string; matchKey: string }> = [];
    for (const file of workingFiles) {
      const matchKey = normalizeFilePathForMatch(file.filePath);
      if (!matchKey || seen.has(matchKey)) {
        continue;
      }
      seen.add(matchKey);
      options.push({ ...file, matchKey });
    }
    return options;
  }, [workingFiles]);

  const workingFileByKey = useMemo(
    () => new Map(workingFileOptions.map((option) => [option.matchKey, option])),
    [workingFileOptions]
  );

  const boundFileKey = boundFilePath ? normalizeFilePathForMatch(boundFilePath) : '';
  const dependencySourceKey = dependencySourceFilePath ? normalizeFilePathForMatch(dependencySourceFilePath) : '';
  const problemCounts = useMemo(() => ({
    errors: validation?.errors.length ?? 0,
    warnings: validation?.warnings.length ?? 0,
  }), [validation]);
  const documentTitle = boundFileName ?? graph.name;
  const documentStatusLabel = graph.dirty
    ? translate('toolbar.unsaved', 'Не сохранено')
    : translate('overview.synced', 'Сохранено');
  const modeLabel = editorMode === 'blueprint'
    ? (locale === 'ru' ? 'Визуальный' : 'Visual')
    : editorMode === 'cytoscape'
      ? (locale === 'ru' ? 'Классический' : 'Classic')
      : (locale === 'ru' ? 'Зависимости' : 'Dependency');
  const codegenChipLabel = `${graph.language.toUpperCase()} · ${codegenProfile}`;
  const problemsLabel = locale === 'ru'
    ? `Проблемы: ${problemCounts.errors}/${problemCounts.warnings}`
    : `Problems: ${problemCounts.errors}/${problemCounts.warnings}`;
  const problemsChipClass = problemCounts.errors > 0
    ? 'toolbar-context-chip toolbar-context-chip--error'
    : problemCounts.warnings > 0
      ? 'toolbar-context-chip toolbar-context-chip--warn'
      : 'toolbar-context-chip toolbar-context-chip--ok';

  const toggleMenu = useCallback((kind: ToolbarMenuKind, event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setActiveMenu((prev) => {
      if (prev?.kind === kind) {
        return null;
      }
      return {
        kind,
        x: rect.left,
        y: rect.bottom + 8,
      };
    });
    if (kind === 'files' || kind === 'overflow') {
      setWorkingFilesFilter('');
    }
  }, []);

  useLayoutEffect(() => {
    if (!activeMenu || !menuRef.current) {
      return;
    }

    const rect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 8;

    const nextX = Math.min(
      Math.max(activeMenu.x, padding),
      Math.max(padding, viewportWidth - rect.width - padding),
    );
    const nextY = Math.min(
      Math.max(activeMenu.y, padding),
      Math.max(padding, viewportHeight - rect.height - padding),
    );

    if (nextX !== activeMenu.x || nextY !== activeMenu.y) {
      setActiveMenu((prev) => (prev
        ? {
            ...prev,
            x: nextX,
            y: nextY,
          }
        : prev));
    }
  }, [activeMenu]);

  useEffect(() => {
    if (!activeMenu) {
      return;
    }

    const closeMenuOnOutside = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) {
        setActiveMenu(null);
        return;
      }
      if (!menuRef.current?.contains(target)) {
        setActiveMenu(null);
      }
    };
    const closeMenu = (): void => setActiveMenu(null);
    const closeMenuOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setActiveMenu(null);
      }
    };
    window.addEventListener('mousedown', closeMenuOnOutside);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('keydown', closeMenuOnEscape);
    return () => {
      window.removeEventListener('mousedown', closeMenuOnOutside);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('keydown', closeMenuOnEscape);
    };
  }, [activeMenu]);

  useEffect(() => {
    if (activeMenu?.kind !== 'files' && activeMenu?.kind !== 'overflow') {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      workingFilesSearchRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeMenu]);

  const renderFilesMenu = (): React.ReactNode => (
    <>
      <div className="toolbar-menu-section">
        <div className="toolbar-menu-section-title">{locale === 'ru' ? 'Документ' : 'Document'}</div>
        <div className="toolbar-menu-button-row">
          <button
            type="button"
            onClick={() => {
              send('requestNewGraph');
              setActiveMenu(null);
            }}
            disabled={pending}
          >
            📄 {translate('toolbar.newGraph', 'Новый')}
          </button>
          <button
            type="button"
            onClick={() => {
              send('requestLoad');
              setActiveMenu(null);
            }}
            disabled={pending}
          >
            📂 {translate('toolbar.loadGraph', 'Открыть')}
          </button>
        </div>
      </div>

      <div className="toolbar-menu-section">
        <div className="toolbar-menu-section-title">{locale === 'ru' ? 'Активный файл' : 'Active file'}</div>
        <div className="toolbar-menu-field-row">
          <select
            value={boundFileKey}
            onChange={(event) => {
              const nextKey = event.currentTarget.value;
              if (!nextKey) {
                return;
              }
              const match = workingFileByKey.get(nextKey);
              if (match) {
                onBindFile(match.filePath);
              }
            }}
            className="toolbar-select"
            title={translate('toolbar.bindFile' as TranslationKey, 'Переключить редактируемый файл')}
            disabled={pending || workingFiles.length === 0}
          >
            <option value="">
              {translate('toolbar.bindFile.placeholder' as TranslationKey, 'Выбрать файл')}
            </option>
            {workingFileOptions.map((file) => (
              <option key={file.matchKey} value={file.matchKey}>
                {file.fileName}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-icon"
            onClick={onPickBindFile}
            disabled={pending}
            title={translate('toolbar.bindFile.pick' as TranslationKey, 'Выбрать файл через диалог')}
            data-testid="toolbar-bind-file-pick"
          >
            📁
          </button>
        </div>
        <div className="toolbar-menu-note">
          {boundFileName
            ? `${locale === 'ru' ? 'Привязан:' : 'Bound:'} ${boundFileName}`
            : translate('toolbar.noFile', 'файл не привязан')}
        </div>
      </div>

      <div className="toolbar-menu-section">
        <div className="toolbar-menu-section-title">{locale === 'ru' ? 'Зависимости файла' : 'File dependency'}</div>
        <div className="toolbar-menu-field-row">
          <select
            value={dependencySourceKey}
            onChange={(event) => {
              const nextKey = event.currentTarget.value;
              if (!nextKey) {
                onDependencySourceFileChange('');
                return;
              }
              const match = workingFileByKey.get(nextKey);
              onDependencySourceFileChange(match?.filePath ?? nextKey);
            }}
            className="toolbar-select"
            title={translate('toolbar.dependencySource' as TranslationKey, 'Какой файл добавить в зависимости')}
            disabled={pending || workingFiles.length === 0}
          >
            <option value="">
              {translate('toolbar.dependencySource.placeholder' as TranslationKey, 'Файл зависимости')}
            </option>
            {workingFileOptions.map((file) => (
              <option key={`dep:${file.matchKey}`} value={file.matchKey}>
                {file.fileName}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-icon"
            onClick={onPickDependencyFile}
            disabled={pending}
            title={translate('toolbar.dependencySource.pick' as TranslationKey, 'Выбрать файл зависимости через диалог')}
            data-testid="toolbar-dependency-file-pick"
          >
            📁
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            void Promise.resolve(onAddCurrentFileDependency());
          }}
          disabled={pending || !boundFilePath || !dependencySourceFilePath}
          title={translate('toolbar.addDependencyFromFile' as TranslationKey, 'Прикрепить файл зависимости к активному файлу')}
        >
          🧩 {translate('toolbar.addDependencyShort' as TranslationKey, 'Прикрепить')}
        </button>
      </div>

      <div className="toolbar-menu-section">
        <div className="toolbar-menu-section-title">{translate('toolbar.workingFiles.menu' as TranslationKey, 'Рабочие файлы')}</div>
        <button
          type="button"
          onClick={() => {
            onAddWorkingFile();
            setActiveMenu(null);
          }}
          data-testid="toolbar-working-file-menu-add"
        >
          ＋ {translate('toolbar.workingFiles.add' as TranslationKey, 'Добавить файл в рабочий список')}
        </button>
        <div className="toolbar-working-file-menu-search">
          <input
            ref={workingFilesSearchRef}
            type="text"
            className="toolbar-working-file-menu-search-input"
            placeholder={translate('toolbar.workingFiles.search' as TranslationKey, 'Поиск файла...')}
            value={workingFilesFilter}
            onChange={(event) => setWorkingFilesFilter(event.currentTarget.value)}
            data-testid="toolbar-working-file-search"
          />
          {workingFilesFilter.trim() && (
            <button
              type="button"
              className="toolbar-working-file-menu-search-clear"
              onClick={() => setWorkingFilesFilter('')}
              title={translate('search.clear', 'Очистить')}
              data-testid="toolbar-working-file-search-clear"
            >
              ✕
            </button>
          )}
        </div>
        <div className="toolbar-working-file-menu-list">
          {workingFiles.length === 0 && (
            <div className="toolbar-working-file-menu-empty">
              {translate('toolbar.workingFiles.empty' as TranslationKey, 'Рабочих файлов пока нет')}
            </div>
          )}
          {workingFiles.length > 0 && filteredWorkingFiles.length === 0 && (
            <div className="toolbar-working-file-menu-empty">
              {translate('toolbar.workingFiles.noMatches' as TranslationKey, 'Ничего не найдено')}
            </div>
          )}
          {filteredWorkingFiles.map((file) => (
            <div key={`menu:${file.filePath}`} className="toolbar-working-file-menu-row" title={file.filePath}>
              <button
                type="button"
                className="toolbar-working-file-menu-open-button"
                onClick={() => {
                  onOpenWorkingFile(file.filePath);
                  setActiveMenu(null);
                }}
              >
                {file.fileName}
              </button>
              <button
                type="button"
                className="toolbar-working-file-menu-remove-button"
                onClick={() => {
                  onRemoveWorkingFile(file.filePath);
                  setActiveMenu(null);
                }}
                aria-label={`${translate('toolbar.workingFiles.remove' as TranslationKey, 'Убрать из списка')} ${file.fileName}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );

  const renderModeMenu = (): React.ReactNode => (
    <div className="toolbar-menu-section">
      <div className="toolbar-menu-section-title">{locale === 'ru' ? 'Режим редактора' : 'Editor mode'}</div>
      <select
        value={editorMode}
        onChange={(event) => {
          const nextMode = event.currentTarget.value;
          if (isEditorMode(nextMode)) {
            onEditorModeChange(nextMode);
          }
        }}
        title={locale === 'ru' ? 'Режим редактора' : 'Editor mode'}
        className="toolbar-select"
        data-testid="toolbar-editor-mode-select"
      >
        <option value="blueprint">{locale === 'ru' ? '🎨 Визуальный' : '🎨 Visual'}</option>
        <option value="cytoscape">{locale === 'ru' ? '📊 Классический' : '📊 Classic'}</option>
        <option value="dependency">{locale === 'ru' ? '🧩 Зависимости' : '🧩 Dependency'}</option>
      </select>
    </div>
  );

  const renderCodegenMenu = (): React.ReactNode => (
    <>
      <div className="toolbar-menu-section">
        <div className="toolbar-menu-section-title">{locale === 'ru' ? 'Профиль кода' : 'Code profile'}</div>
        <select
          title={translate('toolbar.codegenProfile', 'Профиль кода')}
          className="toolbar-select"
          value={codegenProfile}
          onChange={(event) => {
            const nextProfile = event.currentTarget.value;
            if (isCodegenOutputProfile(nextProfile)) {
              onCodegenProfileChange(nextProfile);
            }
          }}
        >
          <option value="clean">{translate('toolbar.codegenProfile.clean', 'Чистый')}</option>
          <option value="learn">{translate('toolbar.codegenProfile.learn', 'Учебный')}</option>
          <option value="debug">{translate('toolbar.codegenProfile.debug', 'Отладка')}</option>
          <option value="recovery">{translate('toolbar.codegenProfile.recovery', 'Восстановление')}</option>
        </select>
      </div>
      <div className="toolbar-menu-section">
        <div className="toolbar-menu-section-title">{locale === 'ru' ? 'Entrypoint' : 'Entrypoint'}</div>
        <select
          title={translate('toolbar.codegenEntrypointMode', 'Режим entrypoint')}
          className="toolbar-select"
          value={codegenEntrypointMode}
          onChange={(event) => {
            const nextMode = event.currentTarget.value;
            if (isCodegenEntrypointMode(nextMode)) {
              onCodegenEntrypointModeChange(nextMode);
            }
          }}
        >
          <option value="auto">{translate('toolbar.codegenEntrypointMode.auto', 'Авто')}</option>
          <option value="executable">{translate('toolbar.codegenEntrypointMode.executable', 'Исполняемый')}</option>
          <option value="library">{translate('toolbar.codegenEntrypointMode.library', 'Библиотека')}</option>
        </select>
        <div className="toolbar-menu-note">
          {locale === 'ru' ? 'Стандарт запуска и сборки: C++23' : 'Compile & Run standard: C++23'}
        </div>
      </div>
      <div className="toolbar-menu-section">
        <button
          type="button"
          onClick={() => onShowCodePreviewChange(!showCodePreview)}
          disabled={pending}
          className={showCodePreview ? 'btn-active' : ''}
        >
          {showCodePreview
            ? (locale === 'ru' ? '👁️ Скрыть код' : '👁️ Hide code')
            : (locale === 'ru' ? '👁️ Показать код' : '👁️ Show code')}
        </button>
      </div>
    </>
  );

  const renderViewMenu = (): React.ReactNode => (
    <>
      <div className="toolbar-menu-section">
        <div className="toolbar-menu-section-title">{locale === 'ru' ? 'Инструменты графа' : 'Graph tools'}</div>
        <div className="toolbar-menu-button-row">
          <button
            type="button"
            onClick={() => {
              onTranslate();
              setActiveMenu(null);
            }}
            disabled={pending || translationPending}
          >
            🌐 {translationPending
              ? translate('translation.translating', 'Перевод...')
              : translate('translation.translate', 'Перевести')}
          </button>
          <button
            type="button"
            onClick={() => {
              onCalculate();
              setActiveMenu(null);
            }}
            disabled={pending}
          >
            🔄 {translate('toolbar.calculateLayout', 'Лэйаут')}
          </button>
          <button
            type="button"
            onClick={() => {
              onCopyGraphId();
              setActiveMenu(null);
            }}
            disabled={pending}
          >
            🆔 {locale === 'ru' ? 'Скопировать ID' : 'Copy ID'}
          </button>
        </div>
      </div>
      <div className="toolbar-menu-section">
        <div className="toolbar-menu-section-title">{locale === 'ru' ? 'Вид и помощь' : 'View & Help'}</div>
        <select
          value={String(uiScale)}
          onChange={(event) => {
            const nextScale = Number(event.currentTarget.value);
            if (!Number.isFinite(nextScale)) {
              return;
            }
            onUiScaleChange(nextScale);
          }}
          title={translate('toolbar.uiScale' as TranslationKey, 'Масштаб интерфейса')}
          className="toolbar-select"
          data-testid="toolbar-ui-scale"
        >
          <option value="0.8">80%</option>
          <option value="0.9">90%</option>
          <option value="1">100%</option>
          <option value="1.1">110%</option>
        </select>
        <div className="toolbar-menu-button-row">
          <button
            type="button"
            onClick={() => {
              onShowHelp();
              setActiveMenu(null);
            }}
            title={locale === 'ru' ? 'Справка (?)' : 'Help (?)'}
          >
            ❓ {locale === 'ru' ? 'Справка' : 'Help'}
          </button>
          <button
            type="button"
            onClick={() => {
              onShowHotkeys();
              setActiveMenu(null);
            }}
            title={locale === 'ru' ? 'Горячие клавиши (H)' : 'Hotkeys (H)'}
          >
            ⌨️ {locale === 'ru' ? 'Клавиши' : 'Hotkeys'}
          </button>
        </div>
      </div>
    </>
  );

  const renderOverflowMenu = (): React.ReactNode => (
    <>
      {renderFilesMenu()}
      {renderModeMenu()}
      {renderCodegenMenu()}
      {renderViewMenu()}
    </>
  );

  return (
    <div className="toolbar app-header">
      <div className="toolbar-main">
        <div className="toolbar-info toolbar-info-v2">
          <div className="toolbar-title-row">
            <div className="toolbar-title-stack">
              <div className="toolbar-title" title={boundFilePath ?? graph.name}>
                {documentTitle}
              </div>
              <div className="toolbar-subtitle">
                {boundFileName && graph.name !== boundFileName && (
                  <span className="toolbar-bound-file" title={graph.name}>
                    {locale === 'ru' ? `Граф: ${graph.name}` : `Graph: ${graph.name}`}
                  </span>
                )}
                {!boundFileName && (
                  <span className="toolbar-bound-file toolbar-bound-file--none">
                    {translate('toolbar.noFile', 'файл не привязан')}
                  </span>
                )}
              </div>
            </div>
            <span
              className={graph.dirty ? 'toolbar-document-status toolbar-document-status--warn' : 'toolbar-document-status toolbar-document-status--ok'}
              data-testid="document-status-badge"
            >
              ● {documentStatusLabel}
            </span>
          </div>
        </div>

        <div className="toolbar-main-actions" data-testid="toolbar-main-actions">
          <select
            value={isToolbarTargetPlatform(graph.language) ? graph.language : 'cpp'}
            onChange={(event) => {
              const nextLanguage = event.currentTarget.value;
              if (isToolbarTargetPlatform(nextLanguage)) {
                onTargetPlatformChange(nextLanguage);
              }
            }}
            title={translate('toolbar.targetPlatform', 'Целевая платформа')}
            className="toolbar-select"
            data-testid="toolbar-target-platform"
          >
            <option value="cpp">CPP</option>
            <option value="ue">UE</option>
          </select>
          <select
            value={locale}
            onChange={(event) => {
              const nextLocale = event.currentTarget.value;
              if (isGraphDisplayLanguage(nextLocale)) {
                onLocaleChange(nextLocale);
              }
            }}
            title={translate('toolbar.languageSwitch', 'Язык интерфейса')}
            className="toolbar-select"
          >
            <option value="ru">🇷🇺 RU</option>
            <option value="en">🇺🇸 EN</option>
          </select>
          {showCollapsedMenus ? (
            <button
              type="button"
              className={`toolbar-menu-trigger ${activeMenu?.kind === 'overflow' ? 'btn-active' : ''}`}
              onClick={(event) => toggleMenu('overflow', event)}
              data-testid="toolbar-overflow-menu-trigger"
            >
              {locale === 'ru' ? 'Ещё' : 'More'} ▼
            </button>
          ) : (
            <>
              <button
                type="button"
                className={`toolbar-menu-trigger ${activeMenu?.kind === 'files' ? 'btn-active' : ''}`}
                onClick={(event) => toggleMenu('files', event)}
                data-testid="toolbar-files-menu-trigger"
              >
                {locale === 'ru' ? 'Файлы' : 'Files'} ▼
              </button>
              <button
                type="button"
                className={`toolbar-menu-trigger ${activeMenu?.kind === 'mode' ? 'btn-active' : ''}`}
                onClick={(event) => toggleMenu('mode', event)}
                data-testid="toolbar-mode-menu-trigger"
              >
                {locale === 'ru' ? 'Режим' : 'Mode'} ▼
              </button>
              <button
                type="button"
                className={`toolbar-menu-trigger ${activeMenu?.kind === 'codegen' ? 'btn-active' : ''}`}
                onClick={(event) => toggleMenu('codegen', event)}
                data-testid="toolbar-codegen-menu-trigger"
              >
                {locale === 'ru' ? 'Кодоген' : 'Codegen'} ▼
              </button>
              <button
                type="button"
                className={`toolbar-menu-trigger ${activeMenu?.kind === 'view' ? 'btn-active' : ''}`}
                onClick={(event) => toggleMenu('view', event)}
                data-testid="toolbar-view-menu-trigger"
              >
                {locale === 'ru' ? 'Вид' : 'View'} ▼
              </button>
            </>
          )}
          <button
            type="button"
            className="btn-quiet"
            onClick={() => send('requestSave')}
            disabled={pending}
            title={translate('tooltip.saveGraph', 'Сохранить')}
            aria-label={translate('toolbar.saveGraph', 'Сохранить')}
          >
            <span aria-hidden="true">💾</span>
            <span className="toolbar-action-label toolbar-action-label--secondary">
              {translate('toolbar.saveGraph', 'Сохранить')}
            </span>
          </button>
          <button
            type="button"
            className="btn-quiet"
            onClick={() => send('requestValidate')}
            disabled={pending}
            title={translate('tooltip.validateGraph', 'Проверить')}
            aria-label={translate('toolbar.validateGraph', 'Проверить')}
          >
            <span aria-hidden="true">✅</span>
            <span className="toolbar-action-label toolbar-action-label--secondary">
              {translate('toolbar.validateGraph', 'Проверить')}
            </span>
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              send('requestGenerate');
              onShowCodePreviewChange(true);
            }}
            disabled={pending}
            title={translate('toolbar.generate', 'Генерировать')}
            aria-label={locale === 'ru' ? 'Сгенерировать C++' : 'Generate C++'}
          >
            <span aria-hidden="true">⚡</span>
            <span className="toolbar-action-label">
              {locale === 'ru' ? 'Сгенерировать C++' : 'Generate C++'}
            </span>
          </button>
          <button
            type="button"
            className="btn-operational"
            onClick={() => send('requestCompileAndRun')}
            disabled={pending}
            title={locale === 'ru' ? 'Скомпилировать и запустить' : 'Compile and Run'}
            aria-label={locale === 'ru' ? 'Запустить' : 'Run'}
          >
            <span aria-hidden="true">▶️</span>
            <span className="toolbar-action-label">{locale === 'ru' ? 'Запустить' : 'Run'}</span>
          </button>
          {showInspectorToggle && (
            <button
              type="button"
              className={isInspectorOpen ? 'btn-quiet btn-active' : 'btn-quiet'}
              onClick={onToggleInspector}
              aria-pressed={isInspectorOpen}
              data-testid="toolbar-inspector-toggle"
              title={locale === 'ru'
                ? (isInspectorOpen ? 'Скрыть инспектор' : 'Открыть инспектор')
                : (isInspectorOpen ? 'Hide inspector' : 'Open inspector')}
            >
              <span className="toolbar-action-label">{locale === 'ru' ? 'Инспектор' : 'Inspector'}</span>
            </button>
          )}
        </div>
      </div>

      <div className="toolbar-context">
        <div className="toolbar-context-path" title={boundFilePath ?? graph.name}>
          {locale === 'ru' ? `Проект / Граф / ${graph.name}` : `Project / Graph / ${graph.name}`}
        </div>
        <div className="toolbar-context-chips">
          <span className="toolbar-context-chip">{locale === 'ru' ? `Режим: ${modeLabel}` : `Mode: ${modeLabel}`}</span>
          <span className="toolbar-context-chip">{locale === 'ru' ? `Кодоген: ${codegenChipLabel}` : `Codegen: ${codegenChipLabel}`}</span>
          <span className={problemsChipClass} data-testid="problems-indicator">{problemsLabel}</span>
          <span
            className={hasStorageIssues ? 'toolbar-context-chip toolbar-context-chip--warn' : 'toolbar-context-chip toolbar-context-chip--ok'}
            title={formatClassStorageBadgeTitle(locale, classStorageStatus, sidecarOkCount)}
            data-testid="class-storage-badge"
          >
            {storageBadgeLabel}
          </span>
          <span
            className={`toolbar-context-chip ${classNodesAdvancedEnabled ? 'toolbar-context-chip--feature' : ''}`}
            title={classNodesAdvancedEnabled
              ? 'Расширенные class-узлы включены настройкой multicode.classNodes.advanced'
              : 'Доступен базовый пакет class-узлов'}
          >
            {classNodesBadgeLabel}
          </span>
        </div>
      </div>

      {activeMenu && (
        <div
          ref={menuRef}
          className={`toolbar-menu-popup${activeMenu.kind === 'overflow' ? ' toolbar-menu-popup--overflow' : ''}`}
          style={{
            position: 'fixed',
            left: activeMenu.x,
            top: activeMenu.y,
            zIndex: 40,
          }}
          data-testid={`toolbar-${activeMenu.kind}-menu-popup`}
        >
          {activeMenu.kind === 'files' && renderFilesMenu()}
          {activeMenu.kind === 'mode' && renderModeMenu()}
          {activeMenu.kind === 'codegen' && renderCodegenMenu()}
          {activeMenu.kind === 'view' && renderViewMenu()}
          {activeMenu.kind === 'overflow' && renderOverflowMenu()}
        </div>
      )}
    </div>
  );
};

/** Панель горячих клавиш */
const HotkeysPanel: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  locale: GraphDisplayLanguage;
}> = ({ isOpen, onClose, locale }) => {
  if (!isOpen) return null;

  const hotkeys = [
    { key: 'A', action: locale === 'ru' ? 'Добавить узел (палитра)' : 'Add node (palette)' },
    { key: 'Delete / Backspace', action: locale === 'ru' ? 'Удалить выделенное' : 'Delete selected' },
    { key: 'Ctrl+Z', action: locale === 'ru' ? 'Отменить' : 'Undo' },
    { key: 'Ctrl+Y / Ctrl+Shift+Z', action: locale === 'ru' ? 'Повторить' : 'Redo' },
    { key: 'Ctrl+C', action: locale === 'ru' ? 'Копировать' : 'Copy' },
    { key: 'Ctrl+V', action: locale === 'ru' ? 'Вставить' : 'Paste' },
    { key: 'Ctrl+X', action: locale === 'ru' ? 'Вырезать' : 'Cut' },
    { key: 'Ctrl+A', action: locale === 'ru' ? 'Выделить всё' : 'Select all' },
    { key: 'Escape', action: locale === 'ru' ? 'Снять выделение' : 'Deselect' },
    { key: 'L', action: locale === 'ru' ? 'Автолейаут' : 'Auto layout' },
    { key: 'F', action: locale === 'ru' ? 'Центрировать на выделении' : 'Focus on selection' },
    { key: 'Space (drag)', action: locale === 'ru' ? 'Перемещение канваса' : 'Pan canvas' },
    { key: 'Scroll', action: locale === 'ru' ? 'Масштаб' : 'Zoom' },
    { key: 'Right Click', action: locale === 'ru' ? 'Контекстное меню' : 'Context menu' },
  ];

  return (
    <div className="hotkeys-overlay" onClick={onClose}>
      <div className="hotkeys-panel" onClick={(e) => e.stopPropagation()}>
        <div className="hotkeys-header">
          <h3>⌨️ {locale === 'ru' ? 'Горячие клавиши' : 'Keyboard Shortcuts'}</h3>
          <button className="hotkeys-close" onClick={onClose}>×</button>
        </div>
        <div className="hotkeys-list">
          {hotkeys.map((h, i) => (
            <div key={i} className="hotkey-row">
              <kbd className="hotkey-key">{h.key}</kbd>
              <span className="hotkey-action">{h.action}</span>
            </div>
          ))}
        </div>
        <div className="hotkeys-footer">
          <p>{locale === 'ru' 
            ? '💡 Нажмите ? или H для открытия этой панели' 
            : '💡 Press ? or H to open this panel'}
          </p>
        </div>
      </div>
    </div>
  );
};

const GraphFacts: React.FC<{
  translate: (key: TranslationKey, fallback: string) => string;
  classStorageStatus: ClassStorageStatus;
  classNodesAdvancedEnabled: boolean;
}> = ({ translate, classStorageStatus, classNodesAdvancedEnabled }) => {
  const graph = useGraphStore((state) => state.graph);
  const nodeCount = graph.nodes.length;
  const edgeCount = graph.edges.length;
  const sidecarOkCount = classStorageStatus.classItems.filter((item) => item.status === 'ok').length;
  const locale = graph.displayLanguage;

  return (
    <div className="panel">
      <div className="panel-title">{translate('overview.title', 'Сводка графа')}</div>
      <div className="panel-grid">
        <div>
          <div className="panel-label">{translate('overview.nodes', 'Узлы')}</div>
          <div className="panel-value">{nodeCount}</div>
        </div>
        <div>
          <div className="panel-label">{translate('overview.edges', 'Связи')}</div>
          <div className="panel-value">{edgeCount}</div>
        </div>
        <div>
          <div className="panel-label">{translate('overview.language', 'Язык')}</div>
          <div className="panel-value">{graph.language.toUpperCase()}</div>
        </div>
        <div>
          <div className="panel-label">{translate('overview.classStorage', 'Class Storage')}</div>
          <div className="panel-value">{formatClassStorageModeValue(locale, classStorageStatus)}</div>
        </div>
        <div>
          <div className="panel-label">{translate('overview.classStorageSidecar', 'Sidecar')}</div>
          <div className="panel-value">{formatClassStorageStatsValue(locale, classStorageStatus, sidecarOkCount)}</div>
        </div>
        <div>
          <div className="panel-label">{translate('overview.classNodes' as TranslationKey, 'Class Nodes')}</div>
          <div className="panel-value">{formatClassNodesValue(locale, classNodesAdvancedEnabled)}</div>
        </div>
      </div>
    </div>
  );
};

const SelectionSummaryPanel: React.FC<{
  translate: (key: TranslationKey, fallback: string) => string;
}> = ({ translate }) => {
  const graph = useGraphStore((state) => state.graph);
  const selectedNodeIds = useGraphStore((state) => state.selectedNodeIds);
  const selectedEdgeIds = useGraphStore((state) => state.selectedEdgeIds);

  const selectedNodes = useMemo(
    () => graph.nodes.filter((node) => selectedNodeIds.includes(node.id)),
    [graph.nodes, selectedNodeIds]
  );
  const selectedEdges = useMemo(
    () => graph.edges.filter((edge) => selectedEdgeIds.includes(edge.id)),
    [graph.edges, selectedEdgeIds]
  );
  const nodeLabelById = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, resolveGraphNodeDisplayName(graph, node)])),
    [graph]
  );

  if (!selectedNodes.length && !selectedEdges.length) {
    return null;
  }

  if (selectedNodes.length === 1 && selectedEdges.length === 0) {
    const node = selectedNodes[0];
    const incomingEdges = graph.edges.filter((edge) => edge.target === node.id);
    const outgoingEdges = graph.edges.filter((edge) => edge.source === node.id);

    return (
      <div className="panel">
        <div className="panel-title">{translate('inspector.node.title' as TranslationKey, 'Выбранный узел')}</div>
        <div className="panel-grid">
          <div>
            <div className="panel-label">{translate('inspector.node.name' as TranslationKey, 'Имя')}</div>
            <div className="panel-value">{resolveGraphNodeDisplayName(graph, node)}</div>
          </div>
          <div>
            <div className="panel-label">{translate('inspector.node.kind' as TranslationKey, 'Тип')}</div>
            <div className="panel-value">{node.type}</div>
          </div>
          <div>
            <div className="panel-label">ID</div>
            <div className="panel-value">{node.id}</div>
          </div>
          <div>
            <div className="panel-label">{translate('inspector.node.position' as TranslationKey, 'Позиция')}</div>
            <div className="panel-value">
              {node.position ? `${Math.round(node.position.x)} × ${Math.round(node.position.y)}` : 'auto'}
            </div>
          </div>
          <div>
            <div className="panel-label">{translate('inspector.node.incoming' as TranslationKey, 'Входящие')}</div>
            <div className="panel-value">{incomingEdges.length}</div>
          </div>
          <div>
            <div className="panel-label">{translate('inspector.node.outgoing' as TranslationKey, 'Исходящие')}</div>
            <div className="panel-value">{outgoingEdges.length}</div>
          </div>
        </div>
      </div>
    );
  }

  if (selectedEdges.length === 1 && selectedNodes.length === 0) {
    const edge = selectedEdges[0];
    const sourceLabel = nodeLabelById.get(edge.source) ?? edge.source;
    const targetLabel = nodeLabelById.get(edge.target) ?? edge.target;

    return (
      <div className="panel">
        <div className="panel-title">{translate('inspector.edge.title' as TranslationKey, 'Выбранная связь')}</div>
        <div className="panel-grid">
          <div>
            <div className="panel-label">{translate('inspector.edge.kind' as TranslationKey, 'Вид')}</div>
            <div className="panel-value">{edge.kind ?? 'execution'}</div>
          </div>
          <div>
            <div className="panel-label">ID</div>
            <div className="panel-value">{edge.id}</div>
          </div>
          <div>
            <div className="panel-label">{translate('inspector.edge.source' as TranslationKey, 'Источник')}</div>
            <div className="panel-value">{sourceLabel}</div>
          </div>
          <div>
            <div className="panel-label">{translate('inspector.edge.target' as TranslationKey, 'Цель')}</div>
            <div className="panel-value">{targetLabel}</div>
          </div>
        </div>
      </div>
    );
  }

  const selectedNodeLabels = selectedNodes.slice(0, 3).map((node) => resolveGraphNodeDisplayName(graph, node));
  const hiddenNodeCount = selectedNodes.length - selectedNodeLabels.length;

  return (
    <div className="panel">
      <div className="panel-title">{translate('inspector.selection.title' as TranslationKey, 'Выделение')}</div>
      <div className="panel-grid">
        <div>
          <div className="panel-label">{translate('overview.nodes', 'Узлы')}</div>
          <div className="panel-value">{selectedNodes.length}</div>
        </div>
        <div>
          <div className="panel-label">{translate('overview.edges', 'Связи')}</div>
          <div className="panel-value">{selectedEdges.length}</div>
        </div>
      </div>
      {selectedNodeLabels.length > 0 && (
        <div className="panel-note">
          {translate('inspector.selection.preview' as TranslationKey, 'В фокусе')}: {selectedNodeLabels.join(', ')}
          {hiddenNodeCount > 0 ? ` +${hiddenNodeCount}` : ''}
        </div>
      )}
    </div>
  );
};

const ValidationPanel: React.FC<{
  validation?: ValidationResult;
  translate: (key: TranslationKey, fallback: string) => string;
  title?: string;
  emptyStateLabel?: string;
  filterNodeIds?: string[];
  filterEdgeIds?: string[];
}> = ({ validation, translate, title, emptyStateLabel, filterNodeIds, filterEdgeIds }) => {
  const graph = useGraphStore((state) => state.graph);

  if (!validation) {
    return null;
  }

  const nodeLabelById = new Map(
    graph.nodes.map((node) => [node.id, resolveGraphNodeDisplayName(graph, node)])
  );
  const edgeLabelById = new Map(
    graph.edges.map((edge) => {
      const sourceLabel = nodeLabelById.get(edge.source) ?? edge.source;
      const targetLabel = nodeLabelById.get(edge.target) ?? edge.target;
      return [edge.id, `${sourceLabel} -> ${targetLabel}`];
    })
  );

  const humanizeValidationMessage = (message: string): string => {
    let normalized = message;

    nodeLabelById.forEach((label, id) => {
      if (label !== id) {
        normalized = normalized.split(id).join(label);
      }
    });

    edgeLabelById.forEach((label, id) => {
      if (label !== id) {
        normalized = normalized.split(id).join(label);
      }
    });

    if (graph.displayLanguage === 'ru') {
      normalized = normalized
        .replace('Graph must contain at least one node.', 'Граф должен содержать хотя бы один узел.')
        .replace('Graph has no Start node. Entry-point checks are skipped.', 'В графе нет стартового узла. Проверка точки входа пропущена.')
        .replace('Only one Start node is allowed.', 'Допустим только один стартовый узел.')
        .replace('Graph must contain at least one End node.', 'Граф должен содержать хотя бы один конечный узел.')
        .replace('Graph does not contain execution flow connections.', 'В графе нет связей потока выполнения.')
        .replace('Start node cannot have incoming execution edges.', 'Стартовый узел не может иметь входящих связей выполнения.')
        .replace('Start node has no outgoing execution edges.', 'У стартового узла нет исходящих связей выполнения.')
        .replace(/Edge #(\d+) references missing nodes\./, 'Связь #$1 ссылается на отсутствующие узлы.')
        .replace(/Edge (.+?) creates a self-loop\./, 'Связь $1 образует петлю на самой себе.')
        .replace(/Execution edge (.+?) -> (.+?) cannot start from End node "(.+?)"\./, 'Связь выполнения $1 -> $2 не может выходить из конечного узла "$3".')
        .replace(/Execution edge (.+?) -> (.+?) cannot target Start node "(.+?)"\./, 'Связь выполнения $1 -> $2 не может вести в стартовый узел "$3".')
        .replace(/Data edge (.+?) -> (.+?) cannot involve Start nodes\./, 'Связь данных $1 -> $2 не может быть связана со стартовыми узлами.')
        .replace(/Data edge (.+?) -> (.+?) cannot originate from End nodes\./, 'Связь данных $1 -> $2 не может выходить из конечных узлов.')
        .replace(/End node "(.+?)" cannot have outgoing execution edges\./, 'Конечный узел "$1" не может иметь исходящих связей выполнения.')
        .replace(/End node "(.+?)" has no incoming execution edges\./, 'У конечного узла "$1" нет входящих связей выполнения.')
        .replace(/Execution cycle detected: (.+)/, 'Обнаружен цикл выполнения: $1');
    }

    return normalized;
  };

  const issues = filterValidationIssuesBySelection(
    buildValidationIssues(validation),
    filterNodeIds,
    filterEdgeIds
  );

  const hasProblems = issues.length > 0;

  return (
    <div className="panel">
      <div className="panel-title">{title ?? translate('toolbar.validate', 'Валидация')}</div>
      {!hasProblems ? (
        <div className="badge badge-ok">{emptyStateLabel ?? translate('toasts.validationOk', 'Ошибок не найдено')}</div>
      ) : (
        <ul className="validation-list">
          {issues.map((item, index) => {
            const targets: string[] = [];
            const technicalTargets: string[] = [];
            if (item.nodes?.length) {
              const readableNodes = item.nodes.map(
                (nodeId, nodeIndex) =>
                  nodeLabelById.get(nodeId) ??
                  `${translate('overview.nodes', 'Узлы')} ${nodeIndex + 1}`
              );
              targets.push(`${translate('overview.nodes', 'Узлы')}: ${readableNodes.join(', ')}`);
              technicalTargets.push(`${translate('overview.nodes', 'Узлы')} ID: ${item.nodes.join(', ')}`);
            }
            if (item.edges?.length) {
              const readableEdges = item.edges.map(
                (edgeId, edgeIndex) =>
                  edgeLabelById.get(edgeId) ??
                  `${translate('overview.edges', 'Связи')} ${edgeIndex + 1}`
              );
              targets.push(`${translate('overview.edges', 'Связи')}: ${readableEdges.join(', ')}`);
              technicalTargets.push(`${translate('overview.edges', 'Связи')} ID: ${item.edges.join(', ')}`);
            }
            const details = targets.length ? ` (${targets.join(' · ')})` : '';
            return (
              <li
                key={`${item.message}-${index}`}
                className={item.severity === 'error' ? 'text-error' : 'text-warn'}
                title={technicalTargets.join(' · ')}
              >
                {humanizeValidationMessage(item.message)}
                {details}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

const ToastContainer: React.FC<{
  toasts: Toast[];
  onClose: (id: number) => void;
  translate: (key: TranslationKey, fallback: string) => string;
}> = ({ toasts, onClose, translate }) => (
  <div className="toast-container">
    {toasts.map((toast) => (
      <div key={toast.id} className={`toast toast-${toast.kind}`}>
        <span>{toast.message}</span>
        <button
          className="toast-close"
          onClick={() => onClose(toast.id)}
          aria-label={translate('toast.close', 'Закрыть уведомление')}
        >
          ×
        </button>
      </div>
    ))}
  </div>
);

const nodeTypeOptions: GraphNodeType[] = ['Start', 'Function', 'End', 'Variable', 'Custom'];
const translationDirections: Array<{ value: TranslationDirection; label: string }> = [
  { value: 'ru-en', label: 'RU → EN' },
  { value: 'en-ru', label: 'EN → RU' }
];

interface NodeActionsProps {
  onAddNode: (payload: { label?: string; nodeType?: GraphNodeType }) => void;
  onConnectNodes: (payload: { sourceId?: string; targetId?: string }) => void;
  lastNodeAddedToken?: number;
  lastConnectionToken?: number;
}

const NodeActions: React.FC<NodeActionsProps> = ({
  onAddNode,
  onConnectNodes,
  lastNodeAddedToken,
  lastConnectionToken
}) => {
  const [locale, setLocaleState] = useState<GraphDisplayLanguage>(bootLocale);
  const graph = useGraphStore((state) => state.graph);
  const selected = useGraphStore((state) => state.selectedNodeIds);
  const [label, setLabel] = useState('');
  const [type, setType] = useState<GraphNodeType>('Function');
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');

  const nodes = useMemo(
    () =>
      graph.nodes.map((node) => ({
        id: node.id,
        label: node.label || node.id
      })),
    [graph.nodes]
  );

  useEffect(() => {
    if (!selected.length) {
      return;
    }
    setSourceId((prev) => prev || selected[0]);
    if (selected.length > 1) {
    setTargetId((prev) => prev || selected[1]);
    }
  }, [selected]);

  useEffect(() => {
    setLocaleState(graph.displayLanguage);
  }, [graph.displayLanguage]);

  useEffect(() => {
    if (sourceId && !nodes.some((node) => node.id === sourceId)) {
      setSourceId('');
    }
    if (targetId && !nodes.some((node) => node.id === targetId)) {
      setTargetId('');
    }
  }, [nodes, sourceId, targetId]);

  useEffect(() => {
    if (!lastNodeAddedToken) {
      return;
    }
    setLabel('');
  }, [lastNodeAddedToken]);

  useEffect(() => {
    if (!lastConnectionToken) {
      return;
    }
    setSourceId('');
    setTargetId('');
  }, [lastConnectionToken]);

  const handleAddNode = (event: React.FormEvent): void => {
    event.preventDefault();
    onAddNode({ label, nodeType: type });
  };

  const handleConnect = (event: React.FormEvent): void => {
    event.preventDefault();
    onConnectNodes({ sourceId: sourceId || undefined, targetId: targetId || undefined });
  };

  return (
    <div className="panel">
      <div className="panel-title">{getTranslation(locale, 'form.connection', {}, 'Управление графом')}</div>
      <form className="panel-grid" onSubmit={handleAddNode}>
        <label>
          <div className="panel-label">{getTranslation(locale, 'form.placeholder.node', {}, 'Имя узла')}</div>
          <input
            type="text"
            value={label}
            placeholder={getTranslation(locale, 'form.placeholder.newNode', {}, 'Новый узел')}
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        <label>
          <div className="panel-label">{getTranslation(locale, 'form.nodeType', {}, 'Тип')}</div>
          <select
            value={type}
            onChange={(event) => {
              const nextType = event.currentTarget.value;
              if (isGraphNodeType(nextType)) {
                setType(nextType);
              }
            }}
          >
            {nodeTypeOptions.map((option) => (
              <option key={option} value={option}>
                {getTranslation(locale, `nodeType.${option}` as TranslationKey, {}, option)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="panel-action" disabled={!type}>
          {getTranslation(locale, 'form.addNode', {}, 'Добавить узел')}
        </button>
      </form>

      <form className="panel-grid" onSubmit={handleConnect}>
        <label>
          <div className="panel-label">{getTranslation(locale, 'form.source', {}, 'Источник')}</div>
          <select value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
            <option value="">—</option>
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.label} ({node.id})
              </option>
            ))}
          </select>
        </label>
        <label>
          <div className="panel-label">{getTranslation(locale, 'form.target', {}, 'Цель')}</div>
          <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
            <option value="">—</option>
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.label} ({node.id})
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="panel-action" disabled={!sourceId || !targetId}>
          {getTranslation(locale, 'form.connect', {}, 'Соединить')}
        </button>
      </form>
    </div>
  );
};

interface TranslationActionsProps {
  direction: TranslationDirection;
  pending: boolean;
  onDirectionChange: (direction: TranslationDirection) => void;
  onTranslate: () => void;
  translate: (key: TranslationKey, fallback: string) => string;
}

const TranslationActions: React.FC<TranslationActionsProps> = ({
  direction,
  pending,
  onDirectionChange,
  onTranslate,
  translate
}) => (
  <div className="panel">
    <div className="panel-title">{translate('translation.title', 'Перевод графа')}</div>
    <div className="panel-grid">
      <label>
        <div className="panel-label">{translate('translation.direction', 'Направление')}</div>
        <select
          value={direction}
          onChange={(event) => {
            const nextDirection = event.currentTarget.value;
            if (isTranslationDirection(nextDirection)) {
              onDirectionChange(nextDirection);
            }
          }}
        >
          {translationDirections.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="panel-action" onClick={onTranslate} disabled={pending}>
        {pending ? translate('translation.translating', 'Перевод...') : translate('translation.translate', 'Перевести')}
      </button>
    </div>
  </div>
);

const LayoutSettingsPanel: React.FC<{ translate: (key: TranslationKey, fallback: string) => string }> = ({
  translate
}) => {
  const layout = useGraphStore((state) => state.layout);
  const setLayout = useGraphStore((state) => state.setLayout);

  return (
    <div className="panel">
      <div className="panel-title">{translate('layout.title', 'Настройки лэйаута')}</div>
      <div className="panel-grid">
        <label>
          <div className="panel-label">{translate('layout.algorithm', 'Алгоритм')}</div>
          <select
            value={layout.algorithm}
            onChange={(event) => {
              const nextAlgorithm = event.currentTarget.value;
              if (nextAlgorithm === 'dagre' || nextAlgorithm === 'klay') {
                setLayout({ algorithm: nextAlgorithm });
              }
            }}
          >
            <option value="dagre">{translate('layout.algorithm.dagre', 'Dagre')}</option>
            <option value="klay">{translate('layout.algorithm.klay', 'Klay')}</option>
          </select>
        </label>
        <label>
          <div className="panel-label">{translate('layout.rankDir', 'Направление рангов')}</div>
          <select
            value={layout.rankDir}
            onChange={(event) => {
              const nextRankDir = event.currentTarget.value;
              if (isLayoutRankDir(nextRankDir)) {
                setLayout({ rankDir: nextRankDir });
              }
            }}
          >
            <option value="LR">{translate('layout.rank.lr', 'Слева направо')}</option>
            <option value="RL">{translate('layout.rank.rl', 'Справа налево')}</option>
            <option value="TB">{translate('layout.rank.tb', 'Сверху вниз')}</option>
            <option value="BT">{translate('layout.rank.bt', 'Снизу вверх')}</option>
          </select>
        </label>
        <label>
          <div className="panel-label">{translate('layout.nodeSep', 'Отступ между узлами')}</div>
          <input
            type="number"
            min={layoutBounds.nodeSep.min}
            max={layoutBounds.nodeSep.max}
            value={layout.nodeSep}
            onChange={(event) => setLayout({ nodeSep: Number(event.target.value) })}
          />
        </label>
        <label>
          <div className="panel-label">{translate('layout.edgeSep', 'Отступ между рёбрами')}</div>
          <input
            type="number"
            min={layoutBounds.edgeSep.min}
            max={layoutBounds.edgeSep.max}
            value={layout.edgeSep}
            onChange={(event) => setLayout({ edgeSep: Number(event.target.value) })}
          />
        </label>
        <label>
          <div className="panel-label">{translate('layout.spacing', 'Масштаб расстояний')}</div>
          <input
            type="number"
            step={0.1}
            min={layoutBounds.spacing.min}
            max={layoutBounds.spacing.max}
            value={layout.spacing}
            onChange={(event) => setLayout({ spacing: Number(event.target.value) })}
          />
        </label>
      </div>
    </div>
  );
};

const formatUtilityTimestamp = (timestamp: string, locale: GraphDisplayLanguage): string => {
  try {
    return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(timestamp));
  } catch {
    return timestamp;
  }
};

const ConsoleUtilityPanel: React.FC<{
  locale: GraphDisplayLanguage;
  logs: UtilityLogEntry[];
  onClear: () => void;
}> = ({ locale, logs, onClear }) => (
  <div className="utility-console">
    <div className="utility-console__header">
      <div className="utility-console__title">
        {locale === 'ru' ? 'Журнал extension/webview' : 'Extension/Webview Log'}
      </div>
      <button type="button" className="utility-console__clear" onClick={onClear}>
        {locale === 'ru' ? 'Очистить' : 'Clear'}
      </button>
    </div>
    {logs.length === 0 ? (
      <div className="utility-empty-state">
        {locale === 'ru' ? 'Логи появятся после операций редактора и генерации.' : 'Logs will appear after editor and generation activity.'}
      </div>
    ) : (
      <div className="utility-console__list" data-testid="utility-console-list">
        {logs.map((entry) => (
          <div key={entry.id} className={`utility-console__entry utility-console__entry--${entry.level}`}>
            <span className="utility-console__time">{formatUtilityTimestamp(entry.timestamp, locale)}</span>
            <span className="utility-console__source">{entry.source}</span>
            <span className="utility-console__message">{entry.message}</span>
          </div>
        ))}
      </div>
    )}
  </div>
);

const PackagesUtilityPanel: React.FC<{
  locale: GraphDisplayLanguage;
  packages: Array<{ name: string; version: string; displayName: string; nodeCount: number }>;
}> = ({ locale, packages }) => (
  <div className="utility-list-panel">
    <div className="utility-list-panel__header">
      <div className="utility-list-panel__title">
        {locale === 'ru' ? 'Загруженные пакеты узлов' : 'Loaded node packages'}
      </div>
      <div className="utility-list-panel__meta">
        {locale === 'ru' ? `Всего: ${packages.length}` : `Total: ${packages.length}`}
      </div>
    </div>
    {packages.length === 0 ? (
      <div className="utility-empty-state">
        {locale === 'ru'
          ? 'Пакеты не загружены в shell-level panel. Встроенные категории редактора остаются доступны.'
          : 'No packages are loaded into the shell-level panel. Built-in editor categories remain available.'}
      </div>
    ) : (
      <div className="utility-list-panel__list">
        {packages.map((pkg) => (
          <div key={pkg.name} className="utility-list-panel__item">
            <div className="utility-list-panel__item-title">{pkg.displayName}</div>
            <div className="utility-list-panel__item-meta">
              {pkg.name} · v{pkg.version} · {locale === 'ru' ? `${pkg.nodeCount} узлов` : `${pkg.nodeCount} nodes`}
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

const UtilityPanel: React.FC<{
  locale: GraphDisplayLanguage;
  isOpen: boolean;
  activeTab: UtilityTabId;
  tabs: Array<{ id: UtilityTabId; label: string; badge?: string | number | null }>;
  onSelectTab: (tab: UtilityTabId) => void;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ locale, isOpen, activeTab, tabs, onSelectTab, onClose, children }) => (
  <div className={`utility-panel${isOpen ? ' is-open' : ''}`} data-testid="utility-panel">
    <div className="utility-panel__tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`utility-panel__tab${isOpen && activeTab === tab.id ? ' is-active' : ''}`}
          onClick={() => onSelectTab(tab.id)}
          data-testid={`utility-tab-${tab.id}`}
        >
          <span>{tab.label}</span>
          {tab.badge !== undefined && tab.badge !== null && tab.badge !== '' && (
            <span className="utility-panel__badge">{tab.badge}</span>
          )}
        </button>
      ))}
      <div className="utility-panel__spacer" />
      {isOpen && (
        <button
          type="button"
          className="utility-panel__collapse"
          onClick={onClose}
          data-testid="utility-panel-collapse"
        >
          {locale === 'ru' ? 'Скрыть' : 'Hide'}
        </button>
      )}
    </div>
    {isOpen && (
      <div className="utility-panel__body" data-testid={`utility-panel-body-${activeTab}`}>
        {children}
      </div>
    )}
  </div>
);

const App: React.FC = () => {
  const setGraph = useGraphStore((state) => state.setGraph);
  const graph = useGraphStore((state) => state.graph);
  const selectedNodeIds = useGraphStore((state) => state.selectedNodeIds);
  const selectedEdgeIds = useGraphStore((state) => state.selectedEdgeIds);
  const integrations = useGraphStore((state) => state.integrations);
  const setIntegrations = useGraphStore((state) => state.setIntegrations);
  const upsertIntegration = useGraphStore((state) => state.upsertIntegration);
  const removeIntegration = useGraphStore((state) => state.removeIntegration);
  const symbolCatalog = useGraphStore((state) => state.symbolCatalog);
  const setSymbolsForIntegration = useGraphStore((state) => state.setSymbolsForIntegration);
  const clearSymbolsForIntegration = useGraphStore((state) => state.clearSymbolsForIntegration);
  const setDependencyMap = useGraphStore((state) => state.setDependencyMap);
  const setIndexerStatus = useGraphStore((state) => state.setIndexerStatus);
  const updateIndexerData = useGraphStore((state) => state.updateIndexerData);
  const resolveLocalizedSymbol = useGraphStore((state) => state.resolveLocalizedSymbol);
  const [locale, setLocale] = useState<GraphDisplayLanguage>(bootLocale);
  const localeRef = useRef<GraphDisplayLanguage>(bootLocale);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [validation, setValidation] = useState<ValidationResult | undefined>(undefined);
  const [themeState, setThemeState] = useState<ThemeMessage>(initialThemeMessage);
  const [lastNodeAddedToken, setLastNodeAddedToken] = useState<number | undefined>(undefined);
  const [lastConnectionToken, setLastConnectionToken] = useState<number | undefined>(undefined);
  const [translationDirection, setTranslationDirection] = useState<TranslationDirection>(
    graph.displayLanguage === 'ru' ? 'ru-en' : 'en-ru'
  );
  const [translationPending, setTranslationPending] = useState(false);
  const layoutRunnerRef = useRef<() => void>(() => {});
  
  // Editor mode: 'blueprint' (React Flow) or 'cytoscape' (classic)
  const [editorMode, setEditorMode] = useState<EditorMode>(getInitialEditorMode);
  const [utilityPanelState, setUtilityPanelState] = useState<{ isOpen: boolean; activeTab: UtilityTabId }>({
    isOpen: false,
    activeTab: 'problems',
  });
  const [consoleEntries, setConsoleEntries] = useState<UtilityLogEntry[]>([]);
  const [viewportWidth, setViewportWidth] = useState<number>(getViewportWidth);
  const [uiScale, setUiScale] = useState<number>(getInitialUiScale);
  const [codegenProfile, setCodegenProfile] = useState<CodegenOutputProfile>('clean');
  const [codegenEntrypointMode, setCodegenEntrypointMode] = useState<CodegenEntrypointMode>('auto');
  
  // Hotkeys panel state
  const [showHotkeys, setShowHotkeys] = useState(false);
  
  // Help panel state
  const [showHelp, setShowHelp] = useState(false);
  // Версия snapshot package registry для реактивного предпросмотра кода
  const [registryVersion, setRegistryVersion] = useState(0);
  
  // Blueprint graph state (derived from GraphState for Blueprint editor)
  const [blueprintGraph, setBlueprintGraph] = useState<BlueprintGraphState>(() => 
    migrateToBlueprintFormat(graph)
  );

  // Привязанный файл для генерации кода
  const [boundFile, setBoundFile] = useState<{ fileName: string | null; filePath: string | null }>({
    fileName: null,
    filePath: null,
  });
  const [classStorageStatus, setClassStorageStatus] = useState<ClassStorageStatus>(createDefaultClassStorageStatus);
  const [classNodesConfig, setClassNodesConfig] = useState<ClassNodesConfig>(createDefaultClassNodesConfig);
  const [editableFiles, setEditableFiles] = useState<Array<{ fileName: string; filePath: string }>>([]);
  const [manualWorkingFiles, setManualWorkingFiles] = useState<Array<{ fileName: string; filePath: string }>>([]);
  const [hiddenWorkingFilePaths, setHiddenWorkingFilePaths] = useState<string[]>([]);
  const [dependencySourceFilePath, setDependencySourceFilePath] = useState<string>('');
  const graphChangedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingGraphMutationRef = useRef<GraphMutationPayload | null>(null);
  const lastUiTraceSignatureRef = useRef<string | null>(null);

  const effectiveTheme = resolveEffectiveTheme(themeState.preference, themeState.hostTheme);
  const themeTokens = useMemo(() => getThemeTokens(effectiveTheme), [effectiveTheme]);
  const packageRegistrySnapshotForPreview = useMemo(() => {
    const packageNodeTypes = Array.from(globalRegistry.getAllNodeDefinitions().keys()) as BlueprintNodeType[];
    return {
      getNodeDefinition: (type: string) => globalRegistry.getNodeDefinition(type),
      packageNodeTypes,
      registryVersion,
    };
  }, [registryVersion]);

  const translate = useCallback((
    key: TranslationKey,
    fallback: string,
    replacements?: Record<string, string>
  ): string => getTranslation(localeRef.current, key, replacements, fallback), []);

  const shellMode = useMemo<ShellMode>(() => getShellMode(viewportWidth), [viewportWidth]);
  const packageList = useMemo(() => globalRegistry.getPackageList(), [registryVersion]);
  const validationIssues = useMemo(() => buildValidationIssues(validation), [validation]);
  const utilityProblemBadge = validationIssues.length > 0 ? validationIssues.length : null;
  const showCodePreview = utilityPanelState.isOpen && utilityPanelState.activeTab === 'generated';
  const canShowInspector = editorMode === 'blueprint' || editorMode === 'cytoscape';
  const [isInspectorOpen, setIsInspectorOpen] = useState<boolean>(() => getShellMode(getViewportWidth()) === 'wide');
  const previousShellModeRef = useRef<ShellMode>(shellMode);
  const previousInspectorCapabilityRef = useRef<boolean>(canShowInspector);

  const openUtilityTab = useCallback((activeTab: UtilityTabId): void => {
    setUtilityPanelState({ isOpen: true, activeTab });
  }, []);

  const closeUtilityPanel = useCallback((): void => {
    setUtilityPanelState((current) => ({ ...current, isOpen: false }));
  }, []);

  const handleCodePreviewVisibility = useCallback((show: boolean): void => {
    if (show) {
      openUtilityTab('generated');
      return;
    }

    setUtilityPanelState((current) => {
      if (current.activeTab !== 'generated') {
        return current;
      }
      return { ...current, isOpen: false };
    });
  }, [openUtilityTab]);

  const pushToast = useCallback((kind: ToastKind, message: string): void => {
    const id = Date.now() + Math.round(Math.random() * 1000);
    setToasts((prev) => [...prev.slice(-3), { id, kind, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), 3200);
  }, []);

  const appendConsoleEntry = useCallback(
    (level: UtilityLogEntry['level'], message: string, source: UtilityLogEntry['source']): void => {
      const entry: UtilityLogEntry = {
        id: Date.now() + Math.round(Math.random() * 1000),
        level,
        message,
        source,
        timestamp: new Date().toISOString(),
      };
      setConsoleEntries((prev) => [...prev.slice(-199), entry]);
    },
    []
  );

  const requestExternalIpc = useCallback(
    <TType extends ExternalIpcRequest['type']>(
      request: Extract<ExternalIpcRequest, { type: TType }>,
      timeoutMs = 10000
    ): Promise<Extract<ExternalIpcResponse, { type: TType }>> =>
      new Promise((resolve, reject) => {
        let settled = false;

        const cleanup = (timer: ReturnType<typeof setTimeout>): void => {
          window.removeEventListener('message', handleMessage);
          clearTimeout(timer);
        };

        const handleMessage = (event: MessageEvent<unknown>): void => {
          const parsed = parseExternalIpcResponse(event.data);
          if (!parsed.success) {
            return;
          }
          if (parsed.data.type !== request.type) {
            return;
          }

          settled = true;
          cleanup(timeoutTimer);
          resolve(parsed.data as Extract<ExternalIpcResponse, { type: TType }>);
        };

        const timeoutTimer = setTimeout(() => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup(timeoutTimer);
          reject(new Error(`IPC timeout: ${request.type}`));
        }, timeoutMs);

        window.addEventListener('message', handleMessage);
        sendToExtension(request as WebviewToExtensionMessage);
      }),
    []
  );

  const rememberWorkingFile = useCallback((filePath: string, fileName?: string): void => {
    const normalizedPath = normalizeFilePath(filePath);
    const matchPath = normalizeFilePathForMatch(normalizedPath);
    const resolvedFileName = fileName?.trim() || extractFileName(normalizedPath);

    setHiddenWorkingFilePaths((prev) => prev.filter((item) => item !== matchPath));
    setManualWorkingFiles((prev) => {
      const filtered = prev.filter((item) => normalizeFilePathForMatch(item.filePath) !== matchPath);
      return [...filtered, { fileName: resolvedFileName, filePath: normalizedPath }];
    });
  }, []);

  const workingFiles = useMemo<Array<{ fileName: string; filePath: string }>>(() => {
    const hidden = new Set(hiddenWorkingFilePaths);
    const byPath = new Map<string, { fileName: string; filePath: string }>();
    const push = (file: { fileName: string; filePath: string }): void => {
      const normalizedPath = normalizeFilePath(file.filePath);
      const matchPath = normalizeFilePathForMatch(normalizedPath);
      if (!normalizedPath || hidden.has(matchPath)) {
        return;
      }
      byPath.set(matchPath, {
        fileName: file.fileName || extractFileName(normalizedPath),
        filePath: normalizedPath,
      });
    };

    for (const file of editableFiles) {
      push(file);
    }
    for (const file of manualWorkingFiles) {
      push(file);
    }
    if (boundFile.filePath) {
      push({
        fileName: boundFile.fileName ?? extractFileName(boundFile.filePath),
        filePath: boundFile.filePath,
      });
    }

    return Array.from(byPath.values()).sort((left, right) => left.fileName.localeCompare(right.fileName, 'ru'));
  }, [boundFile.fileName, boundFile.filePath, editableFiles, hiddenWorkingFilePaths, manualWorkingFiles]);

  const pickFileFromDialog = useCallback(
    async (purpose: 'bind' | 'dependency' | 'working'): Promise<{ fileName: string; filePath: string } | null> => {
      const response = await requestExternalIpc({
        type: 'file/pick',
        payload: { purpose },
      });

      if (!response.ok) {
        throw new Error(response.error.message);
      }

      if (!response.payload.filePath) {
        return null;
      }

      const filePath = normalizeFilePath(response.payload.filePath);
      const fileName = response.payload.fileName ?? extractFileName(filePath);
      rememberWorkingFile(filePath, fileName);
      return { fileName, filePath };
    },
    [rememberWorkingFile, requestExternalIpc]
  );

  const synchronizeDependencyState = useCallback(
    async (targetIntegrationId?: string): Promise<void> => {
      const listResponse = await requestExternalIpc({
        type: 'integration/list',
        payload: { includeImplicit: true },
      });

      if (!listResponse.ok) {
        throw new Error(listResponse.error.message);
      }

      const listedIntegrations = listResponse.payload.integrations;
      setIntegrations(listedIntegrations);

      const listedIds = new Set(listedIntegrations.map((item) => item.integrationId));
      for (const existingIntegrationId of Object.keys(useGraphStore.getState().symbolCatalog)) {
        if (!listedIds.has(existingIntegrationId)) {
          clearSymbolsForIntegration(existingIntegrationId);
        }
      }

      const integrationIdsToSync = targetIntegrationId
        ? [targetIntegrationId]
        : listedIntegrations.map((item) => item.integrationId);

      for (const integrationId of integrationIdsToSync) {
        const symbolsResponse = await requestExternalIpc({
          type: 'symbols/query',
          payload: {
            query: '',
            integrationId,
            limit: 500,
          },
        });

        if (!symbolsResponse.ok) {
          throw new Error(symbolsResponse.error.message);
        }

        setSymbolsForIntegration(
          integrationId,
          symbolsResponse.payload.symbols.filter((symbol) => symbol.integrationId === integrationId)
        );
      }

      const dependencyMapResponse = await requestExternalIpc({
        type: 'dependency-map/get',
        payload: {
          rootFile: boundFile.filePath ?? undefined,
          includeSystem: false,
        },
      });

      if (!dependencyMapResponse.ok) {
        throw new Error(dependencyMapResponse.error.message);
      }

      setDependencyMap(dependencyMapResponse.payload);
      updateIndexerData({ lastUpdated: new Date().toISOString() });
      setIndexerStatus('ready');
    },
    [
      boundFile.filePath,
      clearSymbolsForIntegration,
      requestExternalIpc,
      setDependencyMap,
      setIndexerStatus,
      setIntegrations,
      setSymbolsForIntegration,
      updateIndexerData,
    ]
  );

  const flushPendingGraphMutation = useCallback((): void => {
    const payload = pendingGraphMutationRef.current;
    if (!payload) {
      return;
    }
    pendingGraphMutationRef.current = null;
    sendToExtension({
      type: 'graphChanged',
      payload,
    });
  }, []);

  const resetPendingGraphMutation = useCallback((): void => {
    pendingGraphMutationRef.current = null;
    if (graphChangedTimerRef.current !== null) {
      clearTimeout(graphChangedTimerRef.current);
      graphChangedTimerRef.current = null;
    }
  }, []);

  const enqueueGraphMutation = useCallback((graphState: GraphState): void => {
    pendingGraphMutationRef.current = buildGraphMutationPayload(graphState);
    if (graphChangedTimerRef.current !== null) {
      return;
    }

    graphChangedTimerRef.current = setTimeout(() => {
      graphChangedTimerRef.current = null;
      flushPendingGraphMutation();
    }, GRAPH_CHANGED_DEBOUNCE_MS);
  }, [flushPendingGraphMutation]);

  const sendWebviewTrace = useCallback((category: string, message: string, data?: unknown): void => {
    sendToExtension({
      type: 'reportWebviewTrace',
      payload: {
        category,
        message,
        data,
      },
    });
  }, []);

  const handleLocaleChange = (nextLocale: GraphDisplayLanguage): void => {
    setLocale(nextLocale);
    localeRef.current = nextLocale;
    const currentGraph = useGraphStore.getState().graph;
    setGraph({ ...currentGraph, displayLanguage: nextLocale }, { origin: 'local', pushHistory: false });
    vscode.setState({ graph: currentGraph, locale: nextLocale, layout: useGraphStore.getState().layout });
  };

  const handleTargetPlatformChange = (nextLanguage: ToolbarTargetPlatform): void => {
    const currentGraph = useGraphStore.getState().graph;
    if (currentGraph.language === nextLanguage) {
      return;
    }

    setGraph(
      {
        ...currentGraph,
        language: nextLanguage,
      },
      { origin: 'local' }
    );
  };

  // Обработчик смены режима редактора
  const handleEditorModeChange = (mode: EditorMode): void => {
    setEditorMode(mode);
    try {
      localStorage.setItem(EDITOR_MODE_KEY, mode);
    } catch {
      // Ignore localStorage errors
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem(UI_SCALE_KEY, String(uiScale));
    } catch {
      // Ignore localStorage errors
    }
  }, [uiScale]);

  useEffect(() => {
    const handleResize = (): void => {
      setViewportWidth(getViewportWidth());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Глобальный обработчик клавиш для панели горячих клавиш
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // H или ? для открытия панели горячих клавиш
      if ((e.key === 'h' || e.key === 'H' || e.key === '?') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Не открывать если фокус в input/textarea
        const target = e.target;
        if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
          return;
        }
        e.preventDefault();
        setShowHotkeys((prev) => !prev);
      }
      // Escape для закрытия панелей
      if (e.key === 'Escape') {
        if (showHotkeys) setShowHotkeys(false);
        if (showHelp) setShowHelp(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showHotkeys, showHelp]);

  useEffect(() => {
    const handleWebviewError = (event: ErrorEvent): void => {
      sendWebviewTrace('webview:error', event.message, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error instanceof Error ? event.error.stack : undefined,
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent): void => {
      const reason = event.reason instanceof Error
        ? { message: event.reason.message, stack: event.reason.stack }
        : event.reason;
      sendWebviewTrace('webview:unhandled-rejection', 'Unhandled promise rejection', reason);
    };

    const handleUiTrace = (event: Event): void => {
      const customEvent = event as CustomEvent<unknown>;
      if (!isRecord(customEvent.detail)) {
        return;
      }

      const detail = customEvent.detail;
      const category = typeof detail.category === 'string' ? detail.category : 'webview:ui';
      const message = typeof detail.message === 'string' ? detail.message : 'ui-trace';
      const data = detail.data;
      const signature = JSON.stringify({ category, message, data });
      if (lastUiTraceSignatureRef.current === signature) {
        return;
      }
      lastUiTraceSignatureRef.current = signature;
      sendWebviewTrace(category, message, data);
    };

    window.addEventListener('error', handleWebviewError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('multicode:ui-trace', handleUiTrace as EventListener);

    return () => {
      window.removeEventListener('error', handleWebviewError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('multicode:ui-trace', handleUiTrace as EventListener);
    };
  }, [sendWebviewTrace]);

  useEffect(() => {
    const unsubscribe = globalRegistry.subscribe(() => {
      setRegistryVersion((version) => version + 1);
    });
    return unsubscribe;
  }, []);

  const previousProblemCountRef = useRef(0);

  useEffect(() => {
    const previousCount = previousProblemCountRef.current;
    const currentCount = validationIssues.length;
    if (currentCount > 0 && previousCount === 0) {
      openUtilityTab('problems');
    }
    previousProblemCountRef.current = currentCount;
  }, [openUtilityTab, validationIssues.length]);

  // Синхронизация blueprintGraph при изменении graph
  // Обновляем blueprintGraph ТОЛЬКО при remote-изменениях (загрузка, новый граф).
  // Локальные изменения уже обновляют blueprintGraph напрямую через handleBlueprintGraphChange,
  // поэтому повторная миграция из graph перезатрёт актуальные данные (race condition).
  useEffect(() => {
    const currentOrigin = useGraphStore.getState().lastChangeOrigin;
    if (currentOrigin !== 'remote') {
      return;
    }
    try {
      const migrated = migrateToBlueprintFormat(graph);
      setBlueprintGraph(migrated);
    } catch (error) {
      console.error('[MultiCode] Migration failed:', error);
    }
  }, [graph]);

  // Обработчик изменений из BlueprintEditor
  // Мемоизирован для стабильности зависимых callback-ов (handleVariablesChange и др.)
  const handleBlueprintGraphChange = useCallback((newBlueprintGraph: BlueprintGraphState): void => {
    setBlueprintGraph(newBlueprintGraph);
    // Конвертируем обратно в GraphState для сохранения совместимости
    try {
      const newGraphState = migrateFromBlueprintFormat(newBlueprintGraph);
      const currentGraph = useGraphStore.getState().graph;
      setGraph(
        {
          ...newGraphState,
          integrationBindings: currentGraph.integrationBindings ?? [],
          symbolLocalization: currentGraph.symbolLocalization ?? {},
          dirty: true,
        },
        { origin: 'local' }
      );
    } catch (error) {
      console.error('[MultiCode] migrateFromBlueprintFormat failed:', error);
    }
  }, [setGraph]);

  const handleInsertExternalSymbol = useCallback((symbol: SymbolDescriptor, localizedName: string): void => {
    if (!isTransferableExternalSymbol(symbol)) {
      pushToast(
        'warning',
        translate(
          'dependency.insert.unsupportedKind' as TranslationKey,
          'Перенос в граф поддерживается только для function/method'
        )
      );
      return;
    }

    const nowIso = new Date().toISOString();
    const defaultPosition = { x: 320, y: 220 };
    const nextGraph = (() => {
      if (blueprintGraph.activeFunctionId && Array.isArray(blueprintGraph.functions)) {
        const targetIndex = blueprintGraph.functions.findIndex((func) => func.id === blueprintGraph.activeFunctionId);
        if (targetIndex >= 0) {
          const targetFunction = blueprintGraph.functions[targetIndex];
          const position = findNonOverlappingPosition(defaultPosition, targetFunction.graph.nodes);
          const insertedNode = createExternalSymbolCallNode(symbol, localizedName, position);
          const nextFunctions = [...blueprintGraph.functions];
          nextFunctions[targetIndex] = {
            ...targetFunction,
            graph: {
              ...targetFunction.graph,
              nodes: [...targetFunction.graph.nodes, insertedNode],
              edges: [...targetFunction.graph.edges],
            },
            updatedAt: nowIso,
          };
          return {
            ...blueprintGraph,
            functions: nextFunctions,
            updatedAt: nowIso,
            dirty: true,
          };
        }
      }

      const position = findNonOverlappingPosition(defaultPosition, blueprintGraph.nodes);
      const insertedNode = createExternalSymbolCallNode(symbol, localizedName, position);
      return {
        ...blueprintGraph,
        nodes: [...blueprintGraph.nodes, insertedNode],
        updatedAt: nowIso,
        dirty: true,
      };
    })();

    handleBlueprintGraphChange(nextGraph);
    pushToast(
      'success',
      translate('dependency.inserted' as TranslationKey, 'Символ добавлен в граф')
    );
  }, [blueprintGraph, handleBlueprintGraphChange, pushToast, translate]);

  useEffect(() => {
    localeRef.current = graph.displayLanguage;
    setLocale(graph.displayLanguage);
  }, [graph.displayLanguage]);

  useEffect(() => {
    applyUiTheme(themeTokens, effectiveTheme);
  }, [themeTokens, effectiveTheme]);

  const handleExternalIpcResponse = useCallback((response: ExternalIpcResponse): void => {
    if (!response.ok) {
      setIndexerStatus('error', response.error.message);
      return;
    }

    switch (response.type) {
      case 'integration/add':
        upsertIntegration(response.payload.integration);
        break;
      case 'integration/remove':
        if (response.payload.removed) {
          removeIntegration(response.payload.integrationId);
          clearSymbolsForIntegration(response.payload.integrationId);
        }
        break;
      case 'integration/list':
        setIntegrations(response.payload.integrations);
        break;
      case 'integration/reindex':
        updateIndexerData({ lastUpdated: new Date().toISOString() });
        setIndexerStatus('ready');
        break;
      case 'integration/diagnostics':
        updateIndexerData({
          diagnostics: response.payload.diagnostics,
          lastUpdated: new Date().toISOString(),
        });
        setIndexerStatus('ready');
        break;
      case 'symbols/query': {
        const grouped = new Map<string, SymbolDescriptor[]>();
        for (const symbol of response.payload.symbols) {
          const bucket = grouped.get(symbol.integrationId) ?? [];
          bucket.push(symbol);
          grouped.set(symbol.integrationId, bucket);
        }

        for (const [integrationId, symbols] of grouped.entries()) {
          setSymbolsForIntegration(integrationId, symbols);
        }
        break;
      }
      case 'dependency-map/get':
        setDependencyMap(response.payload);
        break;
      default:
        break;
    }
  }, [
    clearSymbolsForIntegration,
    removeIntegration,
    setDependencyMap,
    setIndexerStatus,
    setIntegrations,
    setSymbolsForIntegration,
    updateIndexerData,
    upsertIntegration,
  ]);

  useEffect(() => {
    const handler = (event: MessageEvent<unknown>): void => {
      // В VS Code webview сообщения приходят от parent window или от самого window
      // Не блокируем сообщения, просто проверяем origin
      const origin = event.origin ?? '';
      const isTrustedOrigin =
        origin === '' || 
        origin.startsWith('vscode-file://') || 
        origin.startsWith('vscode-webview://') ||
        origin.startsWith('vscode-resource://');

      if (!isTrustedOrigin) {
        console.warn('[MultiCode] Игнорируем сообщение с недоверенным origin:', origin);
        return;
      }

      // В webview origin обычно пустой или начинается с "vscode-file://" (локальное превью)
      const parsed = parseExtensionMessage(event.data);
      if (!parsed.success) {
        const externalParsed = parseExternalIpcResponse(event.data);
        if (externalParsed.success) {
          handleExternalIpcResponse(externalParsed.data);
          return;
        }

        reportWebviewError(
          `Некорректное сообщение от расширения: ${formatIssues(parsed.error.issues)}`
        );
        return;
      }

      const message = parsed.data;
      switch (message.type) {
        case 'setState':
          resetPendingGraphMutation();
          setValidation(undefined);
          setGraph(message.payload, { origin: 'remote' });
          setLocale(message.payload.displayLanguage ?? 'ru');
          localeRef.current = message.payload.displayLanguage ?? 'ru';
          vscode.setState({ graph: message.payload, locale: localeRef.current });
          break;
        case 'toast':
          pushToast(message.payload.kind, message.payload.message);
          break;
        case 'validationResult':
          setValidation(message.payload);
          break;
        case 'themeChanged':
          setThemeState(message.payload);
          if (message.payload.displayLanguage) {
            setLocale(message.payload.displayLanguage);
            localeRef.current = message.payload.displayLanguage;
          }
          break;
        case 'nodeAdded':
          setLastNodeAddedToken(Date.now());
          break;
        case 'nodesConnected':
          setLastConnectionToken(Date.now());
          break;
        case 'nodesDeleted':
          break;
        case 'translationStarted':
          setTranslationPending(true);
          setTranslationDirection(message.payload.direction);
          break;
        case 'translationFinished':
          setTranslationPending(false);
          break;
        case 'log':
          appendConsoleEntry(message.payload.level, message.payload.message, 'extension');
          if (message.payload.level === 'error') {
            console.error(message.payload.message);
          } else if (message.payload.level === 'warn') {
            console.warn(message.payload.message);
          } else {
            console.info(message.payload.message);
          }
          break;
        case 'boundFileChanged':
          setBoundFile({
            fileName: message.payload.fileName,
            // VS Code на Windows отдаёт fsPath с `\\`, а UI хранит пути в `/` для стабильных сравнения/селектов.
            filePath: message.payload.filePath ? normalizeFilePath(message.payload.filePath) : null,
          });
          break;
        case 'editableFilesChanged':
          setEditableFiles(message.payload.files);
          break;
        case 'classStorageStatusChanged':
          setClassStorageStatus(normalizeClassStorageStatus(message.payload));
          break;
        case 'classNodesConfigChanged':
          setClassNodesConfig(message.payload);
          break;
        case 'codegenProfileChanged':
          setCodegenProfile(message.payload.profile);
          break;
        case 'codegenEntrypointModeChanged':
          setCodegenEntrypointMode(message.payload.mode);
          break;
        default:
          break;
      }
    };

    window.addEventListener('message', handler);
    sendToExtension({ type: 'ready' });
    return () => window.removeEventListener('message', handler);
  }, [appendConsoleEntry, handleExternalIpcResponse, pushToast, resetPendingGraphMutation, setGraph]);

  useEffect(() => {
    const unsubscribe = useGraphStore.subscribe((state) => {
      const { graph: graphState, lastChangeOrigin: origin, layout } = state;
      vscode.setState({ graph: graphState, locale: localeRef.current, layout });
      if (origin === 'local') {
        setValidation(undefined);
        enqueueGraphMutation(graphState);
      }
    });

    return () => {
      unsubscribe();
      if (graphChangedTimerRef.current !== null) {
        clearTimeout(graphChangedTimerRef.current);
        graphChangedTimerRef.current = null;
      }
      flushPendingGraphMutation();
    };
  }, [enqueueGraphMutation, flushPendingGraphMutation]);

  useEffect(() => {
    const persistLayout = (layout: LayoutSettings): void => {
      const graphSnapshot = useGraphStore.getState().graph;
      vscode.setState({ graph: graphSnapshot, locale: localeRef.current, layout });
      try {
        localStorage.setItem(layoutStorageKey, JSON.stringify(layout));
      } catch (error) {
        console.warn('Не удалось сохранить настройки лэйаута', error);
      }
    };

    persistLayout(useGraphStore.getState().layout);

    const unsubscribe = useGraphStore.subscribe((state) => state.layout, persistLayout);
    return () => unsubscribe();
  }, []);

  const handleAddNode = (payload: { label?: string; nodeType?: GraphNodeType }): void => {
    sendToExtension({ type: 'addNode', payload });
  };

  const handleConnectNodes = (payload: { sourceId?: string; targetId?: string }): void => {
    sendToExtension({ type: 'connectNodes', payload });
  };

  const handleTranslate = (): void => {
    setTranslationPending(true);
    sendToExtension({ type: 'requestTranslate', payload: { direction: translationDirection } });
  };

  const handleCopyGraphId = (): void => {
    navigator.clipboard.writeText(graph.id);
    pushToast('success', translate('toolbar.copyId.ok', 'ID скопирован'));
  };

  const handleCodegenProfileChange = (profile: CodegenOutputProfile): void => {
    setCodegenProfile(profile);
    sendToExtension({ type: 'setCodegenProfile', payload: { profile } });
  };

  const handleCodegenEntrypointModeChange = (mode: CodegenEntrypointMode): void => {
    setCodegenEntrypointMode(mode);
    sendToExtension({ type: 'setCodegenEntrypointMode', payload: { mode } });
  };

  const handleBindFile = useCallback((filePath: string): void => {
    const trimmed = filePath.trim();
    if (!trimmed) {
      return;
    }
    const normalized = normalizeFilePath(trimmed);

    // Оптимистично обновляем UI: controlled <select> должен мгновенно показывать выбор.
    // Окончательное состояние всё равно подтвердит extension через boundFileChanged.
    setBoundFile((prev) => {
      const sameFile = prev.filePath && normalizeFilePathForMatch(prev.filePath) === normalizeFilePathForMatch(normalized);
      const fileName = sameFile && prev.fileName ? prev.fileName : extractFileName(normalized);
      return { fileName, filePath: normalized };
    });

    rememberWorkingFile(normalized);
    sendToExtension({ type: 'bindFile', payload: { filePath: normalized } });
  }, [rememberWorkingFile]);

  const handleDependencySourceFileChange = useCallback((filePath: string): void => {
    const trimmed = filePath.trim();
    if (!trimmed) {
      setDependencySourceFilePath('');
      return;
    }
    const normalized = normalizeFilePath(trimmed);
    rememberWorkingFile(normalized);
    setDependencySourceFilePath(normalized);
  }, [rememberWorkingFile]);

  const handlePickBindFile = useCallback(async (): Promise<void> => {
    try {
      const picked = await pickFileFromDialog('bind');
      if (!picked) {
        return;
      }
      handleBindFile(picked.filePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      pushToast('error', `${translate('toolbar.bindFile.pickFailed' as TranslationKey, 'Не удалось выбрать файл')}: ${message}`);
    }
  }, [handleBindFile, pickFileFromDialog, pushToast, translate]);

  const handlePickDependencyFile = useCallback(async (): Promise<void> => {
    try {
      const picked = await pickFileFromDialog('dependency');
      if (!picked) {
        return;
      }
      handleDependencySourceFileChange(picked.filePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      pushToast('error', `${translate('toolbar.dependencySource.pickFailed' as TranslationKey, 'Не удалось выбрать файл зависимости')}: ${message}`);
    }
  }, [handleDependencySourceFileChange, pickFileFromDialog, pushToast, translate]);

  const handleAddWorkingFile = useCallback(async (): Promise<void> => {
    try {
      const picked = await pickFileFromDialog('working');
      if (!picked) {
        return;
      }
      pushToast('success', translate('toolbar.workingFiles.added' as TranslationKey, 'Файл добавлен: {name}', { name: picked.fileName }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      pushToast('error', `${translate('toolbar.workingFiles.addFailed' as TranslationKey, 'Не удалось добавить файл')}: ${message}`);
    }
  }, [pickFileFromDialog, pushToast, translate]);

  const handleOpenWorkingFile = useCallback((filePath: string): void => {
    handleBindFile(filePath);
  }, [handleBindFile]);

  const openPathInEditor = useCallback(async (filePath: string, label: string): Promise<void> => {
    const normalizedPath = normalizeFilePath(filePath.trim());
    if (!normalizedPath) {
      pushToast('warning', `${label}: путь не указан`);
      return;
    }

    try {
      const response = await requestExternalIpc({
        type: 'file/open',
        payload: {
          filePath: normalizedPath,
          preview: false,
          preserveFocus: false,
        },
      });
      if (!response.ok) {
        throw new Error(response.error.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      pushToast('error', `${label}: ${message}`);
    }
  }, [pushToast, requestExternalIpc]);

  const handleOpenClassSidecar = useCallback((classId: string): void => {
    const item = classStorageStatus.classItems.find((entry) => entry.classId === classId);
    const targetPath = item?.filePath?.trim();
    if (!targetPath) {
      pushToast('warning', 'Для этого класса не найден внешний файл');
      return;
    }
    void openPathInEditor(targetPath, 'Не удалось открыть файл класса');
  }, [classStorageStatus.classItems, openPathInEditor, pushToast]);

  const handleOpenGraphMulticode = useCallback((): void => {
    const targetPath = classStorageStatus.graphFilePath?.trim();
    if (!targetPath) {
      pushToast('warning', 'Графовый .multicode-файл не найден');
      return;
    }
    void openPathInEditor(targetPath, 'Не удалось открыть файл графа .multicode');
  }, [classStorageStatus.graphFilePath, openPathInEditor, pushToast]);

  const handleReloadClassStorage = useCallback(async (classId?: string): Promise<void> => {
    try {
      const response = await requestExternalIpc({
        type: 'class/storage/reload',
        payload: classId ? { classId } : {},
      });
      if (!response.ok) {
        throw new Error(response.error.message);
      }
      const count = response.payload.reloaded;
      if (count > 0) {
        pushToast('success', classId ? 'Класс перечитан из внешнего файла' : `Перечитано классов: ${count}`);
      } else {
        pushToast('info', 'Нечего перечитывать');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      pushToast('error', `Не удалось перечитать внешний файл класса: ${message}`);
    }
  }, [pushToast, requestExternalIpc]);

  const handleRepairClassStorage = useCallback(async (classId?: string): Promise<void> => {
    try {
      const response = await requestExternalIpc({
        type: 'class/storage/repair',
        payload: classId ? { classId } : {},
      });
      if (!response.ok) {
        throw new Error(response.error.message);
      }
      const repaired = response.payload.repaired;
      if (repaired > 0) {
        pushToast('success', classId ? 'Привязка файла класса восстановлена' : `Исправлено элементов хранения классов: ${repaired}`);
      } else {
        pushToast('info', 'Исправления не требуются');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      pushToast('error', `Не удалось восстановить файл класса: ${message}`);
    }
  }, [pushToast, requestExternalIpc]);

  const handleRemoveWorkingFile = useCallback((filePath: string): void => {
    const normalized = normalizeFilePath(filePath);
    const matchPath = normalizeFilePathForMatch(normalized);
    if (boundFile.filePath && normalizeFilePathForMatch(boundFile.filePath) === matchPath) {
      pushToast(
        'warning',
        translate('toolbar.workingFiles.removeActive' as TranslationKey, 'Нельзя убрать активный файл из рабочего списка')
      );
      return;
    }

    if (dependencySourceFilePath && normalizeFilePathForMatch(dependencySourceFilePath) === matchPath) {
      setDependencySourceFilePath('');
    }

    setManualWorkingFiles((prev) => prev.filter((item) => normalizeFilePathForMatch(item.filePath) !== matchPath));
    setHiddenWorkingFilePaths((prev) => (prev.includes(matchPath) ? prev : [...prev, matchPath]));
  }, [boundFile.filePath, dependencySourceFilePath, pushToast, translate]);

  const handleAddCurrentFileDependency = useCallback(async (): Promise<void> => {
    const targetFilePath = boundFile.filePath?.trim();
    if (!targetFilePath) {
      pushToast(
        'warning',
        translate('dependency.errors.noActiveFile' as TranslationKey, 'Сначала выберите активный файл для привязки')
      );
      return;
    }

    const sourceFilePath = dependencySourceFilePath.trim();
    if (!sourceFilePath) {
      pushToast(
        'warning',
        translate('dependency.errors.noSourceFile' as TranslationKey, 'Выберите файл зависимости')
      );
      return;
    }

    const normalizedTargetFilePath = normalizeFilePath(targetFilePath);
    const normalizedSourceFilePath = normalizeFilePath(sourceFilePath);
    const nextIntegration = buildFileIntegration(normalizedSourceFilePath, [normalizedTargetFilePath]);
    const existingIntegration = integrations.find((item) => item.integrationId === nextIntegration.integrationId);
    const integration: SourceIntegration = existingIntegration
      ? {
          ...existingIntegration,
          ...nextIntegration,
          attachedFiles: dedupePaths([...(existingIntegration.attachedFiles ?? []), ...nextIntegration.attachedFiles]),
          consumerFiles: dedupePaths([...(existingIntegration.consumerFiles ?? []), normalizedTargetFilePath]),
        }
      : nextIntegration;

    try {
      setIndexerStatus('indexing');
      const addResponse = await requestExternalIpc({
        type: 'integration/add',
        payload: { integration },
      });

      if (!addResponse.ok) {
        throw new Error(addResponse.error.message);
      }

      upsertIntegration(addResponse.payload.integration);

      const reindexResponse = await requestExternalIpc({
        type: 'integration/reindex',
        payload: { integrationId: integration.integrationId, force: true },
      });

      if (!reindexResponse.ok) {
        throw new Error(reindexResponse.error.message);
      }

      await synchronizeDependencyState(integration.integrationId);
      pushToast(
        'success',
        translate('dependency.added' as TranslationKey, 'Зависимость прикреплена: {name}', {
          name: integration.displayName ?? integration.integrationId,
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      setIndexerStatus('error', message);
      pushToast(
        'error',
        `${translate('dependency.addFailed' as TranslationKey, 'Не удалось добавить зависимость')}: ${message}`
      );
    }
  }, [
    boundFile.filePath,
    dependencySourceFilePath,
    integrations,
    pushToast,
    requestExternalIpc,
    setIndexerStatus,
    synchronizeDependencyState,
    translate,
    upsertIntegration,
  ]);

  const handleDetachDependency = useCallback(async (integrationId: string): Promise<void> => {
    const integration = integrations.find((item) => item.integrationId === integrationId);
    if (!integration) {
      pushToast(
        'warning',
        translate('dependency.errors.notFound' as TranslationKey, 'Зависимость уже удалена')
      );
      return;
    }

    const normalizedActiveFilePath = boundFile.filePath ? normalizeFilePath(boundFile.filePath) : null;
    const currentConsumerFiles = dedupePaths(integration.consumerFiles ?? []);

    if (
      normalizedActiveFilePath &&
      currentConsumerFiles.length > 0 &&
      !currentConsumerFiles.some(
        (filePath) => normalizeFilePathForMatch(filePath) === normalizeFilePathForMatch(normalizedActiveFilePath)
      )
    ) {
      pushToast(
        'info',
        translate(
          'dependency.detach.notBoundToActive' as TranslationKey,
          'Эта зависимость не прикреплена к активному файлу'
        )
      );
      return;
    }

    const hasScopedConsumers = currentConsumerFiles.length > 0;
    let shouldRemoveIntegration = !normalizedActiveFilePath || !hasScopedConsumers;
    let nextIntegration: SourceIntegration | null = null;

    if (normalizedActiveFilePath && hasScopedConsumers) {
      const nextConsumerFiles = currentConsumerFiles.filter(
        (filePath) => normalizeFilePathForMatch(filePath) !== normalizeFilePathForMatch(normalizedActiveFilePath)
      );
      shouldRemoveIntegration = nextConsumerFiles.length === 0;
      if (!shouldRemoveIntegration) {
        nextIntegration = {
          ...integration,
          consumerFiles: nextConsumerFiles,
        };
      }
    }

    try {
      setIndexerStatus('indexing');

      if (shouldRemoveIntegration) {
        const removeResponse = await requestExternalIpc({
          type: 'integration/remove',
          payload: { integrationId: integration.integrationId },
        });

        if (!removeResponse.ok) {
          throw new Error(removeResponse.error.message);
        }

        if (removeResponse.payload.removed) {
          removeIntegration(integration.integrationId);
          clearSymbolsForIntegration(integration.integrationId);
        }
      } else if (nextIntegration) {
        const addResponse = await requestExternalIpc({
          type: 'integration/add',
          payload: { integration: nextIntegration },
        });

        if (!addResponse.ok) {
          throw new Error(addResponse.error.message);
        }

        upsertIntegration(addResponse.payload.integration);
      }

      await synchronizeDependencyState(shouldRemoveIntegration ? undefined : integration.integrationId);
      pushToast(
        'success',
        shouldRemoveIntegration
          ? translate('dependency.detached' as TranslationKey, 'Зависимость откреплена')
          : translate('dependency.detachedFromFile' as TranslationKey, 'Файл откреплён от зависимости')
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      setIndexerStatus('error', message);
      pushToast(
        'error',
        `${translate('dependency.detachFailed' as TranslationKey, 'Не удалось открепить зависимость')}: ${message}`
      );
    }
  }, [
    boundFile.filePath,
    clearSymbolsForIntegration,
    integrations,
    pushToast,
    removeIntegration,
    requestExternalIpc,
    setIndexerStatus,
    synchronizeDependencyState,
    translate,
    upsertIntegration,
  ]);

  useEffect(() => {
    if (boundFile.filePath) {
      rememberWorkingFile(boundFile.filePath, boundFile.fileName ?? undefined);
    }
  }, [boundFile.fileName, boundFile.filePath, rememberWorkingFile]);

  useEffect(() => {
    if (!dependencySourceFilePath && boundFile.filePath) {
      setDependencySourceFilePath(boundFile.filePath);
    }
  }, [boundFile.filePath, dependencySourceFilePath]);

  useEffect(() => {
    if (workingFiles.length === 0) {
      if (dependencySourceFilePath) {
        setDependencySourceFilePath('');
      }
      return;
    }

    const knownPaths = new Set(workingFiles.map((file) => normalizeFilePathForMatch(file.filePath)));
    const selectedPath = normalizeFilePathForMatch(dependencySourceFilePath);
    if (selectedPath && knownPaths.has(selectedPath)) {
      return;
    }

    const fallbackPath = boundFile.filePath && knownPaths.has(normalizeFilePathForMatch(boundFile.filePath))
      ? boundFile.filePath
      : workingFiles[0]?.filePath ?? '';

    setDependencySourceFilePath(fallbackPath);
  }, [boundFile.filePath, dependencySourceFilePath, workingFiles]);

  useEffect(() => {
    setTranslationDirection(graph.displayLanguage === 'ru' ? 'ru-en' : 'en-ru');
  }, [graph.displayLanguage]);

  useEffect(() => {
    let disposed = false;

    const sync = async (): Promise<void> => {
      try {
        setIndexerStatus('indexing');
        await synchronizeDependencyState();
      } catch (error) {
        if (disposed) {
          return;
        }
        const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
        setIndexerStatus('error', message);
      }
    };

    void sync();

    return () => {
      disposed = true;
    };
  }, [boundFile.filePath, setIndexerStatus, synchronizeDependencyState]);

  const handleCalculateLayout = (): void => {
    layoutRunnerRef.current();
  };

  useEffect(() => {
    const shellChanged = previousShellModeRef.current !== shellMode;
    const capabilityChanged = previousInspectorCapabilityRef.current !== canShowInspector;

    if (shellChanged || capabilityChanged) {
      setIsInspectorOpen(canShowInspector && shellMode === 'wide');
    }

    previousShellModeRef.current = shellMode;
    previousInspectorCapabilityRef.current = canShowInspector;
  }, [canShowInspector, shellMode]);

  const isInspectorDrawer = canShowInspector && shellMode !== 'wide';
  const showPinnedInspector = canShowInspector && !isInspectorDrawer;
  const showInspectorPanel = canShowInspector && (showPinnedInspector || isInspectorOpen);
  const hasInspectorSelection = selectedNodeIds.length > 0 || selectedEdgeIds.length > 0;
  const allExternalSymbols = useMemo<SymbolDescriptor[]>(() => Object.values(symbolCatalog).flat(), [symbolCatalog]);
  const utilityTabs = useMemo<Array<{ id: UtilityTabId; label: string; badge?: string | number | null }>>(
    () => [
      {
        id: 'problems',
        label: locale === 'ru' ? 'Проблемы' : 'Problems',
        badge: utilityProblemBadge,
      },
      {
        id: 'generated',
        label: locale === 'ru' ? 'Сгенерированный код' : 'Generated code',
      },
      {
        id: 'console',
        label: locale === 'ru' ? 'Консоль' : 'Console',
        badge: consoleEntries.length > 0 ? consoleEntries.length : null,
      },
      {
        id: 'packages',
        label: locale === 'ru' ? 'Пакеты' : 'Packages',
        badge: packageList.length > 0 ? packageList.length : null,
      },
      {
        id: 'dependencies',
        label: locale === 'ru' ? 'Зависимости' : 'Dependencies',
        badge: integrations.length > 0 ? integrations.length : null,
      },
    ],
    [consoleEntries.length, integrations.length, locale, packageList.length, utilityProblemBadge]
  );

  const renderInspectorContent = (): React.ReactNode => {
    if (hasInspectorSelection) {
      return (
        <>
          <SelectionSummaryPanel translate={translate} />
          <ValidationPanel
            validation={validation}
            translate={translate}
            title={translate('inspector.selection.validation' as TranslationKey, 'Проблемы выделения')}
            emptyStateLabel={translate('inspector.selection.validationOk' as TranslationKey, 'Для выделения проблем не найдено')}
            filterNodeIds={selectedNodeIds}
            filterEdgeIds={selectedEdgeIds}
          />
        </>
      );
    }

    return (
      <>
        <TranslationActions
          direction={translationDirection}
          pending={translationPending}
          onDirectionChange={setTranslationDirection}
          onTranslate={handleTranslate}
          translate={translate}
        />
        <LayoutSettingsPanel translate={translate} />
        {editorMode === 'cytoscape' && (
          <NodeActions
            onAddNode={handleAddNode}
            onConnectNodes={handleConnectNodes}
            lastNodeAddedToken={lastNodeAddedToken}
            lastConnectionToken={lastConnectionToken}
          />
        )}
        <GraphFacts
          translate={translate}
          classStorageStatus={classStorageStatus}
          classNodesAdvancedEnabled={classNodesConfig.advancedEnabled}
        />
        <ValidationPanel validation={validation} translate={translate} />
      </>
    );
  };

  const renderUtilityContent = (): React.ReactNode => {
    switch (utilityPanelState.activeTab) {
      case 'generated':
        return (
          <div className="utility-panel__fill" data-testid="utility-generated-content">
            <EnhancedCodePreviewPanel
              graph={blueprintGraph}
              locale={locale}
              packageRegistrySnapshot={packageRegistrySnapshotForPreview}
              layout="bottom"
              onGenerateComplete={(result) => {
                pushToast(
                  'success',
                  result.success
                    ? translate('toast.generation.success', 'Код успешно сгенерирован')
                    : translate('toast.generation.error', 'Ошибка генерации кода')
                );
              }}
            />
          </div>
        );
      case 'console':
        return (
          <ConsoleUtilityPanel
            locale={locale}
            logs={consoleEntries}
            onClear={() => setConsoleEntries([])}
          />
        );
      case 'packages':
        return <PackagesUtilityPanel locale={locale} packages={packageList} />;
      case 'dependencies':
        return (
          <div className="utility-panel__fill" data-testid="utility-dependencies-content">
            <DependencyViewPanel
              useGraphStore={useGraphStore}
              mode="standalone"
              displayLanguage={locale}
              activeFilePath={boundFile.filePath}
              onDetachDependency={handleDetachDependency}
              onInsertSymbol={handleInsertExternalSymbol}
            />
          </div>
        );
      case 'problems':
      default:
        return (
          <ValidationPanel
            validation={validation}
            translate={translate}
            title={translate('utility.problems.title' as TranslationKey, 'Проблемы графа')}
            emptyStateLabel={translate('utility.problems.ok' as TranslationKey, 'Проблемы не найдены')}
          />
        );
    }
  };

  // Render the appropriate editor based on mode
  const renderEditor = () => {
    if (editorMode === 'blueprint') {
      return (
        <BlueprintEditor
          graph={blueprintGraph}
          onGraphChange={handleBlueprintGraphChange}
          displayLanguage={locale}
          classStorageStatus={classStorageStatus}
          classNodesAdvancedEnabled={classNodesConfig.advancedEnabled}
          onOpenClassSidecar={handleOpenClassSidecar}
          onOpenGraphMulticode={handleOpenGraphMulticode}
          onReloadClassStorage={handleReloadClassStorage}
          onRepairClassStorage={handleRepairClassStorage}
          externalSymbols={allExternalSymbols}
          integrations={integrations}
          activeFilePath={boundFile.filePath}
          resolveLocalizedSymbolName={(symbol) => resolveLocalizedSymbol(symbol, locale)}
          packageSettings={bootPackageSettings}
        />
      );
    }

    if (editorMode === 'dependency') {
      return (
        <DependencyViewPanel
          useGraphStore={useGraphStore}
          mode="standalone"
          displayLanguage={locale}
          activeFilePath={boundFile.filePath}
          onDetachDependency={handleDetachDependency}
          onInsertSymbol={handleInsertExternalSymbol}
        />
      );
    }
    
    // Classic Cytoscape editor
    return (
      <GraphEditor
        graphStore={useGraphStore}
        theme={themeTokens}
        onAddNode={handleAddNode}
        onConnectNodes={handleConnectNodes}
        validation={validation}
        onLayoutReady={(runner) => {
          layoutRunnerRef.current = runner;
        }}
      />
    );
  };

  return (
    <div className={`app-shell app-shell--${shellMode}`} style={{ zoom: uiScale }}>
      <Toolbar
        locale={locale}
        onLocaleChange={handleLocaleChange}
        translate={translate}
        onCalculate={handleCalculateLayout}
        onTranslate={handleTranslate}
        translationPending={translationPending}
        onCopyGraphId={handleCopyGraphId}
        editorMode={editorMode}
        onEditorModeChange={handleEditorModeChange}
        onTargetPlatformChange={handleTargetPlatformChange}
        showCodePreview={showCodePreview}
        onShowCodePreviewChange={handleCodePreviewVisibility}
        onShowHotkeys={() => setShowHotkeys(true)}
        onShowHelp={() => setShowHelp(true)}
        uiScale={uiScale}
        onUiScaleChange={setUiScale}
        boundFileName={boundFile.fileName}
        boundFilePath={boundFile.filePath}
        classStorageStatus={classStorageStatus}
        classNodesAdvancedEnabled={classNodesConfig.advancedEnabled}
        workingFiles={workingFiles}
        dependencySourceFilePath={dependencySourceFilePath}
        onDependencySourceFileChange={handleDependencySourceFileChange}
        onBindFile={handleBindFile}
        onPickBindFile={() => void handlePickBindFile()}
        onPickDependencyFile={() => void handlePickDependencyFile()}
        onAddCurrentFileDependency={handleAddCurrentFileDependency}
        onAddWorkingFile={() => void handleAddWorkingFile()}
        onOpenWorkingFile={handleOpenWorkingFile}
        onRemoveWorkingFile={handleRemoveWorkingFile}
        codegenProfile={codegenProfile}
        onCodegenProfileChange={handleCodegenProfileChange}
        codegenEntrypointMode={codegenEntrypointMode}
        onCodegenEntrypointModeChange={handleCodegenEntrypointModeChange}
        shellMode={shellMode}
        showInspectorToggle={isInspectorDrawer}
        isInspectorOpen={isInspectorOpen}
        onToggleInspector={() => setIsInspectorOpen((current) => !current)}
        validation={validation}
      />
      
      {/* Панель горячих клавиш */}
      <HotkeysPanel
        isOpen={showHotkeys}
        onClose={() => setShowHotkeys(false)}
        locale={locale}
      />
      
      {/* Панель справки */}
      {showHelp && (
        <HelpPanel
          locale={locale}
          onClose={() => setShowHelp(false)}
        />
      )}
      
      <div className={`workspace${showPinnedInspector ? ' with-sidebar' : ''}${isInspectorDrawer && isInspectorOpen ? ' with-drawer' : ''}`}>
        <div className="canvas-wrapper">
          {renderEditor()}
        </div>
        
        {isInspectorDrawer && isInspectorOpen && (
          <button
            type="button"
            className="side-panel-backdrop"
            aria-label={locale === 'ru' ? 'Закрыть инспектор' : 'Close inspector'}
            data-testid="inspector-backdrop"
            onClick={() => setIsInspectorOpen(false)}
          />
        )}

        {/* Side panels */}
        {showInspectorPanel && (
          <div className={`side-panel${isInspectorDrawer ? ' side-panel--drawer' : ''}`} data-testid="inspector-panel">
            {isInspectorDrawer && (
              <div className="side-panel__drawer-header">
                <div className="side-panel__drawer-title">
                  {hasInspectorSelection
                    ? (locale === 'ru' ? 'Инспектор выделения' : 'Selection inspector')
                    : (locale === 'ru' ? 'Инспектор графа' : 'Graph inspector')}
                </div>
                <button
                  type="button"
                  className="side-panel__drawer-close"
                  onClick={() => setIsInspectorOpen(false)}
                  data-testid="inspector-drawer-close"
                >
                  {locale === 'ru' ? 'Скрыть' : 'Hide'}
                </button>
              </div>
            )}
            {renderInspectorContent()}
          </div>
        )}
      </div>
      <UtilityPanel
        locale={locale}
        isOpen={utilityPanelState.isOpen}
        activeTab={utilityPanelState.activeTab}
        tabs={utilityTabs}
        onSelectTab={(tab) => openUtilityTab(tab)}
        onClose={closeUtilityPanel}
      >
        {renderUtilityContent()}
      </UtilityPanel>
      <ToastContainer
        toasts={toasts}
        onClose={(id) => setToasts((prev) => prev.filter((item) => item.id !== id))}
        translate={translate}
      />
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
