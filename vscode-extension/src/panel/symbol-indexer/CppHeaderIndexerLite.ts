import * as fs from 'fs/promises';
import * as path from 'path';
import type { SourceIntegration, SymbolDescriptor } from '../../shared/externalSymbols';
import type { SymbolIndexer } from './SymbolIndexer';
import { sha1 } from './hash';

const CPP_HEADER_EXTENSIONS = new Set(['.h', '.hpp', '.hh', '.hxx']);
const FEATURE_FLAG_CPP_HEADER_INDEXER = process.env.MULTICODE_ENABLE_CPP_HEADER_INDEXER === '1';

export class CppHeaderIndexerLite implements SymbolIndexer {
  public readonly id = 'cpp-header-indexer-lite';

  public canHandle(integration: SourceIntegration): boolean {
    if (!FEATURE_FLAG_CPP_HEADER_INDEXER) {
      return false;
    }
    return integration.attachedFiles.some((file) => CPP_HEADER_EXTENSIONS.has(path.extname(file).toLowerCase()));
  }

  public async index(integration: SourceIntegration): Promise<SymbolDescriptor[]> {
    const symbols: SymbolDescriptor[] = [];
    for (const filePath of integration.attachedFiles) {
      if (!CPP_HEADER_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
        continue;
      }
      const content = await fs.readFile(filePath, 'utf8');
      const functionMatches = content.matchAll(/(?:^|\n)\s*[\w:<>~]+\s+([A-Za-z_]\w*)\s*\(([^;{}]*)\)\s*;/g);
      for (const match of functionMatches) {
        const name = match[1];
        const signature = `${name}(${match[2].replace(/\s+/g, ' ').trim()})`;
        symbols.push({
          id: `${integration.integrationId}::${name}`,
          integrationId: integration.integrationId,
          symbolKind: 'function',
          name,
          signatureHash: sha1(signature),
          namespacePath: [path.basename(filePath)],
        });
      }
    }
    return symbols;
  }
}
