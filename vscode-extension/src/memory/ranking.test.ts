import { describe, expect, it } from 'vitest';
import { searchDocuments } from './ranking';
import type { MemoryDocument } from './types';
import { tokenizeText } from './tokenizer';

const makeDocument = (params: {
  id: string;
  kind: MemoryDocument['kind'];
  authority: MemoryDocument['authority'];
  title: string;
  sourcePath: string;
  text: string;
}): MemoryDocument => ({
  id: params.id,
  kind: params.kind,
  authority: params.authority,
  title: params.title,
  sourcePath: params.sourcePath,
  tags: ['memory'],
  revision: 'rev-1',
  chunks: [
    {
      id: `${params.id}-chunk`,
      documentId: params.id,
      headingPath: ['section'],
      text: params.text,
      tokens: tokenizeText(`${params.title} ${params.text}`),
      weight: 1,
    },
  ],
});

describe('memory/ranking', () => {
  it('ставит canonical doc выше advisory summary при одинаковом запросе', () => {
    const canonical = makeDocument({
      id: 'doc-1',
      kind: 'doc',
      authority: 'canonical',
      title: 'Архитектура',
      sourcePath: '/workspace/Документы/Архитектура/README.md',
      text: 'Источник истины сериализации .multicode находится в serializer.ts и документации.',
    });
    const summary = makeDocument({
      id: 'summary-1',
      kind: 'session_summary',
      authority: 'advisory',
      title: 'Сессия',
      sourcePath: '/storage/session-summary.json',
      text: 'Источник истины сериализации .multicode обсуждался в сессии.',
    });

    const hits = searchDocuments([summary, canonical], {
      text: 'источник истины сериализации .multicode',
      limit: 4,
    });

    expect(hits).toHaveLength(2);
    expect(hits[0].authority).toBe('canonical');
    expect(hits[0].kind).toBe('doc');
  });
});
