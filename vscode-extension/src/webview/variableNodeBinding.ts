import type {
  BlueprintEdge,
  BlueprintNode,
  BlueprintVariable,
  NodePort,
  PointerMeta,
} from '../shared/blueprintTypes';
import { normalizePointerMeta } from '../shared/blueprintTypes';
import type { PortDataType } from '../shared/portTypes';
import { formatVectorInput, supportsArrayDataType } from '../shared/vectorValue';

type VariableNodeType = 'Variable' | 'GetVariable' | 'SetVariable';

const VARIABLE_NODE_TYPES: VariableNodeType[] = ['GetVariable', 'SetVariable'];
const PORT_DATA_TYPES: PortDataType[] = [
  'execution',
  'bool',
  'int32',
  'int64',
  'float',
  'double',
  'string',
  'vector',
  'pointer',
  'class',
  'object-reference',
  'array',
  'any',
];

const DEFAULT_OVERLAP_OPTIONS: Required<OverlapSearchOptions> = {
  offsetStepX: 36,
  offsetStepY: 24,
  collisionDistance: 20,
  maxAttempts: 40,
};

interface VariableNodeProperties extends Record<string, unknown> {
  variableId?: string;
  dataType?: PortDataType;
  isArray?: boolean;
  arrayRank?: number;
  vectorElementType?: BlueprintVariable['vectorElementType'];
  pointerMeta?: PointerMeta;
  typeName?: string;
  classId?: string;
  targetClassId?: string;
  targetVariableId?: string;
  defaultValue?: BlueprintVariable['defaultValue'];
  inputValue?: unknown;
  inputValueIsOverride?: boolean;
  name?: string;
  nameRu?: string;
  codeName?: string;
  color?: string;
}

export type AvailableVariableBinding = Pick<
  BlueprintVariable,
  | 'id'
  | 'name'
  | 'nameRu'
  | 'codeName'
  | 'dataType'
  | 'typeName'
  | 'classId'
  | 'vectorElementType'
  | 'defaultValue'
  | 'color'
  | 'isArray'
  | 'arrayRank'
  | 'pointerMeta'
>;

export interface PositionedNode {
  id: string;
  position: { x: number; y: number };
}

export interface OverlapSearchOptions {
  offsetStepX?: number;
  offsetStepY?: number;
  collisionDistance?: number;
  maxAttempts?: number;
}

export interface RemovedVariableNodesResult {
  nodes: BlueprintNode[];
  edges: BlueprintEdge[];
  removedNodeIds: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asVariableNodeProperties = (value: unknown): VariableNodeProperties => {
  if (!isRecord(value)) {
    return {};
  }
  return value as VariableNodeProperties;
};

const isVariableNodeType = (type: BlueprintNode['type']): type is VariableNodeType =>
  VARIABLE_NODE_TYPES.includes(type as VariableNodeType);

const isPortDataType = (value: unknown): value is PortDataType =>
  typeof value === 'string' && PORT_DATA_TYPES.includes(value as PortDataType);

const normalizeDataType = (value: unknown): PortDataType => (isPortDataType(value) ? value : 'any');

const normalizeArrayRank = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (value === true) {
    return 1;
  }
  return 0;
};

const resolveArrayRank = (dataType: PortDataType, rank: unknown, isArray: unknown): number => {
  if (!supportsArrayDataType(dataType)) {
    return 0;
  }
  const normalized = normalizeArrayRank(rank);
  if (normalized > 0) {
    return normalized;
  }
  return isArray === true ? 1 : 0;
};

const isValueInputPortId = (portId: string): boolean =>
  portId === 'value-in' ||
  portId === 'value' ||
  portId.endsWith('-value-in') ||
  portId.endsWith('-value');

const isValueOutputPortId = (portId: string): boolean =>
  portId === 'value-out' ||
  portId === 'value' ||
  portId.endsWith('-value-out') ||
  portId.endsWith('-value');

const normalizeVariableName = (
  variable: AvailableVariableBinding,
  displayLanguage: 'ru' | 'en'
): string => {
  if (displayLanguage === 'ru') {
    return variable.nameRu || variable.name || '';
  }
  return variable.name || variable.nameRu || '';
};

const updateValuePortDataType = (
  nodeType: VariableNodeType,
  ports: NodePort[],
  targetSuffix: 'value-in' | 'value-out',
  dataType: PortDataType,
  metadata?: Pick<NodePort, 'typeName' | 'classId' | 'targetClassId'>
): NodePort[] => {
  const shouldUpdatePort = (port: NodePort): boolean => {
    if (nodeType === 'Variable') {
      return targetSuffix === 'value-out' && isValueOutputPortId(port.id);
    }
    if (nodeType === 'GetVariable' && targetSuffix === 'value-in') {
      return false;
    }
    if (nodeType === 'GetVariable' && targetSuffix === 'value-out') {
      return isValueOutputPortId(port.id);
    }
    if (targetSuffix === 'value-in') {
      return isValueInputPortId(port.id);
    }
    return isValueOutputPortId(port.id);
  };

  return ports.map((port) => {
    if (!shouldUpdatePort(port)) {
      return port;
    }

    return {
      ...port,
      dataType,
      typeName: metadata?.typeName,
      classId: metadata?.classId,
      targetClassId: metadata?.targetClassId,
    };
  });
};

export const getDefaultValueForDataType = (
  dataType: PortDataType,
  arrayRank: number | boolean = 0
): BlueprintVariable['defaultValue'] => {
  const normalizedRank = normalizeArrayRank(arrayRank);
  if (normalizedRank > 0) {
    return [];
  }

  switch (dataType) {
    case 'bool':
      return false;
    case 'int32':
    case 'int64':
    case 'float':
    case 'double':
      return 0;
    case 'string':
      return '';
    case 'vector':
      return [];
    case 'pointer':
    case 'class':
    case 'array':
    case 'any':
    case 'execution':
    default:
      return null;
  }
};

export const resolveVariableForNode = (
  node: BlueprintNode,
  availableVariables: AvailableVariableBinding[] = []
): AvailableVariableBinding | undefined => {
  if (!isVariableNodeType(node.type)) {
    return undefined;
  }

  const properties = asVariableNodeProperties(node.properties);
  const variableId = properties.variableId;
  if (typeof variableId !== 'string' || variableId.length === 0) {
    return undefined;
  }

  return availableVariables.find((variable) => variable.id === variableId);
};

export const getVariableNodeTitle = (
  nodeType: BlueprintNode['type'],
  variableName: string | undefined,
  localeBaseLabel: string
): string => {
  if (!isVariableNodeType(nodeType)) {
    return localeBaseLabel;
  }

  const safeName = variableName?.trim();
  if (!safeName) {
    return localeBaseLabel;
  }

  return `${localeBaseLabel}: ${safeName}`;
};

export const getEffectiveSetInputValue = (
  node: BlueprintNode,
  variableDefault: BlueprintVariable['defaultValue'] | undefined
): unknown => {
  if (node.type !== 'SetVariable') {
    return undefined;
  }

  const properties = asVariableNodeProperties(node.properties);
  const nodeDataType = normalizeDataType(properties.dataType);
  const pointerMeta = nodeDataType === 'pointer' ? normalizePointerMeta(properties.pointerMeta) : undefined;
  const effectiveDataType: PortDataType =
    pointerMeta &&
    pointerMeta.mode !== 'weak' &&
    (pointerMeta.mode === 'reference' ||
      pointerMeta.mode === 'const_reference' ||
      (pointerMeta.targetVariableId && pointerMeta.pointeeDataType !== 'class' && pointerMeta.pointeeDataType !== 'array'))
      ? pointerMeta.pointeeDataType
      : nodeDataType;
  const arrayRank = resolveArrayRank(effectiveDataType, properties.arrayRank, properties.isArray);
  const normalizedVariableDefault =
    nodeDataType === 'pointer' && effectiveDataType !== nodeDataType && variableDefault === null
      ? undefined
      : variableDefault;

  if (properties.inputValueIsOverride === true && properties.inputValue !== undefined) {
    return properties.inputValue;
  }

  if (normalizedVariableDefault !== undefined) {
    return normalizedVariableDefault;
  }

  if (properties.inputValue !== undefined) {
    return properties.inputValue;
  }

  return getDefaultValueForDataType(effectiveDataType, arrayRank);
};

export const formatVariableValueForDisplay = (
  value: unknown,
  displayLanguage: 'ru' | 'en'
): string => {
  if (value === undefined || value === null) {
    return displayLanguage === 'ru' ? '(нет)' : '(none)';
  }

  if (typeof value === 'boolean') {
    if (displayLanguage === 'ru') {
      return value ? 'Истина' : 'Ложь';
    }
    return value ? 'True' : 'False';
  }

  if (Array.isArray(value)) {
    return formatVectorInput(value);
  }

  return String(value);
};

export const bindVariableToNode = (
  node: BlueprintNode,
  variable: AvailableVariableBinding,
  displayLanguage: 'ru' | 'en'
): BlueprintNode => {
  if (!isVariableNodeType(node.type)) {
    return node;
  }

  const dataType = normalizeDataType(variable.dataType);
  const arrayRank = resolveArrayRank(dataType, variable.arrayRank, variable.isArray);
  const pointerMeta = dataType === 'pointer' ? normalizePointerMeta(variable.pointerMeta) : undefined;
  const pointerValueDataType: PortDataType | undefined =
    pointerMeta &&
    pointerMeta.mode !== 'weak' &&
    pointerMeta.pointeeDataType !== 'class' &&
    pointerMeta.pointeeDataType !== 'array' &&
    (pointerMeta.mode === 'reference' ||
      pointerMeta.mode === 'const_reference' ||
      Boolean(pointerMeta.targetVariableId))
      ? pointerMeta.pointeeDataType
      : undefined;
  const portDataType: PortDataType = arrayRank > 0 ? 'array' : (pointerValueDataType ?? dataType);
  const portTypeMetadata: Pick<NodePort, 'typeName' | 'classId' | 'targetClassId'> = {
    typeName: variable.typeName ?? pointerMeta?.typeName,
    classId: variable.classId,
    targetClassId: pointerMeta?.targetClassId,
  };
  const properties = asVariableNodeProperties(node.properties);
  const nextProperties: VariableNodeProperties = {
    ...properties,
    variableId: variable.id,
    dataType,
    isArray: arrayRank > 0,
    arrayRank,
    vectorElementType: variable.vectorElementType,
    pointerMeta,
    typeName: variable.typeName,
    classId: variable.classId,
    targetClassId: pointerMeta?.targetClassId,
    targetVariableId: pointerMeta?.targetVariableId,
    defaultValue: variable.defaultValue,
    name: variable.name,
    nameRu: variable.nameRu,
    codeName: variable.codeName,
    color: variable.color,
  };

  if (node.type === 'SetVariable') {
    const hasOverride = properties.inputValueIsOverride === true;
    const fallbackValue = variable.defaultValue ?? getDefaultValueForDataType(pointerValueDataType ?? dataType, arrayRank);

    nextProperties.inputValueIsOverride = hasOverride;
    nextProperties.inputValue = hasOverride
      ? properties.inputValue ?? fallbackValue
      : fallbackValue;
  }

  const boundNodeName = normalizeVariableName(variable, displayLanguage);

  const nextInputs =
    node.type === 'SetVariable'
      ? updateValuePortDataType(node.type, node.inputs, 'value-in', portDataType, portTypeMetadata)
      : node.inputs;
  const nextOutputs = updateValuePortDataType(node.type, node.outputs, 'value-out', portDataType, portTypeMetadata);

  return {
    ...node,
    customLabel: node.customLabel,
    label: node.label,
    inputs: nextInputs,
    outputs: nextOutputs,
    properties: {
      ...nextProperties,
      [displayLanguage === 'ru' ? 'nameRu' : 'name']: boundNodeName,
    },
  };
};

export const findNonOverlappingPosition = (
  basePosition: { x: number; y: number },
  occupiedNodes: PositionedNode[],
  options?: OverlapSearchOptions
): { x: number; y: number } => {
  const merged = { ...DEFAULT_OVERLAP_OPTIONS, ...options };

  const isColliding = (candidate: { x: number; y: number }): boolean =>
    occupiedNodes.some(
      (node) =>
        Math.abs(node.position.x - candidate.x) <= merged.collisionDistance &&
        Math.abs(node.position.y - candidate.y) <= merged.collisionDistance
    );

  if (!isColliding(basePosition)) {
    return basePosition;
  }

  for (let attempt = 1; attempt <= merged.maxAttempts; attempt += 1) {
    const candidate = {
      x: basePosition.x + merged.offsetStepX * attempt,
      y: basePosition.y + merged.offsetStepY * attempt,
    };
    if (!isColliding(candidate)) {
      return candidate;
    }
  }

  return {
    x: basePosition.x + merged.offsetStepX * merged.maxAttempts,
    y: basePosition.y + merged.offsetStepY * merged.maxAttempts,
  };
};

export const removeNodesByDeletedVariables = (
  nodes: BlueprintNode[],
  edges: BlueprintEdge[],
  removedVariableIds: Iterable<string>
): RemovedVariableNodesResult => {
  const removedIdsSet = new Set(removedVariableIds);
  if (removedIdsSet.size === 0) {
    return { nodes, edges, removedNodeIds: [] };
  }

  const removedNodeIds = nodes
    .filter((node) => {
      if (!isVariableNodeType(node.type)) {
        return false;
      }
      const variableId = asVariableNodeProperties(node.properties).variableId;
      return typeof variableId === 'string' && removedIdsSet.has(variableId);
    })
    .map((node) => node.id);

  if (removedNodeIds.length === 0) {
    return { nodes, edges, removedNodeIds: [] };
  }

  const removedNodeIdSet = new Set(removedNodeIds);
  const nextNodes = nodes.filter((node) => !removedNodeIdSet.has(node.id));
  const nextEdges = edges.filter(
    (edge) => !removedNodeIdSet.has(edge.sourceNode) && !removedNodeIdSet.has(edge.targetNode)
  );

  return {
    nodes: nextNodes,
    edges: nextEdges,
    removedNodeIds,
  };
};
