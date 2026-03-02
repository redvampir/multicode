import { describe, expect, it } from 'vitest';
import {
  createDetachedSourceGraphCacheKey,
  createDetachedSourceGraphId,
  createDetachedSourceGraphState,
} from './sourceGraphFallback';

describe('sourceGraphFallback', () => {
  it('создает стабильный cache key независимо от регистра и slash-формата', () => {
    const a = createDetachedSourceGraphCacheKey('F:\\Workspace\\Src\\Test.cpp');
    const b = createDetachedSourceGraphCacheKey('f:/workspace/src/test.cpp');

    expect(a).toBe(b);
  });

  it('создает стабильный id графа для одного и того же файла', () => {
    const a = createDetachedSourceGraphId('F:\\Workspace\\Src\\Test.cpp');
    const b = createDetachedSourceGraphId('f:/workspace/src/test.cpp');

    expect(a).toBe(b);
    expect(a).toMatch(/^graph-file-test-[a-f0-9]{8}$/);
  });

  it('создает fallback graph state с именем от файла и заданными language/displayLanguage', () => {
    const graph = createDetachedSourceGraphState('F:/Workspace/game/player_controller.cpp', {
      language: 'cpp',
      displayLanguage: 'ru',
    });

    expect(graph.name).toBe('player_controller');
    expect(graph.language).toBe('cpp');
    expect(graph.displayLanguage).toBe('ru');
    expect(graph.id).toMatch(/^graph-file-player_controller-[a-f0-9]{8}$/);
  });
});
