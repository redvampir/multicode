import type { SourceIntegration, SymbolDescriptor, SymbolKind, SymbolLocalizationEntry } from '../../../shared/externalSymbols';

export type IndexerStatus = 'indexing' | 'error' | 'ready';

export interface IndexerDiagnostic {
  integrationId?: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  code?: string;
}

export interface IndexerUiState {
  status: IndexerStatus;
  error: string | null;
}

export interface IndexerDataState {
  lastUpdated: string | null;
  diagnostics: IndexerDiagnostic[];
}

export interface DependencyMapNode {
  id: string;
  kind: 'file' | 'library' | 'framework';
}

export interface DependencyMapEdge {
  from: string;
  to: string;
}

export interface DependencyMapState {
  nodes: DependencyMapNode[];
  edges: DependencyMapEdge[];
}

export interface SymbolFilterContext {
  query?: string;
  integrationId?: string;
  symbolKinds?: SymbolKind[];
  rootDependencyId?: string;
}

export interface LocalizedSymbolView {
  value: string;
  stale: boolean;
}

export interface IntegrationSliceState {
  integrations: SourceIntegration[];
  indexerUi: IndexerUiState;
  indexerData: IndexerDataState;
}

export interface SymbolCatalogSliceState {
  symbolCatalog: Record<string, SymbolDescriptor[]>;
}

export interface DependencyMapSliceState {
  dependencyMap: DependencyMapState;
}

export interface SymbolLocalizationSliceState {
  symbolLocalizations: Record<string, SymbolLocalizationEntry>;
}
