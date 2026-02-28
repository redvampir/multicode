import type { StateCreator } from 'zustand';
import type { SymbolDescriptor } from '../../../shared/externalSymbols';
import type { SymbolCatalogSliceState, SymbolFilterContext } from './indexerTypes';
import type { DependencyMapSlice } from './dependencyMapSlice';

export interface SymbolCatalogSlice extends SymbolCatalogSliceState {
  setSymbolsForIntegration: (integrationId: string, symbols: SymbolDescriptor[]) => void;
  clearSymbolsForIntegration: (integrationId: string) => void;
  getAvailableSymbols: (context?: SymbolFilterContext) => SymbolDescriptor[];
}

type SliceState = SymbolCatalogSlice & DependencyMapSlice;

const normalize = (value: string): string => value.trim().toLowerCase();

export const createSymbolCatalogSlice: StateCreator<SliceState, [], [], SymbolCatalogSlice> =
  (set, get) => ({
    symbolCatalog: {},
    setSymbolsForIntegration: (integrationId, symbols) =>
      set((state) => ({
        symbolCatalog: {
          ...state.symbolCatalog,
          [integrationId]: symbols
        }
      })),
    clearSymbolsForIntegration: (integrationId) =>
      set((state) => {
        const next = { ...state.symbolCatalog };
        delete next[integrationId];
        return { symbolCatalog: next };
      }),
    getAvailableSymbols: (context = {}) => {
      const { symbolCatalog } = get();
      const query = normalize(context.query ?? '');
      const kinds = context.symbolKinds ? new Set(context.symbolKinds) : null;
      const reachableDependencies = get().getReachableDependencyIds(context.rootDependencyId);

      const symbols = Object.entries(symbolCatalog)
        .flatMap(([integrationId, entries]) =>
          entries.filter((symbol) => {
            if (context.integrationId && integrationId !== context.integrationId) {
              return false;
            }
            if (context.rootDependencyId && !reachableDependencies.has(integrationId)) {
              return false;
            }
            if (kinds && !kinds.has(symbol.symbolKind)) {
              return false;
            }
            if (!query) {
              return true;
            }
            return normalize(symbol.name).includes(query) || normalize(symbol.id).includes(query);
          })
        )
        .sort((left, right) => left.name.localeCompare(right.name, 'ru'));

      return symbols;
    }
  });
