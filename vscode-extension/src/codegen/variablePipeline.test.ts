/**
 * Тесты полного pipeline: SetVariable/GetVariable
 *
 * Воспроизводит реальный путь данных:
 *   createNode → bindVariableToNode → BlueprintGraphState
 *     → migrateFromBlueprintFormat → JSON round-trip (IPC)
 *     → migrateToBlueprintFormat → CppCodeGenerator.generate
 *
 * Цель: найти точку, в которой type/properties теряются
 * и генерируется «int unnamed = unnamed;» вместо корректного кода.
 */

import { describe, it, expect } from 'vitest';
import {
  createNode,
  createEdge,
  migrateFromBlueprintFormat,
  migrateToBlueprintFormat,
  isEmbeddedBlueprintNode,
  type BlueprintGraphState,
  type BlueprintNode,
  type BlueprintVariable,
} from '../shared/blueprintTypes';
import {
  bindVariableToNode,
  type AvailableVariableBinding,
} from '../webview/variableNodeBinding';
import { CppCodeGenerator } from './CppCodeGenerator';
import { graphStateSchema } from '../shared/messages';

// ─── helpers ──────────────────────────────────────────────────────

const makeVariable = (
  id: string,
  name: string,
  dataType: 'int32' | 'float' | 'string' | 'bool' = 'int32',
  defaultValue: BlueprintVariable['defaultValue'] = 0
): BlueprintVariable => ({
  id,
  name,
  nameRu: name,
  dataType,
  defaultValue,
  category: 'default',
});

/** Конвертация BlueprintVariable → AvailableVariableBinding (то, что делает BlueprintEditor) */
const toBinding = (v: BlueprintVariable): AvailableVariableBinding => ({
  id: v.id,
  name: v.name ?? '',
  nameRu: v.nameRu ?? v.name ?? '',
  dataType: v.dataType,
  isArray: v.isArray === true,
  defaultValue: v.defaultValue,
  color: v.color,
});

const makeGraph = (
  nodes: BlueprintNode[],
  edges: ReturnType<typeof createEdge>[] = [],
  variables: BlueprintVariable[] = []
): BlueprintGraphState => ({
  id: 'test-graph',
  name: 'Test',
  language: 'cpp',
  displayLanguage: 'ru',
  nodes,
  edges,
  updatedAt: new Date().toISOString(),
  dirty: false,
  variables,
});

/** Имитация IPC: JSON serialize → parse */
const simulateIpc = <T>(data: T): T =>
  JSON.parse(JSON.stringify(data)) as T;

/** Имитация Zod-парсинга graphState через IPC */
const simulateZodIpc = <T>(data: T): T => {
  const serialized = JSON.parse(JSON.stringify(data));
  const parsed = graphStateSchema.safeParse(serialized);
  if (!parsed.success) {
    throw new Error(`Zod parse failed: ${parsed.error.message}`);
  }
  return parsed.data as unknown as T;
};

// ─── тесты ────────────────────────────────────────────────────────

describe('Variable Pipeline — полный путь данных', () => {

  // ┌──────────────────────────────────────────────────────────┐
  // │ 1. Создание узла: createNode + bindVariableToNode        │
  // └──────────────────────────────────────────────────────────┘
  describe('Шаг 1: создание и привязка', () => {
    it('createNode("SetVariable") создаёт узел с type=SetVariable и портами', () => {
      const node = createNode('SetVariable', { x: 0, y: 0 }, 'sv1');

      expect(node.type).toBe('SetVariable');
      expect(node.inputs.length).toBeGreaterThanOrEqual(2); // exec-in + value-in
      expect(node.outputs.length).toBeGreaterThanOrEqual(2); // exec-out + value-out
      expect(node.inputs.every(p => typeof p.id === 'string')).toBe(true);
      expect(node.inputs.every(p => typeof p.name === 'string')).toBe(true);
    });

    it('bindVariableToNode устанавливает properties.variableId, name, dataType', () => {
      const node = createNode('SetVariable', { x: 0, y: 0 }, 'sv2');
      const variable = makeVariable('v1', 'Счётчик', 'int32', 42);
      const available = toBinding(variable);
      const bound = bindVariableToNode(node, available, 'ru');

      const props = bound.properties as Record<string, unknown>;
      expect(props.variableId).toBe('v1');
      expect(props.nameRu).toBe('Счётчик');
      expect(props.dataType).toBe('int32');
      expect(props.defaultValue).toBe(42);
      expect(bound.type).toBe('SetVariable');
    });
  });

  // ┌──────────────────────────────────────────────────────────┐
  // │ 2. isEmbeddedBlueprintNode — валидация embedded-данных    │
  // └──────────────────────────────────────────────────────────┘
  describe('Шаг 2: isEmbeddedBlueprintNode', () => {
    it('createNode("SetVariable") проходит isEmbeddedBlueprintNode', () => {
      const node = createNode('SetVariable', { x: 0, y: 0 }, 'sv3');
      expect(isEmbeddedBlueprintNode(node)).toBe(true);
    });

    it('bound SetVariable проходит isEmbeddedBlueprintNode', () => {
      const node = createNode('SetVariable', { x: 0, y: 0 }, 'sv4');
      const variable = makeVariable('v2', 'x', 'float', 3.14);
      const bound = bindVariableToNode(node, toBinding(variable), 'ru');
      expect(isEmbeddedBlueprintNode(bound)).toBe(true);
    });

    it('bound SetVariable проходит isEmbeddedBlueprintNode после JSON round-trip', () => {
      const node = createNode('SetVariable', { x: 0, y: 0 }, 'sv5');
      const variable = makeVariable('v3', 'y', 'int32', 100);
      const bound = bindVariableToNode(node, toBinding(variable), 'ru');
      const roundTripped = simulateIpc(bound);
      expect(isEmbeddedBlueprintNode(roundTripped)).toBe(true);
    });

    it('createNode("GetVariable") проходит isEmbeddedBlueprintNode', () => {
      const node = createNode('GetVariable', { x: 0, y: 0 }, 'gv1');
      expect(isEmbeddedBlueprintNode(node)).toBe(true);
    });
  });

  // ┌──────────────────────────────────────────────────────────┐
  // │ 3. migrateFromBlueprintFormat → GraphState               │
  // └──────────────────────────────────────────────────────────┘
  describe('Шаг 3: migrateFromBlueprintFormat', () => {
    it('SetVariable → GraphNode type="Variable", blueprintNode сохранён', () => {
      const setNode = createNode('SetVariable', { x: 0, y: 0 }, 'sv6');
      setNode.properties = { variableId: 'v1', dataType: 'int32' };
      const graph = makeGraph([setNode]);
      const graphState = migrateFromBlueprintFormat(graph);

      const gsNode = graphState.nodes.find(n => n.id === 'sv6')!;
      expect(gsNode).toBeDefined();
      expect(gsNode.type).toBe('Variable'); // Mapped to old type
      expect(gsNode.blueprintNode).toBeDefined();

      // blueprintNode сохраняет оригинальный тип
      const embedded = gsNode.blueprintNode as BlueprintNode;
      expect(embedded.type).toBe('SetVariable');
      expect((embedded.properties as Record<string, unknown>)?.variableId).toBe('v1');
    });
  });

  // ┌──────────────────────────────────────────────────────────┐
  // │ 4. JSON + Zod round-trip (имитация IPC)                  │
  // └──────────────────────────────────────────────────────────┘
  describe('Шаг 4: Zod IPC round-trip', () => {
    it('blueprintNode сохраняется после Zod-парсинга graphState', () => {
      const setNode = createNode('SetVariable', { x: 0, y: 0 }, 'sv7');
      const variable = makeVariable('v-zod', 'alpha', 'int32', 7);
      const bound = bindVariableToNode(setNode, toBinding(variable), 'ru');
      const graph = makeGraph([bound], [], [variable]);
      const graphState = migrateFromBlueprintFormat(graph);

      // Имитация IPC + Zod
      const afterZod = simulateZodIpc(graphState);

      const gsNode = afterZod.nodes.find(n => n.id === 'sv7')!;
      expect(gsNode).toBeDefined();
      expect(gsNode.blueprintNode).toBeDefined();

      // embedded всё ещё валиден
      expect(isEmbeddedBlueprintNode(gsNode.blueprintNode)).toBe(true);

      const embedded = gsNode.blueprintNode as BlueprintNode;
      expect(embedded.type).toBe('SetVariable');
      expect((embedded.properties as Record<string, unknown>)?.variableId).toBe('v-zod');
    });

    it('variables сохраняются после Zod-парсинга', () => {
      const variable = makeVariable('v-keep', 'beta', 'float', 2.5);
      const graph = makeGraph(
        [createNode('Start', { x: 0, y: 0 }, 'start')],
        [],
        [variable]
      );
      const graphState = migrateFromBlueprintFormat(graph);
      const afterZod = simulateZodIpc(graphState);

      expect(afterZod.variables).toBeDefined();
      expect(Array.isArray(afterZod.variables)).toBe(true);
      expect(afterZod.variables!.length).toBe(1);
      const v = afterZod.variables![0] as BlueprintVariable;
      expect(v.id).toBe('v-keep');
      expect(v.name).toBe('beta');
    });
  });

  // ┌──────────────────────────────────────────────────────────┐
  // │ 5. migrateToBlueprintFormat — восстановление Blueprint    │
  // └──────────────────────────────────────────────────────────┘
  describe('Шаг 5: migrateToBlueprintFormat восстанавливает данные', () => {
    it('SetVariable восстанавливается из embedded после полного round-trip', () => {
      const setNode = createNode('SetVariable', { x: 100, y: 200 }, 'sv8');
      const variable = makeVariable('v-rt', 'gamma', 'int32', 99);
      const bound = bindVariableToNode(setNode, toBinding(variable), 'ru');
      const blueprint = makeGraph([bound], [], [variable]);

      // полный round-trip
      const graphState = migrateFromBlueprintFormat(blueprint);
      const ipcData = simulateZodIpc(graphState);
      const restored = migrateToBlueprintFormat(ipcData);

      const restoredNode = restored.nodes.find(n => n.id === 'sv8')!;
      expect(restoredNode).toBeDefined();
      expect(restoredNode.type).toBe('SetVariable');
      expect(restoredNode.properties).toBeDefined();
      expect((restoredNode.properties as Record<string, unknown>)?.variableId).toBe('v-rt');
    });

    it('GetVariable восстанавливается из embedded после полного round-trip', () => {
      const getNode = createNode('GetVariable', { x: 50, y: 50 }, 'gv2');
      const variable = makeVariable('v-get', 'delta', 'float', 1.5);
      const bound = bindVariableToNode(getNode, toBinding(variable), 'ru');
      const blueprint = makeGraph([bound], [], [variable]);

      const graphState = migrateFromBlueprintFormat(blueprint);
      const ipcData = simulateZodIpc(graphState);
      const restored = migrateToBlueprintFormat(ipcData);

      const restoredNode = restored.nodes.find(n => n.id === 'gv2')!;
      expect(restoredNode.type).toBe('GetVariable');
      expect((restoredNode.properties as Record<string, unknown>)?.variableId).toBe('v-get');
    });

    it('variables восстанавливаются в BlueprintGraphState', () => {
      const variable = makeVariable('v-restore', 'epsilon', 'string', 'hello');
      const blueprint = makeGraph(
        [createNode('Start', { x: 0, y: 0 }, 'start')],
        [],
        [variable]
      );

      const graphState = migrateFromBlueprintFormat(blueprint);
      const ipcData = simulateZodIpc(graphState);
      const restored = migrateToBlueprintFormat(ipcData);

      expect(restored.variables?.length).toBe(1);
      expect(restored.variables![0].id).toBe('v-restore');
      expect(restored.variables![0].name).toBe('epsilon');
    });
  });

  // ┌──────────────────────────────────────────────────────────┐
  // │ 6. CppCodeGenerator — финальная генерация кода            │
  // └──────────────────────────────────────────────────────────┘
  describe('Шаг 6: CppCodeGenerator с полным pipeline', () => {
    const generator = new CppCodeGenerator();

    it('SetVariable с привязанной переменной НЕ генерирует «unnamed»', () => {
      // Создаём граф в BlueprintEditor-стиле
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const setNode = createNode('SetVariable', { x: 200, y: 0 }, 'set-x');
      const endNode = createNode('End', { x: 400, y: 0 }, 'end');

      const variable = makeVariable('var-x', 'x32', 'int32', 32);
      const boundSet = bindVariableToNode(setNode, toBinding(variable), 'ru');

      const startExecOut = startNode.outputs.find(p => p.dataType === 'execution')!.id;
      const setExecIn = boundSet.inputs.find(p => p.dataType === 'execution')!.id;
      const setExecOut = boundSet.outputs.find(p => p.dataType === 'execution')!.id;
      const endExecIn = endNode.inputs.find(p => p.dataType === 'execution')!.id;

      const blueprint = makeGraph(
        [startNode, boundSet, endNode],
        [
          createEdge('start', startExecOut, 'set-x', setExecIn),
          createEdge('set-x', setExecOut, 'end', endExecIn),
        ],
        [variable]
      );

      // Прямой путь: без IPC
      const directResult = generator.generate(blueprint);
      expect(directResult.success).toBe(true);
      expect(directResult.code).not.toContain('unnamed');
      expect(directResult.code).toContain('x32');

      // Полный round-trip: migrateFrom → IPC → Zod → migrateTo → generate
      const graphState = migrateFromBlueprintFormat(blueprint);
      const ipcData = simulateZodIpc(graphState);
      const restored = migrateToBlueprintFormat(ipcData);

      const rtResult = generator.generate(restored);
      expect(rtResult.success).toBe(true);
      expect(rtResult.code).not.toContain('unnamed');
      expect(rtResult.code).toContain('x32');
    });

    it('GetVariable + SetVariable: переменные генерируются корректно', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const getNode = createNode('GetVariable', { x: 100, y: 150 }, 'get-src');
      const setNode = createNode('SetVariable', { x: 300, y: 0 }, 'set-dst');
      const endNode = createNode('End', { x: 500, y: 0 }, 'end');

      const srcVar = makeVariable('var-src', 'source', 'int32', 10);
      const dstVar = makeVariable('var-dst', 'target', 'int32', 0);

      const boundGet = bindVariableToNode(getNode, toBinding(srcVar), 'ru');
      const boundSet = bindVariableToNode(setNode, toBinding(dstVar), 'ru');

      const startExecOut = startNode.outputs.find(p => p.dataType === 'execution')!.id;
      const setExecIn = boundSet.inputs.find(p => p.dataType === 'execution')!.id;
      const setExecOut = boundSet.outputs.find(p => p.dataType === 'execution')!.id;
      const endExecIn = endNode.inputs.find(p => p.dataType === 'execution')!.id;
      const getValueOut = boundGet.outputs.find(p => p.name === 'Значение')!.id;
      const setValueIn = boundSet.inputs.find(p => p.name === 'Значение')!.id;

      const blueprint = makeGraph(
        [startNode, boundGet, boundSet, endNode],
        [
          createEdge('start', startExecOut, 'set-dst', setExecIn),
          createEdge('set-dst', setExecOut, 'end', endExecIn),
          createEdge('get-src', getValueOut, 'set-dst', setValueIn, 'int32'),
        ],
        [srcVar, dstVar]
      );

      // Полный round-trip
      const graphState = migrateFromBlueprintFormat(blueprint);
      const ipcData = simulateZodIpc(graphState);
      const restored = migrateToBlueprintFormat(ipcData);

      const result = generator.generate(restored);
      expect(result.success).toBe(true);
      expect(result.code).not.toContain('unnamed');
      // Должны быть имена переменных
      expect(result.code).toContain('source');
      expect(result.code).toContain('target');
    });

    it('SetVariable БЕЗ привязки к переменной: fallback НЕ unnamed', () => {
      // Узел создан из палитры без привязки
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const setNode = createNode('SetVariable', { x: 200, y: 0 }, 'set-unbound');
      const endNode = createNode('End', { x: 400, y: 0 }, 'end');

      const startExecOut = startNode.outputs.find(p => p.dataType === 'execution')!.id;
      const setExecIn = setNode.inputs.find(p => p.dataType === 'execution')!.id;
      const setExecOut = setNode.outputs.find(p => p.dataType === 'execution')!.id;
      const endExecIn = endNode.inputs.find(p => p.dataType === 'execution')!.id;

      const blueprint = makeGraph(
        [startNode, setNode, endNode],
        [
          createEdge('start', startExecOut, 'set-unbound', setExecIn),
          createEdge('set-unbound', setExecOut, 'end', endExecIn),
        ]
      );

      // Полный round-trip
      const graphState = migrateFromBlueprintFormat(blueprint);
      const ipcData = simulateZodIpc(graphState);
      const restored = migrateToBlueprintFormat(ipcData);

      // Узел должен оставаться SetVariable, не Variable
      const restoredNode = restored.nodes.find(n => n.id === 'set-unbound')!;
      expect(restoredNode.type).toBe('SetVariable');

      const result = generator.generate(restored);
      expect(result.success).toBe(true);
      // Не должно быть «int unnamed = unnamed;»
      expect(result.code).not.toMatch(/unnamed\s*=\s*unnamed/);
    });

    it('Реестр генераторов содержит SetVariable и GetVariable', () => {
      const supported = generator.getSupportedNodeTypes();
      expect(supported).toContain('SetVariable');
      expect(supported).toContain('GetVariable');
      expect(supported).toContain('Variable');
    });
  });

  // ┌──────────────────────────────────────────────────────────┐
  // │ 7. Проверка предупреждений                                │
  // └──────────────────────────────────────────────────────────┘
  describe('Шаг 7: предупреждения о недостижимости', () => {
    const generator = new CppCodeGenerator();

    it('GetVariable (pure) НЕ должен давать предупреждение «не достижим из Start»', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const getNode = createNode('GetVariable', { x: 100, y: 150 }, 'get-v');
      const setNode = createNode('SetVariable', { x: 300, y: 0 }, 'set-v');
      const endNode = createNode('End', { x: 500, y: 0 }, 'end');

      const variable = makeVariable('var-w', 'w', 'int32', 5);
      const boundGet = bindVariableToNode(getNode, toBinding(variable), 'ru');
      const boundSet = bindVariableToNode(setNode, toBinding(variable), 'ru');

      const startExecOut = startNode.outputs.find(p => p.dataType === 'execution')!.id;
      const setExecIn = boundSet.inputs.find(p => p.dataType === 'execution')!.id;
      const setExecOut = boundSet.outputs.find(p => p.dataType === 'execution')!.id;
      const endExecIn = endNode.inputs.find(p => p.dataType === 'execution')!.id;
      const getValueOut = boundGet.outputs.find(p => p.name === 'Значение')!.id;
      const setValueIn = boundSet.inputs.find(p => p.name === 'Значение')!.id;

      const blueprint = makeGraph(
        [startNode, boundGet, boundSet, endNode],
        [
          createEdge('start', startExecOut, 'set-v', setExecIn),
          createEdge('set-v', setExecOut, 'end', endExecIn),
          createEdge('get-v', getValueOut, 'set-v', setValueIn, 'int32'),
        ],
        [variable]
      );

      const graphState = migrateFromBlueprintFormat(blueprint);
      const ipcData = simulateZodIpc(graphState);
      const restored = migrateToBlueprintFormat(ipcData);

      const result = generator.generate(restored);
      expect(result.success).toBe(true);
      // GetVariable — pure node, не должен генерировать предупреждение «не достижим»
      const unreachableWarnings = result.warnings.filter(w =>
        w.message.includes('не достижим') && w.nodeId === 'get-v'
      );
      expect(unreachableWarnings).toHaveLength(0);
    });
  });

  // ┌──────────────────────────────────────────────────────────┐
  // │ 8. Комментарии  — проверка resolveNodeCommentLabel       │
  // └──────────────────────────────────────────────────────────┘
  describe('Шаг 8: комментарии SetVariable', () => {
    const generator = new CppCodeGenerator();

    it('SetVariable с привязкой генерирует комментарий с именем переменной', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const setNode = createNode('SetVariable', { x: 200, y: 0 }, 'set-c');
      const endNode = createNode('End', { x: 400, y: 0 }, 'end');

      const variable = makeVariable('var-count', 'Счётчик', 'int32', 0);
      const bound = bindVariableToNode(setNode, toBinding(variable), 'ru');

      const startExecOut = startNode.outputs.find(p => p.dataType === 'execution')!.id;
      const setExecIn = bound.inputs.find(p => p.dataType === 'execution')!.id;
      const setExecOut = bound.outputs.find(p => p.dataType === 'execution')!.id;
      const endExecIn = endNode.inputs.find(p => p.dataType === 'execution')!.id;

      const blueprint = makeGraph(
        [startNode, bound, endNode],
        [
          createEdge('start', startExecOut, 'set-c', setExecIn),
          createEdge('set-c', setExecOut, 'end', endExecIn),
        ],
        [variable]
      );

      // Полный round-trip
      const graphState = migrateFromBlueprintFormat(blueprint);
      const ipcData = simulateZodIpc(graphState);
      const restored = migrateToBlueprintFormat(ipcData);

      const result = generator.generate(restored);
      expect(result.success).toBe(true);
      // Комментарий должен содержать «Установить: Счётчик»
      expect(result.code).toContain('Установить: Счётчик');
      // Не должно быть пустого «Установить: » (без имени)
      expect(result.code).not.toMatch(/Установить:\s*$/m);
    });
  });

  // ┌──────────────────────────────────────────────────────────┐
  // │ ДИАГНОСТИКА: вывести фактический код для каждого случая  │
  // └──────────────────────────────────────────────────────────┘
  describe('Диагностика: фактический сгенерированный код', () => {
    const generator = new CppCodeGenerator();

    it('Dump: SetVariable с привязкой после full round-trip', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const setNode = createNode('SetVariable', { x: 200, y: 0 }, 'set-dump');
      const endNode = createNode('End', { x: 400, y: 0 }, 'end');

      const variable = makeVariable('var-d', 'TestVar', 'int32', 77);
      const bound = bindVariableToNode(setNode, toBinding(variable), 'ru');

      const startExecOut = startNode.outputs.find(p => p.dataType === 'execution')!.id;
      const setExecIn = bound.inputs.find(p => p.dataType === 'execution')!.id;
      const setExecOut = bound.outputs.find(p => p.dataType === 'execution')!.id;
      const endExecIn = endNode.inputs.find(p => p.dataType === 'execution')!.id;

      const blueprint = makeGraph(
        [startNode, bound, endNode],
        [
          createEdge('start', startExecOut, 'set-dump', setExecIn),
          createEdge('set-dump', setExecOut, 'end', endExecIn),
        ],
        [variable]
      );

      const graphState = migrateFromBlueprintFormat(blueprint);
      const ipcData = simulateZodIpc(graphState);
      const restored = migrateToBlueprintFormat(ipcData);

      const result = generator.generate(restored);
      console.log('\\n=== DUMP: SetVariable с привязкой (full round-trip) ===');
      console.log(result.code);
      console.log('=== WARNINGS ===');
      result.warnings.forEach(w => console.log(`  [${w.nodeId}] ${w.message}`));
      console.log('===\\n');
      expect(result.success).toBe(true);
    });

    it('Dump: Variable (legacy) без blueprintNode', () => {
      const legacyGraphState = {
        id: 'dump-legacy',
        name: 'Dump Legacy',
        language: 'cpp' as const,
        displayLanguage: 'ru' as const,
        nodes: [
          { id: 'start', label: 'Start', type: 'Start' as const },
          { id: 'var-dump', label: '', type: 'Variable' as const },
          { id: 'end', label: 'End', type: 'End' as const },
        ],
        edges: [
          { id: 'e1', source: 'start', target: 'var-dump', kind: 'execution' as const },
          { id: 'e2', source: 'var-dump', target: 'end', kind: 'execution' as const },
        ],
        updatedAt: new Date().toISOString(),
      };

      const restored = migrateToBlueprintFormat(legacyGraphState);
      const result = generator.generate(restored);
      console.log('\\n=== DUMP: Variable (legacy) без blueprintNode ===');
      console.log(result.code);
      console.log('=== WARNINGS ===');
      result.warnings.forEach(w => console.log(`  [${w.nodeId}] ${w.message}`));
      console.log('===\\n');
      expect(result.success).toBe(true);
    });
  });

  // ┌──────────────────────────────────────────────────────────┐
  // │ 9. Legacy-сценарий: узлы без blueprintNode                │
  // └──────────────────────────────────────────────────────────┘
  describe('Шаг 9: legacy GraphState без blueprintNode', () => {
    const generator = new CppCodeGenerator();

    it('GraphState с type=Variable без blueprintNode: buildBlueprintNodeFromLegacy', () => {
      // Имитируем старый формат: GraphNode без blueprintNode (как addNode в Classic editor)
      const legacyGraphState = {
        id: 'legacy-graph',
        name: 'Legacy Test',
        language: 'cpp' as const,
        displayLanguage: 'ru' as const,
        nodes: [
          { id: 'start', label: 'Start', type: 'Start' as const },
          { id: 'set-legacy', label: 'Установить', type: 'Variable' as const },
          { id: 'end', label: 'End', type: 'End' as const },
        ],
        edges: [
          { id: 'e1', source: 'start', target: 'set-legacy', label: 'flow', kind: 'execution' as const },
          { id: 'e2', source: 'set-legacy', target: 'end', label: 'flow', kind: 'execution' as const },
        ],
        updatedAt: new Date().toISOString(),
        variables: [
          { id: 'var-legacy', name: 'Counter', nameRu: 'Счётчик', dataType: 'int32', defaultValue: 0, category: 'default' },
        ],
      };

      const restored = migrateToBlueprintFormat(legacyGraphState);
      const legacyNode = restored.nodes.find(n => n.id === 'set-legacy')!;

      // Без blueprintNode fallback даёт 'Variable' тип
      expect(legacyNode.type).toBe('Variable');

      const result = generator.generate(restored);
      expect(result.success).toBe(true);
      // Даже в legacy формате НЕ должно быть «unnamed = unnamed»
      expect(result.code).not.toMatch(/unnamed\s*=\s*unnamed/);
    });

    it('GraphState с пустым label и type=Variable: toValidIdentifier fallback', () => {
      const legacyGraphState = {
        id: 'legacy-graph-2',
        name: 'Legacy Test 2',
        language: 'cpp' as const,
        displayLanguage: 'ru' as const,
        nodes: [
          { id: 'start', label: 'Start', type: 'Start' as const },
          { id: 'var-empty', label: '', type: 'Variable' as const },
          { id: 'end', label: 'End', type: 'End' as const },
        ],
        edges: [
          { id: 'e1', source: 'start', target: 'var-empty', label: 'flow', kind: 'execution' as const },
          { id: 'e2', source: 'var-empty', target: 'end', label: 'flow', kind: 'execution' as const },
        ],
        updatedAt: new Date().toISOString(),
      };

      const restored = migrateToBlueprintFormat(legacyGraphState);
      const result = generator.generate(restored);
      expect(result.success).toBe(true);
      // Не должно быть «unnamed = unnamed» — должен использоваться node.id как fallback
      expect(result.code).not.toMatch(/unnamed\s*=\s*unnamed/);
    });

    it('GraphState с blueprintNode partial (type=SetVariable в embedded, type=Variable в GraphNode)', () => {
      // Самый подозрительный сценарий: blueprintNode есть, но isEmbeddedBlueprintNode может не пройти
      const legacyGraphState = {
        id: 'partial-graph',
        name: 'Partial Test',
        language: 'cpp' as const,
        displayLanguage: 'ru' as const,
        nodes: [
          { id: 'start', label: 'Start', type: 'Start' as const },
          {
            id: 'set-partial',
            label: '',
            type: 'Variable' as const,
            blueprintNode: {
              id: 'set-partial',
              label: '',
              type: 'SetVariable',
              position: { x: 200, y: 0 },
              inputs: [
                { id: 'set-partial-exec-in', name: '', dataType: 'execution', direction: 'input', index: 0 },
                { id: 'set-partial-value-in', name: 'Значение', dataType: 'int32', direction: 'input', index: 1 },
              ],
              outputs: [
                { id: 'set-partial-exec-out', name: '', dataType: 'execution', direction: 'output', index: 0 },
                { id: 'set-partial-value-out', name: 'Значение', dataType: 'int32', direction: 'output', index: 1 },
              ],
              properties: {
                variableId: 'var-p',
                name: 'myVar',
                nameRu: 'МояПерем',
                dataType: 'int32',
                defaultValue: 42,
              },
            },
          },
          { id: 'end', label: 'End', type: 'End' as const },
        ],
        edges: [
          { id: 'e1', source: 'start', target: 'set-partial', label: 'flow', kind: 'execution' as const },
          { id: 'e2', source: 'set-partial', target: 'end', label: 'flow', kind: 'execution' as const },
        ],
        updatedAt: new Date().toISOString(),
        variables: [
          { id: 'var-p', name: 'myVar', nameRu: 'МояПерем', dataType: 'int32', defaultValue: 42, category: 'default' },
        ],
      };

      const restored = migrateToBlueprintFormat(legacyGraphState);
      const restoredNode = restored.nodes.find(n => n.id === 'set-partial')!;

      // embedded blueprintNode должен восстановить type: 'SetVariable'
      expect(restoredNode.type).toBe('SetVariable');
      expect((restoredNode.properties as Record<string, unknown>).variableId).toBe('var-p');

      const result = generator.generate(restored);
      expect(result.success).toBe(true);
      expect(result.code).not.toContain('unnamed');
      expect(result.code).toContain('МояПерем'); // либо transliterated version
    });

    it('GraphState с поломанным blueprintNode (некорректные порты) — fallback работает', () => {
      const brokenGraphState = {
        id: 'broken-graph',
        name: 'Broken Test',
        language: 'cpp' as const,
        displayLanguage: 'ru' as const,
        nodes: [
          { id: 'start', label: 'Start', type: 'Start' as const },
          {
            id: 'set-broken',
            label: '',
            type: 'Variable' as const,
            blueprintNode: {
              id: 'set-broken',
              label: '',
              type: 'SetVariable',
              position: { x: 200, y: 0 },
              // ПОРТЫ ПОВРЕЖДЕНЫ — нет массивов inputs/outputs
              properties: {
                variableId: 'var-b',
                name: 'broken',
                nameRu: 'Сломанная',
                dataType: 'int32',
              },
            },
          },
          { id: 'end', label: 'End', type: 'End' as const },
        ],
        edges: [
          { id: 'e1', source: 'start', target: 'set-broken', label: 'flow', kind: 'execution' as const },
          { id: 'e2', source: 'set-broken', target: 'end', label: 'flow', kind: 'execution' as const },
        ],
        updatedAt: new Date().toISOString(),
        variables: [
          { id: 'var-b', name: 'broken', nameRu: 'Сломанная', dataType: 'int32', defaultValue: 0, category: 'default' },
        ],
      };

      const restored = migrateToBlueprintFormat(brokenGraphState);
      const restoredNode = restored.nodes.find(n => n.id === 'set-broken')!;

      // Даже с поломанными портами, buildBlueprintNodeFromLegacy должен восстановить тип
      expect(restoredNode.type).toBe('SetVariable');

      const result = generator.generate(restored);
      expect(result.success).toBe(true);
      // properties.variableId доступен → имя переменной должно быть найдено
      expect(result.code).not.toContain('unnamed');
    });
  });
});
