import type { BlueprintGraphState, BlueprintNode } from '../shared/blueprintTypes';
import type { SourceIntegration, SymbolDescriptor } from '../shared/externalSymbols';
import { CodeGenErrorCode, type CodeGenError } from './types';

interface NodeSymbolBinding {
  integrationId: string;
  symbolId: string;
  signatureHash?: string;
}

export interface ExternalSymbolValidationResult {
  resolvedSymbolsByNodeId: Map<string, SymbolDescriptor>;
  requiredIncludes: string[];
  errors: CodeGenError[];
  brokenNodeIds: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const readNodeBinding = (node: BlueprintNode): NodeSymbolBinding | null => {
  if (!isRecord(node.properties)) {
    return null;
  }
  const direct = node.properties.externalSymbol;
  const fallback = node.properties.symbolRef;
  const source = isRecord(direct) ? direct : isRecord(fallback) ? fallback : null;
  if (!source) {
    return null;
  }

  const integrationId = typeof source.integrationId === 'string' ? source.integrationId : null;
  const symbolId = typeof source.symbolId === 'string' ? source.symbolId : null;
  if (!integrationId || !symbolId) {
    return null;
  }

  return {
    integrationId,
    symbolId,
    signatureHash: typeof source.signatureHash === 'string' ? source.signatureHash : undefined,
  };
};

const buildIncludeFromIntegration = (integration: SourceIntegration): string | null => {
  const location = integration.location;
  if (!location) {
    return integration.kind === 'framework' ? `<${integration.integrationId}>` : null;
  }

  if (location.type === 'local_file') {
    return `"${location.value}"`;
  }
  if (location.type === 'local_folder') {
    return `"${location.value}/${integration.integrationId}.h"`;
  }
  if (location.type === 'npm') {
    return `"${location.value}"`;
  }
  return `<${integration.integrationId}>`;
};

export const validateExternalSymbols = (
  graph: BlueprintGraphState,
  symbolCatalog: SymbolDescriptor[],
  integrations: SourceIntegration[],
  getActualSignatureHash: (integrationId: string, symbolId: string) => string | undefined
): ExternalSymbolValidationResult => {
  const symbolMap = new Map<string, SymbolDescriptor>();
  for (const symbol of symbolCatalog) {
    symbolMap.set(`${symbol.integrationId}::${symbol.id}`, symbol);
    symbolMap.set(symbol.id, symbol);
  }

  const integrationMap = new Map(integrations.map((integration) => [integration.integrationId, integration]));
  const resolvedSymbolsByNodeId = new Map<string, SymbolDescriptor>();
  const errors: CodeGenError[] = [];
  const brokenNodeIds: string[] = [];
  const includes = new Set<string>();

  for (const node of graph.nodes) {
    const binding = readNodeBinding(node);
    if (!binding) {
      continue;
    }

    const symbol = symbolMap.get(binding.symbolId) ?? symbolMap.get(`${binding.integrationId}::${binding.symbolId}`);
    if (!symbol) {
      brokenNodeIds.push(node.id);
      errors.push({
        nodeId: node.id,
        code: CodeGenErrorCode.EXTERNAL_SYMBOL_NOT_FOUND,
        message: `Внешний символ "${binding.symbolId}" не найден в интеграции ${binding.integrationId}`,
        messageEn: `External symbol "${binding.symbolId}" is not found in integration ${binding.integrationId}`,
      });
      continue;
    }

    const actualSignatureHash = getActualSignatureHash(binding.integrationId, symbol.id);
    if (binding.signatureHash && actualSignatureHash && binding.signatureHash !== actualSignatureHash) {
      brokenNodeIds.push(node.id);
      errors.push({
        nodeId: node.id,
        code: CodeGenErrorCode.EXTERNAL_SYMBOL_SIGNATURE_MISMATCH,
        message: `Сигнатура внешнего символа "${symbol.name}" устарела. Требуется reindex интеграции ${binding.integrationId}.`,
        messageEn: `External symbol signature for "${symbol.name}" is outdated. Reindex integration ${binding.integrationId}.`,
      });
      continue;
    }

    resolvedSymbolsByNodeId.set(node.id, symbol);
    const integration = integrationMap.get(symbol.integrationId);
    if (!integration) {
      continue;
    }
    const includeHeader = buildIncludeFromIntegration(integration);
    if (includeHeader) {
      includes.add(includeHeader);
    }
  }

  return {
    resolvedSymbolsByNodeId,
    requiredIncludes: Array.from(includes).sort(),
    errors,
    brokenNodeIds,
  };
};
