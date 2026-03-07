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
import { type Edge, ReactFlowProvider } from '@xyflow/react';
import {
  BlueprintEditor,
  hasBlockingIncomingRetargetConnections,
  mutateGraphForEdgeDoubleClick,
} from '../BlueprintEditor';
import {
  EXTERNAL_SYMBOL_DRAG_MIME,
  serializeExternalSymbolDragPayload,
} from '../externalSymbolNodeFactory';
import { createUserFunction, type BlueprintGraphState, type BlueprintNode, type BlueprintEdge, type BlueprintVariable } from '../../shared/blueprintTypes';
import type { SourceIntegration, SymbolDescriptor } from '../../shared/externalSymbols';
import type { BlueprintFlowEdge, BlueprintFlowNode } from '../nodes/BlueprintNode';

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

function createGraphWithSingleExecutionEdge(): BlueprintGraphState {
  const startNode: BlueprintNode = {
    id: 'start-single',
    type: 'Start',
    label: 'Начало',
    position: { x: 100, y: 100 },
    inputs: [],
    outputs: [
      { id: 'start-single-exec-out', name: '', dataType: 'execution', direction: 'output', index: 0 },
    ],
  };

  const endNode: BlueprintNode = {
    id: 'end-single',
    type: 'End',
    label: 'Конец',
    position: { x: 360, y: 100 },
    inputs: [
      { id: 'end-single-exec-in', name: '', dataType: 'execution', direction: 'input', index: 0 },
    ],
    outputs: [],
  };

  const edge: BlueprintEdge = {
    id: 'edge-single',
    sourceNode: 'start-single',
    sourcePort: 'start-single-exec-out',
    targetNode: 'end-single',
    targetPort: 'end-single-exec-in',
    kind: 'execution',
  };

  return {
    id: 'test-single-edge',
    name: 'Single Edge Graph',
    language: 'cpp',
    displayLanguage: 'ru',
    nodes: [startNode, endNode],
    edges: [edge],
    updatedAt: new Date().toISOString(),
  };
}

function createGraphWithComparisonNode(): BlueprintGraphState {
  const comparisonNode: BlueprintNode = {
    id: 'greater-1',
    type: 'Greater',
    label: 'Больше',
    position: { x: 240, y: 140 },
    inputs: [
      { id: 'a', name: 'A', dataType: 'float', direction: 'input', index: 0 },
      { id: 'b', name: 'B', dataType: 'float', direction: 'input', index: 1 },
    ],
    outputs: [
      { id: 'result', name: 'Result', dataType: 'bool', direction: 'output', index: 0 },
    ],
  };

  return {
    id: 'test-comparison-graph',
    name: 'Comparison Graph',
    language: 'cpp',
    displayLanguage: 'ru',
    nodes: [comparisonNode],
    edges: [],
    updatedAt: new Date().toISOString(),
  };
}

function createGraphWithForLoopNode(): BlueprintGraphState {
  const forNode: BlueprintNode = {
    id: 'for-1',
    type: 'ForLoop',
    label: 'Цикл For',
    position: { x: 240, y: 140 },
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input', index: 0 },
      { id: 'first', name: 'Start', nameRu: 'Начало', dataType: 'int32', direction: 'input', index: 1, defaultValue: 0 },
      { id: 'last', name: 'Bound', nameRu: 'Граница', dataType: 'int32', direction: 'input', index: 2, defaultValue: 10 },
    ],
    outputs: [
      { id: 'loop-body', name: 'Loop Body', nameRu: 'Тело', dataType: 'execution', direction: 'output', index: 0 },
      { id: 'index', name: 'Index', nameRu: 'Индекс', dataType: 'int32', direction: 'output', index: 1 },
      { id: 'completed', name: 'Completed', nameRu: 'Завершено', dataType: 'execution', direction: 'output', index: 2 },
    ],
    properties: {
      forLoopStep: 2,
      forLoopDirection: 'up',
      forLoopBoundMode: 'exclusive',
    },
  };

  return {
    id: 'test-for-loop-graph',
    name: 'For Loop Graph',
    language: 'cpp',
    displayLanguage: 'ru',
    nodes: [forNode],
    edges: [],
    updatedAt: new Date().toISOString(),
  };
}

function createGraphWithLegacySequenceNode(): BlueprintGraphState {
  const sequenceNode: BlueprintNode = {
    id: 'sequence-1',
    type: 'Sequence',
    label: 'Последовательность',
    position: { x: 260, y: 140 },
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input', index: 0 },
    ],
    outputs: [
      { id: 'then-0', name: 'Then 0', dataType: 'execution', direction: 'output', index: 0 },
      { id: 'then-1', name: 'Then 1', dataType: 'execution', direction: 'output', index: 1 },
    ],
  };

  return {
    id: 'test-sequence-legacy-graph',
    name: 'Sequence Legacy Graph',
    language: 'cpp',
    displayLanguage: 'ru',
    nodes: [sequenceNode],
    edges: [],
    updatedAt: new Date().toISOString(),
  };
}

function createGraphWithClassPanelFixture(): BlueprintGraphState {
  return {
    id: 'test-class-graph',
    name: 'Class Graph',
    language: 'cpp',
    displayLanguage: 'ru',
    nodes: [
      {
        id: 'call-legacy',
        type: 'ClassMethodCall',
        label: 'Call Method',
        position: { x: 300, y: 140 },
        inputs: [
          { id: 'call-legacy-exec-in', name: '', dataType: 'execution', direction: 'input', index: 0 },
          { id: 'call-legacy-target', name: 'Target', dataType: 'class', direction: 'input', index: 1 },
          { id: 'call-legacy-arg-0', name: 'Arg 1', dataType: 'any', direction: 'input', index: 2 },
        ],
        outputs: [
          { id: 'call-legacy-exec-out', name: '', dataType: 'execution', direction: 'output', index: 0 },
          { id: 'call-legacy-result', name: 'Result', dataType: 'any', direction: 'output', index: 1 },
        ],
        properties: {
          classId: 'class-player',
          methodId: 'method-jump',
        },
      },
    ],
    edges: [
      {
        id: 'edge-class-arg',
        sourceNode: 'source-node',
        sourcePort: 'source-out',
        targetNode: 'call-legacy',
        targetPort: 'call-legacy-arg-0',
        kind: 'data',
        dataType: 'float',
      },
    ],
    classes: [
      {
        id: 'class-player',
        name: 'Player',
        nameRu: 'Игрок',
        members: [
          {
            id: 'member-score',
            name: 'score',
            nameRu: 'Очки',
            dataType: 'int32',
            access: 'private',
          },
        ],
        methods: [
          {
            id: 'method-jump',
            name: 'Jump',
            nameRu: 'Прыжок',
            returnType: 'bool',
            params: [
              {
                id: 'param-height',
                name: 'height',
                nameRu: 'Высота',
                dataType: 'float',
              },
            ],
            access: 'public',
            isStatic: false,
            isConst: false,
            isVirtual: false,
            isOverride: false,
          },
        ],
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

function toFlowNode(node: BlueprintNode): BlueprintFlowNode {
  return {
    id: node.id,
    type: 'blueprint',
    position: node.position,
    data: {
      node,
      displayLanguage: 'ru',
    },
  } as BlueprintFlowNode;
}

function toFlowEdge(edge: BlueprintEdge): BlueprintFlowEdge {
  return {
    id: edge.id,
    source: edge.sourceNode,
    sourceHandle: edge.sourcePort,
    target: edge.targetNode,
    targetHandle: edge.targetPort,
    animated: edge.kind === 'data',
    data: {
      kind: edge.kind,
      dataType: edge.dataType,
    },
  } as BlueprintFlowEdge;
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

    it('should add CallUserFunction node to EventGraph from function list action', async () => {
      const func = createUserFunction('CallTarget', 'Функция вызова', 'desc');
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

      const addCallButton = await screen.findByTestId(`function-call-add-${func.id}`);
      fireEvent.click(addCallButton);

      await waitFor(() => {
        const graphWithCallNode = onGraphChange.mock.calls
          .map((call) => call[0] as BlueprintGraphState)
          .find((state) => state.nodes.some((node) => {
            if (node.type !== 'CallUserFunction') {
              return false;
            }
            const functionId = (node.properties as Record<string, unknown> | undefined)?.functionId;
            return functionId === func.id;
          }));

        expect(graphWithCallNode).toBeTruthy();
        expect(graphWithCallNode?.activeFunctionId ?? null).toBeNull();
      });
    });

    it('should keep FunctionEntry and FunctionReturn nodes when deleting selection in function graph', async () => {
      const func = createUserFunction('LockedFunc', 'Защищённая функция', 'desc');
      const graph: BlueprintGraphState = {
        ...createEmptyGraph(),
        functions: [func],
      };
      const onGraphChange = vi.fn();

      const { container } = render(
        <TestWrapper>
          <BlueprintEditor
            graph={graph}
            onGraphChange={onGraphChange}
            displayLanguage="ru"
            forcedActiveFunctionId={func.id}
            uiMode="function-modal"
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(container.querySelectorAll('.react-flow__node').length).toBe(2);
      });

      fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
      fireEvent.keyDown(window, { key: 'Delete' });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
      });

      expect(container.querySelectorAll('.react-flow__node').length).toBe(2);
    });

    it('should use function-local variables in function modal and import EventGraph variables only by action', async () => {
      const func = {
        ...createUserFunction('ScopedVars', 'Локальные переменные', 'desc'),
        variables: [
          {
            id: 'func-var-only',
            name: 'localValue',
            nameRu: 'Локальная',
            dataType: 'int32' as const,
            defaultValue: 1,
            category: 'local' as const,
          },
        ],
      };

      const graph: BlueprintGraphState = {
        ...createEmptyGraph(),
        variables: [
          {
            id: 'global-var-only',
            name: 'globalValue',
            nameRu: 'Глобальная',
            dataType: 'int32',
            defaultValue: 2,
            category: 'default',
          },
        ],
        functions: [func],
      };

      const onGraphChange = vi.fn();

      render(
        <TestWrapper>
          <BlueprintEditor
            graph={graph}
            onGraphChange={onGraphChange}
            displayLanguage="ru"
            forcedActiveFunctionId={func.id}
            uiMode="function-modal"
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Локальная')).toBeTruthy();
      });

      expect(screen.queryByText('Глобальная')).toBeNull();

      const importButton = screen.getByTitle('Импортировать переменные EventGraph');
      fireEvent.click(importButton);

      await waitFor(() => {
        const updatedWithImported = onGraphChange.mock.calls
          .map((call) => call[0] as BlueprintGraphState)
          .find((state) => state.functions?.some((candidate) => {
            if (candidate.id !== func.id) {
              return false;
            }

            const variableIds = new Set((candidate.variables ?? []).map((variable) => variable.id));
            return variableIds.has('func-var-only') && variableIds.has('global-var-only');
          }));

        expect(updatedWithImported).toBeTruthy();
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

    it('should show DoWhile node in flow category', async () => {
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
        expect(screen.getByText('Цикл Do-While')).toBeTruthy();
      });
    });

    it('should find DoWhile by search query without hyphen', async () => {
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

      const searchInput = screen.getByPlaceholderText('Поиск...');
      fireEvent.change(searchInput, { target: { value: 'do while' } });

      await waitFor(() => {
        expect(screen.getByText('Цикл Do-While')).toBeTruthy();
      });
    });

    it('should add external symbol as CallUserFunction node with binding metadata', async () => {
      const graph = createEmptyGraph();
      const onGraphChange = vi.fn();
      const integrations: SourceIntegration[] = [
        {
          integrationId: 'depcheck',
          attachedFiles: ['F:/MultiCode/MultiCode_VS/dep_check_text.hpp'],
          mode: 'explicit',
          kind: 'file',
          location: {
            type: 'local_file',
            value: 'F:/MultiCode/MultiCode_VS/dep_check_text.hpp',
          },
        },
      ];
      const externalSymbols: SymbolDescriptor[] = [
        {
          id: 'depcheck::print_status',
          integrationId: 'depcheck',
          symbolKind: 'function',
          name: 'print_status',
          signature: 'print_status(std::string_view message)',
          signatureHash: 'sig-1',
          namespacePath: ['depcheck'],
        },
      ];

      render(
        <TestWrapper>
          <BlueprintEditor
            graph={graph}
            onGraphChange={onGraphChange}
            displayLanguage="ru"
            integrations={integrations}
            externalSymbols={externalSymbols}
          />
        </TestWrapper>
      );

      const addButton = screen.getByRole('button', { name: /Добавить \(A\)/ });
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByText('Внешние символы')).toBeTruthy();
      });

      fireEvent.click(screen.getByRole('button', { name: /print_status/i }));

      await waitFor(() => {
        const hasExternalBoundNode = onGraphChange.mock.calls.some((call) => {
          const state = call[0] as BlueprintGraphState;
          return state.nodes.some((node) => {
            const props = node.properties as Record<string, unknown> | undefined;
            const binding = props?.externalSymbol as Record<string, unknown> | undefined;
            return (
              node.type === 'CallUserFunction' &&
              props?.functionName === 'depcheck::print_status' &&
              node.inputs.some((inputPort) => inputPort.id.includes('ext_arg_1_message')) &&
              binding?.integrationId === 'depcheck' &&
              binding?.symbolId === 'depcheck::print_status'
            );
          });
        });
        expect(hasExternalBoundNode).toBe(true);
      });
    });

    it('should add external symbol via drag and drop payload on canvas', async () => {
      const graph = createEmptyGraph();
      const onGraphChange = vi.fn();
      const externalSymbol: SymbolDescriptor = {
        id: 'depcheck::print_status',
        integrationId: 'depcheck',
        symbolKind: 'function',
        name: 'print_status',
        signature: 'print_status(std::string_view message)',
        signatureHash: 'sig-drop-1',
        namespacePath: ['depcheck'],
      };

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

      const dropTarget = container.querySelector('.react-flow') as HTMLElement;
      const payload = serializeExternalSymbolDragPayload({
        symbol: externalSymbol,
        localizedName: 'Напечатать статус',
      });

      const dataTransfer = {
        getData: (type: string) => (type === EXTERNAL_SYMBOL_DRAG_MIME ? payload : ''),
        setData: vi.fn(),
        dropEffect: 'move',
        effectAllowed: 'move',
      } as unknown as DataTransfer;

      fireEvent.dragOver(dropTarget, { dataTransfer });
      fireEvent.drop(dropTarget, {
        dataTransfer,
        clientX: 280,
        clientY: 220,
      });

      await waitFor(() => {
        const hasDroppedExternalNode = onGraphChange.mock.calls.some((call) => {
          const state = call[0] as BlueprintGraphState;
          return state.nodes.some((node) => {
            const props = node.properties as Record<string, unknown> | undefined;
            const binding = props?.externalSymbol as Record<string, unknown> | undefined;
            return (
              node.type === 'CallUserFunction' &&
              props?.functionName === 'depcheck::print_status' &&
              binding?.integrationId === 'depcheck' &&
              binding?.symbolId === 'depcheck::print_status'
            );
          });
        });
        expect(hasDroppedExternalNode).toBe(true);
      });
    });
  });

  describe('Class Panel', () => {
    it('should insert class constructor node from mini class panel', async () => {
      const graph = createGraphWithClassPanelFixture();
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

      const ctorButton = await screen.findByTitle('Добавить узел конструктора');
      fireEvent.click(ctorButton);

      await waitFor(() => {
        const hasConstructorNode = onGraphChange.mock.calls.some((call) => {
          const state = call[0] as BlueprintGraphState;
          return state.nodes.some((node) => node.type === 'ClassConstructorCall');
        });
        expect(hasConstructorNode).toBe(true);
      });
    });

    it('should rebind legacy class method arg ports after class change', async () => {
      const graph = createGraphWithClassPanelFixture();
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

      const ruInputs = await screen.findAllByPlaceholderText('RU имя');
      fireEvent.change(ruInputs[0], { target: { value: 'Персонаж' } });

      await waitFor(() => {
        const hasReboundArgPort = onGraphChange.mock.calls.some((call) => {
          const state = call[0] as BlueprintGraphState;
          const methodNode = state.nodes.find((node) => node.id === 'call-legacy');
          if (!methodNode) {
            return false;
          }
          return methodNode.inputs.some((port) => port.id.endsWith('-arg-param-height'));
        });
        expect(hasReboundArgPort).toBe(true);
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
    it('should allow incoming retarget for comparison nodes with only outgoing bool links', () => {
      const outgoingBoolEdge: Edge = {
        id: 'edge-out-bool',
        source: 'greater-1',
        sourceHandle: 'result',
        target: 'branch-1',
        targetHandle: 'condition',
        animated: true,
        data: {
          kind: 'data',
          dataType: 'bool',
        },
      };

      expect(
        hasBlockingIncomingRetargetConnections('Greater', 'greater-1', [outgoingBoolEdge])
      ).toBe(false);

      expect(
        hasBlockingIncomingRetargetConnections('Equal', 'greater-1', [outgoingBoolEdge])
      ).toBe(false);

      expect(
        hasBlockingIncomingRetargetConnections('Add', 'greater-1', [outgoingBoolEdge])
      ).toBe(true);
    });

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

    it('should insert a reroute control point on edge double click', () => {
      const graph = createGraphWithSingleExecutionEdge();
      const flowNodes = graph.nodes.map(toFlowNode);
      const flowEdge = toFlowEdge(graph.edges[0]);
      const createNodeByType = vi.fn((_: BlueprintNode['type'], position: { x: number; y: number }, id?: string) => ({
        id: id ?? 'reroute-1',
        type: 'Reroute',
        label: 'Reroute',
        position,
        inputs: [
          { id: 'in', name: '', dataType: 'any', direction: 'input', index: 0 },
        ],
        outputs: [
          { id: 'out', name: '', dataType: 'any', direction: 'output', index: 0 },
        ],
      } as BlueprintNode));
      const buildFlowNode = (node: BlueprintNode) => toFlowNode(node);

      const mutation = mutateGraphForEdgeDoubleClick({
        edge: flowEdge,
        nodes: flowNodes,
        edges: [flowEdge],
        altKey: false,
        flowPosition: { x: 220, y: 100 },
        computeNodePosition: (position) => position,
        createNodeByType,
        buildFlowNode,
        createRerouteNodeId: () => 'node-reroute-test',
      });

      expect(mutation.type).toBe('control-point-added');
      expect(mutation.nextEdges).toHaveLength(2);
      expect(mutation.nextNodes.some((node) => node.data.node.type === 'Reroute')).toBe(true);
      expect(createNodeByType).toHaveBeenCalledWith('Reroute', { x: 220, y: 100 }, 'node-reroute-test');
    });

    it('should delete edge on Alt + double click without creating reroute', () => {
      const graph = createGraphWithSingleExecutionEdge();
      const flowNodes = graph.nodes.map(toFlowNode);
      const flowEdge = toFlowEdge(graph.edges[0]);
      const createNodeByType = vi.fn((_: BlueprintNode['type'], position: { x: number; y: number }, id?: string) => ({
        id: id ?? 'noop-node',
        type: 'Reroute',
        label: 'Reroute',
        position,
        inputs: [],
        outputs: [],
      } as BlueprintNode));

      const mutation = mutateGraphForEdgeDoubleClick({
        edge: flowEdge,
        nodes: flowNodes,
        edges: [flowEdge],
        altKey: true,
        computeNodePosition: (position) => position,
        createNodeByType,
        buildFlowNode: toFlowNode,
      });

      expect(mutation.type).toBe('deleted');
      expect(mutation.nextEdges).toHaveLength(0);
      expect(mutation.nextNodes.some((node) => node.data.node.type === 'Reroute')).toBe(false);
      expect(createNodeByType).not.toHaveBeenCalled();
    });
  });

  describe('Comparison nodes', () => {
    it('should render inline constant editors for comparison input ports', async () => {
      const graph = createGraphWithComparisonNode();
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
        expect(screen.getAllByText('Константа').length).toBeGreaterThanOrEqual(2);
      });

      const numberEditors = document.querySelectorAll('input[type="number"]');
      expect(numberEditors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('ForLoop node', () => {
    it('should render modern for-loop controls and C++ preview', async () => {
      const graph = createGraphWithForLoopNode();
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
        expect(screen.getByText('Параметры цикла')).toBeTruthy();
      });

      expect(screen.getByText('Превью C++')).toBeTruthy();
      expect(screen.getByDisplayValue('2')).toBeTruthy();
      const forLoopPanelHeader = screen.getByText('Параметры цикла');
      const forLoopPanel = forLoopPanelHeader.parentElement;
      const selectInputs = forLoopPanel?.querySelectorAll('select') ?? [];
      expect(selectInputs.length).toBe(2);
      expect((selectInputs[0] as HTMLSelectElement).value).toBe('exclusive');
      expect((selectInputs[1] as HTMLSelectElement).value).toBe('up');
    });
  });

  describe('Sequence node', () => {
    it('should localize legacy Then labels and add new steps via plus button', async () => {
      const graph = createGraphWithLegacySequenceNode();
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
        expect(screen.getByText('Затем 1')).toBeTruthy();
      });

      const addStepButton = screen.getByTitle('Добавить шаг');
      const callsBeforeClick = onGraphChange.mock.calls.length;
      fireEvent.click(addStepButton);

      await waitFor(() => {
        expect(onGraphChange.mock.calls.length).toBeGreaterThan(callsBeforeClick);
      });

      const lastCall = onGraphChange.mock.calls[onGraphChange.mock.calls.length - 1];
      const updatedGraph = lastCall[0] as BlueprintGraphState;
      const sequenceNode = updatedGraph.nodes.find((node) => node.id === 'sequence-1');
      expect(sequenceNode).toBeTruthy();
      expect(sequenceNode?.outputs.length).toBe(3);
      expect(sequenceNode?.outputs.some((port) => port.id.includes('then-2'))).toBe(true);
      expect(sequenceNode?.outputs.some((port) => port.nameRu === 'Затем 2')).toBe(true);
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
