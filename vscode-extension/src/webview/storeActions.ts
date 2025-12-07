import type { GraphEdge, GraphEdgeKind, GraphNode, GraphNodeType, GraphState } from '../shared/graphState';
import type { GraphStore } from './store';

export type GraphStoreApi = {
  getState: () => GraphStore;
  setState: (partial: Partial<GraphStore> | ((state: GraphStore) => Partial<GraphStore>)) => void;
};

type IdentifierKind = 'node' | 'edge';

export type GraphActionContext = {
  now?: () => string;
  idGenerator?: (kind: IdentifierKind) => string;
};

export type AddNodePayload = {
  id?: string;
  label?: string;
  nodeType?: GraphNodeType;
  position?: { x: number; y: number };
};

export type ConnectPayload = {
  id?: string;
  sourceId?: string;
  targetId?: string;
  label?: string;
  kind?: GraphEdgeKind;
};

export type DeletePayload = {
  nodeIds?: string[];
  edgeIds?: string[];
};

export type LayoutPayload = Record<string, { x: number; y: number }>;

const defaultNow = (): string => new Date().toISOString();
const defaultId = (kind: IdentifierKind): string => `${kind}-${Date.now()}`;

const withDefaults = (context?: GraphActionContext) => ({
  now: context?.now ?? defaultNow,
  idGenerator: context?.idGenerator ?? defaultId
});

const markDirty = (graph: GraphState, timestamp: string): GraphState => ({
  ...graph,
  dirty: true,
  updatedAt: timestamp
});

export const addNode = (
  store: GraphStoreApi,
  payload: AddNodePayload,
  context?: GraphActionContext
): GraphNode => {
  const { now, idGenerator } = withDefaults(context);
  const { graph, setGraph } = store.getState();
  const node: GraphNode = {
    id: payload.id ?? idGenerator('node'),
    label: payload.label?.trim() || `Узел ${graph.nodes.length + 1}`,
    type: payload.nodeType ?? 'Function',
    position: payload.position
  };

  setGraph(markDirty({ ...graph, nodes: [...graph.nodes, node] }, now()), { origin: 'local' });
  store.setState({ selectedNodeIds: [node.id], selectedEdgeIds: [] });

  return node;
};

export const connect = (
  store: GraphStoreApi,
  payload: ConnectPayload,
  context?: GraphActionContext
): boolean => {
  const { now, idGenerator } = withDefaults(context);
  const { graph, setGraph } = store.getState();
  const sourceId = payload.sourceId?.trim();
  const targetId = payload.targetId?.trim();

  if (!sourceId || !targetId || sourceId === targetId) {
    return false;
  }

  const sourceExists = graph.nodes.some((node) => node.id === sourceId);
  const targetExists = graph.nodes.some((node) => node.id === targetId);
  const alreadyConnected = graph.edges.some(
    (edge) => edge.source === sourceId && edge.target === targetId
  );

  if (!sourceExists || !targetExists || alreadyConnected) {
    return false;
  }

  const edge: GraphEdge = {
    id: payload.id ?? idGenerator('edge'),
    source: sourceId,
    target: targetId,
    label: payload.label?.trim() || 'flow',
    kind: payload.kind ?? 'execution'
  };

  setGraph(markDirty({ ...graph, edges: [...graph.edges, edge] }, now()), { origin: 'local' });
  store.setState({ selectedNodeIds: [sourceId, targetId], selectedEdgeIds: [edge.id] });

  return true;
};

export const deleteItems = (
  store: GraphStoreApi,
  payload: DeletePayload,
  context?: GraphActionContext
): GraphState => {
  const { now } = withDefaults(context);
  const { graph, setGraph } = store.getState();
  const nodeIds = payload.nodeIds ?? [];
  const edgeIds = payload.edgeIds ?? [];

  if (!nodeIds.length && !edgeIds.length) {
    return graph;
  }

  const nodeSet = new Set(nodeIds);
  const edgeSet = new Set(edgeIds);

  const remainingNodes = graph.nodes.filter((node) => !nodeSet.has(node.id));
  const remainingNodeIds = new Set(remainingNodes.map((node) => node.id));

  const remainingEdges = graph.edges.filter(
    (edge) =>
      !edgeSet.has(edge.id) &&
      remainingNodeIds.has(edge.source) &&
      remainingNodeIds.has(edge.target)
  );

  const nextGraph = markDirty(
    {
      ...graph,
      nodes: remainingNodes,
      edges: remainingEdges
    },
    now()
  );

  setGraph(nextGraph, { origin: 'local' });

  store.setState(({ selectedNodeIds, selectedEdgeIds }: GraphStore) => ({
    selectedNodeIds: selectedNodeIds.filter((id) => remainingNodeIds.has(id)),
    selectedEdgeIds: selectedEdgeIds.filter((id) => remainingEdges.some((edge) => edge.id === id))
  }));

  return nextGraph;
};

export const applyLayout = (
  store: GraphStoreApi,
  positions: LayoutPayload,
  context?: GraphActionContext
): GraphState => {
  const { now } = withDefaults(context);
  const { graph, setGraph } = store.getState();

  const nextGraph = markDirty(
    {
      ...graph,
      nodes: graph.nodes.map((node) =>
        positions[node.id] ? { ...node, position: positions[node.id] } : node
      )
    },
    now()
  );

  setGraph(nextGraph, { origin: 'local' });
  return nextGraph;
};
