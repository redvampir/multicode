import type { GraphState } from '../../graphState';
import type { LegacySerializedGraph, SerializedGraph } from '../../serializer';

export const legacyGraphWithoutUeFixture: LegacySerializedGraph = {
  version: 2,
  savedAt: '2026-02-20T10:00:00.000Z',
  data: {
    id: 'legacy-no-ue',
    name: 'Legacy No UE',
    language: 'cpp',
    displayLanguage: 'ru',
    nodes: [
      { id: 'n1', label: 'Start', type: 'Start' },
      { id: 'n2', label: 'Print', type: 'Function' },
    ],
    edges: [{ id: 'e1', source: 'n1', target: 'n2', kind: 'execution' }],
    updatedAt: '2026-02-20T10:00:00.000Z',
  },
};

export const legacySerializedExportFixture: LegacySerializedGraph = {
  version: 2,
  savedAt: '2026-02-21T10:00:00.000Z',
  data: {
    id: 'legacy-export',
    name: 'Legacy Export',
    language: 'cpp',
    displayLanguage: 'en',
    nodes: [{ id: 'n1', label: 'Start', type: 'Start' }],
    edges: [],
    updatedAt: '2026-02-21T10:00:00.000Z',
    dirty: false,
  },
};

export const modernUeGraphFixture: SerializedGraph = {
  schemaVersion: 3,
  version: 3,
  savedAt: '2026-02-22T10:00:00.000Z',
  data: {
    id: 'modern-ue',
    name: 'Modern UE',
    graphVersion: 3,
    language: 'ue',
    displayLanguage: 'ru',
    nodes: [
      { id: 'n1', label: 'Start', type: 'Start' },
      { id: 'n2', label: 'BuildClass', type: 'Function' },
    ],
    edges: [{ id: 'e1', source: 'n1', target: 'n2', kind: 'execution' }],
    updatedAt: '2026-02-22T10:00:00.000Z',
    classes: [
      {
        id: 'class-1',
        name: 'MyActor',
        extensions: {
          ue: {
            classMacro: 'UCLASS(BlueprintType)',
            generatedBodyMacro: 'GENERATED_BODY()',
            methodMacro: 'UFUNCTION(BlueprintCallable, Category = "MultiCode")',
          },
        },
      },
    ],
  } as GraphState,
};
