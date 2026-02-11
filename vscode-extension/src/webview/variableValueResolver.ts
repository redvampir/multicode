import type {
  BlueprintEdge,
  BlueprintNode,
  BlueprintVariable,
} from '../shared/blueprintTypes';
import { getEffectiveSetInputValue } from './variableNodeBinding';

export type ResolvedVariableStatus = 'resolved' | 'ambiguous' | 'unknown';

export interface ResolvedVariableValue {
  currentValue: unknown;
  sourceNodeId: string;
  status: ResolvedVariableStatus;
}

export type ResolvedVariableValues = Record<string, ResolvedVariableValue>;

interface ResolverInput {
  nodes: BlueprintNode[];
  edges: BlueprintEdge[];
  variables: BlueprintVariable[];
}

interface CandidateValue {
  value: unknown;
  status: ResolvedVariableStatus;
}

const DEFAULT_SOURCE_NODE_ID = 'default';

const isValueInputPort = (portId: string): boolean =>
  portId === 'value-in' || portId.endsWith('-value-in');

const isExecutionEdge = (edge: BlueprintEdge): boolean => edge.kind === 'execution';

const isDataEdge = (edge: BlueprintEdge): boolean => edge.kind === 'data';

const isSetVariableNode = (node: BlueprintNode): boolean => node.type === 'SetVariable';

const isGetVariableNode = (node: BlueprintNode): boolean => node.type === 'GetVariable';

const getVariableId = (node: BlueprintNode): string | undefined => {
  const variableId = node.properties?.variableId;
  return typeof variableId === 'string' && variableId.length > 0 ? variableId : undefined;
};

const areSameValue = (left: unknown, right: unknown): boolean => {
  if (left === right) {
    return true;
  }
  if (Array.isArray(left) && Array.isArray(right) && left.length === right.length) {
    return left.every((item, index) => areSameValue(item, right[index]));
  }
  return false;
};

const collectReachableExecutionNodes = (
  startNodeIds: string[],
  outgoingExecutionEdges: Map<string, BlueprintEdge[]>
): { visited: Set<string>; order: string[] } => {
  const visited = new Set<string>();
  const order: string[] = [];
  const queue = [...startNodeIds];

  while (queue.length > 0) {
    const currentNodeId = queue.shift();
    if (!currentNodeId || visited.has(currentNodeId)) {
      continue;
    }

    visited.add(currentNodeId);
    order.push(currentNodeId);

    const outgoing = outgoingExecutionEdges.get(currentNodeId) ?? [];
    for (const edge of outgoing) {
      queue.push(edge.targetNode);
    }
  }

  return { visited, order };
};

const hasExecutionCycle = (
  startNodeIds: string[],
  outgoingExecutionEdges: Map<string, BlueprintEdge[]>
): boolean => {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const dfs = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) {
      return true;
    }
    if (visited.has(nodeId)) {
      return false;
    }

    visiting.add(nodeId);
    const outgoing = outgoingExecutionEdges.get(nodeId) ?? [];
    for (const edge of outgoing) {
      if (dfs(edge.targetNode)) {
        return true;
      }
    }

    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };

  for (const startNodeId of startNodeIds) {
    if (dfs(startNodeId)) {
      return true;
    }
  }

  return false;
};

const getInitialResolvedValues = (
  variables: BlueprintVariable[],
  status: ResolvedVariableStatus
): ResolvedVariableValues => {
  const initialValues: ResolvedVariableValues = {};
  for (const variable of variables) {
    initialValues[variable.id] = {
      currentValue: variable.defaultValue,
      sourceNodeId: DEFAULT_SOURCE_NODE_ID,
      status,
    };
  }
  return initialValues;
};

const resolveInputFromDataEdge = (
  incomingDataEdge: BlueprintEdge,
  nodeById: Map<string, BlueprintNode>,
  resolvedValues: ResolvedVariableValues,
  variableById: Map<string, BlueprintVariable>
): CandidateValue => {
  const sourceNode = nodeById.get(incomingDataEdge.sourceNode);
  if (!sourceNode) {
    return { value: undefined, status: 'unknown' };
  }

  const sourceVariableId = getVariableId(sourceNode);
  if (!sourceVariableId) {
    return { value: undefined, status: 'unknown' };
  }

  const sourceResolved = resolvedValues[sourceVariableId];
  if (sourceResolved) {
    return {
      value: sourceResolved.currentValue,
      status: sourceResolved.status,
    };
  }

  const fallbackVariable = variableById.get(sourceVariableId);
  return {
    value: fallbackVariable?.defaultValue,
    status: 'unknown',
  };
};

const getCandidateValue = (
  setNode: BlueprintNode,
  incomingDataEdges: Map<string, BlueprintEdge[]>,
  nodeById: Map<string, BlueprintNode>,
  resolvedValues: ResolvedVariableValues,
  variableById: Map<string, BlueprintVariable>
): CandidateValue => {
  const variableId = getVariableId(setNode);
  const variableDefault = variableId ? variableById.get(variableId)?.defaultValue : undefined;
  const incomingValueEdges = (incomingDataEdges.get(setNode.id) ?? []).filter((edge) =>
    isValueInputPort(edge.targetPort)
  );

  if (incomingValueEdges.length > 1) {
    return { value: variableDefault, status: 'ambiguous' };
  }

  if (incomingValueEdges.length === 1) {
    return resolveInputFromDataEdge(
      incomingValueEdges[0],
      nodeById,
      resolvedValues,
      variableById
    );
  }

  const effectiveValue = getEffectiveSetInputValue(setNode, variableDefault);
  return {
    value: effectiveValue,
    status: effectiveValue === undefined ? 'unknown' : 'resolved',
  };
};

const applyCandidateValue = (
  current: ResolvedVariableValue,
  candidate: CandidateValue,
  sourceNodeId: string
): ResolvedVariableValue => {
  if (candidate.status === 'ambiguous') {
    return {
      currentValue: current.currentValue,
      sourceNodeId,
      status: 'ambiguous',
    };
  }

  if (candidate.status === 'unknown') {
    if (current.status === 'resolved' && current.sourceNodeId !== DEFAULT_SOURCE_NODE_ID) {
      return current;
    }
    return {
      currentValue: candidate.value,
      sourceNodeId,
      status: 'unknown',
    };
  }

  if (current.status === 'ambiguous') {
    return current;
  }

  if (
    current.status === 'resolved' &&
    current.sourceNodeId !== DEFAULT_SOURCE_NODE_ID &&
    !areSameValue(current.currentValue, candidate.value)
  ) {
    return {
      currentValue: current.currentValue,
      sourceNodeId,
      status: 'ambiguous',
    };
  }

  return {
    currentValue: candidate.value,
    sourceNodeId,
    status: 'resolved',
  };
};

export const resolveVariableValuesPreview = ({
  nodes,
  edges,
  variables,
}: ResolverInput): ResolvedVariableValues => {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const safeEdges = Array.isArray(edges) ? edges : [];
  const safeVariables = Array.isArray(variables) ? variables : [];

  const nodeById = new Map(safeNodes.map((node) => [node.id, node]));
  const variableById = new Map(safeVariables.map((variable) => [variable.id, variable]));
  const resolvedValues = getInitialResolvedValues(safeVariables, 'resolved');

  const startNodeIds = safeNodes
    .filter((node) => node.type === 'Start')
    .map((node) => node.id);

  if (startNodeIds.length === 0) {
    return getInitialResolvedValues(safeVariables, 'unknown');
  }

  const outgoingExecutionEdges = new Map<string, BlueprintEdge[]>();
  const incomingDataEdges = new Map<string, BlueprintEdge[]>();

  for (const edge of safeEdges) {
    if (isExecutionEdge(edge)) {
      const currentOutgoing = outgoingExecutionEdges.get(edge.sourceNode) ?? [];
      currentOutgoing.push(edge);
      outgoingExecutionEdges.set(edge.sourceNode, currentOutgoing);
      continue;
    }

    if (isDataEdge(edge)) {
      const currentIncomingData = incomingDataEdges.get(edge.targetNode) ?? [];
      currentIncomingData.push(edge);
      incomingDataEdges.set(edge.targetNode, currentIncomingData);
    }
  }

  if (hasExecutionCycle(startNodeIds, outgoingExecutionEdges)) {
    return getInitialResolvedValues(safeVariables, 'unknown');
  }

  const { visited: reachableNodes, order: executionOrder } = collectReachableExecutionNodes(
    startNodeIds,
    outgoingExecutionEdges
  );

  for (const variable of safeVariables) {
    const setNodesForVariable = safeNodes.filter((node) => {
      if (!isSetVariableNode(node)) {
        return false;
      }
      return getVariableId(node) === variable.id;
    });

    if (
      setNodesForVariable.length > 0 &&
      !setNodesForVariable.some((node) => reachableNodes.has(node.id))
    ) {
      resolvedValues[variable.id] = {
        currentValue: variable.defaultValue,
        sourceNodeId: DEFAULT_SOURCE_NODE_ID,
        status: 'unknown',
      };
    }
  }

  for (const nodeId of executionOrder) {
    const node = nodeById.get(nodeId);
    if (!node || !isSetVariableNode(node)) {
      continue;
    }

    const variableId = getVariableId(node);
    if (!variableId || !resolvedValues[variableId]) {
      continue;
    }

    const candidate = getCandidateValue(
      node,
      incomingDataEdges,
      nodeById,
      resolvedValues,
      variableById
    );

    resolvedValues[variableId] = applyCandidateValue(
      resolvedValues[variableId],
      candidate,
      node.id
    );
  }

  // Если значение запрашивается через GetVariable без reachable Set, оставляем default,
  // но для unreachable-only графов метка остаётся unknown.
  for (const node of safeNodes) {
    if (!isGetVariableNode(node)) {
      continue;
    }
    const variableId = getVariableId(node);
    if (!variableId || !resolvedValues[variableId]) {
      continue;
    }
    if (!reachableNodes.has(node.id) && resolvedValues[variableId].sourceNodeId === DEFAULT_SOURCE_NODE_ID) {
      resolvedValues[variableId] = {
        ...resolvedValues[variableId],
        status: 'unknown',
      };
    }
  }

  return resolvedValues;
};
