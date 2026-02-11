/**
 * Тесты для генераторов other.ts
 * 
 * Прямые unit-тесты для Comment, Reroute и Fallback генераторов
 */

import { describe, it, expect, vi } from 'vitest';
import { 
  CommentNodeGenerator,
  RerouteNodeGenerator,
  FallbackNodeGenerator,
  createOtherGenerators,
} from './other';
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
    inputs: [],
    outputs: [],
    ...options,
  };
}

// ============================================
// CommentNodeGenerator Tests
// ============================================

describe('CommentNodeGenerator', () => {
  const generator = new CommentNodeGenerator();

  it('should support Comment node type', () => {
    expect(generator.nodeTypes).toContain('Comment');
  });

  it('should generate single line comment', () => {
    const node = createMockNode('Comment', 'Test Label', {
      comment: 'This is a single line comment',
    });
    const helpers = createMockHelpers();
    const context = createMockContext();

    const result = generator.generate(node, context, helpers);

    expect(result.lines).toContain('    // This is a single line comment');
    expect(result.followExecutionFlow).toBe(false);
  });

  it('should generate multiline comment', () => {
    const node = createMockNode('Comment', 'Test', {
      comment: 'Line 1\nLine 2\nLine 3',
    });
    const helpers = createMockHelpers();
    const context = createMockContext();

    const result = generator.generate(node, context, helpers);

    expect(result.lines).toHaveLength(3);
    expect(result.lines[0]).toBe('    // Line 1');
    expect(result.lines[1]).toBe('    // Line 2');
    expect(result.lines[2]).toBe('    // Line 3');
  });

  it('should use label if comment is not set', () => {
    const node = createMockNode('Comment', 'Fallback Label');
    const helpers = createMockHelpers();
    const context = createMockContext();

    const result = generator.generate(node, context, helpers);

    expect(result.lines).toContain('    // Fallback Label');
  });

  it('should return empty lines if no text', () => {
    const node = createMockNode('Comment', '', { comment: '' });
    const helpers = createMockHelpers();
    const context = createMockContext();

    const result = generator.generate(node, context, helpers);

    expect(result.lines).toHaveLength(0);
    expect(result.followExecutionFlow).toBe(false);
  });
});

// ============================================
// RerouteNodeGenerator Tests
// ============================================

describe('RerouteNodeGenerator', () => {
  const generator = new RerouteNodeGenerator();

  it('should support Reroute node type', () => {
    expect(generator.nodeTypes).toContain('Reroute');
  });

  it('should generate noop (no code)', () => {
    const result = generator.generate();

    expect(result.lines).toHaveLength(0);
    expect(result.followExecutionFlow).toBe(true);
  });

  it('should pass through input expression', () => {
    const node = createMockNode('Reroute', 'Reroute');
    const helpers = createMockHelpers({
      getInputExpression: vi.fn().mockReturnValue('someValue'),
    });
    const context = createMockContext();

    const expr = generator.getOutputExpression(node, 'out', context, helpers);

    expect(expr).toBe('someValue');
    expect(helpers.getInputExpression).toHaveBeenCalledWith(node, 'in');
  });

  it('should return 0 if no input connected', () => {
    const node = createMockNode('Reroute', 'Reroute');
    const helpers = createMockHelpers({
      getInputExpression: vi.fn().mockReturnValue(null),
    });
    const context = createMockContext();

    const expr = generator.getOutputExpression(node, 'out', context, helpers);

    expect(expr).toBe('0');
  });
});

// ============================================
// FallbackNodeGenerator Tests
// ============================================

describe('FallbackNodeGenerator', () => {
  const generator = new FallbackNodeGenerator();

  it('should support Custom, Function, FunctionCall, Event types', () => {
    expect(generator.nodeTypes).toContain('Custom');
    expect(generator.nodeTypes).toContain('Function');
    expect(generator.nodeTypes).toContain('FunctionCall');
    expect(generator.nodeTypes).toContain('Event');
  });

  it('should return structured error for Custom node', () => {
    const node = createMockNode('Custom', 'MyCustomNode');
    const helpers = createMockHelpers();
    const context = createMockContext();

    const result = generator.generate(node, context, helpers);

    expect(result.lines).toHaveLength(0);
    expect(result.followExecutionFlow).toBe(true);
    expect(helpers.addError).toHaveBeenCalledWith(
      'custom-1',
      'UNKNOWN_NODE_TYPE',
      'Узел Custom "MyCustomNode" пока не поддерживается C++ генератором',
      'Custom node "MyCustomNode" is not yet supported by C++ generator'
    );
  });

  it('should return structured error for Function node', () => {
    const node = createMockNode('Function', 'CalculateSum');
    const helpers = createMockHelpers();
    const context = createMockContext();

    const result = generator.generate(node, context, helpers);

    expect(result.lines).toHaveLength(0);
    expect(helpers.addError).toHaveBeenCalledWith(
      'function-1',
      'UNKNOWN_NODE_TYPE',
      'Узел Function "CalculateSum" пока не поддерживается C++ генератором',
      'Function node "CalculateSum" is not yet supported by C++ generator'
    );
  });

  it('should return structured error for Event node', () => {
    const node = createMockNode('Event', 'OnClick');
    const helpers = createMockHelpers();
    const context = createMockContext();

    const result = generator.generate(node, context, helpers);

    expect(result.lines).toHaveLength(0);
    expect(helpers.addError).toHaveBeenCalledWith(
      'event-1',
      'UNKNOWN_NODE_TYPE',
      'Узел Event "OnClick" пока не поддерживается C++ генератором',
      'Event node "OnClick" is not yet supported by C++ generator'
    );
  });
});

// ============================================
// createOtherGenerators Tests
// ============================================

describe('createOtherGenerators', () => {
  it('should return array with all other generators', () => {
    const generators = createOtherGenerators();

    expect(generators).toHaveLength(3);
    expect(generators[0]).toBeInstanceOf(CommentNodeGenerator);
    expect(generators[1]).toBeInstanceOf(RerouteNodeGenerator);
    expect(generators[2]).toBeInstanceOf(FallbackNodeGenerator);
  });
});
