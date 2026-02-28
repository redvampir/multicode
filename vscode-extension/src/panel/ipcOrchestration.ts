import { externalIpcResponseSchema, type ExternalIpcResponse, type IpcError } from '../shared/messages';
import type { GraphState } from '../shared/graphState';
import type { SourceIntegration } from '../shared/externalSymbols';

export const mapToIpcError = (error: unknown, fallbackCode: string, fallbackMessage: string): IpcError => {
  if (typeof error === 'string') {
    return { code: fallbackCode, message: error };
  }
  if (error && typeof error === 'object' && 'issues' in error) {
    const issues = (error as { issues?: Array<{ message?: string }> }).issues ?? [];
    const issueMessage = issues.map((issue) => issue.message).filter((message): message is string => Boolean(message)).join('; ');
    return { code: 'E_VALIDATION', message: issueMessage || fallbackMessage, details: error };
  }
  if (error instanceof Error) {
    return {
      code: fallbackCode,
      message: error.message || fallbackMessage,
      details: { name: error.name, stack: error.stack },
    };
  }
  return { code: fallbackCode, message: fallbackMessage, details: error };
};

const createIpcErrorResponse = <TType extends ExternalIpcResponse['type']>(
  type: TType,
  error: unknown,
  fallbackCode: string,
  fallbackMessage: string
): Extract<ExternalIpcResponse, { type: TType; ok: false }> => ({
  type,
  ok: false,
  error: mapToIpcError(error, fallbackCode, fallbackMessage),
} as Extract<ExternalIpcResponse, { type: TType; ok: false }>);

export const handleIntegrationAdd = async (
  state: GraphState,
  payload: { integration: SourceIntegration },
  applyState: (patch: Partial<GraphState>) => void
): Promise<Extract<ExternalIpcResponse, { type: 'integration/add' }>> => {
  try {
    const current = state.integrationBindings ?? [];
    const filtered = current.filter((item) => item.integrationId !== payload.integration.integrationId);
    applyState({ integrationBindings: [...filtered, payload.integration] });
    return { type: 'integration/add', ok: true, payload: { integration: payload.integration } };
  } catch (error) {
    return createIpcErrorResponse('integration/add', error, 'E_INTEGRATION_ADD', 'Не удалось добавить интеграцию');
  }
};

export const handleIntegrationReindex = async (
  payload: { integrationId?: string; force?: boolean } | undefined,
  reindex: (integrationId: string | undefined, force: boolean) => Promise<number>
): Promise<Extract<ExternalIpcResponse, { type: 'integration/reindex' }>> => {
  try {
    const indexedSymbols = await reindex(payload?.integrationId, payload?.force ?? false);
    return {
      type: 'integration/reindex',
      ok: true,
      payload: { integrationId: payload?.integrationId ?? null, indexedSymbols },
    };
  } catch (error) {
    return createIpcErrorResponse('integration/reindex', error, 'E_INTEGRATION_REINDEX', 'Не удалось переиндексировать интеграцию');
  }
};

export const handleSymbolsQuery = async (
  state: GraphState,
  payload: { query: string; integrationId?: string; limit?: number }
): Promise<Extract<ExternalIpcResponse, { type: 'symbols/query' }>> => {
  try {
    const normalized = payload.query.trim().toLowerCase();
    const limit = payload.limit ?? 50;
    const symbols = (state.integrationBindings ?? [])
      .filter((item) => !payload.integrationId || item.integrationId === payload.integrationId)
      .map((item) => ({
        id: `${item.integrationId}::${normalized}`,
        integrationId: item.integrationId,
        symbolKind: 'function' as const,
        name: normalized,
        namespacePath: [item.integrationId],
      }))
      .slice(0, limit);

    return { type: 'symbols/query', ok: true, payload: { symbols } };
  } catch (error) {
    return createIpcErrorResponse('symbols/query', error, 'E_SYMBOLS_QUERY', 'Не удалось выполнить поиск символов');
  }
};

export const handleDependencyMapGet = async (
  state: GraphState,
  payload: { rootFile?: string; includeSystem?: boolean } | undefined,
  fallbackRoot: string
): Promise<Extract<ExternalIpcResponse, { type: 'dependency-map/get' }>> => {
  try {
    const rootId = payload?.rootFile ?? fallbackRoot;
    const nodes: Array<{ id: string; kind: 'file' | 'library' | 'framework' }> = [{ id: rootId, kind: 'file' }];
    const edges: Array<{ from: string; to: string }> = [];

    for (const binding of state.integrationBindings ?? []) {
      const kind = binding.kind ?? 'library';
      if (!payload?.includeSystem && kind === 'framework') {
        continue;
      }
      nodes.push({ id: binding.integrationId, kind });
      edges.push({ from: rootId, to: binding.integrationId });
    }

    return { type: 'dependency-map/get', ok: true, payload: { nodes, edges } };
  } catch (error) {
    return createIpcErrorResponse('dependency-map/get', error, 'E_DEPENDENCY_MAP_GET', 'Не удалось построить карту зависимостей');
  }
};

export const safeExternalIpcResponse = (response: ExternalIpcResponse) => externalIpcResponseSchema.safeParse(response);
