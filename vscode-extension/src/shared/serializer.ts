import { z } from 'zod';
import type { GraphState } from './graphState';
import { graphStateSchema } from './messages';

const GRAPH_SCHEMA_VERSION = 1;

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

export const parseSerializedGraph = (data: unknown): ReturnType<typeof serializedGraphSchema.safeParse> =>
  serializedGraphSchema.safeParse(data);

export const deserializeGraphState = (input: unknown): GraphState => {
  const parsed = parseSerializedGraph(input);
  if (!parsed.success) {
    throw new Error('Invalid graph format');
  }
  return parsed.data.data;
};
