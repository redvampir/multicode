/**
 * Тесты для генераторов other.ts
 * 
 * Прямые unit-тесты для Comment, Reroute и Fallback генераторов
 */

import { describe, it, expect, vi } from 'vitest';
import { 
  CommentNodeGenerator,
  RerouteNodeGenerator,
  StringConcatNodeGenerator,
  StringLengthNodeGenerator,
  SubstringNodeGenerator,
  ContainsNodeGenerator,
  SplitNodeGenerator,
  TrimNodeGenerator,
  MakeArrayNodeGenerator,
  ArrayGetNodeGenerator,
  ArraySetNodeGenerator,
  ArrayPushBackNodeGenerator,
  ArraySizeNodeGenerator,
  ArrayClearNodeGenerator,
  RandomFromArrayNodeGenerator,
  MakeExpectedNodeGenerator,
  ExpectedHasValueNodeGenerator,
  ExpectedValueNodeGenerator,
  ExpectedErrorNodeGenerator,
  MakeOptionalNodeGenerator,
  OptionalHasValueNodeGenerator,
  OptionalValueOrNodeGenerator,
  MakeVariantNodeGenerator,
  HoldsAlternativeNodeGenerator,
  VisitVariantNodeGenerator,
  FormatNodeGenerator,
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
    supportedNodeTypes: ['Start', 'End', 'Print', 'Branch'],
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
// Array generators
// ============================================

describe('Array generators', () => {
  it('String utilities build expected expressions', () => {
    const concatGenerator = new StringConcatNodeGenerator();
    const lengthGenerator = new StringLengthNodeGenerator();
    const substringGenerator = new SubstringNodeGenerator();
    const containsGenerator = new ContainsNodeGenerator();
    const trimGenerator = new TrimNodeGenerator();
    const helpers = createMockHelpers({
      getInputExpression: vi.fn((_: BlueprintNode, portId: string) => {
        if (portId === 'a') return 'leftExpr';
        if (portId === 'b') return 'rightExpr';
        if (portId === 'value') return 'rawValue';
        if (portId === 'search') return '"needle"';
        if (portId === 'start') return '2';
        if (portId === 'length') return '4';
        return null;
      }),
    });
    const context = createMockContext();

    const concatNode = createMockNode('StringConcat', 'Concat', {
      inputs: [
        { id: 'a', name: 'A', dataType: 'string', direction: 'input', index: 0 },
        { id: 'b', name: 'B', dataType: 'string', direction: 'input', index: 1 },
      ],
      outputs: [{ id: 'result', name: 'Result', dataType: 'string', direction: 'output', index: 0 }],
    });
    const stringNode = createMockNode('StringLength', 'Length', {
      inputs: [{ id: 'value', name: 'String', dataType: 'string', direction: 'input', index: 0 }],
      outputs: [{ id: 'length', name: 'Length', dataType: 'int32', direction: 'output', index: 0 }],
    });
    const substringNode = createMockNode('Substring', 'Substring', {
      inputs: [
        { id: 'value', name: 'String', dataType: 'string', direction: 'input', index: 0 },
        { id: 'start', name: 'Start', dataType: 'int32', direction: 'input', index: 1 },
        { id: 'length', name: 'Length', dataType: 'int32', direction: 'input', index: 2 },
      ],
      outputs: [{ id: 'result', name: 'Result', dataType: 'string', direction: 'output', index: 0 }],
    });
    const containsNode = createMockNode('Contains', 'Contains', {
      inputs: [
        { id: 'value', name: 'String', dataType: 'string', direction: 'input', index: 0 },
        { id: 'search', name: 'Search', dataType: 'string', direction: 'input', index: 1 },
      ],
      outputs: [{ id: 'result', name: 'Found', dataType: 'bool', direction: 'output', index: 0 }],
    });
    const trimNode = createMockNode('Trim', 'Trim', {
      inputs: [{ id: 'value', name: 'String', dataType: 'string', direction: 'input', index: 0 }],
      outputs: [{ id: 'result', name: 'Result', dataType: 'string', direction: 'output', index: 0 }],
    });

    expect(concatGenerator.getOutputExpression(concatNode, 'result', context, helpers)).toContain('multicode_left + multicode_right');
    expect(lengthGenerator.getOutputExpression(stringNode, 'length', context, helpers)).toContain('static_cast<int>(multicode_value.size())');
    expect(substringGenerator.getOutputExpression(substringNode, 'result', context, helpers)).toContain('multicode_value.substr(multicode_offset, multicode_count)');
    expect(containsGenerator.getOutputExpression(containsNode, 'result', context, helpers)).toContain('multicode_value.find(multicode_search) != std::string::npos');
    expect(trimGenerator.getOutputExpression(trimNode, 'result', context, helpers)).toContain('find_first_not_of(" \\t\\n\\r\\f\\v")');
  });

  it('Split handles delimiter and empty-delimiter fallback', () => {
    const generator = new SplitNodeGenerator();
    const helpers = createMockHelpers({
      getInputExpression: vi.fn((_: BlueprintNode, portId: string) => {
        if (portId === 'value') {
          return 'rawValue';
        }
        if (portId === 'delimiter') {
          return '"-"';
        }
        return null;
      }),
    });
    const context = createMockContext();
    const node = createMockNode('Split', 'Split', {
      inputs: [
        { id: 'value', name: 'String', dataType: 'string', direction: 'input', index: 0 },
        { id: 'delimiter', name: 'Delimiter', dataType: 'string', direction: 'input', index: 1 },
      ],
      outputs: [{ id: 'result', name: 'Items', dataType: 'array', direction: 'output', index: 0 }],
    });

    const expression = generator.getOutputExpression(node, 'result', context, helpers);

    expect(expression).toContain('std::vector<std::string> multicode_parts;');
    expect(expression).toContain('if (multicode_delimiter.empty())');
    expect(expression).toContain('multicode_value.find(multicode_delimiter, multicode_start)');
  });

  it('MakeArray keeps item order and ArraySize/ArrayClear operate on cloned array', () => {
    const makeArrayGenerator = new MakeArrayNodeGenerator();
    const sizeGenerator = new ArraySizeNodeGenerator();
    const clearGenerator = new ArrayClearNodeGenerator();
    const helpers = createMockHelpers({
      getInputExpression: vi.fn((_: BlueprintNode, portId: string) => {
        if (portId === 'node-make-item-0') {
          return '"alpha"';
        }
        if (portId === 'node-make-item-1') {
          return '"beta"';
        }
        if (portId === 'array') {
          return 'items';
        }
        return null;
      }),
    });
    const context = createMockContext();

    const makeArrayNode = createMockNode('MakeArray', 'Make Array', {
      id: 'node-make',
      inputs: [
        { id: 'node-make-item-0', name: 'Item 0', dataType: 'any', direction: 'input', index: 0 },
        { id: 'node-make-item-1', name: 'Item 1', dataType: 'any', direction: 'input', index: 1 },
      ],
      outputs: [{ id: 'node-make-array', name: 'Array', dataType: 'array', direction: 'output', index: 0 }],
    });
    const arrayNode = createMockNode('ArraySize', 'Array Size', {
      inputs: [{ id: 'array', name: 'Array', dataType: 'array', direction: 'input', index: 0 }],
      outputs: [{ id: 'size', name: 'Size', dataType: 'int32', direction: 'output', index: 0 }],
    });
    const clearNode = createMockNode('ArrayClear', 'Array Clear', {
      inputs: [{ id: 'array', name: 'Array', dataType: 'array', direction: 'input', index: 0 }],
      outputs: [{ id: 'array-out', name: 'Array', dataType: 'array', direction: 'output', index: 0 }],
    });

    expect(makeArrayGenerator.getOutputExpression(makeArrayNode, 'node-make-array', context, helpers)).toBe('(std::vector{"alpha", "beta"})');
    expect(sizeGenerator.getOutputExpression(arrayNode, 'size', context, helpers)).toContain('static_cast<int>(multicode_array.size())');
    expect(clearGenerator.getOutputExpression(clearNode, 'array-out', context, helpers)).toContain('multicode_array.clear();');
  });

  it('RandomFromArray returns guarded random element expression', () => {
    const generator = new RandomFromArrayNodeGenerator();
    const helpers = createMockHelpers({
      getInputExpression: vi.fn((_: BlueprintNode, portId: string) => {
        if (portId === 'array') {
          return 'items';
        }
        return null;
      }),
    });
    const context = createMockContext();
    const node = createMockNode('RandomFromArray', 'Random From Array', {
      inputs: [{ id: 'array', name: 'Array', dataType: 'array', direction: 'input', index: 0 }],
      outputs: [{ id: 'value', name: 'Value', dataType: 'any', direction: 'output', index: 0 }],
    });

    const expression = generator.getOutputExpression(node, 'value', context, helpers);

    expect(expression).toContain('using MulticodeValue = std::decay_t<decltype(multicode_array[0])>;');
    expect(expression).toContain('if constexpr (std::is_convertible_v<MulticodeValue, const char*>) { return ""; }');
    expect(expression).toContain('std::mt19937 multicode_rng(std::random_device{}())');
    expect(expression).toContain('std::uniform_int_distribution<int> multicode_dist(0, static_cast<int>(multicode_array.size()) - 1);');
  });

  it('ArrayGet uses bounds guard and fallback in debug/recovery mode', () => {
    const generator = new ArrayGetNodeGenerator();
    const helpers = createMockHelpers({
      getInputExpression: vi.fn((_: BlueprintNode, portId: string) => {
        if (portId === 'array') {
          return 'numbers';
        }
        if (portId === 'index') {
          return 'idx';
        }
        return null;
      }),
    });
    const context = createMockContext();
    context.options.includeSourceMarkers = true;
    const node = createMockNode('ArrayGet', 'Array Get', {
      inputs: [
        { id: 'array', name: 'Array', dataType: 'array', direction: 'input', index: 0 },
        { id: 'index', name: 'Index', dataType: 'int32', direction: 'input', index: 1 },
      ],
      outputs: [{ id: 'value', name: 'Value', dataType: 'any', direction: 'output', index: 0 }],
    });

    const expression = generator.getOutputExpression(node, 'value', context, helpers);

    expect(expression).toContain('multicode_index < 0 || multicode_index >= static_cast<int>(multicode_array.size())');
    expect(expression).toContain('MulticodeValue{}');
  });

  it('ArraySet uses guarded assignment in debug/recovery mode', () => {
    const generator = new ArraySetNodeGenerator();
    const helpers = createMockHelpers({
      getInputExpression: vi.fn((_: BlueprintNode, portId: string) => {
        if (portId === 'array') {
          return 'numbers';
        }
        if (portId === 'index') {
          return 'idx';
        }
        if (portId === 'value') {
          return 'nextValue';
        }
        return null;
      }),
    });
    const context = createMockContext();
    context.options.includeSourceMarkers = true;
    const node = createMockNode('ArraySet', 'Array Set', {
      inputs: [
        { id: 'array', name: 'Array', dataType: 'array', direction: 'input', index: 0 },
        { id: 'index', name: 'Index', dataType: 'int32', direction: 'input', index: 1 },
        { id: 'value', name: 'Value', dataType: 'any', direction: 'input', index: 2 },
      ],
      outputs: [{ id: 'array-out', name: 'Array', dataType: 'array', direction: 'output', index: 0 }],
    });

    const expression = generator.getOutputExpression(node, 'array-out', context, helpers);

    expect(expression).toContain('if (multicode_index < 0 || multicode_index >= static_cast<int>(multicode_array.size())) { return multicode_array; }');
    expect(expression).toContain('multicode_array[static_cast<std::size_t>(multicode_index)] = nextValue;');
  });

  it('ArrayPushBack appends and returns cloned array expression', () => {
    const generator = new ArrayPushBackNodeGenerator();
    const helpers = createMockHelpers({
      getInputExpression: vi.fn((_: BlueprintNode, portId: string) => {
        if (portId === 'array') {
          return 'numbers';
        }
        if (portId === 'value') {
          return 'nextValue';
        }
        return null;
      }),
    });
    const context = createMockContext();
    const node = createMockNode('ArrayPushBack', 'Array Push Back', {
      inputs: [
        { id: 'array', name: 'Array', dataType: 'array', direction: 'input', index: 0 },
        { id: 'value', name: 'Value', dataType: 'any', direction: 'input', index: 1 },
      ],
      outputs: [{ id: 'array-out', name: 'Array', dataType: 'array', direction: 'output', index: 0 }],
    });

    const expression = generator.getOutputExpression(node, 'array-out', context, helpers);

    expect(expression).toContain('multicode_array.push_back(nextValue);');
    expect(expression).toContain('return multicode_array;');
  });
});



describe('Expected/Optional/Variant/Format generators', () => {
  it('ExpectedValue returns default constructed value in debug/recovery mode when expected is empty', () => {
    const generator = new ExpectedValueNodeGenerator();
    const helpers = createMockHelpers({
      getInputExpression: vi.fn().mockReturnValue('maybeResult'),
    });
    const context = createMockContext();
    context.options.includeSourceMarkers = true;
    const node = createMockNode('ExpectedValue', 'Expected Value', {
      inputs: [{ id: 'expected', name: 'Expected', dataType: 'any', direction: 'input', index: 0 }],
      outputs: [{ id: 'value', name: 'Value', dataType: 'any', direction: 'output', index: 0 }],
    });

    const expression = generator.getOutputExpression(node, 'value', context, helpers);

    expect(expression).toContain('if (!multicode_expected.has_value())');
    expect(expression).toContain('value_type{}');
  });

  it('OptionalValueOr adds explicit missing-value branch in debug/recovery mode', () => {
    const generator = new OptionalValueOrNodeGenerator();
    const helpers = createMockHelpers({
      getInputExpression: vi.fn((_: BlueprintNode, portId: string) => {
        if (portId === 'optional') {
          return 'maybeName';
        }
        if (portId === 'fallback') {
          return '"unknown"';
        }
        return null;
      }),
    });
    const context = createMockContext();
    context.options.includeSourceMarkers = true;
    const node = createMockNode('OptionalValueOr', 'Optional Value Or', {
      inputs: [
        { id: 'optional', name: 'Optional', dataType: 'any', direction: 'input', index: 0 },
        { id: 'fallback', name: 'Fallback', dataType: 'any', direction: 'input', index: 1 },
      ],
      outputs: [{ id: 'value', name: 'Value', dataType: 'any', direction: 'output', index: 0 }],
    });

    const expression = generator.getOutputExpression(node, 'value', context, helpers);

    expect(expression).toContain('if (!multicode_optional.has_value())');
    expect(expression).toContain('return "unknown";');
  });

  it('Format builds std::format call with dynamic args', () => {
    const generator = new FormatNodeGenerator();
    const helpers = createMockHelpers({
      getInputExpression: vi.fn((_: BlueprintNode, portId: string) => {
        if (portId === 'format') {
          return '"{} -> {}"';
        }
        if (portId === 'arg-0') {
          return 'lhs';
        }
        if (portId === 'arg-1') {
          return 'rhs';
        }
        return null;
      }),
    });
    const context = createMockContext();
    const node = createMockNode('Format', 'Format', {
      inputs: [
        { id: 'format', name: 'Format', dataType: 'string', direction: 'input', index: 0 },
        { id: 'arg-0', name: 'Arg 0', dataType: 'any', direction: 'input', index: 1 },
        { id: 'arg-1', name: 'Arg 1', dataType: 'any', direction: 'input', index: 2 },
      ],
      outputs: [{ id: 'result', name: 'Result', dataType: 'string', direction: 'output', index: 0 }],
    });

    const expression = generator.getOutputExpression(node, 'result', context, helpers);
    expect(expression).toContain('std::format("{} -> {}", lhs, rhs)');
  });

  it('MakeExpected / Optional / Variant / Holds / Visit expressions use C++23 containers', () => {
    const context = createMockContext();
    const helpers = createMockHelpers({
      getInputExpression: vi.fn((_: BlueprintNode, portId: string) => {
        if (portId === 'value') return 'valueExpr';
        if (portId === 'error') return 'errorExpr';
        if (portId === 'has-value') return 'flagExpr';
        if (portId === 'variant') return 'variantExpr';
        if (portId === 'index') return '2';
        return null;
      }),
    });

    const makeExpectedExpr = new MakeExpectedNodeGenerator().getOutputExpression(createMockNode('MakeExpected', 'MakeExpected'), 'expected', context, helpers);
    const hasValueExpr = new ExpectedHasValueNodeGenerator().getOutputExpression(createMockNode('ExpectedHasValue', 'ExpectedHasValue'), 'result', context, helpers);
    const errorExpr = new ExpectedErrorNodeGenerator().getOutputExpression(createMockNode('ExpectedError', 'ExpectedError'), 'error', context, helpers);
    const makeOptionalExpr = new MakeOptionalNodeGenerator().getOutputExpression(createMockNode('MakeOptional', 'MakeOptional'), 'optional', context, helpers);
    const optionalHasValueExpr = new OptionalHasValueNodeGenerator().getOutputExpression(createMockNode('OptionalHasValue', 'OptionalHasValue'), 'result', context, helpers);
    const makeVariantExpr = new MakeVariantNodeGenerator().getOutputExpression(createMockNode('MakeVariant', 'MakeVariant'), 'variant', context, helpers);
    const holdsExpr = new HoldsAlternativeNodeGenerator().getOutputExpression(createMockNode('HoldsAlternative', 'HoldsAlternative'), 'result', context, helpers);
    const visitExpr = new VisitVariantNodeGenerator().getOutputExpression(createMockNode('VisitVariant', 'VisitVariant'), 'value', context, helpers);

    expect(makeExpectedExpr).toContain('std::expected');
    expect(hasValueExpr).toContain('.has_value()');
    expect(errorExpr).toContain('.error()');
    expect(makeOptionalExpr).toContain('std::optional');
    expect(optionalHasValueExpr).toContain('.has_value()');
    expect(makeVariantExpr).toContain('std::variant');
    expect(holdsExpr).toContain('.index()');
    expect(visitExpr).toContain('std::visit');
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
      'UNIMPLEMENTED_NODE_TYPE',
      'Неподдерживаемый узел для C++ генератора: id=custom-1, type=Custom, label="MyCustomNode". Поддерживаемые типы: Branch, End, Print, Start. Подсказка: проверьте поддерживаемые типы узлов.',
      'Unsupported node for C++ generator: id=custom-1, type=Custom, label="MyCustomNode". Supported types: Branch, End, Print, Start. Hint: check supported node types.'
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
      'UNIMPLEMENTED_NODE_TYPE',
      'Неподдерживаемый узел для C++ генератора: id=function-1, type=Function, label="CalculateSum". Поддерживаемые типы: Branch, End, Print, Start. Подсказка: проверьте поддерживаемые типы узлов.',
      'Unsupported node for C++ generator: id=function-1, type=Function, label="CalculateSum". Supported types: Branch, End, Print, Start. Hint: check supported node types.'
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
      'UNIMPLEMENTED_NODE_TYPE',
      'Неподдерживаемый узел для C++ генератора: id=event-1, type=Event, label="OnClick". Поддерживаемые типы: Branch, End, Print, Start. Подсказка: проверьте поддерживаемые типы узлов.',
      'Unsupported node for C++ generator: id=event-1, type=Event, label="OnClick". Supported types: Branch, End, Print, Start. Hint: check supported node types.'
    );
  });

  it('should keep identical message format for FunctionCall node', () => {
    const node = createMockNode('FunctionCall', 'InvokeSomething');
    const helpers = createMockHelpers();
    const context = createMockContext();

    generator.generate(node, context, helpers);

    expect(helpers.addError).toHaveBeenCalledWith(
      'functioncall-1',
      'UNIMPLEMENTED_NODE_TYPE',
      'Неподдерживаемый узел для C++ генератора: id=functioncall-1, type=FunctionCall, label="InvokeSomething". Поддерживаемые типы: Branch, End, Print, Start. Подсказка: проверьте поддерживаемые типы узлов.',
      'Unsupported node for C++ generator: id=functioncall-1, type=FunctionCall, label="InvokeSomething". Supported types: Branch, End, Print, Start. Hint: check supported node types.'
    );
  });

  it('should fallback to documentation path when supported types are unavailable', () => {
    const node = createMockNode('Custom', 'NoRegistryNode');
    const helpers = createMockHelpers();
    const context = { ...createMockContext(), supportedNodeTypes: undefined };

    generator.generate(node, context, helpers);

    expect(helpers.addError).toHaveBeenCalledWith(
      'custom-1',
      'UNIMPLEMENTED_NODE_TYPE',
      'Неподдерживаемый узел для C++ генератора: id=custom-1, type=Custom, label="NoRegistryNode". Поддерживаемые типы: см. Документы/Архитектура/VisualEditor.md. Подсказка: проверьте поддерживаемые типы узлов.',
      'Unsupported node for C++ generator: id=custom-1, type=Custom, label="NoRegistryNode". Supported types: см. Документы/Архитектура/VisualEditor.md. Hint: check supported node types.'
    );
  });

});

// ============================================
// createOtherGenerators Tests
// ============================================

describe('createOtherGenerators', () => {
  it('should return array with all other generators', () => {
    const generators = createOtherGenerators();

    expect(generators).toHaveLength(27);
    expect(generators[0]).toBeInstanceOf(CommentNodeGenerator);
    expect(generators[1]).toBeInstanceOf(RerouteNodeGenerator);
    expect(generators[2]).toBeInstanceOf(StringConcatNodeGenerator);
    expect(generators[3]).toBeInstanceOf(StringLengthNodeGenerator);
    expect(generators[4]).toBeInstanceOf(SubstringNodeGenerator);
    expect(generators[5]).toBeInstanceOf(ContainsNodeGenerator);
    expect(generators[6]).toBeInstanceOf(SplitNodeGenerator);
    expect(generators[7]).toBeInstanceOf(TrimNodeGenerator);
    expect(generators[8]).toBeInstanceOf(MakeArrayNodeGenerator);
    expect(generators[9]).toBeInstanceOf(ArrayGetNodeGenerator);
    expect(generators[10]).toBeInstanceOf(ArraySetNodeGenerator);
    expect(generators[11]).toBeInstanceOf(ArrayPushBackNodeGenerator);
    expect(generators[12]).toBeInstanceOf(ArraySizeNodeGenerator);
    expect(generators[13]).toBeInstanceOf(ArrayClearNodeGenerator);
    expect(generators[14]).toBeInstanceOf(RandomFromArrayNodeGenerator);
    expect(generators[15]).toBeInstanceOf(MakeExpectedNodeGenerator);
    expect(generators[16]).toBeInstanceOf(ExpectedHasValueNodeGenerator);
    expect(generators[17]).toBeInstanceOf(ExpectedValueNodeGenerator);
    expect(generators[18]).toBeInstanceOf(ExpectedErrorNodeGenerator);
    expect(generators[19]).toBeInstanceOf(MakeOptionalNodeGenerator);
    expect(generators[20]).toBeInstanceOf(OptionalHasValueNodeGenerator);
    expect(generators[21]).toBeInstanceOf(OptionalValueOrNodeGenerator);
    expect(generators[22]).toBeInstanceOf(MakeVariantNodeGenerator);
    expect(generators[23]).toBeInstanceOf(HoldsAlternativeNodeGenerator);
    expect(generators[24]).toBeInstanceOf(VisitVariantNodeGenerator);
    expect(generators[25]).toBeInstanceOf(FormatNodeGenerator);
    expect(generators[26]).toBeInstanceOf(FallbackNodeGenerator);
  });
});
