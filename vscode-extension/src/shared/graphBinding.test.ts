import * as path from 'path';
import { describe, expect, it } from 'vitest';
import {
  findMulticodeGraphBindingInSource,
  formatMulticodeGraphBindingLine,
  injectOrReplaceMulticodeGraphBinding,
  resolveGraphBindingFilePath,
  sanitizeGraphBindingFileName,
  tryParseMulticodeGraphBindingLine,
} from './graphBinding';

describe('graphBinding', () => {
  it('parses @multicode:graph marker line', () => {
    const parsed = tryParseMulticodeGraphBindingLine(
      '// @multicode:graph id=a3f7b2 file=.multicode/a3f7b2.multicode'
    );
    expect(parsed).toEqual({ graphId: 'a3f7b2', file: '.multicode/a3f7b2.multicode' });
  });

  it('returns null when marker line has no id', () => {
    expect(tryParseMulticodeGraphBindingLine('// @multicode:graph file=.multicode/x.multicode')).toBeNull();
  });

  it('finds marker in first lines only', () => {
    const source = [
      '// header',
      '// @multicode:graph id=test file=.multicode/test.multicode',
      'int main() {}',
    ].join('\n');
    expect(findMulticodeGraphBindingInSource(source, 2)).toEqual({
      graphId: 'test',
      file: '.multicode/test.multicode',
    });

    expect(findMulticodeGraphBindingInSource(source, 1)).toBeNull();
  });

  it('formats marker line', () => {
    expect(formatMulticodeGraphBindingLine({ graphId: 'id1', file: '.multicode/id1.multicode' })).toBe(
      '// @multicode:graph id=id1 file=.multicode/id1.multicode'
    );
  });

  it('injects marker at top when missing and preserves \\n', () => {
    const source = '// Generated\nint main() {}\n';
    const next = injectOrReplaceMulticodeGraphBinding(
      source,
      '// @multicode:graph id=abc file=.multicode/abc.multicode'
    );
    expect(next.startsWith('// @multicode:graph id=abc file=.multicode/abc.multicode\n')).toBe(true);
    expect(next.includes('\r\n')).toBe(false);
  });

  it('replaces existing marker and preserves \\r\\n', () => {
    const source = [
      '// @multicode:graph id=old file=.multicode/old.multicode',
      '// other',
      'int main() {}',
    ].join('\r\n');
    const next = injectOrReplaceMulticodeGraphBinding(
      source,
      '// @multicode:graph id=new file=.multicode/new.multicode'
    );
    expect(next.split('\r\n')[0]).toBe('// @multicode:graph id=new file=.multicode/new.multicode');
    expect(next.includes('\r\n')).toBe(true);
  });

  it('sanitizes file name parts', () => {
    expect(sanitizeGraphBindingFileName('graph id: 1/2')).toBe('graph_id_1_2');
  });

  it('resolves relative binding path under root', () => {
    const root = path.join('C:', 'repo');
    const resolved = resolveGraphBindingFilePath(root, '.multicode/test.multicode');
    expect(path.normalize(resolved)).toBe(path.normalize(path.join(root, '.multicode', 'test.multicode')));
  });
});

