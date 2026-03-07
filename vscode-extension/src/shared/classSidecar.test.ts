import { describe, expect, it } from 'vitest';
import type { BlueprintClassSidecar } from './classSidecar';
import { deserializeClassSidecar, parseClassSidecar, serializeClassSidecar } from './classSidecar';

describe('classSidecar', () => {
  it('serialize -> parse round-trip (envelope v1)', () => {
    const classItem: BlueprintClassSidecar = {
      id: 'class-a',
      name: 'A',
      members: [],
      methods: [],
    };

    const serialized = serializeClassSidecar(classItem);
    const parsed = parseClassSidecar(serialized);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.schemaVersion).toBe(1);
      expect(parsed.data.data.id).toBe('class-a');
    }
  });

  it('accepts legacy payload (BlueprintClass only)', () => {
    const legacy: BlueprintClassSidecar = {
      id: 'class-legacy',
      name: 'Legacy',
      members: [],
      methods: [],
    };

    expect(deserializeClassSidecar(legacy)).toEqual(legacy);
  });

  it('rejects invalid payload', () => {
    expect(() => deserializeClassSidecar({ foo: 'bar' })).toThrow();
  });
});
