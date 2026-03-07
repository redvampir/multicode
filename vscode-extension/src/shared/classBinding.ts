export interface MulticodeClassBinding {
  classId: string;
  file?: string;
}

const GRAPH_MARKER = '@multicode:graph';
const CLASS_MARKER = '@multicode:class';
const CLASS_MARKER_REGEX = /^\/\/\s*@multicode:class\b/i;

const normalizeLine = (value: string): string => value.replace(/\r?\n/g, '');

const detectEol = (text: string): string => (text.includes('\r\n') ? '\r\n' : '\n');

const joinLines = (lines: string[], eol: string, hadTrailingEol: boolean): string => {
  const body = lines.join(eol);
  if (!hadTrailingEol || body.length === 0) {
    return body;
  }
  return `${body}${eol}`;
};

const isClassBindingLine = (line: string): boolean => CLASS_MARKER_REGEX.test(line.trim());

const dedupeBindings = (bindings: MulticodeClassBinding[]): MulticodeClassBinding[] => {
  const seen = new Set<string>();
  const unique: MulticodeClassBinding[] = [];
  for (const binding of bindings) {
    const id = typeof binding.classId === 'string' ? binding.classId.trim() : '';
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    unique.push({ classId: id, ...(binding.file ? { file: binding.file } : {}) });
  }
  return unique;
};

export const tryParseMulticodeClassBindingLine = (line: string): MulticodeClassBinding | null => {
  const normalized = normalizeLine(line).trim();
  if (normalized.length === 0) {
    return null;
  }

  const match = normalized.match(/^\/\/\s*@multicode:class\b(.*)$/);
  if (!match) {
    return null;
  }

  const tail = (match[1] ?? '').trim();
  if (tail.length === 0) {
    return null;
  }

  const tokens = tail.split(/\s+/).filter(Boolean);
  const result: Partial<MulticodeClassBinding> = {};

  for (const token of tokens) {
    const eq = token.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = token.slice(0, eq).trim();
    const value = token.slice(eq + 1).trim();
    if (!value) {
      continue;
    }

    if (key === 'id') {
      result.classId = value;
      continue;
    }

    if (key === 'file') {
      result.file = value;
    }
  }

  if (!result.classId) {
    return null;
  }

  return { classId: result.classId, ...(result.file ? { file: result.file } : {}) };
};

export const findMulticodeClassBindingsInSource = (
  sourceText: string,
  maxLines: number = 10
): MulticodeClassBinding[] => {
  if (typeof sourceText !== 'string' || sourceText.length === 0) {
    return [];
  }

  const lines = sourceText.split(/\r?\n/);
  const limit = Math.max(1, Math.min(maxLines, lines.length));
  const bindings: MulticodeClassBinding[] = [];

  for (let index = 0; index < limit; index += 1) {
    const parsed = tryParseMulticodeClassBindingLine(lines[index] ?? '');
    if (parsed) {
      bindings.push(parsed);
    }
  }

  return dedupeBindings(bindings);
};

export const formatMulticodeClassBindingLine = (binding: MulticodeClassBinding): string => {
  const filePart = binding.file ? ` file=${binding.file}` : '';
  return `// ${CLASS_MARKER} id=${binding.classId}${filePart}`;
};

export const injectOrReplaceMulticodeClassBindingsBlock = (
  sourceText: string,
  bindings: MulticodeClassBinding[]
): string => {
  const normalizedBindings = dedupeBindings(bindings).map((binding) =>
    normalizeLine(formatMulticodeClassBindingLine(binding))
  );

  const eol = detectEol(sourceText);
  const hadTrailingEol = /\r?\n$/.test(sourceText);
  const lines = sourceText.split(/\r?\n/);

  const graphIndex = lines.findIndex((line) => (line ?? '').includes(GRAPH_MARKER));

  let blockStart = -1;
  let blockEnd = -1;

  if (graphIndex >= 0) {
    let cursor = graphIndex + 1;
    if (cursor < lines.length && isClassBindingLine(lines[cursor] ?? '')) {
      blockStart = cursor;
      while (cursor < lines.length && isClassBindingLine(lines[cursor] ?? '')) {
        cursor += 1;
      }
      blockEnd = cursor;
    }
  }

  if (blockStart < 0) {
    const firstIndex = lines.findIndex((line) => isClassBindingLine(line ?? ''));
    if (firstIndex >= 0) {
      blockStart = firstIndex;
      let cursor = firstIndex;
      while (cursor < lines.length && isClassBindingLine(lines[cursor] ?? '')) {
        cursor += 1;
      }
      blockEnd = cursor;
    }
  }

  if (blockStart >= 0 && blockEnd >= blockStart) {
    const nextLines = [
      ...lines.slice(0, blockStart),
      ...normalizedBindings,
      ...lines.slice(blockEnd),
    ];
    return joinLines(nextLines, eol, hadTrailingEol);
  }

  if (normalizedBindings.length === 0) {
    return sourceText;
  }

  const insertAt = graphIndex >= 0 ? graphIndex + 1 : 0;
  const nextLines = [
    ...lines.slice(0, insertAt),
    ...normalizedBindings,
    ...lines.slice(insertAt),
  ];
  return joinLines(nextLines, eol, hadTrailingEol);
};

