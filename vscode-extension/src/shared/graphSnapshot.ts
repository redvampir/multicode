import type { GraphState } from './graphState';
import { parseGraphState } from './messages';
import { deserializeGraphState, serializeGraphState } from './serializer';

const GRAPH_MARKER_REGEX = /^\/\/\s*@multicode:graph\b/i;
const CLASS_MARKER_REGEX = /^\/\/\s*@multicode:class\b/i;
const SNAPSHOT_BEGIN_REGEX = /^\/\/\s*@multicode:snapshot\s+begin\b/i;
const SNAPSHOT_END_REGEX = /^\/\/\s*@multicode:snapshot\s+end\b/i;
const SNAPSHOT_CHUNK_REGEX = /^\/\/\s*@multicode:snapshot\s+chunk\s+([A-Za-z0-9+/=]+)\s*$/;
const SNAPSHOT_CHUNK_SIZE = 120;
const SNAPSHOT_HEADER = '// @multicode:snapshot begin format=graph-state-v2 encoding=base64';
const SNAPSHOT_FOOTER = '// @multicode:snapshot end';

const detectEol = (text: string): string => (text.includes('\r\n') ? '\r\n' : '\n');

const splitLines = (text: string): string[] => text.split(/\r?\n/);

const joinLines = (lines: string[], eol: string, hadTrailingEol: boolean): string => {
  const body = lines.join(eol);
  if (!hadTrailingEol || body.length === 0) {
    return body;
  }
  return `${body}${eol}`;
};

const normalizeSnapshotGraphState = (state: GraphState): GraphState => ({
  ...state,
  integrationBindings: state.integrationBindings ?? [],
  symbolLocalization: state.symbolLocalization ?? {},
  dirty: false,
});

const encodeSnapshotPayload = (state: GraphState): string => {
  const serialized = serializeGraphState(normalizeSnapshotGraphState(state));
  const payload = JSON.stringify(serialized);
  return Buffer.from(payload, 'utf8').toString('base64');
};

const decodeSnapshotPayload = (base64Payload: string): GraphState | null => {
  try {
    const decodedText = Buffer.from(base64Payload, 'base64').toString('utf8');
    const parsed = JSON.parse(decodedText);
    try {
      return normalizeSnapshotGraphState(deserializeGraphState(parsed));
    } catch {
      // Фолбэк для legacy snapshot, где лежит только GraphState.
    }

    const graphParsed = parseGraphState(parsed);
    if (graphParsed.success) {
      return normalizeSnapshotGraphState(graphParsed.data);
    }
    return null;
  } catch {
    return null;
  }
};

const stripSnapshotBlocks = (lines: string[]): string[] => {
  const next: string[] = [];
  let insideSnapshot = false;
  for (const line of lines) {
    if (!insideSnapshot && SNAPSHOT_BEGIN_REGEX.test(line.trim())) {
      insideSnapshot = true;
      continue;
    }
    if (insideSnapshot) {
      if (SNAPSHOT_END_REGEX.test(line.trim())) {
        insideSnapshot = false;
      }
      continue;
    }
    next.push(line);
  }
  return next;
};

const buildSnapshotLines = (state: GraphState): string[] => {
  const encodedPayload = encodeSnapshotPayload(state);
  const chunks: string[] = [];
  for (let offset = 0; offset < encodedPayload.length; offset += SNAPSHOT_CHUNK_SIZE) {
    chunks.push(encodedPayload.slice(offset, offset + SNAPSHOT_CHUNK_SIZE));
  }

  const lines = [SNAPSHOT_HEADER];
  for (const chunk of chunks) {
    lines.push(`// @multicode:snapshot chunk ${chunk}`);
  }
  lines.push(SNAPSHOT_FOOTER);
  return lines;
};

export const removeMulticodeGraphSnapshot = (source: string): string => {
  const eol = detectEol(source);
  const hadTrailingEol = /\r?\n$/.test(source);
  const sourceLines = splitLines(source);
  const cleanLines = stripSnapshotBlocks(sourceLines);
  return joinLines(cleanLines, eol, hadTrailingEol);
};

export const injectOrReplaceMulticodeGraphSnapshot = (source: string, state: GraphState): string => {
  const eol = detectEol(source);
  const hadTrailingEol = /\r?\n$/.test(source);
  const sourceLines = splitLines(source);
  const cleanLines = stripSnapshotBlocks(sourceLines);
  const snapshotLines = buildSnapshotLines(state);
  const graphMarkerIndex = cleanLines.findIndex((line) => GRAPH_MARKER_REGEX.test(line.trim()));
  let insertAt = graphMarkerIndex >= 0 ? graphMarkerIndex + 1 : 0;
  if (graphMarkerIndex >= 0) {
    // Если сразу после @multicode:graph идёт блок @multicode:class, не разрываем его snapshot'ом.
    while (insertAt < cleanLines.length && CLASS_MARKER_REGEX.test((cleanLines[insertAt] ?? '').trim())) {
      insertAt += 1;
    }
  }

  const nextLines = [
    ...cleanLines.slice(0, insertAt),
    ...snapshotLines,
    ...cleanLines.slice(insertAt),
  ];
  return joinLines(nextLines, eol, hadTrailingEol);
};

export const tryExtractMulticodeGraphSnapshot = (source: string): GraphState | null => {
  const lines = splitLines(source);
  let insideSnapshot = false;
  const chunks: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!insideSnapshot) {
      if (SNAPSHOT_BEGIN_REGEX.test(line)) {
        insideSnapshot = true;
      }
      continue;
    }

    if (SNAPSHOT_END_REGEX.test(line)) {
      break;
    }

    const chunkMatch = line.match(SNAPSHOT_CHUNK_REGEX);
    if (chunkMatch?.[1]) {
      chunks.push(chunkMatch[1]);
    }
  }

  if (chunks.length === 0) {
    return null;
  }
  return decodeSnapshotPayload(chunks.join(''));
};
