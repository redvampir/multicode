import { describe, expect, it } from 'vitest';
import type { BlueprintVariable } from '../shared/blueprintTypes';
import {
  ensureUniqueVariableCodeName,
  resolveVariableCodeName,
  sanitizeVariableCodeName,
} from './variableCodeName';

const createVariable = (
  id: string,
  name: string,
  nameRu: string,
  codeName?: string
): BlueprintVariable => ({
  id,
  name,
  nameRu,
  codeName,
  dataType: 'int32',
  category: 'default',
});

describe('variableCodeName', () => {
  it('sanitizes code names to valid C++ identifiers', () => {
    expect(sanitizeVariableCodeName('my Counter')).toBe('my_counter');
    expect(sanitizeVariableCodeName('тест')).toBe('test');
    expect(sanitizeVariableCodeName('🧪')).toBe('');
  });

  it('resolves unique code names with suffixes inside graph scope', () => {
    const variables: BlueprintVariable[] = [
      createVariable('var-1', 'health', 'здоровье', 'health'),
      createVariable('var-2', 'score', 'очки', 'score'),
    ];

    const resolved = resolveVariableCodeName({
      preferredCodeName: 'score',
      fallbackNames: ['Счёт'],
      variables,
    });

    expect(resolved).toBe('score_1');
  });

  it('keeps existing code name when editing current variable', () => {
    const variables: BlueprintVariable[] = [
      createVariable('var-edit', 'value', 'значение', 'value_name'),
      createVariable('var-other', 'counter', 'счётчик', 'counter'),
    ];

    const resolved = ensureUniqueVariableCodeName('value_name', variables, 'var-edit');

    expect(resolved).toBe('value_name');
  });
});
