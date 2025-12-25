/**
 * PackageLoader — загрузчик пакетов MultiCode
 * 
 * Функции:
 * - Загрузка пакетов из JSON
 * - Валидация через Zod-схемы
 * - Преобразование в формат NodeTypeDefinition
 */

import {
  PackageManifest,
  NodeDefinition,
  PortDefinition,
  safeValidatePackageManifest,
} from './packageSchema';
import { NodeTypeDefinition, BlueprintNodeType } from './blueprintTypes';
import { PortDataType, PortDirection } from './portTypes';

// ============================================
// Типы
// ============================================

/** Результат загрузки пакета */
export interface PackageLoadResult {
  success: boolean;
  package?: LoadedPackage;
  errors?: string[];
}

/** Загруженный пакет */
export interface LoadedPackage {
  manifest: PackageManifest;
  nodeDefinitions: Map<string, NodeTypeDefinition>;
  categories: PackageCategory[];
}

/** Категория из пакета */
export interface PackageCategory {
  id: string;
  label: string;
  labelRu: string;
  icon?: string;
  color?: string;
  packageName: string;
}

// ============================================
// PackageLoader
// ============================================

export class PackageLoader {
  /**
   * Загрузить пакет из JSON-данных
   */
  static load(jsonData: unknown): PackageLoadResult {
    // Валидация
    const validation = safeValidatePackageManifest(jsonData);
    
    if (!validation.success) {
      const errors = validation.errors?.errors.map(e => 
        `${e.path.join('.')}: ${e.message}`
      ) ?? ['Unknown validation error'];
      return { success: false, errors };
    }
    
    const manifest = validation.data!;
    
    // Преобразование узлов
    const nodeDefinitions = new Map<string, NodeTypeDefinition>();
    const conversionErrors: string[] = [];
    
    for (const nodeDef of manifest.nodes) {
      try {
        const converted = PackageLoader.convertNodeDefinition(nodeDef, manifest.name);
        nodeDefinitions.set(nodeDef.type, converted);
      } catch (err) {
        conversionErrors.push(`Node ${nodeDef.type}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    
    if (conversionErrors.length > 0) {
      return { success: false, errors: conversionErrors };
    }
    
    // Категории
    const categories: PackageCategory[] = (manifest.categories ?? []).map(cat => ({
      ...cat,
      packageName: manifest.name,
    }));
    
    return {
      success: true,
      package: {
        manifest,
        nodeDefinitions,
        categories,
      },
    };
  }
  
  /**
   * Загрузить пакет из JSON-строки
   */
  static loadFromString(jsonString: string): PackageLoadResult {
    try {
      const data = JSON.parse(jsonString);
      return PackageLoader.load(data);
    } catch (err) {
      return {
        success: false,
        errors: [`JSON parse error: ${err instanceof Error ? err.message : String(err)}`],
      };
    }
  }
  
  /**
   * Преобразовать определение узла из формата пакета в NodeTypeDefinition
   */
  private static convertNodeDefinition(
    nodeDef: NodeDefinition,
    packageName: string
  ): NodeTypeDefinition {
    return {
      type: nodeDef.type as BlueprintNodeType,
      label: nodeDef.label,
      labelRu: nodeDef.labelRu,
      category: nodeDef.category as NodeTypeDefinition['category'],
      description: nodeDef.description,
      descriptionRu: nodeDef.descriptionRu,
      headerColor: nodeDef.headerColor,
      dynamicPorts: nodeDef.dynamicPorts,
      inputs: nodeDef.inputs.map(p => PackageLoader.convertPort(p, 'input')),
      outputs: nodeDef.outputs.map(p => PackageLoader.convertPort(p, 'output')),
      // Расширенные поля (хранятся в метаданных)
      _package: packageName,
      _codegen: nodeDef.codegen,
      _properties: nodeDef.properties,
    } as NodeTypeDefinition & { _package?: string; _codegen?: unknown; _properties?: unknown };
  }
  
  /**
   * Преобразовать определение порта
   */
  private static convertPort(
    portDef: PortDefinition,
    direction: PortDirection
  ): NodeTypeDefinition['inputs'][0] {
    return {
      id: portDef.id,
      name: portDef.name,
      dataType: portDef.dataType as PortDataType,
      direction,
      typeName: portDef.typeName,
      defaultValue: portDef.defaultValue ?? undefined,
      hidden: portDef.hidden,
    };
  }
}

// ============================================
// PackageRegistry
// ============================================

/** События реестра */
export type RegistryEventType = 'package-loaded' | 'package-unloaded' | 'nodes-changed';

export interface RegistryEvent {
  type: RegistryEventType;
  packageName?: string;
}

type RegistryListener = (event: RegistryEvent) => void;

/**
 * PackageRegistry — реестр пакетов и узлов
 * 
 * Хранит загруженные пакеты и предоставляет:
 * - Поиск узлов по типу
 * - Получение всех узлов по категориям
 * - События изменения
 */
export class PackageRegistry {
  private packages: Map<string, LoadedPackage> = new Map();
  private nodeIndex: Map<string, { packageName: string; definition: NodeTypeDefinition }> = new Map();
  private listeners: Set<RegistryListener> = new Set();
  
  /**
   * Загрузить и зарегистрировать пакет
   */
  loadPackage(jsonData: unknown): PackageLoadResult {
    const result = PackageLoader.load(jsonData);
    
    if (result.success && result.package) {
      this.registerPackage(result.package);
    }
    
    return result;
  }
  
  /**
   * Зарегистрировать загруженный пакет
   */
  registerPackage(pkg: LoadedPackage): void {
    const { manifest, nodeDefinitions } = pkg;
    
    // Удалить старую версию, если есть
    if (this.packages.has(manifest.name)) {
      this.unloadPackage(manifest.name);
    }
    
    // Добавить пакет
    this.packages.set(manifest.name, pkg);
    
    // Индексировать узлы
    for (const [type, def] of nodeDefinitions) {
      this.nodeIndex.set(type, { packageName: manifest.name, definition: def });
    }
    
    this.emit({ type: 'package-loaded', packageName: manifest.name });
    this.emit({ type: 'nodes-changed' });
  }
  
  /**
   * Выгрузить пакет
   */
  unloadPackage(packageName: string): boolean {
    const pkg = this.packages.get(packageName);
    if (!pkg) return false;
    
    // Удалить узлы из индекса
    for (const [type] of pkg.nodeDefinitions) {
      this.nodeIndex.delete(type);
    }
    
    this.packages.delete(packageName);
    
    this.emit({ type: 'package-unloaded', packageName });
    this.emit({ type: 'nodes-changed' });
    
    return true;
  }
  
  /**
   * Получить определение узла по типу
   */
  getNodeDefinition(type: string): NodeTypeDefinition | undefined {
    return this.nodeIndex.get(type)?.definition;
  }
  
  /**
   * Проверить, существует ли узел
   */
  hasNode(type: string): boolean {
    return this.nodeIndex.has(type);
  }
  
  /**
   * Получить все определения узлов
   */
  getAllNodeDefinitions(): Map<string, NodeTypeDefinition> {
    const result = new Map<string, NodeTypeDefinition>();
    for (const [type, entry] of this.nodeIndex) {
      result.set(type, entry.definition);
    }
    return result;
  }
  
  /**
   * Получить узлы по категории
   */
  getNodesByCategory(category: string): NodeTypeDefinition[] {
    const result: NodeTypeDefinition[] = [];
    for (const entry of this.nodeIndex.values()) {
      if (entry.definition.category === category) {
        result.push(entry.definition);
      }
    }
    return result;
  }
  
  /**
   * Получить все категории (включая пользовательские)
   */
  getAllCategories(): PackageCategory[] {
    const categories: PackageCategory[] = [];
    
    // Стандартные категории
    const standardCategories = [
      { id: 'flow', label: 'Flow Control', labelRu: 'Управление потоком' },
      { id: 'function', label: 'Functions', labelRu: 'Функции' },
      { id: 'variable', label: 'Variables', labelRu: 'Переменные' },
      { id: 'math', label: 'Math', labelRu: 'Математика' },
      { id: 'comparison', label: 'Comparison', labelRu: 'Сравнение' },
      { id: 'logic', label: 'Logic', labelRu: 'Логика' },
      { id: 'io', label: 'Input/Output', labelRu: 'Ввод/Вывод' },
      { id: 'other', label: 'Other', labelRu: 'Прочее' },
    ];
    
    for (const cat of standardCategories) {
      categories.push({ ...cat, packageName: 'builtin' });
    }
    
    // Категории из пакетов
    for (const pkg of this.packages.values()) {
      categories.push(...pkg.categories);
    }
    
    return categories;
  }
  
  /**
   * Получить информацию о пакете
   */
  getPackage(name: string): LoadedPackage | undefined {
    return this.packages.get(name);
  }
  
  /**
   * Получить список всех пакетов
   */
  getPackageList(): { name: string; version: string; displayName: string; nodeCount: number }[] {
    const result: { name: string; version: string; displayName: string; nodeCount: number }[] = [];
    
    for (const pkg of this.packages.values()) {
      result.push({
        name: pkg.manifest.name,
        version: pkg.manifest.version,
        displayName: pkg.manifest.displayName,
        nodeCount: pkg.nodeDefinitions.size,
      });
    }
    
    return result;
  }
  
  /**
   * Подписаться на события
   */
  subscribe(listener: RegistryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  
  /**
   * Отправить событие
   */
  private emit(event: RegistryEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Registry listener error:', err);
      }
    }
  }
  
  /**
   * Очистить реестр
   */
  clear(): void {
    this.packages.clear();
    this.nodeIndex.clear();
    this.emit({ type: 'nodes-changed' });
  }
}

// ============================================
// Глобальный экземпляр реестра
// ============================================

/** Глобальный реестр пакетов */
export const globalRegistry = new PackageRegistry();

// ============================================
// Хелперы
// ============================================

/**
 * Преобразовать NodeTypeDefinition из реестра обратно в Record
 * для совместимости с существующим кодом
 */
export function registryToNodeTypeDefinitions(
  registry: PackageRegistry
): Record<string, NodeTypeDefinition> {
  const result: Record<string, NodeTypeDefinition> = {};
  for (const [type, def] of registry.getAllNodeDefinitions()) {
    result[type] = def;
  }
  return result;
}
