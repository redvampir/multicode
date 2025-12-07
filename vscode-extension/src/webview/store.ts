import { create } from 'zustand';
import type { GraphEdge, GraphNode, GraphState } from '../shared/graphState';
import { addNode, applyLayout as applyLayoutAction, connect, deleteItems } from './storeActions';
import type { GraphStoreApi } from './storeActions';

export type SearchResult = {
  id: string;
  kind: 'node' | 'edge';
  label: string;
  meta: string;
};

export type ChangeOrigin = 'local' | 'remote';

export type LayoutAlgorithm = 'dagre' | 'klay';

export interface LayoutSettings {
  algorithm: LayoutAlgorithm;
  rankDir: 'LR' | 'TB' | 'BT' | 'RL';
  nodeSep: number;
  edgeSep: number;
  spacing: number;
}

export const layoutBounds = {
  nodeSep: { min: 20, max: 400 },
  edgeSep: { min: 10, max: 400 },
  spacing: { min: 0.2, max: 4 }
} as const;

export const defaultLayoutSettings: LayoutSettings = {
  algorithm: 'dagre',
  rankDir: 'LR',
  nodeSep: 80,
  edgeSep: 32,
  spacing: 1
};

const clamp = (value: number, min: number, max: number): number => {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
};

const normalizeRankDir = (value: string | undefined): LayoutSettings['rankDir'] => {
  if (value === 'LR' || value === 'TB' || value === 'BT' || value === 'RL') {
    return value;
  }
  return defaultLayoutSettings.rankDir;
};

export const normalizeLayoutSettings = (
  settings?: Partial<LayoutSettings>
): LayoutSettings => ({
  algorithm: settings?.algorithm === 'klay' ? 'klay' : 'dagre',
  rankDir: normalizeRankDir(settings?.rankDir),
  nodeSep: clamp(settings?.nodeSep ?? defaultLayoutSettings.nodeSep, layoutBounds.nodeSep.min, layoutBounds.nodeSep.max),
  edgeSep: clamp(settings?.edgeSep ?? defaultLayoutSettings.edgeSep, layoutBounds.edgeSep.min, layoutBounds.edgeSep.max),
  spacing: clamp(settings?.spacing ?? defaultLayoutSettings.spacing, layoutBounds.spacing.min, layoutBounds.spacing.max)
});

type GraphClipboard = { nodes: GraphNode[]; edges: GraphEdge[] } | null;

export interface GraphStore {
  graph: GraphState;
  layout: LayoutSettings;
  lastChangeOrigin: ChangeOrigin;
  historyPast: GraphState[];
  historyFuture: GraphState[];
  clipboard: GraphClipboard;
  searchQuery: string;
  searchResults: SearchResult[];
  searchIndex: number;
  setGraph: (
    graph: GraphState,
    options?: { origin?: ChangeOrigin; pushHistory?: boolean }
  ) => void;
  setLayout: (settings: Partial<LayoutSettings>) => void;
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  renameNode: (nodeId: string, label: string) => void;
  markDirty: (dirty?: boolean, origin?: ChangeOrigin) => void;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  setSelectedNodes: (nodeIds: string[]) => void;
  setSelectedEdges: (edgeIds: string[]) => void;
  setSelection: (selection: { nodeIds?: string[]; edgeIds?: string[] }) => void;
  deleteNodes: (nodeIds: string[]) => void;
  deleteEdges: (edgeIds: string[]) => void;
  undo: () => void;
  redo: () => void;
  copySelection: () => void;
  pasteClipboard: () => void;
  duplicateSelection: () => void;
  addNode: (payload: { label?: string; nodeType?: GraphNode['type']; position?: { x: number; y: number } }) => void;
  connect: (payload: { sourceId?: string; targetId?: string; label?: string; kind?: GraphEdge['kind'] }) => void;
  delete: (payload: { nodeIds?: string[]; edgeIds?: string[] }) => void;
  applyLayout: (positions: Record<string, { x: number; y: number }>) => void;
  setSearchQuery: (query: string) => void;
  setSearchIndex: (index: number) => void;
  selectNextSearchResult: () => void;
  selectPreviousSearchResult: () => void;
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

const cloneGraph = (graph: GraphState): GraphState => ({
  ...graph,
  nodes: graph.nodes.map((node) => ({
    ...node,
    position: node.position ? { ...node.position } : undefined
  })),
  edges: graph.edges.map((edge) => ({ ...edge })),
  dirty: graph.dirty ?? false,
  updatedAt: graph.updatedAt
});

const uniqueIds = (ids: string[]): string[] => Array.from(new Set(ids));

const sanitizeSelection = (
  graph: GraphState,
  selection: string[]
): string[] => uniqueIds(selection).filter((id) => graph.nodes.some((node) => node.id === id));

const sanitizeEdgeSelection = (
  graph: GraphState,
  selection: string[]
): string[] => uniqueIds(selection).filter((id) => graph.edges.some((edge) => edge.id === id));

const normalizeText = (value?: string): string => value?.toLowerCase() ?? '';

const isMatch = (haystack: string, query: string): boolean => normalizeText(haystack).includes(query);

const buildSearchResults = (graph: GraphState, query: string): SearchResult[] => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const nodeResults: SearchResult[] = graph.nodes
    .filter(
      (node) =>
        isMatch(node.label, normalizedQuery) ||
        isMatch(node.id, normalizedQuery) ||
        isMatch(node.type, normalizedQuery)
    )
    .map((node) => ({
      id: node.id,
      kind: 'node',
      label: node.label,
      meta: node.type
    }));

  const edgeResults: SearchResult[] = graph.edges
    .filter(
      (edge) =>
        isMatch(edge.label ?? '', normalizedQuery) ||
        isMatch(edge.id, normalizedQuery) ||
        isMatch(edge.source, normalizedQuery) ||
        isMatch(edge.target, normalizedQuery) ||
        isMatch(edge.kind ?? '', normalizedQuery)
    )
    .map((edge) => ({
      id: edge.id,
      kind: 'edge',
      label: edge.label ?? edge.id,
      meta: `${edge.source} → ${edge.target}`
    }));

  return [...nodeResults, ...edgeResults];
};

export const createGraphStore = (initialGraph: GraphState, initialLayout?: Partial<LayoutSettings>) =>
  create<GraphStore>((set, get) => {
    const api: GraphStoreApi = {
      getState: get,
      setState: (partial) =>
        set(partial as Partial<GraphStore> | ((state: GraphStore) => Partial<GraphStore>))
    };

    return {
      graph: withTimestamp({ ...initialGraph, nodes: ensurePosition(initialGraph.nodes) }),
      layout: normalizeLayoutSettings(initialLayout),
      lastChangeOrigin: 'remote',
      historyPast: [],
      historyFuture: [],
      clipboard: null,
      searchQuery: '',
      searchResults: [],
      searchIndex: -1,
      setGraph: (graph, options) => {
        const normalized = withTimestamp({
          ...graph,
          nodes: ensurePosition(graph.nodes)
        });
        const currentSelection = get().selectedNodeIds;
        const currentEdgeSelection = get().selectedEdgeIds;

        const allowedSelection = sanitizeSelection(normalized, currentSelection);
        const allowedEdges = sanitizeEdgeSelection(normalized, currentEdgeSelection);

        const searchQuery = get().searchQuery;
        const searchResults = buildSearchResults(normalized, searchQuery);
        const nextSearchIndex = searchResults.length
          ? Math.min(Math.max(get().searchIndex, 0), searchResults.length - 1)
          : -1;

        const shouldPushHistory = options?.pushHistory ?? true;
        if (shouldPushHistory) {
          const snapshot = cloneGraph(get().graph);
          set(({ historyPast }) => ({
            historyPast: [...historyPast.slice(-49), snapshot],
            historyFuture: []
          }));
        }

        const dirty = options?.origin === 'remote' ? normalized.dirty ?? false : true;

        set({
          graph: { ...normalized, dirty },
          lastChangeOrigin: options?.origin ?? 'local',
          selectedNodeIds: allowedSelection,
          selectedEdgeIds: allowedEdges,
          searchResults,
          searchIndex: nextSearchIndex
        });
      },
      setLayout: (settings) =>
        set(({ layout }) => ({
          layout: normalizeLayoutSettings({ ...layout, ...settings })
        })),
      updateNodePosition: (nodeId, position) => {
        const current = get().graph;
        const nextGraph: GraphState = {
          ...current,
          nodes: current.nodes.map((node) => (node.id === nodeId ? { ...node, position } : node)),
          dirty: true,
          updatedAt: new Date().toISOString()
        };
        get().setGraph(nextGraph, { origin: 'local' });
      },
      renameNode: (nodeId, label) => {
        const current = get().graph;
        const nextGraph: GraphState = {
          ...current,
          nodes: current.nodes.map((node) => (node.id === nodeId ? { ...node, label } : node)),
          dirty: true,
          updatedAt: new Date().toISOString()
        };
        get().setGraph(nextGraph, { origin: 'local' });
      },
      markDirty: (dirty = true, origin: ChangeOrigin = 'local') =>
        set(({ graph }) => ({
          graph: { ...graph, dirty, updatedAt: new Date().toISOString() },
          lastChangeOrigin: origin
        })),
      selectedNodeIds: [],
      selectedEdgeIds: [],
      setSelectedNodes: (nodeIds) =>
        set(({ graph }) => ({ selectedNodeIds: sanitizeSelection(graph, nodeIds) })),
      setSelectedEdges: (edgeIds) =>
        set(({ graph }) => ({ selectedEdgeIds: sanitizeEdgeSelection(graph, edgeIds) })),
      setSelection: (selection) =>
        set(({ graph, selectedNodeIds, selectedEdgeIds }) => ({
          selectedNodeIds: sanitizeSelection(graph, selection.nodeIds ?? selectedNodeIds),
          selectedEdgeIds: sanitizeEdgeSelection(graph, selection.edgeIds ?? selectedEdgeIds)
        })),
      deleteNodes: (nodeIds) => {
        if (!nodeIds.length) {
          return;
        }
        deleteItems(api, { nodeIds }, { now: () => new Date().toISOString() });
      },
      deleteEdges: (edgeIds) => {
        if (!edgeIds.length) {
          return;
        }
        deleteItems(api, { edgeIds }, { now: () => new Date().toISOString() });
      },
      undo: () => {
        const past = get().historyPast;
        if (!past.length) {
          return;
        }
        const current = get().graph;
        const previous = past[past.length - 1];
        set(({ historyFuture }) => ({
          graph: cloneGraph(previous),
          lastChangeOrigin: 'local',
          historyPast: past.slice(0, -1),
          historyFuture: [cloneGraph(current), ...historyFuture],
          selectedNodeIds: sanitizeSelection(previous, get().selectedNodeIds),
          selectedEdgeIds: sanitizeEdgeSelection(previous, get().selectedEdgeIds)
        }));
      },
      redo: () => {
        const future = get().historyFuture;
        if (!future.length) {
          return;
        }
        const current = get().graph;
        const next = future[0];
        set(({ historyPast }) => ({
          graph: cloneGraph(next),
          lastChangeOrigin: 'local',
          historyPast: [...historyPast, cloneGraph(current)].slice(-50),
          historyFuture: future.slice(1),
          selectedNodeIds: sanitizeSelection(next, get().selectedNodeIds),
          selectedEdgeIds: sanitizeEdgeSelection(next, get().selectedEdgeIds)
        }));
      },
      copySelection: () => {
        const graph = get().graph;
        const selectedNodes = get().selectedNodeIds;
        const selectedEdges = get().selectedEdgeIds;
        if (!selectedNodes.length && !selectedEdges.length) {
          return;
        }
        const edgeIdSet = new Set(selectedEdges);
        const nodeIdSet = new Set(selectedNodes);
        graph.edges.forEach((edge) => {
          if (edgeIdSet.has(edge.id)) {
            nodeIdSet.add(edge.source);
            nodeIdSet.add(edge.target);
          }
        });
        const nodes = graph.nodes.filter((node) => nodeIdSet.has(node.id));
        const edges = graph.edges.filter((edge) => nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target));
        set({
          clipboard: {
            nodes: nodes.map((node) => ({
              ...node,
              position: node.position ? { ...node.position } : undefined
            })),
            edges: edges.map((edge) => ({ ...edge }))
          }
        });
      },
      pasteClipboard: () => {
        const clipboard = get().clipboard;
        if (!clipboard) {
          return;
        }
        const graph = get().graph;
        const timestamp = Date.now();
        const idMap = new Map<string, string>();
        const nodesToAdd = clipboard.nodes.map((node, index) => {
          const newId = `${node.id}-copy-${timestamp}-${index}`;
          idMap.set(node.id, newId);
          return {
            ...node,
            id: newId,
            label: node.label ? `${node.label} (копия)` : node.label,
            position: node.position
              ? { x: node.position.x + 40, y: node.position.y + 40 }
              : undefined
          } satisfies GraphNode;
        });
        const edgesToAdd = clipboard.edges
          .map((edge, index) => {
            const sourceId = idMap.get(edge.source);
            const targetId = idMap.get(edge.target);
            if (!sourceId || !targetId) {
              return undefined;
            }
            return {
              ...edge,
              id: `${edge.id}-copy-${timestamp}-${index}`,
              source: sourceId,
              target: targetId
            } satisfies GraphEdge;
          })
          .filter((edge): edge is GraphEdge => Boolean(edge));

        if (!nodesToAdd.length && !edgesToAdd.length) {
          return;
        }

        const setGraph = get().setGraph;
        const nextGraph: GraphState = {
          ...graph,
          nodes: [...graph.nodes, ...nodesToAdd],
          edges: [...graph.edges, ...edgesToAdd],
          dirty: true,
          updatedAt: new Date().toISOString()
        };

        setGraph(nextGraph, { origin: 'local' });
        set({
          selectedNodeIds: nodesToAdd.map((node) => node.id),
          selectedEdgeIds: edgesToAdd.map((edge) => edge.id)
        });
      },
      duplicateSelection: () => {
        const selection = get().selectedNodeIds;
        const edgeSelection = get().selectedEdgeIds;
        if (!selection.length && !edgeSelection.length) {
          return;
        }
        get().copySelection();
        get().pasteClipboard();
      },
      addNode: (payload) => {
        addNode(api, payload, {
          now: () => new Date().toISOString()
        });
      },
      connect: (payload) => {
        connect(api, payload, {
          now: () => new Date().toISOString()
        });
      },
      delete: (payload) => {
        deleteItems(api, payload, {
          now: () => new Date().toISOString()
        });
      },
      applyLayout: (positions) => {
        applyLayoutAction(api, positions, {
          now: () => new Date().toISOString()
        });
      },
      setSearchQuery: (query) => {
        const graph = get().graph;
        const results = buildSearchResults(graph, query);
        set({
          searchQuery: query,
          searchResults: results,
          searchIndex: results.length ? 0 : -1
        });
      },
      setSearchIndex: (index) => {
        const results = get().searchResults;
        if (!results.length) {
          set({ searchIndex: -1 });
          return;
        }
        const normalizedIndex = ((index % results.length) + results.length) % results.length;
        set({ searchIndex: normalizedIndex });
      },
      selectNextSearchResult: () => {
        const current = get().searchIndex;
        get().setSearchIndex(current + 1);
      },
      selectPreviousSearchResult: () => {
        const current = get().searchIndex;
        get().setSearchIndex(current - 1);
      }
    };
  });

export type GraphStoreHook = ReturnType<typeof createGraphStore>;
