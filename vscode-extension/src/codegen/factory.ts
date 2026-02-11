/**
 * Фабрика кодогенераторов.
 *
 * Цель: выбирать генератор строго по language графа,
 * чтобы неподдержанные языки давали явную, контролируемую ошибку,
 * а не «тихий» fallback на C++.
 */

import { CppCodeGenerator } from './CppCodeGenerator';
import type { ICodeGenerator } from './types';
import { CodeGenErrorCode } from './types';
import type { GraphLanguage } from '../shared/blueprintTypes';

export class UnsupportedLanguageError extends Error {
  public readonly language: GraphLanguage;

  constructor(language: GraphLanguage) {
    super(`Кодогенератор для языка "${language}" пока не реализован`);
    this.name = 'UnsupportedLanguageError';
    this.language = language;
  }
}

interface UnsupportedLanguageMessages {
  message: string;
  messageEn: string;
}

export function getUnsupportedLanguageMessages(language: GraphLanguage): UnsupportedLanguageMessages {
  return {
    message: `Язык "${language}" пока не поддерживается генератором кода`,
    messageEn: `Language "${language}" is not supported by code generation yet`,
  };
}

export function createGenerator(language: GraphLanguage): ICodeGenerator {
  if (language === 'cpp') {
    return new CppCodeGenerator();
  }

  throw new UnsupportedLanguageError(language);
}

export function createUnsupportedLanguageError(language: GraphLanguage) {
  const messages = getUnsupportedLanguageMessages(language);

  return {
    code: CodeGenErrorCode.UNSUPPORTED_LANGUAGE,
    message: messages.message,
    messageEn: messages.messageEn,
    nodeId: '',
  };
}

