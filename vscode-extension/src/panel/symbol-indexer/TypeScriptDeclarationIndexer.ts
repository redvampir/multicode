import * as fs from 'fs/promises';
import * as path from 'path';
import ts from 'typescript';
import type { SourceIntegration, SymbolDescriptor, SymbolKind } from '../../shared/externalSymbols';
import type { SymbolIndexer } from './SymbolIndexer';
import { sha1 } from './hash';

const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.d.ts', '.mts', '.cts']);

const isSymbolKind = (kind: ts.SyntaxKind): SymbolKind | null => {
  switch (kind) {
    case ts.SyntaxKind.FunctionDeclaration:
      return 'function';
    case ts.SyntaxKind.VariableStatement:
      return 'variable';
    case ts.SyntaxKind.ClassDeclaration:
      return 'class';
    case ts.SyntaxKind.InterfaceDeclaration:
      return 'struct';
    case ts.SyntaxKind.EnumDeclaration:
      return 'enum';
    default:
      return null;
  }
};

export class TypeScriptDeclarationIndexer implements SymbolIndexer {
  public readonly id = 'typescript-declaration-indexer';

  public canHandle(integration: SourceIntegration): boolean {
    return integration.attachedFiles.some((file) => TS_EXTENSIONS.has(path.extname(file).toLowerCase()));
  }

  public async index(integration: SourceIntegration): Promise<SymbolDescriptor[]> {
    const symbols: SymbolDescriptor[] = [];

    for (const filePath of integration.attachedFiles) {
      if (!TS_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
        continue;
      }
      const content = await fs.readFile(filePath, 'utf8');
      const source = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
      source.forEachChild((node) => {
        const exportModifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
        const isExported = Boolean(exportModifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
        if (!isExported) {
          return;
        }

        const symbolKind = isSymbolKind(node.kind);
        if (!symbolKind) {
          return;
        }

        const name = this.getDeclarationName(node);
        if (!name) {
          return;
        }

        const rawSignature = node.getText(source).replace(/\s+/g, ' ').trim();
        const signatureHash = sha1(rawSignature);
        symbols.push({
          id: `${integration.integrationId}::${name}`,
          integrationId: integration.integrationId,
          symbolKind,
          name,
          signatureHash,
          namespacePath: [path.basename(filePath)],
        });
      });
    }

    return symbols;
  }

  private getDeclarationName(node: ts.Node): string | null {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isEnumDeclaration(node)
    ) {
      return node.name?.text ?? null;
    }
    if (ts.isVariableStatement(node)) {
      const decl = node.declarationList.declarations[0];
      if (decl && ts.isIdentifier(decl.name)) {
        return decl.name.text;
      }
    }
    return null;
  }
}
