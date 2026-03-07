import { describe, expect, it } from 'vitest';
import {
  extensionToWebviewMessageSchema,
  externalIpcRequestSchema,
  externalIpcResponseSchema,
  ipcErrorSchema,
  parseExtensionMessage,
  parseExternalIpcRequest,
  parseExternalIpcResponse,
} from './messages';

describe('messages IPC схемы', () => {
  it('валидирует базовую IPC-ошибку', () => {
    const result = ipcErrorSchema.safeParse({
      code: 'E_INTEGRATION_NOT_FOUND',
      message: 'Интеграция не найдена',
      details: { integrationId: 'lib-1' },
    });

    expect(result.success).toBe(true);
  });

  it('отклоняет IPC-ошибку без code', () => {
    const result = ipcErrorSchema.safeParse({
      message: 'Нет кода ошибки',
    });

    expect(result.success).toBe(false);
  });

  it('валидирует все новые IPC-запросы', () => {
    const payloads = [
      {
        type: 'integration/add',
        payload: {
          integration: {
            integrationId: 'fmt',
            attachedFiles: ['include/fmt/format.h'],
            mode: 'explicit',
            kind: 'library',
          },
        },
      },
      {
        type: 'integration/remove',
        payload: {
          integrationId: 'fmt',
        },
      },
      {
        type: 'integration/list',
        payload: {
          includeImplicit: true,
        },
      },
      {
        type: 'integration/reindex',
        payload: {
          integrationId: 'fmt',
          force: true,
        },
      },
      {
        type: 'integration/diagnostics',
        payload: {
          integrationId: 'fmt',
        },
      },
      {
        type: 'symbols/query',
        payload: {
          query: 'print',
          limit: 25,
        },
      },
      {
        type: 'dependency-map/get',
        payload: {
          rootFile: 'src/main.cpp',
          includeSystem: false,
        },
      },
      {
        type: 'file/pick',
        payload: {
          purpose: 'bind',
          openLabel: 'Выбрать рабочий файл',
        },
      },
      {
        type: 'file/open',
        payload: {
          filePath: 'F:/workspace/.multicode/classes/class-player.multicode',
          preview: false,
        },
      },
      {
        type: 'class/upsert',
        payload: {
          classItem: {
            id: 'class-player',
            name: 'Player',
            members: [
              { id: 'member-health', name: 'health', dataType: 'int32', access: 'private' },
            ],
            methods: [
              { id: 'method-attack', name: 'attack', returnType: 'void', access: 'public', signature: 'void attack()' },
            ],
          },
        },
      },
      {
        type: 'class/delete',
        payload: {
          classId: 'class-player',
        },
      },
      {
        type: 'class/reorderMember',
        payload: {
          classId: 'class-player',
          memberId: 'member-health',
          targetIndex: 0,
        },
      },
      {
        type: 'class/reorderMethod',
        payload: {
          classId: 'class-player',
          methodId: 'method-attack',
          targetIndex: 0,
        },
      },
    ] as const;

    for (const entry of payloads) {
      expect(parseExternalIpcRequest(entry).success).toBe(true);
    }
  });

  it('отклоняет невалидные payload у новых IPC-запросов', () => {
    const invalidPayloads = [
      {
        type: 'integration/add',
        payload: {
          integration: {
            integrationId: 'fmt',
            attachedFiles: ['include/fmt/format.h'],
            mode: 'manual',
          },
        },
      },
      {
        type: 'symbols/query',
        payload: {
          query: '',
          limit: 0,
        },
      },
      {
        type: 'dependency-map/get',
        payload: {
          includeSystem: 'yes',
        },
      },
      {
        type: 'class/upsert',
        payload: {
          classItem: {
            id: 'class-player',
            name: '',
            members: [],
            methods: [],
          },
        },
      },
      {
        type: 'class/reorderMember',
        payload: {
          classId: 'class-player',
          memberId: 'member-health',
          targetIndex: -1,
        },
      },
      {
        type: 'class/delete',
        payload: {
          classId: '',
        },
      },
    ] as const;

    for (const entry of invalidPayloads) {
      expect(parseExternalIpcRequest(entry).success).toBe(false);
    }
  });

  it('сохраняет расширенную схему class/upsert и обратную совместимость', () => {
    const extendedRequest = {
      type: 'class/upsert' as const,
      payload: {
        classItem: {
          id: 'class-vehicle',
          name: 'Vehicle',
          nameRu: 'Транспорт',
          namespace: 'Gameplay',
          members: [
            {
              id: 'member-speed',
              name: 'speed',
              nameRu: 'Скорость',
              dataType: 'float',
              access: 'private',
            },
          ],
          methods: [
            {
              id: 'method-boost',
              name: 'Boost',
              nameRu: 'Ускориться',
              returnType: 'bool',
              access: 'public',
              isStatic: false,
              isConst: true,
              isVirtual: true,
              isOverride: false,
              params: [
                {
                  id: 'param-amount',
                  name: 'amount',
                  nameRu: 'Значение',
                  dataType: 'float',
                },
              ],
            },
            // legacy method payload without params should remain valid
            {
              id: 'method-legacy',
              name: 'Legacy',
              returnType: 'void',
              access: 'public',
            },
          ],
        },
      },
    };

    const parsed = parseExternalIpcRequest(extendedRequest);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }
    expect(parsed.data.type).toBe('class/upsert');
    if (parsed.data.type !== 'class/upsert') {
      return;
    }

    const classItem = parsed.data.payload.classItem;
    expect(classItem.nameRu).toBe('Транспорт');
    expect(classItem.methods[0]?.params).toHaveLength(1);
    expect(classItem.methods[0]?.params[0]?.nameRu).toBe('Значение');
    expect(classItem.methods[1]?.params).toEqual([]);
  });

  it('валидирует success/error ответы с общей схемой ошибки', () => {
    const successResponse = {
      type: 'symbols/query',
      ok: true,
      payload: {
        symbols: [
          {
            id: 'fmt::print',
            integrationId: 'fmt',
            symbolKind: 'function',
            name: 'print',
            namespacePath: ['fmt'],
          },
        ],
      },
    };
    const filePickResponse = {
      type: 'file/pick',
      ok: true,
      payload: {
        filePath: 'F:/workspace/main.cpp',
        fileName: 'main.cpp',
      },
    };
    const fileOpenResponse = {
      type: 'file/open',
      ok: true,
      payload: {
        filePath: 'F:/workspace/.multicode/classes/class-player.multicode',
        fileName: 'class-player.multicode',
      },
    };

    const errorResponse = {
      type: 'integration/remove',
      ok: false,
      error: {
        code: 'E_IN_USE',
        message: 'Интеграция используется в графе',
        details: { graphId: 'g-1' },
      },
    };

    expect(parseExternalIpcResponse(successResponse).success).toBe(true);
    expect(parseExternalIpcResponse(filePickResponse).success).toBe(true);
    expect(parseExternalIpcResponse(fileOpenResponse).success).toBe(true);
    expect(parseExternalIpcResponse(errorResponse).success).toBe(true);
  });

  it('отклоняет response с неверной структурой success/error', () => {
    const invalidResponses = [
      {
        type: 'integration/list',
        ok: true,
        payload: {
          integrations: 'not-an-array',
        },
      },
      {
        type: 'integration/reindex',
        ok: false,
        error: {
          message: 'Нет кода ошибки',
        },
      },
      {
        type: 'dependency-map/get',
        ok: true,
        payload: {
          nodes: [],
          edges: [{ from: 'a' }],
        },
      },
      {
        type: 'class/upsert',
        ok: true,
        payload: {
          classItem: {
            id: 'class-player',
            name: 'Player',
            members: [{ id: 'm1', name: 'health', access: 'private' }],
            methods: [],
          },
        },
      },
      {
        type: 'class/reorderMethod',
        ok: true,
        payload: {
          classId: 'class-player',
          methodId: 'method-attack',
          targetIndex: -1,
        },
      },
    ] as const;

    for (const entry of invalidResponses) {
      expect(parseExternalIpcResponse(entry).success).toBe(false);
      expect(externalIpcResponseSchema.safeParse(entry).success).toBe(false);
    }
  });

  it('не принимает неизвестный type в discriminated union', () => {
    const unknownMessage = {
      type: 'integration/unknown',
      payload: {},
    };

    expect(externalIpcRequestSchema.safeParse(unknownMessage).success).toBe(false);
    expect(parseExternalIpcRequest(unknownMessage).success).toBe(false);
  });

  it('валидирует extension-сообщение classStorageStatusChanged', () => {
    const message = {
      type: 'classStorageStatusChanged',
      payload: {
        mode: 'sidecar',
        isBoundSource: true,
        graphFilePath: 'F:/workspace/.multicode/graph-1.multicode',
        classesDirPath: 'F:/workspace/.multicode/classes',
        bindingsTotal: 2,
        classesLoaded: 2,
        missing: 0,
        failed: 0,
        fallbackEmbedded: 0,
        updatedAt: '2026-03-03T10:00:00.000Z',
        classItems: [
          {
            classId: 'class-player',
            filePath: 'F:/workspace/.multicode/classes/class-player.multicode',
            status: 'ok',
          },
        ],
      },
    };

    expect(extensionToWebviewMessageSchema.safeParse(message).success).toBe(true);
    expect(parseExtensionMessage(message).success).toBe(true);
  });
});
