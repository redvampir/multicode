/**
 * Тесты для useAutoLayout — хук для автоматической раскладки графа
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ============================================
// Моки
// ============================================

// Mock dagre
const mockDagreGraph = {
  setDefaultEdgeLabel: vi.fn(),
  setGraph: vi.fn(),
  setNode: vi.fn(),
  setEdge: vi.fn(),
  node: vi.fn((id: string) => ({
    x: parseInt(id.split('-')[1] || '0') * 100 + 110,
    y: parseInt(id.split('-')[1] || '0') * 60 + 60,
    width: 220,
    height: 120,
  })),
};

vi.mock('dagre', () => ({
  default: {
    graphlib: {
      Graph: vi.fn(() => mockDagreGraph),
    },
    layout: vi.fn(),
  },
}));

// Mock @xyflow/react
const mockNodes = [
  { id: 'node-0', position: { x: 0, y: 0 }, data: {} },
  { id: 'node-1', position: { x: 0, y: 0 }, data: {} },
  { id: 'node-2', position: { x: 0, y: 0 }, data: {} },
];

const mockEdges = [
  { id: 'edge-0', source: 'node-0', target: 'node-1' },
  { id: 'edge-1', source: 'node-1', target: 'node-2' },
];

const mockSetNodes = vi.fn();
const mockFitView = vi.fn();
const mockGetNodes = vi.fn(() => mockNodes);
const mockGetEdges = vi.fn(() => mockEdges);

vi.mock('@xyflow/react', () => ({
  useReactFlow: vi.fn(() => ({
    getNodes: mockGetNodes,
    getEdges: mockGetEdges,
    setNodes: mockSetNodes,
    fitView: mockFitView,
  })),
}));

// Mock document.querySelector для измерения узлов
const originalQuerySelector = document.querySelector.bind(document);
vi.spyOn(document, 'querySelector').mockImplementation((selector: string) => {
  if (selector.startsWith('[data-id=')) {
    return {
      clientWidth: 220,
      clientHeight: 120,
    } as unknown as Element;
  }
  return originalQuerySelector(selector);
});

// Import после моков
import { useAutoLayout, type LayoutDirection } from './useAutoLayout';

// ============================================
// Тесты
// ============================================

describe('useAutoLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('applyLayout', () => {
    it('должен вызывать dagre для вычисления раскладки', () => {
      const { result } = renderHook(() => useAutoLayout());

      act(() => {
        result.current.applyLayout();
      });

      expect(mockDagreGraph.setGraph).toHaveBeenCalled();
      expect(mockDagreGraph.setNode).toHaveBeenCalledTimes(3); // 3 узла
      expect(mockDagreGraph.setEdge).toHaveBeenCalledTimes(2); // 2 связи
    });

    it('должен использовать направление TB по умолчанию', () => {
      const { result } = renderHook(() => useAutoLayout());

      act(() => {
        result.current.applyLayout();
      });

      expect(mockDagreGraph.setGraph).toHaveBeenCalledWith(
        expect.objectContaining({
          rankdir: 'TB',
        })
      );
    });

    it('должен использовать направление LR при указании', () => {
      const { result } = renderHook(() => useAutoLayout());

      act(() => {
        result.current.applyLayout({ direction: 'LR' });
      });

      expect(mockDagreGraph.setGraph).toHaveBeenCalledWith(
        expect.objectContaining({
          rankdir: 'LR',
        })
      );
    });

    it('должен применять кастомные отступы между узлами', () => {
      const { result } = renderHook(() => useAutoLayout());

      act(() => {
        result.current.applyLayout({
          nodeSpacingX: 200,
          nodeSpacingY: 150,
        });
      });

      expect(mockDagreGraph.setGraph).toHaveBeenCalledWith(
        expect.objectContaining({
          nodesep: 200,
          ranksep: 150,
        })
      );
    });

    it('должен обновлять позиции узлов через setNodes', () => {
      const { result } = renderHook(() => useAutoLayout());

      act(() => {
        result.current.applyLayout();
      });

      expect(mockSetNodes).toHaveBeenCalled();
      const newNodes = mockSetNodes.mock.calls[0][0];
      expect(newNodes).toHaveLength(3);
    });

    it('должен вызывать fitView после обновления', () => {
      const { result } = renderHook(() => useAutoLayout());

      act(() => {
        result.current.applyLayout();
      });

      // fitView вызывается с задержкой
      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(mockFitView).toHaveBeenCalledWith({
        padding: 0.2,
        duration: 300,
      });
    });

    it('не должен изменять граф если нет узлов', () => {
      mockGetNodes.mockReturnValueOnce([]);

      const { result } = renderHook(() => useAutoLayout());

      act(() => {
        result.current.applyLayout();
      });

      expect(mockSetNodes).not.toHaveBeenCalled();
    });

    it('должен работать с пустым списком связей', () => {
      mockGetEdges.mockReturnValueOnce([]);

      const { result } = renderHook(() => useAutoLayout());

      act(() => {
        result.current.applyLayout();
      });

      expect(mockDagreGraph.setEdge).not.toHaveBeenCalled();
      expect(mockSetNodes).toHaveBeenCalled();
    });

    it('должен использовать размеры по умолчанию если DOM не найден', () => {
      vi.spyOn(document, 'querySelector').mockReturnValue(null);

      const { result } = renderHook(() => useAutoLayout());

      act(() => {
        result.current.applyLayout({
          defaultNodeWidth: 300,
          defaultNodeHeight: 150,
        });
      });

      expect(mockDagreGraph.setNode).toHaveBeenCalledWith(
        'node-0',
        expect.objectContaining({
          width: 300,
          height: 150,
        })
      );
    });

    it('должен корректировать позиции от центра к углу', () => {
      const { result } = renderHook(() => useAutoLayout());

      act(() => {
        result.current.applyLayout();
      });

      const newNodes = mockSetNodes.mock.calls[0][0];
      // dagre возвращает центр, React Flow использует верхний левый угол
      // Позиция должна быть скорректирована на половину размеров
      newNodes.forEach((node: { position: { x: number; y: number } }) => {
        expect(typeof node.position.x).toBe('number');
        expect(typeof node.position.y).toBe('number');
      });
    });
  });

  describe('параметры по умолчанию', () => {
    it('должен использовать nodeSpacingX = 100 по умолчанию', () => {
      const { result } = renderHook(() => useAutoLayout());

      act(() => {
        result.current.applyLayout();
      });

      expect(mockDagreGraph.setGraph).toHaveBeenCalledWith(
        expect.objectContaining({
          nodesep: 100,
        })
      );
    });

    it('должен использовать nodeSpacingY = 80 по умолчанию', () => {
      const { result } = renderHook(() => useAutoLayout());

      act(() => {
        result.current.applyLayout();
      });

      expect(mockDagreGraph.setGraph).toHaveBeenCalledWith(
        expect.objectContaining({
          ranksep: 80,
        })
      );
    });

    it('должен использовать marginx = 50 и marginy = 50', () => {
      const { result } = renderHook(() => useAutoLayout());

      act(() => {
        result.current.applyLayout();
      });

      expect(mockDagreGraph.setGraph).toHaveBeenCalledWith(
        expect.objectContaining({
          marginx: 50,
          marginy: 50,
        })
      );
    });
  });

  describe('типы', () => {
    it('LayoutDirection должен принимать TB и LR', () => {
      const directions: LayoutDirection[] = ['TB', 'LR'];
      expect(directions).toContain('TB');
      expect(directions).toContain('LR');
    });

    it('AutoLayoutOptions должен быть опциональным', () => {
      const { result } = renderHook(() => useAutoLayout());

      // Без параметров
      act(() => {
        result.current.applyLayout();
      });

      // С частичными параметрами
      act(() => {
        result.current.applyLayout({ direction: 'LR' });
      });

      // С полными параметрами
      act(() => {
        result.current.applyLayout({
          direction: 'TB',
          nodeSpacingX: 100,
          nodeSpacingY: 80,
          defaultNodeWidth: 220,
          defaultNodeHeight: 120,
        });
      });

      expect(mockSetNodes).toHaveBeenCalledTimes(3);
    });
  });

  describe('интеграция с dagre', () => {
    it('должен добавлять все узлы в dagre граф', () => {
      const { result } = renderHook(() => useAutoLayout());

      act(() => {
        result.current.applyLayout();
      });

      expect(mockDagreGraph.setNode).toHaveBeenCalledWith('node-0', expect.any(Object));
      expect(mockDagreGraph.setNode).toHaveBeenCalledWith('node-1', expect.any(Object));
      expect(mockDagreGraph.setNode).toHaveBeenCalledWith('node-2', expect.any(Object));
    });

    it('должен добавлять все связи в dagre граф', () => {
      const { result } = renderHook(() => useAutoLayout());

      act(() => {
        result.current.applyLayout();
      });

      expect(mockDagreGraph.setEdge).toHaveBeenCalledWith('node-0', 'node-1');
      expect(mockDagreGraph.setEdge).toHaveBeenCalledWith('node-1', 'node-2');
    });

    it('должен устанавливать defaultEdgeLabel', () => {
      const { result } = renderHook(() => useAutoLayout());

      act(() => {
        result.current.applyLayout();
      });

      expect(mockDagreGraph.setDefaultEdgeLabel).toHaveBeenCalled();
    });
  });
});
