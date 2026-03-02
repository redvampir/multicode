import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import type { SourceIntegration } from '../../shared/externalSymbols';
import { SymbolIndexerRegistry } from './index';

const tempDirs: string[] = [];

const makeTempDir = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'multicode-indexer-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('SymbolIndexerRegistry', () => {
  it('индексирует symbols.json и использует кэш ревизии', async () => {
    const dir = await makeTempDir();
    const symbolsFile = path.join(dir, 'symbols.json');
    await fs.writeFile(
      symbolsFile,
      JSON.stringify([{ name: 'sum', symbolKind: 'function', signature: 'sum(a:number,b:number):number' }]),
      'utf8'
    );

    const integration: SourceIntegration = {
      integrationId: 'manual',
      attachedFiles: [symbolsFile],
      mode: 'explicit',
      kind: 'file',
      location: { type: 'local_file', value: symbolsFile },
    };

    const registry = new SymbolIndexerRegistry();
    const firstCount = await registry.reindexIntegrations([integration], undefined, false);
    const secondCount = await registry.reindexIntegrations([integration], undefined, false);

    expect(firstCount).toBe(1);
    expect(secondCount).toBe(1);
    expect(registry.querySymbols('sum')[0]?.id).toBe('manual::sum');
  });

  it('индексирует функции из C++ header/source файлов', async () => {
    const dir = await makeTempDir();
    const headerFile = path.join(dir, 'dep_check_text.hpp');
    const sourceFile = path.join(dir, 'dep_check_math.cpp');

    await fs.writeFile(
      headerFile,
      `#pragma once

namespace depcheck {
void print_status(const char* message);
bool starts_with_token(const char* value, const char* token);
int count_words(const char* text);
} // namespace depcheck

namespace depcheck::text {
void print_scoped(const char* message);
} // namespace depcheck::text
`,
      'utf8'
    );

    await fs.writeFile(
      sourceFile,
      `int add(int lhs, int rhs) { return lhs + rhs; }
static double average(double first, double second) { return (first + second) / 2.0; }
`,
      'utf8'
    );

    const integrations: SourceIntegration[] = [
      {
        integrationId: 'dep-text',
        attachedFiles: [headerFile],
        mode: 'explicit',
        kind: 'file',
        location: { type: 'local_file', value: headerFile },
      },
      {
        integrationId: 'dep-math',
        attachedFiles: [sourceFile],
        mode: 'explicit',
        kind: 'file',
        location: { type: 'local_file', value: sourceFile },
      },
    ];

    const registry = new SymbolIndexerRegistry();
    const indexed = await registry.reindexIntegrations(integrations, undefined, true);

    const textSymbols = registry.querySymbols('', 'dep-text', 20).map((symbol) => symbol.name);
    const printStatusSymbol = registry.querySymbols('print_status', 'dep-text', 1)[0];
    const textSymbolNamespaceMap = new Map(
      registry.querySymbols('', 'dep-text', 20).map((symbol) => [symbol.name, symbol.namespacePath ?? []])
    );
    const mathSymbols = registry.querySymbols('', 'dep-math', 20).map((symbol) => symbol.name);

    expect(indexed).toBeGreaterThanOrEqual(5);
    expect(textSymbols).toEqual(expect.arrayContaining(['print_status', 'starts_with_token', 'count_words', 'print_scoped']));
    expect(textSymbolNamespaceMap.get('print_status')).toEqual(['depcheck']);
    expect(textSymbolNamespaceMap.get('print_scoped')).toEqual(['depcheck', 'text']);
    expect(printStatusSymbol?.signature).toBe('print_status(const char* message)');
    expect(mathSymbols).toEqual(expect.arrayContaining(['add', 'average']));
  });

  it('переиндексирует интеграцию при изменении локального файла', async () => {
    const dir = await makeTempDir();
    const headerFile = path.join(dir, 'dynamic.hpp');

    await fs.writeFile(headerFile, 'int one();\n', 'utf8');

    const integration: SourceIntegration = {
      integrationId: 'dynamic',
      attachedFiles: [headerFile],
      mode: 'explicit',
      kind: 'file',
      location: { type: 'local_file', value: headerFile },
    };

    const registry = new SymbolIndexerRegistry();
    const firstCount = await registry.reindexIntegrations([integration], undefined, false);
    expect(firstCount).toBe(1);
    expect(registry.querySymbols('', 'dynamic', 20).map((symbol) => symbol.name)).toEqual(['one']);

    await new Promise((resolve) => setTimeout(resolve, 25));
    await fs.writeFile(headerFile, 'int one();\nint two();\n', 'utf8');

    const secondCount = await registry.reindexIntegrations([integration], undefined, false);
    expect(secondCount).toBe(2);
    expect(registry.querySymbols('', 'dynamic', 20).map((symbol) => symbol.name)).toEqual(['one', 'two']);
  });
});
