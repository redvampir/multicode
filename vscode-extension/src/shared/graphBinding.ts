import * as path from 'path';

export interface MulticodeGraphBinding {
  graphId: string;
  file?: string;
}

const MARKER = '@multicode:graph';

const normalizeLine = (value: string): string => value.replace(/\r?\n/g, '');

export const tryParseMulticodeGraphBindingLine = (line: string): MulticodeGraphBinding | null => {
  const normalized = normalizeLine(line).trim();
  if (normalized.length === 0) {
    return null;
  }

  // C++/Rust style comment: // @multicode:graph id=... file=...
  const match = normalized.match(/^\/\/\s*@multicode:graph\b(.*)$/);
  if (!match) {
    return null;
  }

  const tail = (match[1] ?? '').trim();
  if (tail.length === 0) {
    return null;
  }

  const tokens = tail.split(/\s+/).filter(Boolean);
  const result: Partial<MulticodeGraphBinding> = {};

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
      result.graphId = value;
      continue;
    }

    if (key === 'file') {
      result.file = value;
    }
  }

  if (!result.graphId) {
    return null;
  }

  return { graphId: result.graphId, ...(result.file ? { file: result.file } : {}) };
};

export const findMulticodeGraphBindingInSource = (
  sourceText: string,
  maxLines: number = 10
): MulticodeGraphBinding | null => {
  if (typeof sourceText !== 'string' || sourceText.length === 0) {
    return null;
  }

  const lines = sourceText.split(/\r?\n/);
  const limit = Math.max(1, Math.min(maxLines, lines.length));
  for (let i = 0; i < limit; i += 1) {
    const parsed = tryParseMulticodeGraphBindingLine(lines[i] ?? '');
    if (parsed) {
      return parsed;
    }
  }

  return null;
};

export const formatMulticodeGraphBindingLine = (binding: MulticodeGraphBinding): string => {
  const filePart = binding.file ? ` file=${binding.file}` : '';
  return `// ${MARKER} id=${binding.graphId}${filePart}`;
};

export const injectOrReplaceMulticodeGraphBinding = (
  sourceText: string,
  bindingLine: string,
  maxLinesToScan: number = 10
): string => {
  const normalizedBindingLine = normalizeLine(bindingLine);
  const eol = sourceText.includes('\r\n') ? '\r\n' : '\n';
  const lines = sourceText.split(/\r?\n/);
  const limit = Math.max(1, Math.min(maxLinesToScan, lines.length));

  for (let i = 0; i < limit; i += 1) {
    if ((lines[i] ?? '').includes(MARKER)) {
      lines[i] = normalizedBindingLine;
      return lines.join(eol);
    }
  }

  return `${normalizedBindingLine}${eol}${sourceText}`;
};

export const sanitizeGraphBindingFileName = (raw: string): string =>
  raw.replace(/[^a-zA-Z0-9._-]+/g, '_');

export const resolveGraphBindingFilePath = (
  rootFsPath: string,
  bindingFile: string
): string => {
  if (!bindingFile) {
    return rootFsPath;
  }

  const normalized = bindingFile.replace(/\\/g, '/').replace(/^\.\//, '');
  if (path.win32.isAbsolute(bindingFile) || path.posix.isAbsolute(normalized)) {
    return bindingFile;
  }

  return path.join(rootFsPath, ...normalized.split('/').filter(Boolean));
};

