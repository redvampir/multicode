/**
 * usePackageRegistry — хук для работы с реестром пакетов узлов
 * 
 * Функции:
 * - Загрузка стандартного пакета @multicode/std при монтировании
 * - Подписка на изменения реестра
 * - Предоставление узлов и категорий для UI
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  PackageRegistry,
  globalRegistry,
  PackageCategory,
  registryToNodeTypeDefinitions,
} from '../../shared/packageLoader';
import { NodeTypeDefinition, NODE_TYPE_DEFINITIONS, NODE_CATEGORIES } from '../../shared/blueprintTypes';

// Стандартный пакет (встроен в бандл для простоты)
// В будущем можно загружать через fetch или vscode API
import {
  bundledPackageNamesInPriorityOrder,
  resolveBundledPackages,
  type BundledPackageSettings,
} from '../../shared/bundledPackages';

export interface UsePackageRegistryResult {
  /** Готов ли реестр (загружен ли стандартный пакет) */
  ready: boolean;
  
  /** Ошибки загрузки */
  errors: string[];
  
  /** Все определения узлов (из пакетов + встроенные) */
  nodeDefinitions: Record<string, NodeTypeDefinition>;
  
  /** Все категории */
  categories: PackageCategory[];
  
  /** Узлы сгруппированные по категориям */
  nodesByCategory: Map<string, NodeTypeDefinition[]>;
  
  /** Список загруженных пакетов */
  packages: { name: string; version: string; displayName: string; nodeCount: number }[];

  /** Версия реестра (инкремент при изменениях) */
  registryVersion: number;
  
  /** Получить определение узла по типу */
  getNode: (type: string) => NodeTypeDefinition | undefined;
  
  /** Загрузить дополнительный пакет */
  loadPackage: (jsonData: unknown) => { success: boolean; errors?: string[] };
  
  /** Выгрузить пакет */
  unloadPackage: (name: string) => boolean;
  
  /** Экземпляр реестра */
  registry: PackageRegistry;
}

/**
 * Объединить встроенные узлы с узлами из пакетов
 */
function mergeNodeDefinitions(
  registry: PackageRegistry
): Record<string, NodeTypeDefinition> {
  // Начинаем со встроенных определений
  const result: Record<string, NodeTypeDefinition> = { ...NODE_TYPE_DEFINITIONS };
  
  // Добавляем/перезаписываем узлами из пакетов
  const packageNodes = registryToNodeTypeDefinitions(registry);
  for (const [type, def] of Object.entries(packageNodes)) {
    result[type] = def;
  }
  
  return result;
}

/**
 * Объединить встроенные категории с категориями из пакетов
 */
function mergeCategories(registry: PackageRegistry): PackageCategory[] {
  // Встроенные категории
  const builtinCategories: PackageCategory[] = NODE_CATEGORIES.map(cat => ({
    ...cat,
    packageName: 'builtin',
  }));
  
  // Категории из пакетов (без дублирования по id)
  const packageCategories = registry.getAllCategories();
  const seenIds = new Set(builtinCategories.map(c => c.id));
  
  for (const cat of packageCategories) {
    if (!seenIds.has(cat.id)) {
      builtinCategories.push(cat);
      seenIds.add(cat.id);
    }
  }
  
  return builtinCategories;
}

/**
 * Сгруппировать узлы по категориям
 */
function groupNodesByCategory(
  nodes: Record<string, NodeTypeDefinition>
): Map<string, NodeTypeDefinition[]> {
  const result = new Map<string, NodeTypeDefinition[]>();
  
  for (const def of Object.values(nodes)) {
    const category = def.category;
    if (!result.has(category)) {
      result.set(category, []);
    }
    result.get(category)!.push(def);
  }
  
  return result;
}

/**
 * Хук для работы с реестром пакетов
 */
export function usePackageRegistry(settings?: Partial<BundledPackageSettings>): UsePackageRegistryResult {
  const [ready, setReady] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [version, setVersion] = useState(0); // Для триггера перерендера
  const enableUePackage = settings?.enableUePackage ?? false;
  
  // Загрузка встроенных пакетов при монтировании.
  // Важно: порядок фиксированный и воспроизводимый (std -> ue).
  useEffect(() => {
    const loadBundledPackages = () => {
      const nextErrors: string[] = [];
      const bundledPackages = resolveBundledPackages({ enableUePackage });

      const desiredPackageNames = new Set(bundledPackages.map(pkg => pkg.name));

      for (const packageName of bundledPackageNamesInPriorityOrder) {
        if (!desiredPackageNames.has(packageName) && globalRegistry.getPackage(packageName)) {
          globalRegistry.unloadPackage(packageName);
        }
      }

      for (const bundledPackage of bundledPackages) {
        if (globalRegistry.getPackage(bundledPackage.name)) {
          continue;
        }

        try {
          const result = globalRegistry.loadPackage(bundledPackage.manifest);
          if (!result.success) {
            nextErrors.push(...(result.errors ?? [`Unknown error loading ${bundledPackage.name}`]));
            console.error(`Failed to load ${bundledPackage.name}:`, result.errors);
            continue;
          }

          console.log('Loaded package', bundledPackage.name, 'with', result.package?.nodeDefinitions.size, 'nodes');
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          nextErrors.push(`${bundledPackage.name}: ${message}`);
          console.error(`Error loading package ${bundledPackage.name}:`, err);
        }
      }

      setErrors(nextErrors);
      setVersion(v => v + 1);
      setReady(true);
    };

    loadBundledPackages();
  }, [enableUePackage]);
  
  // Подписка на изменения реестра
  useEffect(() => {
    const unsubscribe = globalRegistry.subscribe((event) => {
      console.log('Package registry event:', event.type, event.packageName);
      setVersion(v => v + 1);
    });
    
    return unsubscribe;
  }, []);
  
  // Мемоизированные данные
  // version используется для инвалидации кэша при изменении реестра
  const nodeDefinitions = useMemo(
    () => mergeNodeDefinitions(globalRegistry),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version]
  );
  
  const categories = useMemo(
    () => mergeCategories(globalRegistry),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version]
  );
  
  const nodesByCategory = useMemo(
    () => groupNodesByCategory(nodeDefinitions),
    [nodeDefinitions]
  );
  
  const packages = useMemo(
    () => globalRegistry.getPackageList(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version]
  );
  
  // Callbacks
  const getNode = useCallback((type: string): NodeTypeDefinition | undefined => {
    // Сначала проверяем реестр пакетов
    const fromPackage = globalRegistry.getNodeDefinition(type);
    if (fromPackage) return fromPackage;
    
    // Затем встроенные
    return NODE_TYPE_DEFINITIONS[type as keyof typeof NODE_TYPE_DEFINITIONS];
  }, []);
  
  const loadPackage = useCallback((jsonData: unknown) => {
    const result = globalRegistry.loadPackage(jsonData);
    return {
      success: result.success,
      errors: result.errors,
    };
  }, []);
  
  const unloadPackage = useCallback((name: string) => {
    return globalRegistry.unloadPackage(name);
  }, []);
  
  return {
    ready,
    errors,
    nodeDefinitions,
    categories,
    nodesByCategory,
    packages,
    registryVersion: version,
    getNode,
    loadPackage,
    unloadPackage,
    registry: globalRegistry,
  };
}

export default usePackageRegistry;
