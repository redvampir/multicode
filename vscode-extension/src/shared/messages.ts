import { z } from 'zod';
import { type GraphState } from './graphState';
import type { ValidationResult } from './validator';

const positionSchema = z.object({
  x: z.number(),
  y: z.number()
});

const graphNodeTypeSchema = z.enum(['Start', 'Function', 'End', 'Variable', 'Custom']);
const graphLanguageSchema = z.enum(['cpp', 'rust', 'asm']);
const graphDisplayLanguageSchema = z.enum(['ru', 'en']);
const graphEdgeKindSchema = z.enum(['execution', 'data']);

const graphNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: graphNodeTypeSchema,
  position: positionSchema.optional()
});

const graphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
  kind: graphEdgeKindSchema.optional()
});

const graphStateSchema: z.ZodType<GraphState> = z.object({
  id: z.string(),
  name: z.string(),
  language: graphLanguageSchema,
  displayLanguage: graphDisplayLanguageSchema,
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
  updatedAt: z.string(),
  dirty: z.boolean().optional()
});

const translationDirectionSchema = z.enum(['ru-en', 'en-ru']);

const graphMutationSchema = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string(),
        label: z.string().optional(),
        type: graphNodeTypeSchema.optional(),
        position: positionSchema.optional()
      })
    )
    .optional(),
  edges: z.array(graphEdgeSchema).optional(),
  name: z.string().optional(),
  language: graphLanguageSchema.optional(),
  displayLanguage: graphDisplayLanguageSchema.optional()
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

export const extensionToWebviewMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('setState'), payload: graphStateSchema }),
  z.object({ type: z.literal('toast'), payload: toastPayloadSchema }),
  z.object({ type: z.literal('validationResult'), payload: z.custom<ValidationResult>() }),
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
  z.object({ type: z.literal('log'), payload: logPayloadSchema })
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
  z.object({ type: z.literal('requestValidate') }),
  z.object({ type: z.literal('graphChanged'), payload: graphMutationSchema }),
  z.object({ type: z.literal('reportWebviewError'), payload: z.object({ message: z.string() }) })
]);

export type ExtensionToWebviewMessage = z.infer<typeof extensionToWebviewMessageSchema>;
export type WebviewToExtensionMessage = z.infer<typeof webviewToExtensionMessageSchema>;

export type ThemeMessage = z.infer<typeof themeMessageSchema>;
export type TranslationDirection = z.infer<typeof translationDirectionSchema>;
export type ToastPayload = z.infer<typeof toastPayloadSchema>;
export type LogPayload = z.infer<typeof logPayloadSchema>;
export type GraphMutationPayload = z.infer<typeof graphMutationSchema>;
export type GraphStateSchema = typeof graphStateSchema;
export type GraphNodeSchema = typeof graphNodeSchema;
export type GraphEdgeSchema = typeof graphEdgeSchema;
export type PositionSchema = typeof positionSchema;
export type GraphNodeTypeSchema = typeof graphNodeTypeSchema;
export type GraphLanguageSchema = typeof graphLanguageSchema;
export type GraphDisplayLanguageSchema = typeof graphDisplayLanguageSchema;
export type GraphEdgeKindSchema = typeof graphEdgeKindSchema;

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

