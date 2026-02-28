import stdPackage from '../../../packages/std/package.json';
import uePackage from '../../../packages/ue/package.json';

export interface BundledPackageDescriptor {
  manifest: unknown;
  name: string;
  enabledByDefault: boolean;
}

export interface BundledPackageSettings {
  enableUePackage: boolean;
}

const DEFAULT_SETTINGS: BundledPackageSettings = {
  enableUePackage: false,
};

const BUNDLED_PACKAGES: BundledPackageDescriptor[] = [
  {
    manifest: stdPackage,
    name: '@multicode/std',
    enabledByDefault: true,
  },
  {
    manifest: uePackage,
    name: '@multicode/ue',
    enabledByDefault: false,
  },
];

export function resolveBundledPackages(
  settings?: Partial<BundledPackageSettings>
): BundledPackageDescriptor[] {
  const effectiveSettings: BundledPackageSettings = {
    ...DEFAULT_SETTINGS,
    ...settings,
  };

  return BUNDLED_PACKAGES.filter((pkg) => {
    if (pkg.name === '@multicode/ue') {
      return effectiveSettings.enableUePackage;
    }
    return pkg.enabledByDefault;
  });
}

export const bundledPackageNamesInPriorityOrder = BUNDLED_PACKAGES.map((pkg) => pkg.name);

