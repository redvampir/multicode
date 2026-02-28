import type { PackageManifest, TypeHierarchyEntry } from './packageSchema';
import {
  TYPE_COMPATIBILITY_POLICY_VERSION,
  type CompatibilityPolicyContext,
  type TypeHierarchyRegistry,
} from './typeCompatibilityPolicy';

const normalizeTypeId = (value: string | undefined): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const appendHierarchy = (
  source: readonly TypeHierarchyEntry[],
  inheritance: Record<string, string[]>
): void => {
  for (const entry of source) {
    const childTypeId = normalizeTypeId(entry.typeId);
    if (!childTypeId) {
      continue;
    }
    const parents = entry.parents
      .map((parent) => normalizeTypeId(parent))
      .filter((parent): parent is string => Boolean(parent));
    inheritance[childTypeId] = parents;
  }
};

const resolveHierarchyVersion = (manifest: PackageManifest): string | undefined => {
  const metadataVersion = normalizeTypeId(manifest.metadata?.ue?.typeHierarchyVersion);
  if (metadataVersion) {
    return metadataVersion;
  }
  return normalizeTypeId(manifest.contributes?.typeCompatibilityPolicy?.version);
};

const buildRegistryFromManifests = (manifests: readonly PackageManifest[]): TypeHierarchyRegistry => {
  const inheritance: Record<string, string[]> = {};
  const versions = new Set<string>();

  for (const manifest of manifests) {
    const metadataHierarchy = manifest.metadata?.ue?.typeHierarchy ?? [];
    if (metadataHierarchy.length > 0) {
      appendHierarchy(metadataHierarchy, inheritance);
    } else {
      appendHierarchy(manifest.contributes?.typeCompatibilityPolicy?.hierarchy ?? [], inheritance);
    }

    const version = resolveHierarchyVersion(manifest);
    if (version) {
      versions.add(version);
    }
  }

  const policyVersion = versions.size > 0 ? Array.from(versions).sort().at(-1)! : TYPE_COMPATIBILITY_POLICY_VERSION;

  return {
    policyVersion,
    inheritance,
  };
};

export const buildTypeCompatibilityPolicyContext = (
  manifests: readonly PackageManifest[]
): CompatibilityPolicyContext => ({
  hierarchy: buildRegistryFromManifests(manifests),
});
