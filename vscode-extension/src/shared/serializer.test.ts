/**
 * Тесты для serializer.ts — сериализация/десериализация графа
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  serializeGraphState,
  parseSerializedGraph,
  deserializeGraphState,
  SerializedGraph,
} from './serializer';
import type { GraphState } from './graphState';

// ============================================
// Тестовые данные
// ============================================

const createValidGraphState = (): GraphState => ({
  id: 'graph-1',
  name: 'Test Graph',
  language: 'cpp',
  displayLanguage: 'ru',
  nodes: [
    {
      id: 'node-1',
      label: 'Print',
      type: 'Function',
      position: { x: 100, y: 100 },
    },
  ],
  edges: [],
  updatedAt: '2025-01-15T12:00:00.000Z',
});

const createComplexGraphState = (): GraphState => ({
  id: 'graph-2',
  name: 'Complex Graph',
  language: 'rust',
  displayLanguage: 'en',
  nodes: [
    {
      id: 'node-1',
      label: 'Start',
      type: 'Start',
      position: { x: 0, y: 0 },
    },
    {
      id: 'node-2',
      label: 'Process',
      type: 'Function',
      position: { x: 200, y: 0 },
    },
    {
      id: 'node-3',
      label: 'End',
      type: 'End',
      position: { x: 400, y: 0 },
    },
  ],
  edges: [
    {
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
      kind: 'execution',
    },
    {
      id: 'edge-2',
      source: 'node-2',
      target: 'node-3',
      kind: 'execution',
    },
  ],
  updatedAt: '2025-01-15T14:00:00.000Z',
  dirty: false,
});

// ============================================
// Тесты
// ============================================

describe('serializer', () => {
  describe('serializeGraphState', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-15T12:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('должен сериализовать простой граф', () => {
      const state = createValidGraphState();
      const result = serializeGraphState(state);

      expect(result.version).toBe(1);
      expect(result.data).toEqual(state);
      expect(result.savedAt).toBe('2025-01-15T12:00:00.000Z');
    });

    it('должен сериализовать сложный граф с узлами и связями', () => {
      const state = createComplexGraphState();
      const result = serializeGraphState(state);

      expect(result.version).toBe(1);
      expect(result.data.nodes).toHaveLength(3);
      expect(result.data.edges).toHaveLength(2);
      expect(result.data.language).toBe('rust');
    });

    it('должен сериализовать пустой граф', () => {
      const emptyState: GraphState = {
        id: 'empty-graph',
        name: 'Empty',
        language: 'cpp',
        displayLanguage: 'ru',
        nodes: [],
        edges: [],
        updatedAt: '2025-01-15T12:00:00.000Z',
      };

      const result = serializeGraphState(emptyState);

      expect(result.version).toBe(1);
      expect(result.data.nodes).toHaveLength(0);
      expect(result.data.edges).toHaveLength(0);
    });

    it('должен сохранять все поля GraphState', () => {
      const state = createComplexGraphState();
      const result = serializeGraphState(state);

      expect(result.data.id).toBe('graph-2');
      expect(result.data.name).toBe('Complex Graph');
      expect(result.data.language).toBe('rust');
      expect(result.data.displayLanguage).toBe('en');
      expect(result.data.dirty).toBe(false);
    });
  });

  describe('parseSerializedGraph', () => {
    it('должен парсить валидный сериализованный граф', () => {
      const serialized: SerializedGraph = {
        version: 1,
        savedAt: '2025-01-15T12:00:00.000Z',
        data: createValidGraphState(),
      };

      const result = parseSerializedGraph(serialized);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.version).toBe(1);
        expect(result.data.data.nodes).toHaveLength(1);
      }
    });

    it('должен отклонять данные без version', () => {
      const invalid = {
        savedAt: '2025-01-15T12:00:00.000Z',
        data: createValidGraphState(),
      };

      const result = parseSerializedGraph(invalid);
      expect(result.success).toBe(false);
    });

    it('должен отклонять данные без savedAt', () => {
      const invalid = {
        version: 1,
        data: createValidGraphState(),
      };

      const result = parseSerializedGraph(invalid);
      expect(result.success).toBe(false);
    });

    it('должен отклонять данные без data', () => {
      const invalid = {
        version: 1,
        savedAt: '2025-01-15T12:00:00.000Z',
      };

      const result = parseSerializedGraph(invalid);
      expect(result.success).toBe(false);
    });

    it('должен отклонять null', () => {
      const result = parseSerializedGraph(null);
      expect(result.success).toBe(false);
    });

    it('должен отклонять undefined', () => {
      const result = parseSerializedGraph(undefined);
      expect(result.success).toBe(false);
    });

    it('должен отклонять строку', () => {
      const result = parseSerializedGraph('not an object');
      expect(result.success).toBe(false);
    });

    it('должен отклонять невалидную структуру data', () => {
      const invalid = {
        version: 1,
        savedAt: '2025-01-15T12:00:00.000Z',
        data: { invalid: 'structure' },
      };

      const result = parseSerializedGraph(invalid);
      expect(result.success).toBe(false);
    });

    it('должен отклонять граф без обязательных полей', () => {
      const invalid = {
        version: 1,
        savedAt: '2025-01-15T12:00:00.000Z',
        data: {
          nodes: [],
          edges: [],
          // Отсутствуют id, name, language, displayLanguage, updatedAt
        },
      };

      const result = parseSerializedGraph(invalid);
      expect(result.success).toBe(false);
    });

    it('должен отклонять граф с невалидным language', () => {
      const invalid = {
        version: 1,
        savedAt: '2025-01-15T12:00:00.000Z',
        data: {
          ...createValidGraphState(),
          language: 'python', // Невалидный язык
        },
      };

      const result = parseSerializedGraph(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('deserializeGraphState', () => {
    it('должен десериализовать валидный граф', () => {
      const serialized: SerializedGraph = {
        version: 1,
        savedAt: '2025-01-15T12:00:00.000Z',
        data: createValidGraphState(),
      };

      const result = deserializeGraphState(serialized);

      expect(result.nodes).toHaveLength(1);
      expect(result.edges).toHaveLength(0);
      expect(result.id).toBe('graph-1');
    });

    it('должен десериализовать сложный граф', () => {
      const originalState = createComplexGraphState();
      const serialized: SerializedGraph = {
        version: 1,
        savedAt: '2025-01-15T12:00:00.000Z',
        data: originalState,
      };

      const result = deserializeGraphState(serialized);

      expect(result.nodes).toHaveLength(3);
      expect(result.edges).toHaveLength(2);
      expect(result.language).toBe('rust');
    });

    it('должен выбрасывать ошибку при невалидных данных', () => {
      const invalid = { invalid: 'data' };

      expect(() => deserializeGraphState(invalid)).toThrow('Invalid graph format');
    });

    it('должен выбрасывать ошибку при null', () => {
      expect(() => deserializeGraphState(null)).toThrow('Invalid graph format');
    });

    it('должен выбрасывать ошибку при undefined', () => {
      expect(() => deserializeGraphState(undefined)).toThrow('Invalid graph format');
    });

    it('должен сохранять все свойства узлов', () => {
      const state = createComplexGraphState();
      const serialized: SerializedGraph = {
        version: 1,
        savedAt: '2025-01-15T12:00:00.000Z',
        data: state,
      };

      const result = deserializeGraphState(serialized);
      const processNode = result.nodes.find(n => n.label === 'Process');

      expect(processNode).toBeDefined();
      expect(processNode!.id).toBe('node-2');
      expect(processNode!.position).toEqual({ x: 200, y: 0 });
      expect(processNode!.type).toBe('Function');
    });

    it('должен сохранять все свойства связей', () => {
      const state = createComplexGraphState();
      const serialized: SerializedGraph = {
        version: 1,
        savedAt: '2025-01-15T12:00:00.000Z',
        data: state,
      };

      const result = deserializeGraphState(serialized);
      const edge = result.edges[0];

      expect(edge.id).toBe('edge-1');
      expect(edge.source).toBe('node-1');
      expect(edge.target).toBe('node-2');
      expect(edge.kind).toBe('execution');
    });
  });

  describe('круговой тест (roundtrip)', () => {
    it('должен сохранять данные при сериализации и десериализации', () => {
      const originalState = createComplexGraphState();

      const serialized = serializeGraphState(originalState);
      const deserialized = deserializeGraphState(serialized);

      expect(deserialized).toEqual(originalState);
    });

    it('должен работать с русскими символами', () => {
      const state: GraphState = {
        id: 'граф-1',
        name: 'Тестовый граф',
        language: 'cpp',
        displayLanguage: 'ru',
        nodes: [
          {
            id: 'узел-1',
            label: 'Вывод сообщения',
            type: 'Function',
            position: { x: 0, y: 0 },
          },
        ],
        edges: [],
        updatedAt: '2025-01-15T12:00:00.000Z',
      };

      const serialized = serializeGraphState(state);
      const deserialized = deserializeGraphState(serialized);

      expect(deserialized.name).toBe('Тестовый граф');
      expect(deserialized.nodes[0].label).toBe('Вывод сообщения');
    });

    it('должен работать с большим графом', () => {
      const nodes = Array.from({ length: 100 }, (_, i) => ({
        id: `node-${i}`,
        label: `Узел ${i}`,
        type: 'Function' as const,
        position: { x: i * 100, y: i * 50 },
      }));

      const edges = Array.from({ length: 99 }, (_, i) => ({
        id: `edge-${i}`,
        source: `node-${i}`,
        target: `node-${i + 1}`,
        kind: 'execution' as const,
      }));

      const state: GraphState = {
        id: 'big-graph',
        name: 'Big Graph',
        language: 'cpp',
        displayLanguage: 'ru',
        nodes,
        edges,
        updatedAt: '2025-01-15T12:00:00.000Z',
      };

      const serialized = serializeGraphState(state);
      const deserialized = deserializeGraphState(serialized);

      expect(deserialized.nodes).toHaveLength(100);
      expect(deserialized.edges).toHaveLength(99);
    });

    it('должен сохранять dirty флаг', () => {
      const state: GraphState = {
        ...createValidGraphState(),
        dirty: true,
      };

      const serialized = serializeGraphState(state);
      const deserialized = deserializeGraphState(serialized);

      expect(deserialized.dirty).toBe(true);
    });

    it('должен работать со всеми поддерживаемыми языками', () => {
      const languages: GraphState['language'][] = ['cpp', 'rust', 'asm'];

      for (const lang of languages) {
        const state: GraphState = {
          ...createValidGraphState(),
          language: lang,
        };

        const serialized = serializeGraphState(state);
        const deserialized = deserializeGraphState(serialized);

        expect(deserialized.language).toBe(lang);
      }
    });

    it('должен работать со всеми типами узлов', () => {
      const nodeTypes: Array<'Start' | 'Function' | 'End' | 'Variable' | 'Custom'> = [
        'Start',
        'Function',
        'End',
        'Variable',
        'Custom',
      ];

      const nodes = nodeTypes.map((type, i) => ({
        id: `node-${i}`,
        label: type,
        type,
        position: { x: i * 100, y: 0 },
      }));

      const state: GraphState = {
        ...createValidGraphState(),
        nodes,
      };

      const serialized = serializeGraphState(state);
      const deserialized = deserializeGraphState(serialized);

      expect(deserialized.nodes).toHaveLength(5);
      nodeTypes.forEach((type, i) => {
        expect(deserialized.nodes[i].type).toBe(type);
      });
    });
  });
});
