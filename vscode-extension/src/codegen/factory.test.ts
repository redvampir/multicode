import { describe, expect, it } from 'vitest';

import { CppCodeGenerator } from './CppCodeGenerator';
import {
  createGenerator,
  createUnsupportedLanguageError,
  getUnsupportedLanguageMessages,
  UnsupportedLanguageError,
} from './factory';

describe('Фабрика генераторов кода', () => {
  it('должна возвращать CppCodeGenerator для языка cpp', () => {
    const generator = createGenerator('cpp');

    expect(generator).toBeInstanceOf(CppCodeGenerator);
    expect(generator.getLanguage()).toBe('cpp');
  });

  it('должна выбрасывать явную ошибку для языка rust', () => {
    expect(() => createGenerator('rust')).toThrow(UnsupportedLanguageError);

    try {
      createGenerator('rust');
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedLanguageError);
      expect((error as UnsupportedLanguageError).language).toBe('rust');
    }
  });

  it('должна выбрасывать явную ошибку для языка asm', () => {
    expect(() => createGenerator('asm')).toThrow(UnsupportedLanguageError);

    try {
      createGenerator('asm');
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedLanguageError);
      expect((error as UnsupportedLanguageError).language).toBe('asm');
    }
  });

  it('должна формировать локализованную ошибку неподдержанного языка', () => {
    const error = createUnsupportedLanguageError('rust');
    const messages = getUnsupportedLanguageMessages('rust');

    expect(error.code).toBe('UNSUPPORTED_LANGUAGE');
    expect(error.message).toBe(messages.message);
    expect(error.messageEn).toBe(messages.messageEn);
  });
});
