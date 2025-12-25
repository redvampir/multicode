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
  createVariableGenerators,
} from './variables';
import type { BlueprintNode } from '../../shared/blueprintTypes';
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
});

// ============================================
// createVariableGenerators Tests
// ============================================

describe('createVariableGenerators', () => {
  it('should return array with all variable generators', () => {
    const generators = createVariableGenerators();

    expect(generators).toHaveLength(3);
    expect(generators[0]).toBeInstanceOf(VariableNodeGenerator);
    expect(generators[1]).toBeInstanceOf(GetVariableNodeGenerator);
    expect(generators[2]).toBeInstanceOf(SetVariableNodeGenerator);
  });
});
