import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createDefaultGraphState,
  type GraphEdge,
  type GraphNode,
  type GraphNodeType,
  type GraphState
} from '../shared/graphState';
import type { ValidationResult } from '../shared/validator';
import { GraphEditor } from './GraphEditor';
import { createGraphStore, type GraphStoreHook } from './store';
import {
  getThemeTokens,
  resolveEffectiveTheme,
  type EffectiveTheme,
  type ThemeSetting,
  type ThemeTokens
} from './theme';

type ToastKind = 'info' | 'success' | 'warning' | 'error';

type ThemeMessage = { preference: ThemeSetting; hostTheme: EffectiveTheme };

type Message =
  | { type: 'setState'; payload: GraphState }
  | { type: 'toast'; payload: { kind: ToastKind; message: string } }
  | { type: 'validationResult'; payload: ValidationResult }
  | { type: 'themeChanged'; payload: ThemeMessage }
  | { type: 'nodeAdded'; payload: { node: GraphNode } }
  | { type: 'nodesConnected'; payload: { edge: GraphEdge } }
  | { type: 'nodesDeleted'; payload: { nodeIds: string[] } };

type Toast = { id: number; kind: ToastKind; message: string };

declare const initialGraphState: GraphState | undefined;
declare const initialTheme: ThemeMessage | undefined;
const vscode = acquireVsCodeApi<{ graph?: GraphState }>();

const persistedGraph = vscode.getState()?.graph;
const bootGraph: GraphState = persistedGraph ?? initialGraphState ?? createDefaultGraphState();
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

const Toolbar: React.FC = () => {
  const graph = useGraphStore((state) => state.graph);
  const [pending, setPending] = useState(false);

  const send = (type: 'requestNewGraph' | 'requestSave' | 'requestLoad' | 'requestGenerate' | 'requestValidate') => {
    setPending(true);
    vscode.postMessage({ type });
    setTimeout(() => setPending(false), 200);
  };

  return (
    <div className="toolbar">
      <div>
        <div className="toolbar-title">{graph.name}</div>
        <div className="toolbar-subtitle">Целевая платформа: {graph.language.toUpperCase()}</div>
      </div>
      <div className="toolbar-actions">
        <button onClick={() => send('requestNewGraph')} disabled={pending}>
          Новый граф
        </button>
        <button onClick={() => send('requestLoad')} disabled={pending}>
          Загрузить
        </button>
        <button onClick={() => send('requestSave')} disabled={pending}>
          Сохранить
        </button>
        <button onClick={() => send('requestValidate')} disabled={pending}>
          Проверить
        </button>
        <button onClick={() => send('requestGenerate')} disabled={pending}>
          Генерировать код
        </button>
      </div>
    </div>
  );
};

const GraphFacts: React.FC = () => {
  const graph = useGraphStore((state) => state.graph);
  const nodeCount = graph.nodes.length;
  const edgeCount = graph.edges.length;

  return (
    <div className="panel">
      <div className="panel-title">Сводка графа</div>
      <div className="panel-grid">
        <div>
          <div className="panel-label">Узлы</div>
          <div className="panel-value">{nodeCount}</div>
        </div>
        <div>
          <div className="panel-label">Связи</div>
          <div className="panel-value">{edgeCount}</div>
        </div>
        <div>
          <div className="panel-label">Язык</div>
          <div className="panel-value">{graph.language.toUpperCase()}</div>
        </div>
        <div>
          <div className={graph.dirty ? 'badge badge-warn' : 'badge badge-ok'}>
            {graph.dirty ? 'Есть несохранённые изменения' : 'Синхронизировано'}
          </div>
        </div>
      </div>
    </div>
  );
};

const ValidationPanel: React.FC<{ validation?: ValidationResult }> = ({ validation }) => {
  if (!validation) {
    return null;
  }
  return (
    <div className="panel">
      <div className="panel-title">Валидация</div>
      {validation.errors.length === 0 && validation.warnings.length === 0 ? (
        <div className="badge badge-ok">Ошибок не найдено</div>
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

const ToastContainer: React.FC<{ toasts: Toast[]; onClose: (id: number) => void }> = ({ toasts, onClose }) => (
  <div className="toast-container">
    {toasts.map((toast) => (
      <div key={toast.id} className={`toast toast-${toast.kind}`}>
        <span>{toast.message}</span>
        <button className="toast-close" onClick={() => onClose(toast.id)} aria-label="Закрыть уведомление">
          ×
        </button>
      </div>
    ))}
  </div>
);

const nodeTypeOptions: GraphNodeType[] = ['Start', 'Function', 'End', 'Variable', 'Custom'];

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
      <div className="panel-title">Управление графом</div>
      <form className="panel-grid" onSubmit={handleAddNode}>
        <label>
          <div className="panel-label">Имя узла</div>
          <input
            type="text"
            value={label}
            placeholder="Новый узел"
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        <label>
          <div className="panel-label">Тип</div>
          <select value={type} onChange={(event) => setType(event.target.value as GraphNodeType)}>
            {nodeTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="panel-action" disabled={!type}>
          Добавить узел
        </button>
      </form>

      <form className="panel-grid" onSubmit={handleConnect}>
        <label>
          <div className="panel-label">Источник</div>
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
          <div className="panel-label">Цель</div>
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
          Соединить
        </button>
      </form>
    </div>
  );
};

const App: React.FC = () => {
  const setGraph = useGraphStore((state) => state.setGraph);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [validation, setValidation] = useState<ValidationResult | undefined>(undefined);
  const [themeState, setThemeState] = useState<ThemeMessage>(initialThemeMessage);
  const [lastNodeAddedToken, setLastNodeAddedToken] = useState<number | undefined>(undefined);
  const [lastConnectionToken, setLastConnectionToken] = useState<number | undefined>(undefined);

  const effectiveTheme = resolveEffectiveTheme(themeState.preference, themeState.hostTheme);
  const themeTokens = useMemo(() => getThemeTokens(effectiveTheme), [effectiveTheme]);

  const pushToast = (kind: ToastKind, message: string): void => {
    const id = Date.now() + Math.round(Math.random() * 1000);
    setToasts((prev) => [...prev.slice(-3), { id, kind, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), 3200);
  };

  useEffect(() => {
    applyUiTheme(themeTokens, effectiveTheme);
  }, [themeTokens, effectiveTheme]);

  useEffect(() => {
    const handler = (event: MessageEvent<Message>): void => {
      if (!event.data) {
        return;
      }
      switch (event.data.type) {
        case 'setState':
          setGraph(event.data.payload, { origin: 'remote' });
          vscode.setState({ graph: event.data.payload });
          break;
        case 'toast':
          pushToast(event.data.payload.kind, event.data.payload.message);
          break;
        case 'validationResult':
          setValidation(event.data.payload);
          break;
        case 'themeChanged':
          setThemeState(event.data.payload);
          break;
        case 'nodeAdded':
          setLastNodeAddedToken(Date.now());
          break;
        case 'nodesConnected':
          setLastConnectionToken(Date.now());
          break;
        case 'nodesDeleted':
          break;
        default:
          break;
      }
    };

    window.addEventListener('message', handler);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', handler);
  }, [setGraph]);

  useEffect(() => {
    const unsubscribe = useGraphStore.subscribe(
      (state) => ({ graph: state.graph, origin: state.lastChangeOrigin }),
      ({ graph, origin }) => {
        vscode.setState({ graph });
        if (origin === 'local') {
          vscode.postMessage({
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
    vscode.postMessage({ type: 'addNode', payload });
  };

  const handleConnectNodes = (payload: { sourceId?: string; targetId?: string }): void => {
    vscode.postMessage({ type: 'connectNodes', payload });
  };

  const handleDeleteNodes = (nodeIds: string[]): void => {
    if (!nodeIds.length) {
      return;
    }
    vscode.postMessage({ type: 'deleteNodes', payload: { nodeIds } });
  };

  return (
    <div className="app-shell">
      <Toolbar />
      <div className="workspace">
        <div className="canvas-wrapper">
          <GraphEditor
            graphStore={useGraphStore}
            theme={themeTokens}
            onAddNode={handleAddNode}
            onConnectNodes={handleConnectNodes}
            onDeleteNodes={handleDeleteNodes}
          />
        </div>
        <div className="side-panel">
          <NodeActions
            onAddNode={handleAddNode}
            onConnectNodes={handleConnectNodes}
            lastNodeAddedToken={lastNodeAddedToken}
            lastConnectionToken={lastConnectionToken}
          />
          <GraphFacts />
          <ValidationPanel validation={validation} />
        </div>
      </div>
      <ToastContainer toasts={toasts} onClose={(id) => setToasts((prev) => prev.filter((item) => item.id !== id))} />
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
