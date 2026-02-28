import { z } from 'zod';
import type { GraphState } from './graphState';
import { graphStateSchema } from './messages';

const GRAPH_SCHEMA_VERSION = 2;

export interface SerializedGraph {
  version: number;
  savedAt: string;
  data: GraphState;
}

export const serializeGraphState = (state: GraphState): SerializedGraph => ({
  version: GRAPH_SCHEMA_VERSION,
  savedAt: new Date().toISOString(),
  data: state
});

const serializedGraphSchema = z.object({
  version: z.number(),
  savedAt: z.string(),
  data: graphStateSchema
});

const normalizeGraphState = (state: GraphState, version: number): GraphState => {
  const normalizedVersion = state.graphVersion ?? Math.max(version, GRAPH_SCHEMA_VERSION);
  return {
    ...state,
    graphVersion: normalizedVersion,
    integrationBindings: state.integrationBindings ?? [],
    symbolLocalization: state.symbolLocalization ?? {},
  };
};

const migrateSerializedGraph = (serialized: SerializedGraph): SerializedGraph => {
  if (serialized.version >= GRAPH_SCHEMA_VERSION) {
    return {
      ...serialized,
      data: normalizeGraphState(serialized.data, serialized.version),
    };
  }

  return {
    ...serialized,
    version: GRAPH_SCHEMA_VERSION,
    data: normalizeGraphState(serialized.data, serialized.version),
  };
};

export const parseSerializedGraph = (data: unknown): ReturnType<typeof serializedGraphSchema.safeParse> =>
  serializedGraphSchema.safeParse(data);

export const deserializeGraphState = (input: unknown): GraphState => {
  const parsed = parseSerializedGraph(input);
  if (!parsed.success) {
    throw new Error('Invalid graph format');
  }
  return migrateSerializedGraph(parsed.data).data;
};
