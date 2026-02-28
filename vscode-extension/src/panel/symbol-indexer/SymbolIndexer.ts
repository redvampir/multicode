import type { SourceIntegration, SymbolDescriptor } from '../../shared/externalSymbols';

export interface SymbolIndexer {
  readonly id: string;
  canHandle(integration: SourceIntegration): boolean;
  index(integration: SourceIntegration): Promise<SymbolDescriptor[]>;
}
