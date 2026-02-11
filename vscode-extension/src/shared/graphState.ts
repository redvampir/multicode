export type GraphLanguage = 'cpp' | 'rust' | 'asm';
export type GraphDisplayLanguage = 'ru' | 'en';

export type GraphNodeType = 'Start' | 'Function' | 'End' | 'Variable' | 'Custom';
export type GraphEdgeKind = 'execution' | 'data';

export interface GraphNode {
  id: string;
  label: string;
  type: GraphNodeType;
  position?: { x: number; y: number };
  /** Полный снимок узла Blueprint для round-trip без потерь */
  blueprintNode?: unknown;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  kind?: GraphEdgeKind;
  /** Полный снимок ребра Blueprint для round-trip без потерь */
  blueprintEdge?: unknown;
}

export interface GraphState {
  id: string;
  name: string;
  language: GraphLanguage;
  displayLanguage: GraphDisplayLanguage;
  nodes: GraphNode[];
  edges: GraphEdge[];
  updatedAt: string;
  dirty?: boolean;
  /** Переменные графа (Blueprint-style) */
  variables?: unknown[];
  /** Пользовательские функции (Blueprint-style) */
  functions?: unknown[];
}

export const createDefaultGraphState = (): GraphState => {
  const timestamp = new Date().toISOString();
  return {
    id: `graph-${Date.now()}`,
    name: 'Untitled Graph',
    language: 'cpp',
    displayLanguage: 'ru',
    nodes: [
      { id: 'node-start', label: 'Start', type: 'Start' },
      { id: 'node-func', label: 'Function', type: 'Function' },
      { id: 'node-end', label: 'End', type: 'End' }
    ],
    edges: [
      { id: 'edge-1', source: 'node-start', target: 'node-func', label: 'flow', kind: 'execution' },
      { id: 'edge-2', source: 'node-func', target: 'node-end', label: 'flow', kind: 'execution' }
    ],
    updatedAt: timestamp,
    dirty: false
  };
};
