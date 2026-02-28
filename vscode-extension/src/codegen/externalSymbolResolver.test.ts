import { describe, expect, it } from 'vitest';
import type { BlueprintGraphState } from '../shared/blueprintTypes';
import type { SourceIntegration, SymbolDescriptor } from '../shared/externalSymbols';
import { CodeGenErrorCode } from './types';
import { validateExternalSymbols } from './externalSymbolResolver';

const createGraph = (signatureHash = 'hash-1'): BlueprintGraphState => ({
  id: 'g1',
  name: 'graph',
  language: 'cpp',
  displayLanguage: 'ru',
  nodes: [
    {
      id: 'node-1',
      label: 'Ext call',
      type: 'Custom',
      position: { x: 0, y: 0 },
      inputs: [],
      outputs: [],
      properties: {
        externalSymbol: {
          integrationId: 'fmt',
          symbolId: 'fmt::print',
          signatureHash,
        },
      },
    },
  ],
  edges: [],
  variables: [],
  functions: [],
  updatedAt: new Date().toISOString(),
});

const integrations: SourceIntegration[] = [
  {
    integrationId: 'fmt',
    attachedFiles: [],
    mode: 'explicit',
    kind: 'library',
    location: { type: 'local_file', value: 'include/fmt/format.h' },
  },
];

const symbols: SymbolDescriptor[] = [
  {
    id: 'fmt::print',
    integrationId: 'fmt',
    symbolKind: 'function',
    name: 'print',
    signatureHash: 'hash-1',
  },
];

describe('validateExternalSymbols', () => {
  it('возвращает include и успешно резолвит символ', () => {
    const result = validateExternalSymbols(createGraph(), symbols, integrations, () => 'hash-1');
    expect(result.errors).toHaveLength(0);
    expect(result.requiredIncludes).toEqual(['"include/fmt/format.h"']);
    expect(result.resolvedSymbolsByNodeId.get('node-1')?.name).toBe('print');
  });

  it('возвращает контролируемую ошибку при mismatch сигнатуры', () => {
    const result = validateExternalSymbols(createGraph('stale'), symbols, integrations, () => 'hash-1');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe(CodeGenErrorCode.EXTERNAL_SYMBOL_SIGNATURE_MISMATCH);
    expect(result.brokenNodeIds).toContain('node-1');
  });
});
