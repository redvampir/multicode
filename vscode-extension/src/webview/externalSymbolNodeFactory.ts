import type { SymbolDescriptor } from '../shared/externalSymbols';
import {
  createCallUserFunctionNode,
  type BlueprintFunction,
  type BlueprintNode,
  type FunctionParameter,
} from '../shared/blueprintTypes';
import type { PortDataType } from '../shared/portTypes';

export const EXTERNAL_SYMBOL_DRAG_MIME = 'application/multicode-external-symbol';

export interface ExternalSymbolDragPayload {
  symbol: SymbolDescriptor;
  localizedName: string;
}

export const isTransferableExternalSymbol = (symbol: SymbolDescriptor): boolean =>
  symbol.symbolKind === 'function' || symbol.symbolKind === 'method';

export const buildExternalSymbolQualifiedName = (symbol: SymbolDescriptor): string =>
  Array.isArray(symbol.namespacePath) && symbol.namespacePath.length > 0
    ? `${symbol.namespacePath.join('::')}::${symbol.name}`
    : symbol.name;

const splitFunctionParameterList = (parametersRaw: string): string[] => {
  const parts: string[] = [];
  let buffer = '';
  let angleDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;

  for (const char of parametersRaw) {
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
      const token = buffer.trim();
      if (token.length > 0) {
        parts.push(token);
      }
      buffer = '';
      continue;
    }

    buffer += char;
  }

  const tail = buffer.trim();
  if (tail.length > 0) {
    parts.push(tail);
  }

  return parts;
};

const mapExternalParameterTypeToPortDataType = (typeText: string): PortDataType => {
  const normalized = typeText.toLowerCase();

  if (normalized.includes('std::string') || normalized.includes('string_view') || normalized.includes('char')) {
    return 'string';
  }
  if (normalized.includes('bool')) {
    return 'bool';
  }
  if (normalized.includes('double')) {
    return 'double';
  }
  if (normalized.includes('float')) {
    return 'float';
  }
  if (normalized.includes('int64') || normalized.includes('long long')) {
    return 'int64';
  }
  if (
    normalized.includes('int') ||
    normalized.includes('short') ||
    normalized.includes('size_t') ||
    normalized.includes('unsigned')
  ) {
    return 'int32';
  }
  if (normalized.includes('std::vector')) {
    return 'vector';
  }
  if (normalized.includes('std::array') || normalized.endsWith('[]')) {
    return 'array';
  }

  return 'any';
};

export const parseExternalInputParameters = (signature?: string): FunctionParameter[] => {
  if (!signature) {
    return [];
  }

  const signatureMatch = signature.match(/\((.*)\)/);
  if (!signatureMatch) {
    return [];
  }

  const rawParameters = signatureMatch[1]?.trim() ?? '';
  if (!rawParameters || rawParameters === 'void') {
    return [];
  }

  const parameterTokens = splitFunctionParameterList(rawParameters);
  const parsedParameters: FunctionParameter[] = [];

  for (const [index, parameterToken] of parameterTokens.entries()) {
    const withoutDefault = parameterToken.split('=')[0]?.trim() ?? '';
    if (!withoutDefault || withoutDefault === '...') {
      continue;
    }

    const nameMatch = /([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?$/.exec(withoutDefault);
    const rawName = nameMatch?.[1] ?? `arg${index + 1}`;
    const safeId = rawName
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '') || `arg${index + 1}`;
    const typeText = nameMatch ? withoutDefault.slice(0, nameMatch.index).trim() : withoutDefault;

    parsedParameters.push({
      id: `ext_arg_${index + 1}_${safeId}`,
      name: rawName,
      nameRu: rawName,
      direction: 'input',
      dataType: mapExternalParameterTypeToPortDataType(typeText),
    });
  }

  return parsedParameters;
};

export const createExternalSymbolCallNode = (
  symbol: SymbolDescriptor,
  localizedName: string,
  position: { x: number; y: number }
): BlueprintNode => {
  const qualifiedFunctionName = buildExternalSymbolQualifiedName(symbol);
  const inputParameters = parseExternalInputParameters(symbol.signature);
  const timestamp = new Date().toISOString();

  const syntheticFunction: BlueprintFunction = {
    id: `external::${symbol.integrationId}::${symbol.id}`,
    name: qualifiedFunctionName,
    nameRu: localizedName || symbol.name,
    parameters: inputParameters,
    graph: {
      nodes: [],
      edges: [],
    },
    isPure: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const callNode = createCallUserFunctionNode(syntheticFunction, position);

  return {
    ...callNode,
    properties: {
      ...(callNode.properties ?? {}),
      externalSymbol: {
        integrationId: symbol.integrationId,
        symbolId: symbol.id,
        signature: symbol.signature,
        signatureHash: symbol.signatureHash,
        qualifiedName: qualifiedFunctionName,
      },
      symbolRef: {
        integrationId: symbol.integrationId,
        symbolId: symbol.id,
        signature: symbol.signature,
        signatureHash: symbol.signatureHash,
        qualifiedName: qualifiedFunctionName,
      },
      symbolKind: symbol.symbolKind,
    },
  };
};

export const serializeExternalSymbolDragPayload = (
  payload: ExternalSymbolDragPayload
): string =>
  JSON.stringify(payload);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toSymbolDescriptor = (value: unknown): SymbolDescriptor | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.integrationId !== 'string' ||
    typeof value.symbolKind !== 'string' ||
    typeof value.name !== 'string'
  ) {
    return null;
  }

  if (
    value.symbolKind !== 'function' &&
    value.symbolKind !== 'method' &&
    value.symbolKind !== 'class' &&
    value.symbolKind !== 'struct' &&
    value.symbolKind !== 'enum' &&
    value.symbolKind !== 'variable'
  ) {
    return null;
  }

  const namespacePath = Array.isArray(value.namespacePath)
    ? value.namespacePath.filter((item): item is string => typeof item === 'string')
    : undefined;

  return {
    id: value.id,
    integrationId: value.integrationId,
    symbolKind: value.symbolKind,
    name: value.name,
    signature: typeof value.signature === 'string' ? value.signature : undefined,
    signatureHash: typeof value.signatureHash === 'string' ? value.signatureHash : undefined,
    namespacePath,
  };
};

export const deserializeExternalSymbolDragPayload = (raw: string): ExternalSymbolDragPayload | null => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }

    const symbol = toSymbolDescriptor(parsed.symbol);
    if (!symbol) {
      return null;
    }

    return {
      symbol,
      localizedName: typeof parsed.localizedName === 'string' ? parsed.localizedName : symbol.name,
    };
  } catch {
    return null;
  }
};
