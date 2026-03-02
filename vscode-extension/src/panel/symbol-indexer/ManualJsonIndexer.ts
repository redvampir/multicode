import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import type { SourceIntegration, SymbolDescriptor } from '../../shared/externalSymbols';
import type { SymbolIndexer } from './SymbolIndexer';
import { sha1 } from './hash';

const manualSymbolSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  symbolKind: z.enum(['function', 'variable', 'class', 'struct', 'method', 'enum']),
  namespacePath: z.array(z.string()).optional(),
  signature: z.string().optional(),
  signatureHash: z.string().optional(),
});

const manualFileSchema = z.array(manualSymbolSchema);

export class ManualJsonIndexer implements SymbolIndexer {
  public readonly id = 'manual-json-indexer';

  public canHandle(integration: SourceIntegration): boolean {
    if (integration.location?.type === 'local_file' && integration.location.value.endsWith('.json')) {
      return true;
    }
    return integration.attachedFiles.some((file) => file.endsWith('.json'));
  }

  public async index(integration: SourceIntegration): Promise<SymbolDescriptor[]> {
    const candidates = [...integration.attachedFiles];
    if (integration.location?.type === 'local_file' && integration.location.value.endsWith('.json')) {
      candidates.unshift(integration.location.value);
    }

    for (const candidate of candidates) {
      if (!candidate.endsWith('.json')) {
        continue;
      }
      const fullPath = path.resolve(candidate);
      const raw = await fs.readFile(fullPath, 'utf8');
      const parsed = manualFileSchema.parse(JSON.parse(raw));

      return parsed.map((item) => ({
        id: item.id ?? `${integration.integrationId}::${item.name}`,
        integrationId: integration.integrationId,
        symbolKind: item.symbolKind,
        name: item.name,
        signature: item.signature,
        signatureHash: item.signatureHash ?? sha1(item.signature ?? `${item.symbolKind}:${item.name}`),
        namespacePath: item.namespacePath,
      }));
    }

    return [];
  }
}
