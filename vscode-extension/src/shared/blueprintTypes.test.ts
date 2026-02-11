/**
 * Тесты для blueprintTypes.ts - пользовательские функции Blueprint-style
 */

import { describe, it, expect } from 'vitest';
import {
  createUserFunction,
  addFunctionInputParameter,
  addFunctionOutputParameter,
  removeFunctionParameter,
  createCallUserFunctionNode,
  updateCallNodesForFunction,
  getFunctionById,
  getActiveGraph,
  setActiveGraph,
  createNode,
  createEdge,
  createDefaultBlueprintState,
  migrateToBlueprintFormat,
  migrateFromBlueprintFormat,
  getNodesByCategory,
  NODE_TYPE_DEFINITIONS,
  NODE_CATEGORIES,
  BlueprintGraphState,
} from './blueprintTypes';
import type { GraphState } from './graphState';

describe('blueprintTypes - User Functions', () => {
  describe('createUserFunction', () => {
    it('should create a new function with entry and return nodes', () => {
      const func = createUserFunction('myFunc', 'Моя функция', 'Test description');
      
      expect(func.name).toBe('myFunc');
      expect(func.nameRu).toBe('Моя функция');
      expect(func.description).toBe('Test description');
      expect(func.parameters).toEqual([]);
      expect(func.isPure).toBe(false);
      expect(func.id).toMatch(/^func-/);
      expect(func.createdAt).toBeDefined();
      expect(func.updatedAt).toBeDefined();
    });

    it('should create function graph with FunctionEntry and FunctionReturn nodes', () => {
      const func = createUserFunction('test', 'Тест');
      
      expect(func.graph.nodes).toHaveLength(2);
      
      const entryNode = func.graph.nodes.find(n => n.type === 'FunctionEntry');
      const returnNode = func.graph.nodes.find(n => n.type === 'FunctionReturn');
      
      expect(entryNode).toBeDefined();
      expect(returnNode).toBeDefined();
      expect(entryNode!.label).toBe('test');
      expect(returnNode!.label).toBe('Return');
    });

    it('should connect entry and return nodes with execution edge', () => {
      const func = createUserFunction('connected', 'Соединённая');
      
      expect(func.graph.edges).toHaveLength(1);
      
      const edge = func.graph.edges[0];
      expect(edge.kind).toBe('execution');
    });

    it('should set functionId in node properties', () => {
      const func = createUserFunction('withProps', 'С пропсами');
      
      const entryNode = func.graph.nodes.find(n => n.type === 'FunctionEntry');
      const returnNode = func.graph.nodes.find(n => n.type === 'FunctionReturn');
      
      expect(entryNode!.properties?.functionId).toBe(func.id);
      expect(returnNode!.properties?.functionId).toBe(func.id);
    });

    it('should handle function without description', () => {
      const func = createUserFunction('noDesc', 'Без описания');
      
      expect(func.description).toBeUndefined();
    });
  });

  describe('addFunctionInputParameter', () => {
    it('should add input parameter to function', () => {
      const func = createUserFunction('test', 'Тест');
      const updated = addFunctionInputParameter(func, 'count', 'Количество', 'int32', 0);
      
      expect(updated.parameters).toHaveLength(1);
      expect(updated.parameters[0]).toMatchObject({
        name: 'count',
        nameRu: 'Количество',
        dataType: 'int32',
        direction: 'input',
        defaultValue: 0,
      });
    });

    it('should add output port to FunctionEntry node', () => {
      const func = createUserFunction('test', 'Тест');
      const updated = addFunctionInputParameter(func, 'value', 'Значение', 'float');
      
      const entryNode = updated.graph.nodes.find(n => n.type === 'FunctionEntry');
      // Entry node has exec-out + new parameter output
      expect(entryNode!.outputs.length).toBeGreaterThan(1);
      
      const paramPort = entryNode!.outputs.find(p => p.name === 'Значение');
      expect(paramPort).toBeDefined();
      expect(paramPort!.dataType).toBe('float');
    });

    it('should update updatedAt timestamp', () => {
      const func = createUserFunction('test', 'Тест');
      const originalTime = func.updatedAt;
      
      // Функция addFunctionInputParameter всегда создаёт новый updatedAt
      const updated = addFunctionInputParameter(func, 'x', 'X', 'int32');
      
      // updatedAt должен быть установлен (не проверяем отличие из-за скорости выполнения)
      expect(updated.updatedAt).toBeDefined();
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(originalTime).getTime()
      );
    });

    it('should handle multiple input parameters', () => {
      let func = createUserFunction('multi', 'Много');
      func = addFunctionInputParameter(func, 'a', 'A', 'int32');
      func = addFunctionInputParameter(func, 'b', 'B', 'float');
      func = addFunctionInputParameter(func, 'c', 'C', 'string');
      
      expect(func.parameters).toHaveLength(3);
      expect(func.parameters.map(p => p.name)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('addFunctionOutputParameter', () => {
    it('should add output parameter to function', () => {
      const func = createUserFunction('test', 'Тест');
      const updated = addFunctionOutputParameter(func, 'result', 'Результат', 'int32');
      
      expect(updated.parameters).toHaveLength(1);
      expect(updated.parameters[0]).toMatchObject({
        name: 'result',
        nameRu: 'Результат',
        dataType: 'int32',
        direction: 'output',
      });
    });

    it('should add input port to FunctionReturn node', () => {
      const func = createUserFunction('test', 'Тест');
      const updated = addFunctionOutputParameter(func, 'out', 'Выход', 'bool');
      
      const returnNode = updated.graph.nodes.find(n => n.type === 'FunctionReturn');
      // Return node has exec-in + new parameter input
      expect(returnNode!.inputs.length).toBeGreaterThan(1);
      
      const paramPort = returnNode!.inputs.find(p => p.name === 'Выход');
      expect(paramPort).toBeDefined();
      expect(paramPort!.dataType).toBe('bool');
    });

    it('should handle mixed input and output parameters', () => {
      let func = createUserFunction('mixed', 'Смешанная');
      func = addFunctionInputParameter(func, 'in1', 'Вход1', 'int32');
      func = addFunctionOutputParameter(func, 'out1', 'Выход1', 'float');
      func = addFunctionInputParameter(func, 'in2', 'Вход2', 'string');
      
      expect(func.parameters).toHaveLength(3);
      expect(func.parameters.filter(p => p.direction === 'input')).toHaveLength(2);
      expect(func.parameters.filter(p => p.direction === 'output')).toHaveLength(1);
    });
  });

  describe('removeFunctionParameter', () => {
    it('should remove parameter from function', () => {
      let func = createUserFunction('test', 'Тест');
      func = addFunctionInputParameter(func, 'toRemove', 'Удалить', 'int32');
      const paramId = func.parameters[0].id;
      
      const updated = removeFunctionParameter(func, paramId);
      
      expect(updated.parameters).toHaveLength(0);
    });

    it('should remove corresponding port from entry node', () => {
      let func = createUserFunction('test', 'Тест');
      func = addFunctionInputParameter(func, 'param', 'Параметр', 'float');
      const paramId = func.parameters[0].id;
      
      const entryBefore = func.graph.nodes.find(n => n.type === 'FunctionEntry');
      const portCountBefore = entryBefore!.outputs.length;
      
      const updated = removeFunctionParameter(func, paramId);
      const entryAfter = updated.graph.nodes.find(n => n.type === 'FunctionEntry');
      
      expect(entryAfter!.outputs.length).toBe(portCountBefore - 1);
    });

    it('should remove corresponding port from return node', () => {
      let func = createUserFunction('test', 'Тест');
      func = addFunctionOutputParameter(func, 'result', 'Результат', 'int32');
      const paramId = func.parameters[0].id;
      
      const returnBefore = func.graph.nodes.find(n => n.type === 'FunctionReturn');
      const portCountBefore = returnBefore!.inputs.length;
      
      const updated = removeFunctionParameter(func, paramId);
      const returnAfter = updated.graph.nodes.find(n => n.type === 'FunctionReturn');
      
      expect(returnAfter!.inputs.length).toBe(portCountBefore - 1);
    });

    it('should return unchanged function if parameter not found', () => {
      const func = createUserFunction('test', 'Тест');
      const updated = removeFunctionParameter(func, 'non-existent-id');
      
      expect(updated).toBe(func);
    });

    it('should reindex remaining ports after removal', () => {
      let func = createUserFunction('test', 'Тест');
      func = addFunctionInputParameter(func, 'first', 'Первый', 'int32');
      func = addFunctionInputParameter(func, 'second', 'Второй', 'float');
      func = addFunctionInputParameter(func, 'third', 'Третий', 'string');
      
      const firstId = func.parameters[0].id;
      const updated = removeFunctionParameter(func, firstId);
      
      expect(updated.parameters).toHaveLength(2);
      expect(updated.parameters[0].name).toBe('second');
      expect(updated.parameters[1].name).toBe('third');
    });
  });

  describe('createCallUserFunctionNode', () => {
    it('should create call node with correct label', () => {
      const func = createUserFunction('calculate', 'Вычислить');
      const node = createCallUserFunctionNode(func, { x: 100, y: 200 });
      
      expect(node.label).toBe('Вычислить');
      expect(node.type).toBe('CallUserFunction');
      expect(node.position).toEqual({ x: 100, y: 200 });
    });

    it('should have execution ports', () => {
      const func = createUserFunction('test', 'Тест');
      const node = createCallUserFunctionNode(func, { x: 0, y: 0 });
      
      const execIn = node.inputs.find(p => p.dataType === 'execution');
      const execOut = node.outputs.find(p => p.dataType === 'execution');
      
      expect(execIn).toBeDefined();
      expect(execOut).toBeDefined();
    });

    it('should add input ports for function input parameters', () => {
      let func = createUserFunction('withInputs', 'С входами');
      func = addFunctionInputParameter(func, 'a', 'A', 'int32', 5);
      func = addFunctionInputParameter(func, 'b', 'B', 'float');
      
      const node = createCallUserFunctionNode(func, { x: 0, y: 0 });
      
      // exec-in + 2 input params
      expect(node.inputs.length).toBe(3);
      
      const paramA = node.inputs.find(p => p.name === 'A');
      const paramB = node.inputs.find(p => p.name === 'B');
      
      expect(paramA).toBeDefined();
      expect(paramA!.dataType).toBe('int32');
      expect(paramB).toBeDefined();
      expect(paramB!.dataType).toBe('float');
    });

    it('should add output ports for function output parameters', () => {
      let func = createUserFunction('withOutputs', 'С выходами');
      func = addFunctionOutputParameter(func, 'result', 'Результат', 'bool');
      
      const node = createCallUserFunctionNode(func, { x: 0, y: 0 });
      
      // exec-out + 1 output param
      expect(node.outputs.length).toBe(2);
      
      const resultPort = node.outputs.find(p => p.name === 'Результат');
      expect(resultPort).toBeDefined();
      expect(resultPort!.dataType).toBe('bool');
    });

    it('should store functionId in properties', () => {
      const func = createUserFunction('referenced', 'Ссылка');
      const node = createCallUserFunctionNode(func, { x: 0, y: 0 });
      
      expect(node.properties?.functionId).toBe(func.id);
      expect(node.properties?.functionName).toBe('referenced');
    });
  });

  describe('updateCallNodesForFunction', () => {
    it('should update call nodes when function signature changes', () => {
      const func = createUserFunction('updateMe', 'Обнови меня');
      const callNode = createCallUserFunctionNode(func, { x: 50, y: 50 });
      
      const graphState: BlueprintGraphState = {
        id: 'graph-1',
        name: 'Test Graph',
        language: 'cpp',
        displayLanguage: 'ru',
        nodes: [callNode],
        edges: [],
        updatedAt: new Date().toISOString(),
        functions: [func],
      };
      
      // Add parameter to function
      const updatedFunc = addFunctionInputParameter(func, 'newParam', 'Новый', 'string');
      
      const updatedState = updateCallNodesForFunction(graphState, updatedFunc);
      const updatedCallNode = updatedState.nodes[0];
      
      // Should have new input port
      const newPort = updatedCallNode.inputs.find(p => p.name === 'Новый');
      expect(newPort).toBeDefined();
    });

    it('should preserve node position', () => {
      const func = createUserFunction('preserve', 'Сохрани');
      const callNode = createCallUserFunctionNode(func, { x: 123, y: 456 });
      
      const graphState: BlueprintGraphState = {
        id: 'graph-1',
        name: 'Test',
        language: 'cpp',
        displayLanguage: 'ru',
        nodes: [callNode],
        edges: [],
        updatedAt: new Date().toISOString(),
        functions: [func],
      };
      
      const updatedFunc = addFunctionInputParameter(func, 'x', 'X', 'int32');
      const updatedState = updateCallNodesForFunction(graphState, updatedFunc);
      
      expect(updatedState.nodes[0].position).toEqual({ x: 123, y: 456 });
    });

    it('should preserve node id', () => {
      const func = createUserFunction('keepId', 'Сохрани ID');
      const callNode = createCallUserFunctionNode(func, { x: 0, y: 0 });
      const originalId = callNode.id;
      
      const graphState: BlueprintGraphState = {
        id: 'graph-1',
        name: 'Test',
        language: 'cpp',
        displayLanguage: 'ru',
        nodes: [callNode],
        edges: [],
        updatedAt: new Date().toISOString(),
        functions: [func],
      };
      
      const updatedFunc = addFunctionOutputParameter(func, 'out', 'Выход', 'float');
      const updatedState = updateCallNodesForFunction(graphState, updatedFunc);
      
      expect(updatedState.nodes[0].id).toBe(originalId);
    });

    it('should not modify nodes that are not call nodes for this function', () => {
      const func1 = createUserFunction('func1', 'Функция 1');
      const func2 = createUserFunction('func2', 'Функция 2');
      
      const callNode1 = createCallUserFunctionNode(func1, { x: 0, y: 0 });
      const callNode2 = createCallUserFunctionNode(func2, { x: 100, y: 0 });
      
      const graphState: BlueprintGraphState = {
        id: 'graph-1',
        name: 'Test',
        language: 'cpp',
        displayLanguage: 'ru',
        nodes: [callNode1, callNode2],
        edges: [],
        updatedAt: new Date().toISOString(),
        functions: [func1, func2],
      };
      
      const updatedFunc1 = addFunctionInputParameter(func1, 'param', 'Параметр', 'int32');
      const updatedState = updateCallNodesForFunction(graphState, updatedFunc1);
      
      // func2's call node should remain unchanged
      const func2Node = updatedState.nodes.find(n => n.properties?.functionId === func2.id);
      expect(func2Node!.inputs.length).toBe(callNode2.inputs.length);
    });
  });

  describe('getFunctionById', () => {
    it('should return function by id', () => {
      const func = createUserFunction('findMe', 'Найди меня');
      const graphState: BlueprintGraphState = {
        id: 'graph-1',
        name: 'Test',
        language: 'cpp',
        displayLanguage: 'ru',
        nodes: [],
        edges: [],
        updatedAt: new Date().toISOString(),
        functions: [func],
      };
      
      const found = getFunctionById(graphState, func.id);
      expect(found).toBe(func);
    });

    it('should return undefined if function not found', () => {
      const graphState: BlueprintGraphState = {
        id: 'graph-1',
        name: 'Test',
        language: 'cpp',
        displayLanguage: 'ru',
        nodes: [],
        edges: [],
        updatedAt: new Date().toISOString(),
        functions: [],
      };
      
      const found = getFunctionById(graphState, 'non-existent');
      expect(found).toBeUndefined();
    });

    it('should return undefined if functions array is undefined', () => {
      const graphState: BlueprintGraphState = {
        id: 'graph-1',
        name: 'Test',
        language: 'cpp',
        displayLanguage: 'ru',
        nodes: [],
        edges: [],
        updatedAt: new Date().toISOString(),
      };
      
      const found = getFunctionById(graphState, 'any-id');
      expect(found).toBeUndefined();
    });
  });

  describe('getActiveGraph', () => {
    it('should return main graph when no function is active', () => {
      const graphState: BlueprintGraphState = {
        id: 'graph-1',
        name: 'Test',
        language: 'cpp',
        displayLanguage: 'ru',
        nodes: [createNode('Start', { x: 0, y: 0 })],
        edges: [],
        updatedAt: new Date().toISOString(),
        activeFunctionId: null,
      };
      
      const active = getActiveGraph(graphState);
      expect(active.nodes).toBe(graphState.nodes);
      expect(active.edges).toBe(graphState.edges);
    });

    it('should return function graph when function is active', () => {
      const func = createUserFunction('active', 'Активная');
      const graphState: BlueprintGraphState = {
        id: 'graph-1',
        name: 'Test',
        language: 'cpp',
        displayLanguage: 'ru',
        nodes: [],
        edges: [],
        updatedAt: new Date().toISOString(),
        functions: [func],
        activeFunctionId: func.id,
      };
      
      const active = getActiveGraph(graphState);
      expect(active.nodes).toBe(func.graph.nodes);
      expect(active.edges).toBe(func.graph.edges);
    });

    it('should return main graph if active function not found', () => {
      const graphState: BlueprintGraphState = {
        id: 'graph-1',
        name: 'Test',
        language: 'cpp',
        displayLanguage: 'ru',
        nodes: [createNode('End', { x: 0, y: 0 })],
        edges: [],
        updatedAt: new Date().toISOString(),
        functions: [],
        activeFunctionId: 'non-existent',
      };
      
      const active = getActiveGraph(graphState);
      expect(active.nodes).toBe(graphState.nodes);
    });
  });

  describe('setActiveGraph', () => {
    it('should set active function id', () => {
      const graphState: BlueprintGraphState = {
        id: 'graph-1',
        name: 'Test',
        language: 'cpp',
        displayLanguage: 'ru',
        nodes: [],
        edges: [],
        updatedAt: new Date().toISOString(),
      };
      
      const updated = setActiveGraph(graphState, 'func-123');
      expect(updated.activeFunctionId).toBe('func-123');
    });

    it('should set to null to return to main graph', () => {
      const graphState: BlueprintGraphState = {
        id: 'graph-1',
        name: 'Test',
        language: 'cpp',
        displayLanguage: 'ru',
        nodes: [],
        edges: [],
        updatedAt: new Date().toISOString(),
        activeFunctionId: 'func-123',
      };
      
      const updated = setActiveGraph(graphState, null);
      expect(updated.activeFunctionId).toBeNull();
    });
  });
});

describe('blueprintTypes - Node Creation', () => {
  describe('createNode', () => {
    it('should create node with correct type and position', () => {
      const node = createNode('Branch', { x: 100, y: 200 });
      
      expect(node.type).toBe('Branch');
      expect(node.position).toEqual({ x: 100, y: 200 });
      // label заполняется на уровне UI в BlueprintNode в зависимости от локали.
      expect(node.label).toBe('');
    });

    it('should keep label empty by contract for UI-level localization', () => {
      const nodeTypes = ['Start', 'Branch', 'Print'] as const;

      nodeTypes.forEach((nodeType) => {
        const node = createNode(nodeType, { x: 0, y: 0 });
        // createNode не назначает текстовую метку: UI сам берёт label/labelRu из дефиниций узла.
        expect(node.label).toBe('');
      });
    });

    it('should generate unique id if not provided', () => {
      const node1 = createNode('Start', { x: 0, y: 0 });
      const node2 = createNode('Start', { x: 0, y: 0 });
      
      expect(node1.id).not.toBe(node2.id);
    });

    it('should use provided id', () => {
      const node = createNode('End', { x: 0, y: 0 }, 'custom-id');
      expect(node.id).toBe('custom-id');
    });

    it('should create inputs and outputs from definition', () => {
      const node = createNode('Branch', { x: 0, y: 0 });
      
      // Branch has: exec-in, condition (inputs) and true, false (outputs)
      expect(node.inputs.length).toBeGreaterThan(0);
      expect(node.outputs.length).toBeGreaterThan(0);
      
      const conditionInput = node.inputs.find(p => p.name === 'Condition');
      expect(conditionInput).toBeDefined();
      expect(conditionInput!.dataType).toBe('bool');
    });

    it('should prefix port ids with node id', () => {
      const node = createNode('Print', { x: 0, y: 0 }, 'print-1');
      
      node.inputs.forEach(input => {
        expect(input.id).toContain('print-1');
      });
      node.outputs.forEach(output => {
        expect(output.id).toContain('print-1');
      });
    });
  });

  describe('createEdge', () => {
    it('should create execution edge', () => {
      const edge = createEdge('node1', 'port1', 'node2', 'port2', 'execution');
      
      expect(edge.sourceNode).toBe('node1');
      expect(edge.sourcePort).toBe('port1');
      expect(edge.targetNode).toBe('node2');
      expect(edge.targetPort).toBe('port2');
      expect(edge.kind).toBe('execution');
    });

    it('should create data edge', () => {
      const edge = createEdge('node1', 'out', 'node2', 'in', 'int32');
      
      expect(edge.kind).toBe('data');
      expect(edge.dataType).toBe('int32');
    });

    it('should generate unique id', () => {
      const edge1 = createEdge('a', 'b', 'c', 'd');
      const edge2 = createEdge('a', 'b', 'c', 'd');
      
      expect(edge1.id).not.toBe(edge2.id);
    });
  });

  describe('createDefaultBlueprintState', () => {
    it('should create state with Start, Print, and End nodes', () => {
      const state = createDefaultBlueprintState();
      
      expect(state.nodes).toHaveLength(3);
      
      const types = state.nodes.map(n => n.type);
      expect(types).toContain('Start');
      expect(types).toContain('Print');
      expect(types).toContain('End');
    });

    it('should have edges connecting the nodes', () => {
      const state = createDefaultBlueprintState();
      
      expect(state.edges).toHaveLength(2);
    });

    it('should set Russian as default display language', () => {
      const state = createDefaultBlueprintState();
      
      expect(state.displayLanguage).toBe('ru');
      expect(state.name).toBe('Новый граф');
    });

    it('should set cpp as default language', () => {
      const state = createDefaultBlueprintState();
      
      expect(state.language).toBe('cpp');
    });
  });
});

describe('blueprintTypes - Migration', () => {
  describe('migrateToBlueprintFormat', () => {
    it('should convert old GraphState to BlueprintGraphState', () => {
      const oldState: GraphState = {
        id: 'old-1',
        name: 'Old Graph',
        language: 'cpp',
        displayLanguage: 'ru',
        nodes: [
          { id: 'n1', label: 'Start', type: 'Start', position: { x: 0, y: 0 } },
          { id: 'n2', label: 'End', type: 'End', position: { x: 100, y: 0 } },
        ],
        edges: [
          { id: 'e1', source: 'n1', target: 'n2', label: 'flow', kind: 'execution' },
        ],
        updatedAt: '2024-01-01',
      };
      
      const newState = migrateToBlueprintFormat(oldState);
      
      expect(newState.id).toBe('old-1');
      expect(newState.name).toBe('Old Graph');
      expect(newState.nodes).toHaveLength(2);
      expect(newState.edges).toHaveLength(1);
    });

    it('should handle empty nodes and edges', () => {
      const oldState: GraphState = {
        id: 'empty',
        name: 'Empty',
        language: 'cpp',
        displayLanguage: 'en',
        nodes: [],
        edges: [],
        updatedAt: '2024-01-01',
      };
      
      const newState = migrateToBlueprintFormat(oldState);
      
      expect(newState.nodes).toHaveLength(0);
      expect(newState.edges).toHaveLength(0);
    });

    it('should map old node types correctly', () => {
      // Тест намеренно использует невалидный тип для проверки миграции
      const oldState = {
        id: 'types',
        name: 'Types Test',
        language: 'cpp' as const,
        displayLanguage: 'ru' as const,
        nodes: [
          { id: 'n1', label: 'Start', type: 'Start' as const, position: { x: 0, y: 0 } },
          { id: 'n2', label: 'Func', type: 'Function' as const, position: { x: 100, y: 0 } },
          { id: 'n3', label: 'Var', type: 'Variable' as const, position: { x: 200, y: 0 } },
          { id: 'n4', label: 'Unknown', type: 'SomethingElse' as const, position: { x: 300, y: 0 } },
        ],
        edges: [],
        updatedAt: '2024-01-01',
      } as GraphState;
      
      const newState = migrateToBlueprintFormat(oldState);
      
      expect(newState.nodes[0].type).toBe('Start');
      expect(newState.nodes[1].type).toBe('Function');
      expect(newState.nodes[2].type).toBe('Variable');
      expect(newState.nodes[3].type).toBe('Custom'); // Unknown maps to Custom
    });
  });

  describe('migrateFromBlueprintFormat', () => {
    it('should convert BlueprintGraphState back to GraphState', () => {
      const blueprintState = createDefaultBlueprintState();
      const oldState = migrateFromBlueprintFormat(blueprintState);
      
      expect(oldState.id).toBe(blueprintState.id);
      expect(oldState.name).toBe(blueprintState.name);
      expect(oldState.nodes).toHaveLength(blueprintState.nodes.length);
      expect(oldState.edges).toHaveLength(blueprintState.edges.length);
    });

    it('should map Blueprint types to old format', () => {
      const blueprintState: BlueprintGraphState = {
        id: 'bp-1',
        name: 'Blueprint',
        language: 'cpp',
        displayLanguage: 'ru',
        nodes: [
          createNode('Start', { x: 0, y: 0 }),
          createNode('Branch', { x: 100, y: 0 }),
          createNode('FunctionCall', { x: 200, y: 0 }),
          createNode('SetVariable', { x: 300, y: 0 }),
        ],
        edges: [],
        updatedAt: '2024-01-01',
      };
      
      const oldState = migrateFromBlueprintFormat(blueprintState);
      
      expect(oldState.nodes[0].type).toBe('Start');
      expect(oldState.nodes[1].type).toBe('Custom'); // Branch -> Custom
      expect(oldState.nodes[2].type).toBe('Function'); // FunctionCall -> Function
      expect(oldState.nodes[3].type).toBe('Variable'); // SetVariable -> Variable
    });
  });

  it('should preserve Get/Set variable node metadata through round-trip migration', () => {
    const getNode = createNode('GetVariable', { x: 40, y: 60 }, 'get-var-1');
    const setNode = createNode('SetVariable', { x: 280, y: 60 }, 'set-var-1');

    getNode.properties = {
      variableId: 'var-health',
      dataType: 'float',
      defaultValue: 10.5,
      color: '#8BC34A',
      name: 'health',
      nameRu: 'Здоровье',
    };
    setNode.properties = {
      variableId: 'var-health',
      dataType: 'float',
      defaultValue: 10.5,
      inputValue: 12.5,
      inputValueIsOverride: true,
      color: '#8BC34A',
      name: 'health',
      nameRu: 'Здоровье',
    };

    getNode.outputs = getNode.outputs.map((port) =>
      port.id.endsWith('value-out') ? { ...port, dataType: 'float' } : port
    );
    setNode.inputs = setNode.inputs.map((port) =>
      port.id.endsWith('value-in') ? { ...port, dataType: 'float' } : port
    );
    setNode.outputs = setNode.outputs.map((port) =>
      port.id.endsWith('value-out') ? { ...port, dataType: 'float' } : port
    );

    const blueprintState: BlueprintGraphState = {
      id: 'bp-vars-roundtrip',
      name: 'Vars Roundtrip',
      language: 'cpp',
      displayLanguage: 'ru',
      nodes: [getNode, setNode],
      edges: [
        {
          id: 'edge-var-1',
          sourceNode: getNode.id,
          sourcePort: `${getNode.id}-value-out`,
          targetNode: setNode.id,
          targetPort: `${setNode.id}-value-in`,
          kind: 'data',
          dataType: 'float',
        },
      ],
      updatedAt: '2024-01-01',
    };

    const oldState = migrateFromBlueprintFormat(blueprintState);
    expect(oldState.nodes[0].blueprintNode).toBeDefined();
    expect(oldState.edges[0].blueprintEdge).toBeDefined();

    const restored = migrateToBlueprintFormat(oldState);
    const restoredGet = restored.nodes.find((node) => node.id === getNode.id);
    const restoredSet = restored.nodes.find((node) => node.id === setNode.id);

    expect(restoredGet?.type).toBe('GetVariable');
    expect(restoredSet?.type).toBe('SetVariable');
    expect(restoredGet?.properties).toMatchObject({
      variableId: 'var-health',
      dataType: 'float',
      defaultValue: 10.5,
      color: '#8BC34A',
      name: 'health',
      nameRu: 'Здоровье',
    });
    expect(restoredSet?.properties).toMatchObject({
      variableId: 'var-health',
      dataType: 'float',
      defaultValue: 10.5,
      inputValue: 12.5,
      inputValueIsOverride: true,
      color: '#8BC34A',
      name: 'health',
      nameRu: 'Здоровье',
    });
    expect(restoredGet?.outputs.find((port) => port.id.endsWith('value-out'))?.dataType).toBe('float');
    expect(restoredSet?.inputs.find((port) => port.id.endsWith('value-in'))?.dataType).toBe('float');
    expect(restoredSet?.outputs.find((port) => port.id.endsWith('value-out'))?.dataType).toBe('float');
  });

  it('should preserve variable edge ports through round-trip migration', () => {
    const blueprintState: BlueprintGraphState = {
      id: 'bp-edge-roundtrip',
      name: 'Edge Roundtrip',
      language: 'cpp',
      displayLanguage: 'ru',
      nodes: [
        createNode('GetVariable', { x: 20, y: 20 }, 'get-edge-var'),
        createNode('SetVariable', { x: 240, y: 20 }, 'set-edge-var'),
      ],
      edges: [
        {
          id: 'edge-roundtrip',
          sourceNode: 'get-edge-var',
          sourcePort: 'get-edge-var-value-out',
          targetNode: 'set-edge-var',
          targetPort: 'set-edge-var-value-in',
          kind: 'data',
          dataType: 'float',
        },
      ],
      updatedAt: '2024-01-01',
    };

    const restored = migrateToBlueprintFormat(migrateFromBlueprintFormat(blueprintState));
    const edge = restored.edges.find((item) => item.id === 'edge-roundtrip');

    expect(edge).toMatchObject({
      sourceNode: 'get-edge-var',
      sourcePort: 'get-edge-var-value-out',
      targetNode: 'set-edge-var',
      targetPort: 'set-edge-var-value-in',
      kind: 'data',
      dataType: 'float',
    });
  });

  it('should keep backward compatibility for legacy GraphState without embedded snapshots', () => {
    const oldState: GraphState = {
      id: 'legacy-graph',
      name: 'Legacy',
      language: 'cpp',
      displayLanguage: 'ru',
      nodes: [
        {
          id: 'legacy-var',
          label: 'Legacy Variable',
          type: 'Variable',
          position: { x: 120, y: 90 },
        },
      ],
      edges: [
        {
          id: 'legacy-edge',
          source: 'legacy-var',
          target: 'legacy-var',
          kind: 'data',
          label: 'data',
        },
      ],
      updatedAt: '2024-01-01',
    };

    const migrated = migrateToBlueprintFormat(oldState);
    expect(migrated.nodes[0].type).toBe('Variable');
    expect(migrated.nodes[0].outputs[0].dataType).toBe('any');
    expect(migrated.edges[0].sourcePort).toBe('value');
    expect(migrated.edges[0].targetPort).toBe('value-in');
  });

  it('should normalize legacy execution handles to real node ports', () => {
    const oldState: GraphState = {
      id: 'legacy-exec-ports',
      name: 'Legacy Exec Ports',
      language: 'cpp',
      displayLanguage: 'ru',
      nodes: [
        { id: 'legacy-start', label: 'Start', type: 'Start', position: { x: 0, y: 0 } },
        { id: 'legacy-end', label: 'End', type: 'End', position: { x: 240, y: 0 } },
      ],
      edges: [
        {
          id: 'legacy-exec-edge',
          source: 'legacy-start',
          target: 'legacy-end',
          kind: 'execution',
          label: 'flow',
        },
      ],
      updatedAt: '2024-01-01',
    };

    const migrated = migrateToBlueprintFormat(oldState);
    expect(migrated.edges[0]).toMatchObject({
      sourcePort: 'exec-out',
      targetPort: 'exec-in',
      kind: 'execution',
    });
  });

  it('should remove exact duplicate legacy edges during migration', () => {
    const oldState: GraphState = {
      id: 'legacy-duplicate-edges',
      name: 'Legacy Duplicates',
      language: 'cpp',
      displayLanguage: 'ru',
      nodes: [
        { id: 'start', label: 'Start', type: 'Start', position: { x: 0, y: 0 } },
        { id: 'end', label: 'End', type: 'End', position: { x: 240, y: 0 } },
      ],
      edges: [
        { id: 'dup-1', source: 'start', target: 'end', kind: 'execution' },
        { id: 'dup-2', source: 'start', target: 'end', kind: 'execution' },
      ],
      updatedAt: '2024-01-01',
    };

    const migrated = migrateToBlueprintFormat(oldState);
    expect(migrated.edges).toHaveLength(1);
    expect(migrated.edges[0].id).toBe('dup-1');
  });
});

describe('blueprintTypes - Node Definitions', () => {
  describe('NODE_TYPE_DEFINITIONS', () => {
    it('should define all node types', () => {
      const expectedTypes = [
        'Start', 'End', 'Branch', 'ForLoop', 'WhileLoop', 'Sequence',
        'Function', 'FunctionCall', 'Event',
        'Variable', 'GetVariable', 'SetVariable',
        'Add', 'Subtract', 'Multiply', 'Divide', 'Modulo',
        'Equal', 'NotEqual', 'Greater', 'Less', 'GreaterEqual', 'LessEqual',
        'And', 'Or', 'Not',
        'Print', 'Input',
        'Comment', 'Reroute', 'Custom',
      ];
      
      expectedTypes.forEach(type => {
        expect(NODE_TYPE_DEFINITIONS[type as keyof typeof NODE_TYPE_DEFINITIONS]).toBeDefined();
      });
    });

    it('should have Russian labels for all types', () => {
      Object.values(NODE_TYPE_DEFINITIONS).forEach(def => {
        expect(def.labelRu).toBeDefined();
        expect(def.labelRu.length).toBeGreaterThan(0);
      });
    });

    it('should have category for all types', () => {
      const validCategories = ['flow', 'function', 'variable', 'math', 'comparison', 'logic', 'io', 'other'];
      
      Object.values(NODE_TYPE_DEFINITIONS).forEach(def => {
        expect(validCategories).toContain(def.category);
      });
    });
  });

  describe('getNodesByCategory', () => {
    it('should return nodes filtered by category', () => {
      const mathNodes = getNodesByCategory('math');
      
      expect(mathNodes.length).toBeGreaterThan(0);
      mathNodes.forEach(node => {
        expect(node.category).toBe('math');
      });
    });

    it('should return empty array for non-existent category', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nodes = getNodesByCategory('non-existent' as any);
      expect(nodes).toHaveLength(0);
    });
  });

  describe('NODE_CATEGORIES', () => {
    it('should have all categories with labels', () => {
      expect(NODE_CATEGORIES.length).toBeGreaterThan(0);
      
      NODE_CATEGORIES.forEach(cat => {
        expect(cat.id).toBeDefined();
        expect(cat.label).toBeDefined();
        expect(cat.labelRu).toBeDefined();
      });
    });

    it('should include flow, function, variable, math, comparison, logic, io, other', () => {
      const ids = NODE_CATEGORIES.map(c => c.id);
      
      expect(ids).toContain('flow');
      expect(ids).toContain('function');
      expect(ids).toContain('variable');
      expect(ids).toContain('math');
      expect(ids).toContain('comparison');
      expect(ids).toContain('logic');
      expect(ids).toContain('io');
      expect(ids).toContain('other');
    });
  });
});
