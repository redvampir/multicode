import { z } from 'zod';
import type { GraphState } from './graphState';
import { graphStateSchema } from './messages';

const GRAPH_SCHEMA_VERSION = 3;
const LEGACY_SCHEMA_VERSION = 2;
const DEFAULT_UE_CLASS_MACRO = 'UCLASS(BlueprintType)';
const DEFAULT_UE_GENERATED_BODY_MACRO = 'GENERATED_BODY()';
const DEFAULT_UE_METHOD_MACRO = 'UFUNCTION(BlueprintCallable, Category = "MultiCode")';

export type SerializedGraph = {
  schemaVersion: number;
  version: number;
  savedAt: string;
  data: GraphState;
};

export type LegacySerializedGraph = {
  version: number;
  savedAt: string;
  data: GraphState;
};

export type SerializedGraphDocument = SerializedGraph | LegacySerializedGraph;

type LegacyGraphEnvelope = {
  version?: number;
  schemaVersion?: number;
  savedAt?: string;
  graph: GraphState;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeUeClassExtensions = (classes: GraphState['classes']): GraphState['classes'] => {
  if (!Array.isArray(classes)) {
    return classes;
  }

  return classes.map((entry) => {
    if (!isRecord(entry)) {
      return entry;
    }

    const extensions = isRecord(entry.extensions) ? entry.extensions : {};
    const ue = isRecord(extensions.ue) ? extensions.ue : {};

    return {
      ...entry,
      extensions: {
        ...extensions,
        ue: {
          classMacro:
            typeof ue.classMacro === 'string' && ue.classMacro.trim().length > 0
              ? ue.classMacro
              : DEFAULT_UE_CLASS_MACRO,
          generatedBodyMacro:
            typeof ue.generatedBodyMacro === 'string' && ue.generatedBodyMacro.trim().length > 0
              ? ue.generatedBodyMacro
              : DEFAULT_UE_GENERATED_BODY_MACRO,
          methodMacro:
            typeof ue.methodMacro === 'string' && ue.methodMacro.trim().length > 0
              ? ue.methodMacro
              : DEFAULT_UE_METHOD_MACRO,
        },
      },
    };
  });
};

const normalizeGraphState = (state: GraphState, schemaVersion: number): GraphState => {
  const normalizedVersion = state.graphVersion ?? Math.max(schemaVersion, GRAPH_SCHEMA_VERSION);
  return {
    ...state,
    graphVersion: normalizedVersion,
    integrationBindings: state.integrationBindings ?? [],
    symbolLocalization: state.symbolLocalization ?? {},
    classes: normalizeUeClassExtensions(state.classes),
  };
};

export const serializeGraphState = (
  state: GraphState,
  options: { mode?: 'modern' | 'legacy' } = {}
): SerializedGraphDocument => {
  const mode = options.mode ?? 'modern';
  const savedAt = new Date().toISOString();

  if (mode === 'legacy') {
    return {
      version: LEGACY_SCHEMA_VERSION,
      savedAt,
      data: {
        ...state,
      },
    };
  }

  const normalizedState = normalizeGraphState(state, GRAPH_SCHEMA_VERSION);

  return {
    schemaVersion: GRAPH_SCHEMA_VERSION,
    version: GRAPH_SCHEMA_VERSION,
    savedAt,
    data: normalizedState,
  };
};

const modernSerializedGraphSchema = z.object({
  schemaVersion: z.number().int().positive(),
  version: z.number().int().positive().optional(),
  savedAt: z.string(),
  data: graphStateSchema,
});

const legacySerializedGraphSchema = z.object({
  version: z.number().int().positive(),
  savedAt: z.string(),
  data: graphStateSchema,
});

const serializedGraphSchema = z.union([modernSerializedGraphSchema, legacySerializedGraphSchema]);

type ParsedSerializedGraph = z.infer<typeof serializedGraphSchema>;

const legacyGraphEnvelopeSchema: z.ZodType<LegacyGraphEnvelope> = z.object({
  version: z.number().int().positive().optional(),
  schemaVersion: z.number().int().positive().optional(),
  savedAt: z.string().optional(),
  graph: graphStateSchema,
});

const normalizeLegacyInput = (input: unknown): unknown => {
  const directState = graphStateSchema.safeParse(input);
  if (directState.success) {
    return {
      version: LEGACY_SCHEMA_VERSION,
      savedAt: directState.data.updatedAt,
      data: directState.data,
    } satisfies LegacySerializedGraph;
  }

  const legacyEnvelope = legacyGraphEnvelopeSchema.safeParse(input);
  if (legacyEnvelope.success) {
    return {
      version: legacyEnvelope.data.version ?? legacyEnvelope.data.schemaVersion ?? LEGACY_SCHEMA_VERSION,
      savedAt: legacyEnvelope.data.savedAt ?? legacyEnvelope.data.graph.updatedAt,
      data: legacyEnvelope.data.graph,
    } satisfies LegacySerializedGraph;
  }

  return input;
};

const migrateSerializedGraph = (serialized: ParsedSerializedGraph): SerializedGraph => {
  const sourceSchemaVersion =
    'schemaVersion' in serialized
      ? serialized.schemaVersion
      : Math.max(serialized.version ?? LEGACY_SCHEMA_VERSION, LEGACY_SCHEMA_VERSION);

  return {
    schemaVersion: GRAPH_SCHEMA_VERSION,
    version: GRAPH_SCHEMA_VERSION,
    savedAt: serialized.savedAt,
    data: normalizeGraphState(serialized.data, sourceSchemaVersion),
  };
};

export const parseSerializedGraph = (data: unknown): ReturnType<typeof serializedGraphSchema.safeParse> =>
  serializedGraphSchema.safeParse(normalizeLegacyInput(data));

export const deserializeGraphState = (input: unknown): GraphState => {
  const parsed = parseSerializedGraph(input);
  if (!parsed.success) {
    throw new Error('Invalid graph format');
  }
  return migrateSerializedGraph(parsed.data).data;
};
