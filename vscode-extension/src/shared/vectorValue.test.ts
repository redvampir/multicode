import { describe, expect, it } from 'vitest';
import {
  coerceVectorElements,
  formatVectorInput,
  parseArrayInput,
  parseLegacyCsvVector,
  parseVectorInput,
  supportsArrayDataType,
} from './vectorValue';

describe('vectorValue helpers', () => {
  it('parses JSON number array for vector<double>', () => {
    const result = parseVectorInput('[1, 2.5, 3]', 'double');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([1, 2.5, 3]);
      expect(result.source).toBe('json');
    }
  });

  it('parses JSON string array for vector<string>', () => {
    const result = parseVectorInput('["red", "green", "blue"]', 'string');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(['red', 'green', 'blue']);
    }
  });

  it('coerces boolean vector values', () => {
    const result = coerceVectorElements([true, 'false', 1, 0], 'bool');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([true, false, true, false]);
    }
  });

  it('parses legacy CSV as fallback', () => {
    const result = parseLegacyCsvVector('1, 2, 3', 'int32');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([1, 2, 3]);
      expect(result.source).toBe('legacy-csv');
    }
  });

  it('rejects invalid JSON content', () => {
    const result = parseVectorInput('["a", {"bad": true}]', 'string', { allowLegacyCsv: false });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('formats array value to JSON string', () => {
    expect(formatVectorInput([1, 'two', false])).toBe('[1,"two",false]');
  });

  it('parses scalar array for int32 variables', () => {
    const result = parseArrayInput('[1,2,3,4]', 'int32');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([1, 2, 3, 4]);
    }
  });

  it('parses vector<string>[] values as nested arrays', () => {
    const result = parseArrayInput('[["a","b"],["c"]]', 'vector', { vectorElementType: 'string' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([['a', 'b'], ['c']]);
    }
  });

  it('parses int32[][] when arrayRank=2', () => {
    const result = parseArrayInput('[[1,2],[3,4]]', 'int32', { arrayRank: 2 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([[1, 2], [3, 4]]);
    }
  });

  it('parses int32[][][] when arrayRank=3', () => {
    const result = parseArrayInput('[[[1],[2]],[[3],[4]]]', 'int32', { arrayRank: 3 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([[[1], [2]], [[3], [4]]]);
    }
  });

  it('rejects shape mismatch for arrayRank=2', () => {
    const result = parseArrayInput('[1,2,3]', 'int32', { arrayRank: 2 });

    expect(result.ok).toBe(false);
  });

  it('rejects array mode for unsupported data types', () => {
    const result = parseArrayInput('[1,2,3]', 'pointer');

    expect(result.ok).toBe(false);
  });

  it('reports array compatibility for supported data types', () => {
    expect(supportsArrayDataType('int32')).toBe(true);
    expect(supportsArrayDataType('string')).toBe(true);
    expect(supportsArrayDataType('vector')).toBe(true);
    expect(supportsArrayDataType('pointer')).toBe(false);
  });
});
