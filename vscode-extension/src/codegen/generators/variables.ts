/**
 * Генераторы для Variable узлов
 * 
 * Variable, GetVariable, SetVariable
 */

import type {
  BlueprintNode,
  BlueprintNodeType,
  TypeConversionMeta,
  BlueprintVariable,
  PointerMeta,
  VectorElementType,
} from '../../shared/blueprintTypes';
import { normalizePointerMeta } from '../../shared/blueprintTypes';
import type { PortDataType } from '../../shared/portTypes';
import { parseArrayInput, supportsArrayDataType } from '../../shared/vectorValue';
import {
  applyTypeConversionTemplate,
  type TypeConversionHelperId,
  type TypeConversionRule,
  findTypeConversionRule,
  findTypeConversionRuleById,
} from '../../shared/typeConversions';
import type { CodeGenContext } from '../types';
import { CodeGenErrorCode } from '../types';
import {
  toValidIdentifier,
  getCppVariableType,
  getCppType,
  getDefaultValue,
  normalizeArrayRank,
} from '../types';
import {
  resolvePointerCppType,
  resolvePointerInitializer,
} from '../pointerCodegen';
import {
  BaseNodeGenerator,
  GeneratorHelpers,
  NodeGenerationResult,
} from './base';

interface VariableNodeProperties extends Record<string, unknown> {
  variableId?: unknown;
  name?: unknown;
  nameRu?: unknown;
  codeName?: unknown;
  dataType?: unknown;
  isArray?: unknown;
  arrayRank?: unknown;
  vectorElementType?: unknown;
  pointerMeta?: unknown;
  targetVariableId?: unknown;
  defaultValue?: unknown;
  inputValue?: unknown;
  inputValueIsOverride?: unknown;
  conversionId?: unknown;
  fromType?: unknown;
  toType?: unknown;
  autoInserted?: unknown;
  meta?: unknown;
}

interface ResolvedVariableDescriptor {
  variableId?: string;
  variable: BlueprintVariable | null;
  codeName: string;
  identifier: string;
  originalName: string;
  dataType: PortDataType;
  arrayRank: number;
  vectorElementType?: VectorElementType;
  pointerMeta?: PointerMeta;
  cppType: string;
  defaultExpr: string;
  aliases: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asVariableNodeProperties = (value: unknown): VariableNodeProperties => {
  if (!isRecord(value)) {
    return {};
  }
  return value as VariableNodeProperties;
};

const isPortDataType = (value: unknown): value is PortDataType => {
  if (typeof value !== 'string') {
    return false;
  }

  return (
    value === 'execution' ||
    value === 'bool' ||
    value === 'int32' ||
    value === 'int64' ||
    value === 'float' ||
    value === 'double' ||
    value === 'string' ||
    value === 'vector' ||
    value === 'pointer' ||
    value === 'class' ||
    value === 'array' ||
    value === 'any'
  );
};

const VECTOR_ELEMENT_TYPES: VectorElementType[] = [
  'int32',
  'int64',
  'float',
  'double',
  'bool',
  'string',
];

const isVectorElementType = (value: unknown): value is VectorElementType =>
  typeof value === 'string' && VECTOR_ELEMENT_TYPES.includes(value as VectorElementType);

const isNumericType = (dataType: PortDataType): boolean =>
  dataType === 'int32' ||
  dataType === 'int64' ||
  dataType === 'float' ||
  dataType === 'double';

const isNumericOrBoolType = (dataType: PortDataType): boolean =>
  dataType === 'bool' || isNumericType(dataType);

const toDataType = (value: unknown, fallback: PortDataType): PortDataType =>
  isPortDataType(value) ? value : fallback;

const resolveArrayRank = (
  dataType: PortDataType,
  graphVariable: BlueprintVariable | null,
  properties: VariableNodeProperties
): number => {
  if (!supportsArrayDataType(dataType)) {
    return 0;
  }

  const graphRank = normalizeArrayRank(graphVariable?.arrayRank);
  if (graphRank > 0) {
    return graphRank;
  }

  const propertyRank = normalizeArrayRank(properties.arrayRank);
  if (propertyRank > 0) {
    return propertyRank;
  }

  if (graphVariable?.isArray === true || properties.isArray === true) {
    return 1;
  }

  return 0;
};

const resolveVectorElementType = (
  dataType: PortDataType,
  graphVariable: BlueprintVariable | null,
  properties: VariableNodeProperties
): VectorElementType | undefined => {
  if (dataType !== 'vector') {
    return undefined;
  }

  if (isVectorElementType(graphVariable?.vectorElementType)) {
    return graphVariable.vectorElementType;
  }

  if (isVectorElementType(properties.vectorElementType)) {
    return properties.vectorElementType;
  }

  return 'double';
};

const toNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toNumericLiteral = (value: unknown, fallback: string): string => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : fallback;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.');
    if (normalized.length === 0) {
      return fallback;
    }
    return Number.isFinite(Number(normalized)) ? normalized : fallback;
  }

  return fallback;
};

const escapeString = (value: string): string =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');

const toVectorElementLiteral = (
  value: unknown,
  elementType: VectorElementType
): string | null => {
  switch (elementType) {
    case 'string':
      if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
        return null;
      }
      return `"${escapeString(String(value))}"`;
    case 'bool':
      if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value !== 0 ? 'true' : 'false';
      }
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1') {
          return 'true';
        }
        if (normalized === 'false' || normalized === '0') {
          return 'false';
        }
      }
      return null;
    case 'int32':
    case 'int64': {
      if (typeof value === 'string' && value.trim().length === 0) {
        return null;
      }
      const numeric =
        typeof value === 'number'
          ? value
          : typeof value === 'string'
            ? Number(value.trim().replace(',', '.'))
            : Number.NaN;
      if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
        return null;
      }
      return String(numeric);
    }
    case 'float':
    case 'double': {
      if (typeof value === 'string' && value.trim().length === 0) {
        return null;
      }
      const numeric =
        typeof value === 'number'
          ? value
          : typeof value === 'string'
            ? Number(value.trim().replace(',', '.'))
            : Number.NaN;
      if (!Number.isFinite(numeric)) {
        return null;
      }
      return String(numeric);
    }
    default:
      return null;
  }
};

const toVectorLiteral = (
  value: unknown,
  elementType: VectorElementType | undefined
): string => {
  if (!Array.isArray(value)) {
    return '{}';
  }

  const resolvedElementType = elementType ?? 'double';
  const elementLiterals: string[] = [];
  for (const item of value) {
    const literal = toVectorElementLiteral(item, resolvedElementType);
    if (literal === null) {
      return '{}';
    }
    elementLiterals.push(literal);
  }

  return `{${elementLiterals.join(', ')}}`;
};

const toArrayLiteral = (
  value: unknown,
  dataType: PortDataType,
  arrayRank: number,
  vectorElementType?: VectorElementType
): string => {
  const parsed = parseArrayInput(value, dataType, {
    vectorElementType,
    arrayRank,
    allowLegacyCsv: true,
  });
  if (!parsed.ok || !Array.isArray(parsed.value)) {
    return '{}';
  }

  const formatLevel = (items: unknown[], remainingRank: number): string | null => {
    const levelLiterals: string[] = [];

    for (const item of items) {
      if (remainingRank === 1) {
        const leafLiteral =
          dataType === 'vector'
            ? toVectorLiteral(item, vectorElementType)
            : toCppLiteral(item, dataType, vectorElementType, 0);
        levelLiterals.push(leafLiteral);
        continue;
      }

      if (!Array.isArray(item)) {
        return null;
      }
      const nestedLiteral = formatLevel(item, remainingRank - 1);
      if (nestedLiteral === null) {
        return null;
      }
      levelLiterals.push(nestedLiteral);
    }

    return `{${levelLiterals.join(', ')}}`;
  };

  const literal = formatLevel(parsed.value as unknown[], normalizeArrayRank(arrayRank));
  return literal ?? '{}';
};

const toCppLiteral = (
  value: unknown,
  dataType: PortDataType,
  vectorElementType?: VectorElementType,
  arrayRank = 0
): string => {
  const normalizedArrayRank = normalizeArrayRank(arrayRank);
  if (value === undefined || value === null) {
    return normalizedArrayRank > 0 ? '{}' : getDefaultValue(dataType);
  }

  if (normalizedArrayRank > 0) {
    return toArrayLiteral(value, dataType, normalizedArrayRank, vectorElementType);
  }

  switch (dataType) {
    case 'bool':
      if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
      }
      if (typeof value === 'string') {
        const normalized = value.toLowerCase();
        return normalized === 'true' || normalized === '1' ? 'true' : 'false';
      }
      if (typeof value === 'number') {
        return value !== 0 ? 'true' : 'false';
      }
      return 'false';
    case 'int32':
    case 'int64':
      return toNumericLiteral(value, '0');
    case 'float':
    case 'double':
      return toNumericLiteral(value, '0.0');
    case 'string':
      return `"${escapeString(String(value))}"`;
    case 'vector':
      return toVectorLiteral(value, vectorElementType);
    case 'array':
      if (Array.isArray(value)) {
        return `{${value.map((item) => String(item)).join(', ')}}`;
      }
      return getDefaultValue(dataType);
    case 'pointer':
      return value === null ? 'nullptr' : String(value);
    case 'class':
    case 'any':
    case 'execution':
    default:
      return String(value);
  }
};

const resolveGraphVariable = (
  context: CodeGenContext,
  variableId: string | undefined
): BlueprintVariable | null => {
  if (!variableId) {
    return null;
  }

  const variables = context.graph.variables ?? [];
  const variable = variables.find((item) => item.id === variableId);
  return variable ?? null;
};

const findNodeDataType = (node: BlueprintNode): PortDataType => {
  const candidates = [
    ...node.outputs.filter((port) => port.dataType !== 'execution'),
    ...node.inputs.filter((port) => port.dataType !== 'execution'),
  ];
  const typed = candidates.find((port) => isPortDataType(port.dataType));
  return typed ? (typed.dataType as PortDataType) : 'float';
};

const buildVariableAliases = (
  node: BlueprintNode,
  descriptor: Pick<ResolvedVariableDescriptor, 'variableId' | 'variable' | 'originalName' | 'codeName'>
): string[] => {
  const aliases = new Set<string>();

  aliases.add(node.id);

  const nodeLabel = toNonEmptyString(node.label);
  if (nodeLabel) {
    aliases.add(nodeLabel);
  }

  if (descriptor.variableId) {
    aliases.add(descriptor.variableId);
  }

  if (descriptor.variable?.name) {
    aliases.add(descriptor.variable.name);
  }

  if (descriptor.variable?.nameRu) {
    aliases.add(descriptor.variable.nameRu);
  }

  if (descriptor.variable?.codeName) {
    aliases.add(descriptor.variable.codeName);
  }

  if (descriptor.codeName.length > 0) {
    aliases.add(descriptor.codeName);
  }

  if (descriptor.originalName.length > 0) {
    aliases.add(descriptor.originalName);
  }

  return Array.from(aliases).filter((alias) => alias.trim().length > 0);
};

const toStableIdentifier = (preferredName: string, fallbackName: string): string => {
  const preferred = toValidIdentifier(preferredName);
  if (preferred !== 'unnamed') {
    return preferred;
  }

  const fallback = toValidIdentifier(fallbackName);
  if (fallback !== 'unnamed') {
    return fallback;
  }

  return `var_${toValidIdentifier(`id_${fallbackName}`)}`;
};

const resolveVariableDescriptor = (
  node: BlueprintNode,
  context: CodeGenContext
): ResolvedVariableDescriptor => {
  const properties = asVariableNodeProperties(node.properties);
  const variableId = toNonEmptyString(properties.variableId) ?? undefined;
  const graphVariable = resolveGraphVariable(context, variableId);

  const explicitCodeName =
    toNonEmptyString(graphVariable?.codeName) ??
    toNonEmptyString(properties.codeName);

  const explicitName =
    toNonEmptyString(graphVariable?.name) ??
    toNonEmptyString(properties.name) ??
    toNonEmptyString(properties.nameRu) ??
    toNonEmptyString(node.label) ??
    (variableId ? `var_${variableId}` : `var_${node.id}`);

  const fallbackName = variableId ? `var_${variableId}` : `var_${node.id}`;
  const normalizedOriginalName = explicitName.trim().length > 0 ? explicitName.trim() : fallbackName;
  const resolvedCodeName = explicitCodeName ?? normalizedOriginalName;
  const identifier = toStableIdentifier(resolvedCodeName, fallbackName);

  const dataType = toDataType(
    graphVariable?.dataType ?? properties.dataType,
    findNodeDataType(node)
  );
  const arrayRank = resolveArrayRank(dataType, graphVariable, properties);
  const vectorElementType = resolveVectorElementType(dataType, graphVariable, properties);
  const pointerMeta =
    dataType === 'pointer'
      ? normalizePointerMeta(graphVariable?.pointerMeta ?? properties.pointerMeta)
      : undefined;

  const variableDefault = graphVariable?.defaultValue ?? properties.defaultValue;
  const defaultExpr =
    dataType === 'pointer' && graphVariable
      ? resolvePointerInitializer(graphVariable, context.graph.variables ?? [], context.declaredVariables)
      : toCppLiteral(variableDefault, dataType, vectorElementType, arrayRank);
  const cppType =
    dataType === 'pointer' && graphVariable
      ? resolvePointerCppType(graphVariable, context.graph.variables ?? [])
      : getCppVariableType(dataType, vectorElementType, arrayRank);

  const aliases = buildVariableAliases(node, {
    variableId,
    variable: graphVariable,
    originalName: normalizedOriginalName,
    codeName: resolvedCodeName,
  });

  return {
    variableId,
    variable: graphVariable,
    codeName: resolvedCodeName,
    identifier,
    originalName: normalizedOriginalName,
    dataType,
    arrayRank,
    vectorElementType,
    pointerMeta,
    cppType,
    defaultExpr,
    aliases,
  };
};

const findDeclaredVariable = (
  helpers: GeneratorHelpers,
  aliases: string[]
): { codeName: string; cppType: string } | null => {
  for (const alias of aliases) {
    const variable = helpers.getVariable(alias);
    if (variable) {
      return variable;
    }
  }
  return null;
};

const isDeclaredByAlias = (helpers: GeneratorHelpers, aliases: string[]): boolean =>
  aliases.some((alias) => helpers.isVariableDeclared(alias));

const ensureVariableAliases = (
  helpers: GeneratorHelpers,
  aliases: string[],
  variableInfo: { codeName: string; cppType: string; originalName: string; nodeId: string }
): void => {
  for (const alias of aliases) {
    if (!helpers.isVariableDeclared(alias)) {
      helpers.declareVariable(
        alias,
        variableInfo.codeName,
        variableInfo.originalName,
        variableInfo.cppType,
        variableInfo.nodeId
      );
    }
  }
};

const matchPortId = (left: string, right: string): boolean => {
  if (left === right) {
    return true;
  }

  return left.endsWith(`-${right}`) || right.endsWith(`-${left}`);
};

const resolveValueInputPortId = (node: BlueprintNode): string | null => {
  const directValuePort = node.inputs.find((port) =>
    port.direction === 'input' &&
    port.dataType !== 'execution' &&
    (port.id.includes('value') || port.name.toLowerCase().includes('value') || port.name.includes('Значение'))
  );
  if (directValuePort) {
    return directValuePort.id;
  }

  const firstDataInputPort = node.inputs.find((port) =>
    port.direction === 'input' && port.dataType !== 'execution'
  );
  return firstDataInputPort?.id ?? null;
};

const resolveSetValueSourceType = (
  node: BlueprintNode,
  context: CodeGenContext
): PortDataType | null => {
  const valueInputPortId = resolveValueInputPortId(node);
  if (!valueInputPortId) {
    return null;
  }

  const incomingEdge = context.graph.edges.find((edge) =>
    edge.targetNode === node.id && matchPortId(edge.targetPort, valueInputPortId)
  );
  if (!incomingEdge) {
    return null;
  }

  if (isPortDataType(incomingEdge.dataType) && incomingEdge.dataType !== 'execution') {
    // Для pointer/meta случаев "сырой" тип ребра часто остаётся `pointer`,
    // хотя фактическое выражение может быть `*ptr` (pointee-тип) или `T&`.
    if (incomingEdge.dataType !== 'pointer') {
      return incomingEdge.dataType;
    }
  }

  const sourceNode = context.graph.nodes.find((candidate) => candidate.id === incomingEdge.sourceNode);
  if (!sourceNode) {
    return null;
  }

  const sourcePort = sourceNode.outputs.find((port) => matchPortId(port.id, incomingEdge.sourcePort));
  if (!sourcePort) {
    return null;
  }

  if (!isPortDataType(sourcePort.dataType) || sourcePort.dataType === 'execution') {
    return null;
  }

  // Для pointer/reference переменных тип выходного выражения может отличаться от dataType порта.
  // Например, GetVariable для "прикреплённого" smart pointer отдаёт `*ptr`, что имеет pointee-тип.
  if (sourceNode.type === 'GetVariable' || sourceNode.type === 'SetVariable' || sourceNode.type === 'Variable') {
    const sourceDescriptor = resolveVariableDescriptor(sourceNode, context);
    const pointerMeta = sourceDescriptor.pointerMeta;
    if (pointerMeta) {
      if (shouldDereferencePointerVariable(sourceDescriptor)) {
        return pointerMeta.pointeeDataType;
      }

      if (pointerMeta.mode === 'reference' || pointerMeta.mode === 'const_reference') {
        return pointerMeta.pointeeDataType;
      }
    }
  }

  return sourcePort.dataType;
};

const hasIncomingValueConnection = (
  node: BlueprintNode,
  context: CodeGenContext
): boolean => {
  const valueInputPortId = resolveValueInputPortId(node);
  if (!valueInputPortId) {
    return false;
  }

  return context.graph.edges.some((edge) =>
    edge.targetNode === node.id && matchPortId(edge.targetPort, valueInputPortId)
  );
};

const getFirstDataPortType = (ports: BlueprintNode['inputs'] | BlueprintNode['outputs']): PortDataType | null => {
  for (const port of ports) {
    if (port.dataType === 'execution') {
      continue;
    }
    if (!isPortDataType(port.dataType)) {
      continue;
    }
    return port.dataType;
  }
  return null;
};

const resolveTypeConversionRuleForNode = (node: BlueprintNode) => {
  const properties = asVariableNodeProperties(node.properties);
  const conversionId = toNonEmptyString(properties.conversionId);
  if (conversionId) {
    const ruleById = findTypeConversionRuleById(conversionId);
    if (ruleById) {
      return ruleById;
    }
  }

  const sourceTypeFromProps = isPortDataType(properties.fromType) ? properties.fromType : null;
  const targetTypeFromProps = isPortDataType(properties.toType) ? properties.toType : null;
  const sourceType = sourceTypeFromProps ?? getFirstDataPortType(node.inputs);
  const targetType = targetTypeFromProps ?? getFirstDataPortType(node.outputs);

  if (!sourceType || !targetType) {
    return null;
  }

  return findTypeConversionRule(sourceType, targetType);
};

const resolveTypeConversionMetaForNode = (node: BlueprintNode): TypeConversionMeta => {
  const properties = asVariableNodeProperties(node.properties);
  if (!isRecord(properties.meta)) {
    return {};
  }

  const rawMeta = properties.meta as Record<string, unknown>;
  const meta: TypeConversionMeta = {};

  if (isVectorElementType(rawMeta.vectorElementType)) {
    meta.vectorElementType = rawMeta.vectorElementType;
  }

  const normalizedArrayRank = normalizeArrayRank(rawMeta.arrayRank);
  if (normalizedArrayRank > 0) {
    meta.arrayRank = normalizedArrayRank;
  }

  if (typeof rawMeta.pointerMode === 'string') {
    meta.pointerMode = rawMeta.pointerMode as TypeConversionMeta['pointerMode'];
  }

  return meta;
};

interface ResolvedConversionShape {
  dataType: PortDataType;
  vectorElementType?: VectorElementType;
  arrayRank: number;
}

const resolveNodeDataShape = (
  node: BlueprintNode,
  context: CodeGenContext,
  direction: 'input' | 'output',
  portId: string
): ResolvedConversionShape | null => {
  if (node.type === 'Variable' || node.type === 'GetVariable' || node.type === 'SetVariable') {
    const descriptor = resolveVariableDescriptor(node, context);
    if (shouldDereferencePointerVariable(descriptor) && descriptor.pointerMeta) {
      const pointeeDataType = descriptor.pointerMeta.pointeeDataType;
      return {
        dataType: pointeeDataType,
        vectorElementType:
          pointeeDataType === 'vector' && isVectorElementType(descriptor.pointerMeta.pointeeVectorElementType)
            ? descriptor.pointerMeta.pointeeVectorElementType
            : undefined,
        arrayRank: 0,
      };
    }

    return {
      dataType: descriptor.dataType,
      vectorElementType: descriptor.vectorElementType,
      arrayRank: descriptor.arrayRank,
    };
  }

  const ports = direction === 'input' ? node.inputs : node.outputs;
  const port = ports.find((candidate) => matchPortId(candidate.id, portId));
  if (!port || !isPortDataType(port.dataType) || port.dataType === 'execution') {
    return null;
  }

  const nodeProperties = asVariableNodeProperties(node.properties);
  const vectorElementType = isVectorElementType(nodeProperties.vectorElementType)
    ? nodeProperties.vectorElementType
    : undefined;
  const arrayRank = normalizeArrayRank(
    nodeProperties.arrayRank ?? (nodeProperties.isArray === true ? 1 : 0)
  );

  if (port.dataType === 'array') {
    const fallbackDataType =
      isPortDataType(nodeProperties.dataType) && nodeProperties.dataType !== 'execution'
        ? nodeProperties.dataType
        : 'array';
    return {
      dataType: fallbackDataType,
      vectorElementType,
      arrayRank: arrayRank > 0 ? arrayRank : 1,
    };
  }

  return {
    dataType: port.dataType,
    vectorElementType,
    arrayRank,
  };
};

const resolveTypeConversionOutputShape = (
  node: BlueprintNode,
  context: CodeGenContext
): ResolvedConversionShape | null => {
  const outputPort = node.outputs.find((port) => port.dataType !== 'execution');
  if (!outputPort) {
    return null;
  }

  const outgoingEdge = context.graph.edges.find((edge) =>
    edge.sourceNode === node.id && matchPortId(edge.sourcePort, outputPort.id)
  );
  if (!outgoingEdge) {
    return null;
  }

  const targetNode = context.graph.nodes.find((candidate) => candidate.id === outgoingEdge.targetNode);
  if (!targetNode) {
    return null;
  }

  return resolveNodeDataShape(targetNode, context, 'input', outgoingEdge.targetPort);
};

const resolveTypeConversionInputShape = (
  node: BlueprintNode,
  context: CodeGenContext
): ResolvedConversionShape | null => {
  const inputPort = node.inputs.find((port) => port.dataType !== 'execution');
  if (!inputPort) {
    return null;
  }

  const incomingEdge = context.graph.edges.find((edge) =>
    edge.targetNode === node.id && matchPortId(edge.targetPort, inputPort.id)
  );
  if (!incomingEdge) {
    return null;
  }

  const sourceNode = context.graph.nodes.find((candidate) => candidate.id === incomingEdge.sourceNode);
  if (!sourceNode) {
    return null;
  }

  return resolveNodeDataShape(sourceNode, context, 'output', incomingEdge.sourcePort);
};

const resolveHelperExpression = (
  helperId: TypeConversionHelperId,
  inputExpr: string,
  rule: TypeConversionRule,
  node: BlueprintNode,
  context: CodeGenContext
): string => {
  const meta = resolveTypeConversionMetaForNode(node);
  const inputShape = resolveTypeConversionInputShape(node, context);
  const outputShape = resolveTypeConversionOutputShape(node, context);

  switch (helperId) {
    case 'parse_bool_strict':
      return `multicode_parse_bool_strict(${inputExpr})`;
    case 'pointer_truthy':
      return `multicode_pointer_truthy(${inputExpr})`;
    case 'pointer_to_string':
      return `multicode_pointer_to_string(${inputExpr})`;
    case 'class_to_string':
      return `multicode_class_to_string(${inputExpr})`;
    case 'vector_to_string':
      return `multicode_vector_to_string(${inputExpr})`;
    case 'array_to_string':
      return `multicode_array_to_string(${inputExpr})`;
    case 'parse_vector_strict': {
      const vectorElementType =
        outputShape?.vectorElementType ??
        inputShape?.vectorElementType ??
        meta.vectorElementType ??
        'double';
      const elementCppType = getCppType(vectorElementType);
      return `multicode_parse_vector_strict<${elementCppType}>(${inputExpr})`;
    }
    case 'parse_array_strict': {
      const fallbackArrayRank = meta.arrayRank ?? 1;
      const outputDataType = outputShape?.dataType ?? rule.targetType;
      const outputVectorElementType = outputShape?.vectorElementType ?? meta.vectorElementType;
      const outputArrayRank = outputShape?.arrayRank ?? fallbackArrayRank;
      const arrayCppType = getCppVariableType(
        outputDataType,
        outputVectorElementType,
        outputArrayRank
      );
      return `multicode_parse_array_strict<${arrayCppType}>(${inputExpr})`;
    }
    default:
      return inputExpr;
  }
};

const shouldApplyExplicitCast = (
  sourceType: PortDataType | null,
  targetType: PortDataType,
  expression: string
): boolean => {
  const trimmed = expression.trim();
  if (!trimmed || trimmed.startsWith('static_cast<')) {
    return false;
  }

  if (!sourceType || sourceType === targetType) {
    return false;
  }

  return isNumericOrBoolType(sourceType) && isNumericOrBoolType(targetType);
};

const isAlreadyWrappedInConversion = (expression: string, prefixes: string[]): boolean => {
  const trimmed = expression.trim();
  return prefixes.some((prefix) => trimmed.startsWith(prefix));
};

const maybeConvertStringToNumeric = (
  expression: string,
  targetType: PortDataType
): string | null => {
  switch (targetType) {
    case 'int32':
      return `std::stoi(${expression})`;
    case 'int64':
      return `std::stoll(${expression})`;
    case 'float':
      return `std::stof(${expression})`;
    case 'double':
      return `std::stod(${expression})`;
    default:
      return null;
  }
};

const maybeCastToTargetType = (
  expression: string,
  sourceType: PortDataType | null,
  targetType: PortDataType
): string => {
  const trimmed = expression.trim();
  if (!trimmed) {
    return expression;
  }

  if (!sourceType || sourceType === targetType) {
    return expression;
  }

  // Строковые преобразования (минимальный набор для корректной компиляции).
  // Важно: эти преобразования могут быть потенциально исключающими (stoi/stod и т.д.).
  if (targetType === 'string') {
    if (isAlreadyWrappedInConversion(trimmed, ['std::to_string(', 'std::string('])) {
      return expression;
    }

    if (isNumericType(sourceType)) {
      return `std::to_string(${expression})`;
    }

    if (sourceType === 'bool') {
      return `std::string((${expression}) ? "true" : "false")`;
    }
  }

  if (sourceType === 'string') {
    if (isAlreadyWrappedInConversion(trimmed, ['std::stoi(', 'std::stoll(', 'std::stof(', 'std::stod('])) {
      return expression;
    }

    const converted = maybeConvertStringToNumeric(expression, targetType);
    if (converted) {
      return converted;
    }
  }

  if (!shouldApplyExplicitCast(sourceType, targetType, expression)) {
    return expression;
  }

  return `static_cast<${getCppType(targetType)}>(${expression})`;
};

const isDereferenceablePointerPointee = (dataType: PortDataType): boolean =>
  dataType !== 'class' && dataType !== 'array';

const shouldDereferencePointerVariable = (descriptor: ResolvedVariableDescriptor): boolean => {
  const pointerMeta = descriptor.pointerMeta;
  if (!pointerMeta?.targetVariableId) {
    return false;
  }

  if (pointerMeta.mode === 'weak' || pointerMeta.mode === 'reference' || pointerMeta.mode === 'const_reference') {
    return false;
  }

  return isDereferenceablePointerPointee(pointerMeta.pointeeDataType);
};

const resolveValueLiteralShape = (
  descriptor: ResolvedVariableDescriptor
): { dataType: PortDataType; vectorElementType?: VectorElementType; arrayRank: number } => {
  if (!shouldDereferencePointerVariable(descriptor) || !descriptor.pointerMeta) {
    return {
      dataType: descriptor.dataType,
      vectorElementType: descriptor.vectorElementType,
      arrayRank: descriptor.arrayRank,
    };
  }

  const pointeeDataType = descriptor.pointerMeta.pointeeDataType;
  const pointeeVectorElementType =
    pointeeDataType === 'vector' && isVectorElementType(descriptor.pointerMeta.pointeeVectorElementType)
      ? descriptor.pointerMeta.pointeeVectorElementType
      : undefined;

  return {
    dataType: pointeeDataType,
    vectorElementType: pointeeVectorElementType,
    arrayRank: 0,
  };
};

const resolveSetValueExpression = (
  node: BlueprintNode,
  descriptor: ResolvedVariableDescriptor,
  helpers: GeneratorHelpers
): string => {
  const fromInputEdge = helpers.getInputExpression(node, 'value');
  if (fromInputEdge) {
    return fromInputEdge;
  }

  const literalShape = resolveValueLiteralShape(descriptor);
  const properties = asVariableNodeProperties(node.properties);
  const hasManualOverride = properties.inputValueIsOverride === true;
  if (hasManualOverride) {
    return toCppLiteral(
      properties.inputValue,
      literalShape.dataType,
      literalShape.vectorElementType,
      literalShape.arrayRank
    );
  }

  if (descriptor.variable?.defaultValue !== undefined) {
    return toCppLiteral(
      descriptor.variable.defaultValue,
      literalShape.dataType,
      literalShape.vectorElementType,
      literalShape.arrayRank
    );
  }

  if (properties.defaultValue !== undefined) {
    return toCppLiteral(
      properties.defaultValue,
      literalShape.dataType,
      literalShape.vectorElementType,
      literalShape.arrayRank
    );
  }

  if (properties.inputValue !== undefined) {
    return toCppLiteral(
      properties.inputValue,
      literalShape.dataType,
      literalShape.vectorElementType,
      literalShape.arrayRank
    );
  }

  if (shouldDereferencePointerVariable(descriptor) && descriptor.pointerMeta) {
    return getDefaultValue(literalShape.dataType);
  }

  return descriptor.defaultExpr;
};

/**
 * Variable — объявление переменной
 */
export class VariableNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Variable'];
  
  generate(
    node: BlueprintNode,
    context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    const lines: string[] = [];

    const descriptor = resolveVariableDescriptor(node, context);
    const declared = findDeclaredVariable(helpers, descriptor.aliases);
    if (!declared && !isDeclaredByAlias(helpers, descriptor.aliases)) {
      lines.push(`${ind}${descriptor.cppType} ${descriptor.identifier} = ${descriptor.defaultExpr};`);
      if (context.declaredVariableInitializers instanceof Map) {
        const initializer = descriptor.defaultExpr.trim();
        for (const alias of descriptor.aliases) {
          if (!alias || context.declaredVariableInitializers.has(alias)) {
            continue;
          }
          context.declaredVariableInitializers.set(alias, initializer);
        }
      }
      ensureVariableAliases(helpers, descriptor.aliases, {
        codeName: descriptor.identifier,
        cppType: descriptor.cppType,
        originalName: descriptor.originalName,
        nodeId: node.id,
      });
      return this.code(lines);
    }

    if (declared) {
      ensureVariableAliases(helpers, descriptor.aliases, {
        codeName: declared.codeName,
        cppType: declared.cppType,
        originalName: descriptor.originalName,
        nodeId: node.id,
      });
    }

    return this.code(lines);
  }
  
  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    const descriptor = resolveVariableDescriptor(node, context);
    const varInfo = findDeclaredVariable(helpers, descriptor.aliases);
    const base = varInfo?.codeName ?? descriptor.identifier;
    return shouldDereferencePointerVariable(descriptor) ? `*${base}` : base;
  }
}

/**
 * GetVariable — получение значения переменной (pure node)
 */
export class GetVariableNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['GetVariable'];
  
  generate(): NodeGenerationResult {
    // Pure node — не генерирует строки
    return this.noop();
  }
  
  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    const descriptor = resolveVariableDescriptor(node, context);
    const varInfo = findDeclaredVariable(helpers, descriptor.aliases);
    const base = varInfo?.codeName ?? descriptor.identifier;
    return shouldDereferencePointerVariable(descriptor) ? `*${base}` : base;
  }
}

/**
 * SetVariable — установка значения переменной
 */
export class SetVariableNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['SetVariable'];
  
  generate(
    node: BlueprintNode,
    context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    const lines: string[] = [];

    const descriptor = resolveVariableDescriptor(node, context);
    if (descriptor.pointerMeta?.mode === 'const_reference') {
      helpers.addError(
        node.id,
        CodeGenErrorCode.TYPE_MISMATCH,
        'Нельзя выполнять Set для const_reference переменной.',
        'Cannot assign to const_reference variable.'
      );
      return this.noop();
    }

    const valueExpr = resolveSetValueExpression(node, descriptor, helpers);
    const valueSourceType = resolveSetValueSourceType(node, context);
    const hasIncomingValueEdge = hasIncomingValueConnection(node, context);
    const assignmentTargetType =
      shouldDereferencePointerVariable(descriptor) && descriptor.pointerMeta
        ? descriptor.pointerMeta.pointeeDataType
        : descriptor.dataType;
    const assignmentExpr = maybeCastToTargetType(valueExpr, valueSourceType, assignmentTargetType);
    const declared = findDeclaredVariable(helpers, descriptor.aliases);
    const hasDeclaredAlias = declared !== null || isDeclaredByAlias(helpers, descriptor.aliases);
    const writeTrackingKey = descriptor.variableId ?? descriptor.identifier;
    const writeCounts = context.variableWriteCounts;
    const canTrackWrites = writeCounts instanceof Map;
    const currentWriteCount = canTrackWrites
      ? (writeCounts.get(writeTrackingKey) ?? 0)
      : 0;
    const isFirstSetForVariable = canTrackWrites && currentWriteCount === 0;

    if (hasDeclaredAlias) {
      const declaredCodeName = declared?.codeName ?? descriptor.identifier;
      const assignmentTarget = shouldDereferencePointerVariable(descriptor)
        ? `*${declaredCodeName}`
        : declaredCodeName;
      const initializerFromDeclaration =
        context.declaredVariableInitializers instanceof Map
          ? context.declaredVariableInitializers.get(writeTrackingKey) ??
            descriptor.aliases
              .map((alias) => context.declaredVariableInitializers?.get(alias))
              .find((value): value is string => typeof value === 'string' && value.trim().length > 0) ??
            null
          : null;
      const initializerExpr = (initializerFromDeclaration ?? descriptor.defaultExpr).trim();
      const isRedundantFirstAssignment =
        canTrackWrites &&
        isFirstSetForVariable &&
        !hasIncomingValueEdge &&
        assignmentExpr.trim() === initializerExpr;

      if (!isRedundantFirstAssignment) {
        lines.push(`${ind}${assignmentTarget} = ${assignmentExpr};`);
      }
      ensureVariableAliases(helpers, descriptor.aliases, {
        codeName: declaredCodeName,
        cppType: declared?.cppType ?? descriptor.cppType,
        originalName: descriptor.originalName,
        nodeId: node.id,
      });
    } else {
      if (context.declaredVariableInitializers instanceof Map) {
        const initializer = shouldDereferencePointerVariable(descriptor)
          ? descriptor.defaultExpr.trim()
          : assignmentExpr.trim();
        for (const alias of descriptor.aliases) {
          if (!alias || context.declaredVariableInitializers.has(alias)) {
            continue;
          }
          context.declaredVariableInitializers.set(alias, initializer);
        }
      }
      if (shouldDereferencePointerVariable(descriptor)) {
        // Для "прикреплённого" указателя переменная хранит сам указатель,
        // а SetVariable работает по значению через разыменование.
        lines.push(`${ind}${descriptor.cppType} ${descriptor.identifier} = ${descriptor.defaultExpr};`);
        lines.push(`${ind}*${descriptor.identifier} = ${assignmentExpr};`);
      } else {
        // Обычная переменная объявляется сразу с тем значением, которое устанавливает Set.
        lines.push(`${ind}${descriptor.cppType} ${descriptor.identifier} = ${assignmentExpr};`);
      }
      ensureVariableAliases(helpers, descriptor.aliases, {
        codeName: descriptor.identifier,
        cppType: descriptor.cppType,
        originalName: descriptor.originalName,
        nodeId: node.id,
      });
    }

    if (canTrackWrites) {
      writeCounts.set(writeTrackingKey, currentWriteCount + 1);
    }

    return this.code(lines);
  }
  
  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    // SetVariable также имеет выход value для chaining
    const descriptor = resolveVariableDescriptor(node, context);
    const varInfo = findDeclaredVariable(helpers, descriptor.aliases);
    const base = varInfo?.codeName ?? descriptor.identifier;
    return shouldDereferencePointerVariable(descriptor) ? `*${base}` : base;
  }
}

/**
 * TypeConversion — явное преобразование типов между data-портами
 */
export class TypeConversionNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['TypeConversion'];

  generate(): NodeGenerationResult {
    // Pure node — преобразование используется как выражение.
    return this.noop();
  }

  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    const rule = resolveTypeConversionRuleForNode(node);
    const valueInputPortId = resolveValueInputPortId(node);

    let inputExpr: string | null = null;
    if (valueInputPortId) {
      const incomingEdge = context.graph.edges.find((edge) =>
        edge.kind === 'data' &&
        edge.targetNode === node.id &&
        matchPortId(edge.targetPort, valueInputPortId)
      );
      if (incomingEdge) {
        const sourceNode = context.graph.nodes.find((candidate) => candidate.id === incomingEdge.sourceNode);
        if (sourceNode) {
          inputExpr = helpers.getOutputExpression(sourceNode, incomingEdge.sourcePort);
        }
      }
    }

    inputExpr =
      inputExpr ??
      helpers.getInputExpression(node, 'value-in') ??
      helpers.getInputExpression(node, 'value') ??
      helpers.getInputExpression(node, 'in');

    if (!inputExpr) {
      const properties = asVariableNodeProperties(node.properties);
      const fromType: PortDataType =
        (isPortDataType(properties.fromType) ? properties.fromType : null) ??
        rule?.sourceType ??
        getFirstDataPortType(node.inputs) ??
        'any';
      inputExpr = fromType !== 'any' ? getDefaultValue(fromType) : '0';
    }

    if (!rule) {
      return inputExpr;
    }

    if (rule.strategy === 'template') {
      return applyTypeConversionTemplate(rule, inputExpr);
    }

    if (!rule.helperId) {
      return inputExpr;
    }

    if (context.requiredHelpers instanceof Set) {
      context.requiredHelpers.add(rule.helperId);
    }

    return resolveHelperExpression(rule.helperId, inputExpr, rule, node, context);
  }
}

/**
 * Фабричная функция для создания всех Variable генераторов
 */
export function createVariableGenerators(): BaseNodeGenerator[] {
  return [
    new VariableNodeGenerator(),
    new GetVariableNodeGenerator(),
    new SetVariableNodeGenerator(),
    new TypeConversionNodeGenerator(),
  ];
}
