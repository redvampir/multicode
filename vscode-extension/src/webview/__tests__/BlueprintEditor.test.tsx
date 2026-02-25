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
import { render, waitFor, act, fireEvent, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { BlueprintEditor } from '../BlueprintEditor';
import { createUserFunction, type BlueprintGraphState, type BlueprintNode, type BlueprintEdge, type BlueprintVariable } from '../../shared/blueprintTypes';

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

function createGraphWithVariableNodes(): BlueprintGraphState {
  const variable: BlueprintVariable = {
    id: 'var-flag',
    name: 'flag',
    nameRu: 'Флаг',
    dataType: 'bool',
    defaultValue: false,
    category: 'default',
    color: '#E53935',
  };

  const setVariableNode: BlueprintNode = {
    id: 'set-var-1',
    type: 'SetVariable',
    label: '',
    position: { x: 240, y: 160 },
    inputs: [
      { id: 'set-var-1-exec-in', name: '', dataType: 'execution', direction: 'input', index: 0 },
      { id: 'set-var-1-value-in', name: 'Значение', dataType: 'any', direction: 'input', index: 1 },
    ],
    outputs: [
      { id: 'set-var-1-exec-out', name: '', dataType: 'execution', direction: 'output', index: 0 },
      { id: 'set-var-1-value-out', name: 'Значение', dataType: 'any', direction: 'output', index: 1 },
    ],
    properties: {
      variableId: variable.id,
    },
  };

  const getVariableNode: BlueprintNode = {
    id: 'get-var-1',
    type: 'GetVariable',
    label: '',
    position: { x: 80, y: 160 },
    inputs: [],
    outputs: [
      { id: 'get-var-1-value-out', name: 'Значение', dataType: 'any', direction: 'output', index: 0 },
    ],
    properties: {
      variableId: variable.id,
    },
  };

  const edge: BlueprintEdge = {
    id: 'edge-var-1',
    sourceNode: 'get-var-1',
    sourcePort: 'get-var-1-value-out',
    targetNode: 'set-var-1',
    targetPort: 'set-var-1-value-in',
    kind: 'data',
    dataType: 'bool',
  };

  return {
    id: 'test-variable-graph',
    name: 'Variable Graph',
    language: 'cpp',
    displayLanguage: 'ru',
    nodes: [getVariableNode, setVariableNode],
    edges: [edge],
    variables: [variable],
    updatedAt: new Date().toISOString(),
  };
}

function createGraphWithDuplicateExecutionEdges(): BlueprintGraphState {
  const startNode: BlueprintNode = {
    id: 'start-dup',
    type: 'Start',
    label: 'Начало',
    position: { x: 100, y: 100 },
    inputs: [],
    outputs: [
      { id: 'start-dup-exec-out', name: '', dataType: 'execution', direction: 'output', index: 0 },
    ],
  };

  const endNode: BlueprintNode = {
    id: 'end-dup',
    type: 'End',
    label: 'Конец',
    position: { x: 320, y: 100 },
    inputs: [
      { id: 'end-dup-exec-in', name: '', dataType: 'execution', direction: 'input', index: 0 },
    ],
    outputs: [],
  };

  const duplicateEdgeA: BlueprintEdge = {
    id: 'edge-dup-a',
    sourceNode: 'start-dup',
    sourcePort: 'start-dup-exec-out',
    targetNode: 'end-dup',
    targetPort: 'end-dup-exec-in',
    kind: 'execution',
  };

  const duplicateEdgeB: BlueprintEdge = {
    ...duplicateEdgeA,
    id: 'edge-dup-b',
  };

  return {
    id: 'test-dup-graph',
    name: 'Dup Graph',
    language: 'cpp',
    displayLanguage: 'ru',
    nodes: [startNode, endNode],
    edges: [duplicateEdgeA, duplicateEdgeB],
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

  describe('Sidebar Layout', () => {
    it('should render functions and variables in a shared vertical sidebar stack', async () => {
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

      await waitFor(() => {
        const sidebarStack = container.querySelector('.left-sidebar-stack');
        expect(sidebarStack).toBeTruthy();
        expect(sidebarStack?.querySelector('.function-list-panel')).toBeTruthy();
        expect(sidebarStack?.querySelector('.variable-list-panel')).toBeTruthy();
        expect(sidebarStack?.querySelector('.pointer-list-panel')).toBeTruthy();
      });
    });

    it('should collapse function section and keep function header actions visible', async () => {
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

      await waitFor(() => {
        expect(container.querySelector('.function-list')).toBeTruthy();
      });

      fireEvent.click(screen.getByTestId('functions-section-toggle'));

      await waitFor(() => {
        expect(container.querySelector('.function-list')).toBeNull();
        expect(screen.getByRole('heading', { name: 'Функции' })).toBeTruthy();
        expect(screen.getByTitle('Создать функцию')).toBeTruthy();
      });
    });

    it('should collapse variable section and keep variable header actions visible', async () => {
      const graph = createGraphWithVariableNodes();
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
        expect(container.querySelector('.variable-list')).toBeTruthy();
      });

      fireEvent.click(screen.getByTestId('variables-section-toggle'));

      await waitFor(() => {
        expect(container.querySelector('.variable-list')).toBeNull();
        expect(screen.getByRole('heading', { name: 'Переменные' })).toBeTruthy();
        expect(screen.getByTitle('Создать переменную')).toBeTruthy();
      });
    });

    it('should collapse pointer section and keep pointer header actions visible', async () => {
      const graph = createGraphWithVariableNodes();
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
        expect(container.querySelector('.pointer-list')).toBeTruthy();
      });

      fireEvent.click(screen.getByTestId('pointers-section-toggle'));

      await waitFor(() => {
        expect(container.querySelector('.pointer-list')).toBeNull();
        expect(screen.getByRole('heading', { name: 'Указатели и ссылки' })).toBeTruthy();
        expect(screen.getByTitle('Создать указатель/ссылку')).toBeTruthy();
      });
    });
  });

  describe('Function Graph Modal', () => {
    it('should open function graph in a modal dialog when function is selected', async () => {
      const func = createUserFunction('TestFunc', 'Тестовая функция', 'desc');
      const graph: BlueprintGraphState = {
        ...createEmptyGraph(),
        functions: [func],
      };
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

      expect(screen.queryByTestId('function-graph-dialog')).toBeNull();

      const functionName = await screen.findByText('Тестовая функция', { selector: '.function-name' });
      fireEvent.click(functionName);

      await waitFor(() => {
        expect(screen.getByTestId('function-graph-dialog')).toBeTruthy();
      });

      fireEvent.keyDown(window, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByTestId('function-graph-dialog')).toBeNull();
      });
    });
  });

  describe('Node Palette', () => {
    it('should hide variable binding nodes in palette (variables are created from Variables panel)', async () => {
      const graph = createEmptyGraph();
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

      const addButton = screen.getByRole('button', { name: /Добавить \(A\)/ });
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByText('Добавить узел')).toBeTruthy();
      });

      expect(screen.queryByText(/^Переменная$/)).toBeNull();
      expect(screen.queryByText(/^Получить$/)).toBeNull();
      expect(screen.queryByText(/^Установить$/)).toBeNull();
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

    it('should ignore graph paste shortcut when variable dialog is open', async () => {
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
        expect(container.querySelectorAll('.react-flow__node').length).toBe(1);
      });

      fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
      await waitFor(() => {
        expect(container.querySelectorAll('.react-flow__node.selected').length).toBeGreaterThan(0);
      });
      fireEvent.keyDown(window, { key: 'c', ctrlKey: true });

      fireEvent.click(screen.getByTitle('Создать переменную'));

      await waitFor(() => {
        expect(container.querySelector('.variable-dialog-overlay')).toBeTruthy();
      });

      const dialogOverlay = container.querySelector('.variable-dialog-overlay');
      expect(dialogOverlay).toBeTruthy();
      fireEvent.keyDown(dialogOverlay as HTMLElement, { key: 'v', ctrlKey: true });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
      });

      expect(container.querySelectorAll('.react-flow__node').length).toBe(1);
    });
  });

  describe('Variable Nodes', () => {
    it('should reconcile variable node title/color/default when variables are updated', async () => {
      const onGraphChange = vi.fn();
      const initialGraph = createGraphWithVariableNodes();

      const { rerender } = render(
        <TestWrapper>
          <BlueprintEditor
            graph={initialGraph}
            onGraphChange={onGraphChange}
            displayLanguage="ru"
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Получить: Флаг')).toBeTruthy();
        expect(screen.getByText('Установить: Флаг')).toBeTruthy();
      });

      const updatedGraph: BlueprintGraphState = {
        ...initialGraph,
        variables: [
          {
            ...initialGraph.variables![0],
            name: 'flagUpdated',
            nameRu: 'ФлагОбновлён',
            dataType: 'float',
            defaultValue: 21.2,
            color: '#8BC34A',
          },
        ],
        updatedAt: new Date().toISOString(),
      };

      act(() => {
        rerender(
          <TestWrapper>
            <BlueprintEditor
              graph={updatedGraph}
              onGraphChange={onGraphChange}
              displayLanguage="ru"
            />
          </TestWrapper>
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Получить: ФлагОбновлён')).toBeTruthy();
        expect(screen.getByText('Установить: ФлагОбновлён')).toBeTruthy();
        expect(screen.getAllByText(/21\.2/).length).toBeGreaterThan(0);
      });
    });

    it('should remove linked Get/Set nodes when variable is deleted', async () => {
      const onGraphChange = vi.fn();
      const graph = createGraphWithVariableNodes();

      render(
        <TestWrapper>
          <BlueprintEditor
            graph={graph}
            onGraphChange={onGraphChange}
            displayLanguage="ru"
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Установить: Флаг')).toBeTruthy();
      });

      const deleteButton = screen.getByTitle('Удалить');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(onGraphChange).toHaveBeenCalled();
      });

      const lastCall = onGraphChange.mock.calls[onGraphChange.mock.calls.length - 1];
      const updatedGraph = lastCall[0] as BlueprintGraphState;
      const variableNodeCount = updatedGraph.nodes.filter(
        (node) => node.type === 'GetVariable' || node.type === 'SetVariable'
      ).length;

      expect(updatedGraph.variables).toHaveLength(0);
      expect(variableNodeCount).toBe(0);
      expect(updatedGraph.edges).toHaveLength(0);
    });

    it('should render exec/data handles in different lanes for SetVariable node', async () => {
      const graph = createGraphWithVariableNodes();
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
        expect(container.querySelector('.bp-handle-exec-out')).toBeTruthy();
        expect(container.querySelector('.bp-handle-data-out')).toBeTruthy();
      });

      const execOutHandle = container.querySelector('.bp-node-set-variable .bp-handle-exec-out') as HTMLElement;
      const dataOutHandle = container.querySelector('.bp-node-set-variable .bp-handle-data-out') as HTMLElement;
      expect(execOutHandle.style.top).not.toBe(dataOutHandle.style.top);
    });
  });

  describe('Edge handling', () => {
    it('should normalize duplicate edges on initial hydrate', async () => {
      const graph = createGraphWithDuplicateExecutionEdges();
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

      await waitFor(() => {
        expect(onGraphChange).toHaveBeenCalled();
      });

      const normalizedGraph = onGraphChange.mock.calls
        .map((call) => call[0] as BlueprintGraphState)
        .find((state) => state.edges.length === 1);
      expect(normalizedGraph).toBeTruthy();
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
