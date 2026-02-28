export type IntegrationKind = 'library' | 'framework' | 'file';
export type IntegrationMode = 'explicit' | 'implicit';
export type IntegrationLocationType = 'npm' | 'vcpkg' | 'local_file' | 'local_folder' | 'git';
export type SymbolKind = 'function' | 'variable' | 'class' | 'struct' | 'method' | 'enum';

export interface IntegrationLocation {
  type: IntegrationLocationType;
  value: string;
}

export interface SourceIntegration {
  integrationId: string;
  attachedFiles: string[];
  mode: IntegrationMode;
  kind?: IntegrationKind;
  displayName?: string;
  version?: string;
  location?: IntegrationLocation;
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
