import {
  blueprintClassSchema,
  classDeleteRequestSchema,
  classReorderMemberRequestSchema,
  classReorderMethodRequestSchema,
  classUpsertRequestSchema,
  externalIpcResponseSchema,
  type ExternalIpcResponse,
  type IpcError,
} from '../shared/messages';
import type { GraphState } from '../shared/graphState';
import type { SourceIntegration } from '../shared/externalSymbols';

type BlueprintClass = ReturnType<typeof blueprintClassSchema.parse>;

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

const moveItem = <T extends { id: string }>(items: T[], itemId: string, targetIndex: number): T[] | undefined => {
  const sourceIndex = items.findIndex((item) => item.id === itemId);
  if (sourceIndex < 0) {
    return undefined;
  }

  const safeTargetIndex = Math.min(Math.max(0, targetIndex), items.length - 1);
  if (safeTargetIndex === sourceIndex) {
    return [...items];
  }

  const next = [...items];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(safeTargetIndex, 0, moved);
  return next;
};

export const handleClassUpsert = async (
  state: GraphState,
  payload: unknown,
  applyState: (patch: Partial<GraphState>) => void
): Promise<Extract<ExternalIpcResponse, { type: 'class/upsert' }>> => {
  const parsedPayload = classUpsertRequestSchema.shape.payload.safeParse(payload);
  if (!parsedPayload.success) {
    return createIpcErrorResponse('class/upsert', parsedPayload.error, 'E_CLASS_UPSERT_VALIDATION', 'Некорректный payload class/upsert');
  }

  try {
    const classItem = blueprintClassSchema.parse(parsedPayload.data.classItem);
    const current = (state.classes ?? []) as BlueprintClass[];
    const filtered = current.filter((entry) => entry.id !== classItem.id);
    applyState({ classes: [...filtered, classItem] });
    return { type: 'class/upsert', ok: true, payload: { classItem } };
  } catch (error) {
    return createIpcErrorResponse('class/upsert', error, 'E_CLASS_UPSERT', 'Не удалось сохранить класс');
  }
};

export const handleClassDelete = async (
  state: GraphState,
  payload: unknown,
  applyState: (patch: Partial<GraphState>) => void
): Promise<Extract<ExternalIpcResponse, { type: 'class/delete' }>> => {
  const parsedPayload = classDeleteRequestSchema.shape.payload.safeParse(payload);
  if (!parsedPayload.success) {
    return createIpcErrorResponse('class/delete', parsedPayload.error, 'E_CLASS_DELETE_VALIDATION', 'Некорректный payload class/delete');
  }

  try {
    const current = (state.classes ?? []) as BlueprintClass[];
    const next = current.filter((item) => item.id !== parsedPayload.data.classId);
    applyState({ classes: next });
    return {
      type: 'class/delete',
      ok: true,
      payload: { classId: parsedPayload.data.classId, removed: next.length !== current.length },
    };
  } catch (error) {
    return createIpcErrorResponse('class/delete', error, 'E_CLASS_DELETE', 'Не удалось удалить класс');
  }
};

export const handleClassReorderMember = async (
  state: GraphState,
  payload: unknown,
  applyState: (patch: Partial<GraphState>) => void
): Promise<Extract<ExternalIpcResponse, { type: 'class/reorderMember' }>> => {
  const parsedPayload = classReorderMemberRequestSchema.shape.payload.safeParse(payload);
  if (!parsedPayload.success) {
    return createIpcErrorResponse('class/reorderMember', parsedPayload.error, 'E_CLASS_REORDER_MEMBER_VALIDATION', 'Некорректный payload class/reorderMember');
  }

  try {
    const classes = (state.classes ?? []) as BlueprintClass[];
    const classEntry = classes.find((item) => item.id === parsedPayload.data.classId);
    if (!classEntry) {
      return createIpcErrorResponse('class/reorderMember', 'Класс не найден', 'E_CLASS_NOT_FOUND', 'Класс не найден');
    }

    const reordered = moveItem(classEntry.members, parsedPayload.data.memberId, parsedPayload.data.targetIndex);
    if (!reordered) {
      return createIpcErrorResponse('class/reorderMember', 'Поле класса не найдено', 'E_CLASS_MEMBER_NOT_FOUND', 'Поле класса не найдено');
    }

    const nextClasses = classes.map((item) => (item.id === classEntry.id ? { ...item, members: reordered } : item));
    applyState({ classes: nextClasses });
    return { type: 'class/reorderMember', ok: true, payload: parsedPayload.data };
  } catch (error) {
    return createIpcErrorResponse('class/reorderMember', error, 'E_CLASS_REORDER_MEMBER', 'Не удалось изменить порядок полей класса');
  }
};

export const handleClassReorderMethod = async (
  state: GraphState,
  payload: unknown,
  applyState: (patch: Partial<GraphState>) => void
): Promise<Extract<ExternalIpcResponse, { type: 'class/reorderMethod' }>> => {
  const parsedPayload = classReorderMethodRequestSchema.shape.payload.safeParse(payload);
  if (!parsedPayload.success) {
    return createIpcErrorResponse('class/reorderMethod', parsedPayload.error, 'E_CLASS_REORDER_METHOD_VALIDATION', 'Некорректный payload class/reorderMethod');
  }

  try {
    const classes = (state.classes ?? []) as BlueprintClass[];
    const classEntry = classes.find((item) => item.id === parsedPayload.data.classId);
    if (!classEntry) {
      return createIpcErrorResponse('class/reorderMethod', 'Класс не найден', 'E_CLASS_NOT_FOUND', 'Класс не найден');
    }

    const reordered = moveItem(classEntry.methods, parsedPayload.data.methodId, parsedPayload.data.targetIndex);
    if (!reordered) {
      return createIpcErrorResponse('class/reorderMethod', 'Метод класса не найден', 'E_CLASS_METHOD_NOT_FOUND', 'Метод класса не найден');
    }

    const nextClasses = classes.map((item) => (item.id === classEntry.id ? { ...item, methods: reordered } : item));
    applyState({ classes: nextClasses });
    return { type: 'class/reorderMethod', ok: true, payload: parsedPayload.data };
  } catch (error) {
    return createIpcErrorResponse('class/reorderMethod', error, 'E_CLASS_REORDER_METHOD', 'Не удалось изменить порядок методов класса');
  }
};
