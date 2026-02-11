import { describe, expect, it, vi } from 'vitest';
import type { BlueprintNodeType } from '../shared/blueprintTypes';
import { CppCodeGenerator } from '../codegen/CppCodeGenerator';
import {
  isPackageRegistrySnapshotAvailable,
  resolveCodePreviewGenerator,
} from './codePreviewGenerator';
import { UnsupportedLanguageError } from '../codegen/factory';

describe('codePreviewGenerator', () => {
  it('должен использовать withPackages при валидном snapshot реестра', () => {
    const withPackagesSpy = vi.spyOn(CppCodeGenerator, 'withPackages');

    const resolution = resolveCodePreviewGenerator('cpp', {
      getNodeDefinition: () => undefined,
      packageNodeTypes: ['Custom' as BlueprintNodeType],
      registryVersion: 2,
    });

    expect(withPackagesSpy).toHaveBeenCalledOnce();
    expect(resolution.diagnostics.usedPackageRegistry).toBe(true);
    expect(resolution.diagnostics.registryVersion).toBe(2);
  });

  it('должен делать fallback на базовый генератор при недоступном реестре', () => {
    const withPackagesSpy = vi.spyOn(CppCodeGenerator, 'withPackages');

    const resolution = resolveCodePreviewGenerator('cpp', undefined);

    expect(withPackagesSpy).not.toHaveBeenCalled();
    expect(resolution.diagnostics.usedPackageRegistry).toBe(false);
    expect(resolution.diagnostics.fallbackReason).toBe('registry-unavailable');
    expect(resolution.generator).toBeInstanceOf(CppCodeGenerator);
  });

  it('должен различать пустой реестр и отсутствующий snapshot', () => {
    const withPackagesSpy = vi.spyOn(CppCodeGenerator, 'withPackages');

    // Валидный snapshot, но пустой список узлов
    const resolution = resolveCodePreviewGenerator('cpp', {
      getNodeDefinition: () => undefined,
      packageNodeTypes: [],
      registryVersion: 1,
    });

    expect(withPackagesSpy).not.toHaveBeenCalled();
    expect(resolution.diagnostics.usedPackageRegistry).toBe(false);
    expect(resolution.diagnostics.fallbackReason).toBe('registry-empty');
    expect(resolution.generator).toBeInstanceOf(CppCodeGenerator);
  });

  it('должен валидировать snapshot реестра', () => {
    expect(isPackageRegistrySnapshotAvailable(undefined)).toBe(false);
    expect(isPackageRegistrySnapshotAvailable({ registryVersion: 1 })).toBe(false);
    expect(isPackageRegistrySnapshotAvailable({
      getNodeDefinition: () => undefined,
      packageNodeTypes: [],
      registryVersion: 1,
    })).toBe(false);
  });

  it('должен выбрасывать ошибку для неподдерживаемого языка', () => {
    expect(() => resolveCodePreviewGenerator('rust')).toThrow(UnsupportedLanguageError);
  });
});
