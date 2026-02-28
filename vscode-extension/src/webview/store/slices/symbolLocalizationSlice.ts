import type { StateCreator } from 'zustand';
import type { SymbolDescriptor, SymbolLocalizationEntry } from '../../../shared/externalSymbols';
import type { GraphState } from '../../../shared/graphState';
import type { LocalizedSymbolView, SymbolLocalizationSliceState } from './indexerTypes';

export interface RenameRuOverlayParams {
  integrationId: string;
  symbolId: string;
  signatureHash?: string;
  localizedNameRu: string;
}

export type PersistLocalizationHandler = (entry: SymbolLocalizationEntry) => Promise<void>;

export interface SymbolLocalizationSlice extends SymbolLocalizationSliceState {
  localizationError: string | null;
  setLocalizations: (entries: Record<string, SymbolLocalizationEntry>) => void;
  resolveLocalizedSymbol: (symbol: SymbolDescriptor, locale: 'ru' | 'en') => LocalizedSymbolView;
  renameRuOverlayOptimistic: (params: RenameRuOverlayParams, persist: PersistLocalizationHandler) => Promise<void>;
}

type SliceState = SymbolLocalizationSlice & {
  graph: GraphState;
};

export const makeLocalizationKey = (integrationId: string, symbolId: string, signatureHash?: string): string =>
  `${integrationId}::${symbolId}::${signatureHash ?? '*'}`;

const findFallbackEntry = (
  localizations: Record<string, SymbolLocalizationEntry>,
  integrationId: string,
  symbolId: string
): SymbolLocalizationEntry | null => {
  for (const entry of Object.values(localizations)) {
    if (entry.integrationId === integrationId && entry.symbolId === symbolId) {
      return entry;
    }
  }
  return null;
};

export const createSymbolLocalizationSlice: StateCreator<
  SliceState,
  [],
  [],
  SymbolLocalizationSlice
> =
  (set, get) => ({
    symbolLocalizations: {},
    localizationError: null,
    setLocalizations: (entries) =>
      set((state) => ({
        symbolLocalizations: entries,
        graph: {
          ...state.graph,
          symbolLocalization: entries,
          updatedAt: new Date().toISOString()
        }
      })),
    resolveLocalizedSymbol: (symbol, locale) => {
      const localizations = get().symbolLocalizations;
      const exactKey = makeLocalizationKey(symbol.integrationId, symbol.id, symbol.signatureHash);
      const exactEntry = localizations[exactKey];

      const fallback = exactEntry ?? findFallbackEntry(localizations, symbol.integrationId, symbol.id);
      const localizedValue = locale === 'ru' ? fallback?.localizedNameRu : fallback?.localizedNameEn;
      if (!localizedValue) {
        return { value: symbol.name, stale: false };
      }

      const stale = Boolean(
        fallback && symbol.signatureHash && fallback.signatureHash && fallback.signatureHash !== symbol.signatureHash
      );

      return {
        value: localizedValue,
        stale
      };
    },
    renameRuOverlayOptimistic: async (params, persist) => {
      const key = makeLocalizationKey(params.integrationId, params.symbolId, params.signatureHash);
      const current = get().symbolLocalizations;
      const previous = current[key];
      const nextEntry: SymbolLocalizationEntry = {
        integrationId: params.integrationId,
        symbolId: params.symbolId,
        signatureHash: params.signatureHash,
        localizedNameRu: params.localizedNameRu,
        localizedNameEn: previous?.localizedNameEn
      };

      set((state) => ({
        symbolLocalizations: {
          ...state.symbolLocalizations,
          [key]: nextEntry
        },
        localizationError: null,
        graph: {
          ...state.graph,
          symbolLocalization: {
            ...(state.graph.symbolLocalization ?? {}),
            [key]: nextEntry
          },
          updatedAt: new Date().toISOString(),
          dirty: true
        }
      }));

      try {
        await persist(nextEntry);
      } catch (error) {
        set((state) => {
          const rolledBack = { ...state.symbolLocalizations };
          if (previous) {
            rolledBack[key] = previous;
          } else {
            delete rolledBack[key];
          }

          const graphLocalization = { ...(state.graph.symbolLocalization ?? {}) };
          if (previous) {
            graphLocalization[key] = previous;
          } else {
            delete graphLocalization[key];
          }

          return {
            symbolLocalizations: rolledBack,
            localizationError: error instanceof Error ? error.message : 'Ошибка сохранения локализации',
            graph: {
              ...state.graph,
              symbolLocalization: graphLocalization,
              updatedAt: new Date().toISOString()
            }
          };
        });
      }
    }
  });
