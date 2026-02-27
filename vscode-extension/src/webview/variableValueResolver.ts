import type {
  BlueprintEdge,
  BlueprintNode,
  BlueprintVariable,
  NodePort,
} from '../shared/blueprintTypes';
import { normalizePointerMeta } from '../shared/blueprintTypes';
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

interface EvaluationContext {
  nodeById: Map<string, BlueprintNode>;
  variableById: Map<string, BlueprintVariable>;
  incomingDataEdges: Map<string, BlueprintEdge[]>;
  resolvedValues: ResolvedVariableValues;
  cache: Map<string, CandidateValue>;
  visiting: Set<string>;
}

const DEFAULT_SOURCE_NODE_ID = 'default';

const isValueInputPort = (portId: string): boolean =>
  portId === 'value-in' || portId.endsWith('-value-in');

const isExecutionEdge = (edge: BlueprintEdge): boolean => edge.kind === 'execution';

const isDataEdge = (edge: BlueprintEdge): boolean => edge.kind === 'data';

const isSetVariableNode = (node: BlueprintNode): boolean => node.type === 'SetVariable';

type ArithmeticNodeType = 'Add' | 'Subtract' | 'Multiply' | 'Divide' | 'Modulo';

const ARITHMETIC_NODE_TYPES = new Set<ArithmeticNodeType>([
  'Add',
  'Subtract',
  'Multiply',
  'Divide',
  'Modulo',
]);

const isArithmeticNode = (node: BlueprintNode): node is BlueprintNode & { type: ArithmeticNodeType } =>
  ARITHMETIC_NODE_TYPES.has(node.type as ArithmeticNodeType);

const getVariableId = (node: BlueprintNode): string | undefined => {
  const variableId = node.properties?.variableId;
  return typeof variableId === 'string' && variableId.length > 0 ? variableId : undefined;
};

const matchesPortId = (edgePortId: string, nodePortId: string): boolean => {
  if (edgePortId === nodePortId) {
    return true;
  }
  if (edgePortId.endsWith(`-${nodePortId}`)) {
    return true;
  }
  if (nodePortId.endsWith(`-${edgePortId}`)) {
    return true;
  }
  return false;
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
  status: ResolvedVariableStatus,
  variableById: ReadonlyMap<string, BlueprintVariable>
): ResolvedVariableValues => {
  const initialValues: ResolvedVariableValues = {};
  for (const variable of variables) {
    let currentValue = variable.defaultValue;

    if (variable.dataType === 'pointer' && variable.pointerMeta) {
      const meta = normalizePointerMeta(variable.pointerMeta);
      if (
        meta.targetVariableId &&
        meta.mode !== 'weak'
      ) {
        const target = variableById.get(meta.targetVariableId);
        if (target && target.dataType !== 'pointer') {
          // Для всех режимов кроме weak отображаем значение через pointee (в UI оно показывается как "значение"),
          // а не как "nullptr". Для shared/unique это копия при инициализации, для raw/reference — alias к цели.
          currentValue = target.defaultValue;
        }
      }
    }

    initialValues[variable.id] = {
      currentValue,
      sourceNodeId: DEFAULT_SOURCE_NODE_ID,
      status,
    };
  }
  return initialValues;
};

const resolvePortFallbackValue = (port: NodePort): CandidateValue => {
  if (port.value !== undefined) {
    return { value: port.value, status: 'resolved' };
  }

  if (port.defaultValue !== undefined) {
    return { value: port.defaultValue, status: 'resolved' };
  }

  return { value: undefined, status: 'unknown' };
};

const toNumericValue = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.');
    if (normalized.length === 0) {
      return null;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const evaluateArithmeticOperation = (
  nodeType: ArithmeticNodeType,
  left: number,
  right: number,
): number | null => {
  if (nodeType === 'Add') {
    return left + right;
  }
  if (nodeType === 'Subtract') {
    return left - right;
  }
  if (nodeType === 'Multiply') {
    return left * right;
  }
  if (nodeType === 'Divide') {
    if (right === 0) {
      return null;
    }
    return left / right;
  }
  if (right === 0 || !Number.isInteger(left) || !Number.isInteger(right)) {
    return null;
  }
  return left % right;
};

const resolveNodeOutputCandidate = (
  node: BlueprintNode,
  sourcePortId: string,
  context: EvaluationContext
): CandidateValue => {
  const cacheKey = `${node.id}:${sourcePortId}`;
  const cached = context.cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  if (context.visiting.has(cacheKey)) {
    return { value: undefined, status: 'unknown' };
  }
  context.visiting.add(cacheKey);

  const resolveInputPortCandidate = (inputNode: BlueprintNode, inputPort: NodePort): CandidateValue => {
    const incomingForNode = context.incomingDataEdges.get(inputNode.id) ?? [];
    const incomingForPort = incomingForNode.filter((edge) => matchesPortId(edge.targetPort, inputPort.id));

    if (incomingForPort.length === 0) {
      return resolvePortFallbackValue(inputPort);
    }

    if (incomingForPort.length > 1) {
      return { value: undefined, status: 'ambiguous' };
    }

    const [incomingEdge] = incomingForPort;
    const sourceNode = context.nodeById.get(incomingEdge.sourceNode);
    if (!sourceNode) {
      return { value: undefined, status: 'unknown' };
    }

    return resolveNodeOutputCandidate(sourceNode, incomingEdge.sourcePort, context);
  };

  let resolved: CandidateValue;

  if (node.type === 'GetVariable') {
    const variableId = getVariableId(node);
    if (!variableId) {
      resolved = { value: undefined, status: 'unknown' };
    } else if (context.resolvedValues[variableId]) {
      const current = context.resolvedValues[variableId];
      resolved = { value: current.currentValue, status: current.status };
    } else {
      const fallback = context.variableById.get(variableId);
      resolved = fallback
        ? { value: fallback.defaultValue, status: 'resolved' }
        : { value: undefined, status: 'unknown' };
    }
  } else if (isSetVariableNode(node)) {
    const variableId = getVariableId(node);
    const variableDefault = variableId ? context.variableById.get(variableId)?.defaultValue : undefined;
    const valueInputPort = node.inputs.find((port) => isValueInputPort(port.id));

    if (valueInputPort) {
      const candidate = resolveInputPortCandidate(node, valueInputPort);
      if (candidate.status !== 'unknown') {
        resolved = candidate;
      } else {
        const fallbackValue = getEffectiveSetInputValue(node, variableDefault);
        resolved = {
          value: fallbackValue,
          status: fallbackValue === undefined ? 'unknown' : 'resolved',
        };
      }
    } else {
      const fallbackValue = getEffectiveSetInputValue(node, variableDefault);
      resolved = {
        value: fallbackValue,
        status: fallbackValue === undefined ? 'unknown' : 'resolved',
      };
    }
  } else if (isArithmeticNode(node)) {
    const operandPorts = node.inputs
      .filter((port) => port.dataType !== 'execution')
      .sort((left, right) => left.index - right.index);

    if (operandPorts.length === 0) {
      resolved = { value: undefined, status: 'unknown' };
    } else {
      let resultValue: number | null = null;
      let status: ResolvedVariableStatus = 'resolved';

      for (let index = 0; index < operandPorts.length; index += 1) {
        const operandPort = operandPorts[index];
        const operand = resolveInputPortCandidate(node, operandPort);
        if (operand.status === 'ambiguous') {
          status = 'ambiguous';
          break;
        }
        if (operand.status === 'unknown') {
          status = 'unknown';
          break;
        }

        const numeric = toNumericValue(operand.value);
        if (numeric === null) {
          status = 'unknown';
          break;
        }

        if (index === 0) {
          resultValue = numeric;
          continue;
        }

        if (resultValue === null) {
          status = 'unknown';
          break;
        }

        resultValue = evaluateArithmeticOperation(node.type, resultValue, numeric);
        if (resultValue === null || !Number.isFinite(resultValue)) {
          status = 'unknown';
          break;
        }
      }

      resolved = status === 'resolved'
        ? { value: resultValue, status }
        : { value: undefined, status };
    }
  } else {
    resolved = { value: undefined, status: 'unknown' };
  }

  context.cache.set(cacheKey, resolved);
  context.visiting.delete(cacheKey);
  return resolved;
};

const getCandidateValue = (
  setNode: BlueprintNode,
  contextBase: Omit<EvaluationContext, 'cache' | 'visiting'>
): CandidateValue => {
  const variableId = getVariableId(setNode);
  const variableDefault = variableId ? contextBase.variableById.get(variableId)?.defaultValue : undefined;
  const valueInputPort = setNode.inputs.find((port) => isValueInputPort(port.id));

  if (!valueInputPort) {
    const fallbackValue = getEffectiveSetInputValue(setNode, variableDefault);
    return {
      value: fallbackValue,
      status: fallbackValue === undefined ? 'unknown' : 'resolved',
    };
  }

  const localContext: EvaluationContext = {
    ...contextBase,
    cache: new Map<string, CandidateValue>(),
    visiting: new Set<string>(),
  };

  const incomingForNode = localContext.incomingDataEdges.get(setNode.id) ?? [];
  const incomingForValuePort = incomingForNode.filter((edge) => matchesPortId(edge.targetPort, valueInputPort.id));

  if (incomingForValuePort.length > 1) {
    return { value: undefined, status: 'ambiguous' };
  }

  if (incomingForValuePort.length === 1) {
    const sourceNode = localContext.nodeById.get(incomingForValuePort[0].sourceNode);
    if (!sourceNode) {
      return { value: undefined, status: 'unknown' };
    }

    const candidate = resolveNodeOutputCandidate(sourceNode, incomingForValuePort[0].sourcePort, localContext);
    if (candidate.status !== 'unknown') {
      return candidate;
    }
  }

  const fallbackValue = getEffectiveSetInputValue(setNode, variableDefault);
  return {
    value: fallbackValue,
    status: fallbackValue === undefined ? 'unknown' : 'resolved',
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
  const resolvedValues = getInitialResolvedValues(safeVariables, 'resolved', variableById);

  const startNodeIds = safeNodes
    .filter((node) => node.type === 'Start')
    .map((node) => node.id);

  if (startNodeIds.length === 0) {
    return getInitialResolvedValues(safeVariables, 'unknown', variableById);
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
    return getInitialResolvedValues(safeVariables, 'unknown', variableById);
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
        status: 'resolved',
      };
    }
  }

  const contextBase: Omit<EvaluationContext, 'cache' | 'visiting'> = {
    nodeById,
    variableById,
    incomingDataEdges,
    resolvedValues,
  };

  for (const nodeId of executionOrder) {
    const node = nodeById.get(nodeId);
    if (!node || !isSetVariableNode(node)) {
      continue;
    }

    const variableId = getVariableId(node);
    if (!variableId || !resolvedValues[variableId]) {
      continue;
    }

    const candidate = getCandidateValue(node, contextBase);

    resolvedValues[variableId] = applyCandidateValue(
      resolvedValues[variableId],
      candidate,
      node.id
    );
  }

  return resolvedValues;
};
