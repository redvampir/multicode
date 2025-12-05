import { create } from 'zustand';
import type { GraphNode, GraphState } from '../shared/graphState';

export type ChangeOrigin = 'local' | 'remote';

export interface GraphStore {
  graph: GraphState;
  lastChangeOrigin: ChangeOrigin;
  setGraph: (graph: GraphState, options?: { origin?: ChangeOrigin }) => void;
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  renameNode: (nodeId: string, label: string) => void;
  markDirty: (dirty?: boolean, origin?: ChangeOrigin) => void;
}

const ensurePosition = (nodes: GraphNode[]): GraphNode[] =>
  nodes.map((node, index) => ({
    ...node,
    position:
      node.position ?? {
        x: 160 + (index % 5) * 220,
        y: 140 + Math.floor(index / 5) * 160
      }
  }));

const withTimestamp = (graph: GraphState): GraphState => ({
  ...graph,
  updatedAt: graph.updatedAt ?? new Date().toISOString()
});

export const createGraphStore = (initialGraph: GraphState) =>
  create<GraphStore>((set, get) => ({
    graph: withTimestamp({ ...initialGraph, nodes: ensurePosition(initialGraph.nodes) }),
    lastChangeOrigin: 'remote',
    setGraph: (graph, options) =>
      set({
        graph: withTimestamp({
          ...graph,
          nodes: ensurePosition(graph.nodes)
        }),
        lastChangeOrigin: options?.origin ?? 'local'
      }),
    updateNodePosition: (nodeId, position) => {
      const current = get().graph;
      set({
        graph: {
          ...current,
          nodes: current.nodes.map((node) => (node.id === nodeId ? { ...node, position } : node)),
          dirty: true,
          updatedAt: new Date().toISOString()
        },
        lastChangeOrigin: 'local'
      });
    },
    renameNode: (nodeId, label) => {
      const current = get().graph;
      set({
        graph: {
          ...current,
          nodes: current.nodes.map((node) => (node.id === nodeId ? { ...node, label } : node)),
          dirty: true,
          updatedAt: new Date().toISOString()
        },
        lastChangeOrigin: 'local'
      });
    },
    markDirty: (dirty = true, origin: ChangeOrigin = 'local') =>
      set(({ graph }) => ({
        graph: { ...graph, dirty, updatedAt: new Date().toISOString() },
        lastChangeOrigin: origin
      }))
  }));

export type GraphStoreHook = ReturnType<typeof createGraphStore>;
