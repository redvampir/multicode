/**
 * Тесты для validator.ts — валидация графа
 */

import { describe, it, expect } from 'vitest';
import { validateGraphState } from './validator';
import type { GraphState, GraphNode, GraphEdge } from './graphState';

// ============================================
// Вспомогательные функции
// ============================================

function createNode(id: string, type: GraphNode['type'], label?: string): GraphNode {
  return {
    id,
    type,
    label: label ?? id,
    position: { x: 0, y: 0 },
  };
}

function createEdge(
  id: string,
  source: string,
  target: string,
  kind: GraphEdge['kind'] = 'execution'
): GraphEdge {
  return { id, source, target, kind };
}

function createValidGraph(): GraphState {
  return {
    id: 'graph-1',
    name: 'Test Graph',
    language: 'cpp',
    displayLanguage: 'ru',
    nodes: [
      createNode('start', 'Start', 'Начало'),
      createNode('func', 'Function', 'Функция'),
      createNode('end', 'End', 'Конец'),
    ],
    edges: [
      createEdge('e1', 'start', 'func'),
      createEdge('e2', 'func', 'end'),
    ],
    updatedAt: new Date().toISOString(),
  };
}

// ============================================
// Тесты
// ============================================

describe('validator', () => {
  describe('validateGraphState', () => {
    describe('базовая валидация', () => {
      it('должен принимать валидный граф', () => {
        const graph = createValidGraph();
        const result = validateGraphState(graph);

        expect(result.ok).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('должен отклонять пустой граф (без узлов)', () => {
        const graph: GraphState = {
          id: 'graph-1',
          name: 'Empty',
          language: 'cpp',
          displayLanguage: 'ru',
          nodes: [],
          edges: [],
          updatedAt: new Date().toISOString(),
        };

        const result = validateGraphState(graph);

        expect(result.ok).toBe(false);
        expect(result.errors).toContain('Graph must contain at least one node.');
      });
    });

    describe('валидация Start узла', () => {
      it('должен требовать наличие Start узла', () => {
        const graph: GraphState = {
          id: 'graph-1',
          name: 'No Start',
          language: 'cpp',
          displayLanguage: 'ru',
          nodes: [
            createNode('func', 'Function'),
            createNode('end', 'End'),
          ],
          edges: [createEdge('e1', 'func', 'end')],
          updatedAt: new Date().toISOString(),
        };

        const result = validateGraphState(graph);

        expect(result.ok).toBe(false);
        expect(result.errors).toContain('Graph must contain a Start node.');
      });

      it('должен отклонять несколько Start узлов', () => {
        const graph: GraphState = {
          id: 'graph-1',
          name: 'Multiple Starts',
          language: 'cpp',
          displayLanguage: 'ru',
          nodes: [
            createNode('start1', 'Start', 'Начало 1'),
            createNode('start2', 'Start', 'Начало 2'),
            createNode('end', 'End'),
          ],
          edges: [
            createEdge('e1', 'start1', 'end'),
            createEdge('e2', 'start2', 'end'),
          ],
          updatedAt: new Date().toISOString(),
        };

        const result = validateGraphState(graph);

        expect(result.ok).toBe(false);
        expect(result.errors).toContain('Only one Start node is allowed.');
      });

      it('должен отклонять входящие связи в Start узел', () => {
        const graph: GraphState = {
          id: 'graph-1',
          name: 'Incoming to Start',
          language: 'cpp',
          displayLanguage: 'ru',
          nodes: [
            createNode('start', 'Start'),
            createNode('func', 'Function'),
            createNode('end', 'End'),
          ],
          edges: [
            createEdge('e1', 'start', 'func'),
            createEdge('e2', 'func', 'start'), // Неправильно!
            createEdge('e3', 'func', 'end'),
          ],
          updatedAt: new Date().toISOString(),
        };

        const result = validateGraphState(graph);

        expect(result.ok).toBe(false);
        expect(result.errors.some(e => e.includes('cannot target Start node'))).toBe(true);
      });

      it('должен предупреждать если Start не имеет исходящих связей', () => {
        const graph: GraphState = {
          id: 'graph-1',
          name: 'Isolated Start',
          language: 'cpp',
          displayLanguage: 'ru',
          nodes: [
            createNode('start', 'Start'),
            createNode('end', 'End'),
          ],
          edges: [],
          updatedAt: new Date().toISOString(),
        };

        const result = validateGraphState(graph);

        expect(result.warnings).toContain('Start node has no outgoing execution edges.');
      });
    });

    describe('валидация End узла', () => {
      it('должен требовать наличие End узла', () => {
        const graph: GraphState = {
          id: 'graph-1',
          name: 'No End',
          language: 'cpp',
          displayLanguage: 'ru',
          nodes: [
            createNode('start', 'Start'),
            createNode('func', 'Function'),
          ],
          edges: [createEdge('e1', 'start', 'func')],
          updatedAt: new Date().toISOString(),
        };

        const result = validateGraphState(graph);

        expect(result.ok).toBe(false);
        expect(result.errors).toContain('Graph must contain at least one End node.');
      });

      it('должен отклонять исходящие execution связи из End узла', () => {
        const graph: GraphState = {
          id: 'graph-1',
          name: 'Outgoing from End',
          language: 'cpp',
          displayLanguage: 'ru',
          nodes: [
            createNode('start', 'Start'),
            createNode('func', 'Function'),
            createNode('end', 'End', 'Конец'),
          ],
          edges: [
            createEdge('e1', 'start', 'func'),
            createEdge('e2', 'func', 'end'),
            createEdge('e3', 'end', 'func'), // Неправильно!
          ],
          updatedAt: new Date().toISOString(),
        };

        const result = validateGraphState(graph);

        expect(result.ok).toBe(false);
        expect(result.errors.some(e => e.includes('cannot start from End node'))).toBe(true);
      });

      it('должен предупреждать если End не имеет входящих связей', () => {
        const graph: GraphState = {
          id: 'graph-1',
          name: 'Isolated End',
          language: 'cpp',
          displayLanguage: 'ru',
          nodes: [
            createNode('start', 'Start'),
            createNode('func', 'Function'),
            createNode('end', 'End', 'Конец'),
          ],
          edges: [createEdge('e1', 'start', 'func')],
          updatedAt: new Date().toISOString(),
        };

        const result = validateGraphState(graph);

        expect(result.warnings.some(w => w.includes('has no incoming execution edges'))).toBe(true);
      });

      it('должен поддерживать несколько End узлов', () => {
        const graph: GraphState = {
          id: 'graph-1',
          name: 'Multiple Ends',
          language: 'cpp',
          displayLanguage: 'ru',
          nodes: [
            createNode('start', 'Start'),
            createNode('func', 'Function'),
            createNode('end1', 'End', 'Конец 1'),
            createNode('end2', 'End', 'Конец 2'),
          ],
          edges: [
            createEdge('e1', 'start', 'func'),
            createEdge('e2', 'func', 'end1'),
            createEdge('e3', 'func', 'end2'),
          ],
          updatedAt: new Date().toISOString(),
        };

        const result = validateGraphState(graph);

        expect(result.ok).toBe(true);
      });
    });

    describe('валидация связей', () => {
      it('должен отклонять связи с несуществующими узлами', () => {
        const graph: GraphState = {
          id: 'graph-1',
          name: 'Missing Node',
          language: 'cpp',
          displayLanguage: 'ru',
          nodes: [
            createNode('start', 'Start'),
            createNode('end', 'End'),
          ],
          edges: [
            createEdge('e1', 'start', 'missing'),
          ],
          updatedAt: new Date().toISOString(),
        };

        const result = validateGraphState(graph);

        expect(result.ok).toBe(false);
        expect(result.errors.some(e => e.includes('references missing nodes'))).toBe(true);
      });

      it('должен отклонять self-loop связи', () => {
        const graph: GraphState = {
          id: 'graph-1',
          name: 'Self Loop',
          language: 'cpp',
          displayLanguage: 'ru',
          nodes: [
            createNode('start', 'Start'),
            createNode('func', 'Function'),
            createNode('end', 'End'),
          ],
          edges: [
            createEdge('e1', 'start', 'func'),
            createEdge('e2', 'func', 'func'), // Self-loop!
            createEdge('e3', 'func', 'end'),
          ],
          updatedAt: new Date().toISOString(),
        };

        const result = validateGraphState(graph);

        expect(result.ok).toBe(false);
        expect(result.errors.some(e => e.includes('self-loop'))).toBe(true);
      });

      it('должен предупреждать о дубликатах связей', () => {
        const graph: GraphState = {
          id: 'graph-1',
          name: 'Duplicate Edges',
          language: 'cpp',
          displayLanguage: 'ru',
          nodes: [
            createNode('start', 'Start'),
            createNode('func', 'Function'),
            createNode('end', 'End'),
          ],
          edges: [
            createEdge('e1', 'start', 'func'),
            createEdge('e2', 'start', 'func'), // Дубликат!
            createEdge('e3', 'func', 'end'),
          ],
          updatedAt: new Date().toISOString(),
        };

        const result = validateGraphState(graph);

        expect(result.warnings.some(w => w.includes('Duplicate edge'))).toBe(true);
      });

      it('должен требовать execution связи в графе с несколькими узлами', () => {
        const graph: GraphState = {
          id: 'graph-1',
          name: 'No Execution Flow',
          language: 'cpp',
          displayLanguage: 'ru',
          nodes: [
            createNode('start', 'Start'),
            createNode('func', 'Function'),
            createNode('end', 'End'),
          ],
          edges: [
            createEdge('e1', 'start', 'func', 'data'),
          ],
          updatedAt: new Date().toISOString(),
        };

        const result = validateGraphState(graph);

        expect(result.ok).toBe(false);
        expect(result.errors).toContain('Graph does not contain execution flow connections.');
      });
    });

    describe('валидация data связей', () => {
      it('должен отклонять data связи из Start узла', () => {
        const graph: GraphState = {
          id: 'graph-1',
          name: 'Data from Start',
          language: 'cpp',
          displayLanguage: 'ru',
          nodes: [
            createNode('start', 'Start'),
            createNode('func', 'Function'),
            createNode('end', 'End'),
          ],
          edges: [
            createEdge('e1', 'start', 'func', 'execution'),
            createEdge('e2', 'start', 'func', 'data'), // Неправильно!
            createEdge('e3', 'func', 'end'),
          ],
          updatedAt: new Date().toISOString(),
        };

        const result = validateGraphState(graph);

        expect(result.ok).toBe(false);
        expect(result.errors.some(e => e.includes('Data edge') && e.includes('cannot involve Start'))).toBe(true);
      });

      it('должен отклонять data связи из End узла', () => {
        const graph: GraphState = {
          id: 'graph-1',
          name: 'Data from End',
          language: 'cpp',
          displayLanguage: 'ru',
          nodes: [
            createNode('start', 'Start'),
            createNode('func', 'Function'),
            createNode('end', 'End'),
          ],
          edges: [
            createEdge('e1', 'start', 'func'),
            createEdge('e2', 'func', 'end'),
            createEdge('e3', 'end', 'func', 'data'), // Неправильно!
          ],
          updatedAt: new Date().toISOString(),
        };

        const result = validateGraphState(graph);

        expect(result.ok).toBe(false);
        expect(result.errors.some(e => e.includes('Data edge') && e.includes('cannot originate from End'))).toBe(true);
      });

      it('должен предупреждать о data связях между Variable узлами', () => {
        const graph: GraphState = {
          id: 'graph-1',
          name: 'Variable to Variable',
          language: 'cpp',
          displayLanguage: 'ru',
          nodes: [
            createNode('start', 'Start'),
            createNode('var1', 'Variable', 'Переменная 1'),
            createNode('var2', 'Variable', 'Переменная 2'),
            createNode('end', 'End'),
          ],
          edges: [
            createEdge('e1', 'start', 'var1'),
            createEdge('e2', 'var1', 'var2'),
            createEdge('e3', 'var2', 'end'),
            createEdge('e4', 'var1', 'var2', 'data'), // Variable -> Variable
          ],
          updatedAt: new Date().toISOString(),
        };

        const result = validateGraphState(graph);

        expect(result.warnings.some(w => w.includes('connects two Variable nodes'))).toBe(true);
      });

      it('не должен предупреждать для валидной связи GetVariable -> SetVariable', () => {
        const graph: GraphState = {
          id: 'graph-1',
          name: 'Get to Set',
          language: 'cpp',
          displayLanguage: 'ru',
          nodes: [
            {
              ...createNode('start', 'Start'),
              blueprintNode: {
                type: 'Start',
                outputs: [{ id: 'exec-out', dataType: 'execution' }],
              },
            },
            {
              ...createNode('get-var', 'Variable', 'Получить'),
              blueprintNode: {
                type: 'GetVariable',
                outputs: [{ id: 'value-out', dataType: 'int32' }],
              },
            },
            {
              ...createNode('set-var', 'Variable', 'Установить'),
              blueprintNode: {
                type: 'SetVariable',
                inputs: [
                  { id: 'exec-in', dataType: 'execution' },
                  { id: 'value-in', dataType: 'int32' },
                ],
                outputs: [{ id: 'exec-out', dataType: 'execution' }],
              },
            },
            {
              ...createNode('end', 'End'),
              blueprintNode: {
                type: 'End',
                inputs: [{ id: 'exec-in', dataType: 'execution' }],
              },
            },
          ],
          edges: [
            {
              id: 'e1',
              source: 'start',
              target: 'set-var',
              kind: 'execution',
              blueprintEdge: {
                id: 'e1',
                sourceNode: 'start',
                sourcePort: 'exec-out',
                targetNode: 'set-var',
                targetPort: 'exec-in',
                kind: 'execution',
              },
            },
            {
              id: 'e2',
              source: 'get-var',
              target: 'set-var',
              kind: 'data',
              blueprintEdge: {
                id: 'e2',
                sourceNode: 'get-var',
                sourcePort: 'value-out',
                targetNode: 'set-var',
                targetPort: 'value-in',
                kind: 'data',
                dataType: 'int32',
              },
            },
            {
              id: 'e3',
              source: 'set-var',
              target: 'end',
              kind: 'execution',
              blueprintEdge: {
                id: 'e3',
                sourceNode: 'set-var',
                sourcePort: 'exec-out',
                targetNode: 'end',
                targetPort: 'exec-in',
                kind: 'execution',
              },
            },
          ],
          updatedAt: new Date().toISOString(),
        };

        const result = validateGraphState(graph);

        expect(result.warnings.some(w => w.includes('connects two Variable nodes'))).toBe(false);
      });
    });

    describe('проверка достижимости', () => {
      it('должен отклонять недостижимые узлы', () => {
        const graph: GraphState = {
          id: 'graph-1',
          name: 'Unreachable Node',
          language: 'cpp',
          displayLanguage: 'ru',
          nodes: [
            createNode('start', 'Start'),
            createNode('func1', 'Function', 'Функция 1'),
            createNode('func2', 'Function', 'Функция 2'), // Недостижима
            createNode('end', 'End'),
          ],
          edges: [
            createEdge('e1', 'start', 'func1'),
            createEdge('e2', 'func1', 'end'),
            // func2 не связан с остальным графом
          ],
          updatedAt: new Date().toISOString(),
        };

        const result = validateGraphState(graph);

        expect(result.ok).toBe(false);
        expect(result.errors.some(e => e.includes('Unreachable nodes'))).toBe(true);
        expect(result.errors.some(e => e.includes('Функция 2'))).toBe(true);
      });

      it('должен находить все достижимые узлы', () => {
        const graph = createValidGraph();
        const result = validateGraphState(graph);

        expect(result.ok).toBe(true);
        expect(result.errors.filter(e => e.includes('Unreachable'))).toHaveLength(0);
      });

      it('не должен считать pure data узел недостижимой ошибкой', () => {
        const graph: GraphState = {
          id: 'graph-1',
          name: 'Pure data node',
          language: 'cpp',
          displayLanguage: 'ru',
          nodes: [
            createNode('start', 'Start'),
            {
              ...createNode('get-var', 'Variable', 'Получить'),
              blueprintNode: {
                type: 'GetVariable',
                outputs: [{ id: 'value-out', dataType: 'int32' }],
              },
            },
            createNode('func', 'Function'),
            createNode('end', 'End'),
          ],
          edges: [
            createEdge('e1', 'start', 'func'),
            createEdge('e2', 'func', 'end'),
          ],
          updatedAt: new Date().toISOString(),
        };

        const result = validateGraphState(graph);

        expect(result.errors.some(e => e.includes('Unreachable') && e.includes('Получить'))).toBe(false);
      });
    });

    describe('обнаружение циклов', () => {
      it('должен обнаруживать простой цикл', () => {
        const graph: GraphState = {
          id: 'graph-1',
          name: 'Simple Cycle',
          language: 'cpp',
          displayLanguage: 'ru',
          nodes: [
            createNode('start', 'Start'),
            createNode('func1', 'Function', 'Функция 1'),
            createNode('func2', 'Function', 'Функция 2'),
            createNode('end', 'End'),
          ],
          edges: [
            createEdge('e1', 'start', 'func1'),
            createEdge('e2', 'func1', 'func2'),
            createEdge('e3', 'func2', 'func1'), // Цикл!
            createEdge('e4', 'func2', 'end'),
          ],
          updatedAt: new Date().toISOString(),
        };

        const result = validateGraphState(graph);

        expect(result.ok).toBe(false);
        expect(result.errors.some(e => e.includes('Execution cycle detected'))).toBe(true);
      });

      it('должен обнаруживать длинный цикл', () => {
        const graph: GraphState = {
          id: 'graph-1',
          name: 'Long Cycle',
          language: 'cpp',
          displayLanguage: 'ru',
          nodes: [
            createNode('start', 'Start'),
            createNode('a', 'Function', 'A'),
            createNode('b', 'Function', 'B'),
            createNode('c', 'Function', 'C'),
            createNode('d', 'Function', 'D'),
            createNode('end', 'End'),
          ],
          edges: [
            createEdge('e1', 'start', 'a'),
            createEdge('e2', 'a', 'b'),
            createEdge('e3', 'b', 'c'),
            createEdge('e4', 'c', 'd'),
            createEdge('e5', 'd', 'a'), // Цикл A -> B -> C -> D -> A
            createEdge('e6', 'd', 'end'),
          ],
          updatedAt: new Date().toISOString(),
        };

        const result = validateGraphState(graph);

        expect(result.ok).toBe(false);
        expect(result.errors.some(e => e.includes('Execution cycle detected'))).toBe(true);
      });

      it('должен принимать DAG без циклов', () => {
        const graph: GraphState = {
          id: 'graph-1',
          name: 'DAG',
          language: 'cpp',
          displayLanguage: 'ru',
          nodes: [
            createNode('start', 'Start'),
            createNode('a', 'Function', 'A'),
            createNode('b', 'Function', 'B'),
            createNode('c', 'Function', 'C'),
            createNode('end', 'End'),
          ],
          edges: [
            createEdge('e1', 'start', 'a'),
            createEdge('e2', 'start', 'b'),
            createEdge('e3', 'a', 'c'),
            createEdge('e4', 'b', 'c'),
            createEdge('e5', 'c', 'end'),
          ],
          updatedAt: new Date().toISOString(),
        };

        const result = validateGraphState(graph);

        expect(result.ok).toBe(true);
        expect(result.errors.filter(e => e.includes('cycle'))).toHaveLength(0);
      });
    });

    describe('issues (детальные проблемы)', () => {
      it('должен содержать nodes в issues при ошибках узлов', () => {
        const graph: GraphState = {
          id: 'graph-1',
          name: 'Issues Test',
          language: 'cpp',
          displayLanguage: 'ru',
          nodes: [
            createNode('start1', 'Start'),
            createNode('start2', 'Start'),
            createNode('end', 'End'),
          ],
          edges: [
            createEdge('e1', 'start1', 'end'),
          ],
          updatedAt: new Date().toISOString(),
        };

        const result = validateGraphState(graph);

        const multiStartIssue = result.issues?.find(i => i.message.includes('Only one Start'));
        expect(multiStartIssue).toBeDefined();
        expect(multiStartIssue?.nodes).toContain('start1');
        expect(multiStartIssue?.nodes).toContain('start2');
      });

      it('должен содержать edges в issues при ошибках связей', () => {
        const graph: GraphState = {
          id: 'graph-1',
          name: 'Edge Issues Test',
          language: 'cpp',
          displayLanguage: 'ru',
          nodes: [
            createNode('start', 'Start'),
            createNode('func', 'Function'),
            createNode('end', 'End'),
          ],
          edges: [
            createEdge('e1', 'start', 'func'),
            createEdge('self-loop', 'func', 'func'),
            createEdge('e3', 'func', 'end'),
          ],
          updatedAt: new Date().toISOString(),
        };

        const result = validateGraphState(graph);

        const selfLoopIssue = result.issues?.find(i => i.message.includes('self-loop'));
        expect(selfLoopIssue).toBeDefined();
        expect(selfLoopIssue?.edges).toContain('self-loop');
      });

      it('должен разделять errors и warnings в issues', () => {
        const graph: GraphState = {
          id: 'graph-1',
          name: 'Mixed Issues',
          language: 'cpp',
          displayLanguage: 'ru',
          nodes: [
            createNode('start', 'Start'),
            createNode('func', 'Function'),
            createNode('end', 'End', 'Конец'),
          ],
          edges: [
            createEdge('e1', 'start', 'func'),
            createEdge('e2', 'start', 'func'), // Duplicate - warning
            // Нет связи к end - warning
          ],
          updatedAt: new Date().toISOString(),
        };

        const result = validateGraphState(graph);

        const errorIssues = result.issues?.filter(i => i.severity === 'error') ?? [];
        const warningIssues = result.issues?.filter(i => i.severity === 'warning') ?? [];

        expect(errorIssues.length).toBeGreaterThan(0);
        expect(warningIssues.length).toBeGreaterThan(0);
      });
    });

    describe('edge kind по умолчанию', () => {
      it('должен трактовать undefined kind как execution', () => {
        const graph: GraphState = {
          id: 'graph-1',
          name: 'Default Kind',
          language: 'cpp',
          displayLanguage: 'ru',
          nodes: [
            createNode('start', 'Start'),
            createNode('func', 'Function'),
            createNode('end', 'End'),
          ],
          edges: [
            { id: 'e1', source: 'start', target: 'func' }, // kind не указан
            { id: 'e2', source: 'func', target: 'end' },
          ],
          updatedAt: new Date().toISOString(),
        };

        const result = validateGraphState(graph);

        expect(result.ok).toBe(true);
      });

      it('должен учитывать разные handle как разные связи при поиске дублей', () => {
        const graph: GraphState = {
          id: 'graph-1',
          name: 'Handle duplicates',
          language: 'cpp',
          displayLanguage: 'ru',
          nodes: [
            createNode('start', 'Start'),
            createNode('func', 'Function'),
            createNode('end', 'End'),
          ],
          edges: [
            {
              id: 'e1',
              source: 'start',
              target: 'func',
              kind: 'execution',
              blueprintEdge: {
                id: 'e1',
                sourceNode: 'start',
                sourcePort: 'exec-out-a',
                targetNode: 'func',
                targetPort: 'exec-in',
                kind: 'execution',
              },
            },
            {
              id: 'e2',
              source: 'start',
              target: 'func',
              kind: 'execution',
              blueprintEdge: {
                id: 'e2',
                sourceNode: 'start',
                sourcePort: 'exec-out-b',
                targetNode: 'func',
                targetPort: 'exec-in',
                kind: 'execution',
              },
            },
            createEdge('e3', 'func', 'end'),
          ],
          updatedAt: new Date().toISOString(),
        };

        const result = validateGraphState(graph);
        expect(result.warnings.some(w => w.includes('Duplicate edge start -> func'))).toBe(false);
      });
    });
  });
});
