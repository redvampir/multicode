import { describe, expect, it } from 'vitest';
import { resolveExternalIncludeSpecifier } from './externalIncludePath';

describe('resolveExternalIncludeSpecifier', () => {
  it('оставляет системные include как есть', () => {
    const resolved = resolveExternalIncludeSpecifier('<vector>', {
      mode: 'relative',
      targetFilePath: 'F:/workspace/src/main.cpp',
    });

    expect(resolved).toBe('<vector>');
  });

  it('оставляет абсолютный путь при режиме absolute', () => {
    const resolved = resolveExternalIncludeSpecifier('"F:/workspace/include/dep_check_text.hpp"', {
      mode: 'absolute',
      targetFilePath: 'F:/workspace/src/main.cpp',
    });

    expect(resolved).toBe('"F:/workspace/include/dep_check_text.hpp"');
  });

  it('конвертирует абсолютный путь в относительный к целевому файлу', () => {
    const resolved = resolveExternalIncludeSpecifier('"F:/workspace/include/dep_check_text.hpp"', {
      mode: 'relative',
      targetFilePath: 'F:/workspace/src/main.cpp',
    });

    expect(resolved).toBe('"../include/dep_check_text.hpp"');
  });

  it('сохраняет абсолютный путь если целевой файл на другом диске', () => {
    const resolved = resolveExternalIncludeSpecifier('"D:/headers/dep_check_text.hpp"', {
      mode: 'relative',
      targetFilePath: 'F:/workspace/src/main.cpp',
    });

    expect(resolved).toBe('"D:/headers/dep_check_text.hpp"');
  });
});

