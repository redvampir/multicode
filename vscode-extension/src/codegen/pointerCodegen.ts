import type {
  BlueprintVariable,
  PointerMeta,
  PointerPointeeDataType,
  VectorElementType,
} from '../shared/blueprintTypes';
import { normalizePointerMeta } from '../shared/blueprintTypes';
import { getCppType, getDefaultValue, toValidIdentifier } from './types';

interface DeclaredVariableInfo {
  codeName: string;
  cppType: string;
}

type DeclaredVariableLookup = ReadonlyMap<string, DeclaredVariableInfo>;

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

const toPointerPointeeType = (
  pointerMeta: PointerMeta
): string => {
  if (pointerMeta.pointeeDataType === 'vector') {
    const vectorElementType = isVectorElementType(pointerMeta.pointeeVectorElementType)
      ? pointerMeta.pointeeVectorElementType
      : 'double';
    return getCppType('vector', vectorElementType);
  }

  if (pointerMeta.pointeeDataType === 'class' || pointerMeta.pointeeDataType === 'array') {
    return 'void';
  }

  return getCppType(pointerMeta.pointeeDataType);
};

const toSafeIdentifier = (value: string, fallback: string): string => {
  const normalized = toValidIdentifier(value);
  if (normalized !== 'unnamed') {
    return normalized;
  }
  return toValidIdentifier(fallback);
};

const resolveVariableIdentifier = (
  variable: BlueprintVariable,
  allVariables: BlueprintVariable[],
  declaredVariables: DeclaredVariableLookup
): string => {
  const declaredById = declaredVariables.get(variable.id);
  if (declaredById) {
    return declaredById.codeName;
  }

  const lookupNames = [
    variable.id,
    variable.codeName,
    variable.name,
    variable.nameRu,
  ].filter((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0);

  for (const name of lookupNames) {
    const declared = declaredVariables.get(name);
    if (declared) {
      return declared.codeName;
    }
  }

  const safeFallback = `var_${variable.id.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  const preferred = variable.codeName ?? variable.name ?? variable.nameRu ?? safeFallback;
  return toSafeIdentifier(preferred, safeFallback);
};

const resolveTargetVariable = (
  pointerMeta: PointerMeta,
  allVariables: BlueprintVariable[]
): BlueprintVariable | undefined => {
  if (!pointerMeta.targetVariableId) {
    return undefined;
  }

  return allVariables.find((candidate) => candidate.id === pointerMeta.targetVariableId);
};

const escapeStringLiteral = (value: string): string =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');

const toNumericLiteral = (value: unknown, fallback: string): string => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.');
    if (normalized.length > 0 && Number.isFinite(Number(normalized))) {
      return normalized;
    }
  }
  return fallback;
};

const toVectorElementLiteral = (value: unknown, elementType: VectorElementType): string | null => {
  if (elementType === 'string') {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return `"${escapeStringLiteral(String(value))}"`;
    }
    return null;
  }

  if (elementType === 'bool') {
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
  }

  if (elementType === 'int32' || elementType === 'int64') {
    const literal = toNumericLiteral(value, 'NaN');
    const parsed = Number(literal);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      return null;
    }
    return String(parsed);
  }

  const literal = toNumericLiteral(value, 'NaN');
  return Number.isFinite(Number(literal)) ? literal : null;
};

const toVectorLiteral = (
  value: unknown,
  elementType: VectorElementType
): string => {
  if (!Array.isArray(value)) {
    return '{}';
  }

  const parts: string[] = [];
  for (const item of value) {
    const literal = toVectorElementLiteral(item, elementType);
    if (literal === null) {
      return '{}';
    }
    parts.push(literal);
  }

  return `{${parts.join(', ')}}`;
};

const toPointeeLiteral = (
  value: unknown,
  pointeeDataType: PointerPointeeDataType,
  pointeeVectorElementType?: VectorElementType
): string => {
  switch (pointeeDataType) {
    case 'bool':
      if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
      }
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
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
      return `"${escapeStringLiteral(String(value ?? ''))}"`;
    case 'vector': {
      const vectorElementType = isVectorElementType(pointeeVectorElementType)
        ? pointeeVectorElementType
        : 'double';
      return toVectorLiteral(value, vectorElementType);
    }
    case 'class':
    case 'array':
    default:
      return getDefaultValue('class');
  }
};

const resolveReferenceExpression = (
  targetVariable: BlueprintVariable | undefined,
  targetIdentifier: string | null,
  pointeeType: string
): string => {
  if (!targetIdentifier) {
    return `*static_cast<${pointeeType}*>(nullptr)`;
  }

  if (targetVariable?.dataType === 'pointer') {
    return `*${targetIdentifier}`;
  }

  return targetIdentifier;
};

export const resolvePointeeCppType = (
  pointerMeta: PointerMeta
): string => toPointerPointeeType(pointerMeta);

export const resolvePointerCppType = (
  variable: BlueprintVariable,
  _allVariables: BlueprintVariable[]
): string => {
  if (variable.dataType !== 'pointer') {
    return getCppType(variable.dataType, variable.vectorElementType);
  }

  if (!variable.pointerMeta) {
    return 'std::shared_ptr<void>';
  }

  const pointerMeta = normalizePointerMeta(variable.pointerMeta);
  const rawPointeeType = resolvePointeeCppType(pointerMeta);
  const pointeeType =
    (pointerMeta.mode === 'reference' || pointerMeta.mode === 'const_reference') && rawPointeeType === 'void'
      ? 'double'
      : rawPointeeType;

  switch (pointerMeta.mode) {
    case 'shared':
      return `std::shared_ptr<${pointeeType}>`;
    case 'unique':
      return `std::unique_ptr<${pointeeType}>`;
    case 'weak':
      return `std::weak_ptr<${pointeeType}>`;
    case 'raw':
      return `${pointeeType}*`;
    case 'reference':
      return `${pointeeType}&`;
    case 'const_reference':
      return `const ${pointeeType}&`;
    default:
      return 'std::shared_ptr<void>';
  }
};

export const resolvePointerInitializer = (
  variable: BlueprintVariable,
  allVariables: BlueprintVariable[],
  declaredVariables: DeclaredVariableLookup
): string => {
  if (variable.dataType !== 'pointer') {
    return getDefaultValue(variable.dataType);
  }

  if (!variable.pointerMeta) {
    return 'nullptr';
  }

  const pointerMeta = normalizePointerMeta(variable.pointerMeta);
  const pointeeType = resolvePointeeCppType(pointerMeta);
  const referencePointeeType = pointeeType === 'void' ? 'double' : pointeeType;
  const targetVariable = resolveTargetVariable(pointerMeta, allVariables);
  const targetIdentifier = targetVariable
    ? resolveVariableIdentifier(targetVariable, allVariables, declaredVariables)
    : null;
  const pointeeLiteral = toPointeeLiteral(
    variable.defaultValue,
    pointerMeta.pointeeDataType,
    pointerMeta.pointeeVectorElementType
  );

  switch (pointerMeta.mode) {
    case 'shared':
      if (pointeeType === 'void') {
        return 'nullptr';
      }
      if (targetIdentifier) {
        // Smart pointer остаётся smart: привязка к переменной трактуется как инициализация копией,
        // а не как alias на stack-переменную (это лучше соответствует ожиданию "умного" владения).
        const sourceExpression = targetVariable?.dataType === 'pointer'
          ? `*${targetIdentifier}`
          : targetIdentifier;
        return `std::make_shared<${pointeeType}>(${sourceExpression})`;
      }
      return `std::make_shared<${pointeeType}>(${pointeeLiteral})`;
    case 'unique':
      if (pointeeType === 'void') {
        return 'nullptr';
      }
      if (targetIdentifier) {
        const sourceExpression = targetVariable?.dataType === 'pointer'
          ? `*${targetIdentifier}`
          : targetIdentifier;
        return `std::make_unique<${pointeeType}>(${sourceExpression})`;
      }
      return `std::make_unique<${pointeeType}>(${pointeeLiteral})`;
    case 'weak':
      return targetIdentifier ?? '{}';
    case 'raw':
      if (!targetIdentifier) {
        return 'nullptr';
      }
      if (targetVariable?.dataType === 'pointer') {
        return `${targetIdentifier}.get()`;
      }
      return `&${targetIdentifier}`;
    case 'reference':
      return resolveReferenceExpression(targetVariable, targetIdentifier, referencePointeeType);
    case 'const_reference':
      return resolveReferenceExpression(targetVariable, targetIdentifier, referencePointeeType);
    default:
      return 'nullptr';
  }
};
