/**
 * Тесты для PackageLoader и PackageRegistry
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PackageLoader, PackageRegistry } from '../shared/packageLoader';
import { validatePackageManifest, safeValidatePackageManifest } from '../shared/packageSchema';

// ============================================
// Тестовые данные
// ============================================

const validMinimalPackage = {
  name: 'test-package',
  version: '1.0.0',
  displayName: 'Test Package',
  nodes: [
    {
      type: 'TestNode',
      label: 'Test Node',
      labelRu: 'Тестовый узел',
      category: 'other',
      inputs: [
        { id: 'exec-in', name: '', dataType: 'execution' }
      ],
      outputs: [
        { id: 'exec-out', name: '', dataType: 'execution' }
      ],
    },
  ],
};

const validFullPackage = {
  '$schema': '../../schemas/multicode-package.schema.json',
  name: '@test/full-package',
  version: '1.2.3',
  displayName: 'Full Test Package',
  displayNameRu: 'Полный тестовый пакет',
  description: 'A comprehensive test package',
  descriptionRu: 'Полный тестовый пакет',
  author: {
    name: 'Test Author',
    email: 'test@example.com',
  },
  license: 'MIT',
  keywords: ['test', 'example'],
  engines: {
    multicode: '>=0.5.0',
  },
  categories: [
    {
      id: 'custom',
      label: 'Custom Category',
      labelRu: 'Пользовательская категория',
      color: '#FF5500',
    },
  ],
  nodes: [
    {
      type: 'PrintMessage',
      label: 'Print Message',
      labelRu: 'Вывод сообщения',
      category: 'io',
      description: 'Prints a message to console',
      descriptionRu: 'Выводит сообщение в консоль',
      headerColor: '#00BCD4',
      inputs: [
        { id: 'exec-in', name: '', dataType: 'execution' },
        { id: 'message', name: 'Message', nameRu: 'Сообщение', dataType: 'string', defaultValue: 'Hello' },
      ],
      outputs: [
        { id: 'exec-out', name: '', dataType: 'execution' },
      ],
      codegen: {
        cpp: {
          template: 'std::cout << {{input.message}} << std::endl;',
          includes: ['<iostream>'],
        },
      },
    },
    {
      type: 'AddNumbers',
      label: 'Add',
      labelRu: 'Сложение',
      category: 'math',
      headerColor: '#4CAF50',
      inputs: [
        { id: 'a', name: 'A', dataType: 'float', defaultValue: 0 },
        { id: 'b', name: 'B', dataType: 'float', defaultValue: 0 },
      ],
      outputs: [
        { id: 'result', name: 'Result', nameRu: 'Результат', dataType: 'float' },
      ],
      codegen: {
        cpp: {
          template: '({{input.a}} + {{input.b}})',
        },
      },
    },
  ],
};

const invalidPackageMissingName = {
  version: '1.0.0',
  displayName: 'Test',
  nodes: [],
};

const invalidPackageBadNodeType = {
  name: 'test-bad',
  version: '1.0.0',
  displayName: 'Test',
  nodes: [
    {
      type: 'badType', // Должен быть PascalCase
      label: 'Bad',
      labelRu: 'Плохой',
      category: 'other',
      inputs: [],
      outputs: [],
    },
  ],
};

const invalidPackageEmptyNodes = {
  name: 'test-empty',
  version: '1.0.0',
  displayName: 'Test',
  nodes: [], // Минимум 1 узел
};

// ============================================
// Тесты Zod-схем
// ============================================

describe('packageSchema', () => {
  describe('validatePackageManifest', () => {
    it('should validate minimal package', () => {
      const result = validatePackageManifest(validMinimalPackage);
      expect(result.name).toBe('test-package');
      expect(result.nodes).toHaveLength(1);
    });

    it('should validate full package', () => {
      const result = validatePackageManifest(validFullPackage);
      expect(result.name).toBe('@test/full-package');
      expect(result.nodes).toHaveLength(2);
      expect(result.categories).toHaveLength(1);
    });

    it('should throw on missing required fields', () => {
      expect(() => validatePackageManifest(invalidPackageMissingName)).toThrow();
    });

    it('should throw on invalid node type format', () => {
      expect(() => validatePackageManifest(invalidPackageBadNodeType)).toThrow();
    });

    it('should throw on empty nodes array', () => {
      expect(() => validatePackageManifest(invalidPackageEmptyNodes)).toThrow();
    });
  });

  describe('safeValidatePackageManifest', () => {
    it('should return success for valid package', () => {
      const result = safeValidatePackageManifest(validMinimalPackage);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should return errors for invalid package', () => {
      const result = safeValidatePackageManifest(invalidPackageMissingName);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });
});

// ============================================
// Тесты PackageLoader
// ============================================

describe('PackageLoader', () => {
  describe('load', () => {
    it('should load valid minimal package', () => {
      const result = PackageLoader.load(validMinimalPackage);
      expect(result.success).toBe(true);
      expect(result.package).toBeDefined();
      expect(result.package?.manifest.name).toBe('test-package');
      expect(result.package?.nodeDefinitions.size).toBe(1);
    });

    it('should load valid full package', () => {
      const result = PackageLoader.load(validFullPackage);
      expect(result.success).toBe(true);
      expect(result.package?.nodeDefinitions.size).toBe(2);
      expect(result.package?.categories).toHaveLength(1);
    });

    it('should convert node definitions correctly', () => {
      const result = PackageLoader.load(validFullPackage);
      expect(result.success).toBe(true);
      
      const printNode = result.package?.nodeDefinitions.get('PrintMessage');
      expect(printNode).toBeDefined();
      expect(printNode?.label).toBe('Print Message');
      expect(printNode?.labelRu).toBe('Вывод сообщения');
      expect(printNode?.category).toBe('io');
      expect(printNode?.inputs).toHaveLength(2);
      expect(printNode?.outputs).toHaveLength(1);
    });

    it('should preserve port definitions', () => {
      const result = PackageLoader.load(validFullPackage);
      const addNode = result.package?.nodeDefinitions.get('AddNumbers');
      
      expect(addNode?.inputs[0].id).toBe('a');
      expect(addNode?.inputs[0].dataType).toBe('float');
      expect(addNode?.inputs[0].defaultValue).toBe(0);
    });

    it('should return errors for invalid package', () => {
      const result = PackageLoader.load(invalidPackageMissingName);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });
  });

  describe('loadFromString', () => {
    it('should parse and load valid JSON string', () => {
      const jsonString = JSON.stringify(validMinimalPackage);
      const result = PackageLoader.loadFromString(jsonString);
      expect(result.success).toBe(true);
    });

    it('should return error for invalid JSON', () => {
      const result = PackageLoader.loadFromString('not valid json');
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });
});

// ============================================
// Тесты PackageRegistry
// ============================================

describe('PackageRegistry', () => {
  let registry: PackageRegistry;

  beforeEach(() => {
    registry = new PackageRegistry();
  });

  describe('loadPackage', () => {
    it('should load and register package', () => {
      const result = registry.loadPackage(validMinimalPackage);
      expect(result.success).toBe(true);
      expect(registry.hasNode('TestNode')).toBe(true);
    });

    it('should return errors for invalid package', () => {
      const result = registry.loadPackage(invalidPackageMissingName);
      expect(result.success).toBe(false);
    });
  });

  describe('getNodeDefinition', () => {
    beforeEach(() => {
      registry.loadPackage(validFullPackage);
    });

    it('should return node definition by type', () => {
      const node = registry.getNodeDefinition('PrintMessage');
      expect(node).toBeDefined();
      expect(node?.label).toBe('Print Message');
    });

    it('should return undefined for unknown type', () => {
      const node = registry.getNodeDefinition('UnknownNode');
      expect(node).toBeUndefined();
    });
  });

  describe('getNodesByCategory', () => {
    beforeEach(() => {
      registry.loadPackage(validFullPackage);
    });

    it('should return nodes by category', () => {
      const ioNodes = registry.getNodesByCategory('io');
      expect(ioNodes).toHaveLength(1);
      expect(ioNodes[0].type).toBe('PrintMessage');

      const mathNodes = registry.getNodesByCategory('math');
      expect(mathNodes).toHaveLength(1);
      expect(mathNodes[0].type).toBe('AddNumbers');
    });

    it('should return empty array for empty category', () => {
      const nodes = registry.getNodesByCategory('logic');
      expect(nodes).toHaveLength(0);
    });
  });

  describe('getAllNodeDefinitions', () => {
    it('should return all loaded nodes', () => {
      registry.loadPackage(validFullPackage);
      const allNodes = registry.getAllNodeDefinitions();
      expect(allNodes.size).toBe(2);
      expect(allNodes.has('PrintMessage')).toBe(true);
      expect(allNodes.has('AddNumbers')).toBe(true);
    });
  });

  describe('unloadPackage', () => {
    beforeEach(() => {
      registry.loadPackage(validFullPackage);
    });

    it('should remove package and its nodes', () => {
      expect(registry.hasNode('PrintMessage')).toBe(true);
      
      const result = registry.unloadPackage('@test/full-package');
      expect(result).toBe(true);
      expect(registry.hasNode('PrintMessage')).toBe(false);
    });

    it('should return false for unknown package', () => {
      const result = registry.unloadPackage('unknown-package');
      expect(result).toBe(false);
    });
  });

  describe('getPackageList', () => {
    it('should return list of loaded packages', () => {
      registry.loadPackage(validMinimalPackage);
      registry.loadPackage(validFullPackage);
      
      const list = registry.getPackageList();
      expect(list).toHaveLength(2);
      expect(list.find(p => p.name === 'test-package')).toBeDefined();
      expect(list.find(p => p.name === '@test/full-package')).toBeDefined();
    });
  });

  describe('subscribe', () => {
    it('should notify on package load', () => {
      const events: string[] = [];
      registry.subscribe(e => events.push(e.type));
      
      registry.loadPackage(validMinimalPackage);
      
      expect(events).toContain('package-loaded');
      expect(events).toContain('nodes-changed');
    });

    it('should notify on package unload', () => {
      registry.loadPackage(validMinimalPackage);
      
      const events: string[] = [];
      registry.subscribe(e => events.push(e.type));
      
      registry.unloadPackage('test-package');
      
      expect(events).toContain('package-unloaded');
      expect(events).toContain('nodes-changed');
    });

    it('should allow unsubscribe', () => {
      const events: string[] = [];
      const unsubscribe = registry.subscribe(e => events.push(e.type));
      
      unsubscribe();
      registry.loadPackage(validMinimalPackage);
      
      expect(events).toHaveLength(0);
    });
  });

  describe('getAllCategories', () => {
    it('should include standard categories', () => {
      const categories = registry.getAllCategories();
      const ids = categories.map(c => c.id);
      
      expect(ids).toContain('flow');
      expect(ids).toContain('math');
      expect(ids).toContain('io');
    });

    it('should include custom categories from packages', () => {
      registry.loadPackage(validFullPackage);
      const categories = registry.getAllCategories();
      
      const customCat = categories.find(c => c.id === 'custom');
      expect(customCat).toBeDefined();
      expect(customCat?.labelRu).toBe('Пользовательская категория');
    });
  });

  describe('clear', () => {
    it('should remove all packages and nodes', () => {
      registry.loadPackage(validMinimalPackage);
      registry.loadPackage(validFullPackage);
      
      expect(registry.getAllNodeDefinitions().size).toBe(3);
      
      registry.clear();
      
      expect(registry.getAllNodeDefinitions().size).toBe(0);
      expect(registry.getPackageList()).toHaveLength(0);
    });
  });
});
