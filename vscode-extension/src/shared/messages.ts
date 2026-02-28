import { z } from 'zod';
import { type GraphState } from './graphState';
import type { SourceIntegration, SymbolDescriptor, SymbolLocalizationEntry } from './externalSymbols';

const positionSchema = z.object({
  x: z.number(),
  y: z.number()
});

const graphNodeTypeSchema = z.enum(['Start', 'Function', 'End', 'Variable', 'Custom']);
const graphLanguageSchema = z.enum(['cpp', 'rust', 'asm']);
const graphDisplayLanguageSchema = z.enum(['ru', 'en']);
const graphEdgeKindSchema = z.enum(['execution', 'data']);
const cppStandardSchema = z.enum(['cpp14', 'cpp17', 'cpp20', 'cpp23']);
const codegenOutputProfileSchema = z.enum(['clean', 'learn', 'debug', 'recovery']);

const graphNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: graphNodeTypeSchema,
  position: positionSchema.optional(),
  blueprintNode: z.unknown().optional()
});

const graphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
  kind: graphEdgeKindSchema.optional(),
  blueprintEdge: z.unknown().optional()
});

const sourceIntegrationSchema: z.ZodType<SourceIntegration> = z.object({
  integrationId: z.string(),
  attachedFiles: z.array(z.string()),
  mode: z.enum(['explicit', 'implicit']),
  kind: z.enum(['library', 'framework', 'file']).optional(),
  displayName: z.string().optional(),
  version: z.string().optional(),
});

const symbolLocalizationEntrySchema: z.ZodType<SymbolLocalizationEntry> = z.object({
  integrationId: z.string(),
  symbolId: z.string(),
  signatureHash: z.string().optional(),
  localizedNameRu: z.string().optional(),
  localizedNameEn: z.string().optional(),
});

const symbolDescriptorSchema: z.ZodType<SymbolDescriptor> = z.object({
  id: z.string(),
  integrationId: z.string(),
  symbolKind: z.enum(['function', 'variable', 'class', 'struct', 'method', 'enum']),
  name: z.string(),
  signatureHash: z.string().optional(),
  namespacePath: z.array(z.string()).optional(),
});

export const ipcErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export const graphStateSchema: z.ZodType<GraphState> = z.object({
  id: z.string(),
  name: z.string(),
  graphVersion: z.number().int().positive().optional(),
  language: graphLanguageSchema,
  displayLanguage: graphDisplayLanguageSchema,
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
  updatedAt: z.string(),
  dirty: z.boolean().optional(),
  // Blueprint-style расширения
  variables: z.array(z.unknown()).optional(),
  functions: z.array(z.unknown()).optional(),
  integrationBindings: z.array(sourceIntegrationSchema).optional(),
  symbolLocalization: z.record(z.string(), symbolLocalizationEntrySchema).optional(),
});

const translationDirectionSchema = z.enum(['ru-en', 'en-ru']);

const graphMutationSchema = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string(),
        label: z.string().optional(),
        type: graphNodeTypeSchema.optional(),
        position: positionSchema.optional(),
        blueprintNode: z.unknown().optional()
      })
    )
    .optional(),
  edges: z.array(graphEdgeSchema).optional(),
  name: z.string().optional(),
  language: graphLanguageSchema.optional(),
  displayLanguage: graphDisplayLanguageSchema.optional(),
  // Blueprint-style расширения
  variables: z.array(z.unknown()).optional(),
  functions: z.array(z.unknown()).optional(),
});

const themeMessageSchema = z.object({
  preference: z.enum(['auto', 'dark', 'light']),
  hostTheme: z.enum(['dark', 'light']),
  displayLanguage: graphDisplayLanguageSchema.optional()
});

const toastPayloadSchema = z.object({
  kind: z.enum(['info', 'success', 'warning', 'error']),
  message: z.string()
});

const logPayloadSchema = z.object({
  level: z.enum(['info', 'warn', 'error']),
  message: z.string()
});

const webviewTracePayloadSchema = z.object({
  category: z.string(),
  message: z.string(),
  data: z.unknown().optional(),
});

const validationIssueSchema = z.object({
  severity: z.enum(['error', 'warning']),
  message: z.string(),
  nodes: z.array(z.string()).optional(),
  edges: z.array(z.string()).optional()
});

export const validationResultSchema = z.object({
  ok: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  issues: z.array(validationIssueSchema).optional()
});

const makeIpcResponseSchema = <TType extends string, TPayload extends z.ZodTypeAny>(
  type: TType,
  payloadSchema: TPayload
) =>
  z.discriminatedUnion('ok', [
    z.object({
      type: z.literal(type),
      ok: z.literal(true),
      payload: payloadSchema,
    }),
    z.object({
      type: z.literal(type),
      ok: z.literal(false),
      error: ipcErrorSchema,
    }),
  ]);

const integrationAddRequestSchema = z.object({
  type: z.literal('integration/add'),
  payload: z.object({
    integration: sourceIntegrationSchema,
  }),
});

const integrationRemoveRequestSchema = z.object({
  type: z.literal('integration/remove'),
  payload: z.object({
    integrationId: z.string(),
  }),
});

const integrationListRequestSchema = z.object({
  type: z.literal('integration/list'),
  payload: z.object({
    includeImplicit: z.boolean().optional(),
  }).optional(),
});

const integrationReindexRequestSchema = z.object({
  type: z.literal('integration/reindex'),
  payload: z.object({
    integrationId: z.string().optional(),
    force: z.boolean().optional(),
  }).optional(),
});

const integrationDiagnosticsRequestSchema = z.object({
  type: z.literal('integration/diagnostics'),
  payload: z.object({
    integrationId: z.string().optional(),
  }).optional(),
});

const symbolsQueryRequestSchema = z.object({
  type: z.literal('symbols/query'),
  payload: z.object({
    query: z.string(),
    integrationId: z.string().optional(),
    limit: z.number().int().positive().max(500).optional(),
  }),
});

const dependencyMapGetRequestSchema = z.object({
  type: z.literal('dependency-map/get'),
  payload: z.object({
    rootFile: z.string().optional(),
    includeSystem: z.boolean().optional(),
  }).optional(),
});

const integrationAddResponseSchema = makeIpcResponseSchema(
  'integration/add',
  z.object({ integration: sourceIntegrationSchema })
);
const integrationRemoveResponseSchema = makeIpcResponseSchema(
  'integration/remove',
  z.object({ integrationId: z.string(), removed: z.boolean() })
);
const integrationListResponseSchema = makeIpcResponseSchema(
  'integration/list',
  z.object({ integrations: z.array(sourceIntegrationSchema) })
);
const integrationReindexResponseSchema = makeIpcResponseSchema(
  'integration/reindex',
  z.object({ integrationId: z.string().nullable(), indexedSymbols: z.number().int().nonnegative() })
);
const integrationDiagnosticsResponseSchema = makeIpcResponseSchema(
  'integration/diagnostics',
  z.object({
    diagnostics: z.array(
      z.object({
        integrationId: z.string(),
        level: z.enum(['info', 'warning', 'error']),
        message: z.string(),
      })
    ),
  })
);
const symbolsQueryResponseSchema = makeIpcResponseSchema(
  'symbols/query',
  z.object({ symbols: z.array(symbolDescriptorSchema) })
);
const dependencyMapGetResponseSchema = makeIpcResponseSchema(
  'dependency-map/get',
  z.object({
    nodes: z.array(
      z.object({
        id: z.string(),
        kind: z.enum(['file', 'library', 'framework']),
      })
    ),
    edges: z.array(
      z.object({
        from: z.string(),
        to: z.string(),
      })
    ),
  })
);

export const externalIpcRequestSchema = z.discriminatedUnion('type', [
  integrationAddRequestSchema,
  integrationRemoveRequestSchema,
  integrationListRequestSchema,
  integrationReindexRequestSchema,
  integrationDiagnosticsRequestSchema,
  symbolsQueryRequestSchema,
  dependencyMapGetRequestSchema,
]);

export const externalIpcResponseSchema = z.union([
  integrationAddResponseSchema,
  integrationRemoveResponseSchema,
  integrationListResponseSchema,
  integrationReindexResponseSchema,
  integrationDiagnosticsResponseSchema,
  symbolsQueryResponseSchema,
  dependencyMapGetResponseSchema,
]);

export const extensionToWebviewMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('setState'), payload: graphStateSchema }),
  z.object({ type: z.literal('toast'), payload: toastPayloadSchema }),
  z.object({ type: z.literal('validationResult'), payload: validationResultSchema }),
  z.object({ type: z.literal('themeChanged'), payload: themeMessageSchema }),
  z.object({ type: z.literal('nodeAdded'), payload: z.object({ node: graphNodeSchema }) }),
  z.object({ type: z.literal('nodesConnected'), payload: z.object({ edge: graphEdgeSchema }) }),
  z.object({ type: z.literal('nodesDeleted'), payload: z.object({ nodeIds: z.array(z.string()) }) }),
  z.object({
    type: z.literal('translationStarted'),
    payload: z.object({ direction: translationDirectionSchema })
  }),
  z.object({
    type: z.literal('translationFinished'),
    payload: z.object({ success: z.boolean() })
  }),
  z.object({ type: z.literal('log'), payload: logPayloadSchema }),
  z.object({
    type: z.literal('boundFileChanged'),
    payload: z.object({
      fileName: z.string().nullable(),
      filePath: z.string().nullable(),
    })
  }),
  z.object({
    type: z.literal('codegenProfileChanged'),
    payload: z.object({
      profile: codegenOutputProfileSchema
    })
  })
]);

export const webviewToExtensionMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({
    type: z.literal('addNode'),
    payload: z
      .object({ label: z.string().optional(), nodeType: graphNodeTypeSchema.optional() })
      .optional()
  }),
  z.object({
    type: z.literal('connectNodes'),
    payload: z
      .object({
        sourceId: z.string().optional(),
        targetId: z.string().optional(),
        label: z.string().optional()
      })
      .optional()
  }),
  z.object({ type: z.literal('deleteNodes'), payload: z.object({ nodeIds: z.array(z.string()) }) }),
  z.object({ type: z.literal('renameGraph'), payload: z.object({ name: z.string() }) }),
  z.object({ type: z.literal('updateLanguage'), payload: z.object({ language: graphLanguageSchema }) }),
  z.object({
    type: z.literal('changeDisplayLanguage'),
    payload: z.object({ locale: graphDisplayLanguageSchema })
  }),
  z.object({
    type: z.literal('requestTranslate'),
    payload: z.object({ direction: translationDirectionSchema.optional() }).optional()
  }),
  z.object({ type: z.literal('requestSave') }),
  z.object({ type: z.literal('requestLoad') }),
  z.object({ type: z.literal('requestNewGraph') }),
  z.object({ type: z.literal('requestGenerate') }),
  z.object({ type: z.literal('requestGenerateBinding') }),
  z.object({ type: z.literal('requestValidate') }),
  z.object({
    type: z.literal('requestCompileAndRun'),
    payload: z.object({ standard: cppStandardSchema.optional() }).optional(),
  }),
  z.object({
    type: z.literal('setCodegenProfile'),
    payload: z.object({ profile: codegenOutputProfileSchema }),
  }),
  z.object({ type: z.literal('graphChanged'), payload: graphMutationSchema }),
  z.object({ type: z.literal('reportWebviewError'), payload: z.object({ message: z.string() }) }),
  z.object({ type: z.literal('reportWebviewTrace'), payload: webviewTracePayloadSchema })
]);

export type ExtensionToWebviewMessage = z.infer<typeof extensionToWebviewMessageSchema>;
export type WebviewToExtensionMessage = z.infer<typeof webviewToExtensionMessageSchema>;
export type IpcError = z.infer<typeof ipcErrorSchema>;
export type ExternalIpcRequest = z.infer<typeof externalIpcRequestSchema>;
export type ExternalIpcResponse = z.infer<typeof externalIpcResponseSchema>;

export type IpcSuccessResponse<TType extends string, TPayload> = {
  type: TType;
  ok: true;
  payload: TPayload;
};

export type IpcErrorResponse<TType extends string> = {
  type: TType;
  ok: false;
  error: IpcError;
};

export type TypedIpcResponse<TType extends string, TPayload> =
  | IpcSuccessResponse<TType, TPayload>
  | IpcErrorResponse<TType>;

export type ExtractIpcSuccess<TResponse extends { ok: boolean }> = Extract<TResponse, { ok: true }>;
export type ExtractIpcError<TResponse extends { ok: boolean }> = Extract<TResponse, { ok: false }>;

export type ThemeMessage = z.infer<typeof themeMessageSchema>;
export type TranslationDirection = z.infer<typeof translationDirectionSchema>;
export type ToastPayload = z.infer<typeof toastPayloadSchema>;
export type LogPayload = z.infer<typeof logPayloadSchema>;
export type WebviewTracePayload = z.infer<typeof webviewTracePayloadSchema>;
export type GraphMutationPayload = z.infer<typeof graphMutationSchema>;
export type GraphStateSchema = typeof graphStateSchema;
export type GraphNodeSchema = typeof graphNodeSchema;
export type GraphEdgeSchema = typeof graphEdgeSchema;
export type PositionSchema = typeof positionSchema;
export type GraphNodeTypeSchema = typeof graphNodeTypeSchema;
export type GraphLanguageSchema = typeof graphLanguageSchema;
export type GraphDisplayLanguageSchema = typeof graphDisplayLanguageSchema;
export type GraphEdgeKindSchema = typeof graphEdgeKindSchema;
export type ValidationIssue = z.infer<typeof validationIssueSchema>;
export type ValidationResult = z.infer<typeof validationResultSchema>;

export const isExtensionMessage = (data: unknown): data is ExtensionToWebviewMessage =>
  extensionToWebviewMessageSchema.safeParse(data).success;

export const isWebviewMessage = (data: unknown): data is WebviewToExtensionMessage =>
  webviewToExtensionMessageSchema.safeParse(data).success;

export const parseExtensionMessage = (
  data: unknown
): ReturnType<typeof extensionToWebviewMessageSchema.safeParse> =>
  extensionToWebviewMessageSchema.safeParse(data);

export const parseWebviewMessage = (
  data: unknown
): ReturnType<typeof webviewToExtensionMessageSchema.safeParse> =>
  webviewToExtensionMessageSchema.safeParse(data);

export const parseGraphState = (data: unknown): ReturnType<typeof graphStateSchema.safeParse> =>
  graphStateSchema.safeParse(data);

export const parseGraphEdge = (data: unknown): ReturnType<typeof graphEdgeSchema.safeParse> =>
  graphEdgeSchema.safeParse(data);

export const parseGraphNode = (data: unknown): ReturnType<typeof graphNodeSchema.safeParse> =>
  graphNodeSchema.safeParse(data);

export const parseThemeMessage = (data: unknown): ReturnType<typeof themeMessageSchema.safeParse> =>
  themeMessageSchema.safeParse(data);

export const parseExternalIpcRequest = (
  data: unknown
): ReturnType<typeof externalIpcRequestSchema.safeParse> =>
  externalIpcRequestSchema.safeParse(data);

export const parseExternalIpcResponse = (
  data: unknown
): ReturnType<typeof externalIpcResponseSchema.safeParse> =>
  externalIpcResponseSchema.safeParse(data);
