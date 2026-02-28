import type { LegacySerializedGraph, SerializedGraph } from '../../serializer';
import legacySerializedV2Json from './legacy-serialized-v2.json';
import legacyEnvelopeV1Json from './legacy-envelope-v1.json';
import modernUeV3Json from './modern-ue-v3.json';

export const legacyGraphWithoutUeFixture = legacySerializedV2Json as LegacySerializedGraph;
export const legacyEnvelopeGraphFixture = legacyEnvelopeV1Json as unknown;
export const modernUeGraphFixture = modernUeV3Json as SerializedGraph;

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
