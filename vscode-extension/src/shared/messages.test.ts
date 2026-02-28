import { describe, expect, it } from 'vitest';
import {
  externalIpcRequestSchema,
  externalIpcResponseSchema,
  ipcErrorSchema,
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
    ] as const;

    for (const entry of invalidPayloads) {
      expect(parseExternalIpcRequest(entry).success).toBe(false);
    }
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
});
