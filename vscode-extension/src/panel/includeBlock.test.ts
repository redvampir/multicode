import { describe, expect, it } from 'vitest';
import { buildCodeWithUnifiedIncludes } from './includeBlock';

describe('buildCodeWithUnifiedIncludes', () => {
  it('собирает include в один блок и переносит его в начало файла', () => {
    const code = [
      '// Сгенерировано MultiCode',
      '// @multicode:graph id=graph-1 file=.multicode/graph-1.multicode',
      '',
      '#include <iostream>',
      '#include <vector>',
      '',
      'int main() {',
      '  return 0;',
      '}',
      '',
    ].join('\n');

    const result = buildCodeWithUnifiedIncludes(code, {
      requiredIncludes: ['"F:/workspace/include/dep_check_text.hpp"'],
      includePathMode: 'relative',
      targetFilePath: 'F:/workspace/src/main.cpp',
    });

    const lines = result.split('\n');
    expect(lines[0]).toBe('#include <iostream>');
    expect(lines[1]).toBe('#include <vector>');
    expect(lines[2]).toBe('#include "../include/dep_check_text.hpp"');
    expect(result).toContain('// Сгенерировано MultiCode');
  });

  it('убирает дубликаты include', () => {
    const code = [
      '#include <iostream>',
      '#include <vector>',
      '#include <iostream>',
      '',
      'int main() { return 0; }',
    ].join('\n');

    const result = buildCodeWithUnifiedIncludes(code, {
      requiredIncludes: ['<vector>', '<iostream>'],
      includePathMode: 'absolute',
    });

    const includeLines = result
      .split('\n')
      .filter((line) => line.startsWith('#include '));
    expect(includeLines).toEqual(['#include <iostream>', '#include <vector>']);
  });

  it('не меняет код без include', () => {
    const code = ['int main() {', '  return 0;', '}'].join('\n');
    const result = buildCodeWithUnifiedIncludes(code, {
      requiredIncludes: [],
      includePathMode: 'relative',
      targetFilePath: 'F:/workspace/src/main.cpp',
    });
    expect(result).toBe(code);
  });
});
