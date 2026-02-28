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
});
