import type { BlueprintNode, BlueprintNodeType as NodeType, NodePort } from '../shared/blueprintTypes';
import type { PortDataType } from '../shared/portTypes';

const NUMERIC_TYPES: ReadonlyArray<PortDataType> = ['int32', 'int64', 'float', 'double'];
const INTEGER_TYPES: ReadonlyArray<PortDataType> = ['int32', 'int64'];
const EQUALITY_COMPARISON_TYPES: ReadonlyArray<PortDataType> = [
  'bool',
  ...NUMERIC_TYPES,
  'string',
  'pointer',
  'class',
];

const NUMERIC_MATH_NODE_TYPES: ReadonlySet<NodeType> = new Set<NodeType>([
  'Add',
  'Subtract',
  'Multiply',
  'Divide',
  'Modulo',
]);

const NUMERIC_COMPARISON_NODE_TYPES: ReadonlySet<NodeType> = new Set<NodeType>([
  'Greater',
  'Less',
  'GreaterEqual',
  'LessEqual',
]);
const EQUALITY_COMPARISON_NODE_TYPES: ReadonlySet<NodeType> = new Set<NodeType>([
  'Equal',
  'NotEqual',
]);

export const isNumericDataType = (type: PortDataType): boolean =>
  NUMERIC_TYPES.includes(type);

export const isNumericComparisonNodeType = (type: NodeType): boolean =>
  NUMERIC_COMPARISON_NODE_TYPES.has(type);

export const isEqualityComparisonNodeType = (type: NodeType): boolean =>
  EQUALITY_COMPARISON_NODE_TYPES.has(type);

export const isAutoRetargetComparisonNodeType = (type: NodeType): boolean =>
  isNumericComparisonNodeType(type) || isEqualityComparisonNodeType(type);

export const isPolymorphicNumericNodeType = (type: NodeType): boolean =>
  NUMERIC_MATH_NODE_TYPES.has(type) || isNumericComparisonNodeType(type);

export const shouldShowNumericTypeToolbar = (type: NodeType): boolean =>
  isPolymorphicNumericNodeType(type);

const getAllowedRetargetTypesForNodeType = (type: NodeType): ReadonlyArray<PortDataType> => {
  if (type === 'Modulo') {
    return INTEGER_TYPES;
  }
  if (isPolymorphicNumericNodeType(type)) {
    return NUMERIC_TYPES;
  }
  if (isEqualityComparisonNodeType(type)) {
    return EQUALITY_COMPARISON_TYPES;
  }
  return [];
};

export const canRetargetNodeToDataType = (
  type: NodeType,
  dataType: PortDataType
): boolean => getAllowedRetargetTypesForNodeType(type).includes(dataType);

export const getAllowedNumericTypesForNodeType = (type: NodeType): ReadonlyArray<PortDataType> => {
  if (type === 'Modulo') {
    return INTEGER_TYPES;
  }
  if (isPolymorphicNumericNodeType(type)) {
    return NUMERIC_TYPES;
  }
  return [];
};

export const getDefaultNumericTypeForNodeType = (type: NodeType): PortDataType => {
  if (type === 'Modulo') {
    return 'int32';
  }
  return 'float';
};

export const inferNodeNumericType = (node: BlueprintNode): PortDataType | null => {
  if (!isPolymorphicNumericNodeType(node.type)) {
    return null;
  }

  const allowedTypes = getAllowedNumericTypesForNodeType(node.type);
  const rawNumericType = node.properties?.numericType;
  if (typeof rawNumericType === 'string' && allowedTypes.includes(rawNumericType as PortDataType)) {
    return rawNumericType as PortDataType;
  }

  const candidatePorts: NodePort[] = [...node.inputs, ...node.outputs];
  const fromPorts = candidatePorts.find((port) => isNumericDataType(port.dataType))?.dataType;
  if (fromPorts && allowedTypes.includes(fromPorts)) {
    return fromPorts;
  }

  return getDefaultNumericTypeForNodeType(node.type);
};

export const retargetNodeNumericPorts = (
  node: BlueprintNode,
  targetType: PortDataType
): BlueprintNode => {
  const allowedTypes = getAllowedRetargetTypesForNodeType(node.type);
  if (!allowedTypes.includes(targetType)) {
    return node;
  }

  let changed = false;
  const nextInputs: NodePort[] = node.inputs.map((port): NodePort => {
    if (port.dataType === 'execution') {
      return port;
    }
    if (port.dataType === targetType) {
      return port;
    }
    changed = true;
    return {
      ...port,
      dataType: targetType,
    };
  });

  const keepBoolResult = isAutoRetargetComparisonNodeType(node.type);
  const nextOutputs: NodePort[] = node.outputs.map((port): NodePort => {
    if (port.dataType === 'execution') {
      return port;
    }
    if (keepBoolResult) {
      if (port.dataType === 'bool') {
        return port;
      }
      changed = true;
      return {
        ...port,
        dataType: 'bool' as PortDataType,
      };
    }
    if (port.dataType === targetType) {
      return port;
    }
    changed = true;
    return {
      ...port,
      dataType: targetType,
    };
  });

  const typePropertyKey = isEqualityComparisonNodeType(node.type)
    ? 'comparisonType'
    : 'numericType';
  const storedType = node.properties?.[typePropertyKey];
  const currentTargetType = typeof storedType === 'string'
    ? storedType
    : undefined;
  if (currentTargetType !== targetType) {
    changed = true;
  }

  if (!changed) {
    return node;
  }

  return {
    ...node,
    inputs: nextInputs.map((port, index) => ({ ...port, index })),
    outputs: nextOutputs.map((port, index) => ({ ...port, index })),
    properties: {
      ...node.properties,
      [typePropertyKey]: targetType,
      autoTypeConversion: true,
    },
  };
};
