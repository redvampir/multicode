import type { SourceIntegration, SymbolDescriptor } from '../shared/externalSymbols';

export type SymbolBadgeState = 'ok' | 'broken' | 'stale' | 'disabled';

export interface SymbolUiStatus {
  state: SymbolBadgeState;
  labelRu: string;
  labelEn: string;
}

export interface SymbolUiContext {
  symbol: SymbolDescriptor;
  integration: SourceIntegration | undefined;
  localizationStale: boolean;
  activeFilePath?: string | null;
}

const normalizePath = (filePath: string): string => filePath.replace(/\\/g, '/').toLowerCase();

export const resolveSymbolUiStatus = ({
  symbol,
  integration,
  localizationStale,
  activeFilePath,
}: SymbolUiContext): SymbolUiStatus => {
  if (!integration) {
    return {
      state: 'broken',
      labelRu: 'broken',
      labelEn: 'broken',
    };
  }

  if (localizationStale) {
    return {
      state: 'stale',
      labelRu: 'stale',
      labelEn: 'stale',
    };
  }

  const hasActiveFile = Boolean(activeFilePath && activeFilePath.trim().length > 0);
  const normalizedActiveFilePath = hasActiveFile ? normalizePath(activeFilePath ?? '') : null;
  const scopeFiles = (integration.consumerFiles ?? []).map(normalizePath);

  if (
    normalizedActiveFilePath &&
    scopeFiles.length > 0 &&
    !scopeFiles.includes(normalizedActiveFilePath)
  ) {
    return {
      state: 'disabled',
      labelRu: 'disabled',
      labelEn: 'disabled',
    };
  }

  if (!symbol.name.trim()) {
    return {
      state: 'broken',
      labelRu: 'broken',
      labelEn: 'broken',
    };
  }

  return {
    state: 'ok',
    labelRu: 'ok',
    labelEn: 'ok',
  };
};
