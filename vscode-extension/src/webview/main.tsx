import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createDefaultGraphState,
  type GraphNode,
  type GraphNodeType,
  type GraphDisplayLanguage,
  type GraphState
} from '../shared/graphState';
import type { ValidationResult } from '../shared/validator';
import { getTranslation, type TranslationKey } from '../shared/translations';
import { GraphEditor } from './GraphEditor';
import { createGraphStore, type GraphStoreHook } from './store';
import {
  getThemeTokens,
  resolveEffectiveTheme,
  type EffectiveTheme,
  type ThemeSetting,
  type ThemeTokens
} from './theme';
import {
  parseExtensionMessage,
  webviewToExtensionMessageSchema,
  type ExtensionToWebviewMessage,
  type ThemeMessage,
  type TranslationDirection,
  type WebviewToExtensionMessage
} from '../shared/messages';

type ToastKind = 'info' | 'success' | 'warning' | 'error';

type Toast = { id: number; kind: ToastKind; message: string };

type PersistedState = { graph?: GraphState; locale?: GraphDisplayLanguage };

declare const initialGraphState: GraphState | undefined;
declare const initialTheme: ThemeMessage | undefined;
const vscode = acquireVsCodeApi<PersistedState>();

const persistedState = vscode.getState();
const persistedGraph = persistedState?.graph;
const bootGraph: GraphState = persistedGraph ?? initialGraphState ?? createDefaultGraphState();
const bootLocale: GraphDisplayLanguage =
  (persistedState?.locale as GraphDisplayLanguage | undefined) ??
  bootGraph.displayLanguage ??
  'ru';
const useGraphStore: GraphStoreHook = createGraphStore(bootGraph);
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
}> = ({ locale, onLocaleChange, translate, onCalculate }) => {
  const graph = useGraphStore((state) => state.graph);
  const [pending, setPending] = useState(false);

  const send = (type: 'requestNewGraph' | 'requestSave' | 'requestLoad' | 'requestGenerate' | 'requestValidate') => {
    setPending(true);
    sendToExtension({ type });
    setTimeout(() => setPending(false), 200);
  };

  return (
    <div className="toolbar">
      <div>
        <div className="toolbar-title">{graph.name}</div>
        <div className="toolbar-subtitle">
          {translate('toolbar.targetPlatform', 'Целевая платформа: {language}', {
            language: graph.language.toUpperCase()
          })}
        </div>
      </div>
      <div className="toolbar-actions">
        <label className="toolbar-language">
          <span>{translate('toolbar.languageSwitch', 'Язык интерфейса')}</span>
          <select
            value={locale}
            onChange={(event) => onLocaleChange(event.target.value as GraphDisplayLanguage)}
          >
            <option value="ru">RU</option>
            <option value="en">EN</option>
          </select>
        </label>
        <button onClick={() => send('requestNewGraph')} disabled={pending}>
          {translate('toolbar.newGraph', 'Новый граф')}
        </button>
        <button onClick={() => send('requestLoad')} disabled={pending}>
          {translate('toolbar.loadGraph', 'Загрузить')}
        </button>
        <button onClick={() => send('requestSave')} disabled={pending}>
          {translate('toolbar.saveGraph', 'Сохранить')}
        </button>
        <button onClick={() => send('requestValidate')} disabled={pending}>
          {translate('toolbar.validateGraph', 'Проверить')}
        </button>
        <button onClick={onCalculate} disabled={pending}>
          {translate('toolbar.calculateLayout', 'Рассчитать')}
        </button>
        <button onClick={() => send('requestGenerate')} disabled={pending}>
          {translate('toolbar.generateGraph', 'Генерировать код')}
        </button>
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
  return (
    <div className="panel">
      <div className="panel-title">{translate('toolbar.validate', 'Валидация')}</div>
      {validation.errors.length === 0 && validation.warnings.length === 0 ? (
        <div className="badge badge-ok">{translate('toasts.validationOk', 'Ошибок не найдено')}</div>
      ) : (
        <ul className="validation-list">
          {validation.errors.map((item) => (
            <li key={item} className="text-error">
              {item}
            </li>
          ))}
          {validation.warnings.map((item) => (
            <li key={item} className="text-warn">
              {item}
            </li>
          ))}
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
                {option}
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
}

const TranslationActions: React.FC<TranslationActionsProps> = ({
  direction,
  pending,
  onDirectionChange,
  onTranslate
}) => (
  <div className="panel">
    <div className="panel-title">Перевод графа</div>
    <div className="panel-grid">
      <label>
        <div className="panel-label">Направление</div>
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
        {pending ? 'Перевод...' : 'Перевести'}
      </button>
    </div>
  </div>
);

const App: React.FC = () => {
  const setGraph = useGraphStore((state) => state.setGraph);
  const graph = useGraphStore((state) => state.graph);
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

  const effectiveTheme = resolveEffectiveTheme(themeState.preference, themeState.hostTheme);
  const themeTokens = useMemo(() => getThemeTokens(effectiveTheme), [effectiveTheme]);

  const translate = (
    key: TranslationKey,
    fallback: string,
    replacements?: Record<string, string>
  ): string => getTranslation(locale, key, replacements, fallback);

  const pushToast = (kind: ToastKind, message: string): void => {
    const id = Date.now() + Math.round(Math.random() * 1000);
    setToasts((prev) => [...prev.slice(-3), { id, kind, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), 3200);
  };

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
    const unsubscribe = useGraphStore.subscribe(
      (state) => ({ graph: state.graph, origin: state.lastChangeOrigin }),
      ({ graph, origin }) => {
        vscode.setState({ graph, locale: localeRef.current });
        if (origin === 'local') {
          sendToExtension({
            type: 'graphChanged',
            payload: {
              nodes: graph.nodes,
              edges: graph.edges,
              name: graph.name,
              language: graph.language,
              displayLanguage: graph.displayLanguage
            }
          });
        }
      },
      { equalityFn: (prev, next) => prev.graph === next.graph && prev.origin === next.origin }
    );

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

  useEffect(() => {
    setTranslationDirection(graph.displayLanguage === 'ru' ? 'ru-en' : 'en-ru');
  }, [graph.displayLanguage]);

  const handleCalculateLayout = (): void => {
    layoutRunnerRef.current();
  };

  return (
    <div className="app-shell">
      <Toolbar
        locale={locale}
        onLocaleChange={handleLocaleChange}
        translate={translate}
        onCalculate={handleCalculateLayout}
      />
      <div className="workspace">
        <div className="canvas-wrapper">
          <GraphEditor
            graphStore={useGraphStore}
            theme={themeTokens}
            onAddNode={handleAddNode}
            onConnectNodes={handleConnectNodes}
            onLayoutReady={(runner) => {
              layoutRunnerRef.current = runner;
            }}
          />
        </div>
        <div className="side-panel">
          <TranslationActions
            direction={translationDirection}
            pending={translationPending}
            onDirectionChange={setTranslationDirection}
            onTranslate={handleTranslate}
          />
          <NodeActions
            onAddNode={handleAddNode}
            onConnectNodes={handleConnectNodes}
            lastNodeAddedToken={lastNodeAddedToken}
            lastConnectionToken={lastConnectionToken}
          />
          <GraphFacts translate={translate} />
          <ValidationPanel validation={validation} translate={translate} />
        </div>
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
  root.render(<App />);
}
