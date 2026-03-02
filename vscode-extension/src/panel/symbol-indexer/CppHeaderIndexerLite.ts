import * as fs from 'fs/promises';
import * as path from 'path';
import type { SourceIntegration, SymbolDescriptor } from '../../shared/externalSymbols';
import type { SymbolIndexer } from './SymbolIndexer';
import { sha1 } from './hash';

const CPP_PARSE_EXTENSIONS = new Set(['.h', '.hpp', '.hh', '.hxx', '.c', '.cc', '.cpp', '.cxx', '.ipp']);
const FUNCTION_DECLARATION_PATTERN =
  /(?:^|\n)\s*(?:template\s*<[^>]+>\s*)?(?:inline\s+|constexpr\s+|consteval\s+|constinit\s+|static\s+|extern\s+|virtual\s+|friend\s+|explicit\s+|mutable\s+)*[\w:<>~*&\s]+?\s+([A-Za-z_]\w*)\s*\(([^;{}]*)\)\s*(?:const\s*)?(?:noexcept(?:\s*\([^)]*\))?\s*)?(?:=\s*0\s*)?;/g;
const FUNCTION_DEFINITION_PATTERN =
  /(?:^|\n)\s*(?:template\s*<[^>]+>\s*)?(?:inline\s+|constexpr\s+|consteval\s+|constinit\s+|static\s+|extern\s+|virtual\s+|friend\s+|explicit\s+|mutable\s+)*[\w:<>~*&\s]+?\s+([A-Za-z_]\w*)\s*\(([^;{}]*)\)\s*(?:const\s*)?(?:noexcept(?:\s*\([^)]*\))?\s*)?\{/g;
const IGNORED_SYMBOL_NAMES = new Set(['if', 'for', 'while', 'switch', 'catch']);
const NAMESPACE_OR_BRACE_PATTERN = /\b(?:inline\s+)?namespace\s+([A-Za-z_]\w*(?:::[A-Za-z_]\w*)*)\s*\{|{|}/g;

interface NamespaceScope {
  name: string;
  depth: number;
}

const resolveNamespacePathAtOffset = (content: string, offset: number): string[] => {
  const scopes: NamespaceScope[] = [];
  let depth = 0;
  const namespaceMatcher = new RegExp(NAMESPACE_OR_BRACE_PATTERN.source, 'g');

  for (const match of content.matchAll(namespaceMatcher)) {
    const tokenOffset = match.index ?? 0;
    if (tokenOffset >= offset) {
      break;
    }

    if (match[1]) {
      depth += 1;
      const namespaceSegments = match[1].split('::').filter((segment) => segment.length > 0);
      for (const namespaceSegment of namespaceSegments) {
        scopes.push({ name: namespaceSegment, depth });
      }
      continue;
    }

    const token = match[0];
    if (token === '{') {
      depth += 1;
      continue;
    }

    depth = Math.max(0, depth - 1);
    while (scopes.length > 0 && scopes[scopes.length - 1].depth > depth) {
      scopes.pop();
    }
  }

  return scopes.map((scope) => scope.name);
};

export class CppHeaderIndexerLite implements SymbolIndexer {
  public readonly id = 'cpp-header-indexer-lite';

  public canHandle(integration: SourceIntegration): boolean {
    return integration.attachedFiles.some((file) => CPP_PARSE_EXTENSIONS.has(path.extname(file).toLowerCase()));
  }

  public async index(integration: SourceIntegration): Promise<SymbolDescriptor[]> {
    const symbols: SymbolDescriptor[] = [];
    const seen = new Set<string>();

    for (const filePath of integration.attachedFiles) {
      if (!CPP_PARSE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
        continue;
      }

      let content = '';
      try {
        content = await fs.readFile(filePath, 'utf8');
      } catch {
        continue;
      }

      const matchers = [FUNCTION_DECLARATION_PATTERN, FUNCTION_DEFINITION_PATTERN];
      for (const matcher of matchers) {
        for (const match of content.matchAll(matcher)) {
          const name = match[1]?.trim();
          if (!name || IGNORED_SYMBOL_NAMES.has(name)) {
            continue;
          }

          const parameters = (match[2] ?? '').replace(/\s+/g, ' ').trim();
          const signature = `${name}(${parameters})`;
          const uniqueKey = `${filePath}::${signature}`;
          if (seen.has(uniqueKey)) {
            continue;
          }
          seen.add(uniqueKey);
          const namespacePath = resolveNamespacePathAtOffset(content, match.index ?? 0);

        symbols.push({
          id: `${integration.integrationId}::${name}`,
          integrationId: integration.integrationId,
          symbolKind: 'function',
          name,
          signature,
          signatureHash: sha1(signature),
          namespacePath,
        });
        }
      }
    }

    return symbols;
  }
}
