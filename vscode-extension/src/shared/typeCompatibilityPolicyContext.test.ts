import { describe, expect, it } from 'vitest';
import { buildTypeCompatibilityPolicyContext } from './typeCompatibilityPolicyContext';
import type { PackageManifest } from './packageSchema';

const createManifest = (overrides: Partial<PackageManifest>): PackageManifest => ({
  name: '@test/pkg',
  version: '1.0.0',
  displayName: 'Test',
  nodes: [
    {
      type: 'Start',
      label: 'Start',
      labelRu: 'Начало',
      category: 'flow',
      inputs: [],
      outputs: [],
      dynamicPorts: false,
      deprecated: false,
    },
  ],
  ...overrides,
});

describe('buildTypeCompatibilityPolicyContext', () => {
  it('предпочитает UE metadata.typeHierarchy перед contributes.typeCompatibilityPolicy', () => {
    const context = buildTypeCompatibilityPolicyContext([
      createManifest({
        metadata: {
          ue: {
            typeHierarchyVersion: '3.0.0',
            typeHierarchy: [
              { typeId: 'UE.Object', parents: [] },
              { typeId: 'UE.Actor', parents: ['UE.Object'] },
            ],
          },
        },
        contributes: {
          typeCompatibilityPolicy: {
            version: '2.0.0',
            hierarchy: [{ typeId: 'Legacy.Actor', parents: ['Legacy.Object'] }],
          },
        },
      }),
    ]);

    expect(context.hierarchy?.policyVersion).toBe('3.0.0');
    expect(context.hierarchy?.inheritance).toEqual({
      'UE.Object': [],
      'UE.Actor': ['UE.Object'],
    });
  });

  it('использует policy из contributes, если metadata отсутствует', () => {
    const context = buildTypeCompatibilityPolicyContext([
      createManifest({
        contributes: {
          typeCompatibilityPolicy: {
            version: '2.1.0',
            hierarchy: [
              { typeId: 'UE.Object', parents: [] },
              { typeId: 'UE.Pawn', parents: ['UE.Actor'] },
            ],
          },
        },
      }),
    ]);

    expect(context.hierarchy?.policyVersion).toBe('2.1.0');
    expect(context.hierarchy?.inheritance['UE.Pawn']).toEqual(['UE.Actor']);
  });
});
