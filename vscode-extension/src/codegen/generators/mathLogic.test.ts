import { describe, expect, it, vi } from 'vitest';
import type { BlueprintNode } from '../../shared/blueprintTypes';
import type { CodeGenContext } from '../types';
import type { GeneratorHelpers } from './base';
import {
  EqualNodeGenerator,
  GreaterNodeGenerator,
  ParseIntNodeGenerator,
  ParseFloatNodeGenerator,
  RandomIntNodeGenerator,
  ToIntNodeGenerator,
  ToFloatNodeGenerator,
  ToBoolNodeGenerator,
  ToStringNodeGenerator,
} from './mathLogic';

const createMockHelpers = (overrides: Partial<GeneratorHelpers> = {}): GeneratorHelpers => ({
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
});

const createMockContext = (): CodeGenContext => ({
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
});

const createComparisonNode = (type: 'Greater' | 'Equal'): BlueprintNode => ({
  id: `${type.toLowerCase()}-1`,
  type,
  label: type,
  position: { x: 0, y: 0 },
  inputs: [
    { id: 'a', name: 'A', dataType: type === 'Equal' ? 'string' : 'float', direction: 'input', index: 0 },
    { id: 'b', name: 'B', dataType: type === 'Equal' ? 'string' : 'float', direction: 'input', index: 1 },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'bool', direction: 'output', index: 0 },
  ],
});

describe('mathLogic comparison literals', () => {
  it('uses input port literal values for Greater node when ports are not connected', () => {
    const generator = new GreaterNodeGenerator();
    const node = createComparisonNode('Greater');
    node.inputs[0].value = 7;
    node.inputs[1].value = 3;
    const helpers = createMockHelpers();

    const expression = generator.getOutputExpression(node, 'result', createMockContext(), helpers);

    expect(expression).toBe('(7 > 3)');
    expect(helpers.getInputExpression).toHaveBeenCalledWith(node, 'a');
    expect(helpers.getInputExpression).toHaveBeenCalledWith(node, 'b');
  });

  it('formats string literal input values for Equal node', () => {
    const generator = new EqualNodeGenerator();
    const node = createComparisonNode('Equal');
    node.inputs[0].value = 'left';
    node.inputs[1].value = 'right';
    const helpers = createMockHelpers();

    const expression = generator.getOutputExpression(node, 'result', createMockContext(), helpers);

    expect(expression).toBe('("left" == "right")');
  });
});


describe('mathLogic parse generators', () => {
  it('builds safe ParseInt expression with fallback and warning', () => {
    const generator = new ParseIntNodeGenerator();
    const helpers = createMockHelpers({
      getInputExpression: vi.fn().mockReturnValue('rawValue'),
    });

    const node: BlueprintNode = {
      id: 'parse-int-1',
      type: 'ParseInt',
      label: 'Parse Int',
      position: { x: 0, y: 0 },
      inputs: [{ id: 'value', name: 'String', dataType: 'string', direction: 'input', index: 0 }],
      outputs: [{ id: 'result', name: 'Result', dataType: 'int32', direction: 'output', index: 0 }],
    };

    const expression = generator.getOutputExpression(node, 'result', createMockContext(), helpers);

    expect(expression).toContain('ParseIntResult');
    expect(expression).toContain('std::stringstream');
    expect(expression).toContain('multicode_parse_result.ok ? multicode_parse_result.value : 0');
    expect(helpers.addWarning).toHaveBeenCalledWith(
      'parse-int-1',
      'PARSE_INT_SAFE_FALLBACK',
      'ParseInt использует безопасный fallback при ошибке разбора'
    );
  });

  it('builds safe ParseFloat expression with fallback and warning', () => {
    const generator = new ParseFloatNodeGenerator();
    const helpers = createMockHelpers({
      getInputExpression: vi.fn().mockReturnValue('rawValue'),
    });

    const node: BlueprintNode = {
      id: 'parse-float-1',
      type: 'ParseFloat',
      label: 'Parse Float',
      position: { x: 0, y: 0 },
      inputs: [{ id: 'value', name: 'String', dataType: 'string', direction: 'input', index: 0 }],
      outputs: [{ id: 'result', name: 'Result', dataType: 'float', direction: 'output', index: 0 }],
    };

    const expression = generator.getOutputExpression(node, 'result', createMockContext(), helpers);

    expect(expression).toContain('ParseFloatResult');
    expect(expression).toContain('std::stringstream');
    expect(expression).toContain('multicode_parse_result.ok ? multicode_parse_result.value : 0.0');
    expect(helpers.addWarning).toHaveBeenCalledWith(
      'parse-float-1',
      'PARSE_FLOAT_SAFE_FALLBACK',
      'ParseFloat использует безопасный fallback при ошибке разбора'
    );
  });
});

describe('mathLogic conversion generators', () => {
  it('serializes arbitrary input for ToString', () => {
    const generator = new ToStringNodeGenerator();
    const helpers = createMockHelpers({
      getInputExpression: vi.fn().mockReturnValue('score_value'),
    });

    const node: BlueprintNode = {
      id: 'to-string-1',
      type: 'ToString',
      label: 'To String',
      position: { x: 0, y: 0 },
      inputs: [{ id: 'value', name: 'Value', dataType: 'any', direction: 'input', index: 0 }],
      outputs: [{ id: 'result', name: 'Result', dataType: 'string', direction: 'output', index: 0 }],
    };

    const expression = generator.getOutputExpression(node, 'result', createMockContext(), helpers);

    expect(expression).toContain('std::stringstream multicode_stream');
    expect(expression).toContain('std::boolalpha << score_value');
    expect(expression).toContain('return multicode_stream.str()');
  });

  it('builds safe ToInt expression with fallback', () => {
    const generator = new ToIntNodeGenerator();
    const helpers = createMockHelpers({
      getInputExpression: vi.fn().mockReturnValue('rawValue'),
    });

    const node: BlueprintNode = {
      id: 'to-int-1',
      type: 'ToInt',
      label: 'To Int',
      position: { x: 0, y: 0 },
      inputs: [{ id: 'value', name: 'Value', dataType: 'any', direction: 'input', index: 0 }],
      outputs: [{ id: 'result', name: 'Result', dataType: 'int32', direction: 'output', index: 0 }],
    };

    const expression = generator.getOutputExpression(node, 'result', createMockContext(), helpers);

    expect(expression).toContain('multicode_write_stream << rawValue');
    expect(expression).toContain('int multicode_result = 0;');
    expect(expression).toContain('return multicode_ok ? multicode_result : 0;');
  });

  it('builds safe ToFloat expression with fallback', () => {
    const generator = new ToFloatNodeGenerator();
    const helpers = createMockHelpers({
      getInputExpression: vi.fn().mockReturnValue('rawValue'),
    });

    const node: BlueprintNode = {
      id: 'to-float-1',
      type: 'ToFloat',
      label: 'To Float',
      position: { x: 0, y: 0 },
      inputs: [{ id: 'value', name: 'Value', dataType: 'any', direction: 'input', index: 0 }],
      outputs: [{ id: 'result', name: 'Result', dataType: 'float', direction: 'output', index: 0 }],
    };

    const expression = generator.getOutputExpression(node, 'result', createMockContext(), helpers);

    expect(expression).toContain('double multicode_result = 0.0;');
    expect(expression).toContain('return multicode_ok ? multicode_result : 0.0;');
  });

  it('tries boolalpha and numeric fallback in ToBool', () => {
    const generator = new ToBoolNodeGenerator();
    const helpers = createMockHelpers({
      getInputExpression: vi.fn().mockReturnValue('rawValue'),
    });

    const node: BlueprintNode = {
      id: 'to-bool-1',
      type: 'ToBool',
      label: 'To Bool',
      position: { x: 0, y: 0 },
      inputs: [{ id: 'value', name: 'Value', dataType: 'any', direction: 'input', index: 0 }],
      outputs: [{ id: 'result', name: 'Result', dataType: 'bool', direction: 'output', index: 0 }],
    };

    const expression = generator.getOutputExpression(node, 'result', createMockContext(), helpers);

    expect(expression).toContain('std::boolalpha << rawValue');
    expect(expression).toContain('std::boolalpha >> multicode_result');
    expect(expression).toContain('return multicode_numeric_ok ? multicode_numeric != 0.0 : false;');
  });

  it('builds RandomInt expression with normalized bounds and mt19937', () => {
    const generator = new RandomIntNodeGenerator();
    const helpers = createMockHelpers({
      getInputExpression: vi.fn((_: BlueprintNode, portId: string) => {
        if (portId === 'min') {
          return 'maxValue';
        }
        if (portId === 'max') {
          return 'minValue';
        }
        return null;
      }),
    });

    const node: BlueprintNode = {
      id: 'random-int-1',
      type: 'RandomInt',
      label: 'Random Int',
      position: { x: 0, y: 0 },
      inputs: [
        { id: 'min', name: 'Min', dataType: 'int32', direction: 'input', index: 0 },
        { id: 'max', name: 'Max', dataType: 'int32', direction: 'input', index: 1 },
      ],
      outputs: [{ id: 'result', name: 'Result', dataType: 'int32', direction: 'output', index: 0 }],
    };

    const expression = generator.getOutputExpression(node, 'result', createMockContext(), helpers);

    expect(expression).toContain('int multicode_min = static_cast<int>(maxValue);');
    expect(expression).toContain('if (multicode_min > multicode_max)');
    expect(expression).toContain('std::mt19937 multicode_rng(std::random_device{}())');
    expect(expression).toContain('std::uniform_int_distribution<int> multicode_dist(multicode_min, multicode_max);');
  });
});
