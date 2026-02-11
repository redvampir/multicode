/**
 * Реестр поддержки языков кодогенерации.
 *
 * Цель: единый источник правды для фабрики, UI и extension-side.
 * INVARIANT: флаг supportsGenerator определяет, можно ли создавать генератор.
 */

import type { GraphLanguage } from '../shared/blueprintTypes';

export interface LanguageSupportInfo {
  language: GraphLanguage;
  supportsGenerator: boolean;
  statusLabel: 'ready' | 'unsupported';
}

const LANGUAGE_SUPPORT: Record<GraphLanguage, LanguageSupportInfo> = {
  cpp: {
    language: 'cpp',
    supportsGenerator: true,
    statusLabel: 'ready',
  },
  rust: {
    language: 'rust',
    supportsGenerator: false,
    statusLabel: 'unsupported',
  },
  asm: {
    language: 'asm',
    supportsGenerator: false,
    statusLabel: 'unsupported',
  },
};

export function getLanguageSupportInfo(language: GraphLanguage): LanguageSupportInfo {
  return LANGUAGE_SUPPORT[language];
}

export function isLanguageSupported(language: GraphLanguage): boolean {
  return getLanguageSupportInfo(language).supportsGenerator;
}
