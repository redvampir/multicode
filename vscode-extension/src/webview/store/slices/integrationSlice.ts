import type { StateCreator } from 'zustand';
import type { SourceIntegration } from '../../../shared/externalSymbols';
import type { IndexerDiagnostic, IndexerStatus, IntegrationSliceState } from './indexerTypes';

export interface IntegrationSlice extends IntegrationSliceState {
  setIntegrations: (integrations: SourceIntegration[]) => void;
  upsertIntegration: (integration: SourceIntegration) => void;
  removeIntegration: (integrationId: string) => void;
  setIndexerStatus: (status: IndexerStatus, error?: string | null) => void;
  updateIndexerData: (payload: { lastUpdated?: string | null; diagnostics?: IndexerDiagnostic[] }) => void;
}

export const createIntegrationSlice: StateCreator<IntegrationSlice, [], [], IntegrationSlice> = (set) => ({
    integrations: [],
    indexerUi: {
      status: 'ready',
      error: null
    },
    indexerData: {
      lastUpdated: null,
      diagnostics: []
    },
    setIntegrations: (integrations) => set({ integrations }),
    upsertIntegration: (integration) =>
      set((state) => {
        const existing = state.integrations.find((item) => item.integrationId === integration.integrationId);
        if (!existing) {
          return { integrations: [...state.integrations, integration] };
        }

        return {
          integrations: state.integrations.map((item) =>
            item.integrationId === integration.integrationId ? integration : item
          )
        };
      }),
    removeIntegration: (integrationId) =>
      set((state) => ({
        integrations: state.integrations.filter((item) => item.integrationId !== integrationId)
      })),
    setIndexerStatus: (status, error = null) =>
      set({
        indexerUi: {
          status,
          error: status === 'error' ? error ?? 'Неизвестная ошибка индексации.' : null
        }
      }),
    updateIndexerData: ({ lastUpdated, diagnostics }) =>
      set((state) => ({
        indexerData: {
          lastUpdated: lastUpdated ?? state.indexerData.lastUpdated,
          diagnostics: diagnostics ?? state.indexerData.diagnostics
        }
      }))
  });
