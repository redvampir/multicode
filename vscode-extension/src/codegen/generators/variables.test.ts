/**
 * Тесты для генераторов variables.ts
 * 
 * Прямые unit-тесты для Variable, GetVariable, SetVariable генераторов
 */

import { describe, it, expect, vi } from 'vitest';
import { 
  VariableNodeGenerator,
  GetVariableNodeGenerator,
  SetVariableNodeGenerator,
  TypeConversionNodeGenerator,
  ClassMethodCallNodeGenerator,
  ClassConstructorCallNodeGenerator,
  ConstructorOverloadCallNodeGenerator,
  CallBaseMethodNodeGenerator,
  GetMemberNodeGenerator,
  SetMemberNodeGenerator,
  StaticMethodCallNodeGenerator,
  StaticGetMemberNodeGenerator,
  StaticSetMemberNodeGenerator,
  CastStaticNodeGenerator,
  CastDynamicNodeGenerator,
  CastConstNodeGenerator,
  IsTypeNodeGenerator,
  MakeUniqueNodeGenerator,
  MakeSharedNodeGenerator,
  DeleteObjectNodeGenerator,
  AddressOfMemberNodeGenerator,
  InitListCtorNodeGenerator,
  createVariableGenerators,
} from './variables';
import type { BlueprintClass, BlueprintNode } from '../../shared/blueprintTypes';
import type { CodeGenContext } from '../types';
import type { GeneratorHelpers } from './base';

// ============================================
// Mock helpers
// ============================================

function createMockHelpers(overrides: Partial<GeneratorHelpers> = {}): GeneratorHelpers {
  return {
    indent: vi.fn().mockReturnValue('    '),
    getInputExpression: vi.fn().mockReturnValue(null),
    getOutputExpression: vi.fn().mockReturnValue(''),
    isVariableDeclared: vi.fn().mockReturnValue(false),
    declareVariable: vi.fn(),
    getVariable: vi.fn().mockReturnValue(null),
    getExecutionTarget: vi.fn().mockReturnValue(null),
    generateFromNode: vi.fn().mockReturnValue([]),
    pushIndent: vi.fn(),
    popIndent: vi.fn(),
    addWarning: vi.fn(),
    addError: vi.fn(),
    ...overrides,
  };
}

function createMockContext(): CodeGenContext {
  return {
    graph: {
      id: 'test',
      name: 'Test',
      language: 'cpp',
      displayLanguage: 'ru',
      nodes: [],
      edges: [],
      updatedAt: new Date().toISOString(),
    },
    options: {
      includeRussianComments: true,
      includeSourceMarkers: false,
      indentSize: 4,
      includeHeaders: true,
      generateMainWrapper: true,
    },
    indentLevel: 1,
    declaredVariables: new Map(),
    processedNodes: new Set(),
    errors: [],
    warnings: [],
    sourceMap: [],
    currentLine: 1,
  };
}

function createMockNode(type: string, label: string, options: Partial<BlueprintNode> = {}): BlueprintNode {
  return {
    id: `${type.toLowerCase()}-1`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type: type as BlueprintNode['type'],
    label,
    position: { x: 0, y: 0 },
    inputs: [
      { id: 'exec-in', name: 'In', dataType: 'execution', direction: 'input', index: 0 },
      { id: 'value', name: 'Value', dataType: 'float', direction: 'input', index: 1 },
    ],
    outputs: [
      { id: 'exec-out', name: 'Out', dataType: 'execution', direction: 'output', index: 0 },
      { id: 'value', name: 'Value', dataType: 'float', direction: 'output', index: 1 },
    ],
    ...options,
  };
}

function createPlayerClassFixture(): BlueprintClass {
  return {
    id: 'class-player',
    name: 'Player',
    baseClasses: ['ActorBase'],
    members: [
      { id: 'member-score', name: 'Score', dataType: 'int32', access: 'public' as const },
      { id: 'member-total', name: 'Total', dataType: 'int32', access: 'public' as const, isStatic: true },
    ],
    methods: [
      {
        id: 'method-jump',
        name: 'Jump',
        returnType: 'bool' as const,
        params: [{ id: 'param-height', name: 'height', dataType: 'double' as const }],
        access: 'public' as const,
      },
      {
        id: 'method-tick',
        name: 'Tick',
        returnType: 'bool' as const,
        params: [{ id: 'param-speed', name: 'speed', dataType: 'float' as const }],
        access: 'public' as const,
      },
      {
        id: 'ctor-main',
        name: 'Player',
        methodKind: 'constructor' as const,
        returnType: 'execution' as const,
        params: [{ id: 'param-seed', name: 'seed', dataType: 'int32' as const }],
        access: 'public' as const,
      },
      {
        id: 'method-make',
        name: 'Create',
        isStatic: true,
        returnType: 'int32' as const,
        params: [],
        access: 'public' as const,
      },
    ],
  };
}

// ============================================
// VariableNodeGenerator Tests
// ============================================

describe('VariableNodeGenerator', () => {
  const generator = new VariableNodeGenerator();

  it('should support Variable node type', () => {
    expect(generator.nodeTypes).toContain('Variable');
  });

  it('should generate variable declaration', () => {
    const node = createMockNode('Variable', 'counter');
    const helpers = createMockHelpers();
    const context = createMockContext();

    const result = generator.generate(node, context, helpers);

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toContain('counter');
    expect(result.lines[0]).toContain('=');
    expect(helpers.declareVariable).toHaveBeenCalled();
  });

  it('should not redeclare if already declared', () => {
    const node = createMockNode('Variable', 'counter');
    const helpers = createMockHelpers({
      isVariableDeclared: vi.fn().mockReturnValue(true),
    });
    const context = createMockContext();

    const result = generator.generate(node, context, helpers);

    expect(result.lines).toHaveLength(0);
    expect(helpers.declareVariable).not.toHaveBeenCalled();
  });

  it('should use dataType from output port', () => {
    const node = createMockNode('Variable', 'myString', {
      outputs: [
        { id: 'exec-out', name: 'Out', dataType: 'execution', direction: 'output', index: 0 },
        { id: 'value', name: 'Value', dataType: 'string', direction: 'output', index: 1 },
      ],
    });
    const helpers = createMockHelpers();
    const context = createMockContext();

    const result = generator.generate(node, context, helpers);

    expect(result.lines[0]).toContain('std::string');
  });

  it('should use vectorElementType from graph variable', () => {
    const node = createMockNode('Variable', '', {
      properties: {
        variableId: 'var-vec',
        dataType: 'vector',
      },
      outputs: [
        { id: 'exec-out', name: 'Out', dataType: 'execution', direction: 'output', index: 0 },
        { id: 'value', name: 'Value', dataType: 'vector', direction: 'output', index: 1 },
      ],
    });
    const helpers = createMockHelpers();
    const context = createMockContext();
    context.graph.variables = [
      {
        id: 'var-vec',
        name: 'points',
        nameRu: 'точки',
        dataType: 'vector',
        vectorElementType: 'float',
        defaultValue: [0, 1, 2],
        category: 'default',
      },
    ];

    const result = generator.generate(node, context, helpers);

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toContain('std::vector<float>');
  });

  it('should generate std::vector<T> declaration when variable is marked as array', () => {
    const node = createMockNode('Variable', '', {
      properties: {
        variableId: 'var-array',
        dataType: 'int32',
        isArray: true,
      },
      outputs: [
        { id: 'exec-out', name: 'Out', dataType: 'execution', direction: 'output', index: 0 },
        { id: 'value', name: 'Value', dataType: 'array', direction: 'output', index: 1 },
      ],
    });
    const helpers = createMockHelpers();
    const context = createMockContext();
    context.graph.variables = [
      {
        id: 'var-array',
        name: 'values',
        nameRu: 'значения',
        codeName: 'values',
        dataType: 'int32',
        isArray: true,
        defaultValue: [1, 2, 3],
        category: 'default',
      },
    ];

    const result = generator.generate(node, context, helpers);

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toContain('std::vector<int> values = {1, 2, 3};');
  });

  it('should generate pointer declaration using pointerMeta mode', () => {
    const node = createMockNode('Variable', '', {
      properties: {
        variableId: 'ptr-shared',
        dataType: 'pointer',
      },
      outputs: [
        { id: 'exec-out', name: 'Out', dataType: 'execution', direction: 'output', index: 0 },
        { id: 'value', name: 'Value', dataType: 'pointer', direction: 'output', index: 1 },
      ],
    });
    const helpers = createMockHelpers();
    const context = createMockContext();
    context.graph.variables = [
      {
        id: 'ptr-shared',
        name: 'sharedCounter',
        nameRu: 'sharedCounter',
        codeName: 'shared_counter',
        dataType: 'pointer',
        category: 'default',
        defaultValue: 10,
        pointerMeta: {
          mode: 'shared',
          pointeeDataType: 'int32',
        },
      },
    ];

    const result = generator.generate(node, context, helpers);

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toContain('std::shared_ptr<int>');
    expect(result.lines[0]).toContain('std::make_shared<int>(10)');
  });

  it('should return variable name in getOutputExpression', () => {
    const node = createMockNode('Variable', 'counter');
    const helpers = createMockHelpers({
      getVariable: vi.fn().mockReturnValue({ codeName: 'counter' }),
    });
    const context = createMockContext();

    const expr = generator.getOutputExpression(node, 'value', context, helpers);

    expect(expr).toBe('counter');
  });

  it('should fallback to label in getOutputExpression if not found', () => {
    const node = createMockNode('Variable', 'myVar');
    const helpers = createMockHelpers({
      getVariable: vi.fn().mockReturnValue(null),
    });
    const context = createMockContext();

    const expr = generator.getOutputExpression(node, 'value', context, helpers);

    expect(expr).toBe('myvar');
  });
});

// ============================================
// GetVariableNodeGenerator Tests
// ============================================

describe('GetVariableNodeGenerator', () => {
  const generator = new GetVariableNodeGenerator();

  it('should support GetVariable node type', () => {
    expect(generator.nodeTypes).toContain('GetVariable');
  });

  it('should generate noop (pure node)', () => {
    const result = generator.generate();

    expect(result.lines).toHaveLength(0);
    expect(result.followExecutionFlow).toBe(true);
  });

  it('should return variable name in getOutputExpression', () => {
    const node = createMockNode('GetVariable', 'counter');
    const helpers = createMockHelpers({
      getVariable: vi.fn().mockReturnValue({ codeName: 'counter' }),
    });
    const context = createMockContext();

    const expr = generator.getOutputExpression(node, 'value', context, helpers);

    expect(expr).toBe('counter');
  });

  it('should fallback to label if variable not found', () => {
    const node = createMockNode('GetVariable', 'unknownVar');
    const helpers = createMockHelpers({
      getVariable: vi.fn().mockReturnValue(null),
    });
    const context = createMockContext();

    const expr = generator.getOutputExpression(node, 'value', context, helpers);

    expect(expr).toBe('unknownvar');
  });

  it('should resolve variable by variableId when node label is empty', () => {
    const node = createMockNode('GetVariable', '', {
      properties: { variableId: 'var_health' },
    });
    const helpers = createMockHelpers({
      getVariable: vi
        .fn()
        .mockImplementation((idOrName: string) =>
          idOrName === 'var_health' ? { codeName: 'health', cppType: 'int' } : null
        ),
    });
    const context = createMockContext();
    context.graph.variables = [
      {
        id: 'var_health',
        name: 'health',
        nameRu: 'здоровье',
        dataType: 'int32',
        category: 'default',
      },
    ];

    const expr = generator.getOutputExpression(node, 'value', context, helpers);

    expect(expr).toBe('health');
  });
});

// ============================================
// SetVariableNodeGenerator Tests
// ============================================

describe('SetVariableNodeGenerator', () => {
  const generator = new SetVariableNodeGenerator();

  it('should support SetVariable node type', () => {
    expect(generator.nodeTypes).toContain('SetVariable');
  });

  it('should declare and assign new variable', () => {
    const node = createMockNode('SetVariable', 'counter');
    const helpers = createMockHelpers({
      getInputExpression: vi.fn().mockReturnValue('42'),
    });
    const context = createMockContext();

    const result = generator.generate(node, context, helpers);

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toContain('counter');
    expect(result.lines[0]).toContain('42');
    expect(helpers.declareVariable).toHaveBeenCalled();
  });

  it('should reassign existing variable without type', () => {
    const node = createMockNode('SetVariable', 'counter');
    const helpers = createMockHelpers({
      isVariableDeclared: vi.fn().mockReturnValue(true),
      getInputExpression: vi.fn().mockReturnValue('100'),
    });
    const context = createMockContext();

    const result = generator.generate(node, context, helpers);

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toBe('    counter = 100;');
    expect(helpers.declareVariable).not.toHaveBeenCalled();
  });

  it('should use 0 as default value if no input', () => {
    const node = createMockNode('SetVariable', 'counter');
    const helpers = createMockHelpers({
      getInputExpression: vi.fn().mockReturnValue(null),
    });
    const context = createMockContext();

    const result = generator.generate(node, context, helpers);

    expect(result.lines[0]).toContain('= 0');
  });

  it('should return variable name in getOutputExpression', () => {
    const node = createMockNode('SetVariable', 'counter');
    const helpers = createMockHelpers({
      getVariable: vi.fn().mockReturnValue({ codeName: 'counter' }),
    });
    const context = createMockContext();

    const expr = generator.getOutputExpression(node, 'value', context, helpers);

    expect(expr).toBe('counter');
  });

  it('should fallback to label in getOutputExpression', () => {
    const node = createMockNode('SetVariable', 'myValue');
    const helpers = createMockHelpers({
      getVariable: vi.fn().mockReturnValue(null),
    });
    const context = createMockContext();

    const expr = generator.getOutputExpression(node, 'value', context, helpers);

    expect(expr).toBe('myvalue');
  });

  it('should generate assignment with variableId when label is empty', () => {
    const node = createMockNode('SetVariable', '', {
      properties: { variableId: 'var_score' },
    });
    const helpers = createMockHelpers({
      getInputExpression: vi.fn().mockReturnValue('42'),
      getVariable: vi
        .fn()
        .mockImplementation((idOrName: string) =>
          idOrName === 'var_score' ? { codeName: 'score', cppType: 'int' } : null
        ),
    });
    const context = createMockContext();
    context.graph.variables = [
      {
        id: 'var_score',
        name: 'score',
        nameRu: 'очки',
        dataType: 'int32',
        category: 'default',
      },
    ];

    const result = generator.generate(node, context, helpers);

    expect(result.lines).toContain('    score = 42;');
  });

  it('should prefer graph variable codeName over display names', () => {
    const node = createMockNode('SetVariable', '', {
      properties: { variableId: 'var_total' },
    });
    const helpers = createMockHelpers({
      getInputExpression: vi.fn().mockReturnValue('7'),
    });
    const context = createMockContext();
    context.graph.variables = [
      {
        id: 'var_total',
        name: 'итог',
        nameRu: 'Итог',
        codeName: 'total_value',
        dataType: 'int32',
        category: 'default',
      },
    ];

    const result = generator.generate(node, context, helpers);

    expect(result.lines).toContain('    int total_value = 7;');
  });

  it('should apply explicit cast for numeric mismatch on incoming data edge', () => {
    const setNode = createMockNode('SetVariable', 'counter', {
      id: 'set-target',
      properties: {
        variableId: 'var-target',
        dataType: 'int32',
      },
      inputs: [
        { id: 'set-target-exec-in', name: 'In', dataType: 'execution', direction: 'input', index: 0 },
        { id: 'set-target-value-in', name: 'Значение', dataType: 'int32', direction: 'input', index: 1 },
      ],
      outputs: [
        { id: 'set-target-exec-out', name: 'Out', dataType: 'execution', direction: 'output', index: 0 },
        { id: 'set-target-value-out', name: 'Значение', dataType: 'int32', direction: 'output', index: 1 },
      ],
    });
    const sourceNode = createMockNode('Add', 'sum', {
      id: 'add-source',
      inputs: [
        { id: 'add-source-a', name: 'A', dataType: 'float', direction: 'input', index: 0 },
        { id: 'add-source-b', name: 'B', dataType: 'float', direction: 'input', index: 1 },
      ],
      outputs: [
        { id: 'add-source-result', name: 'Result', dataType: 'double', direction: 'output', index: 0 },
      ],
    });
    const helpers = createMockHelpers({
      getInputExpression: vi.fn().mockReturnValue('(a + b)'),
      isVariableDeclared: vi.fn().mockReturnValue(true),
      getVariable: vi.fn().mockReturnValue({ codeName: 'counter', cppType: 'int' }),
    });
    const context = createMockContext();
    context.graph.nodes = [sourceNode, setNode];
    context.graph.edges = [
      {
        id: 'edge-cast',
        sourceNode: 'add-source',
        sourcePort: 'add-source-result',
        targetNode: 'set-target',
        targetPort: 'set-target-value-in',
        kind: 'data',
        dataType: 'double',
      },
    ];

    const result = generator.generate(setNode, context, helpers);

    expect(result.lines).toContain('    counter = static_cast<int>((a + b));');
  });

  it('should wrap numeric expression with std::to_string when assigning to string', () => {
    const setNode = createMockNode('SetVariable', 'podacha', {
      id: 'set-string',
      properties: {
        variableId: 'var-podacha',
        dataType: 'string',
      },
      inputs: [
        { id: 'set-string-exec-in', name: 'In', dataType: 'execution', direction: 'input', index: 0 },
        { id: 'set-string-value-in', name: 'Значение', dataType: 'string', direction: 'input', index: 1 },
      ],
      outputs: [
        { id: 'set-string-exec-out', name: 'Out', dataType: 'execution', direction: 'output', index: 0 },
        { id: 'set-string-value-out', name: 'Значение', dataType: 'string', direction: 'output', index: 1 },
      ],
    });
    const sourceNode = createMockNode('GetVariable', 'counter', {
      id: 'get-int',
      outputs: [
        { id: 'get-int-exec-out', name: 'Out', dataType: 'execution', direction: 'output', index: 0 },
        { id: 'get-int-value-out', name: 'Значение', dataType: 'int32', direction: 'output', index: 1 },
      ],
    });
    const helpers = createMockHelpers({
      getInputExpression: vi.fn().mockReturnValue('42'),
      isVariableDeclared: vi.fn().mockReturnValue(true),
      getVariable: vi.fn().mockReturnValue({ codeName: 'podacha', cppType: 'std::string' }),
    });
    const context = createMockContext();
    context.graph.nodes = [sourceNode, setNode];
    context.graph.edges = [
      {
        id: 'edge-to-string',
        sourceNode: 'get-int',
        sourcePort: 'get-int-value-out',
        targetNode: 'set-string',
        targetPort: 'set-string-value-in',
        kind: 'data',
        dataType: 'int32',
      },
    ];

    const result = generator.generate(setNode, context, helpers);

    expect(result.lines).toContain('    podacha = std::to_string(42);');
  });

  it('should wrap std::stoi when assigning string to int32', () => {
    const setNode = createMockNode('SetVariable', 'counter', {
      id: 'set-int',
      properties: {
        variableId: 'var-counter',
        dataType: 'int32',
      },
      inputs: [
        { id: 'set-int-exec-in', name: 'In', dataType: 'execution', direction: 'input', index: 0 },
        { id: 'set-int-value-in', name: 'Значение', dataType: 'int32', direction: 'input', index: 1 },
      ],
      outputs: [
        { id: 'set-int-exec-out', name: 'Out', dataType: 'execution', direction: 'output', index: 0 },
        { id: 'set-int-value-out', name: 'Значение', dataType: 'int32', direction: 'output', index: 1 },
      ],
    });
    const sourceNode = createMockNode('GetVariable', 'text', {
      id: 'get-string',
      outputs: [
        { id: 'get-string-exec-out', name: 'Out', dataType: 'execution', direction: 'output', index: 0 },
        { id: 'get-string-value-out', name: 'Значение', dataType: 'string', direction: 'output', index: 1 },
      ],
    });
    const helpers = createMockHelpers({
      getInputExpression: vi.fn().mockReturnValue('"123"'),
      isVariableDeclared: vi.fn().mockReturnValue(true),
      getVariable: vi.fn().mockReturnValue({ codeName: 'counter', cppType: 'int' }),
    });
    const context = createMockContext();
    context.graph.nodes = [sourceNode, setNode];
    context.graph.edges = [
      {
        id: 'edge-from-string',
        sourceNode: 'get-string',
        sourcePort: 'get-string-value-out',
        targetNode: 'set-int',
        targetPort: 'set-int-value-in',
        kind: 'data',
        dataType: 'string',
      },
    ];

    const result = generator.generate(setNode, context, helpers);

    expect(result.lines).toContain('    counter = std::stoi("123");');
  });

  it('should infer pointee type for pointer deref and apply string conversion', () => {
    const setNode = createMockNode('SetVariable', 'podacha', {
      id: 'set-string',
      properties: {
        variableId: 'var-podacha',
        dataType: 'string',
      },
      inputs: [
        { id: 'set-string-exec-in', name: 'In', dataType: 'execution', direction: 'input', index: 0 },
        { id: 'set-string-value-in', name: 'Значение', dataType: 'string', direction: 'input', index: 1 },
      ],
      outputs: [
        { id: 'set-string-exec-out', name: 'Out', dataType: 'execution', direction: 'output', index: 0 },
        { id: 'set-string-value-out', name: 'Значение', dataType: 'string', direction: 'output', index: 1 },
      ],
    });
    const sourceNode = createMockNode('GetVariable', '', {
      id: 'get-pointer',
      properties: { variableId: 'var-test-ptr' },
      outputs: [
        { id: 'get-pointer-exec-out', name: 'Out', dataType: 'execution', direction: 'output', index: 0 },
        { id: 'get-pointer-value-out', name: 'Значение', dataType: 'pointer', direction: 'output', index: 1 },
      ],
    });
    const helpers = createMockHelpers({
      getInputExpression: vi.fn().mockReturnValue('*test'),
      isVariableDeclared: vi.fn().mockReturnValue(true),
      getVariable: vi.fn().mockReturnValue({ codeName: 'podacha', cppType: 'std::string' }),
    });
    const context = createMockContext();
    context.graph.variables = [
      {
        id: 'var-podacha',
        name: 'podacha',
        nameRu: 'подача',
        dataType: 'string',
        category: 'default',
      },
      {
        id: 'var-source',
        name: 'x',
        nameRu: 'х',
        dataType: 'int32',
        category: 'default',
      },
      {
        id: 'var-test-ptr',
        name: 'test',
        nameRu: 'тест',
        dataType: 'pointer',
        category: 'default',
        pointerMeta: {
          mode: 'unique',
          pointeeDataType: 'int32',
          targetVariableId: 'var-source',
        },
      },
    ];
    context.graph.nodes = [sourceNode, setNode];
    context.graph.edges = [
      {
        id: 'edge-ptr-to-string',
        sourceNode: 'get-pointer',
        sourcePort: 'get-pointer-value-out',
        targetNode: 'set-string',
        targetPort: 'set-string-value-in',
        kind: 'data',
        dataType: 'pointer',
      },
    ];

    const result = generator.generate(setNode, context, helpers);

    expect(result.lines).toContain('    podacha = std::to_string(*test);');
  });

  it('should not apply explicit cast when source and target data types are equal', () => {
    const setNode = createMockNode('SetVariable', 'counter', {
      id: 'set-target',
      properties: {
        variableId: 'var-target',
        dataType: 'int32',
      },
      inputs: [
        { id: 'set-target-exec-in', name: 'In', dataType: 'execution', direction: 'input', index: 0 },
        { id: 'set-target-value-in', name: 'Значение', dataType: 'int32', direction: 'input', index: 1 },
      ],
      outputs: [
        { id: 'set-target-exec-out', name: 'Out', dataType: 'execution', direction: 'output', index: 0 },
        { id: 'set-target-value-out', name: 'Значение', dataType: 'int32', direction: 'output', index: 1 },
      ],
    });
    const sourceNode = createMockNode('GetVariable', 'source', {
      id: 'get-source',
      outputs: [
        { id: 'get-source-value-out', name: 'Value', dataType: 'int32', direction: 'output', index: 0 },
      ],
    });
    const helpers = createMockHelpers({
      getInputExpression: vi.fn().mockReturnValue('source_value'),
      isVariableDeclared: vi.fn().mockReturnValue(true),
      getVariable: vi.fn().mockReturnValue({ codeName: 'counter', cppType: 'int' }),
    });
    const context = createMockContext();
    context.graph.nodes = [sourceNode, setNode];
    context.graph.edges = [
      {
        id: 'edge-no-cast',
        sourceNode: 'get-source',
        sourcePort: 'get-source-value-out',
        targetNode: 'set-target',
        targetPort: 'set-target-value-in',
        kind: 'data',
        dataType: 'int32',
      },
    ];

    const result = generator.generate(setNode, context, helpers);

    expect(result.lines).toContain('    counter = source_value;');
  });

  it('should generate vector<string> assignment literal for SetVariable override', () => {
    const node = createMockNode('SetVariable', '', {
      id: 'set-tags',
      properties: {
        variableId: 'var-tags',
        dataType: 'vector',
        vectorElementType: 'string',
        inputValue: ['alpha', 'line "quoted"'],
        inputValueIsOverride: true,
      },
      inputs: [
        { id: 'set-tags-exec-in', name: 'In', dataType: 'execution', direction: 'input', index: 0 },
        { id: 'set-tags-value-in', name: 'Значение', dataType: 'vector', direction: 'input', index: 1 },
      ],
      outputs: [
        { id: 'set-tags-exec-out', name: 'Out', dataType: 'execution', direction: 'output', index: 0 },
        { id: 'set-tags-value-out', name: 'Значение', dataType: 'vector', direction: 'output', index: 1 },
      ],
    });
    const helpers = createMockHelpers({
      getInputExpression: vi.fn().mockReturnValue(null),
      isVariableDeclared: vi.fn().mockReturnValue(true),
      getVariable: vi.fn().mockReturnValue({ codeName: 'tags', cppType: 'std::vector<std::string>' }),
    });
    const context = createMockContext();
    context.graph.variables = [
      {
        id: 'var-tags',
        name: 'tags',
        nameRu: 'теги',
        codeName: 'tags',
        dataType: 'vector',
        vectorElementType: 'string',
        defaultValue: [],
        category: 'default',
      },
    ];

    const result = generator.generate(node, context, helpers);

    expect(result.lines).toContain('    tags = {"alpha", "line \\"quoted\\""};');
  });

  it('should fallback to empty vector literal for invalid vector override', () => {
    const node = createMockNode('SetVariable', '', {
      id: 'set-tags-invalid',
      properties: {
        variableId: 'var-tags',
        dataType: 'vector',
        vectorElementType: 'string',
        inputValue: ['ok', { bad: true }],
        inputValueIsOverride: true,
      },
      inputs: [
        { id: 'set-tags-invalid-exec-in', name: 'In', dataType: 'execution', direction: 'input', index: 0 },
        { id: 'set-tags-invalid-value-in', name: 'Значение', dataType: 'vector', direction: 'input', index: 1 },
      ],
      outputs: [
        { id: 'set-tags-invalid-exec-out', name: 'Out', dataType: 'execution', direction: 'output', index: 0 },
        { id: 'set-tags-invalid-value-out', name: 'Значение', dataType: 'vector', direction: 'output', index: 1 },
      ],
    });
    const helpers = createMockHelpers({
      getInputExpression: vi.fn().mockReturnValue(null),
      isVariableDeclared: vi.fn().mockReturnValue(true),
      getVariable: vi.fn().mockReturnValue({ codeName: 'tags', cppType: 'std::vector<std::string>' }),
    });
    const context = createMockContext();
    context.graph.variables = [
      {
        id: 'var-tags',
        name: 'tags',
        nameRu: 'теги',
        codeName: 'tags',
        dataType: 'vector',
        vectorElementType: 'string',
        defaultValue: [],
        category: 'default',
      },
    ];

    const result = generator.generate(node, context, helpers);

    expect(result.lines).toContain('    tags = {};');
  });

  it('should generate nested array literal for vector<T>[] assignment', () => {
    const node = createMockNode('SetVariable', '', {
      id: 'set-matrix',
      properties: {
        variableId: 'var-matrix',
        dataType: 'vector',
        isArray: true,
        arrayRank: 1,
        vectorElementType: 'int32',
        inputValue: [[1, 2], [3, 4]],
        inputValueIsOverride: true,
      },
      inputs: [
        { id: 'set-matrix-exec-in', name: 'In', dataType: 'execution', direction: 'input', index: 0 },
        { id: 'set-matrix-value-in', name: 'Значение', dataType: 'array', direction: 'input', index: 1 },
      ],
      outputs: [
        { id: 'set-matrix-exec-out', name: 'Out', dataType: 'execution', direction: 'output', index: 0 },
        { id: 'set-matrix-value-out', name: 'Значение', dataType: 'array', direction: 'output', index: 1 },
      ],
    });
    const helpers = createMockHelpers({
      getInputExpression: vi.fn().mockReturnValue(null),
      isVariableDeclared: vi.fn().mockReturnValue(true),
      getVariable: vi.fn().mockReturnValue({ codeName: 'matrix', cppType: 'std::vector<std::vector<int>>' }),
    });
    const context = createMockContext();
    context.graph.variables = [
      {
        id: 'var-matrix',
        name: 'matrix',
        nameRu: 'матрица',
        codeName: 'matrix',
        dataType: 'vector',
        isArray: true,
        arrayRank: 1,
        vectorElementType: 'int32',
        defaultValue: [[0, 0]],
        category: 'default',
      },
    ];

    const result = generator.generate(node, context, helpers);

    expect(result.lines).toContain('    matrix = {{1, 2}, {3, 4}};');
  });

  it('should generate nested array literal for scalar arrayRank=2 assignment', () => {
    const node = createMockNode('SetVariable', '', {
      id: 'set-grid',
      properties: {
        variableId: 'var-grid',
        dataType: 'int32',
        arrayRank: 2,
        inputValue: [[1, 2], [3, 4]],
        inputValueIsOverride: true,
      },
      inputs: [
        { id: 'set-grid-exec-in', name: 'In', dataType: 'execution', direction: 'input', index: 0 },
        { id: 'set-grid-value-in', name: 'Значение', dataType: 'array', direction: 'input', index: 1 },
      ],
      outputs: [
        { id: 'set-grid-exec-out', name: 'Out', dataType: 'execution', direction: 'output', index: 0 },
        { id: 'set-grid-value-out', name: 'Значение', dataType: 'array', direction: 'output', index: 1 },
      ],
    });
    const helpers = createMockHelpers({
      getInputExpression: vi.fn().mockReturnValue(null),
      isVariableDeclared: vi.fn().mockReturnValue(true),
      getVariable: vi.fn().mockReturnValue({ codeName: 'grid', cppType: 'std::vector<std::vector<int>>' }),
    });
    const context = createMockContext();
    context.graph.variables = [
      {
        id: 'var-grid',
        name: 'grid',
        nameRu: 'сетка',
        codeName: 'grid',
        dataType: 'int32',
        arrayRank: 2,
        defaultValue: [[0]],
        category: 'default',
      },
    ];

    const result = generator.generate(node, context, helpers);

    expect(result.lines).toContain('    grid = {{1, 2}, {3, 4}};');
  });

  it('should report error for SetVariable on const_reference pointer', () => {
    const node = createMockNode('SetVariable', '', {
      id: 'set-const-ref',
      properties: {
        variableId: 'ptr-const-ref',
        dataType: 'pointer',
      },
    });
    const helpers = createMockHelpers({
      addError: vi.fn(),
    });
    const context = createMockContext();
    context.graph.variables = [
      {
        id: 'ptr-const-ref',
        name: 'constRef',
        nameRu: 'constRef',
        codeName: 'const_ref',
        dataType: 'pointer',
        category: 'default',
        pointerMeta: {
          mode: 'const_reference',
          pointeeDataType: 'int32',
          targetVariableId: 'var-value',
        },
      },
      {
        id: 'var-value',
        name: 'value',
        nameRu: 'value',
        dataType: 'int32',
        category: 'default',
        defaultValue: 1,
      },
    ];

    const result = generator.generate(node, context, helpers);

    expect(result.lines).toHaveLength(0);
    expect(helpers.addError).toHaveBeenCalledTimes(1);
  });
});

// ============================================
// TypeConversionNodeGenerator Tests
// ============================================

describe('TypeConversionNodeGenerator', () => {
  const generator = new TypeConversionNodeGenerator();

  it('should support TypeConversion node type', () => {
    expect(generator.nodeTypes).toContain('TypeConversion');
  });

  it('should generate noop (pure node)', () => {
    const result = generator.generate();
    expect(result.lines).toHaveLength(0);
    expect(result.followExecutionFlow).toBe(true);
  });

  it('should generate std::to_string for int32 -> string', () => {
    const node = createMockNode('TypeConversion', '', {
      id: 'convert-int-string',
      inputs: [
        { id: 'convert-int-string-value-in', name: 'In', dataType: 'int32', direction: 'input', index: 0 },
      ],
      outputs: [
        { id: 'convert-int-string-value-out', name: 'Out', dataType: 'string', direction: 'output', index: 0 },
      ],
      properties: {
        conversionId: 'int32_to_string',
        fromType: 'int32',
        toType: 'string',
      },
    });
    const helpers = createMockHelpers({
      getInputExpression: vi.fn().mockReturnValue('counter'),
    });
    const context = createMockContext();

    const expr = generator.getOutputExpression(node, 'value-out', context, helpers);

    expect(expr).toBe('std::to_string(counter)');
  });

  it('should generate static_cast<int> for float -> int32', () => {
    const node = createMockNode('TypeConversion', '', {
      id: 'convert-float-int',
      inputs: [
        { id: 'convert-float-int-value-in', name: 'In', dataType: 'float', direction: 'input', index: 0 },
      ],
      outputs: [
        { id: 'convert-float-int-value-out', name: 'Out', dataType: 'int32', direction: 'output', index: 0 },
      ],
      properties: {
        conversionId: 'float_to_int32',
        fromType: 'float',
        toType: 'int32',
      },
    });
    const helpers = createMockHelpers({
      getInputExpression: vi.fn().mockReturnValue('valueExpr'),
    });
    const context = createMockContext();

    const expr = generator.getOutputExpression(node, 'value-out', context, helpers);

    expect(expr).toBe('static_cast<int>(valueExpr)');
  });

  it('should generate helper call for string -> bool and register helper', () => {
    const node = createMockNode('TypeConversion', '', {
      id: 'convert-string-bool',
      inputs: [
        { id: 'convert-string-bool-value-in', name: 'In', dataType: 'string', direction: 'input', index: 0 },
      ],
      outputs: [
        { id: 'convert-string-bool-value-out', name: 'Out', dataType: 'bool', direction: 'output', index: 0 },
      ],
      properties: {
        conversionId: 'string_to_bool',
        fromType: 'string',
        toType: 'bool',
      },
    });
    const helpers = createMockHelpers({
      getInputExpression: vi.fn().mockReturnValue('rawValue'),
    });
    const context = createMockContext();
    context.requiredHelpers = new Set();

    const expr = generator.getOutputExpression(node, 'value-out', context, helpers);

    expect(expr).toBe('multicode_parse_bool_strict(rawValue)');
    expect(context.requiredHelpers.has('parse_bool_strict')).toBe(true);
  });

  it('should resolve helper template for string -> vector using target variable metadata', () => {
    const conversionNode = createMockNode('TypeConversion', '', {
      id: 'convert-string-vector',
      inputs: [
        { id: 'convert-string-vector-value-in', name: 'In', dataType: 'string', direction: 'input', index: 0 },
      ],
      outputs: [
        { id: 'convert-string-vector-value-out', name: 'Out', dataType: 'vector', direction: 'output', index: 0 },
      ],
      properties: {
        conversionId: 'string_to_vector',
        fromType: 'string',
        toType: 'vector',
        meta: {
          vectorElementType: 'int32',
        },
      },
    });
    const setNode = createMockNode('SetVariable', '', {
      id: 'set-vector',
      inputs: [
        { id: 'set-vector-exec-in', name: 'In', dataType: 'execution', direction: 'input', index: 0 },
        { id: 'set-vector-value-in', name: 'Значение', dataType: 'vector', direction: 'input', index: 1 },
      ],
      outputs: [
        { id: 'set-vector-exec-out', name: 'Out', dataType: 'execution', direction: 'output', index: 0 },
        { id: 'set-vector-value-out', name: 'Значение', dataType: 'vector', direction: 'output', index: 1 },
      ],
      properties: {
        variableId: 'var-values',
        dataType: 'vector',
      },
    });
    const helpers = createMockHelpers({
      getInputExpression: vi.fn().mockReturnValue('rawVector'),
    });
    const context = createMockContext();
    context.requiredHelpers = new Set();
    context.graph.nodes = [conversionNode, setNode];
    context.graph.edges = [
      {
        id: 'edge-convert-to-set',
        sourceNode: 'convert-string-vector',
        sourcePort: 'convert-string-vector-value-out',
        targetNode: 'set-vector',
        targetPort: 'set-vector-value-in',
        kind: 'data',
        dataType: 'vector',
      },
    ];
    context.graph.variables = [
      {
        id: 'var-values',
        name: 'values',
        nameRu: 'значения',
        codeName: 'values',
        dataType: 'vector',
        vectorElementType: 'int32',
        defaultValue: [],
        category: 'default',
      },
    ];

    const expr = generator.getOutputExpression(conversionNode, 'value-out', context, helpers);

    expect(expr).toBe('multicode_parse_vector_strict<int>(rawVector)');
    expect(context.requiredHelpers.has('parse_vector_strict')).toBe(true);
  });
});



// ============================================
// ClassMethodCallNodeGenerator Tests
// ============================================

describe('ClassMethodCallNodeGenerator', () => {
  const generator = new ClassMethodCallNodeGenerator();

  it('should support ClassMethodCall node type', () => {
    expect(generator.nodeTypes).toContain('ClassMethodCall');
  });

  it('should generate class method call for configured node', () => {
    const node = createMockNode('ClassMethodCall', 'Call Method', {
      properties: {
        classId: 'class-player',
        methodId: 'method-jump',
      },
      inputs: [
        { id: 'exec-in', name: 'In', dataType: 'execution', direction: 'input', index: 0 },
        { id: 'target', name: 'Target', dataType: 'class', direction: 'input', index: 1 },
        { id: 'arg-0', name: 'Height', dataType: 'double', direction: 'input', index: 2 },
      ],
      outputs: [
        { id: 'exec-out', name: 'Out', dataType: 'execution', direction: 'output', index: 0 },
        { id: 'result', name: 'Result', dataType: 'bool', direction: 'output', index: 1 },
      ],
    });

    const helpers = createMockHelpers({
      getInputExpression: vi.fn((n: BlueprintNode, suffix: string) => {
        if (n.id !== node.id) {
          return null;
        }
        if (suffix === 'target') return 'player';
        if (suffix === 'arg-0') return '2.5';
        return null;
      }),
    });

    const context = createMockContext();
    context.graph.classes = [
      {
        id: 'class-player',
        name: 'Player',
        methods: [
          {
            id: 'method-jump',
            name: 'Jump',
            returnType: 'bool',
            params: [{ id: 'param-height', name: 'height', dataType: 'double' }],
            access: 'public',
          },
        ],
        members: [],
      },
    ];

    const result = generator.generate(node, context, helpers);

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toContain('auto class_method_result_classmethodcall1 = player.jump(2.5);');
    expect((helpers.addError as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('should report error when configured class is missing', () => {
    const node = createMockNode('ClassMethodCall', 'Call Method', {
      properties: {
        classId: 'class-missing',
        methodId: 'method-jump',
      },
    });
    const helpers = createMockHelpers();
    const context = createMockContext();

    const result = generator.generate(node, context, helpers);

    expect(result.lines).toHaveLength(0);
    expect(helpers.addError).toHaveBeenCalledWith(
      node.id,
      'TYPE_MISMATCH',
      expect.stringContaining('Класс для вызова не найден'),
      expect.stringContaining('Class not found')
    );
  });

  it('should resolve method arguments by param-id based port first', () => {
    const node = createMockNode('ClassMethodCall', 'Call Method', {
      properties: {
        classId: 'class-player',
        methodId: 'method-jump',
      },
      inputs: [
        { id: 'exec-in', name: 'In', dataType: 'execution', direction: 'input', index: 0 },
        { id: 'target', name: 'Target', dataType: 'class', direction: 'input', index: 1 },
        { id: 'arg-param-height', name: 'Height', dataType: 'double', direction: 'input', index: 2 },
      ],
    });

    const helpers = createMockHelpers({
      getInputExpression: vi.fn((n: BlueprintNode, suffix: string) => {
        if (n.id !== node.id) {
          return null;
        }
        if (suffix === 'target') return 'player';
        if (suffix === 'arg-param-height') return '8.0';
        return null;
      }),
    });
    const context = createMockContext();
    context.graph.classes = [
      {
        id: 'class-player',
        name: 'Player',
        methods: [
          {
            id: 'method-jump',
            name: 'Jump',
            returnType: 'bool',
            params: [{ id: 'param-height', name: 'height', dataType: 'double' }],
            access: 'public',
          },
        ],
        members: [],
      },
    ];

    const result = generator.generate(node, context, helpers);
    expect(result.lines[0]).toContain('player.jump(8.0)');
  });
});

describe('Class nodes generators', () => {
  it('should generate constructor call for class', () => {
    const generator = new ClassConstructorCallNodeGenerator();
    const node = createMockNode('ClassConstructorCall', 'Construct', {
      id: 'ctor-1',
      properties: { classId: 'class-player' },
    });
    const context = createMockContext();
    context.graph.classes = [
      { id: 'class-player', name: 'Player', members: [], methods: [] },
    ];
    const helpers = createMockHelpers();

    const result = generator.generate(node, context, helpers);

    expect(result.lines[0]).toContain('player class_instance_ctor1{};');
  });

  it('should generate member access expression for GetMember', () => {
    const generator = new GetMemberNodeGenerator();
    const node = createMockNode('GetMember', 'Get Member', {
      properties: { classId: 'class-player', memberId: 'member-score' },
    });
    const context = createMockContext();
    context.graph.classes = [
      {
        id: 'class-player',
        name: 'Player',
        members: [{ id: 'member-score', name: 'Score', dataType: 'int32', access: 'public' }],
        methods: [],
      },
    ];
    const helpers = createMockHelpers({
      getInputExpression: vi.fn((_n, suffix) => (suffix === 'target' ? 'player' : null)),
    });

    const expr = generator.getOutputExpression(node, 'value', context, helpers);

    expect(expr).toBe('player.score');
  });

  it('should report error for GetMember when member binding is invalid', () => {
    const generator = new GetMemberNodeGenerator();
    const node = createMockNode('GetMember', 'Get Member', {
      properties: { classId: 'class-player', memberId: 'member-missing' },
    });
    const context = createMockContext();
    context.graph.classes = [
      { id: 'class-player', name: 'Player', members: [], methods: [] },
    ];
    const helpers = createMockHelpers();

    const expr = generator.getOutputExpression(node, 'value', context, helpers);

    expect(expr).toBe('0');
    expect(helpers.addError).toHaveBeenCalledWith(
      node.id,
      'TYPE_MISMATCH',
      expect.stringContaining('Поле класса не найдено'),
      expect.stringContaining('Class member not found')
    );
  });

  it('should generate SetMember assignment', () => {
    const generator = new SetMemberNodeGenerator();
    const node = createMockNode('SetMember', 'Set Member', {
      properties: { classId: 'class-player', memberId: 'member-score' },
    });
    const context = createMockContext();
    context.graph.classes = [
      {
        id: 'class-player',
        name: 'Player',
        members: [{ id: 'member-score', name: 'Score', dataType: 'int32', access: 'public' }],
        methods: [],
      },
    ];
    const helpers = createMockHelpers({
      getInputExpression: vi.fn((_n, suffix) => {
        if (suffix === 'target') return 'player';
        if (suffix === 'value') return '42';
        return null;
      }),
    });

    const result = generator.generate(node, context, helpers);
    expect(result.lines[0]).toContain('player.score = 42;');
  });

  it('should generate static method call', () => {
    const generator = new StaticMethodCallNodeGenerator();
    const node = createMockNode('StaticMethodCall', 'Call Static', {
      id: 'static-1',
      properties: { classId: 'class-player', methodId: 'method-make' },
    });
    const context = createMockContext();
    context.graph.classes = [
      {
        id: 'class-player',
        name: 'Player',
        members: [],
        methods: [
          {
            id: 'method-make',
            name: 'Create',
            isStatic: true,
            returnType: 'int32',
            params: [],
            access: 'public',
          },
        ],
      },
    ];
    const helpers = createMockHelpers();

    const result = generator.generate(node, context, helpers);
    expect(result.lines[0]).toContain('auto static_method_result_static1 = player::create();');
  });

  it('should report error for StaticMethodCall when method is not static', () => {
    const generator = new StaticMethodCallNodeGenerator();
    const node = createMockNode('StaticMethodCall', 'Call Static', {
      properties: { classId: 'class-player', methodId: 'method-run' },
    });
    const context = createMockContext();
    context.graph.classes = [
      {
        id: 'class-player',
        name: 'Player',
        members: [],
        methods: [
          { id: 'method-run', name: 'Run', returnType: 'execution', params: [], access: 'public' },
        ],
      },
    ];
    const helpers = createMockHelpers();

    const result = generator.generate(node, context, helpers);
    expect(result.lines).toHaveLength(0);
    expect(helpers.addError).toHaveBeenCalledWith(
      node.id,
      'TYPE_MISMATCH',
      expect.stringContaining('не является статическим'),
      expect.stringContaining('is not static')
    );
  });

  it('should generate base method call for override node', () => {
    const generator = new CallBaseMethodNodeGenerator();
    const node = createMockNode('CallBaseMethod', 'Base Call', {
      id: 'basecall-1',
      properties: { classId: 'class-player', methodId: 'method-tick', baseClassName: 'ActorBase' },
    });
    const context = createMockContext();
    context.graph.classes = [createPlayerClassFixture()];
    const helpers = createMockHelpers({
      getInputExpression: vi.fn((_n, suffix) => {
        if (suffix === 'target') return 'player';
        if (suffix === 'arg-param-speed') return '9.0f';
        return null;
      }),
    });

    const result = generator.generate(node, context, helpers);
    expect(result.lines[0]).toContain('auto base_method_result_basecall1 = player.ActorBase::tick(9.0f);');
  });

  it('should generate pointer cast expressions for advanced cast nodes', () => {
    const context = createMockContext();
    context.graph.classes = [createPlayerClassFixture()];
    const helpers = createMockHelpers({
      getInputExpression: vi.fn((_n, suffix) => (suffix === 'value' ? 'base_ptr' : null)),
    });

    const staticExpr = new CastStaticNodeGenerator().getOutputExpression(
      createMockNode('CastStatic', 'static_cast', { properties: { classId: 'class-player' } }),
      'result',
      context,
      helpers,
    );
    const dynamicExpr = new CastDynamicNodeGenerator().getOutputExpression(
      createMockNode('CastDynamic', 'dynamic_cast', { properties: { classId: 'class-player' } }),
      'result',
      context,
      helpers,
    );
    const constExpr = new CastConstNodeGenerator().getOutputExpression(
      createMockNode('CastConst', 'const_cast', { properties: { classId: 'class-player' } }),
      'result',
      context,
      helpers,
    );

    expect(staticExpr).toBe('static_cast<player*>(base_ptr)');
    expect(dynamicExpr).toBe('dynamic_cast<player*>(base_ptr)');
    expect(constExpr).toBe('const_cast<player*>(base_ptr)');
  });

  it('should generate make_unique/make_shared expressions using constructor params', () => {
    const context = createMockContext();
    context.graph.classes = [createPlayerClassFixture()];
    const helpers = createMockHelpers({
      getInputExpression: vi.fn((_n, suffix) => (suffix === 'arg-param-seed' ? '17' : null)),
    });

    const uniqueExpr = new MakeUniqueNodeGenerator().getOutputExpression(
      createMockNode('MakeUnique', 'Make Unique', { properties: { classId: 'class-player', methodId: 'ctor-main' } }),
      'result',
      context,
      helpers,
    );
    const sharedExpr = new MakeSharedNodeGenerator().getOutputExpression(
      createMockNode('MakeShared', 'Make Shared', { properties: { classId: 'class-player', methodId: 'ctor-main' } }),
      'result',
      context,
      helpers,
    );

    expect(uniqueExpr).toBe('std::make_unique<player>(17)');
    expect(sharedExpr).toBe('std::make_shared<player>(17)');
  });

  it('should generate delete-object code and warning', () => {
    const generator = new DeleteObjectNodeGenerator();
    const node = createMockNode('DeleteObject', 'Delete', { properties: { classId: 'class-player' } });
    const context = createMockContext();
    context.graph.classes = [createPlayerClassFixture()];
    const helpers = createMockHelpers({
      getInputExpression: vi.fn((_n, suffix) => (suffix === 'target' ? 'raw_ptr' : null)),
    });

    const result = generator.generate(node, context, helpers);
    expect(result.lines[0]).toContain('delete raw_ptr;');
    expect(helpers.addWarning).toHaveBeenCalledWith(
      node.id,
      'DANGEROUS_OPERATION',
      expect.stringContaining('raw delete')
    );
  });

  it('should generate address-of-member, init-list and is-type expressions', () => {
    const context = createMockContext();
    context.graph.classes = [createPlayerClassFixture()];
    const helpers = createMockHelpers({
      getInputExpression: vi.fn((_n, suffix) => {
        if (suffix === 'target') return 'player';
        if (suffix === 'value') return 'maybe_player';
        if (suffix === 'init-member-member-score') return '42';
        if (suffix === 'init-member-member-total') return '100';
        return null;
      }),
    });

    const addressExpr = new AddressOfMemberNodeGenerator().getOutputExpression(
      createMockNode('AddressOfMember', 'Address Of Member', { properties: { classId: 'class-player', memberId: 'member-score' } }),
      'result',
      context,
      helpers,
    );
    const initExpr = new InitListCtorNodeGenerator().getOutputExpression(
      createMockNode('InitListCtor', 'Init List', { properties: { classId: 'class-player' } }),
      'instance',
      context,
      helpers,
    );
    const isTypeExpr = new IsTypeNodeGenerator().getOutputExpression(
      createMockNode('IsType', 'Is Type', { properties: { classId: 'class-player' } }),
      'result',
      context,
      helpers,
    );

    expect(addressExpr).toBe('&(player.score)');
    expect(initExpr).toBe('player{42, 100}');
    expect(isTypeExpr).toBe('dynamic_cast<player*>(maybe_player) != nullptr');
  });
});

// ============================================
// createVariableGenerators Tests
// ============================================

describe('createVariableGenerators', () => {
  it('should return array with all variable generators', () => {
    const generators = createVariableGenerators();

    expect(generators).toHaveLength(22);
    expect(generators[0]).toBeInstanceOf(VariableNodeGenerator);
    expect(generators[1]).toBeInstanceOf(GetVariableNodeGenerator);
    expect(generators[2]).toBeInstanceOf(SetVariableNodeGenerator);
    expect(generators[3]).toBeInstanceOf(ClassMethodCallNodeGenerator);
    expect(generators[4]).toBeInstanceOf(ClassConstructorCallNodeGenerator);
    expect(generators[5]).toBeInstanceOf(ConstructorOverloadCallNodeGenerator);
    expect(generators[6]).toBeInstanceOf(CallBaseMethodNodeGenerator);
    expect(generators[7]).toBeInstanceOf(GetMemberNodeGenerator);
    expect(generators[8]).toBeInstanceOf(SetMemberNodeGenerator);
    expect(generators[9]).toBeInstanceOf(StaticGetMemberNodeGenerator);
    expect(generators[10]).toBeInstanceOf(StaticSetMemberNodeGenerator);
    expect(generators[11]).toBeInstanceOf(StaticMethodCallNodeGenerator);
    expect(generators[12]).toBeInstanceOf(CastStaticNodeGenerator);
    expect(generators[13]).toBeInstanceOf(CastDynamicNodeGenerator);
    expect(generators[14]).toBeInstanceOf(CastConstNodeGenerator);
    expect(generators[15]).toBeInstanceOf(IsTypeNodeGenerator);
    expect(generators[16]).toBeInstanceOf(MakeUniqueNodeGenerator);
    expect(generators[17]).toBeInstanceOf(MakeSharedNodeGenerator);
    expect(generators[18]).toBeInstanceOf(DeleteObjectNodeGenerator);
    expect(generators[19]).toBeInstanceOf(AddressOfMemberNodeGenerator);
    expect(generators[20]).toBeInstanceOf(InitListCtorNodeGenerator);
    expect(generators[21]).toBeInstanceOf(TypeConversionNodeGenerator);
  });
});
