import { env, pipeline, type TranslationPipeline } from '@xenova/transformers';

export type TranslationDirection = 'ru-en' | 'en-ru';

type TranslationCacheKey = `${TranslationDirection}:${string}`;

const DEFAULT_MODELS: Record<TranslationDirection, string> = {
  'ru-en': 'Helsinki-NLP/opus-mt-ru-en',
  'en-ru': 'Helsinki-NLP/opus-mt-en-ru'
};

const DEFAULT_CACHE_LIMIT = 200;

export class MarianTranslator {
  private readonly cache = new Map<TranslationCacheKey, string>();
  private readonly pipelines = new Map<TranslationDirection, Promise<TranslationPipeline>>();

  constructor(
    private readonly modelOverrides: Partial<Record<TranslationDirection, string>> = {},
    private readonly cacheLimit: number = DEFAULT_CACHE_LIMIT
  ) {
    env.allowLocalModels = true;
    env.useBrowserCache = false;
    env.useFSCache = true;
  }

  public async translateBatch(
    texts: string[],
    direction: TranslationDirection
  ): Promise<Map<string, string>> {
    const normalized = texts.map((text) => text.trim()).filter((text) => text.length > 0);
    const result = new Map<string, string>();

    const missing: string[] = [];
    for (const text of normalized) {
      const cached = this.cache.get(this.buildCacheKey(direction, text));
      if (cached) {
        result.set(text, cached);
        continue;
      }
      missing.push(text);
    }

    if (missing.length) {
      const translator = await this.getPipeline(direction);
      for (const original of missing) {
        const translation = await this.translateSingle(translator, original);
        const key = this.buildCacheKey(direction, original);
        this.cache.set(key, translation);
        this.trimCacheIfNeeded();
        result.set(original, translation);
      }
    }

    return result;
  }

  private async getPipeline(direction: TranslationDirection): Promise<TranslationPipeline> {
    const modelId = this.modelOverrides[direction] ?? DEFAULT_MODELS[direction];
    const existing = this.pipelines.get(direction);
    if (existing) {
      return existing;
    }
    const created = pipeline('translation', modelId) as Promise<TranslationPipeline>;
    this.pipelines.set(direction, created);
    return created;
  }

  private async translateSingle(
    translator: TranslationPipeline,
    text: string
  ): Promise<string> {
    const output = await translator(text, { return_full_text: false });
    if (Array.isArray(output) && output.length > 0 && 'translation_text' in output[0]) {
      return output[0].translation_text.trim();
    }
    if (!Array.isArray(output) && 'translation_text' in output) {
      return output.translation_text.trim();
    }
    return text;
  }

  private buildCacheKey(direction: TranslationDirection, text: string): TranslationCacheKey {
    return `${direction}:${text}`;
  }

  private trimCacheIfNeeded(): void {
    if (this.cache.size <= this.cacheLimit) {
      return;
    }
    const excess = this.cache.size - this.cacheLimit;
    const iterator = this.cache.keys();
    for (let index = 0; index < excess; index += 1) {
      const key = iterator.next();
      if (!key.done) {
        this.cache.delete(key.value);
      }
    }
  }
}
