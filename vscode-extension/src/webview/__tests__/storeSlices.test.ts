import { describe, expect, it } from 'vitest';
import type { SymbolDescriptor } from '../../shared/externalSymbols';
import { createDefaultGraphState } from '../../shared/graphState';
import { createGraphStore } from '../store';
import { makeLocalizationKey } from '../store/slices/symbolLocalizationSlice';

const createStore = () => createGraphStore(createDefaultGraphState());

describe('store slices', () => {
  it('делает rollback optimistic RU-оверлея при IPC-ошибке', async () => {
    const store = createStore();

    await store.getState().renameRuOverlayOptimistic(
      {
        integrationId: 'std',
        symbolId: 'printf',
        signatureHash: 'sig-1',
        localizedNameRu: 'печать'
      },
      async () => {
        throw new Error('IPC unavailable');
      }
    );

    const key = makeLocalizationKey('std', 'printf', 'sig-1');
    const state = store.getState();
    expect(state.symbolLocalizations[key]).toBeUndefined();
    expect(state.graph.symbolLocalization?.[key]).toBeUndefined();
    expect(state.localizationError).toBe('IPC unavailable');
  });

  it('помечает перевод как stale при несовпадении signatureHash', () => {
    const store = createStore();
    const staleKey = makeLocalizationKey('std', 'vector_push', 'hash-old');

    store.getState().setLocalizations({
      [staleKey]: {
        integrationId: 'std',
        symbolId: 'vector_push',
        signatureHash: 'hash-old',
        localizedNameRu: 'добавить в вектор'
      }
    });

    const symbol: SymbolDescriptor = {
      id: 'vector_push',
      integrationId: 'std',
      symbolKind: 'function',
      name: 'vector_push',
      signatureHash: 'hash-new'
    };

    const localized = store.getState().resolveLocalizedSymbol(symbol, 'ru');
    expect(localized.value).toBe('добавить в вектор');
    expect(localized.stale).toBe(true);
  });

  it('фильтрует доступные символы по контексту dependency-map', () => {
    const store = createStore();

    store.getState().setDependencyMap({
      nodes: [
        { id: 'root', kind: 'file' },
        { id: 'libA', kind: 'library' },
        { id: 'libB', kind: 'library' }
      ],
      edges: [
        { from: 'root', to: 'libA' }
      ]
    });

    store.getState().setSymbolsForIntegration('libA', [
      {
        id: 'a::call',
        integrationId: 'libA',
        symbolKind: 'function',
        name: 'alphaCall'
      }
    ]);
    store.getState().setSymbolsForIntegration('libB', [
      {
        id: 'b::call',
        integrationId: 'libB',
        symbolKind: 'function',
        name: 'betaCall'
      }
    ]);

    const reachable = store.getState().getAvailableSymbols({
      rootDependencyId: 'root',
      symbolKinds: ['function'],
      query: 'call'
    });

    expect(reachable.map((item) => item.integrationId)).toEqual(['libA']);
    expect(reachable[0]?.name).toBe('alphaCall');
  });
});
