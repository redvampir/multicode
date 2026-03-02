import * as path from 'path';

export type ExternalIncludePathMode = 'absolute' | 'relative';

const normalizeForInclude = (filePath: string): string => filePath.replace(/\\/g, '/');

const tryUnquoteInclude = (includeSpecifier: string): string | null => {
  const trimmed = includeSpecifier.trim();
  const match = /^"(.+)"$/.exec(trimmed);
  return match ? match[1] : null;
};

const canUseAsRelativePath = (relativePath: string): boolean => {
  if (!relativePath) {
    return false;
  }
  if (path.isAbsolute(relativePath)) {
    return false;
  }
  if (/^[a-zA-Z]:/.test(relativePath)) {
    return false;
  }
  return true;
};

export const resolveExternalIncludeSpecifier = (
  includeSpecifier: string,
  options: {
    mode: ExternalIncludePathMode;
    targetFilePath?: string;
  }
): string => {
  const quotedPath = tryUnquoteInclude(includeSpecifier);
  if (!quotedPath) {
    return includeSpecifier;
  }

  const normalizedQuotedPath = normalizeForInclude(quotedPath);
  if (options.mode !== 'relative') {
    return `"${normalizedQuotedPath}"`;
  }

  if (!options.targetFilePath) {
    return `"${normalizedQuotedPath}"`;
  }

  const absoluteHeaderPath = path.normalize(quotedPath);
  if (!path.isAbsolute(absoluteHeaderPath)) {
    return `"${normalizedQuotedPath}"`;
  }

  const targetDirectory = path.dirname(path.normalize(options.targetFilePath));
  const relativePath = path.relative(targetDirectory, absoluteHeaderPath);

  if (!canUseAsRelativePath(relativePath)) {
    return `"${normalizedQuotedPath}"`;
  }

  return `"${normalizeForInclude(relativePath)}"`;
};

