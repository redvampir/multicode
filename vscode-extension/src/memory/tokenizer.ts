const RAW_TOKEN_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}_.:/\\-]*/gu;
const IDENTIFIER_SEGMENT_PATTERN =
  /[A-Z]{2,}(?=[A-Z][a-z]|\d|$)|[A-Z]?[a-z]+|[А-ЯЁ]{2,}(?=[А-ЯЁ][а-яё]|\d|$)|[А-ЯЁ]?[а-яё]+|\d+/gu;

const unique = <T>(items: T[]): T[] => Array.from(new Set(items));

const normalizeToken = (value: string): string =>
  value
    .toLowerCase()
    .replace(/^[^0-9\p{L}]+/gu, '')
    .replace(/[^0-9\p{L}]+$/gu, '')
    .trim();

const splitIdentifier = (value: string): string[] => {
  const parts = value.replace(/[_./:\\-]+/g, ' ').split(/\s+/u).filter((part) => part.length > 0);
  const segments: string[] = [];

  for (const part of parts) {
    const matches = part.match(IDENTIFIER_SEGMENT_PATTERN);
    if (matches && matches.length > 0) {
      for (const match of matches) {
        const normalized = normalizeToken(match);
        if (normalized.length > 1) {
          segments.push(normalized);
        }
      }
      continue;
    }

    const normalized = normalizeToken(part);
    if (normalized.length > 1) {
      segments.push(normalized);
    }
  }

  return segments;
};

export const normalizePhrase = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[_./:\\-]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

export const tokenizeText = (value: string): string[] => {
  const tokens: string[] = [];
  const matches = value.match(RAW_TOKEN_PATTERN) ?? [];

  for (const raw of matches) {
    const normalizedRaw = normalizeToken(raw);
    if (normalizedRaw.length > 1) {
      tokens.push(normalizedRaw);
    }

    for (const segment of splitIdentifier(raw)) {
      tokens.push(segment);
    }
  }

  return unique(tokens);
};

export const createSnippet = (text: string, queryTokens: string[], preferredPhrase?: string, maxLength = 180): string => {
  const compactText = text.replace(/\s+/gu, ' ').trim();
  if (compactText.length <= maxLength) {
    return compactText;
  }

  const lowerText = compactText.toLowerCase();
  const normalizedPhrase = preferredPhrase ? normalizePhrase(preferredPhrase) : '';
  let matchIndex = -1;

  if (normalizedPhrase.length > 0) {
    const normalizedText = normalizePhrase(compactText);
    const phraseIndex = normalizedText.indexOf(normalizedPhrase);
    if (phraseIndex >= 0) {
      for (const token of queryTokens) {
        const tokenIndex = lowerText.indexOf(token.toLowerCase());
        if (tokenIndex >= 0) {
          matchIndex = tokenIndex;
          break;
        }
      }
    }
  }

  if (matchIndex < 0) {
    for (const token of queryTokens) {
      const tokenIndex = lowerText.indexOf(token.toLowerCase());
      if (tokenIndex >= 0) {
        matchIndex = tokenIndex;
        break;
      }
    }
  }

  if (matchIndex < 0) {
    return `${compactText.slice(0, maxLength - 3).trim()}...`;
  }

  const start = Math.max(0, matchIndex - Math.floor(maxLength / 3));
  const end = Math.min(compactText.length, start + maxLength);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < compactText.length ? '...' : '';
  return `${prefix}${compactText.slice(start, end).trim()}${suffix}`;
};
