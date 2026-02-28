import type { SourceIntegration, SymbolDescriptor } from '../../shared/externalSymbols';
import { CppHeaderIndexerLite } from './CppHeaderIndexerLite';
import { ManualJsonIndexer } from './ManualJsonIndexer';
import type { SymbolIndexer } from './SymbolIndexer';
import { SymbolIndexCache } from './SymbolIndexCache';
import { TypeScriptDeclarationIndexer } from './TypeScriptDeclarationIndexer';

export class SymbolIndexerRegistry {
  private readonly cache = new SymbolIndexCache();
  private readonly indexers: SymbolIndexer[];

  public constructor(indexers?: SymbolIndexer[]) {
    this.indexers = indexers ?? [
      new ManualJsonIndexer(),
      new TypeScriptDeclarationIndexer(),
      new CppHeaderIndexerLite(),
    ];
  }

  public async reindexIntegrations(integrations: SourceIntegration[], integrationId?: string, force = false): Promise<number> {
    const targetIntegrations = integrationId
      ? integrations.filter((item) => item.integrationId === integrationId)
      : integrations;

    let indexed = 0;
    for (const integration of targetIntegrations) {
      if (!this.cache.shouldReindex(integration, force)) {
        indexed += this.cache.getSymbols(integration.integrationId).length;
        continue;
      }
      const symbols = await this.indexSingleIntegration(integration);
      this.cache.update(integration, symbols);
      indexed += symbols.length;
    }
    return indexed;
  }

  public querySymbols(query: string, integrationId?: string, limit = 50): SymbolDescriptor[] {
    const normalized = query.trim().toLowerCase();
    if (normalized.length === 0) {
      return this.cache.getSymbols(integrationId).slice(0, limit);
    }

    return this.cache
      .getSymbols(integrationId)
      .filter((item) => item.name.toLowerCase().includes(normalized) || item.id.toLowerCase().includes(normalized))
      .slice(0, limit);
  }

  public getSignatureHash(integrationId: string, symbolId: string): string | undefined {
    return this.cache.getSignatureHash(integrationId, symbolId);
  }

  private async indexSingleIntegration(integration: SourceIntegration): Promise<SymbolDescriptor[]> {
    const indexer = this.indexers.find((candidate) => candidate.canHandle(integration));
    if (!indexer) {
      return [];
    }
    return indexer.index(integration);
  }
}
