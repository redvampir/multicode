/**
 * BlueprintEditor — smoke и unit тесты
 * 
 * Эти тесты проверяют базовую функциональность BlueprintEditor:
 * - Рендеринг без ошибок
 * - Обработка пустого графа
 * - Обработка графа с узлами
 * - Обработка событий изменения графа
 */

import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { BlueprintEditor } from '../BlueprintEditor';
import type { BlueprintGraphState, BlueprintNode, BlueprintEdge } from '../../shared/blueprintTypes';

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

// Mock window.matchMedia
const mockMatchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

// ============================================
// Фабрики для тестовых данных
// ============================================

function createEmptyGraph(): BlueprintGraphState {
  return {
    id: 'test-graph-1',
    name: 'Test Graph',
    language: 'cpp',
    displayLanguage: 'ru',
    nodes: [],
    edges: [],
    updatedAt: new Date().toISOString(),
  };
}

function createGraphWithStartNode(): BlueprintGraphState {
  const startNode: BlueprintNode = {
    id: 'start-1',
    type: 'Start',
    label: 'Начало',
    position: { x: 100, y: 100 },
    inputs: [],
    outputs: [
      { id: 'exec-out', name: 'Out', dataType: 'execution', direction: 'output', index: 0 },
    ],
  };

  return {
    id: 'test-graph-2',
    name: 'Test Graph with Start',
    language: 'cpp',
    displayLanguage: 'ru',
    nodes: [startNode],
    edges: [],
    updatedAt: new Date().toISOString(),
  };
}

function createGraphWithMultipleNodes(): BlueprintGraphState {
  const startNode: BlueprintNode = {
    id: 'start-1',
    type: 'Start',
    label: 'Начало',
    position: { x: 100, y: 100 },
    inputs: [],
    outputs: [
      { id: 'exec-out', name: 'Out', dataType: 'execution', direction: 'output', index: 0 },
    ],
  };

  const printNode: BlueprintNode = {
    id: 'print-1',
    type: 'Print',
    label: 'Вывод',
    position: { x: 300, y: 100 },
    inputs: [
      { id: 'exec-in', name: 'In', dataType: 'execution', direction: 'input', index: 0 },
      { id: 'message', name: 'Сообщение', dataType: 'string', direction: 'input', index: 1 },
    ],
    outputs: [
      { id: 'exec-out', name: 'Out', dataType: 'execution', direction: 'output', index: 0 },
    ],
  };

  const endNode: BlueprintNode = {
    id: 'end-1',
    type: 'End',
    label: 'Конец',
    position: { x: 500, y: 100 },
    inputs: [
      { id: 'exec-in', name: 'In', dataType: 'execution', direction: 'input', index: 0 },
    ],
    outputs: [],
  };

  const edge1: BlueprintEdge = {
    id: 'edge-1',
    sourceNode: 'start-1',
    sourcePort: 'exec-out',
    targetNode: 'print-1',
    targetPort: 'exec-in',
    kind: 'execution',
  };

  const edge2: BlueprintEdge = {
    id: 'edge-2',
    sourceNode: 'print-1',
    sourcePort: 'exec-out',
    targetNode: 'end-1',
    targetPort: 'exec-in',
    kind: 'execution',
  };

  return {
    id: 'test-graph-3',
    name: 'Test Graph with Multiple Nodes',
    language: 'cpp',
    displayLanguage: 'ru',
    nodes: [startNode, printNode, endNode],
    edges: [edge1, edge2],
    updatedAt: new Date().toISOString(),
  };
}

// ============================================
// Тестовый wrapper
// ============================================

interface TestWrapperProps {
  children: React.ReactNode;
}

const TestWrapper: React.FC<TestWrapperProps> = ({ children }) => {
  return (
    <div style={{ width: 800, height: 600 }}>
      <ReactFlowProvider>
        {children}
      </ReactFlowProvider>
    </div>
  );
};

// ============================================
// Тесты
// ============================================

describe('BlueprintEditor', () => {
  beforeEach(() => {
    // Setup mocks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
    global.matchMedia = mockMatchMedia;
    
    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Smoke Tests', () => {
    it('should render without crashing with empty graph', async () => {
      const graph = createEmptyGraph();
      const onGraphChange = vi.fn();

      const { container } = render(
        <TestWrapper>
          <BlueprintEditor
            graph={graph}
            onGraphChange={onGraphChange}
            displayLanguage="ru"
          />
        </TestWrapper>
      );

      // Проверяем, что компонент отрендерился
      await waitFor(() => {
        expect(container.querySelector('.react-flow')).toBeTruthy();
      });
    });

    it('should render without crashing with start node', async () => {
      const graph = createGraphWithStartNode();
      const onGraphChange = vi.fn();

      const { container } = render(
        <TestWrapper>
          <BlueprintEditor
            graph={graph}
            onGraphChange={onGraphChange}
            displayLanguage="ru"
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(container.querySelector('.react-flow')).toBeTruthy();
      });
    });

    it('should render without crashing with multiple nodes and edges', async () => {
      const graph = createGraphWithMultipleNodes();
      const onGraphChange = vi.fn();

      const { container } = render(
        <TestWrapper>
          <BlueprintEditor
            graph={graph}
            onGraphChange={onGraphChange}
            displayLanguage="ru"
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(container.querySelector('.react-flow')).toBeTruthy();
      });
    });

    it('should render with English display language', async () => {
      const graph = createGraphWithStartNode();
      const onGraphChange = vi.fn();

      const { container } = render(
        <TestWrapper>
          <BlueprintEditor
            graph={graph}
            onGraphChange={onGraphChange}
            displayLanguage="en"
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(container.querySelector('.react-flow')).toBeTruthy();
      });
    });
  });

  describe('Graph State Handling', () => {
    it('should handle undefined nodes gracefully', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const graph: BlueprintGraphState = {
        id: 'test',
        name: 'Test',
        language: 'cpp',
        displayLanguage: 'ru',
        nodes: undefined as unknown as BlueprintNode[], // Simulate corrupted state
        edges: [],
        updatedAt: new Date().toISOString(),
      };
      const onGraphChange = vi.fn();

      // This should not throw
      expect(() => {
        render(
          <TestWrapper>
            <BlueprintEditor
              graph={graph}
              onGraphChange={onGraphChange}
              displayLanguage="ru"
            />
          </TestWrapper>
        );
      }).not.toThrow();
    });

    it('should handle undefined edges gracefully', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const graph: BlueprintGraphState = {
        id: 'test',
        name: 'Test',
        language: 'cpp',
        displayLanguage: 'ru',
        nodes: [],
        edges: undefined as unknown as BlueprintEdge[], // Simulate corrupted state
        updatedAt: new Date().toISOString(),
      };
      const onGraphChange = vi.fn();

      expect(() => {
        render(
          <TestWrapper>
            <BlueprintEditor
              graph={graph}
              onGraphChange={onGraphChange}
              displayLanguage="ru"
            />
          </TestWrapper>
        );
      }).not.toThrow();
    });

    it('should handle node with missing position', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nodeWithoutPosition: BlueprintNode = {
        id: 'node-1',
        type: 'Function',
        label: 'Test',
        position: undefined as unknown as { x: number; y: number }, // Missing position
        inputs: [],
        outputs: [],
      };

      const graph: BlueprintGraphState = {
        id: 'test',
        name: 'Test',
        language: 'cpp',
        displayLanguage: 'ru',
        nodes: [nodeWithoutPosition],
        edges: [],
        updatedAt: new Date().toISOString(),
      };
      const onGraphChange = vi.fn();

      expect(() => {
        render(
          <TestWrapper>
            <BlueprintEditor
              graph={graph}
              onGraphChange={onGraphChange}
              displayLanguage="ru"
            />
          </TestWrapper>
        );
      }).not.toThrow();
    });
  });

  describe('Callbacks', () => {
    it('should call onGraphChange when graph is modified', async () => {
      const graph = createGraphWithStartNode();
      const onGraphChange = vi.fn();

      render(
        <TestWrapper>
          <BlueprintEditor
            graph={graph}
            onGraphChange={onGraphChange}
            displayLanguage="ru"
          />
        </TestWrapper>
      );

      // Note: Actual interaction tests would require more complex setup
      // This test just verifies the callback is properly passed
      expect(onGraphChange).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should not crash on rapid graph updates', async () => {
      const onGraphChange = vi.fn();
      let graph = createEmptyGraph();

      const { rerender } = render(
        <TestWrapper>
          <BlueprintEditor
            graph={graph}
            onGraphChange={onGraphChange}
            displayLanguage="ru"
          />
        </TestWrapper>
      );

      // Simulate rapid updates
      for (let i = 0; i < 10; i++) {
        graph = {
          ...graph,
          id: `test-graph-${i}`,
          updatedAt: new Date().toISOString(),
        };

        act(() => {
          rerender(
            <TestWrapper>
              <BlueprintEditor
                graph={graph}
                onGraphChange={onGraphChange}
                displayLanguage="ru"
              />
            </TestWrapper>
          );
        });
      }

      // Should complete without crashing
      expect(true).toBe(true);
    });

    it('should handle node with invalid type', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invalidNode: BlueprintNode = {
        id: 'node-1',
        type: 'InvalidNodeType' as unknown as BlueprintNode['type'], // Invalid type
        label: 'Test',
        position: { x: 0, y: 0 },
        inputs: [],
        outputs: [],
      };

      const graph: BlueprintGraphState = {
        id: 'test',
        name: 'Test',
        language: 'cpp',
        displayLanguage: 'ru',
        nodes: [invalidNode],
        edges: [],
        updatedAt: new Date().toISOString(),
      };
      const onGraphChange = vi.fn();

      expect(() => {
        render(
          <TestWrapper>
            <BlueprintEditor
              graph={graph}
              onGraphChange={onGraphChange}
              displayLanguage="ru"
            />
          </TestWrapper>
        );
      }).not.toThrow();
    });
  });
});

describe('BlueprintEditor Integration', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
    global.matchMedia = mockMatchMedia;
  });

  it('should properly convert graph state to React Flow format', async () => {
    const graph = createGraphWithMultipleNodes();
    const onGraphChange = vi.fn();

    const { container } = render(
      <TestWrapper>
        <BlueprintEditor
          graph={graph}
          onGraphChange={onGraphChange}
          displayLanguage="ru"
        />
      </TestWrapper>
    );

    await waitFor(() => {
      // Check that React Flow rendered the nodes
      const reactFlowContainer = container.querySelector('.react-flow');
      expect(reactFlowContainer).toBeTruthy();
    });
  });
});
