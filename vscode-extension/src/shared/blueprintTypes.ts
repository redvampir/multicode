/**
 * Расширенные типы для Blueprints-style графов
 * Совместимы с C++ ядром, но с дополнительной информацией для UI
 */

import { PortDataType, PortDefinition } from './portTypes';
import {
  canDirectlyConnectDataPorts,
  findTypeConversionRule,
  findTypeConversionRuleById,
  formatTypeConversionLabel,
} from './typeConversions';

export type GraphLanguage = 'cpp' | 'rust' | 'asm';
export type GraphDisplayLanguage = 'ru' | 'en';

/** 
 * Расширенные типы узлов для Blueprints-style редактора
 * Соответствуют NodeType в C++ ядре
 */
export type BlueprintNodeType =
  // Control Flow
  | 'Start'
  | 'End'
  | 'Branch'         // If/Else
  | 'ForLoop'
  | 'WhileLoop'
  | 'DoWhile'        // Цикл с постусловием
  | 'ForEach'        // Итерация по массиву
  | 'Switch'         // Множественный выбор
  | 'Break'          // Выход из цикла
  | 'Continue'       // Продолжить цикл
  | 'Sequence'       // Последовательное выполнение
  | 'Parallel'       // Параллельное выполнение (многопоток)
  | 'Gate'           // Управляемый шлюз (открыть/закрыть поток)
  | 'DoN'            // Выполнить N раз
  | 'DoOnce'         // Выполнить один раз
  | 'FlipFlop'       // Переключатель A/B
  | 'MultiGate'      // Множественный шлюз (циклический выбор)
  | 'Return'
  // Functions
  | 'Function'
  | 'FunctionCall'
  | 'FunctionEntry'  // Точка входа в пользовательскую функцию
  | 'FunctionReturn' // Возврат из пользовательской функции
  | 'CallUserFunction' // Вызов пользовательской функции
  | 'Event'
  // Variables
  | 'Variable'
  | 'GetVariable'
  | 'SetVariable'
  | 'TypeConversion'
  // Math
  | 'ConstNumber'
  | 'ConstString'
  | 'ConstBool'
  | 'Add'
  | 'Subtract'
  | 'Multiply'
  | 'Divide'
  | 'Modulo'
  // Comparison
  | 'Equal'
  | 'NotEqual'
  | 'Greater'
  | 'Less'
  | 'GreaterEqual'
  | 'LessEqual'
  // Logic
  | 'And'
  | 'Or'
  | 'Not'
  // I/O
  | 'Print'
  | 'Input'
  // Comments & Organization
  | 'Comment'
  | 'Reroute'
  // Custom
  | 'Custom';

export type GraphEdgeKind = 'execution' | 'data';

/** Определение порта на узле (для React Flow) */
export interface NodePort extends PortDefinition {
  /** Позиция на узле (индекс сверху вниз) */
  index: number;
  /** Текущее значение (если задано пользователем) */
  value?: string | number | boolean;
  /** Подключён ли порт */
  connected?: boolean;
}

/** Расширенный узел графа с портами */
export interface BlueprintNode {
  id: string;
  label: string;
  type: BlueprintNodeType;
  position: { x: number; y: number };
  /** Входные порты (слева) */
  inputs: NodePort[];
  /** Выходные порты (справа) */
  outputs: NodePort[];
  /** Свойства узла (для Variable, Function и т.д.) */
  properties?: Record<string, unknown>;
  /** Комментарий/описание */
  comment?: string;
  /** Размер узла (для Comment nodes) */
  size?: { width: number; height: number };
  /** Пользовательское название (переопределяет label) */
  customLabel?: string;
}

/** Связь между портами */
export interface BlueprintEdge {
  id: string;
  /** ID исходного узла */
  sourceNode: string;
  /** ID исходного порта */
  sourcePort: string;
  /** ID целевого узла */
  targetNode: string;
  /** ID целевого порта */
  targetPort: string;
  /** Тип связи (execution/data) - определяется по типам портов */
  kind: GraphEdgeKind;
  /** Тип данных (для data edges) */
  dataType?: PortDataType;
}

// ============================================
// Типы для переменных (UE Blueprint-style)
// ============================================

/** Категория переменной */
export type VariableCategory = 'default' | 'input' | 'output' | 'local';
/** Тип элемента для vector-переменных */
export type VectorElementType = 'int32' | 'int64' | 'float' | 'double' | 'bool' | 'string';
export type PointerMode = 'shared' | 'unique' | 'weak' | 'raw' | 'reference' | 'const_reference';
export type PointerPointeeDataType = Exclude<PortDataType, 'execution' | 'any' | 'pointer'>;

export interface PointerMeta {
  mode: PointerMode;
  pointeeDataType: PointerPointeeDataType;
  pointeeVectorElementType?: VectorElementType;
  targetVariableId?: string;
}

export const POINTER_MODES: PointerMode[] = [
  'shared',
  'unique',
  'weak',
  'raw',
  'reference',
  'const_reference',
];

const POINTER_POINTEE_DATA_TYPES: PointerPointeeDataType[] = [
  'bool',
  'int32',
  'int64',
  'float',
  'double',
  'string',
  'vector',
  'class',
  'array',
];

export const isPointerMode = (value: unknown): value is PointerMode =>
  typeof value === 'string' && POINTER_MODES.includes(value as PointerMode);

export const isPointerPointeeDataType = (value: unknown): value is PointerPointeeDataType =>
  typeof value === 'string' && POINTER_POINTEE_DATA_TYPES.includes(value as PointerPointeeDataType);

export const isVectorElementType = (value: unknown): value is VectorElementType =>
  value === 'int32' ||
  value === 'int64' ||
  value === 'float' ||
  value === 'double' ||
  value === 'bool' ||
  value === 'string';

export const normalizePointerMeta = (value: unknown): PointerMeta => {
  const source = typeof value === 'object' && value !== null
    ? (value as Partial<PointerMeta>)
    : {};

  const mode: PointerMode = isPointerMode(source.mode) ? source.mode : 'shared';
  const pointeeDataType: PointerPointeeDataType = isPointerPointeeDataType(source.pointeeDataType)
    ? source.pointeeDataType
    : 'double';
  const pointeeVectorElementType = pointeeDataType === 'vector' && isVectorElementType(source.pointeeVectorElementType)
    ? source.pointeeVectorElementType
    : undefined;
  const targetVariableId = typeof source.targetVariableId === 'string' && source.targetVariableId.trim().length > 0
    ? source.targetVariableId.trim()
    : undefined;

  return {
    mode,
    pointeeDataType,
    pointeeVectorElementType,
    targetVariableId,
  };
};

export interface TypeConversionMeta {
  vectorElementType?: VectorElementType;
  arrayRank?: number;
  pointerMode?: PointerMode;
}

export interface TypeConversionProperties extends Record<string, unknown> {
  conversionId?: string;
  fromType?: PortDataType;
  toType?: PortDataType;
  autoInserted?: boolean;
  meta?: TypeConversionMeta;
  name?: string;
  nameRu?: string;
}

export type BlueprintVariableScalarValue = string | number | boolean;
export type BlueprintVariableVectorValue = BlueprintVariableScalarValue[];
export type BlueprintVariableArrayValue = Array<
  BlueprintVariableScalarValue | BlueprintVariableVectorValue | BlueprintVariableArrayValue
>;
export type BlueprintVariableDefaultValue =
  | BlueprintVariableScalarValue
  | null
  | BlueprintVariableVectorValue
  | BlueprintVariableArrayValue;

/** Переменная Blueprint графа */
export interface BlueprintVariable {
  id: string;
  /** Имя переменной (для UI / EN отображения) */
  name: string;
  /** Отображаемое имя (RU) */
  nameRu: string;
  /** Имя переменной в сгенерированном коде (C++ identifier) */
  codeName?: string;
  /** Тип данных */
  dataType: PortDataType;
  /** Метаданные для pointer/reference переменной */
  pointerMeta?: PointerMeta;
  /** Тип элемента для vector<T> (по умолчанию: double) */
  vectorElementType?: VectorElementType;
  /** Значение по умолчанию (для vector - массив значений JSON) */
  defaultValue?: BlueprintVariableDefaultValue;
  /** Категория переменной */
  category: VariableCategory;
  /** Описание */
  description?: string;
  /** Является ли публичной (доступна извне) */
  isPublic?: boolean;
  /** Является ли массивом */
  isArray?: boolean;
  /** Ранг массива (0 = скаляр, 1 = T[], 2 = T[][], ...) */
  arrayRank?: number;
  /** Является ли приватной */
  isPrivate?: boolean;
  /** Пользовательский цвет */
  color?: string;
  /** Дата создания */
  createdAt?: string;
}

/** Создать новую переменную */
export function createVariable(
  name: string,
  dataType: PortDataType = 'int32',
  options?: Partial<Omit<BlueprintVariable, 'id' | 'name' | 'dataType'>>
): BlueprintVariable {
  const resolvedArrayRank =
    typeof options?.arrayRank === 'number' && Number.isFinite(options.arrayRank)
      ? Math.max(0, Math.trunc(options.arrayRank))
      : options?.isArray
        ? 1
        : 0;

  return {
    id: `var_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name,
    nameRu: options?.nameRu || name,
    codeName: options?.codeName,
    dataType,
    pointerMeta:
      dataType === 'pointer'
        ? normalizePointerMeta(options?.pointerMeta)
        : options?.pointerMeta,
    vectorElementType:
      dataType === 'vector'
        ? options?.vectorElementType ?? 'double'
        : options?.vectorElementType,
    defaultValue: options?.defaultValue ?? getDefaultValueForType(dataType),
    category: options?.category || 'default',
    description: options?.description,
    isArray: resolvedArrayRank > 0,
    arrayRank: resolvedArrayRank,
    isPrivate: options?.isPrivate,
    color: options?.color,
    createdAt: new Date().toISOString(),
  };
}

/** Получить значение по умолчанию для типа */
function getDefaultValueForType(dataType: PortDataType): BlueprintVariableDefaultValue {
  switch (dataType) {
    case 'bool': return false;
    case 'int32':
    case 'int64': return 0;
    case 'float':
    case 'double': return 0.0;
    case 'string': return '';
    case 'vector': return [];
    default: return null;
  }
}

/** Цвета для типов переменных (используем PORT_TYPE_COLORS из portTypes) */
// 🎨 НАСТРОЙКА: Цвета портов для каждого типа данных (отображаются на портах и в редакторе)
export const VARIABLE_TYPE_COLORS: Record<PortDataType, string> = {
  execution: '#FFFFFF',  // 🎨 Белый — поток выполнения (exec порты)
  bool: '#E53935',       // 🎨 Красный — логический тип (true/false)
  int32: '#00BCD4',      // 🎨 Cyan — целое 32-бит
  int64: '#00838F',      // 🎨 Тёмный cyan — целое 64-бит
  float: '#8BC34A',      // 🎨 Светло-зелёный — дробное 32-бит
  double: '#689F38',     // 🎨 Зелёный — дробное 64-бит
  string: '#E91E63',     // 🎨 Розовый/Пурпурный — строка
  vector: '#FFC107',     // 🎨 Жёлтый — vector<T>
  pointer: '#2196F3',    // 🎨 Синий — умный указатель (std::shared_ptr)
  class: '#3F51B5',      // 🎨 Индиго — класс/экземпляр по значению
  array: '#FF9800',      // 🎨 Оранжевый — массив
  any: '#9E9E9E',
};

/** Метки типов переменных (RU/EN) */
export const VARIABLE_TYPE_LABELS: Record<PortDataType, { ru: string; en: string }> = {
  execution: { ru: 'Выполнение', en: 'Execution' },
  bool: { ru: 'Логический', en: 'Boolean' },
  int32: { ru: 'Целое (32)', en: 'Integer (32)' },
  int64: { ru: 'Целое (64)', en: 'Integer (64)' },
  float: { ru: 'Дробное (32)', en: 'Float' },
  double: { ru: 'Дробное (64)', en: 'Double' },
  string: { ru: 'Строка', en: 'String' },
  vector: { ru: 'Вектор', en: 'Vector' },
  pointer: { ru: 'Указатель', en: 'Pointer' },
  class: { ru: 'Класс', en: 'Class' },
  array: { ru: 'Массив', en: 'Array' },
  any: { ru: 'Любой', en: 'Any' },
};

/** Типы данных для переменных (без execution) */
export const VARIABLE_DATA_TYPES: PortDataType[] = [
  'bool', 'int32', 'int64', 'float', 'double', 'string', 'vector', 'pointer', 'class', 'array'
];

/** Полное состояние Blueprint-графа */
export interface BlueprintGraphState {
  id: string;
  name: string;
  language: GraphLanguage;
  displayLanguage: GraphDisplayLanguage;
  nodes: BlueprintNode[];
  edges: BlueprintEdge[];
  updatedAt: string;
  dirty?: boolean;
  /** Метаданные для редактора */
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
  /** Пользовательские функции (как в UE Blueprints) */
  functions?: BlueprintFunction[];
  /** ID текущей редактируемой функции (null = основной граф EventGraph) */
  activeFunctionId?: string | null;
  /** Переменные графа */
  variables?: BlueprintVariable[];
}

// ============================================
// Типы для пользовательских функций (UE Blueprint-style)
// ============================================

/** Направление параметра функции */
export type FunctionParameterDirection = 'input' | 'output';

/** Параметр пользовательской функции */
export interface FunctionParameter {
  id: string;
  name: string;
  nameRu: string;
  dataType: PortDataType;
  direction: FunctionParameterDirection;
  defaultValue?: string | number | boolean;
  description?: string;
}

/** Пользовательская функция (граф с параметрами) */
export interface BlueprintFunction {
  /** Уникальный ID функции */
  id: string;
  /** Имя функции (для кодогенерации) */
  name: string;
  /** Отображаемое имя (RU) */
  nameRu: string;
  /** Описание функции */
  description?: string;
  /** Параметры функции (входные и выходные) */
  parameters: FunctionParameter[];
  /** Локальные переменные функции (не связаны с EventGraph по умолчанию) */
  variables?: BlueprintVariable[];
  /** Граф функции (узлы и связи) */
  graph: {
    nodes: BlueprintNode[];
    edges: BlueprintEdge[];
  };
  /** Является ли функция чистой (без побочных эффектов) */
  isPure?: boolean;
  /** Цвет категории (для визуального различия) */
  categoryColor?: string;
  /** Дата создания */
  createdAt: string;
  /** Дата обновления */
  updatedAt: string;
}

/** Определение типа узла (шаблон для создания) */
export interface NodeTypeDefinition {
  type: BlueprintNodeType;
  label: string;
  labelRu: string;
  category: 'flow' | 'function' | 'variable' | 'math' | 'comparison' | 'logic' | 'io' | 'other';
  /** Ключ иконки или путь (например: 'loop' или 'vscode-extension/media/icons/loop.svg') */
  icon?: string;
  description?: string;
  descriptionRu?: string;
  /** Шаблон входных портов */
  inputs: Omit<NodePort, 'index' | 'connected'>[];
  /** Шаблон выходных портов */
  outputs: Omit<NodePort, 'index' | 'connected'>[];
  /** Можно ли добавлять динамические порты */
  dynamicPorts?: boolean;
  /** Цвет заголовка узла */
  headerColor?: string;
}

// ============================================
// Преобразование между старым и новым форматом
// ============================================

import { GraphState, GraphNode, GraphEdge } from './graphState';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isPortDirection = (value: unknown): value is NodePort['direction'] =>
  value === 'input' || value === 'output';

const isPortDataType = (value: unknown): value is PortDataType =>
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
  value === 'any';

const isBlueprintNodeTypeValue = (value: unknown): value is BlueprintNodeType =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(NODE_TYPE_DEFINITIONS, value);

const isNodePort = (value: unknown): value is NodePort => {
  if (!isRecord(value)) {
    return false;
  }

  if (typeof value.id !== 'string' || typeof value.name !== 'string') {
    return false;
  }

  if (value.nameRu !== undefined && typeof value.nameRu !== 'string') {
    return false;
  }

  if (!isPortDataType(value.dataType) || !isPortDirection(value.direction)) {
    return false;
  }

  // index необязателен — может отсутствовать после десериализации/загрузки
  if (value.index !== undefined && !isFiniteNumber(value.index)) {
    return false;
  }

  if (value.connected !== undefined && typeof value.connected !== 'boolean') {
    return false;
  }

  return true;
};

export const isEmbeddedBlueprintNode = (value: unknown): value is BlueprintNode => {
  if (!isRecord(value)) {
    return false;
  }

  if (typeof value.id !== 'string' || typeof value.label !== 'string') {
    return false;
  }

  if (!isBlueprintNodeTypeValue(value.type)) {
    return false;
  }

  if (
    !isRecord(value.position) ||
    !isFiniteNumber(value.position.x) ||
    !isFiniteNumber(value.position.y)
  ) {
    return false;
  }

  if (!Array.isArray(value.inputs) || !Array.isArray(value.outputs)) {
    return false;
  }

  if (!value.inputs.every(isNodePort) || !value.outputs.every(isNodePort)) {
    return false;
  }

  if (value.properties !== undefined && !isRecord(value.properties)) {
    return false;
  }

  if (value.comment !== undefined && typeof value.comment !== 'string') {
    return false;
  }

  if (value.customLabel !== undefined && typeof value.customLabel !== 'string') {
    return false;
  }

  return true;
};

const isGraphEdgeKind = (value: unknown): value is GraphEdgeKind =>
  value === 'execution' || value === 'data';

export const isEmbeddedBlueprintEdge = (value: unknown): value is BlueprintEdge => {
  if (!isRecord(value)) {
    return false;
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.sourceNode !== 'string' ||
    typeof value.sourcePort !== 'string' ||
    typeof value.targetNode !== 'string' ||
    typeof value.targetPort !== 'string'
  ) {
    return false;
  }

  if (!isGraphEdgeKind(value.kind)) {
    return false;
  }

  if (value.dataType !== undefined && !isPortDataType(value.dataType)) {
    return false;
  }

  return true;
};

const normalizeMigratedVariables = (variables: unknown[] | undefined): BlueprintVariable[] => {
  if (!Array.isArray(variables)) {
    return [];
  }

  return variables
    .filter((value): value is Record<string, unknown> => isRecord(value))
    .map((rawVariable) => {
      const variable = rawVariable as unknown as BlueprintVariable;
      if (variable.dataType !== 'pointer') {
        return variable;
      }

      return {
        ...variable,
        pointerMeta: normalizePointerMeta(variable.pointerMeta),
      };
    });
};

const normalizeMigratedFunctions = (functions: unknown[] | undefined): BlueprintFunction[] => {
  if (!Array.isArray(functions)) {
    return [];
  }

  return functions
    .filter((value): value is Record<string, unknown> => isRecord(value))
    .map((rawFunction) => {
      const func = rawFunction as unknown as BlueprintFunction;
      return {
        ...func,
        variables: normalizeMigratedVariables((func as { variables?: unknown[] }).variables),
      };
    });
};

const toNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const getFirstDataPortType = (ports: NodePort[]): PortDataType | null => {
  for (const port of ports) {
    if (!isPortDataType(port.dataType) || port.dataType === 'execution') {
      continue;
    }
    return port.dataType;
  }
  return null;
};

const normalizeTypeConversionMeta = (value: unknown): TypeConversionMeta => {
  const source = isRecord(value) ? value : {};

  const vectorElementType = isVectorElementType(source.vectorElementType)
    ? source.vectorElementType
    : undefined;

  const arrayRank = typeof source.arrayRank === 'number' && Number.isFinite(source.arrayRank)
    ? Math.max(0, Math.trunc(source.arrayRank))
    : undefined;

  const pointerMode = isPointerMode(source.pointerMode)
    ? source.pointerMode
    : undefined;

  return {
    ...(vectorElementType ? { vectorElementType } : {}),
    ...(arrayRank !== undefined ? { arrayRank } : {}),
    ...(pointerMode ? { pointerMode } : {}),
  };
};

const normalizeTypeConversionNode = (
  node: BlueprintNode,
  displayLanguage: GraphDisplayLanguage
): BlueprintNode => {
  if (node.type !== 'TypeConversion') {
    return node;
  }

  const rawProperties = isRecord(node.properties)
    ? (node.properties as TypeConversionProperties)
    : {};

  const sourceType = isPortDataType(rawProperties.fromType)
    ? rawProperties.fromType
    : getFirstDataPortType(node.inputs) ?? 'any';

  const targetType = isPortDataType(rawProperties.toType)
    ? rawProperties.toType
    : getFirstDataPortType(node.outputs) ?? 'any';

  const conversionIdRaw = toNonEmptyString(rawProperties.conversionId);
  const rule =
    (conversionIdRaw ? findTypeConversionRuleById(conversionIdRaw) : null) ??
    findTypeConversionRule(sourceType, targetType);

  const displayLabel = rule
    ? formatTypeConversionLabel(rule, displayLanguage)
    : displayLanguage === 'ru'
      ? `Преобразовать: ${sourceType} → ${targetType}`
      : `Convert: ${sourceType} -> ${targetType}`;

  const nameRu = rule?.labelRu ?? toNonEmptyString(rawProperties.nameRu) ?? displayLabel;
  const nameEn = rule?.labelEn ?? toNonEmptyString(rawProperties.name) ?? displayLabel;

  const normalizedProperties: TypeConversionProperties = {
    ...rawProperties,
    conversionId: rule?.id ?? conversionIdRaw ?? undefined,
    fromType: sourceType,
    toType: targetType,
    autoInserted: rawProperties.autoInserted === true,
    meta: normalizeTypeConversionMeta(rawProperties.meta),
    name: nameEn,
    nameRu,
  };

  const inputPortId = node.inputs[0]?.id ?? `${node.id}-value-in`;
  const outputPortId = node.outputs[0]?.id ?? `${node.id}-value-out`;

  const normalizedInputs: NodePort[] = [
    {
      ...(node.inputs[0] ?? {
        id: inputPortId,
        direction: 'input' as const,
      }),
      id: inputPortId,
      name: displayLanguage === 'ru' ? 'Вход' : 'In',
      dataType: sourceType,
      direction: 'input',
      index: 0,
      connected: node.inputs[0]?.connected ?? false,
    },
  ];

  const normalizedOutputs: NodePort[] = [
    {
      ...(node.outputs[0] ?? {
        id: outputPortId,
        direction: 'output' as const,
      }),
      id: outputPortId,
      name: displayLanguage === 'ru' ? 'Выход' : 'Out',
      dataType: targetType,
      direction: 'output',
      index: 0,
      connected: node.outputs[0]?.connected ?? false,
    },
  ];

  return {
    ...node,
    label: displayLabel,
    customLabel: displayLabel,
    inputs: normalizedInputs,
    outputs: normalizedOutputs,
    properties: normalizedProperties,
  };
};

interface TypeConversionMigrationResult {
  nodes: BlueprintNode[];
  edges: BlueprintEdge[];
  insertedCount: number;
}

const buildBlueprintNodeFromLegacy = (node: GraphNode): BlueprintNode => {
  const mappedType = mapOldNodeType(node.type ?? 'Custom');
  // Пытаемся извлечь properties из частично валидного blueprintNode
  const partialBlueprint = isRecord(node.blueprintNode) ? node.blueprintNode : undefined;
  const properties = partialBlueprint && isRecord(partialBlueprint.properties)
    ? partialBlueprint.properties as Record<string, unknown>
    : undefined;
  // Восстанавливаем оригинальный тип из blueprintNode если возможно
  const originalType = partialBlueprint && isBlueprintNodeTypeValue(partialBlueprint.type)
    ? partialBlueprint.type as BlueprintNodeType
    : mappedType;
  // Восстановить порты из blueprintNode если возможно (даже если index отсутствует)
  const inputs = partialBlueprint && Array.isArray(partialBlueprint.inputs)
    ? (partialBlueprint.inputs as NodePort[]).map((p, i) => ({ ...p, index: p.index ?? i }))
    : getDefaultInputs(originalType);
  const outputs = partialBlueprint && Array.isArray(partialBlueprint.outputs)
    ? (partialBlueprint.outputs as NodePort[]).map((p, i) => ({ ...p, index: p.index ?? i }))
    : getDefaultOutputs(originalType);
  return {
    id: node.id ?? `node-${Math.random().toString(36).slice(2)}`,
    label: (partialBlueprint?.label as string) ?? node.label ?? 'Unnamed',
    type: originalType,
    position: node.position ?? { x: 0, y: 0 },
    inputs,
    outputs,
    ...(properties ? { properties } : {}),
  };
};

const pickPortByKind = (
  node: BlueprintNode | undefined,
  direction: 'input' | 'output',
  kind: GraphEdgeKind
): string => {
  const ports = direction === 'input' ? node?.inputs ?? [] : node?.outputs ?? [];
  if (!ports.length) {
    if (kind === 'execution') {
      return direction === 'input' ? 'exec-in' : 'exec-out';
    }
    return direction === 'input' ? 'value-in' : 'value-out';
  }

  if (kind === 'execution') {
    return ports.find((port) => port.dataType === 'execution')?.id ?? ports[0].id;
  }

  return ports.find((port) => port.dataType !== 'execution')?.id ?? ports[0].id;
};

const normalizeEdgePortId = (
  rawPortId: string,
  nodeId: string,
  node: BlueprintNode | undefined,
  direction: 'input' | 'output',
  kind: GraphEdgeKind
): string => {
  const ports = direction === 'input' ? node?.inputs ?? [] : node?.outputs ?? [];
  if (!ports.length) {
    return pickPortByKind(node, direction, kind);
  }

  if (ports.some((port) => port.id === rawPortId)) {
    return rawPortId;
  }

  if (rawPortId.startsWith(`${nodeId}-`)) {
    const suffix = rawPortId.slice(nodeId.length + 1);
    if (ports.some((port) => port.id === suffix)) {
      return suffix;
    }
  }

  const tailCandidate = rawPortId.split('-').slice(-2).join('-');
  if (ports.some((port) => port.id === tailCandidate)) {
    return tailCandidate;
  }

  return pickPortByKind(node, direction, kind);
};

const normalizeBlueprintEdge = (
  edge: BlueprintEdge,
  nodeMap: Map<string, BlueprintNode>
): BlueprintEdge => {
  const kind: GraphEdgeKind = edge.kind === 'data' ? 'data' : 'execution';
  const sourceNode = nodeMap.get(edge.sourceNode);
  const targetNode = nodeMap.get(edge.targetNode);

  return {
    ...edge,
    kind,
    sourcePort: normalizeEdgePortId(edge.sourcePort, edge.sourceNode, sourceNode, 'output', kind),
    targetPort: normalizeEdgePortId(edge.targetPort, edge.targetNode, targetNode, 'input', kind),
  };
};

const dedupeBlueprintEdges = (edges: BlueprintEdge[]): BlueprintEdge[] => {
  const seen = new Set<string>();
  const unique: BlueprintEdge[] = [];

  for (const edge of edges) {
    const signature =
      `${edge.sourceNode}:${edge.sourcePort}->${edge.targetNode}:${edge.targetPort}:${edge.kind}:${edge.dataType ?? ''}`;
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    unique.push(edge);
  }

  return unique;
};

const getPortDataType = (
  node: BlueprintNode | undefined,
  direction: 'input' | 'output',
  portId: string
): PortDataType | undefined => {
  if (!node) {
    return undefined;
  }
  const ports = direction === 'input' ? node.inputs : node.outputs;
  return ports.find((port) => port.id === portId)?.dataType;
};

const buildBlueprintEdgeFromLegacy = (
  edge: GraphEdge,
  nodeMap: Map<string, BlueprintNode>
): BlueprintEdge => {
  const kind: GraphEdgeKind = edge.kind ?? 'execution';
  const sourceNode = nodeMap.get(edge.source);
  const targetNode = nodeMap.get(edge.target);
  const sourcePort = pickPortByKind(sourceNode, 'output', kind);
  const targetPort = pickPortByKind(targetNode, 'input', kind);
  const inferredDataType = getPortDataType(sourceNode, 'output', sourcePort);
  const dataType: PortDataType | undefined =
    kind === 'data'
      ? inferredDataType && inferredDataType !== 'execution'
        ? inferredDataType
        : 'any'
      : undefined;

  return {
    id: edge.id ?? `edge-${Math.random().toString(36).slice(2)}`,
    sourceNode: edge.source,
    sourcePort,
    targetNode: edge.target,
    targetPort,
    kind,
    dataType,
  };
};

const createUniqueId = (baseId: string, usedIds: Set<string>): string => {
  if (!usedIds.has(baseId)) {
    usedIds.add(baseId);
    return baseId;
  }

  let index = 1;
  let candidate = `${baseId}-${index}`;
  while (usedIds.has(candidate)) {
    index += 1;
    candidate = `${baseId}-${index}`;
  }

  usedIds.add(candidate);
  return candidate;
};

const migrateIncompatibleDataEdges = (
  nodes: BlueprintNode[],
  edges: BlueprintEdge[],
  displayLanguage: GraphDisplayLanguage
): TypeConversionMigrationResult => {
  const nextNodes = [...nodes];
  const nextEdges: BlueprintEdge[] = [];
  const nodeById = new Map(nextNodes.map((node) => [node.id, node]));

  const usedNodeIds = new Set(nextNodes.map((node) => node.id));
  const usedEdgeIds = new Set(edges.map((edge) => edge.id));

  let insertedCount = 0;

  for (const edge of edges) {
    if (edge.kind !== 'data') {
      nextEdges.push(edge);
      continue;
    }

    const sourceNode = nodeById.get(edge.sourceNode);
    const targetNode = nodeById.get(edge.targetNode);

    if (!sourceNode || !targetNode) {
      nextEdges.push(edge);
      continue;
    }

    if (sourceNode.type === 'TypeConversion' || targetNode.type === 'TypeConversion') {
      nextEdges.push(edge);
      continue;
    }

    const sourceType = getPortDataType(sourceNode, 'output', edge.sourcePort);
    const targetType = getPortDataType(targetNode, 'input', edge.targetPort);

    if (
      !sourceType ||
      !targetType ||
      sourceType === 'execution' ||
      targetType === 'execution'
    ) {
      nextEdges.push(edge);
      continue;
    }

    if (canDirectlyConnectDataPorts(sourceType, targetType)) {
      const resolvedDataType: PortDataType =
        isPortDataType(edge.dataType) && edge.dataType !== 'execution'
          ? edge.dataType
          : sourceType === 'any'
            ? targetType
            : sourceType;
      nextEdges.push({
        ...edge,
        kind: 'data',
        dataType: resolvedDataType,
      });
      continue;
    }

    const conversionRule = findTypeConversionRule(sourceType, targetType);
    if (!conversionRule) {
      nextEdges.push({
        ...edge,
        kind: 'data',
        dataType: edge.dataType ?? sourceType,
      });
      continue;
    }

    insertedCount += 1;

    const conversionNodeId = createUniqueId(`node-conversion-auto-${edge.id}`, usedNodeIds);
    const conversionLabel = formatTypeConversionLabel(conversionRule, displayLanguage);

    const conversionNode: BlueprintNode = {
      id: conversionNodeId,
      label: conversionLabel,
      customLabel: conversionLabel,
      type: 'TypeConversion',
      position: {
        x: (sourceNode.position.x + targetNode.position.x) / 2,
        y: (sourceNode.position.y + targetNode.position.y) / 2 - 40,
      },
      inputs: [
        {
          id: `${conversionNodeId}-value-in`,
          name: displayLanguage === 'ru' ? 'Вход' : 'In',
          dataType: conversionRule.sourceType,
          direction: 'input',
          index: 0,
          connected: true,
        },
      ],
      outputs: [
        {
          id: `${conversionNodeId}-value-out`,
          name: displayLanguage === 'ru' ? 'Выход' : 'Out',
          dataType: conversionRule.targetType,
          direction: 'output',
          index: 0,
          connected: true,
        },
      ],
      properties: {
        conversionId: conversionRule.id,
        fromType: conversionRule.sourceType,
        toType: conversionRule.targetType,
        autoInserted: true,
        meta: {},
        name: conversionRule.labelEn,
        nameRu: conversionRule.labelRu,
      } satisfies TypeConversionProperties,
    };

    const normalizedConversionNode = normalizeTypeConversionNode(conversionNode, displayLanguage);
    nextNodes.push(normalizedConversionNode);
    nodeById.set(normalizedConversionNode.id, normalizedConversionNode);

    const toConversionEdgeId = createUniqueId(`${edge.id}__to_conversion`, usedEdgeIds);
    const fromConversionEdgeId = createUniqueId(`${edge.id}__from_conversion`, usedEdgeIds);

    nextEdges.push({
      id: toConversionEdgeId,
      sourceNode: edge.sourceNode,
      sourcePort: edge.sourcePort,
      targetNode: normalizedConversionNode.id,
      targetPort: normalizedConversionNode.inputs[0].id,
      kind: 'data',
      dataType: conversionRule.sourceType,
    });

    nextEdges.push({
      id: fromConversionEdgeId,
      sourceNode: normalizedConversionNode.id,
      sourcePort: normalizedConversionNode.outputs[0].id,
      targetNode: edge.targetNode,
      targetPort: edge.targetPort,
      kind: 'data',
      dataType: conversionRule.targetType,
    });
  }

  return {
    nodes: nextNodes,
    edges: dedupeBlueprintEdges(nextEdges),
    insertedCount,
  };
};

/** Преобразовать старый формат в Blueprint формат */
export function migrateToBlueprintFormat(oldState: GraphState): BlueprintGraphState {
  // Защита от undefined/null
  const safeNodes = oldState?.nodes ?? [];
  const safeEdges = oldState?.edges ?? [];
  const displayLanguage: GraphDisplayLanguage = oldState.displayLanguage ?? 'ru';
  
  const nodes: BlueprintNode[] = safeNodes
    .filter(node => node && typeof node === 'object')
    .map(node => {
      if (isEmbeddedBlueprintNode(node.blueprintNode)) {
        const embeddedNode = node.blueprintNode;
        const mergedNode: BlueprintNode = {
          ...embeddedNode,
          id: node.id ?? embeddedNode.id,
          label: embeddedNode.label ?? node.label ?? '',
          position: node.position ?? embeddedNode.position,
        };
        return normalizeTypeConversionNode(mergedNode, displayLanguage);
      }
      return normalizeTypeConversionNode(buildBlueprintNodeFromLegacy(node), displayLanguage);
    });

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  const edges = dedupeBlueprintEdges(
    safeEdges
      .filter(edge => edge && typeof edge === 'object' && edge.source && edge.target)
      .map(edge => {
        if (isEmbeddedBlueprintEdge(edge.blueprintEdge)) {
          const embeddedEdge = edge.blueprintEdge;
          const kind = edge.kind ?? embeddedEdge.kind;
          return normalizeBlueprintEdge({
            ...embeddedEdge,
            id: edge.id ?? embeddedEdge.id,
            sourceNode: edge.source ?? embeddedEdge.sourceNode,
            targetNode: edge.target ?? embeddedEdge.targetNode,
            kind: kind === 'data' ? 'data' : 'execution',
          }, nodeMap);
        }
        return normalizeBlueprintEdge(buildBlueprintEdgeFromLegacy(edge, nodeMap), nodeMap);
      })
  );

  const migrationResult = migrateIncompatibleDataEdges(nodes, edges, displayLanguage);
  const hasInsertedConversions = migrationResult.insertedCount > 0;
  const dirty = oldState.dirty === true || hasInsertedConversions;

  return {
    id: oldState.id,
    name: oldState.name,
    language: oldState.language,
    displayLanguage,
    nodes: migrationResult.nodes,
    edges: migrationResult.edges,
    updatedAt: hasInsertedConversions ? new Date().toISOString() : oldState.updatedAt,
    dirty,
    // Восстанавливаем переменные и функции
    variables: normalizeMigratedVariables(oldState.variables as unknown[] | undefined),
    functions: normalizeMigratedFunctions(oldState.functions as unknown[] | undefined),
  };
}

function mapOldNodeType(type: string): BlueprintNodeType {
  const mapping: Record<string, BlueprintNodeType> = {
    'Start': 'Start',
    'End': 'End',
    'Function': 'Function',
    'Variable': 'Variable',
    'Custom': 'Custom',
  };
  return mapping[type] ?? 'Custom';
}

function getDefaultInputs(type: BlueprintNodeType): NodePort[] {
  const defaults = NODE_TYPE_DEFINITIONS[type];
  if (!defaults) return [];
  return defaults.inputs.map((p, i) => ({ ...p, index: i, connected: false }));
}

function getDefaultOutputs(type: BlueprintNodeType): NodePort[] {
  const defaults = NODE_TYPE_DEFINITIONS[type];
  if (!defaults) return [];
  return defaults.outputs.map((p, i) => ({ ...p, index: i, connected: false }));
}

// ============================================
// Определения стандартных типов узлов
// ============================================

export const NODE_TYPE_DEFINITIONS: Record<BlueprintNodeType, NodeTypeDefinition> = {
  // === Control Flow ===
  Start: {
    type: 'Start',
    label: 'Event Begin Play',
    labelRu: 'Начало',
    icon: 'control',
    category: 'flow',
    description: 'Entry point of the graph',
    descriptionRu: 'Точка входа в граф',
    headerColor: '#E53935',
    inputs: [],
    outputs: [
      { id: 'exec-out', name: '', dataType: 'execution', direction: 'output' }
    ],
  },
  End: {
    type: 'End',
    label: 'Return',
    labelRu: 'Конец',
    icon: 'control',
    category: 'flow',
    headerColor: '#E53935',
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' }
    ],
    outputs: [],
  },
  Branch: {
    type: 'Branch',
    label: 'Branch',
    labelRu: 'Ветвление',
    icon: 'control',
    category: 'flow',
    description: 'If/Else conditional',
    descriptionRu: 'Условный переход',
    headerColor: '#7C4DFF',
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' },
      { id: 'condition', name: 'Condition', nameRu: 'Условие', dataType: 'bool', direction: 'input' }
    ],
    outputs: [
      { id: 'true', name: 'True', nameRu: 'Истина', dataType: 'execution', direction: 'output' },
      { id: 'false', name: 'False', nameRu: 'Ложь', dataType: 'execution', direction: 'output' }
    ],
  },
  ForLoop: {
    type: 'ForLoop',
    label: 'For Loop',
    labelRu: 'Цикл For',
    icon: 'loop',
    category: 'flow',
    headerColor: '#7C4DFF',
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' },
      { id: 'first', name: 'Start', nameRu: 'Начало', dataType: 'int32', direction: 'input', defaultValue: 0 },
      { id: 'last', name: 'Bound', nameRu: 'Граница', dataType: 'int32', direction: 'input', defaultValue: 10 }
    ],
    outputs: [
      { id: 'loop-body', name: 'Loop Body', nameRu: 'Тело', dataType: 'execution', direction: 'output' },
      { id: 'index', name: 'Index', nameRu: 'Индекс', dataType: 'int32', direction: 'output' },
      { id: 'completed', name: 'Completed', nameRu: 'Завершено', dataType: 'execution', direction: 'output' }
    ],
  },
  WhileLoop: {
    type: 'WhileLoop',
    label: 'While Loop',
    labelRu: 'Цикл While',
    icon: 'loop',
    category: 'flow',
    headerColor: '#7C4DFF',
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' },
      { id: 'condition', name: 'Condition', dataType: 'bool', direction: 'input' }
    ],
    outputs: [
      { id: 'loop-body', name: 'Loop Body', dataType: 'execution', direction: 'output' },
      { id: 'completed', name: 'Completed', dataType: 'execution', direction: 'output' }
    ],
  },
  Sequence: {
    type: 'Sequence',
    label: 'Sequence',
    labelRu: 'Последовательность',
    icon: 'control',
    category: 'flow',
    headerColor: '#7C4DFF',
    dynamicPorts: true,
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' }
    ],
    outputs: [
      { id: 'then-0', name: 'Then 0', nameRu: 'Затем 0', dataType: 'execution', direction: 'output' },
      { id: 'then-1', name: 'Then 1', nameRu: 'Затем 1', dataType: 'execution', direction: 'output' }
    ],
  },
  Parallel: {
    type: 'Parallel',
    label: 'Parallel',
    labelRu: 'Параллельно',
    icon: 'control',
    category: 'flow',
    description: 'Execute multiple branches in parallel (threads)',
    descriptionRu: 'Выполнить несколько веток параллельно (многопоток)',
    headerColor: '#00BCD4',
    dynamicPorts: true,
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' }
    ],
    outputs: [
      { id: 'thread-0', name: 'Thread 0', dataType: 'execution', direction: 'output' },
      { id: 'thread-1', name: 'Thread 1', dataType: 'execution', direction: 'output' },
      { id: 'completed', name: 'All Done', dataType: 'execution', direction: 'output' }
    ],
  },
  Gate: {
    type: 'Gate',
    label: 'Gate',
    labelRu: 'Шлюз',
    icon: 'control',
    category: 'flow',
    description: 'Controllable gate - can be opened/closed to control flow',
    descriptionRu: 'Управляемый шлюз - можно открыть/закрыть для контроля потока',
    headerColor: '#FF9800',
    inputs: [
      { id: 'enter', name: 'Enter', dataType: 'execution', direction: 'input' },
      { id: 'open', name: 'Open', dataType: 'execution', direction: 'input' },
      { id: 'close', name: 'Close', dataType: 'execution', direction: 'input' },
      { id: 'toggle', name: 'Toggle', dataType: 'execution', direction: 'input' }
    ],
    outputs: [
      { id: 'exit', name: 'Exit', dataType: 'execution', direction: 'output' }
    ],
  },
  DoN: {
    type: 'DoN',
    label: 'Do N',
    labelRu: 'Выполнить N раз',
    category: 'flow',
    description: 'Execute N times, then stop',
    descriptionRu: 'Выполнить N раз, затем остановиться',
    headerColor: '#FF9800',
    inputs: [
      { id: 'exec-in', name: 'Enter', dataType: 'execution', direction: 'input' },
      { id: 'n', name: 'N', dataType: 'int32', direction: 'input' },
      { id: 'reset', name: 'Reset', dataType: 'execution', direction: 'input' }
    ],
    outputs: [
      { id: 'exit', name: 'Exit', dataType: 'execution', direction: 'output' },
      { id: 'counter', name: 'Counter', dataType: 'int32', direction: 'output' }
    ],
  },
  DoOnce: {
    type: 'DoOnce',
    label: 'Do Once',
    labelRu: 'Один раз',
    category: 'flow',
    description: 'Execute only once, ignore subsequent calls',
    descriptionRu: 'Выполнить только один раз, игнорировать последующие вызовы',
    headerColor: '#FF9800',
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' },
      { id: 'reset', name: 'Reset', dataType: 'execution', direction: 'input' }
    ],
    outputs: [
      { id: 'completed', name: 'Completed', dataType: 'execution', direction: 'output' }
    ],
  },
  FlipFlop: {
    type: 'FlipFlop',
    label: 'Flip Flop',
    labelRu: 'Переключатель',
    category: 'flow',
    description: 'Alternates between A and B outputs',
    descriptionRu: 'Переключает между выходами A и B',
    headerColor: '#FF9800',
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' }
    ],
    outputs: [
      { id: 'a', name: 'A', dataType: 'execution', direction: 'output' },
      { id: 'b', name: 'B', dataType: 'execution', direction: 'output' },
      { id: 'is-a', name: 'Is A', dataType: 'bool', direction: 'output' }
    ],
  },
  MultiGate: {
    type: 'MultiGate',
    label: 'Multi Gate',
    labelRu: 'Мульти-шлюз',
    category: 'flow',
    description: 'Cycles through multiple outputs sequentially or randomly',
    descriptionRu: 'Циклически переключает между несколькими выходами',
    headerColor: '#FF9800',
    dynamicPorts: true,
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' },
      { id: 'reset', name: 'Reset', dataType: 'execution', direction: 'input' },
      { id: 'is-random', name: 'Random', dataType: 'bool', direction: 'input' },
      { id: 'loop', name: 'Loop', dataType: 'bool', direction: 'input' }
    ],
    outputs: [
      { id: 'out-0', name: 'Out 0', dataType: 'execution', direction: 'output' },
      { id: 'out-1', name: 'Out 1', dataType: 'execution', direction: 'output' },
      { id: 'out-2', name: 'Out 2', dataType: 'execution', direction: 'output' }
    ],
  },
  DoWhile: {
    type: 'DoWhile',
    label: 'Do While',
    labelRu: 'Цикл Do-While',
    category: 'flow',
    description: 'Loop with post-condition (executes at least once)',
    descriptionRu: 'Цикл с постусловием (выполняется минимум один раз)',
    headerColor: '#7C4DFF',
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' },
      { id: 'condition', name: 'Condition', dataType: 'bool', direction: 'input' }
    ],
    outputs: [
      { id: 'loop-body', name: 'Loop Body', dataType: 'execution', direction: 'output' },
      { id: 'completed', name: 'Completed', dataType: 'execution', direction: 'output' }
    ],
  },
  ForEach: {
    type: 'ForEach',
    label: 'For Each',
    labelRu: 'Для каждого',
    category: 'flow',
    description: 'Iterate over array elements',
    descriptionRu: 'Итерация по элементам массива',
    headerColor: '#7C4DFF',
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' },
      { id: 'array', name: 'Container', nameRu: 'Контейнер', dataType: 'array', direction: 'input' }
    ],
    outputs: [
      { id: 'loop-body', name: 'Loop Body', nameRu: 'Тело', dataType: 'execution', direction: 'output' },
      { id: 'element', name: 'Element', nameRu: 'Элемент', dataType: 'any', direction: 'output' },
      { id: 'index', name: 'Index', nameRu: 'Индекс', dataType: 'int32', direction: 'output' },
      { id: 'completed', name: 'Completed', nameRu: 'Завершено', dataType: 'execution', direction: 'output' }
    ],
  },
  Switch: {
    type: 'Switch',
    label: 'Switch',
    labelRu: 'Выбор',
    category: 'flow',
    description: 'Multiple choice based on value',
    descriptionRu: 'Множественный выбор по значению',
    headerColor: '#7C4DFF',
    dynamicPorts: true,
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' },
      { id: 'selection', name: 'Selection', nameRu: 'Значение', dataType: 'int32', direction: 'input', defaultValue: 0 }
    ],
    outputs: [
      { id: 'case-0', name: 'Case 0', nameRu: 'Случай 0', dataType: 'execution', direction: 'output', defaultValue: 0 },
      { id: 'case-1', name: 'Case 1', nameRu: 'Случай 1', dataType: 'execution', direction: 'output', defaultValue: 1 },
      { id: 'default', name: 'Default', nameRu: 'По умолчанию', dataType: 'execution', direction: 'output' }
    ],
  },
  Break: {
    type: 'Break',
    label: 'Break',
    labelRu: 'Прервать',
    category: 'flow',
    description: 'Exit from loop',
    descriptionRu: 'Выход из цикла',
    headerColor: '#E53935',
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' }
    ],
    outputs: [],
  },
  Continue: {
    type: 'Continue',
    label: 'Continue',
    labelRu: 'Продолжить',
    category: 'flow',
    description: 'Skip to next iteration',
    descriptionRu: 'Перейти к следующей итерации',
    headerColor: '#E53935',
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' }
    ],
    outputs: [],
  },
  Return: {
    type: 'Return',
    label: 'Return',
    labelRu: 'Возврат',
    category: 'flow',
    headerColor: '#E53935',
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' },
      { id: 'value', name: 'Return Value', dataType: 'any', direction: 'input' }
    ],
    outputs: [],
  },
  
  // === Functions ===
  Function: {
    type: 'Function',
    label: 'Function',
    labelRu: 'Функция',
    category: 'function',
    headerColor: '#2196F3',
    dynamicPorts: true,
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' }
    ],
    outputs: [
      { id: 'exec-out', name: '', dataType: 'execution', direction: 'output' }
    ],
  },
  FunctionCall: {
    type: 'FunctionCall',
    label: 'Call Function',
    labelRu: 'Вызов функции',
    category: 'function',
    headerColor: '#2196F3',
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' },
      { id: 'target', name: 'Target', dataType: 'pointer', direction: 'input', hidden: true }
    ],
    outputs: [
      { id: 'exec-out', name: '', dataType: 'execution', direction: 'output' },
      { id: 'return', name: 'Return Value', dataType: 'any', direction: 'output' }
    ],
  },
  Event: {
    type: 'Event',
    label: 'Custom Event',
    labelRu: 'Событие',
    category: 'function',
    headerColor: '#E53935',
    dynamicPorts: true,
    inputs: [],
    outputs: [
      { id: 'exec-out', name: '', dataType: 'execution', direction: 'output' }
    ],
  },
  
  // === User-Defined Functions (UE Blueprint-style) ===
  FunctionEntry: {
    type: 'FunctionEntry',
    label: 'Function Entry',
    labelRu: 'Вход в функцию',
    category: 'function',
    description: 'Entry point of a user-defined function',
    descriptionRu: 'Точка входа в пользовательскую функцию',
    headerColor: '#9C27B0', // Фиолетовый — для функций
    dynamicPorts: true, // Порты генерируются из параметров функции
    inputs: [],
    outputs: [
      { id: 'exec-out', name: '', dataType: 'execution', direction: 'output' }
      // Дополнительные выходы создаются динамически из параметров функции (inputs)
    ],
  },
  FunctionReturn: {
    type: 'FunctionReturn',
    label: 'Return Node',
    labelRu: 'Возврат из функции',
    category: 'function',
    description: 'Return point of a user-defined function',
    descriptionRu: 'Точка возврата из пользовательской функции',
    headerColor: '#9C27B0',
    dynamicPorts: true, // Порты генерируются из параметров функции
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' }
      // Дополнительные входы создаются динамически из return-параметров функции
    ],
    outputs: [],
  },
  CallUserFunction: {
    type: 'CallUserFunction',
    label: 'Call Function',
    labelRu: 'Вызов функции',
    category: 'function',
    description: 'Call a user-defined function',
    descriptionRu: 'Вызов пользовательской функции',
    headerColor: '#9C27B0',
    dynamicPorts: true, // Порты генерируются из сигнатуры функции
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' }
      // Дополнительные входы = input-параметры функции
    ],
    outputs: [
      { id: 'exec-out', name: '', dataType: 'execution', direction: 'output' }
      // Дополнительные выходы = output-параметры функции
    ],
  },
  
  // === Variables ===
  Variable: {
    type: 'Variable',
    label: 'Variable',
    labelRu: 'Переменная',
    icon: 'variable',
    category: 'variable',
    headerColor: '#4CAF50',
    inputs: [],
    outputs: [
      { id: 'value', name: 'Value', nameRu: 'Значение', dataType: 'any', direction: 'output' }
    ],
  },
  GetVariable: {
    type: 'GetVariable',
    label: 'Get',
    labelRu: 'Получить',
    icon: 'variable',
    category: 'variable',
    headerColor: '#4CAF50',
    inputs: [],
    outputs: [
      { id: 'value-out', name: 'Значение', dataType: 'any', direction: 'output' }
    ],
  },
  SetVariable: {
    type: 'SetVariable',
    label: 'Set',
    labelRu: 'Установить',
    icon: 'variable',
    category: 'variable',
    headerColor: '#4CAF50',
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' },
      { id: 'value-in', name: 'Значение', dataType: 'any', direction: 'input' }
    ],
    outputs: [
      { id: 'exec-out', name: '', dataType: 'execution', direction: 'output' },
      { id: 'value-out', name: 'Значение', dataType: 'any', direction: 'output' }
    ],
  },
  TypeConversion: {
    type: 'TypeConversion',
    label: 'Type Conversion',
    labelRu: 'Преобразование типа',
    icon: 'variable',
    category: 'other',
    headerColor: '#607D8B',
    inputs: [
      { id: 'value-in', name: 'In', nameRu: 'Вход', dataType: 'any', direction: 'input' }
    ],
    outputs: [
      { id: 'value-out', name: 'Out', nameRu: 'Выход', dataType: 'any', direction: 'output' }
    ],
  },
  
  // === Math ===
  ConstNumber: {
    type: 'ConstNumber',
    label: 'Number',
    labelRu: 'Число',
    icon: 'math',
    category: 'math',
    description: 'Numeric constant',
    descriptionRu: 'Числовая константа',
    headerColor: '#4CAF50',
    inputs: [],
    outputs: [
      { id: 'result', name: 'Value', nameRu: 'Значение', dataType: 'double', direction: 'output', defaultValue: 0 }
    ],
  },
  ConstString: {
    type: 'ConstString',
    label: 'String',
    labelRu: 'Строка',
    icon: 'math',
    category: 'math',
    description: 'String constant',
    descriptionRu: 'Строковая константа',
    headerColor: '#4CAF50',
    inputs: [],
    outputs: [
      { id: 'result', name: 'Value', nameRu: 'Значение', dataType: 'string', direction: 'output', defaultValue: '' }
    ],
  },
  ConstBool: {
    type: 'ConstBool',
    label: 'Boolean',
    labelRu: 'Логическое',
    icon: 'math',
    category: 'math',
    description: 'Boolean constant',
    descriptionRu: 'Логическая константа',
    headerColor: '#4CAF50',
    inputs: [],
    outputs: [
      { id: 'result', name: 'Value', nameRu: 'Значение', dataType: 'bool', direction: 'output', defaultValue: false }
    ],
  },
  Add: {
    type: 'Add',
    label: 'Add',
    labelRu: 'Сложение',
    icon: 'math',
    category: 'math',
    headerColor: '#4CAF50',
    inputs: [
      { id: 'a', name: 'A', nameRu: 'A', dataType: 'float', direction: 'input', defaultValue: 0 },
      { id: 'b', name: 'B', nameRu: 'B', dataType: 'float', direction: 'input', defaultValue: 0 }
    ],
    outputs: [
      { id: 'result', name: 'Result', nameRu: 'Результат', dataType: 'float', direction: 'output' }
    ],
  },
  Subtract: {
    type: 'Subtract',
    label: 'Subtract',
    labelRu: 'Вычитание',
    icon: 'math',
    category: 'math',
    headerColor: '#4CAF50',
    inputs: [
      { id: 'a', name: 'A', nameRu: 'A', dataType: 'float', direction: 'input', defaultValue: 0 },
      { id: 'b', name: 'B', nameRu: 'B', dataType: 'float', direction: 'input', defaultValue: 0 }
    ],
    outputs: [
      { id: 'result', name: 'Result', nameRu: 'Результат', dataType: 'float', direction: 'output' }
    ],
  },
  Multiply: {
    type: 'Multiply',
    label: 'Multiply',
    labelRu: 'Умножение',
    icon: 'math',
    category: 'math',
    headerColor: '#4CAF50',
    inputs: [
      { id: 'a', name: 'A', nameRu: 'A', dataType: 'float', direction: 'input', defaultValue: 0 },
      { id: 'b', name: 'B', nameRu: 'B', dataType: 'float', direction: 'input', defaultValue: 0 }
    ],
    outputs: [
      { id: 'result', name: 'Result', nameRu: 'Результат', dataType: 'float', direction: 'output' }
    ],
  },
  Divide: {
    type: 'Divide',
    label: 'Divide',
    labelRu: 'Деление',
    icon: 'math',
    category: 'math',
    headerColor: '#4CAF50',
    inputs: [
      { id: 'a', name: 'A', nameRu: 'A', dataType: 'float', direction: 'input', defaultValue: 0 },
      { id: 'b', name: 'B', nameRu: 'B', dataType: 'float', direction: 'input', defaultValue: 1 }
    ],
    outputs: [
      { id: 'result', name: 'Result', nameRu: 'Результат', dataType: 'float', direction: 'output' }
    ],
  },
  Modulo: {
    type: 'Modulo',
    label: 'Modulo',
    labelRu: 'Остаток',
    category: 'math',
    headerColor: '#4CAF50',
    inputs: [
      { id: 'a', name: 'A', nameRu: 'A', dataType: 'int32', direction: 'input', defaultValue: 0 },
      { id: 'b', name: 'B', nameRu: 'B', dataType: 'int32', direction: 'input', defaultValue: 1 }
    ],
    outputs: [
      { id: 'result', name: 'Result', nameRu: 'Результат', dataType: 'int32', direction: 'output' }
    ],
  },
  
  // === Comparison ===
  Equal: {
    type: 'Equal',
    label: '==',
    labelRu: 'Равно',
    icon: 'comparison',
    category: 'comparison',
    headerColor: '#4CAF50',
    inputs: [
      { id: 'a', name: 'A', nameRu: 'A', dataType: 'any', direction: 'input' },
      { id: 'b', name: 'B', nameRu: 'B', dataType: 'any', direction: 'input' }
    ],
    outputs: [
      { id: 'result', name: 'Result', nameRu: 'Результат', dataType: 'bool', direction: 'output' }
    ],
  },
  NotEqual: {
    type: 'NotEqual',
    label: '!=',
    labelRu: 'Не равно',
    icon: 'comparison',
    category: 'comparison',
    headerColor: '#4CAF50',
    inputs: [
      { id: 'a', name: 'A', nameRu: 'A', dataType: 'any', direction: 'input' },
      { id: 'b', name: 'B', nameRu: 'B', dataType: 'any', direction: 'input' }
    ],
    outputs: [
      { id: 'result', name: 'Result', nameRu: 'Результат', dataType: 'bool', direction: 'output' }
    ],
  },
  Greater: {
    type: 'Greater',
    label: '>',
    labelRu: 'Больше',
    category: 'comparison',
    headerColor: '#4CAF50',
    inputs: [
      { id: 'a', name: 'A', nameRu: 'A', dataType: 'float', direction: 'input' },
      { id: 'b', name: 'B', nameRu: 'B', dataType: 'float', direction: 'input' }
    ],
    outputs: [
      { id: 'result', name: 'Result', nameRu: 'Результат', dataType: 'bool', direction: 'output' }
    ],
  },
  Less: {
    type: 'Less',
    label: '<',
    labelRu: 'Меньше',
    category: 'comparison',
    headerColor: '#4CAF50',
    inputs: [
      { id: 'a', name: 'A', nameRu: 'A', dataType: 'float', direction: 'input' },
      { id: 'b', name: 'B', nameRu: 'B', dataType: 'float', direction: 'input' }
    ],
    outputs: [
      { id: 'result', name: 'Result', nameRu: 'Результат', dataType: 'bool', direction: 'output' }
    ],
  },
  GreaterEqual: {
    type: 'GreaterEqual',
    label: '>=',
    labelRu: 'Больше или равно',
    category: 'comparison',
    headerColor: '#4CAF50',
    inputs: [
      { id: 'a', name: 'A', nameRu: 'A', dataType: 'float', direction: 'input' },
      { id: 'b', name: 'B', nameRu: 'B', dataType: 'float', direction: 'input' }
    ],
    outputs: [
      { id: 'result', name: 'Result', nameRu: 'Результат', dataType: 'bool', direction: 'output' }
    ],
  },
  LessEqual: {
    type: 'LessEqual',
    label: '<=',
    labelRu: 'Меньше или равно',
    category: 'comparison',
    headerColor: '#4CAF50',
    inputs: [
      { id: 'a', name: 'A', nameRu: 'A', dataType: 'float', direction: 'input' },
      { id: 'b', name: 'B', nameRu: 'B', dataType: 'float', direction: 'input' }
    ],
    outputs: [
      { id: 'result', name: 'Result', nameRu: 'Результат', dataType: 'bool', direction: 'output' }
    ],
  },
  
  // === Logic ===
  And: {
    type: 'And',
    label: 'AND',
    labelRu: 'И',
    icon: 'logic',
    category: 'logic',
    headerColor: '#E53935',
    inputs: [
      { id: 'a', name: 'A', nameRu: 'A', dataType: 'bool', direction: 'input' },
      { id: 'b', name: 'B', nameRu: 'B', dataType: 'bool', direction: 'input' }
    ],
    outputs: [
      { id: 'result', name: 'Result', nameRu: 'Результат', dataType: 'bool', direction: 'output' }
    ],
  },
  Or: {
    type: 'Or',
    label: 'OR',
    labelRu: 'ИЛИ',
    icon: 'logic',
    category: 'logic',
    headerColor: '#E53935',
    inputs: [
      { id: 'a', name: 'A', nameRu: 'A', dataType: 'bool', direction: 'input' },
      { id: 'b', name: 'B', nameRu: 'B', dataType: 'bool', direction: 'input' }
    ],
    outputs: [
      { id: 'result', name: 'Result', nameRu: 'Результат', dataType: 'bool', direction: 'output' }
    ],
  },
  Not: {
    type: 'Not',
    label: 'NOT',
    labelRu: 'НЕ',
    icon: 'logic',
    category: 'logic',
    headerColor: '#E53935',
    inputs: [
      { id: 'a', name: '', dataType: 'bool', direction: 'input' }
    ],
    outputs: [
      { id: 'result', name: '', dataType: 'bool', direction: 'output' }
    ],
  },
  
  // === I/O ===
  Print: {
    type: 'Print',
    label: 'Print',
    labelRu: 'Вывод',
    icon: 'io',
    category: 'io',
    description: 'Print value to console',
    descriptionRu: 'Вывести значение в консоль',
    headerColor: '#00BCD4',
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' },
      { id: 'string', name: 'Value', nameRu: 'Значение', dataType: 'any', direction: 'input', defaultValue: '' }
    ],
    outputs: [
      { id: 'exec-out', name: '', dataType: 'execution', direction: 'output' }
    ],
  },
  Input: {
    type: 'Input',
    label: 'Read Input',
    labelRu: 'Ввод',
    icon: 'io',
    category: 'io',
    description: 'Read text from console',
    descriptionRu: 'Считать текст из консоли',
    headerColor: '#00BCD4',
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' },
      { id: 'prompt', name: 'Prompt', nameRu: 'Приглашение', dataType: 'string', direction: 'input', defaultValue: '' }
    ],
    outputs: [
      { id: 'exec-out', name: '', dataType: 'execution', direction: 'output' },
      { id: 'value', name: 'Value', nameRu: 'Значение', dataType: 'string', direction: 'output' }
    ],
  },
  
  // === Comments & Organization ===
  Comment: {
    type: 'Comment',
    label: 'Comment',
    labelRu: 'Комментарий',
    icon: 'other',
    category: 'other',
    headerColor: '#455A64',
    inputs: [],
    outputs: [],
  },
  Reroute: {
    type: 'Reroute',
    label: 'Reroute',
    labelRu: 'Перенаправление',
    icon: 'other',
    category: 'other',
    headerColor: '#9E9E9E',
    inputs: [
      { id: 'in', name: '', dataType: 'any', direction: 'input' }
    ],
    outputs: [
      { id: 'out', name: '', dataType: 'any', direction: 'output' }
    ],
  },
  
  // === Custom ===
  Custom: {
    type: 'Custom',
    label: 'Custom Node',
    labelRu: 'Пользовательский',
    icon: 'other',
    category: 'other',
    headerColor: '#9C27B0',
    dynamicPorts: true,
    inputs: [],
    outputs: [],
  },
};

/** Получить узлы по категории */
export function getNodesByCategory(category: NodeTypeDefinition['category']): NodeTypeDefinition[] {
  return Object.values(NODE_TYPE_DEFINITIONS).filter(def => def.category === category);
}

/** Все категории с локализацией */
export const NODE_CATEGORIES: { id: NodeTypeDefinition['category']; label: string; labelRu: string }[] = [
  { id: 'flow', label: 'Flow Control', labelRu: 'Управление потоком' },
  { id: 'function', label: 'Functions', labelRu: 'Функции' },
  { id: 'variable', label: 'Variables', labelRu: 'Переменные' },
  { id: 'math', label: 'Math', labelRu: 'Математика' },
  { id: 'comparison', label: 'Comparison', labelRu: 'Сравнение' },
  { id: 'logic', label: 'Logic', labelRu: 'Логика' },
  { id: 'io', label: 'Input/Output', labelRu: 'Ввод/Вывод' },
  { id: 'other', label: 'Other', labelRu: 'Прочее' },
];

/** Создать новый узел по переданному определению (built-in или package) */
export function createNodeFromDefinition(
  definition: NodeTypeDefinition,
  position: { x: number; y: number },
  id?: string
): BlueprintNode {
  const nodeId = id ?? `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  return {
    id: nodeId,
    // label задаётся пустым: runtime выберет локализованное название из definition
    label: '',
    type: definition.type,
    position,
    inputs: definition.inputs.map((port, index) => ({
      ...port,
      id: `${nodeId}-${port.id}`,
      index,
      connected: false,
    })),
    outputs: definition.outputs.map((port, index) => ({
      ...port,
      id: `${nodeId}-${port.id}`,
      index,
      connected: false,
    })),
  };
}

/** Создать новый узел по типу */
export function createNode(
  type: BlueprintNodeType,
  position: { x: number; y: number },
  id?: string
): BlueprintNode {
  const definition = NODE_TYPE_DEFINITIONS[type];
  return createNodeFromDefinition(definition, position, id);
}

/** Создать связь между портами */
export function createEdge(
  sourceNode: string,
  sourcePort: string,
  targetNode: string,
  targetPort: string,
  dataType: PortDataType = 'execution'
): BlueprintEdge {
  return {
    id: `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    sourceNode,
    sourcePort,
    targetNode,
    targetPort,
    kind: dataType === 'execution' ? 'execution' : 'data',
    dataType,
  };
}

/** Создать граф по умолчанию */
export function createDefaultBlueprintState(): BlueprintGraphState {
  const startNode = createNode('Start', { x: 100, y: 200 }, 'node-start');
  const printNode = createNode('Print', { x: 400, y: 200 }, 'node-print');
  const endNode = createNode('End', { x: 700, y: 200 }, 'node-end');
  
  return {
    id: `graph-${Date.now()}`,
    name: 'Новый граф',
    language: 'cpp',
    displayLanguage: 'ru',
    nodes: [startNode, printNode, endNode],
    edges: [
      createEdge('node-start', 'node-start-exec-out', 'node-print', 'node-print-exec-in'),
      createEdge('node-print', 'node-print-exec-out', 'node-end', 'node-end-exec-in'),
    ],
    updatedAt: new Date().toISOString(),
    dirty: false,
  };
}

/** Преобразовать Blueprint формат обратно в старый GraphState (для совместимости) */
export function migrateFromBlueprintFormat(blueprintState: BlueprintGraphState): GraphState {
  const nodes: GraphNode[] = blueprintState.nodes.map(node => ({
    id: node.id,
    label: node.label,
    type: mapBlueprintNodeTypeToOld(node.type),
    position: node.position,
    blueprintNode: node,
  }));

  const edges: GraphEdge[] = blueprintState.edges.map(edge => ({
    id: edge.id,
    source: edge.sourceNode,
    target: edge.targetNode,
    label: edge.kind === 'execution' ? 'flow' : 'data',
    kind: edge.kind,
    blueprintEdge: edge,
  }));

  return {
    id: blueprintState.id,
    name: blueprintState.name,
    language: blueprintState.language,
    displayLanguage: blueprintState.displayLanguage,
    nodes,
    edges,
    updatedAt: blueprintState.updatedAt,
    dirty: blueprintState.dirty,
    // Сохраняем переменные и функции
    variables: blueprintState.variables,
    functions: blueprintState.functions,
  };
}

function mapBlueprintNodeTypeToOld(type: BlueprintNodeType): GraphNode['type'] {
  // Маппинг расширенных типов на базовые
  const functionTypes: BlueprintNodeType[] = ['Function', 'FunctionCall', 'Event', 'FunctionEntry', 'FunctionReturn', 'CallUserFunction'];
  const variableTypes: BlueprintNodeType[] = ['Variable', 'GetVariable', 'SetVariable'];
  
  if (type === 'Start') return 'Start';
  if (type === 'End' || type === 'Return') return 'End';
  if (functionTypes.includes(type)) return 'Function';
  if (variableTypes.includes(type)) return 'Variable';
  return 'Custom';
}

// ============================================
// Утилиты для работы с пользовательскими функциями
// ============================================

/** Генерировать уникальный ID */
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/** Создать пустую пользовательскую функцию */
export function createUserFunction(
  name: string,
  nameRu: string,
  description?: string
): BlueprintFunction {
  const funcId = generateId('func');
  const entryNodeId = `${funcId}-entry`;
  const returnNodeId = `${funcId}-return`;
  
  // Создаём узел FunctionEntry
  const entryNode: BlueprintNode = {
    id: entryNodeId,
    label: `${name}`,
    type: 'FunctionEntry',
    position: { x: 100, y: 200 },
    inputs: [],
    outputs: [
      {
        id: `${entryNodeId}-exec-out`,
        name: '',
        dataType: 'execution',
        direction: 'output',
        index: 0,
        connected: false,
      }
    ],
    properties: {
      functionId: funcId,
    },
  };
  
  // Создаём узел FunctionReturn
  const returnNode: BlueprintNode = {
    id: returnNodeId,
    label: 'Return',
    type: 'FunctionReturn',
    position: { x: 500, y: 200 },
    inputs: [
      {
        id: `${returnNodeId}-exec-in`,
        name: '',
        dataType: 'execution',
        direction: 'input',
        index: 0,
        connected: false,
      }
    ],
    outputs: [],
    properties: {
      functionId: funcId,
    },
  };
  
  const now = new Date().toISOString();
  
  return {
    id: funcId,
    name,
    nameRu,
    description,
    parameters: [],
    variables: [],
    graph: {
      nodes: [entryNode, returnNode],
      edges: [
        createEdge(entryNodeId, `${entryNodeId}-exec-out`, returnNodeId, `${returnNodeId}-exec-in`),
      ],
    },
    isPure: false,
    categoryColor: '#9C27B0',
    createdAt: now,
    updatedAt: now,
  };
}

/** Добавить входной параметр к функции */
export function addFunctionInputParameter(
  func: BlueprintFunction,
  name: string,
  nameRu: string,
  dataType: PortDataType,
  defaultValue?: string | number | boolean
): BlueprintFunction {
  const paramId = generateId('param');
  const newParam: FunctionParameter = {
    id: paramId,
    name,
    nameRu,
    dataType,
    direction: 'input',
    defaultValue,
  };
  
  // Добавляем параметр
  const newParameters = [...func.parameters, newParam];
  
  // Находим узел FunctionEntry и добавляем выходной порт
  const entryNode = func.graph.nodes.find(n => n.type === 'FunctionEntry');
  if (entryNode) {
    const portIndex = entryNode.outputs.length;
    entryNode.outputs.push({
      id: `${entryNode.id}-${paramId}`,
      name,
      nameRu: nameRu || name,
      dataType,
      direction: 'output',
      index: portIndex,
      connected: false,
    });
  }
  
  return {
    ...func,
    parameters: newParameters,
    updatedAt: new Date().toISOString(),
  };
}

/** Добавить выходной параметр к функции */
export function addFunctionOutputParameter(
  func: BlueprintFunction,
  name: string,
  nameRu: string,
  dataType: PortDataType
): BlueprintFunction {
  const paramId = generateId('param');
  const newParam: FunctionParameter = {
    id: paramId,
    name,
    nameRu,
    dataType,
    direction: 'output',
  };
  
  // Добавляем параметр
  const newParameters = [...func.parameters, newParam];
  
  // Находим узел FunctionReturn и добавляем входной порт
  const returnNode = func.graph.nodes.find(n => n.type === 'FunctionReturn');
  if (returnNode) {
    const portIndex = returnNode.inputs.length;
    returnNode.inputs.push({
      id: `${returnNode.id}-${paramId}`,
      name,
      nameRu: nameRu || name,
      dataType,
      direction: 'input',
      index: portIndex,
      connected: false,
    });
  }
  
  return {
    ...func,
    parameters: newParameters,
    updatedAt: new Date().toISOString(),
  };
}

/** Удалить параметр из функции */
export function removeFunctionParameter(
  func: BlueprintFunction,
  paramId: string
): BlueprintFunction {
  const param = func.parameters.find(p => p.id === paramId);
  if (!param) return func;
  
  const newParameters = func.parameters.filter(p => p.id !== paramId);
  
  // Удаляем соответствующий порт из узла
  const nodeType = param.direction === 'input' ? 'FunctionEntry' : 'FunctionReturn';
  const targetNode = func.graph.nodes.find(n => n.type === nodeType);
  
  if (targetNode) {
    if (param.direction === 'input') {
      targetNode.outputs = targetNode.outputs.filter(p => !p.id.includes(paramId));
      // Пересчитываем индексы
      targetNode.outputs.forEach((p, i) => { p.index = i; });
    } else {
      targetNode.inputs = targetNode.inputs.filter(p => !p.id.includes(paramId));
      targetNode.inputs.forEach((p, i) => { p.index = i; });
    }
    
    // Удаляем связи, которые использовали этот порт
    const updatedEdges = func.graph.edges.filter(e => {
      const portId = `${targetNode.id}-${paramId}`;
      return e.sourcePort !== portId && e.targetPort !== portId;
    });
    func.graph.edges = updatedEdges;
  }
  
  return {
    ...func,
    parameters: newParameters,
    updatedAt: new Date().toISOString(),
  };
}

/** Создать узел вызова пользовательской функции */
export function createCallUserFunctionNode(
  func: BlueprintFunction,
  position: { x: number; y: number },
  nodeId?: string
): BlueprintNode {
  const resolvedNodeId = nodeId ?? generateId('call');
  
  // Собираем входные порты (exec + input params)
  const inputs: NodePort[] = [
    {
      id: `${resolvedNodeId}-exec-in`,
      name: '',
      dataType: 'execution',
      direction: 'input',
      index: 0,
      connected: false,
    },
    ...func.parameters
      .filter(p => p.direction === 'input')
      .map((p, i) => ({
        id: `${resolvedNodeId}-${p.id}`,
        name: p.name,
        nameRu: p.nameRu || p.name,
        dataType: p.dataType,
        direction: 'input' as const,
        index: i + 1,
        connected: false,
        defaultValue: p.defaultValue,
      })),
  ];
  
  // Собираем выходные порты (exec + output params)
  const outputs: NodePort[] = [
    {
      id: `${resolvedNodeId}-exec-out`,
      name: '',
      dataType: 'execution',
      direction: 'output',
      index: 0,
      connected: false,
    },
    ...func.parameters
      .filter(p => p.direction === 'output')
      .map((p, i) => ({
        id: `${resolvedNodeId}-${p.id}`,
        name: p.name,
        nameRu: p.nameRu || p.name,
        dataType: p.dataType,
        direction: 'output' as const,
        index: i + 1,
        connected: false,
      })),
  ];
  
  return {
    id: resolvedNodeId,
    label: func.nameRu || func.name,
    type: 'CallUserFunction',
    position,
    inputs,
    outputs,
    properties: {
      functionId: func.id,
      functionName: func.name,
    },
  };
}

/** Обновить все узлы вызова функции при изменении её сигнатуры */
export function updateCallNodesForFunction(
  graphState: BlueprintGraphState,
  func: BlueprintFunction
): BlueprintGraphState {
  const updatedNodes = graphState.nodes.map(node => {
    if (node.type === 'CallUserFunction' && node.properties?.functionId === func.id) {
      // Пересоздаём узел с обновлённой сигнатурой
      const newNode = createCallUserFunctionNode(func, node.position, node.id);
      // Сохраняем подключения где возможно
      newNode.inputs.forEach(newPort => {
        const oldPort = node.inputs.find(p => p.id === newPort.id);
        if (oldPort) {
          newPort.connected = oldPort.connected;
          newPort.value = oldPort.value;
        }
      });
      newNode.outputs.forEach(newPort => {
        const oldPort = node.outputs.find(p => p.id === newPort.id);
        if (oldPort) {
          newPort.connected = oldPort.connected;
        }
      });
      return newNode;
    }
    return node;
  });
  
  return {
    ...graphState,
    nodes: updatedNodes,
  };
}

/** Получить функцию по ID */
export function getFunctionById(
  graphState: BlueprintGraphState,
  functionId: string
): BlueprintFunction | undefined {
  return graphState.functions?.find(f => f.id === functionId);
}

/** Получить текущий редактируемый граф (основной или функция) */
export function getActiveGraph(
  graphState: BlueprintGraphState
): { nodes: BlueprintNode[]; edges: BlueprintEdge[] } {
  if (graphState.activeFunctionId) {
    const func = getFunctionById(graphState, graphState.activeFunctionId);
    if (func) {
      return func.graph;
    }
  }
  return { nodes: graphState.nodes, edges: graphState.edges };
}

/** Установить активный граф (основной или функция) */
export function setActiveGraph(
  graphState: BlueprintGraphState,
  functionId: string | null
): BlueprintGraphState {
  return {
    ...graphState,
    activeFunctionId: functionId,
  };
}
