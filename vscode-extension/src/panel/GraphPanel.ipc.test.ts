import { describe, expect, it, vi } from 'vitest';
import type { GraphState } from '../shared/graphState';
import {
  handleClassDelete,
  handleClassReorderMember,
  handleClassReorderMethod,
  handleClassUpsert,
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

  it('успешно валидирует и сохраняет class/upsert', async () => {
    const state = createBaseState();

    const response = await handleClassUpsert(
      state,
      {
        classItem: {
          id: 'class-player',
          name: 'Player',
          members: [{ id: 'member-health', name: 'health', dataType: 'int32', access: 'private' }],
          methods: [{ id: 'method-attack', name: 'attack', returnType: 'void', access: 'public', signature: 'void attack()' }],
        },
      },
      (patch) => {
        state.classes = patch.classes;
      }
    );

    expect(response.ok).toBe(true);
    expect(state.classes).toHaveLength(1);
  });

  it('возвращает ошибку валидации для class/upsert с пустым именем', async () => {
    const state = createBaseState();

    const response = await handleClassUpsert(
      state,
      {
        classItem: {
          id: 'class-player',
          name: '',
          members: [],
          methods: [],
        },
      },
      () => undefined
    );

    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe('E_VALIDATION');
    }
  });


  it('возвращает class/upsert с валидным payload и сохраняет members/methods', async () => {
    const state = createBaseState();

    const response = await handleClassUpsert(
      state,
      {
        classItem: {
          id: 'class-weapon',
          name: 'Weapon',
          members: [{ id: 'member-damage', name: 'damage', dataType: 'int32', access: 'private' }],
          methods: [
            {
              id: 'method-fire',
              name: 'fire',
              returnType: 'void',
              params: [{ id: 'param-burst', name: 'burst', dataType: 'int32' }],
              access: 'public',
            },
          ],
        },
      },
      (patch) => {
        state.classes = patch.classes;
      }
    );

    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.payload.classItem.members).toHaveLength(1);
      expect(response.payload.classItem.methods).toHaveLength(1);
    }
    expect(state.classes).toHaveLength(1);
  });

  it('возвращает E_VALIDATION для class/upsert с невалидным payload', async () => {
    const state = createBaseState();

    const response = await handleClassUpsert(
      state,
      {
        classItem: {
          id: 'class-invalid',
          name: 'Invalid',
          members: 'broken',
          methods: [],
        },
      },
      () => undefined
    );

    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe('E_VALIDATION');
      expect(response.error.message.length).toBeGreaterThan(0);
    }
  });

  it('успешно удаляет класс через class/delete', async () => {
    const state = createBaseState();
    state.classes = [{ id: 'class-player', name: 'Player', members: [], methods: [] }];

    const response = await handleClassDelete(state, { classId: 'class-player' }, (patch) => {
      state.classes = patch.classes;
    });

    expect(response.ok).toBe(true);
    expect(state.classes).toHaveLength(0);
  });

  it('возвращает ошибку валидации для class/delete без classId', async () => {
    const state = createBaseState();

    const response = await handleClassDelete(state, { classId: '' }, () => undefined);

    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe('E_VALIDATION');
    }
  });

  it('успешно переставляет член класса через class/reorderMember', async () => {
    const state = createBaseState();
    state.classes = [
      {
        id: 'class-player',
        name: 'Player',
        members: [
          { id: 'm1', name: 'health', dataType: 'int32', access: 'private' },
          { id: 'm2', name: 'armor', dataType: 'int32', access: 'private' },
        ],
        methods: [],
      },
    ];

    const response = await handleClassReorderMember(
      state,
      { classId: 'class-player', memberId: 'm1', targetIndex: 1 },
      (patch) => {
        state.classes = patch.classes;
      }
    );

    expect(response.ok).toBe(true);
    expect((state.classes as Array<{ members: Array<{ id: string }> }>)[0].members[1].id).toBe('m1');
  });

  it('возвращает ошибку валидации для class/reorderMember с отрицательным индексом', async () => {
    const state = createBaseState();
    const response = await handleClassReorderMember(
      state,
      { classId: 'class-player', memberId: 'm1', targetIndex: -1 },
      () => undefined
    );

    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe('E_VALIDATION');
    }
  });

  it('успешно переставляет метод класса через class/reorderMethod', async () => {
    const state = createBaseState();
    state.classes = [
      {
        id: 'class-player',
        name: 'Player',
        members: [],
        methods: [
          { id: 'method-1', name: 'attack', returnType: 'void', access: 'public' },
          { id: 'method-2', name: 'heal', returnType: 'void', access: 'public' },
        ],
      },
    ];

    const response = await handleClassReorderMethod(
      state,
      { classId: 'class-player', methodId: 'method-1', targetIndex: 1 },
      (patch) => {
        state.classes = patch.classes;
      }
    );

    expect(response.ok).toBe(true);
    expect((state.classes as Array<{ methods: Array<{ id: string }> }>)[0].methods[1].id).toBe('method-1');
  });

  it('возвращает ошибку валидации для class/reorderMethod с пустым methodId', async () => {
    const state = createBaseState();
    const response = await handleClassReorderMethod(
      state,
      { classId: 'class-player', methodId: '', targetIndex: 0 },
      () => undefined
    );

    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe('E_VALIDATION');
    }
  });
});
