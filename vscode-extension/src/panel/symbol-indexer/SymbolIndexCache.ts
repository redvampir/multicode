import type { SourceIntegration, SymbolDescriptor } from '../../shared/externalSymbols';
import { sha1 } from './hash';

interface SymbolIndexCacheEntry {
  integrationRevision: string;
  symbols: SymbolDescriptor[];
  signatureHashMap: Map<string, string | undefined>;
  updatedAt: string;
}

export class SymbolIndexCache {
  private readonly entries = new Map<string, SymbolIndexCacheEntry>();

  public shouldReindex(integration: SourceIntegration, force: boolean): boolean {
    if (force) {
      return true;
    }
    const cached = this.entries.get(integration.integrationId);
    if (!cached) {
      return true;
    }
    return cached.integrationRevision !== this.buildIntegrationRevision(integration);
  }

  public update(integration: SourceIntegration, symbols: SymbolDescriptor[]): void {
    const signatureHashMap = new Map<string, string | undefined>();
    for (const symbol of symbols) {
      signatureHashMap.set(symbol.id, symbol.signatureHash);
    }

    this.entries.set(integration.integrationId, {
      integrationRevision: this.buildIntegrationRevision(integration),
      symbols,
      signatureHashMap,
      updatedAt: new Date().toISOString(),
    });
  }

  public getSymbols(integrationId?: string): SymbolDescriptor[] {
    if (integrationId) {
      return this.entries.get(integrationId)?.symbols ?? [];
    }
    return Array.from(this.entries.values()).flatMap((entry) => entry.symbols);
  }

  public getSignatureHash(integrationId: string, symbolId: string): string | undefined {
    return this.entries.get(integrationId)?.signatureHashMap.get(symbolId);
  }

  private buildIntegrationRevision(integration: SourceIntegration): string {
    const payload = JSON.stringify({
      integrationId: integration.integrationId,
      attachedFiles: [...integration.attachedFiles].sort(),
      mode: integration.mode,
      kind: integration.kind,
      version: integration.version,
      location: integration.location,
    });
    return sha1(payload);
  }
}
