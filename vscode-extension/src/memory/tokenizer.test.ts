import { describe, expect, it } from 'vitest';
import { createSnippet, normalizePhrase, tokenizeText } from './tokenizer';

describe('memory/tokenizer', () => {
  it('токенизирует RU/EN запросы и identifier-heavy строки', () => {
    const tokens = tokenizeText('GraphSerializer source_of_truth .multicode сериализация');

    expect(tokens).toEqual(
      expect.arrayContaining(['graphserializer', 'graph', 'serializer', 'source', 'truth', 'multicode', 'сериализация'])
    );
  });

  it('нормализует фразы для lexical retrieval', () => {
    expect(normalizePhrase('Источник истины сериализации .multicode')).toBe('источник истины сериализации multicode');
  });

  it('строит компактный snippet вокруг совпадения', () => {
    const snippet = createSnippet(
      'Это длинный текст про сериализацию .multicode и source of truth для редактора и графов.',
      ['multicode'],
      '.multicode',
      50
    );

    expect(snippet.toLowerCase()).toContain('multicode');
    expect(snippet.length).toBeLessThanOrEqual(60);
  });
});
