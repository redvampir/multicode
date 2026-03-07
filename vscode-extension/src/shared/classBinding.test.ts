import { describe, expect, it } from 'vitest';
import {
  findMulticodeClassBindingsInSource,
  injectOrReplaceMulticodeClassBindingsBlock,
  tryParseMulticodeClassBindingLine,
} from './classBinding';

describe('classBinding', () => {
  it('parses @multicode:class marker line', () => {
    const parsed = tryParseMulticodeClassBindingLine(
      '// @multicode:class id=class-player file=.multicode/classes/class-player.multicode'
    );
    expect(parsed).toEqual({
      classId: 'class-player',
      file: '.multicode/classes/class-player.multicode',
    });
  });

  it('finds multiple bindings in first lines only', () => {
    const source = [
      '// header',
      '// @multicode:class id=a file=.multicode/classes/a.multicode',
      '// @multicode:class id=b file=.multicode/classes/b.multicode',
      'int main() {}',
    ].join('\n');

    expect(findMulticodeClassBindingsInSource(source, 3)).toEqual([
      { classId: 'a', file: '.multicode/classes/a.multicode' },
      { classId: 'b', file: '.multicode/classes/b.multicode' },
    ]);
    expect(findMulticodeClassBindingsInSource(source, 1)).toEqual([]);
  });

  it('injects class block after @multicode:graph and preserves \\n', () => {
    const source = [
      '// @multicode:graph id=graph-1 file=.multicode/graph-1.multicode',
      '',
      'int main() {}',
      '',
    ].join('\n');

    const next = injectOrReplaceMulticodeClassBindingsBlock(source, [
      { classId: 'a', file: '.multicode/classes/a.multicode' },
    ]);

    expect(next.includes('\r\n')).toBe(false);
    expect(next).toContain('// @multicode:class id=a file=.multicode/classes/a.multicode\n');
    expect(next).toContain('// @multicode:graph id=graph-1 file=.multicode/graph-1.multicode\n// @multicode:class');
  });

  it('replaces existing block and preserves \\r\\n', () => {
    const source = [
      '// @multicode:graph id=graph-1 file=.multicode/graph-1.multicode',
      '// @multicode:class id=old file=.multicode/classes/old.multicode',
      '',
      'int main() {}',
      '',
    ].join('\r\n');

    const next = injectOrReplaceMulticodeClassBindingsBlock(source, [
      { classId: 'new', file: '.multicode/classes/new.multicode' },
    ]);

    expect(next.includes('\r\n')).toBe(true);
    expect((next.match(/@multicode:class/g) ?? [])).toHaveLength(1);
    expect(next).toContain('// @multicode:class id=new file=.multicode/classes/new.multicode');
  });
});

