/**
 * Тесты для useClipboard — хук для Copy/Paste узлов графа
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useClipboard, ClipboardData } from './useClipboard';
import type { BlueprintNode, BlueprintEdge } from '../../shared/blueprintTypes';

// Mock navigator.clipboard
const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
  readText: vi.fn().mockResolvedValue(''),
};

Object.defineProperty(navigator, 'clipboard', {
  value: mockClipboard,
  writable: true,
});

// ============================================
// Тестовые данные
// ============================================

function createTestNode(id: string, x: number, y: number): BlueprintNode {
  return {
    id,
    type: 'Print',
    label: `Node ${id}`,
    position: { x, y },
    inputs: [],
    outputs: [],
  };
}

function createTestEdge(id: string, sourceNode: string, targetNode: string): BlueprintEdge {
  return {
    id,
    sourceNode,
    sourcePort: 'output',
    targetNode,
    targetPort: 'input',
    kind: 'data',
  };
}

// ============================================
// Тесты
// ============================================

describe('useClipboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('copy', () => {
    it('должен копировать выделенные узлы', () => {
      const { result } = renderHook(() => useClipboard());
      
      const nodes = [
        createTestNode('node-1', 100, 100),
        createTestNode('node-2', 200, 200),
        createTestNode('node-3', 300, 300),
      ];
      const edges: BlueprintEdge[] = [];

      act(() => {
        result.current.copy(['node-1', 'node-2'], nodes, edges);
      });

      expect(result.current.hasData()).toBe(true);
    });

    it('должен не копировать при пустом выделении', () => {
      const { result } = renderHook(() => useClipboard());
      
      const nodes = [createTestNode('node-1', 100, 100)];
      const edges: BlueprintEdge[] = [];

      act(() => {
        result.current.copy([], nodes, edges);
      });

      expect(result.current.hasData()).toBe(false);
    });

    it('должен копировать только связи между выделенными узлами', () => {
      const { result } = renderHook(() => useClipboard());
      
      const nodes = [
        createTestNode('node-1', 100, 100),
        createTestNode('node-2', 200, 200),
        createTestNode('node-3', 300, 300),
      ];
      const edges = [
        createTestEdge('edge-1', 'node-1', 'node-2'), // Между выделенными
        createTestEdge('edge-2', 'node-2', 'node-3'), // К невыделенному
      ];

      act(() => {
        result.current.copy(['node-1', 'node-2'], nodes, edges);
      });

      // Вставляем и проверяем количество связей
      let pastedData: { nodes: BlueprintNode[]; edges: BlueprintEdge[] } | null = null;
      act(() => {
        pastedData = result.current.paste();
      });

      expect(pastedData).not.toBeNull();
      expect(pastedData!.nodes).toHaveLength(2);
      expect(pastedData!.edges).toHaveLength(1); // Только edge-1
    });

    it('должен пытаться записать в системный буфер обмена', () => {
      const { result } = renderHook(() => useClipboard());
      
      const nodes = [createTestNode('node-1', 100, 100)];
      const edges: BlueprintEdge[] = [];

      act(() => {
        result.current.copy(['node-1'], nodes, edges);
      });

      expect(mockClipboard.writeText).toHaveBeenCalled();
    });

    it('должен работать при ошибке системного буфера', () => {
      mockClipboard.writeText.mockRejectedValueOnce(new Error('Clipboard error'));
      
      const { result } = renderHook(() => useClipboard());
      
      const nodes = [createTestNode('node-1', 100, 100)];
      const edges: BlueprintEdge[] = [];

      // Не должен выбрасывать ошибку
      act(() => {
        result.current.copy(['node-1'], nodes, edges);
      });

      expect(result.current.hasData()).toBe(true);
    });
  });

  describe('cut', () => {
    it('должен вырезать узлы и возвращать данные для удаления', () => {
      const { result } = renderHook(() => useClipboard());
      
      const nodes = [
        createTestNode('node-1', 100, 100),
        createTestNode('node-2', 200, 200),
      ];
      const edges: BlueprintEdge[] = [];

      let cutData: ClipboardData | null = null;
      act(() => {
        cutData = result.current.cut(['node-1'], nodes, edges);
      });

      expect(cutData).not.toBeNull();
      expect(cutData!.nodes).toHaveLength(1);
      expect(cutData!.nodes[0].id).toBe('node-1');
      expect(result.current.hasData()).toBe(true);
    });

    it('должен возвращать null при пустом выделении', () => {
      const { result } = renderHook(() => useClipboard());
      
      const nodes = [createTestNode('node-1', 100, 100)];
      const edges: BlueprintEdge[] = [];

      let cutData: ClipboardData | null = null;
      act(() => {
        cutData = result.current.cut([], nodes, edges);
      });

      expect(cutData).toBeNull();
    });

    it('должен включать связи между вырезанными узлами', () => {
      const { result } = renderHook(() => useClipboard());
      
      const nodes = [
        createTestNode('node-1', 100, 100),
        createTestNode('node-2', 200, 200),
      ];
      const edges = [createTestEdge('edge-1', 'node-1', 'node-2')];

      let cutData: ClipboardData | null = null;
      act(() => {
        cutData = result.current.cut(['node-1', 'node-2'], nodes, edges);
      });

      expect(cutData).not.toBeNull();
      expect(cutData!.edges).toHaveLength(1);
    });
  });

  describe('paste', () => {
    it('должен вставлять узлы с новыми ID', () => {
      const { result } = renderHook(() => useClipboard());
      
      const nodes = [createTestNode('node-1', 100, 100)];
      const edges: BlueprintEdge[] = [];

      act(() => {
        result.current.copy(['node-1'], nodes, edges);
      });

      let pastedData: { nodes: BlueprintNode[]; edges: BlueprintEdge[] } | null = null;
      act(() => {
        pastedData = result.current.paste();
      });

      expect(pastedData).not.toBeNull();
      expect(pastedData!.nodes).toHaveLength(1);
      expect(pastedData!.nodes[0].id).not.toBe('node-1'); // Новый ID
    });

    it('должен смещать позицию при вставке', () => {
      const { result } = renderHook(() => useClipboard());
      
      const originalX = 100;
      const originalY = 100;
      const nodes = [createTestNode('node-1', originalX, originalY)];
      const edges: BlueprintEdge[] = [];

      act(() => {
        result.current.copy(['node-1'], nodes, edges);
      });

      let pastedData: { nodes: BlueprintNode[]; edges: BlueprintEdge[] } | null = null;
      act(() => {
        pastedData = result.current.paste();
      });

      expect(pastedData!.nodes[0].position.x).toBeGreaterThan(originalX);
      expect(pastedData!.nodes[0].position.y).toBeGreaterThan(originalY);
    });

    it('должен увеличивать смещение при повторных вставках', () => {
      const { result } = renderHook(() => useClipboard());
      
      const nodes = [createTestNode('node-1', 100, 100)];
      const edges: BlueprintEdge[] = [];

      act(() => {
        result.current.copy(['node-1'], nodes, edges);
      });

      let paste1: { nodes: BlueprintNode[]; edges: BlueprintEdge[] } | null = null;
      let paste2: { nodes: BlueprintNode[]; edges: BlueprintEdge[] } | null = null;
      
      act(() => {
        paste1 = result.current.paste();
        paste2 = result.current.paste();
      });

      // Вторая вставка должна быть ещё дальше
      expect(paste2!.nodes[0].position.x).toBeGreaterThan(paste1!.nodes[0].position.x);
      expect(paste2!.nodes[0].position.y).toBeGreaterThan(paste1!.nodes[0].position.y);
    });

    it('должен использовать кастомное смещение', () => {
      const { result } = renderHook(() => useClipboard());
      
      const nodes = [createTestNode('node-1', 100, 100)];
      const edges: BlueprintEdge[] = [];

      act(() => {
        result.current.copy(['node-1'], nodes, edges);
      });

      let pastedData: { nodes: BlueprintNode[]; edges: BlueprintEdge[] } | null = null;
      act(() => {
        pastedData = result.current.paste({ x: 200, y: 300 });
      });

      expect(pastedData!.nodes[0].position.x).toBe(300); // 100 + 200
      expect(pastedData!.nodes[0].position.y).toBe(400); // 100 + 300
    });

    it('должен возвращать null при пустом буфере', () => {
      const { result } = renderHook(() => useClipboard());

      let pastedData: { nodes: BlueprintNode[]; edges: BlueprintEdge[] } | null = null;
      act(() => {
        pastedData = result.current.paste();
      });

      expect(pastedData).toBeNull();
    });

    it('должен обновлять ID связей для новых узлов', () => {
      const { result } = renderHook(() => useClipboard());
      
      const nodes = [
        createTestNode('node-1', 100, 100),
        createTestNode('node-2', 200, 200),
      ];
      const edges = [createTestEdge('edge-1', 'node-1', 'node-2')];

      act(() => {
        result.current.copy(['node-1', 'node-2'], nodes, edges);
      });

      let pastedData: { nodes: BlueprintNode[]; edges: BlueprintEdge[] } | null = null;
      act(() => {
        pastedData = result.current.paste();
      });

      const newNodeIds = pastedData!.nodes.map(n => n.id);
      const pastedEdge = pastedData!.edges[0];

      // Связь должна указывать на новые ID
      expect(newNodeIds).toContain(pastedEdge.sourceNode);
      expect(newNodeIds).toContain(pastedEdge.targetNode);
      expect(pastedEdge.sourceNode).not.toBe('node-1');
      expect(pastedEdge.targetNode).not.toBe('node-2');
    });

    it('должен генерировать новые ID для связей', () => {
      const { result } = renderHook(() => useClipboard());
      
      const nodes = [
        createTestNode('node-1', 100, 100),
        createTestNode('node-2', 200, 200),
      ];
      const edges = [createTestEdge('edge-1', 'node-1', 'node-2')];

      act(() => {
        result.current.copy(['node-1', 'node-2'], nodes, edges);
      });

      let pastedData: { nodes: BlueprintNode[]; edges: BlueprintEdge[] } | null = null;
      act(() => {
        pastedData = result.current.paste();
      });

      expect(pastedData!.edges[0].id).not.toBe('edge-1');
    });
  });

  describe('hasData', () => {
    it('должен возвращать false при пустом буфере', () => {
      const { result } = renderHook(() => useClipboard());
      expect(result.current.hasData()).toBe(false);
    });

    it('должен возвращать true после копирования', () => {
      const { result } = renderHook(() => useClipboard());
      
      const nodes = [createTestNode('node-1', 100, 100)];
      const edges: BlueprintEdge[] = [];

      act(() => {
        result.current.copy(['node-1'], nodes, edges);
      });

      expect(result.current.hasData()).toBe(true);
    });

    it('должен возвращать false после очистки', () => {
      const { result } = renderHook(() => useClipboard());
      
      const nodes = [createTestNode('node-1', 100, 100)];
      const edges: BlueprintEdge[] = [];

      act(() => {
        result.current.copy(['node-1'], nodes, edges);
        result.current.clear();
      });

      expect(result.current.hasData()).toBe(false);
    });
  });

  describe('clear', () => {
    it('должен очищать буфер', () => {
      const { result } = renderHook(() => useClipboard());
      
      const nodes = [createTestNode('node-1', 100, 100)];
      const edges: BlueprintEdge[] = [];

      act(() => {
        result.current.copy(['node-1'], nodes, edges);
      });

      expect(result.current.hasData()).toBe(true);

      act(() => {
        result.current.clear();
      });

      expect(result.current.hasData()).toBe(false);
    });

    it('должен сбрасывать счётчик вставок', () => {
      const { result } = renderHook(() => useClipboard());
      
      const nodes = [createTestNode('node-1', 100, 100)];
      const edges: BlueprintEdge[] = [];

      act(() => {
        result.current.copy(['node-1'], nodes, edges);
        result.current.paste();
        result.current.paste();
        result.current.clear();
      });

      // После clear и нового copy счётчик должен сброситься
      act(() => {
        result.current.copy(['node-1'], nodes, edges);
      });

      let pastedData: { nodes: BlueprintNode[]; edges: BlueprintEdge[] } | null = null;
      act(() => {
        pastedData = result.current.paste();
      });

      // Смещение должно быть как при первой вставке (50, 50)
      expect(pastedData!.nodes[0].position.x).toBe(150); // 100 + 50
      expect(pastedData!.nodes[0].position.y).toBe(150); // 100 + 50
    });
  });

  describe('глубокое клонирование', () => {
    it('должен клонировать данные узлов без мутации оригинала', () => {
      const { result } = renderHook(() => useClipboard());
      
      const originalNode = createTestNode('node-1', 100, 100);
      originalNode.label = 'Original';
      
      const nodes = [originalNode];
      const edges: BlueprintEdge[] = [];

      act(() => {
        result.current.copy(['node-1'], nodes, edges);
      });

      let pastedData: { nodes: BlueprintNode[]; edges: BlueprintEdge[] } | null = null;
      act(() => {
        pastedData = result.current.paste();
      });

      // Изменяем вставленный узел
      pastedData!.nodes[0].label = 'Modified';

      // Оригинал не должен измениться
      expect(originalNode.label).toBe('Original');
    });
  });

  describe('множественные узлы', () => {
    it('должен копировать и вставлять несколько узлов', () => {
      const { result } = renderHook(() => useClipboard());
      
      const nodes = [
        createTestNode('node-1', 100, 100),
        createTestNode('node-2', 200, 200),
        createTestNode('node-3', 300, 300),
      ];
      const edges = [
        createTestEdge('edge-1', 'node-1', 'node-2'),
        createTestEdge('edge-2', 'node-2', 'node-3'),
      ];

      act(() => {
        result.current.copy(['node-1', 'node-2', 'node-3'], nodes, edges);
      });

      let pastedData: { nodes: BlueprintNode[]; edges: BlueprintEdge[] } | null = null;
      act(() => {
        pastedData = result.current.paste();
      });

      expect(pastedData!.nodes).toHaveLength(3);
      expect(pastedData!.edges).toHaveLength(2);
    });

    it('должен сохранять относительные позиции узлов', () => {
      const { result } = renderHook(() => useClipboard());
      
      const nodes = [
        createTestNode('node-1', 100, 100),
        createTestNode('node-2', 200, 200),
      ];
      const edges: BlueprintEdge[] = [];

      act(() => {
        result.current.copy(['node-1', 'node-2'], nodes, edges);
      });

      let pastedData: { nodes: BlueprintNode[]; edges: BlueprintEdge[] } | null = null;
      act(() => {
        pastedData = result.current.paste();
      });

      // Разница между узлами должна сохраниться
      const dx = pastedData!.nodes[1].position.x - pastedData!.nodes[0].position.x;
      const dy = pastedData!.nodes[1].position.y - pastedData!.nodes[0].position.y;

      expect(dx).toBe(100); // 200 - 100
      expect(dy).toBe(100); // 200 - 100
    });
  });
});
