import type { DependencyMapState } from './store/slices/indexerTypes';
import type { SourceIntegration, SymbolDescriptor, SymbolKind } from '../shared/externalSymbols';
import type { SymbolBadgeState } from './externalSymbolUi';
import { resolveSymbolUiStatus } from './externalSymbolUi';

export type DependencyScopeFilter = 'all' | 'explicit' | 'implicit';
export type DependencyKindFilter = 'all' | SymbolKind;

export interface SymbolTransferCapability {
  enabled: boolean;
  reasonCode: 'ok' | 'status' | 'kind';
}

export interface DependencySymbolRow {
  symbol: SymbolDescriptor;
  integration?: SourceIntegration;
  localized: { value: string; stale: boolean };
  status: ReturnType<typeof resolveSymbolUiStatus>;
  namespaceText: string;
  qualifiedName: string;
  shortSignature: string;
  parameters: string[];
  transfer: SymbolTransferCapability;
}

export interface DependencySymbolGroup {
  kind: SymbolKind;
  rows: DependencySymbolRow[];
}

export interface DependencyTreeIntegrationNode {
  integrationId: string;
  displayName: string;
  attachedFiles: string[];
  mode: SourceIntegration['mode'];
  kind: SourceIntegration['kind'];
}

export interface DependencyTreeModel {
  rootFilePath: string | null;
  integrations: DependencyTreeIntegrationNode[];
}

const SYMBOL_KIND_ORDER: SymbolKind[] = [
  'function',
  'method',
  'class',
  'struct',
  'enum',
  'variable',
];

const SYMBOL_KIND_ORDER_INDEX = new Map(SYMBOL_KIND_ORDER.map((kind, index) => [kind, index]));

const normalizePath = (filePath: string): string => filePath.replace(/\\/g, '/').toLowerCase();

const normalizeText = (value: string): string => value.trim().toLowerCase();

const splitSignatureParams = (rawParameters: string): string[] => {
  const tokens: string[] = [];
  let buffer = '';
  let angleDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;

  for (const char of rawParameters) {
    if (char === '<') {
      angleDepth += 1;
    } else if (char === '>') {
      angleDepth = Math.max(0, angleDepth - 1);
    } else if (char === '(') {
      parenDepth += 1;
    } else if (char === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
    } else if (char === '[') {
      bracketDepth += 1;
    } else if (char === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
    } else if (char === '{') {
      braceDepth += 1;
    } else if (char === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
    }

    if (char === ',' && angleDepth === 0 && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      const candidate = buffer.trim();
      if (candidate.length > 0) {
        tokens.push(candidate);
      }
      buffer = '';
      continue;
    }

    buffer += char;
  }

  const tail = buffer.trim();
  if (tail.length > 0) {
    tokens.push(tail);
  }

  return tokens;
};

export const extractParametersFromSignature = (signature?: string): string[] => {
  if (!signature) {
    return [];
  }

  const match = signature.match(/\((.*)\)/);
  if (!match) {
    return [];
  }

  const rawParameters = match[1]?.trim() ?? '';
  if (!rawParameters || rawParameters === 'void') {
    return [];
  }

  return splitSignatureParams(rawParameters);
};

export const formatShortSignature = (signature?: string): string => {
  if (!signature) {
    return '';
  }
  return signature.length <= 96 ? signature : `${signature.slice(0, 93)}...`;
};

const buildNamespaceText = (symbol: SymbolDescriptor): string =>
  Array.isArray(symbol.namespacePath) && symbol.namespacePath.length > 0
    ? symbol.namespacePath.join('::')
    : '';

const buildQualifiedName = (symbol: SymbolDescriptor): string => {
  const namespaceText = buildNamespaceText(symbol);
  return namespaceText ? `${namespaceText}::${symbol.name}` : symbol.name;
};

const isIntegrationInScope = (
  integration: SourceIntegration | undefined,
  activeFilePath: string | null
): boolean => {
  if (!integration) {
    return false;
  }

  if (!activeFilePath) {
    return true;
  }

  const scopeFiles = (integration.consumerFiles ?? []).map(normalizePath);
  if (scopeFiles.length === 0) {
    return true;
  }

  const normalizedActiveFile = normalizePath(activeFilePath);
  return scopeFiles.includes(normalizedActiveFile);
};

export const getTransferCapability = (
  symbol: SymbolDescriptor,
  status: SymbolBadgeState
): SymbolTransferCapability => {
  if (symbol.symbolKind !== 'function' && symbol.symbolKind !== 'method') {
    return { enabled: false, reasonCode: 'kind' };
  }

  if (status === 'disabled' || status === 'broken') {
    return { enabled: false, reasonCode: 'status' };
  }

  return { enabled: true, reasonCode: 'ok' };
};

export interface BuildDependencyRowsParams {
  symbols: SymbolDescriptor[];
  integrations: SourceIntegration[];
  activeFilePath: string | null;
  resolveLocalizedName: (symbol: SymbolDescriptor) => { value: string; stale: boolean };
  query: string;
  scopeFilter: DependencyScopeFilter;
  statusFilter: 'all' | SymbolBadgeState;
  kindFilter: DependencyKindFilter;
}

export const buildDependencyRows = ({
  symbols,
  integrations,
  activeFilePath,
  resolveLocalizedName,
  query,
  scopeFilter,
  statusFilter,
  kindFilter,
}: BuildDependencyRowsParams): DependencySymbolRow[] => {
  const integrationById = new Map(integrations.map((integration) => [integration.integrationId, integration]));
  const normalizedQuery = normalizeText(query);

  return symbols
    .map((symbol) => {
      const integration = integrationById.get(symbol.integrationId);
      const localized = resolveLocalizedName(symbol);
      const status = resolveSymbolUiStatus({
        symbol,
        integration,
        localizationStale: localized.stale,
        activeFilePath,
      });
      const namespaceText = buildNamespaceText(symbol);
      const transfer = getTransferCapability(symbol, status.state);

      return {
        symbol,
        integration,
        localized,
        status,
        namespaceText,
        qualifiedName: buildQualifiedName(symbol),
        shortSignature: formatShortSignature(symbol.signature),
        parameters: extractParametersFromSignature(symbol.signature),
        transfer,
      } satisfies DependencySymbolRow;
    })
    .filter((row) => {
      if (scopeFilter !== 'all' && row.integration?.mode !== scopeFilter) {
        return false;
      }

      if (statusFilter !== 'all' && row.status.state !== statusFilter) {
        return false;
      }

      if (kindFilter !== 'all' && row.symbol.symbolKind !== kindFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = [
        row.symbol.id,
        row.symbol.name,
        row.localized.value,
        row.namespaceText,
        row.qualifiedName,
        row.integration?.displayName ?? '',
        row.symbol.integrationId,
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    })
    .sort((left, right) => {
      const kindOrderLeft = SYMBOL_KIND_ORDER_INDEX.get(left.symbol.symbolKind) ?? 999;
      const kindOrderRight = SYMBOL_KIND_ORDER_INDEX.get(right.symbol.symbolKind) ?? 999;
      if (kindOrderLeft !== kindOrderRight) {
        return kindOrderLeft - kindOrderRight;
      }

      const localizedCompare = left.localized.value.localeCompare(right.localized.value, 'ru');
      if (localizedCompare !== 0) {
        return localizedCompare;
      }

      return left.namespaceText.localeCompare(right.namespaceText, 'ru');
    });
};

export const groupDependencyRowsByKind = (rows: DependencySymbolRow[]): DependencySymbolGroup[] => {
  const groupedRows = new Map<SymbolKind, DependencySymbolRow[]>();
  for (const kind of SYMBOL_KIND_ORDER) {
    groupedRows.set(kind, []);
  }

  for (const row of rows) {
    const bucket = groupedRows.get(row.symbol.symbolKind);
    if (bucket) {
      bucket.push(row);
    }
  }

  return SYMBOL_KIND_ORDER
    .map((kind) => ({
      kind,
      rows: groupedRows.get(kind) ?? [],
    }))
    .filter((group) => group.rows.length > 0);
};

export const buildDependencyTreeModel = (
  activeFilePath: string | null,
  integrations: SourceIntegration[],
  dependencyMap: DependencyMapState
): DependencyTreeModel => {
  const rootFilePath = activeFilePath ?? null;
  const integrationById = new Map(integrations.map((integration) => [integration.integrationId, integration]));
  const fromMap = new Set<string>();

  if (rootFilePath) {
    const normalizedRoot = normalizePath(rootFilePath);
    for (const edge of dependencyMap.edges) {
      if (normalizePath(edge.from) === normalizedRoot) {
        fromMap.add(edge.to);
      }
    }
  }

  const scopedIntegrations = integrations.filter((integration) =>
    isIntegrationInScope(integration, rootFilePath)
  );
  const selectedIntegrationIds = new Set<string>(scopedIntegrations.map((integration) => integration.integrationId));
  for (const integrationId of fromMap) {
    selectedIntegrationIds.add(integrationId);
  }

  const integrationNodes = Array.from(selectedIntegrationIds)
    .map((integrationId) => integrationById.get(integrationId))
    .filter((integration): integration is SourceIntegration => Boolean(integration))
    .map((integration) => ({
      integrationId: integration.integrationId,
      displayName: integration.displayName ?? integration.integrationId,
      attachedFiles: Array.isArray(integration.attachedFiles) ? integration.attachedFiles : [],
      mode: integration.mode,
      kind: integration.kind,
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName, 'ru'));

  return {
    rootFilePath,
    integrations: integrationNodes,
  };
};

export const createDependencyRowsSelector = () => {
  let lastSymbols: SymbolDescriptor[] | null = null;
  let lastIntegrations: SourceIntegration[] | null = null;
  let lastActiveFilePath: string | null = null;
  let lastResolver: BuildDependencyRowsParams['resolveLocalizedName'] | null = null;
  let lastQuery = '';
  let lastScopeFilter: DependencyScopeFilter = 'all';
  let lastStatusFilter: 'all' | SymbolBadgeState = 'all';
  let lastKindFilter: DependencyKindFilter = 'all';
  let lastResult: DependencySymbolRow[] = [];

  return (params: BuildDependencyRowsParams): DependencySymbolRow[] => {
    if (
      params.symbols === lastSymbols &&
      params.integrations === lastIntegrations &&
      params.activeFilePath === lastActiveFilePath &&
      params.resolveLocalizedName === lastResolver &&
      params.query === lastQuery &&
      params.scopeFilter === lastScopeFilter &&
      params.statusFilter === lastStatusFilter &&
      params.kindFilter === lastKindFilter
    ) {
      return lastResult;
    }

    lastSymbols = params.symbols;
    lastIntegrations = params.integrations;
    lastActiveFilePath = params.activeFilePath;
    lastResolver = params.resolveLocalizedName;
    lastQuery = params.query;
    lastScopeFilter = params.scopeFilter;
    lastStatusFilter = params.statusFilter;
    lastKindFilter = params.kindFilter;
    lastResult = buildDependencyRows(params);
    return lastResult;
  };
};

export const createDependencyGroupsSelector = () => {
  let lastRows: DependencySymbolRow[] | null = null;
  let lastResult: DependencySymbolGroup[] = [];

  return (rows: DependencySymbolRow[]): DependencySymbolGroup[] => {
    if (rows === lastRows) {
      return lastResult;
    }
    lastRows = rows;
    lastResult = groupDependencyRowsByKind(rows);
    return lastResult;
  };
};

export const createDependencyTreeSelector = () => {
  let lastActiveFilePath: string | null = null;
  let lastIntegrations: SourceIntegration[] | null = null;
  let lastDependencyMap: DependencyMapState | null = null;
  let lastResult: DependencyTreeModel = { rootFilePath: null, integrations: [] };

  return (
    activeFilePath: string | null,
    integrations: SourceIntegration[],
    dependencyMap: DependencyMapState
  ): DependencyTreeModel => {
    if (
      activeFilePath === lastActiveFilePath &&
      integrations === lastIntegrations &&
      dependencyMap === lastDependencyMap
    ) {
      return lastResult;
    }

    lastActiveFilePath = activeFilePath;
    lastIntegrations = integrations;
    lastDependencyMap = dependencyMap;
    lastResult = buildDependencyTreeModel(activeFilePath, integrations, dependencyMap);
    return lastResult;
  };
};
