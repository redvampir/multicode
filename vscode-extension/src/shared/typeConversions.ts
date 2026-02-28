import type { PortDataType } from './portTypes';

export type TypeConversionId =
  | 'int32_to_int64'
  | 'int32_to_float'
  | 'int32_to_double'
  | 'int64_to_int32'
  | 'int64_to_float'
  | 'int64_to_double'
  | 'float_to_int32'
  | 'float_to_int64'
  | 'float_to_double'
  | 'double_to_int32'
  | 'double_to_int64'
  | 'double_to_float'
  | 'int32_to_string'
  | 'int64_to_string'
  | 'float_to_string'
  | 'double_to_string'
  | 'string_to_int32'
  | 'string_to_int64'
  | 'string_to_float'
  | 'string_to_double'
  | 'bool_to_string'
  | 'string_to_bool'
  | 'bool_to_int32'
  | 'bool_to_int64'
  | 'bool_to_float'
  | 'bool_to_double'
  | 'int32_to_bool'
  | 'int64_to_bool'
  | 'float_to_bool'
  | 'double_to_bool'
  | 'pointer_to_bool'
  | 'pointer_to_string'
  | 'class_to_string'
  | 'vector_to_string'
  | 'string_to_vector'
  | 'array_to_string'
  | 'string_to_array';

export type TypeConversionStage = 1 | 2 | 3 | 4;

export type TypeConversionStrategy = 'template' | 'helper';

export type TypeConversionHelperId =
  | 'parse_bool_strict'
  | 'pointer_truthy'
  | 'pointer_to_string'
  | 'class_to_string'
  | 'vector_to_string'
  | 'parse_vector_strict'
  | 'array_to_string'
  | 'parse_array_strict';

export interface TypeConversionRule {
  id: TypeConversionId;
  sourceType: PortDataType;
  targetType: PortDataType;
  stage: TypeConversionStage;
  strategy: TypeConversionStrategy;
  sourceLabel: string;
  targetLabel: string;
  labelRu: string;
  labelEn: string;
  cppTemplate?: string;
  helperId?: TypeConversionHelperId;
  requiresMeta?: boolean;
}

const createLabelRu = (sourceLabel: string, targetLabel: string): string =>
  `Преобразовать: ${sourceLabel} → ${targetLabel}`;

const createLabelEn = (sourceLabel: string, targetLabel: string): string =>
  `Convert: ${sourceLabel} -> ${targetLabel}`;

const NUMERIC_TYPES: ReadonlyArray<PortDataType> = ['int32', 'int64', 'float', 'double'];

const TYPE_LABELS_FOR_CONVERSION: Record<PortDataType, string> = {
  execution: 'Execution',
  bool: 'Bool',
  int32: 'Int32',
  int64: 'Int64',
  float: 'Float',
  double: 'Double',
  string: 'String',
  vector: 'Vector',
  pointer: 'Pointer',
  class: 'Class',
  array: 'Array',
  any: 'Any',
};

const CPP_CAST_TYPES: Record<PortDataType, string> = {
  execution: 'void',
  bool: 'bool',
  int32: 'int',
  int64: 'long long',
  float: 'float',
  double: 'double',
  string: 'std::string',
  vector: 'auto',
  pointer: 'auto',
  class: 'auto',
  array: 'auto',
  any: 'auto',
};

const toConversionLabel = (type: PortDataType): string =>
  TYPE_LABELS_FOR_CONVERSION[type] ?? type;

const createTemplateRule = (
  stage: TypeConversionStage,
  sourceType: PortDataType,
  targetType: PortDataType,
  cppTemplate: string
): TypeConversionRule => {
  const sourceLabel = toConversionLabel(sourceType);
  const targetLabel = toConversionLabel(targetType);
  return {
    id: `${sourceType}_to_${targetType}` as TypeConversionId,
    sourceType,
    targetType,
    stage,
    strategy: 'template',
    sourceLabel,
    targetLabel,
    labelRu: createLabelRu(sourceLabel, targetLabel),
    labelEn: createLabelEn(sourceLabel, targetLabel),
    cppTemplate,
  };
};

const createHelperRule = (
  stage: TypeConversionStage,
  sourceType: PortDataType,
  targetType: PortDataType,
  helperId: TypeConversionHelperId,
  options?: { requiresMeta?: boolean }
): TypeConversionRule => {
  const sourceLabel = toConversionLabel(sourceType);
  const targetLabel = toConversionLabel(targetType);
  return {
    id: `${sourceType}_to_${targetType}` as TypeConversionId,
    sourceType,
    targetType,
    stage,
    strategy: 'helper',
    sourceLabel,
    targetLabel,
    labelRu: createLabelRu(sourceLabel, targetLabel),
    labelEn: createLabelEn(sourceLabel, targetLabel),
    helperId,
    requiresMeta: options?.requiresMeta === true,
  };
};

const STAGE_1_RULES: TypeConversionRule[] = [];
for (const sourceType of NUMERIC_TYPES) {
  for (const targetType of NUMERIC_TYPES) {
    if (sourceType === targetType) {
      continue;
    }
    STAGE_1_RULES.push(
      createTemplateRule(
        1,
        sourceType,
        targetType,
        `static_cast<${CPP_CAST_TYPES[targetType]}>({value})`
      )
    );
  }
}

const STAGE_2_RULES: TypeConversionRule[] = [
  createTemplateRule(2, 'int32', 'string', 'std::to_string({value})'),
  createTemplateRule(2, 'int64', 'string', 'std::to_string({value})'),
  createTemplateRule(2, 'float', 'string', 'std::to_string({value})'),
  createTemplateRule(2, 'double', 'string', 'std::to_string({value})'),
  createTemplateRule(2, 'string', 'int32', 'std::stoi({value})'),
  createTemplateRule(2, 'string', 'int64', 'std::stoll({value})'),
  createTemplateRule(2, 'string', 'float', 'std::stof({value})'),
  createTemplateRule(2, 'string', 'double', 'std::stod({value})'),
];

const STAGE_3_RULES: TypeConversionRule[] = [
  createTemplateRule(3, 'bool', 'string', 'std::string(({value}) ? "true" : "false")'),
  createHelperRule(3, 'string', 'bool', 'parse_bool_strict'),
  createTemplateRule(3, 'bool', 'int32', 'static_cast<int>({value})'),
  createTemplateRule(3, 'bool', 'int64', 'static_cast<long long>({value})'),
  createTemplateRule(3, 'bool', 'float', 'static_cast<float>({value})'),
  createTemplateRule(3, 'bool', 'double', 'static_cast<double>({value})'),
  createTemplateRule(3, 'int32', 'bool', 'static_cast<bool>({value})'),
  createTemplateRule(3, 'int64', 'bool', 'static_cast<bool>({value})'),
  createTemplateRule(3, 'float', 'bool', 'static_cast<bool>({value})'),
  createTemplateRule(3, 'double', 'bool', 'static_cast<bool>({value})'),
];

const STAGE_4_RULES: TypeConversionRule[] = [
  createHelperRule(4, 'pointer', 'bool', 'pointer_truthy'),
  createHelperRule(4, 'pointer', 'string', 'pointer_to_string'),
  createHelperRule(4, 'class', 'string', 'class_to_string'),
  createHelperRule(4, 'vector', 'string', 'vector_to_string'),
  createHelperRule(4, 'string', 'vector', 'parse_vector_strict', { requiresMeta: true }),
  createHelperRule(4, 'array', 'string', 'array_to_string'),
  createHelperRule(4, 'string', 'array', 'parse_array_strict', { requiresMeta: true }),
];

const RULES: TypeConversionRule[] = [
  ...STAGE_1_RULES,
  ...STAGE_2_RULES,
  ...STAGE_3_RULES,
  ...STAGE_4_RULES,
];

export const TYPE_CONVERSION_RULES: ReadonlyArray<TypeConversionRule> = RULES;

export const TYPE_CONVERSION_RULES_BY_STAGE: Readonly<Record<TypeConversionStage, ReadonlyArray<TypeConversionRule>>> = {
  1: TYPE_CONVERSION_RULES.filter((rule) => rule.stage === 1),
  2: TYPE_CONVERSION_RULES.filter((rule) => rule.stage === 2),
  3: TYPE_CONVERSION_RULES.filter((rule) => rule.stage === 3),
  4: TYPE_CONVERSION_RULES.filter((rule) => rule.stage === 4),
};

const RULE_BY_ID = new Map<string, TypeConversionRule>(
  TYPE_CONVERSION_RULES.map((rule) => [rule.id, rule])
);

const RULE_BY_PAIR = new Map<string, TypeConversionRule>(
  TYPE_CONVERSION_RULES.map((rule) => [`${rule.sourceType}->${rule.targetType}`, rule])
);

const TYPE_LABELS: Record<PortDataType, { ru: string; en: string }> = {
  execution: { ru: 'execution', en: 'execution' },
  bool: { ru: 'bool', en: 'bool' },
  int32: { ru: 'int32', en: 'int32' },
  int64: { ru: 'int64', en: 'int64' },
  float: { ru: 'float', en: 'float' },
  double: { ru: 'double', en: 'double' },
  string: { ru: 'string', en: 'string' },
  vector: { ru: 'vector', en: 'vector' },
  pointer: { ru: 'pointer', en: 'pointer' },
  class: { ru: 'class', en: 'class' },
  array: { ru: 'array', en: 'array' },
  any: { ru: 'any', en: 'any' },
};

export const getTypeLabelForMessage = (
  type: PortDataType,
  locale: 'ru' | 'en'
): string => TYPE_LABELS[type][locale];

export const findTypeConversionRule = (
  sourceType: PortDataType,
  targetType: PortDataType
): TypeConversionRule | null =>
  RULE_BY_PAIR.get(`${sourceType}->${targetType}`) ?? null;

export const findTypeConversionRuleById = (id: string): TypeConversionRule | null =>
  RULE_BY_ID.get(id) ?? null;

export const canDirectlyConnectDataPorts = (
  sourceType: PortDataType,
  targetType: PortDataType
): boolean => {
  if (sourceType === 'execution' || targetType === 'execution') {
    return false;
  }

  if (sourceType === targetType) {
    return true;
  }

  return sourceType === 'any' || targetType === 'any';
};

export const formatTypeConversionLabel = (
  rule: TypeConversionRule,
  locale: 'ru' | 'en'
): string => (locale === 'ru' ? rule.labelRu : rule.labelEn);

export const applyTypeConversionTemplate = (
  rule: TypeConversionRule,
  expression: string
): string => {
  if (rule.strategy !== 'template' || !rule.cppTemplate) {
    return expression;
  }
  return rule.cppTemplate.replace('{value}', expression);
};



export interface DataPortTypeDescriptor {
  dataType: PortDataType;
  typeName?: string;
  classId?: string;
  targetClassId?: string;
}

export interface DataPortCompatibilityResult {
  compatible: boolean;
  reason: 'ok' | 'base-type-mismatch' | 'class-mismatch';
}

const normalizeTypeIdentity = (value: string | undefined): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const resolveClassIdentity = (port: DataPortTypeDescriptor): string | undefined => {
  if (port.dataType === 'class') {
    return normalizeTypeIdentity(port.classId) ?? normalizeTypeIdentity(port.typeName);
  }
  if (port.dataType === 'pointer') {
    return normalizeTypeIdentity(port.targetClassId) ?? normalizeTypeIdentity(port.typeName);
  }
  return undefined;
};

export const validateDataPortCompatibility = (
  sourcePort: DataPortTypeDescriptor,
  targetPort: DataPortTypeDescriptor
): DataPortCompatibilityResult => {
  const directCompatible = canDirectlyConnectDataPorts(sourcePort.dataType, targetPort.dataType);
  if (!directCompatible) {
    return { compatible: false, reason: 'base-type-mismatch' };
  }

  const involvesClassData =
    sourcePort.dataType === 'class' ||
    sourcePort.dataType === 'pointer' ||
    targetPort.dataType === 'class' ||
    targetPort.dataType === 'pointer';

  if (!involvesClassData) {
    return { compatible: true, reason: 'ok' };
  }

  const sourceClassIdentity = resolveClassIdentity(sourcePort);
  const targetClassIdentity = resolveClassIdentity(targetPort);

  // Миграционный fallback: если идентификаторы типа ещё не сохранены, пропускаем как совместимые.
  if (!sourceClassIdentity || !targetClassIdentity) {
    return { compatible: true, reason: 'ok' };
  }

  if (sourceClassIdentity !== targetClassIdentity) {
    return { compatible: false, reason: 'class-mismatch' };
  }

  return { compatible: true, reason: 'ok' };
};

const getClassIdentityForMessage = (port: DataPortTypeDescriptor): string => {
  return resolveClassIdentity(port) ?? getTypeLabelForMessage(port.dataType, 'en');
};

export const formatIncompatiblePortMessage = (
  sourcePort: DataPortTypeDescriptor,
  targetPort: DataPortTypeDescriptor,
  locale: 'ru' | 'en'
): string => {
  const compatibility = validateDataPortCompatibility(sourcePort, targetPort);
  if (compatibility.reason === 'class-mismatch') {
    const sourceClass = getClassIdentityForMessage(sourcePort);
    const targetClass = getClassIdentityForMessage(targetPort);
    if (locale === 'ru') {
      return `Классы несовместимы: ${sourceClass} → ${targetClass}`;
    }
    return `Class types are incompatible: ${sourceClass} -> ${targetClass}`;
  }

  return formatIncompatibleTypeMessage(sourcePort.dataType, targetPort.dataType, locale);
};
export const formatIncompatibleTypeMessage = (
  sourceType: PortDataType,
  targetType: PortDataType,
  locale: 'ru' | 'en'
): string => {
  const sourceLabel = getTypeLabelForMessage(sourceType, locale);
  const targetLabel = getTypeLabelForMessage(targetType, locale);
  if (locale === 'ru') {
    return `Типы несовместимы: ${sourceLabel} → ${targetLabel}`;
  }
  return `Incompatible types: ${sourceLabel} -> ${targetLabel}`;
};
