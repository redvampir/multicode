import type { MemoryDocument, MemorySearchHit, MemorySearchQuery, MemorySourceKind } from './types';
import { createSnippet, normalizePhrase, tokenizeText } from './tokenizer';

const AUTHORITY_WEIGHT = {
  canonical: 1,
  advisory: 0.7,
} as const;

const KIND_WEIGHT: Record<MemorySourceKind, number> = {
  doc: 1,
  code_note: 0.86,
  session_summary: 0.68,
};

const unique = <T>(items: T[]): T[] => Array.from(new Set(items));

const matchesTags = (documentTags: string[], queryTags: string[] | undefined): boolean => {
  if (!queryTags || queryTags.length === 0) {
    return true;
  }
  const normalizedDocumentTags = new Set(documentTags.map((tag) => tag.toLowerCase()));
  return queryTags.some((tag) => normalizedDocumentTags.has(tag.toLowerCase()));
};

const scoreChunk = (
  document: MemoryDocument,
  chunk: MemoryDocument['chunks'][number],
  queryText: string,
  queryTokens: string[]
): number => {
  const normalizedQuery = normalizePhrase(queryText);
  const titleText = [document.title, ...chunk.headingPath].join(' ');
  const normalizedTitle = normalizePhrase(titleText);
  const normalizedBody = normalizePhrase(chunk.text);
  const chunkTokenSet = new Set(chunk.tokens);
  const titleTokenSet = new Set(tokenizeText(titleText));

  const tokenHits = unique(queryTokens).filter((token) => chunkTokenSet.has(token)).length;
  const titleHits = unique(queryTokens).filter((token) => titleTokenSet.has(token)).length;
  const queryTokenCount = Math.max(unique(queryTokens).length, 1);

  let score = 0;
  if (normalizedQuery.length > 0 && normalizedTitle.includes(normalizedQuery)) {
    score += 10;
  } else if (normalizedQuery.length > 0 && normalizedBody.includes(normalizedQuery)) {
    score += 8;
  }

  score += (titleHits / queryTokenCount) * 4.5;
  score += (tokenHits / queryTokenCount) * 3.25;

  if (queryTokens.length > 0 && tokenHits === 0 && titleHits === 0) {
    return 0;
  }

  return score * chunk.weight * KIND_WEIGHT[document.kind] * AUTHORITY_WEIGHT[document.authority];
};

export const searchDocuments = (documents: MemoryDocument[], query: MemorySearchQuery): MemorySearchHit[] => {
  const text = query.text.trim();
  if (text.length === 0) {
    return [];
  }

  const queryTokens = tokenizeText(text);
  const kinds = query.kinds ? new Set(query.kinds) : null;
  const dedupedHits = new Map<string, MemorySearchHit>();

  for (const document of documents) {
    if (kinds && !kinds.has(document.kind)) {
      continue;
    }
    if (!matchesTags(document.tags, query.tags)) {
      continue;
    }

    for (const chunk of document.chunks) {
      const score = scoreChunk(document, chunk, text, queryTokens);
      if (score <= 0) {
        continue;
      }

      const hit: MemorySearchHit = {
        chunkId: chunk.id,
        score,
        authority: document.authority,
        kind: document.kind,
        title: document.title,
        snippet: createSnippet(chunk.text, queryTokens, text),
        sourcePath: document.sourcePath,
        headingPath: chunk.headingPath,
        tags: document.tags,
      };

      const dedupeKey = `${document.sourcePath}::${chunk.headingPath.join('>')}`;
      const current = dedupedHits.get(dedupeKey);
      if (!current || current.score < hit.score) {
        dedupedHits.set(dedupeKey, hit);
      }
    }
  }

  return Array.from(dedupedHits.values())
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.min(Math.max(query.limit ?? 8, 1), 8));
};
