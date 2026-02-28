import { describe, expect, it, vi } from 'vitest';
import type { GraphState } from '../shared/graphState';
import {
  handleIntegrationAdd,
  handleIntegrationReindex,
  handleSymbolsQuery,
} from './ipcOrchestration';

const createBaseState = (): GraphState => ({
  id: 'graph-1',
  name: 'Test Graph',
  language: 'cpp',
  displayLanguage: 'ru',
  nodes: [],
  edges: [],
  updatedAt: new Date().toISOString(),
  dirty: false,
  integrationBindings: [],
});

describe('GraphPanel IPC orchestration', () => {
  it('возвращает IPC-ошибку на невалидный запрос integration/add', async () => {
    const state = createBaseState();
    state.integrationBindings = [{ integrationId: 'seed', attachedFiles: [], mode: 'explicit' }];

    const response = await handleIntegrationAdd(state, { integration: null as never }, () => undefined);

    expect(response.type).toBe('integration/add');
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe('E_INTEGRATION_ADD');
      expect(response.error.message.length).toBeGreaterThan(0);
    }
  });

  it('успешно обрабатывает symbols/query для добавленной интеграции', async () => {
    const state = createBaseState();

    const addResponse = await handleIntegrationAdd(
      state,
      {
        integration: {
          integrationId: 'fmt',
          attachedFiles: ['include/fmt/format.h'],
          mode: 'explicit',
          kind: 'library',
        },
      },
      (patch) => {
        state.integrationBindings = patch.integrationBindings;
      }
    );

    expect(addResponse.ok).toBe(true);

    const symbolsResponse = await handleSymbolsQuery(state, {
      query: 'print',
      integrationId: 'fmt',
      limit: 10,
    });

    expect(symbolsResponse.ok).toBe(true);
    if (symbolsResponse.ok) {
      expect(symbolsResponse.payload.symbols).toHaveLength(1);
      expect(symbolsResponse.payload.symbols[0].id).toBe('fmt::print');
    }
  });

  it('деградирует в structured-error при сбое индексатора', async () => {
    const reindex = vi.fn(async () => {
      throw new Error('Indexer unavailable');
    });

    const response = await handleIntegrationReindex(
      {
        integrationId: 'fmt',
        force: true,
      },
      reindex
    );

    expect(response.type).toBe('integration/reindex');
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe('E_INTEGRATION_REINDEX');
      expect(response.error.message).toContain('Indexer unavailable');
      expect(response.error.details).toBeTruthy();
    }
  });
});
