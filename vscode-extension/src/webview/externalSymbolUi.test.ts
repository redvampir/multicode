import { describe, expect, it } from 'vitest';
import type { SourceIntegration, SymbolDescriptor } from '../shared/externalSymbols';
import { resolveSymbolUiStatus } from './externalSymbolUi';

const makeSymbol = (): SymbolDescriptor => ({
  id: 'fmt::print',
  integrationId: 'fmt',
  symbolKind: 'function',
  name: 'print',
  signatureHash: 'sig-1',
});

const makeIntegration = (): SourceIntegration => ({
  integrationId: 'fmt',
  attachedFiles: ['/workspace/main.cpp'],
  mode: 'explicit',
  kind: 'library',
});

describe('resolveSymbolUiStatus', () => {
  it('возвращает broken при отсутствии интеграции', () => {
    const status = resolveSymbolUiStatus({
      symbol: makeSymbol(),
      integration: undefined,
      localizationStale: false,
      activeFilePath: '/workspace/main.cpp',
    });

    expect(status.state).toBe('broken');
  });

  it('возвращает stale при устаревшей локализации', () => {
    const status = resolveSymbolUiStatus({
      symbol: makeSymbol(),
      integration: makeIntegration(),
      localizationStale: true,
      activeFilePath: '/workspace/main.cpp',
    });

    expect(status.state).toBe('stale');
  });

  it('возвращает disabled, если символ не доступен в активном файле', () => {
    const status = resolveSymbolUiStatus({
      symbol: makeSymbol(),
      integration: makeIntegration(),
      localizationStale: false,
      activeFilePath: '/workspace/other.cpp',
    });

    expect(status.state).toBe('disabled');
  });

  it('возвращает ok для валидного символа в текущем файле', () => {
    const status = resolveSymbolUiStatus({
      symbol: makeSymbol(),
      integration: makeIntegration(),
      localizationStale: false,
      activeFilePath: '/workspace/main.cpp',
    });

    expect(status.state).toBe('ok');
  });
});
