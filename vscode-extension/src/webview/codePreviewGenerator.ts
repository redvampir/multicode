/**
 * Code Preview Generator Resolver
 * - Цель: единая стратегия выбора генератора предпросмотра для всех панелей.
 * - Инварианты: package-aware генератор включается только при валидном snapshot реестра.
 * - Риски: частично заполненный snapshot может привести к скрытому fallback.
 * - Проверка: npm run test:unit -- src/webview/codePreviewGenerator.test.ts
 */

import type { BlueprintNodeType, GraphLanguage } from '../shared/blueprintTypes';
import { CppCodeGenerator } from '../codegen/CppCodeGenerator';
import type { ICodeGenerator } from '../codegen/types';
import type { NodeDefinitionGetter } from '../codegen/generators/template';
import { isLanguageSupported } from '../codegen/languageSupport';
import { UnsupportedLanguageError } from '../codegen/factory';

export interface PackageRegistrySnapshot {
  getNodeDefinition: NodeDefinitionGetter;
  packageNodeTypes: BlueprintNodeType[];
  registryVersion: number;
}

export interface GeneratorDiagnostics {
  usedPackageRegistry: boolean;
  packageNodeTypeCount: number;
  registryVersion?: number;
  fallbackReason?: 'registry-unavailable' | 'registry-empty';
}

export interface GeneratorResolution {
  generator: ICodeGenerator;
  diagnostics: GeneratorDiagnostics;
}

export function isPackageRegistrySnapshotAvailable(
  snapshot?: Partial<PackageRegistrySnapshot>
): snapshot is PackageRegistrySnapshot {
  return Boolean(
    snapshot
      && typeof snapshot.getNodeDefinition === 'function'
      && typeof snapshot.registryVersion === 'number'
      && Array.isArray(snapshot.packageNodeTypes)
      && snapshot.packageNodeTypes.length > 0
  );
}

/**
 * Проверяет, является ли snapshot валидным, но пустым (без узлов пакетов).
 * Это отличается от полного отсутствия snapshot.
 */
function isPackageRegistrySnapshotEmpty(
  snapshot?: Partial<PackageRegistrySnapshot>
): boolean {
  return Boolean(
    snapshot
      && typeof snapshot.getNodeDefinition === 'function'
      && typeof snapshot.registryVersion === 'number'
      && Array.isArray(snapshot.packageNodeTypes)
      && snapshot.packageNodeTypes.length === 0
  );
}

/**
 * Контракт:
 * - Вход: language + опциональный snapshot реестра пакетов.
 * - Выход: генератор + диагностическая мета-информация.
 * - Edge cases: неподдерживаемый язык выбрасывает UnsupportedLanguageError;
 *   неполный snapshot ведёт к безопасному fallback на базовый генератор.
 * - Fallback reasons:
 *   - 'registry-unavailable': snapshot отсутствует или неполный (нет getNodeDefinition/registryVersion)
 *   - 'registry-empty': snapshot валиден, но не содержит узлов пакетов (packageNodeTypes.length === 0)
 * - Почему так: один резолвер исключает дубли и расхождение поведения панелей.
 */
export function resolveCodePreviewGenerator(
  language: GraphLanguage,
  snapshot?: Partial<PackageRegistrySnapshot>
): GeneratorResolution {
  if (!isLanguageSupported(language)) {
    throw new UnsupportedLanguageError(language);
  }

  if (isPackageRegistrySnapshotAvailable(snapshot)) {
    return {
      generator: CppCodeGenerator.withPackages(snapshot.getNodeDefinition, snapshot.packageNodeTypes),
      diagnostics: {
        usedPackageRegistry: true,
        packageNodeTypeCount: snapshot.packageNodeTypes.length,
        registryVersion: snapshot.registryVersion,
      },
    };
  }

  // Проверяем, является ли snapshot валидным но пустым
  if (isPackageRegistrySnapshotEmpty(snapshot)) {
    return {
      generator: new CppCodeGenerator(),
      diagnostics: {
        usedPackageRegistry: false,
        packageNodeTypeCount: 0,
        fallbackReason: 'registry-empty',
      },
    };
  }

  // Snapshot отсутствует или неполный
  return {
    generator: new CppCodeGenerator(),
    diagnostics: {
      usedPackageRegistry: false,
      packageNodeTypeCount: 0,
      fallbackReason: 'registry-unavailable',
    },
  };
}
