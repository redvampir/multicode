import { describe, expect, it } from 'vitest';

import { getLanguageSupportInfo, isLanguageSupported } from './languageSupport';

describe('Реестр поддержки языков', () => {
  it('должен помечать cpp как поддерживаемый', () => {
    const info = getLanguageSupportInfo('cpp');

    expect(info.supportsGenerator).toBe(true);
    expect(info.statusLabel).toBe('ready');
    expect(isLanguageSupported('cpp')).toBe(true);
  });

  it('должен помечать rust как неподдерживаемый', () => {
    const info = getLanguageSupportInfo('rust');

    expect(info.supportsGenerator).toBe(false);
    expect(info.statusLabel).toBe('unsupported');
    expect(isLanguageSupported('rust')).toBe(false);
  });

  it('должен помечать asm как неподдерживаемый', () => {
    const info = getLanguageSupportInfo('asm');

    expect(info.supportsGenerator).toBe(false);
    expect(info.statusLabel).toBe('unsupported');
    expect(isLanguageSupported('asm')).toBe(false);
  });
});
