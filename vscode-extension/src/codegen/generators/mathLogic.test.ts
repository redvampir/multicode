import { describe, expect, it, vi } from 'vitest';
import type { BlueprintNode } from '../../shared/blueprintTypes';
import type { CodeGenContext } from '../types';
import type { GeneratorHelpers } from './base';
import {
  EqualNodeGenerator,
  GreaterNodeGenerator,
  ParseIntNodeGenerator,
  ParseFloatNodeGenerator,
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
