import type { GraphState } from './graphState';

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

export const deserializeGraphState = (input: unknown): GraphState => {
  if (!input || typeof input !== 'object') {
    throw new Error('File does not contain graph data');
  }
  const payload = input as Partial<SerializedGraph>;
  if (typeof payload.version !== 'number' || !payload.data) {
    throw new Error('Invalid graph format');
  }
  return payload.data;
};
