import type { GraphEdge, GraphEdgeKind, GraphNode, GraphState } from './graphState';
import type { ValidationIssue, ValidationResult } from './messages';
import type { BlueprintVariable, VectorElementType } from './blueprintTypes';
import { normalizePointerMeta } from './blueprintTypes';
import type { PortDataType } from './portTypeContract';
import { isPortDataType } from './portTypeContract';
import {
  canDirectlyConnectDataPorts,
  findTypeConversionRule,
} from './typeConversions';

export type { ValidationIssue, ValidationResult } from './messages';

type EmbeddedNode = {
  type?: unknown;
  inputs?: unknown;
  outputs?: unknown;
};

type EmbeddedEdge = {
  kind?: unknown;
  sourcePort?: unknown;
  targetPort?: unknown;
};

type EmbeddedPort = {
  id?: unknown;
  dataType?: unknown;
};

interface NormalizedGraphVariable {
  id: string;
  name: string;
  nameRu: string;
  dataType: string;
  vectorElementType?: VectorElementType;
  pointerMeta?: ReturnType<typeof normalizePointerMeta>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isGraphEdgeKind = (value: unknown): value is GraphEdgeKind =>
  value === 'execution' || value === 'data';

const toEmbeddedNode = (value: unknown): EmbeddedNode | null => {
  if (!isRecord(value)) {
    return null;
  }
  return value as EmbeddedNode;
};

const toEmbeddedEdge = (value: unknown): EmbeddedEdge | null => {
  if (!isRecord(value)) {
    return null;
  }
  return value as EmbeddedEdge;
};

const toEmbeddedPorts = (value: unknown): EmbeddedPort[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item) => isRecord(item)) as EmbeddedPort[];
};

const getEffectiveEdgeKind = (edge: GraphEdge): GraphEdgeKind => {
  if (isGraphEdgeKind(edge.kind)) {
    return edge.kind;
  }
  const embedded = toEmbeddedEdge(edge.blueprintEdge);
  if (embedded && isGraphEdgeKind(embedded.kind)) {
    return embedded.kind;
  }
  return 'execution';
};

const getEmbeddedNodeType = (node: GraphNode): string | null => {
  const embedded = toEmbeddedNode(node.blueprintNode);
  if (!embedded || typeof embedded.type !== 'string') {
    return null;
  }
  return embedded.type;
};

const hasExecutionPorts = (node: GraphNode): boolean => {
  const embedded = toEmbeddedNode(node.blueprintNode);
  if (!embedded) {
    return false;
  }
  const ports = [...toEmbeddedPorts(embedded.inputs), ...toEmbeddedPorts(embedded.outputs)];
  return ports.some((port) => port.dataType === 'execution');
};

const isExecutionRelevantNode = (node: GraphNode): boolean => {
  if (node.type === 'Start' || node.type === 'End') {
    return true;
  }

  if (node.type === 'Function') {
    return true;
  }

  if (node.type === 'Variable') {
    return hasExecutionPorts(node);
  }

  if (node.type === 'Custom') {
    const hasEmbedded = toEmbeddedNode(node.blueprintNode) !== null;
    return hasEmbedded ? hasExecutionPorts(node) : true;
  }

  return hasExecutionPorts(node);
};

const isGetSetVariableLink = (source: GraphNode, target: GraphNode): boolean => {
  const sourceType = getEmbeddedNodeType(source);
  const targetType = getEmbeddedNodeType(target);
  return sourceType === 'GetVariable' && targetType === 'SetVariable';
};

const isLikelyGetSetByHandles = (edge: GraphEdge): boolean => {
  const embedded = toEmbeddedEdge(edge.blueprintEdge);
  if (!embedded) {
    return false;
  }

  const sourceHandle = typeof embedded.sourcePort === 'string' ? embedded.sourcePort : '';
  const targetHandle = typeof embedded.targetPort === 'string' ? embedded.targetPort : '';
  return sourceHandle.includes('value-out') && targetHandle.includes('value-in');
};

const isLikelyGetSetByLabels = (source: GraphNode, target: GraphNode): boolean => {
  const sourceLabel = source.label.toLowerCase();
  const targetLabel = target.label.toLowerCase();

  const sourceLooksLikeGet =
    sourceLabel.includes('get') || sourceLabel.includes('получ');
  const targetLooksLikeSet =
    targetLabel.includes('set') || targetLabel.includes('установ');

  return sourceLooksLikeGet && targetLooksLikeSet;
};

const hasNamedPort = (ports: EmbeddedPort[] | unknown, fragment: string): boolean => {
  if (!Array.isArray(ports)) {
    return false;
  }

  return ports.some((port) => {
    if (!isRecord(port)) {
      return false;
    }
    const id = typeof port.id === 'string' ? port.id : '';
    return id.includes(fragment);
  });
};

const isLikelyGetSetByPortShape = (source: GraphNode, target: GraphNode): boolean => {
  const sourceEmbedded = toEmbeddedNode(source.blueprintNode);
  const targetEmbedded = toEmbeddedNode(target.blueprintNode);
  if (!sourceEmbedded || !targetEmbedded) {
    return false;
  }

  const sourceOutputs = Array.isArray(sourceEmbedded.outputs) ? sourceEmbedded.outputs : [];
  const sourceInputs = Array.isArray(sourceEmbedded.inputs) ? sourceEmbedded.inputs : [];
  const targetOutputs = Array.isArray(targetEmbedded.outputs) ? targetEmbedded.outputs : [];
  const targetInputs = Array.isArray(targetEmbedded.inputs) ? targetEmbedded.inputs : [];

  const sourceHasValueOut = hasNamedPort(sourceOutputs, 'value-out');
  const sourceHasExecPort = hasNamedPort(sourceInputs, 'exec-') || hasNamedPort(sourceOutputs, 'exec-');
  const targetHasValueIn = hasNamedPort(targetInputs, 'value-in');
  const targetHasExecIn = hasNamedPort(targetInputs, 'exec-in');
  const targetHasExecOut = hasNamedPort(targetOutputs, 'exec-out');

  return sourceHasValueOut && !sourceHasExecPort && targetHasValueIn && targetHasExecIn && targetHasExecOut;
};

const isValidVariableDataTransfer = (
  edge: GraphEdge,
  source: GraphNode,
  target: GraphNode
): boolean =>
  isGetSetVariableLink(source, target) ||
  isLikelyGetSetByHandles(edge) ||
  isLikelyGetSetByLabels(source, target) ||
  isLikelyGetSetByPortShape(source, target);

const getEdgeHandleSignature = (edge: GraphEdge): { sourceHandle: string; targetHandle: string } => {
  const embedded = toEmbeddedEdge(edge.blueprintEdge);
  const sourceHandle =
    embedded && typeof embedded.sourcePort === 'string' ? embedded.sourcePort : '';
  const targetHandle =
    embedded && typeof embedded.targetPort === 'string' ? embedded.targetPort : '';
  return { sourceHandle, targetHandle };
};

const VECTOR_ELEMENT_TYPES = new Set(['int32', 'int64', 'float', 'double', 'bool', 'string']);

const matchHandleToPortId = (portId: string, handle: string): boolean => {
  if (portId === handle) {
    return true;
  }

  if (handle.endsWith(`-${portId}`) || portId.endsWith(`-${handle}`)) {
    return true;
  }

  const tail = handle.split('-').slice(-2).join('-');
  return tail === portId;
};

const getEmbeddedPortDataType = (
  node: GraphNode,
  direction: 'input' | 'output',
  handle: string
): PortDataType | null => {
  const embedded = toEmbeddedNode(node.blueprintNode);
  if (!embedded) {
    return null;
  }

  const ports = direction === 'input'
    ? toEmbeddedPorts(embedded.inputs)
    : toEmbeddedPorts(embedded.outputs);

  if (!ports.length) {
    return null;
  }

  const normalizedHandle = handle.trim();
  const matchedPort = normalizedHandle.length > 0
    ? ports.find((port) => typeof port.id === 'string' && matchHandleToPortId(port.id, normalizedHandle))
    : null;

  if (matchedPort && isPortDataType(matchedPort.dataType)) {
    return matchedPort.dataType;
  }

  if (ports.length === 1 && isPortDataType(ports[0].dataType)) {
    return ports[0].dataType;
  }

  return null;
};

const resolveDataEdgeTypes = (
  edge: GraphEdge,
  source: GraphNode,
  target: GraphNode
): { sourceType: PortDataType; targetType: PortDataType } | null => {
  const { sourceHandle, targetHandle } = getEdgeHandleSignature(edge);
  if (!sourceHandle || !targetHandle) {
    return null;
  }

  const sourceType = getEmbeddedPortDataType(source, 'output', sourceHandle);
  const targetType = getEmbeddedPortDataType(target, 'input', targetHandle);
  if (!sourceType || !targetType) {
    return null;
  }

  return { sourceType, targetType };
};

const normalizeGraphVariables = (state: GraphState): NormalizedGraphVariable[] => {
  const variables = Array.isArray(state.variables) ? state.variables : [];

  return variables
    .filter((raw): raw is Record<string, unknown> => isRecord(raw))
    .map((raw, index) => {
      const id = typeof raw.id === 'string' && raw.id.trim().length > 0
        ? raw.id
        : `legacy_pointer_${index + 1}`;
      const name = typeof raw.name === 'string' ? raw.name : '';
      const nameRu = typeof raw.nameRu === 'string' ? raw.nameRu : name;
      const dataType = isPortDataType(raw.dataType) ? raw.dataType : 'any';
      const vectorElementType =
        typeof raw.vectorElementType === 'string' && VECTOR_ELEMENT_TYPES.has(raw.vectorElementType)
          ? (raw.vectorElementType as VectorElementType)
          : undefined;
      const variable = raw as unknown as BlueprintVariable;

      return {
        id,
        name,
        nameRu,
        dataType,
        vectorElementType,
        pointerMeta: dataType === 'pointer' ? normalizePointerMeta(variable.pointerMeta) : undefined,
      };
    });
};

const readableVariableName = (variable: NormalizedGraphVariable): string =>
  variable.nameRu || variable.name || variable.id;

const resolveComparableTargetType = (
  variable: NormalizedGraphVariable
): { dataType: string | null; vectorElementType?: VectorElementType; pointerMode?: string } => {
  if (variable.dataType === 'pointer') {
    const pointerMeta = variable.pointerMeta ?? normalizePointerMeta(undefined);
    return {
      dataType: pointerMeta.pointeeDataType,
      vectorElementType: pointerMeta.pointeeVectorElementType,
      pointerMode: pointerMeta.mode,
    };
  }

  if (variable.dataType === 'execution' || variable.dataType === 'any') {
    return { dataType: null };
  }

  return {
    dataType: variable.dataType,
    vectorElementType: variable.vectorElementType,
  };
};

const findReferenceCycles = (variables: NormalizedGraphVariable[]): string[][] => {
  const pointerById = new Map(
    variables
      .filter((variable) => variable.dataType === 'pointer')
      .map((variable) => [variable.id, variable])
  );

  const adjacency = new Map<string, string[]>();
  pointerById.forEach((variable) => {
    const mode = variable.pointerMeta?.mode;
    const target = variable.pointerMeta?.targetVariableId;
    if ((mode === 'reference' || mode === 'const_reference') && typeof target === 'string') {
      adjacency.set(variable.id, [target]);
    }
  });

  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];
  const cycles: string[][] = [];

  const dfs = (nodeId: string): void => {
    if (stack.has(nodeId)) {
      const cycleStart = path.indexOf(nodeId);
      if (cycleStart >= 0) {
        const cycle = path.slice(cycleStart);
        if (cycle.length > 1) {
          cycles.push([...cycle, nodeId]);
        }
      }
      return;
    }
    if (visited.has(nodeId)) {
      return;
    }

    visited.add(nodeId);
    stack.add(nodeId);
    path.push(nodeId);

    const next = adjacency.get(nodeId) ?? [];
    for (const target of next) {
      if (pointerById.has(target)) {
        dfs(target);
      }
    }

    path.pop();
    stack.delete(nodeId);
  };

  pointerById.forEach((_value, nodeId) => dfs(nodeId));
  return cycles;
};

export const validateGraphState = (state: GraphState): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const issues: ValidationIssue[] = [];

  const pushIssue = (
    severity: ValidationIssue['severity'],
    message: string,
    targets?: { nodes?: string[]; edges?: string[] }
  ): void => {
    if (severity === 'error') {
      errors.push(message);
    } else {
      warnings.push(message);
    }
    issues.push({
      severity,
      message,
      nodes: targets?.nodes,
      edges: targets?.edges
    });
  };

  if (!state.nodes.length) {
    const message = 'Graph must contain at least one node.';
    return {
      ok: false,
      errors: [message],
      warnings,
      issues: [{ severity: 'error', message }]
    };
  }

  const startNodes = state.nodes.filter((node) => node.type === 'Start');
  if (startNodes.length === 0) {
    pushIssue('error', 'Graph must contain a Start node.');
  } else if (startNodes.length > 1) {
    pushIssue(
      'error',
      'Only one Start node is allowed.',
      startNodes.length ? { nodes: startNodes.map((node) => node.id) } : undefined
    );
  }

  const endNodes = state.nodes.filter((node) => node.type === 'End');
  if (!endNodes.length) {
    pushIssue('error', 'Graph must contain at least one End node.');
  }

  const nodeMap = new Map(state.nodes.map((node) => [node.id, node]));
  const executionEdges: GraphEdge[] = [];
  const dataEdges: GraphEdge[] = [];

  state.edges.forEach((edge, index) => {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) {
      pushIssue('error', `Edge #${index + 1} references missing nodes.`, { edges: [edge.id] });
      return;
    }

    if (edge.source === edge.target) {
      pushIssue('error', `Edge ${edge.id} creates a self-loop.`, { edges: [edge.id] });
      return;
    }

    const kind = getEffectiveEdgeKind(edge);
    if (kind === 'execution') {
      executionEdges.push(edge);
      if (source.type === 'End') {
        pushIssue(
          'error',
          `Execution edge ${edge.source} -> ${edge.target} cannot start from End node "${source.label}".`,
          { edges: [edge.id], nodes: [source.id] }
        );
      }
      if (target.type === 'Start') {
        pushIssue(
          'error',
          `Execution edge ${edge.source} -> ${edge.target} cannot target Start node "${target.label}".`,
          { edges: [edge.id], nodes: [target.id] }
        );
      }
    } else {
      dataEdges.push(edge);
      if (source.type === 'Start' || target.type === 'Start') {
        pushIssue(
          'error',
          `Data edge ${edge.source} -> ${edge.target} cannot involve Start nodes.`,
          { edges: [edge.id], nodes: [source.id, target.id] }
        );
      }
      if (source.type === 'End') {
        pushIssue(
          'error',
          `Data edge ${edge.source} -> ${edge.target} cannot originate from End nodes.`,
          { edges: [edge.id], nodes: [source.id] }
        );
      }
    }
  });

  if (state.nodes.length > 1 && !executionEdges.length) {
    pushIssue('error', 'Graph does not contain execution flow connections.');
  }

  const seenEdges = new Set<string>();
  state.edges.forEach((edge) => {
    const kind = getEffectiveEdgeKind(edge);
    const { sourceHandle, targetHandle } = getEdgeHandleSignature(edge);
    const signature =
      `${edge.source}->${edge.target}:${kind}:${sourceHandle}:${targetHandle}`;
    if (seenEdges.has(signature)) {
      pushIssue(
        'warning',
        `Duplicate edge ${edge.source} -> ${edge.target} (${kind}).`,
        { edges: [edge.id] }
      );
    } else {
      seenEdges.add(signature);
    }
  });

  const startNode = startNodes.length === 1 ? startNodes[0] : null;
  if (startNode) {
    const incomingStart = executionEdges.some((edge) => edge.target === startNode.id);
    if (incomingStart) {
      pushIssue('error', 'Start node cannot have incoming execution edges.', { nodes: [startNode.id] });
    }
    const outgoingStart = executionEdges.filter((edge) => edge.source === startNode.id).length;
    if (!outgoingStart) {
      pushIssue('warning', 'Start node has no outgoing execution edges.', { nodes: [startNode.id] });
    }
  }

  if (endNodes.length) {
    endNodes.forEach((node) => {
      const outgoing = executionEdges.some((edge) => edge.source === node.id);
      if (outgoing) {
        pushIssue('error', `End node "${node.label}" cannot have outgoing execution edges.`, {
          nodes: [node.id]
        });
      }
      const incoming = executionEdges.some((edge) => edge.target === node.id);
      if (!incoming) {
        pushIssue('warning', `End node "${node.label}" has no incoming execution edges.`, {
          nodes: [node.id]
        });
      }
    });
  }

  if (startNode && executionEdges.length) {
    const reachable = traverse(startNode.id, executionEdges);
    const unreachable = state.nodes.filter(
      (node) => node.type !== 'Start' && isExecutionRelevantNode(node) && !reachable.has(node.id)
    );
    if (unreachable.length) {
      pushIssue(
        'error',
        `Unreachable nodes: ${unreachable.map((node) => node.label).join(', ')}.`,
        { nodes: unreachable.map((node) => node.id) }
      );
    }
  }

  const cycle = detectCycle(state.nodes, executionEdges);
  if (cycle) {
    pushIssue('error', `Execution cycle detected: ${cycle.join(' -> ')}`, { nodes: cycle });
  }

  dataEdges.forEach((edge) => {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) {
      return;
    }

    const edgeTypes = resolveDataEdgeTypes(edge, source, target);
    if (edgeTypes) {
      const { sourceType, targetType } = edgeTypes;
      const isDirectCompatible = canDirectlyConnectDataPorts(sourceType, targetType);
      const hasConversionRule = findTypeConversionRule(sourceType, targetType) !== null;
      if (!isDirectCompatible && !hasConversionRule) {
        pushIssue(
          'error',
          `Incompatible data edge ${edge.source} -> ${edge.target}: ${sourceType} -> ${targetType}.`,
          { edges: [edge.id], nodes: [source.id, target.id] }
        );
      }
    }

    if (source.type === 'Variable' && target.type === 'Variable') {
      if (isValidVariableDataTransfer(edge, source, target)) {
        return;
      }
      pushIssue(
        'warning',
        `Data edge ${edge.source} -> ${edge.target} connects two Variable nodes.`,
        { edges: [edge.id], nodes: [source.id, target.id] }
      );
    }
  });

  const graphVariables = normalizeGraphVariables(state);
  const variableById = new Map(graphVariables.map((variable) => [variable.id, variable]));

  for (const variable of graphVariables) {
    if (variable.dataType !== 'pointer') {
      continue;
    }

    const pointerMeta = variable.pointerMeta ?? normalizePointerMeta(undefined);
    const variableName = readableVariableName(variable);
    const requiresTarget =
      pointerMeta.mode === 'reference' ||
      pointerMeta.mode === 'const_reference' ||
      pointerMeta.mode === 'weak';

    if (requiresTarget && !pointerMeta.targetVariableId) {
      pushIssue(
        'error',
        `Pointer variable "${variableName}" (${variable.id}) requires target for mode ${pointerMeta.mode}.`
      );
      continue;
    }

    if (!pointerMeta.targetVariableId) {
      continue;
    }

    const target = variableById.get(pointerMeta.targetVariableId);
    if (!target) {
      pushIssue(
        'error',
        `Pointer variable "${variableName}" (${variable.id}) has unknown target ${pointerMeta.targetVariableId}.`
      );
      continue;
    }

    if (target.id === variable.id) {
      pushIssue(
        'warning',
        `Pointer variable "${variableName}" (${variable.id}) references itself.`,
        { nodes: [variable.id] }
      );
    }

    const targetShape = resolveComparableTargetType(target);
    if (!targetShape.dataType || targetShape.dataType !== pointerMeta.pointeeDataType) {
      pushIssue(
        'error',
        `Pointer variable "${variableName}" (${variable.id}) has incompatible target type.`,
        { nodes: [variable.id, target.id] }
      );
      continue;
    }

    if (pointerMeta.pointeeDataType === 'vector') {
      const left = pointerMeta.pointeeVectorElementType ?? 'double';
      const right = targetShape.vectorElementType ?? 'double';
      if (left !== right) {
        pushIssue(
          'error',
          `Pointer variable "${variableName}" (${variable.id}) has incompatible target vector element type.`,
          { nodes: [variable.id, target.id] }
        );
      }
    }

    if (pointerMeta.mode === 'weak') {
      if (target.dataType !== 'pointer' || targetShape.pointerMode !== 'shared') {
        pushIssue(
          'error',
          `Weak pointer "${variableName}" (${variable.id}) must target shared pointer variable.`,
          { nodes: [variable.id, target.id] }
        );
      }
    }
  }

  const referenceCycles = findReferenceCycles(graphVariables);
  for (const cycle of referenceCycles) {
    pushIssue(
      'warning',
      `Reference cycle detected: ${cycle.join(' -> ')}`,
      { nodes: cycle }
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    issues
  };
};

const traverse = (startId: string, executionEdges: GraphEdge[]): Set<string> => {
  const adjacency = new Map<string, string[]>();
  for (const edge of executionEdges) {
    const list = adjacency.get(edge.source) ?? [];
    list.push(edge.target);
    adjacency.set(edge.source, list);
  }

  const visited = new Set<string>();
  const queue: string[] = [startId];

  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    const targets = adjacency.get(current) ?? [];
    targets.forEach((target) => queue.push(target));
  }

  return visited;
};

const detectCycle = (nodes: GraphNode[], executionEdges: GraphEdge[]): string[] | null => {
  const adjacency = new Map<string, string[]>();
  executionEdges.forEach((edge) => {
    const list = adjacency.get(edge.source) ?? [];
    list.push(edge.target);
    adjacency.set(edge.source, list);
  });

  const visited = new Set<string>();
  const stack = new Set<string>();

  const dfs = (nodeId: string, path: string[]): string[] | null => {
    if (stack.has(nodeId)) {
      const cycleStart = path.indexOf(nodeId);
      return [...path.slice(cycleStart), nodeId];
    }
    if (visited.has(nodeId)) {
      return null;
    }
    visited.add(nodeId);
    stack.add(nodeId);
    const neighbors = adjacency.get(nodeId) ?? [];
    for (const next of neighbors) {
      const cycle = dfs(next, [...path, nodeId]);
      if (cycle) {
        return cycle;
      }
    }
    stack.delete(nodeId);
    return null;
  };

  for (const node of nodes) {
    const cycle = dfs(node.id, []);
    if (cycle) {
      return cycle;
    }
  }
  return null;
};
