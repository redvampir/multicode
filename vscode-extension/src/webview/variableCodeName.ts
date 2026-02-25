import { toValidIdentifier } from '../codegen/types';
import type { BlueprintVariable } from '../shared/blueprintTypes';

const CODE_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const DEFAULT_CODE_NAME = 'var';

const toTrimmedString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

export const sanitizeVariableCodeName = (value: unknown): string => {
  const raw = toTrimmedString(value);
  if (!raw) {
    return '';
  }

  const sanitized = toValidIdentifier(raw);
  if (sanitized === 'unnamed') {
    return '';
  }

  return CODE_NAME_PATTERN.test(sanitized) ? sanitized : '';
};

const collectTakenCodeNames = (
  variables: BlueprintVariable[],
  excludeId?: string
): Set<string> => {
  const taken = new Set<string>();

  for (const variable of variables) {
    if (excludeId && variable.id === excludeId) {
      continue;
    }

    const normalized =
      sanitizeVariableCodeName(variable.codeName) ||
      sanitizeVariableCodeName(variable.name) ||
      sanitizeVariableCodeName(variable.nameRu);

    if (normalized) {
      taken.add(normalized);
    }
  }

  return taken;
};

export const ensureUniqueVariableCodeName = (
  baseCodeName: string,
  variables: BlueprintVariable[],
  excludeId?: string
): string => {
  const normalizedBase = sanitizeVariableCodeName(baseCodeName) || DEFAULT_CODE_NAME;
  const taken = collectTakenCodeNames(variables, excludeId);

  if (!taken.has(normalizedBase)) {
    return normalizedBase;
  }

  let suffix = 1;
  let candidate = `${normalizedBase}_${suffix}`;
  while (taken.has(candidate)) {
    suffix += 1;
    candidate = `${normalizedBase}_${suffix}`;
  }

  return candidate;
};

interface ResolveVariableCodeNameOptions {
  preferredCodeName?: unknown;
  fallbackNames?: unknown[];
  variables: BlueprintVariable[];
  excludeId?: string;
}

export const resolveVariableCodeName = ({
  preferredCodeName,
  fallbackNames = [],
  variables,
  excludeId,
}: ResolveVariableCodeNameOptions): string => {
  const candidates = [preferredCodeName, ...fallbackNames];

  for (const candidate of candidates) {
    const normalized = sanitizeVariableCodeName(candidate);
    if (normalized) {
      return ensureUniqueVariableCodeName(normalized, variables, excludeId);
    }
  }

  return ensureUniqueVariableCodeName(DEFAULT_CODE_NAME, variables, excludeId);
};
