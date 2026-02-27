import type { VectorElementType } from './blueprintTypes';
import type { PortDataType } from './portTypes';

export type VectorScalarValue = string | number | boolean;
export type VectorValue = VectorScalarValue[];

export interface ParseVectorInputOptions {
  allowLegacyCsv?: boolean;
}

export type ParseVectorInputResult =
  | { ok: true; value: VectorValue; source: 'array' | 'json' | 'legacy-csv' | 'empty' }
  | { ok: false; error: string };

const VECTOR_BOOL_TRUE = new Set(['true', '1', 'yes', 'on', 'истина']);
const VECTOR_BOOL_FALSE = new Set(['false', '0', 'no', 'off', 'ложь']);
const ARRAY_COMPATIBLE_TYPES: ReadonlySet<PortDataType> = new Set([
  'bool',
  'int32',
  'int64',
  'float',
  'double',
  'string',
  'vector',
]);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const normalizeNumericString = (value: string): string =>
  value.trim().replace(',', '.');

const coerceVectorElement = (
  value: unknown,
  elementType: VectorElementType
): VectorScalarValue | undefined => {
  switch (elementType) {
    case 'int32':
    case 'int64': {
      if (isFiniteNumber(value) && Number.isInteger(value)) {
        return value;
      }
      if (typeof value === 'string') {
        const normalized = normalizeNumericString(value);
        if (normalized.length === 0) {
          return undefined;
        }
        const parsed = Number(normalized);
        if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
          return undefined;
        }
        return parsed;
      }
      return undefined;
    }
    case 'float':
    case 'double': {
      if (isFiniteNumber(value)) {
        return value;
      }
      if (typeof value === 'string') {
        const normalized = normalizeNumericString(value);
        if (normalized.length === 0) {
          return undefined;
        }
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : undefined;
      }
      return undefined;
    }
    case 'bool': {
      if (typeof value === 'boolean') {
        return value;
      }
      if (isFiniteNumber(value)) {
        return value !== 0;
      }
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (VECTOR_BOOL_TRUE.has(normalized)) {
          return true;
        }
        if (VECTOR_BOOL_FALSE.has(normalized)) {
          return false;
        }
      }
      return undefined;
    }
    case 'string':
      if (typeof value === 'string') {
        return value;
      }
      if (isFiniteNumber(value) || typeof value === 'boolean') {
        return String(value);
      }
      return undefined;
    default:
      return undefined;
  }
};

const toVectorElementTypeForScalarArray = (dataType: PortDataType): VectorElementType | undefined => {
  switch (dataType) {
    case 'bool':
      return 'bool';
    case 'int32':
      return 'int32';
    case 'int64':
      return 'int64';
    case 'float':
      return 'float';
    case 'double':
      return 'double';
    case 'string':
      return 'string';
    default:
      return undefined;
  }
};

const isVectorArrayInput = (value: unknown): value is unknown[] =>
  Array.isArray(value);

type ArrayInputSource = 'array' | 'json' | 'legacy-csv' | 'empty';

export type ArrayValue = Array<VectorScalarValue | ArrayValue>;

export type ParseArrayInputResult =
  | { ok: true; value: ArrayValue; source: ArrayInputSource }
  | { ok: false; error: string };

export interface ParseArrayInputOptions extends ParseVectorInputOptions {
  vectorElementType?: VectorElementType;
  arrayRank?: number;
}

export const supportsArrayDataType = (dataType: PortDataType): boolean =>
  ARRAY_COMPATIBLE_TYPES.has(dataType);

export const coerceVectorElements = (
  value: unknown[],
  elementType: VectorElementType
): ParseVectorInputResult => {
  const result: VectorValue = [];

  for (let index = 0; index < value.length; index += 1) {
    const coerced = coerceVectorElement(value[index], elementType);
    if (coerced === undefined) {
      return {
        ok: false,
        error: `Invalid vector element at index ${index}`,
      };
    }
    result.push(coerced);
  }

  return { ok: true, value: result, source: 'array' };
};

export const parseLegacyCsvVector = (
  raw: string,
  elementType: VectorElementType
): ParseVectorInputResult => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: true, value: [], source: 'empty' };
  }

  const parts = trimmed
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return { ok: true, value: [], source: 'empty' };
  }

  const coerced = coerceVectorElements(parts, elementType);
  if (!coerced.ok) {
    return coerced;
  }
  return {
    ok: true,
    value: coerced.value,
    source: 'legacy-csv',
  };
};

export const parseVectorInput = (
  raw: unknown,
  elementType: VectorElementType,
  options: ParseVectorInputOptions = {}
): ParseVectorInputResult => {
  const allowLegacyCsv = options.allowLegacyCsv ?? true;

  if (raw === undefined || raw === null) {
    return { ok: true, value: [], source: 'empty' };
  }

  if (Array.isArray(raw)) {
    return coerceVectorElements(raw, elementType);
  }

  if (typeof raw !== 'string') {
    return { ok: false, error: 'Vector value must be an array or string' };
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: true, value: [], source: 'empty' };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) {
      return { ok: false, error: 'Vector JSON must be an array' };
    }
    const coerced = coerceVectorElements(parsed, elementType);
    if (!coerced.ok) {
      return coerced;
    }
    return { ok: true, value: coerced.value, source: 'json' };
  } catch {
    if (!allowLegacyCsv) {
      return { ok: false, error: 'Invalid JSON array' };
    }
    if (trimmed.startsWith('[')) {
      return { ok: false, error: 'Invalid JSON array' };
    }
    return parseLegacyCsvVector(trimmed, elementType);
  }
};

const normalizeArrayRank = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 1;
  }
  const rank = Math.trunc(value);
  return rank > 0 ? rank : 1;
};

const coerceScalarForDataType = (
  value: unknown,
  dataType: PortDataType
): VectorScalarValue | undefined => {
  const scalarElementType = toVectorElementTypeForScalarArray(dataType);
  if (!scalarElementType) {
    return undefined;
  }
  return coerceVectorElement(value, scalarElementType);
};

export const parseArrayInput = (
  raw: unknown,
  dataType: PortDataType,
  options: ParseArrayInputOptions = {}
): ParseArrayInputResult => {
  if (!supportsArrayDataType(dataType)) {
    return {
      ok: false,
      error: `Unsupported array data type: ${dataType}`,
    };
  }

  const vectorElementType = options.vectorElementType ?? 'double';
  const arrayRank = normalizeArrayRank(options.arrayRank);
  const allowLegacyCsv = options.allowLegacyCsv ?? true;

  if (raw === undefined || raw === null) {
    return { ok: true, value: [], source: 'empty' };
  }

  let source: ArrayInputSource = 'array';
  let parsedRaw: unknown = raw;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      return { ok: true, value: [], source: 'empty' };
    }

    try {
      parsedRaw = JSON.parse(trimmed) as unknown;
      source = 'json';
    } catch {
      if (!allowLegacyCsv) {
        return { ok: false, error: 'Invalid JSON array' };
      }
      if (trimmed.startsWith('[')) {
        return { ok: false, error: 'Invalid JSON array' };
      }

      if (arrayRank !== 1) {
        return { ok: false, error: 'Legacy CSV is supported only for one-dimensional arrays' };
      }

      if (dataType === 'vector') {
        const parsedLegacyVector = parseLegacyCsvVector(trimmed, vectorElementType);
        if (!parsedLegacyVector.ok) {
          return parsedLegacyVector;
        }
        return {
          ok: true,
          value: [parsedLegacyVector.value],
          source: 'legacy-csv',
        };
      }

      const scalarElementType = toVectorElementTypeForScalarArray(dataType);
      if (!scalarElementType) {
        return { ok: false, error: `Unsupported scalar array data type: ${dataType}` };
      }
      const parsedLegacyScalar = parseLegacyCsvVector(trimmed, scalarElementType);
      if (!parsedLegacyScalar.ok) {
        return parsedLegacyScalar;
      }
      return {
        ok: true,
        value: parsedLegacyScalar.value,
        source: 'legacy-csv',
      };
    }
  }

  const coerceByRank = (
    value: unknown,
    remainingRank: number,
    path: string
  ): { ok: true; value: VectorScalarValue | ArrayValue } | { ok: false; error: string } => {
    if (remainingRank === 0) {
      if (dataType === 'vector') {
        const parsedVector = parseVectorInput(value, vectorElementType, { allowLegacyCsv });
        if (!parsedVector.ok) {
          return { ok: false, error: `${path}: ${parsedVector.error}` };
        }
        return { ok: true, value: parsedVector.value as unknown as ArrayValue };
      }

      const scalar = coerceScalarForDataType(value, dataType);
      if (scalar === undefined) {
        return { ok: false, error: `${path}: invalid scalar value` };
      }
      return { ok: true, value: scalar };
    }

    if (!isVectorArrayInput(value)) {
      return { ok: false, error: `${path}: expected array` };
    }

    const result: ArrayValue = [];
    for (let index = 0; index < value.length; index += 1) {
      const nested = coerceByRank(value[index], remainingRank - 1, `${path}[${index}]`);
      if (!nested.ok) {
        return nested;
      }
      result.push(nested.value as VectorScalarValue | ArrayValue);
    }
    return { ok: true, value: result };
  };

  const coerced = coerceByRank(parsedRaw, arrayRank, '$');
  if (!coerced.ok) {
    return coerced;
  }

  if (!isVectorArrayInput(coerced.value)) {
    return { ok: false, error: 'Array root must be an array' };
  }

  return {
    ok: true,
    value: coerced.value as ArrayValue,
    source,
  };
};

export const formatVectorInput = (value: unknown): string => {
  if (Array.isArray(value)) {
    try {
      const serialized = JSON.stringify(value);
      return typeof serialized === 'string' ? serialized : '[]';
    } catch {
      return '[]';
    }
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : '[]';
  }
  return '[]';
};
