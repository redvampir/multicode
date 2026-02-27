import { describe, expect, it } from 'vitest';
import { appendBindingBlock, findBlocksById, parseBindingBlocks, patchBindingBlock } from './codeBinding';

describe('codeBinding parser/patcher', () => {
  it('парсит одиночный блок с id и обновляет только внутренний сегмент', () => {
    const source = [
      '#include <iostream>',
      '// multicode:begin main_loop',
      'std::cout << "old" << std::endl;',
      '// multicode:end main_loop',
      'int x = 10;'
    ].join('\n');

    const parsed = parseBindingBlocks(source);
    expect(parsed.success).toBe(true);
    expect(parsed.blocks).toHaveLength(1);

    const patched = patchBindingBlock(source, parsed.blocks[0], 'std::cout << "new" << std::endl;');

    expect(patched).toContain('std::cout << "new" << std::endl;');
    expect(patched).toContain('// multicode:begin main_loop');
    expect(patched).toContain('// multicode:end main_loop');
    expect(patched).toContain('int x = 10;');
    expect(patched).not.toContain('"old"');
  });

  it('возвращает ошибку при некорректном порядке маркеров', () => {
    const source = ['int main() {', '// multicode:end broken', '}'].join('\n');
    const parsed = parseBindingBlocks(source);

    expect(parsed.success).toBe(false);
    expect(parsed.error?.kind).toBe('ORPHAN_END');
  });

  it('находит несколько блоков и фильтрует их по id', () => {
    const source = [
      '// multicode:begin alpha',
      'int a = 1;',
      '// multicode:end alpha',
      '// multicode:begin beta',
      'int b = 2;',
      '// multicode:end beta'
    ].join('\n');

    const parsed = parseBindingBlocks(source);
    expect(parsed.success).toBe(true);
    expect(parsed.blocks).toHaveLength(2);

    const beta = findBlocksById(parsed.blocks, 'beta');
    expect(beta).toHaveLength(1);
    expect(beta[0].id).toBe('beta');
  });

  it('добавляет новый блок в конец файла, если маркеры отсутствуют', () => {
    const source = '#include <vector>\n';
    const patched = appendBindingBlock(source, 'graph-1', 'int generated = 42;');

    expect(patched).toContain('// multicode:begin graph-1');
    expect(patched).toContain('int generated = 42;');
    expect(patched).toContain('// multicode:end graph-1');
  });

  it('integration: до/после для файла с двумя блоками', () => {
    const before = [
      '#include <iostream>',
      '',
      '// multicode:begin init',
      'std::cout << "init old" << std::endl;',
      '// multicode:end init',
      '',
      'void run() {',
      '  // multicode:begin loop',
      '  std::cout << "loop old" << std::endl;',
      '  // multicode:end loop',
      '}'
    ].join('\n');

    const parsed = parseBindingBlocks(before);
    expect(parsed.success).toBe(true);
    const loopBlock = findBlocksById(parsed.blocks, 'loop')[0];

    const after = patchBindingBlock(before, loopBlock, '  std::cout << "loop fresh" << std::endl;');

    expect(after).toContain('std::cout << "init old" << std::endl;');
    expect(after).toContain('std::cout << "loop fresh" << std::endl;');
    expect(after).not.toContain('loop old');
  });
});
