import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type { SymbolDescriptor } from '../shared/externalSymbols';
import {
  BlueprintGraphState,
  BlueprintNodeType,
  migrateToBlueprintFormat,
  migrateFromBlueprintFormat,
} from '../shared/blueprintTypes';
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
  parseExtensionMessage,
  parseThemeMessage,
  webviewToExtensionMessageSchema,
  type GraphMutationPayload,
  type ThemeMessage,
  type TranslationDirection,
  type WebviewToExtensionMessage
} from '../shared/messages';
import HelpPanel from './HelpPanel';
import { globalRegistry } from '../shared/packageLoader';

// Feature toggle: 'blueprint' = Visual Flow (новый), 'cytoscape' = Cytoscape (старый)
type EditorMode = 'blueprint' | 'cytoscape' | 'dependency';
const EDITOR_MODE_KEY = 'multicode.editorMode';

type CppStandard = 'cpp14' | 'cpp17' | 'cpp20' | 'cpp23';
type CodegenOutputProfile = 'clean' | 'learn' | 'debug' | 'recovery';

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

type ToastKind = 'info' | 'success' | 'warning' | 'error';

type Toast = { id: number; kind: ToastKind; message: string };

type PersistedState = { graph?: GraphState; locale?: GraphDisplayLanguage; layout?: LayoutSettings };

const layoutStorageKey = 'multicode.layout';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isEditorMode = (value: string): value is EditorMode =>
  value === 'blueprint' || value === 'cytoscape' || value === 'dependency';

const isGraphDisplayLanguage = (value: unknown): value is GraphDisplayLanguage =>
  value === 'ru' || value === 'en';

const isTranslationDirection = (value: string): value is TranslationDirection =>
  value === 'ru-en' || value === 'en-ru';

const isCodegenOutputProfile = (value: string): value is CodegenOutputProfile =>
  value === 'clean' || value === 'learn' || value === 'debug' || value === 'recovery';

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
  nodes: graphState.nodes,
  edges: graphState.edges,
  name: graphState.name,
  language: graphState.language,
  displayLanguage: graphState.displayLanguage,
  variables: graphState.variables,
  functions: graphState.functions,
});

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
  showCodePreview: boolean;
  onShowCodePreviewChange: (show: boolean) => void;
  onShowHotkeys: () => void;
  onShowHelp: () => void;
  boundFileName: string | null;
  boundFilePath: string | null;
  codegenProfile: CodegenOutputProfile;
  onCodegenProfileChange: (profile: CodegenOutputProfile) => void;
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
  showCodePreview,
  onShowCodePreviewChange,
  onShowHotkeys,
  onShowHelp,
  boundFileName,
  boundFilePath,
  codegenProfile,
  onCodegenProfileChange,
}) => {
  const graph = useGraphStore((state) => state.graph);
  const [pending, setPending] = useState(false);
  // Для "▶ Запустить" стандарт фиксирован на C++23 (strict).
  const cppStandard: CppStandard = 'cpp23';

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

  return (
    <div className="toolbar">
      {/* Информация о графе */}
      <div className="toolbar-info">
        <div className="toolbar-title">{graph.name}</div>
        <div className="toolbar-subtitle">
          {translate('toolbar.targetPlatform', '{language}', { language: graph.language.toUpperCase() })}
          {boundFileName && (
            <span className="toolbar-bound-file" title={boundFilePath ?? ''}>
              {' · '}📄 {boundFileName}
            </span>
          )}
          {!boundFileName && (
            <span className="toolbar-bound-file toolbar-bound-file--none">
              {' · '}{translate('toolbar.noFile', 'файл не привязан')}
            </span>
          )}
        </div>
      </div>
      
      <div className="toolbar-actions">
        {/* Группа: Настройки */}
        <div className="toolbar-group">
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
          >
            <option value="blueprint">{locale === 'ru' ? '🎨 Визуальный' : '🎨 Visual'}</option>
            <option value="cytoscape">{locale === 'ru' ? '📊 Классический' : '📊 Classic'}</option>
            <option value="dependency">{locale === 'ru' ? '🧩 Зависимости' : '🧩 Dependency'}</option>
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
        </div>
        
        {/* Группа: Файл */}
        <div className="toolbar-group">
          <button onClick={() => send('requestNewGraph')} disabled={pending} title={translate('tooltip.newGraph', 'Новый граф')}>
            📄 {translate('toolbar.newGraph', 'Новый')}
          </button>
          <button onClick={() => send('requestLoad')} disabled={pending} title={translate('tooltip.loadGraph', 'Загрузить')}>
            📂 {translate('toolbar.loadGraph', 'Открыть')}
          </button>
          <button onClick={() => send('requestSave')} disabled={pending} title={translate('tooltip.saveGraph', 'Сохранить')}>
            💾 {translate('toolbar.saveGraph', 'Сохранить')}
          </button>
        </div>
        
        {/* Группа: Действия */}
        <div className="toolbar-group">
          <button onClick={() => send('requestValidate')} disabled={pending} title={translate('tooltip.validateGraph', 'Проверить')}>
            ✅ {translate('toolbar.validateGraph', 'Проверить')}
          </button>
          <button
            onClick={onTranslate}
            disabled={pending || translationPending}
            title={translate('translation.title', 'Перевод графа')}
          >
            🌐 {translationPending
              ? translate('translation.translating', 'Перевод...')
              : translate('translation.translate', 'Перевести')}
          </button>
          <button onClick={onCalculate} disabled={pending} title={translate('tooltip.calculateLayout', 'Рассчитать')}>
            🔄 {translate('toolbar.calculateLayout', 'Лэйаут')}
          </button>
          <button onClick={onCopyGraphId} disabled={pending} title={translate('tooltip.copyId', 'Скопировать ID')}>
            🆔
          </button>
        </div>
        
        {/* Группа: Код */}
        <div className="toolbar-group">
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
          <select
            title={locale === 'ru' ? 'Стандарт C++: C++23 (фиксировано)' : 'C++ Standard: C++23 (fixed)'}
            className="toolbar-select"
            value={cppStandard}
            disabled
          >
            <option value="cpp23">C++23</option>
          </select>
          <button
            onClick={() => onShowCodePreviewChange(!showCodePreview)}
            disabled={pending}
            title={showCodePreview ? translate('toolbar.hideCode' as TranslationKey, 'Скрыть код') : translate('toolbar.showCode' as TranslationKey, 'Показать код')}
            className={showCodePreview ? 'btn-active' : ''}
          >
            {showCodePreview ? '👁️ Код' : '👁️‍🗨️ Код'}
          </button>
          <button onClick={() => send('requestGenerate')} disabled={pending} title={translate('toolbar.generate', 'Генерировать')}>
            ⚡ {translate('toolbar.generate', 'Генерировать')}
          </button>
          <button 
            onClick={() => send('requestCompileAndRun')} 
            disabled={pending}
            title={locale === 'ru' ? 'Скомпилировать и запустить' : 'Compile and Run'}
          >
            ▶️ {locale === 'ru' ? 'Запустить' : 'Run'}
          </button>
        </div>
        
        {/* Группа: Помощь */}
        <div className="toolbar-group">
          <button onClick={onShowHelp} title={locale === 'ru' ? 'Справка (?)' : 'Help (?)'}>
            ❓
          </button>
          <button onClick={onShowHotkeys} title={locale === 'ru' ? 'Горячие клавиши (H)' : 'Hotkeys (H)'}>
            ⌨️
          </button>
        </div>
      </div>
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

const GraphFacts: React.FC<{ translate: (key: TranslationKey, fallback: string) => string }> = ({ translate }) => {
  const graph = useGraphStore((state) => state.graph);
  const nodeCount = graph.nodes.length;
  const edgeCount = graph.edges.length;

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
          <div className={graph.dirty ? 'badge badge-warn' : 'badge badge-ok'}>
            {graph.dirty
              ? translate('toolbar.unsaved', 'Есть несохранённые изменения')
              : translate('overview.synced', 'Синхронизировано')}
          </div>
        </div>
      </div>
    </div>
  );
};

const ValidationPanel: React.FC<{
  validation?: ValidationResult;
  translate: (key: TranslationKey, fallback: string) => string;
}> = ({ validation, translate }) => {
  const graph = useGraphStore((state) => state.graph);

  const resolveNodeDisplayName = useCallback(
    (node: GraphState['nodes'][number]): string => {
      const directLabel = node.label.trim();
      if (directLabel.length > 0) {
        return directLabel;
      }

      if (!isRecord(node.blueprintNode)) {
        return node.id;
      }

      const blueprintNode = node.blueprintNode;
      const customLabel = typeof blueprintNode.customLabel === 'string' ? blueprintNode.customLabel.trim() : '';
      if (customLabel.length > 0) {
        return customLabel;
      }

      const blueprintLabel = typeof blueprintNode.label === 'string' ? blueprintNode.label.trim() : '';
      if (blueprintLabel.length > 0) {
        return blueprintLabel;
      }

      const properties = isRecord(blueprintNode.properties) ? blueprintNode.properties : undefined;
      const variableNameRu = typeof properties?.nameRu === 'string' ? properties.nameRu.trim() : '';
      const variableNameEn = typeof properties?.name === 'string' ? properties.name.trim() : '';
      const variableName = variableNameRu || variableNameEn;
      const nodeType = typeof blueprintNode.type === 'string' ? blueprintNode.type : node.type;

      if (variableName.length > 0) {
        if (nodeType === 'GetVariable') {
          return `${graph.displayLanguage === 'ru' ? 'Получить' : 'Get'}: ${variableName}`;
        }
        if (nodeType === 'SetVariable') {
          return `${graph.displayLanguage === 'ru' ? 'Установить' : 'Set'}: ${variableName}`;
        }
        return variableName;
      }

      return nodeType || node.id;
    },
    [graph.displayLanguage]
  );

  if (!validation) {
    return null;
  }

  const nodeLabelById = new Map(
    graph.nodes.map((node) => [node.id, resolveNodeDisplayName(node)])
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

    return normalized;
  };

  const issues: ValidationIssue[] = validation.issues?.length
    ? validation.issues
    : [
        ...validation.errors.map((message) => ({
          severity: 'error' as const,
          message,
          nodes: undefined,
          edges: undefined
        })),
        ...validation.warnings.map((message) => ({
          severity: 'warning' as const,
          message,
          nodes: undefined,
          edges: undefined
        }))
      ];

  const hasProblems = issues.length > 0;

  return (
    <div className="panel">
      <div className="panel-title">{translate('toolbar.validate', 'Валидация')}</div>
      {!hasProblems ? (
        <div className="badge badge-ok">{translate('toasts.validationOk', 'Ошибок не найдено')}</div>
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

const App: React.FC = () => {
  const setGraph = useGraphStore((state) => state.setGraph);
  const graph = useGraphStore((state) => state.graph);
  const integrations = useGraphStore((state) => state.integrations);
  const symbolCatalog = useGraphStore((state) => state.symbolCatalog);
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
  
  // Code preview state
  const [showCodePreview, setShowCodePreview] = useState(false);
  const [codegenProfile, setCodegenProfile] = useState<CodegenOutputProfile>('clean');
  
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

  const translate = (
    key: TranslationKey,
    fallback: string,
    replacements?: Record<string, string>
  ): string => getTranslation(localeRef.current, key, replacements, fallback);

  const pushToast = (kind: ToastKind, message: string): void => {
    const id = Date.now() + Math.round(Math.random() * 1000);
    setToasts((prev) => [...prev.slice(-3), { id, kind, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), 3200);
  };

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

  // Обработчик смены режима редактора
  const handleEditorModeChange = (mode: EditorMode): void => {
    setEditorMode(mode);
    try {
      localStorage.setItem(EDITOR_MODE_KEY, mode);
    } catch {
      // Ignore localStorage errors
    }
  };
  
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
      setGraph({ ...newGraphState, dirty: true }, { origin: 'local' });
    } catch (error) {
      console.error('[MultiCode] migrateFromBlueprintFormat failed:', error);
    }
  }, [setGraph]);

  useEffect(() => {
    localeRef.current = graph.displayLanguage;
    setLocale(graph.displayLanguage);
  }, [graph.displayLanguage]);

  useEffect(() => {
    applyUiTheme(themeTokens, effectiveTheme);
  }, [themeTokens, effectiveTheme]);

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
        reportWebviewError(
          `Некорректное сообщение от расширения: ${formatIssues(parsed.error.issues)}`
        );
        return;
      }
      const message = parsed.data;
      switch (message.type) {
        case 'setState':
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
            filePath: message.payload.filePath,
          });
          break;
        case 'codegenProfileChanged':
          setCodegenProfile(message.payload.profile);
          break;
        default:
          break;
      }
    };

    window.addEventListener('message', handler);
    sendToExtension({ type: 'ready' });
    return () => window.removeEventListener('message', handler);
  }, [setGraph]);

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

  useEffect(() => {
    setTranslationDirection(graph.displayLanguage === 'ru' ? 'ru-en' : 'en-ru');
  }, [graph.displayLanguage]);

  const handleCalculateLayout = (): void => {
    layoutRunnerRef.current();
  };

  const showSidePanel = editorMode === 'blueprint' || editorMode === 'cytoscape' || showCodePreview;
  const allExternalSymbols = useMemo<SymbolDescriptor[]>(() => Object.values(symbolCatalog).flat(), [symbolCatalog]);

  // Render the appropriate editor based on mode
  const renderEditor = () => {
    if (editorMode === 'blueprint') {
      return (
        <BlueprintEditor
          graph={blueprintGraph}
          onGraphChange={handleBlueprintGraphChange}
          displayLanguage={locale}
          externalSymbols={allExternalSymbols}
          integrations={integrations}
          activeFilePath={boundFile.filePath}
          resolveLocalizedSymbolName={(symbol) => resolveLocalizedSymbol(symbol, locale)}
        />
      );
    }

    if (editorMode === 'dependency') {
      return (
        <DependencyViewPanel
          useGraphStore={useGraphStore}
          displayLanguage={locale}
          activeFilePath={boundFile.filePath}
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
    <div className="app-shell">
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
        showCodePreview={showCodePreview}
        onShowCodePreviewChange={setShowCodePreview}
        onShowHotkeys={() => setShowHotkeys(true)}
        onShowHelp={() => setShowHelp(true)}
        boundFileName={boundFile.fileName}
        boundFilePath={boundFile.filePath}
        codegenProfile={codegenProfile}
        onCodegenProfileChange={handleCodegenProfileChange}
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
      
      <div className={`workspace${showSidePanel ? ' with-sidebar' : ''}`}>
        <div className="canvas-wrapper">
          {renderEditor()}
        </div>
        
        {/* Side panels */}
        {showSidePanel && (
          <div className="side-panel">
            {/* Enhanced Code Preview for blueprint editor */}
            {editorMode === 'blueprint' && showCodePreview && (
              <EnhancedCodePreviewPanel
                graph={blueprintGraph}
                locale={locale}
                packageRegistrySnapshot={packageRegistrySnapshotForPreview}
                onGenerateComplete={(result) => {
                  pushToast('success', result.success 
                    ? translate('toast.generation.success', 'Код успешно сгенерирован')
                    : translate('toast.generation.error', 'Ошибка генерации кода'));
                }}
              />
            )}
            
            {/* Общие панели для Blueprint и Classic */}
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
              <GraphFacts translate={translate} />
              <ValidationPanel validation={validation} translate={translate} />
            </>
          </div>
        )}
      </div>
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
