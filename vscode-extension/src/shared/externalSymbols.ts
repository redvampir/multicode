export type IntegrationKind = 'library' | 'framework' | 'file';
export type IntegrationMode = 'explicit' | 'implicit';
export type SymbolKind = 'function' | 'variable' | 'class' | 'struct' | 'method' | 'enum';

export interface SourceIntegration {
  integrationId: string;
  attachedFiles: string[];
  mode: IntegrationMode;
  kind?: IntegrationKind;
  displayName?: string;
  version?: string;
}

export interface SymbolDescriptor {
  id: string;
  integrationId: string;
  symbolKind: SymbolKind;
  name: string;
  signatureHash?: string;
  namespacePath?: string[];
}

export interface SymbolLocalizationEntry {
  integrationId: string;
  symbolId: string;
  signatureHash?: string;
  localizedNameRu?: string;
  localizedNameEn?: string;
}
