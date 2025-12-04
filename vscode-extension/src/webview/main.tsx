import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import cytoscape, { type Core, type ElementDefinition, type LayoutOptions } from 'cytoscape';
import dagre from 'cytoscape-dagre';
import { createDefaultGraphState, type GraphState } from '../shared/graphState';
import type { ValidationResult } from '../shared/validator';
import { createGraphStore } from './store';

cytoscape.use(dagre);

type Stylesheet = cytoscape.StylesheetStyle;

type ToastKind = 'info' | 'success' | 'warning' | 'error';

type Message =
  | { type: 'setState'; payload: GraphState }
  | { type: 'toast'; payload: { kind: ToastKind; message: string } }
  | { type: 'validationResult'; payload: ValidationResult };

type Toast = { id: number; kind: ToastKind; message: string };

declare const initialGraphState: GraphState | undefined;
const vscode = acquireVsCodeApi<{ graph?: GraphState }>();

const persistedGraph = vscode.getState()?.graph;
const bootGraph: GraphState = persistedGraph ?? initialGraphState ?? createDefaultGraphState();
const useGraphStore = createGraphStore(bootGraph);

type DagreLayoutOptions = LayoutOptions & { rankDir?: 'LR' | 'TB' | 'BT' | 'RL'; padding?: number };
const defaultLayout: DagreLayoutOptions = { name: 'dagre', rankDir: 'LR', padding: 30 };

const cytoscapeStyles: Stylesheet[] = [
  {
    selector: 'node',
    style: {
      shape: 'round-rectangle',
      width: 'label',
      height: 'label',
      padding: '16px',
      'background-color': '#1c2433',
      'border-color': '#60a5fa',
      'border-width': 3,
      'border-opacity': 0.8,
      'text-valign': 'center',
      'text-halign': 'center',
      'font-size': 12,
      'font-weight': 600,
      color: '#e2e8f0',
      label: 'data(label)',
      'text-outline-color': '#0b1021',
      'text-outline-width': 3,
      'text-max-width': '160px',
      'text-wrap': 'wrap'
    } as cytoscape.Css.Node
  },
  {
    selector: 'node[type = "Start"]',
    style: {
      'background-color': '#0ea5e9',
      'border-color': '#38bdf8'
    } as cytoscape.Css.Node
  },
  {
    selector: 'node[type = "End"]',
    style: {
      'background-color': '#be123c',
      'border-color': '#f43f5e'
    } as cytoscape.Css.Node
  },
  {
    selector: 'node[type = "Variable"]',
    style: {
      'background-color': '#312e81',
      'border-color': '#6366f1'
    } as cytoscape.Css.Node
  },
  {
    selector: 'node[type = "Custom"]',
    style: {
      'background-color': '#2c1810',
      'border-color': '#f97316'
    } as cytoscape.Css.Node
  },
  {
    selector: 'edge',
    style: {
      width: 4,
      'curve-style': 'bezier',
      'line-color': '#60a5fa',
      'line-cap': 'round',
      'target-arrow-color': '#60a5fa',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 1.6,
      'text-background-opacity': 0.9,
      'text-background-color': '#0b1021',
      'text-background-padding': '6px',
      'text-rotation': 'autorotate',
      label: 'data(label)',
      color: '#e2e8f0',
      'font-size': 11
    } as cytoscape.Css.Edge
  },
  {
    selector: 'edge[kind = "data"]',
    style: {
      'line-style': 'dashed',
      'line-color': '#f59e0b',
      'target-arrow-color': '#f59e0b'
    } as cytoscape.Css.Edge
  },
  {
    selector: 'node:selected',
    style: {
      'border-color': '#a855f7',
      'border-width': 4,
      'box-shadow': '0 0 12px #a855f7'
    } as cytoscape.Css.Node
  }
];

const buildElements = (graph: GraphState): ElementDefinition[] => {
  const nodes: ElementDefinition[] = graph.nodes.map((node) => ({
    data: {
      id: node.id,
      label: node.label,
      type: node.type
    },
    position: node.position
  }));

  const edges: ElementDefinition[] = graph.edges.map((edge) => ({
    data: {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label ?? '',
      kind: edge.kind ?? 'execution'
    }
  }));

  return [...nodes, ...edges];
};

const GraphCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const graph = useGraphStore((state) => state.graph);
  const updateNodePosition = useGraphStore((state) => state.updateNodePosition);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    cyRef.current = cytoscape({
      container: containerRef.current,
      elements: buildElements(graph),
      style: cytoscapeStyles,
      layout: { ...defaultLayout },
      wheelSensitivity: 0.15,
      minZoom: 0.2,
      maxZoom: 2,
      autoungrabify: false,
      boxSelectionEnabled: false
    });

    cyRef.current.on('dragfree', 'node', (event) => {
      const position = event.target.position();
      updateNodePosition(event.target.id(), { x: position.x, y: position.y });
    });

    cyRef.current.on('tap', () => {
      cyRef.current?.nodes().unselect();
    });

    return () => {
      cyRef.current?.destroy();
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) {
      return;
    }

    const elements = buildElements(graph);
    cy.elements().remove();
    cy.add(elements);

    cy.nodes().forEach((node) => {
      const source = graph.nodes.find((item) => item.id === node.id());
      if (source?.position) {
        node.position(source.position);
      }
    });

    if (!graph.nodes.every((node) => node.position)) {
      cy.layout({ ...defaultLayout }).run();
    }
  }, [graph]);

  return <div className="graph-canvas" ref={containerRef} />;
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
          <div className="panel-label">Статус</div>
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

const App: React.FC = () => {
  const setGraph = useGraphStore((state) => state.setGraph);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [validation, setValidation] = useState<ValidationResult | undefined>(undefined);

  const pushToast = (kind: ToastKind, message: string): void => {
    const id = Date.now() + Math.round(Math.random() * 1000);
    setToasts((prev) => [...prev.slice(-3), { id, kind, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), 3200);
  };

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
        default:
          break;
      }
    };

    window.addEventListener('message', handler);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', handler);
  }, [setGraph]);

  useEffect(() => {
    const unsubscribe = useGraphStore.subscribe((state) => {
      vscode.setState({ graph: state.graph });
      if (state.lastChangeOrigin === 'local') {
        vscode.postMessage({
          type: 'graphChanged',
          payload: {
            nodes: state.graph.nodes,
            edges: state.graph.edges,
            name: state.graph.name,
            language: state.graph.language,
            displayLanguage: state.graph.displayLanguage
          }
        });
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="app-shell">
      <Toolbar />
      <div className="workspace">
        <div className="canvas-wrapper">
          <GraphCanvas />
        </div>
        <div className="side-panel">
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
