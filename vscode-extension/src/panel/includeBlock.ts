import { resolveExternalIncludeSpecifier, type ExternalIncludePathMode } from './externalIncludePath';

const INCLUDE_LINE_PREFIX = /^\s*#\s*include\s+/;

const extractIncludeSpecifier = (line: string): string | null => {
  if (!INCLUDE_LINE_PREFIX.test(line)) {
    return null;
  }

  const tail = line.replace(INCLUDE_LINE_PREFIX, '').trim();
  const match = /^(<[^>]+>|"[^"]+")/.exec(tail);
  return match ? match[1] : null;
};

const sortIncludeSpecifiers = (left: string, right: string): number => {
  const leftQuoted = left.startsWith('"');
  const rightQuoted = right.startsWith('"');
  if (leftQuoted !== rightQuoted) {
    return leftQuoted ? 1 : -1;
  }
  return left.localeCompare(right, 'en');
};

const trimLeadingEmptyLines = (lines: string[]): string[] => {
  let start = 0;
  while (start < lines.length && lines[start].trim().length === 0) {
    start += 1;
  }
  return lines.slice(start);
};

export const buildCodeWithUnifiedIncludes = (
  code: string,
  options: {
    requiredIncludes: string[];
    includePathMode: ExternalIncludePathMode;
    targetFilePath?: string;
  }
): string => {
  const sourceLines = code.split('\n');
  const bodyWithoutIncludes: string[] = [];
  const includeSpecifiers = new Set<string>();

  for (const line of sourceLines) {
    const includeSpecifier = extractIncludeSpecifier(line);
    if (includeSpecifier) {
      includeSpecifiers.add(includeSpecifier);
      continue;
    }
    bodyWithoutIncludes.push(line);
  }

  for (const include of options.requiredIncludes) {
    includeSpecifiers.add(
      resolveExternalIncludeSpecifier(include, {
        mode: options.includePathMode,
        targetFilePath: options.targetFilePath,
      })
    );
  }

  if (includeSpecifiers.size === 0) {
    return code;
  }

  const sortedIncludeLines = Array.from(includeSpecifiers)
    .sort(sortIncludeSpecifiers)
    .map((specifier) => `#include ${specifier}`);

  const normalizedBody = trimLeadingEmptyLines(bodyWithoutIncludes).join('\n');
  return normalizedBody.length > 0
    ? `${sortedIncludeLines.join('\n')}\n\n${normalizedBody}`
    : `${sortedIncludeLines.join('\n')}\n`;
};
