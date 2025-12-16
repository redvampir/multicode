// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

vi.mock('@xenova/transformers', () => {
  throw new Error('НЕ ДОЛЖЕН ИМПОРТИРОВАТЬСЯ ПРИ ЗАГРУЗКЕ МОДУЛЯ');
});

describe('MarianTranslator', () => {
  test('не требует @xenova/transformers при импорте', async () => {
    const module = await import('./marianTranslator');
    expect(module).toHaveProperty('MarianTranslator');
  });

  test('даёт понятную ошибку, если пакет недоступен', async () => {
    const { MarianTranslator } = await import('./marianTranslator');
    const translator = new MarianTranslator({}, 200, async () => {
      throw new Error('MODULE_NOT_FOUND');
    });
    await expect(translator.translateBatch(['Привет'], 'ru-en')).rejects.toThrow(
      "Marian MT недоступен: не удалось загрузить пакет '@xenova/transformers'."
    );
  });
});

