import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  webviewToExtensionMessageSchema,
  type ThemeMessage,
  type TranslationDirection,
  type WebviewToExtensionMessage
} from '../shared/messages';
import HelpPanel from './HelpPanel';
import { globalRegistry } from '../shared/packageLoader';

// Feature toggle: 'blueprint' = Visual Flow (новый), 'cytoscape' = Cytoscape (старый)
type EditorMode = 'blueprint' | 'cytoscape';
const EDITOR_MODE_KEY = 'multicode.editorMode';

const getInitialEditorMode = (): EditorMode => {
  try {
    const saved = localStorage.getItem(EDITOR_MODE_KEY);
    if (saved === 'blueprint' || saved === 'cytoscape') {
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

declare const initialGraphState: GraphState | undefined;
declare const initialTheme: ThemeMessage | undefined;
const vscode = acquireVsCodeApi<PersistedState>();

const readLayoutFromLocalStorage = (): LayoutSettings | undefined => {
  try {
    const cached = localStorage.getItem(layoutStorageKey);
    if (!cached) {
      return undefined;
    }
    const parsed = JSON.parse(cached) as Partial<LayoutSettings>;
    return normalizeLayoutSettings(parsed);
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
const bootLocale: GraphDisplayLanguage =
  (persistedState?.locale as GraphDisplayLanguage | undefined) ??
  bootGraph.displayLanguage ??
  'ru';
const useGraphStore: GraphStoreHook = createGraphStore(bootGraph, bootLayout);
const initialThemeMessage: ThemeMessage =
  initialTheme ?? ({ preference: 'auto', hostTheme: 'dark' } as ThemeMessage);

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

const sendToExtension = (message: WebviewToExtensionMessage): void => {
  const parsed = webviewToExtensionMessageSchema.safeParse(message);
  if (!parsed.success) {
    console.error(`Невозможно отправить сообщение в расширение: ${formatIssues(parsed.error.issues)}`);
    return;
  }
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
  onCopyGraphId: () => void;
  editorMode: EditorMode;
  onEditorModeChange: (mode: EditorMode) => void;
  showCodePreview: boolean;
  onShowCodePreviewChange: (show: boolean) => void;
  onShowHotkeys: () => void;
  onShowHelp: () => void;
}> = ({ locale, onLocaleChange, translate, onCalculate, onCopyGraphId, editorMode, onEditorModeChange, showCodePreview, onShowCodePreviewChange, onShowHotkeys, onShowHelp }) => {
  const graph = useGraphStore((state) => state.graph);
  const [pending, setPending] = useState(false);

  const send = (type: 'requestNewGraph' | 'requestSave' | 'requestLoad' | 'requestGenerate' | 'requestValidate') => {
    setPending(true);
    sendToExtension({ type });
    setTimeout(() => setPending(false), 200);
  };

  return (
    <div className="toolbar">
      {/* Информация о графе */}
      <div className="toolbar-info">
        <div className="toolbar-title">{graph.name}</div>
        <div className="toolbar-subtitle">
          {translate('toolbar.targetPlatform', '{language}', { language: graph.language.toUpperCase() })}
        </div>
      </div>
      
      <div className="toolbar-actions">
        {/* Группа: Настройки */}
        <div className="toolbar-group">
          <select
            value={editorMode}
            onChange={(event) => onEditorModeChange(event.target.value as EditorMode)}
            title={locale === 'ru' ? 'Режим редактора' : 'Editor mode'}
            className="toolbar-select"
          >
            <option value="blueprint">{locale === 'ru' ? '🎨 Визуальный' : '🎨 Visual'}</option>
            <option value="cytoscape">{locale === 'ru' ? '📊 Классический' : '📊 Classic'}</option>
          </select>
          <select
            value={locale}
            onChange={(event) => onLocaleChange(event.target.value as GraphDisplayLanguage)}
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
          <button onClick={onCalculate} disabled={pending} title={translate('tooltip.calculateLayout', 'Рассчитать')}>
            🔄 {translate('toolbar.calculateLayout', 'Лэйаут')}
          </button>
          <button onClick={onCopyGraphId} disabled={pending} title={translate('tooltip.copyId', 'Скопировать ID')}>
            🆔
          </button>
        </div>
        
        {/* Группа: Код */}
        <div className="toolbar-group">
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
  if (!validation) {
    return null;
  }

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
            if (item.nodes?.length) {
              targets.push(`${translate('overview.nodes', 'Узлы')}: ${item.nodes.join(', ')}`);
            }
            if (item.edges?.length) {
              targets.push(`${translate('overview.edges', 'Связи')}: ${item.edges.join(', ')}`);
            }
            const details = targets.length ? ` (${targets.join(' · ')})` : '';
            return (
              <li
                key={`${item.message}-${index}`}
                className={item.severity === 'error' ? 'text-error' : 'text-warn'}
              >
                {item.message}
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
const translationDirections: Array<{ value: 'ru-en' | 'en-ru'; label: string }> = [
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
          <select value={type} onChange={(event) => setType(event.target.value as GraphNodeType)}>
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
  direction: 'ru-en' | 'en-ru';
  pending: boolean;
  onDirectionChange: (direction: 'ru-en' | 'en-ru') => void;
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
          onChange={(event) => onDirectionChange(event.target.value as 'ru-en' | 'en-ru')}
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
            onChange={(event) => setLayout({ algorithm: event.target.value as LayoutSettings['algorithm'] })}
          >
            <option value="dagre">{translate('layout.algorithm.dagre', 'Dagre')}</option>
            <option value="klay">{translate('layout.algorithm.klay', 'Klay')}</option>
          </select>
        </label>
        <label>
          <div className="panel-label">{translate('layout.rankDir', 'Направление рангов')}</div>
          <select
            value={layout.rankDir}
            onChange={(event) => setLayout({ rankDir: event.target.value as LayoutSettings['rankDir'] })}
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
  
  // Hotkeys panel state
  const [showHotkeys, setShowHotkeys] = useState(false);
  
  // Help panel state
  const [showHelp, setShowHelp] = useState(false);
  
  // Blueprint graph state (derived from GraphState for Blueprint editor)
  const [blueprintGraph, setBlueprintGraph] = useState<BlueprintGraphState>(() => 
    migrateToBlueprintFormat(graph)
  );

  const effectiveTheme = resolveEffectiveTheme(themeState.preference, themeState.hostTheme);
  const themeTokens = useMemo(() => getThemeTokens(effectiveTheme), [effectiveTheme]);

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
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        setShowHotkeys(prev => !prev);
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

  // Синхронизация blueprintGraph при изменении graph
  useEffect(() => {
    console.log('[MultiCode] Syncing blueprintGraph from graph:', {
      graphId: graph?.id,
      graphName: graph?.name,
      nodesCount: graph?.nodes?.length ?? 0,
      edgesCount: graph?.edges?.length ?? 0,
    });
    try {
      const migrated = migrateToBlueprintFormat(graph);
      console.log('[MultiCode] Migration successful:', {
        nodesCount: migrated?.nodes?.length ?? 0,
        edgesCount: migrated?.edges?.length ?? 0,
      });
      setBlueprintGraph(migrated);
    } catch (error) {
      console.error('[MultiCode] Migration failed:', error);
    }
  }, [graph]);

  // Обработчик изменений из BlueprintEditor
  const handleBlueprintGraphChange = (newBlueprintGraph: BlueprintGraphState): void => {
    console.log('[MultiCode] Blueprint graph changed:', {
      nodesCount: newBlueprintGraph?.nodes?.length ?? 0,
      edgesCount: newBlueprintGraph?.edges?.length ?? 0,
    });
    setBlueprintGraph(newBlueprintGraph);
    // Конвертируем обратно в GraphState для сохранения совместимости
    try {
      const newGraphState = migrateFromBlueprintFormat(newBlueprintGraph);
      setGraph({ ...newGraphState, dirty: true }, { origin: 'local' });
    } catch (error) {
      console.error('[MultiCode] migrateFromBlueprintFormat failed:', error);
    }
  };

  useEffect(() => {
    localeRef.current = graph.displayLanguage;
    setLocale(graph.displayLanguage);
  }, [graph.displayLanguage]);

  useEffect(() => {
    applyUiTheme(themeTokens, effectiveTheme);
  }, [themeTokens, effectiveTheme]);

  useEffect(() => {
    const handler = (event: MessageEvent<unknown>): void => {
      if (event.source !== window) {
        console.warn('Игнорируем сообщение из неизвестного окна', event);
        return;
      }

      const origin = event.origin ?? '';
      const isTrustedOrigin =
        origin === '' || origin.startsWith('vscode-file://') || origin.startsWith('vscode-webview://');

      if (!isTrustedOrigin) {
        console.warn('Игнорируем сообщение с неподдерживаемым origin', origin, event);
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
        sendToExtension({
          type: 'graphChanged',
          payload: {
            nodes: graphState.nodes,
            edges: graphState.edges,
            name: graphState.name,
            language: graphState.language,
            displayLanguage: graphState.displayLanguage
          }
        });
      }
    });

    return () => unsubscribe();
  }, []);

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

  useEffect(() => {
    setTranslationDirection(graph.displayLanguage === 'ru' ? 'ru-en' : 'en-ru');
  }, [graph.displayLanguage]);

  const handleCalculateLayout = (): void => {
    layoutRunnerRef.current();
  };


  const packageNodeTypesForPreview = Array.from(globalRegistry.getAllNodeDefinitions().keys()) as BlueprintNodeType[];

  // Render the appropriate editor based on mode
  const renderEditor = () => {
    if (editorMode === 'blueprint') {
      return (
        <BlueprintEditor
          graph={blueprintGraph}
          onGraphChange={handleBlueprintGraphChange}
          displayLanguage={locale}
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
        onCopyGraphId={handleCopyGraphId}
        editorMode={editorMode}
        onEditorModeChange={handleEditorModeChange}
        showCodePreview={showCodePreview}
        onShowCodePreviewChange={setShowCodePreview}
        onShowHotkeys={() => setShowHotkeys(true)}
        onShowHelp={() => setShowHelp(true)}
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
      
      <div className="workspace">
        <div className="canvas-wrapper">
          {renderEditor()}
        </div>
        
        {/* Side panels */}
        {(editorMode === 'cytoscape' || showCodePreview) && (
          <div className="side-panel">
            {/* Enhanced Code Preview for blueprint editor */}
            {editorMode === 'blueprint' && showCodePreview && (
              <EnhancedCodePreviewPanel
                graph={blueprintGraph}
                locale={locale}
                getNodeDefinition={(type) => globalRegistry.getNodeDefinition(type)}
                packageNodeTypes={packageNodeTypesForPreview}
                onGenerateComplete={(result) => {
                  pushToast('success', result.success 
                    ? translate('toast.generation.success', 'Код успешно сгенерирован')
                    : translate('toast.generation.error', 'Ошибка генерации кода'));
                }}
              />
            )}
            
            {/* Classic panels for cytoscape editor */}
            {editorMode === 'cytoscape' && (
              <>
                <TranslationActions
                  direction={translationDirection}
                  pending={translationPending}
                  onDirectionChange={setTranslationDirection}
                  onTranslate={handleTranslate}
                  translate={translate}
                />
                <LayoutSettingsPanel translate={translate} />
                <NodeActions
                  onAddNode={handleAddNode}
                  onConnectNodes={handleConnectNodes}
                  lastNodeAddedToken={lastNodeAddedToken}
                  lastConnectionToken={lastConnectionToken}
                />
                <GraphFacts translate={translate} />
                <ValidationPanel validation={validation} translate={translate} />
              </>
            )}
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
