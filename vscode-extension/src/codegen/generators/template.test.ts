/**
 * Тесты для TemplateNodeGenerator
 * 
 * Проверяет генерацию кода на основе шаблонов из пакетов.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  TemplateNodeGenerator, 
  createPackageGenerators,
  NodeDefinitionWithCodegen,
  NodeDefinitionGetter,
} from './template';
import type { BlueprintNode, BlueprintNodeType } from '../../shared/blueprintTypes';
import type { CodeGenContext } from '../types';
import type { GeneratorHelpers } from './base';

/**
 * Создать тестовый узел
 */
function createTestNode(
  type: BlueprintNodeType,
  id: string,
  inputs: Array<{ id: string; value?: unknown; dataType: string }> = [],
  outputs: Array<{ id: string; dataType: string }> = [],
  properties: Record<string, string | number | boolean> = {}
): BlueprintNode {
  return {
    id,
    type,
    label: type,
    position: { x: 0, y: 0 },
    inputs: inputs.map((inp, idx) => ({
      id: inp.id,
      name: inp.id,
      dataType: inp.dataType as 'string' | 'int32' | 'float' | 'bool' | 'execution',
      direction: 'input' as const,
      index: idx,
      value: inp.value as string | number | boolean | undefined,
    })),
    outputs: outputs.map((out, idx) => ({
      id: out.id,
      name: out.id,
      dataType: out.dataType as 'string' | 'int32' | 'float' | 'bool' | 'execution',
      direction: 'output' as const,
      index: idx,
    })),
    properties,
  };
}

/**
 * Создать минимальный контекст
 */
function createTestContext(): CodeGenContext {
  return {
    graph: {
      id: 'test-graph',
      name: 'Test',
      language: 'cpp',
      displayLanguage: 'ru',
      nodes: [],
      edges: [],
      updatedAt: new Date().toISOString(),
    },
    options: {
      includeHeaders: true,
      generateMainWrapper: true,
      includeRussianComments: true,
      includeSourceMarkers: false,
      indentSize: 4,
    },
    indentLevel: 0,
    declaredVariables: new Map(),
    processedNodes: new Set(),
    errors: [],
    warnings: [],
    sourceMap: [],
    currentLine: 1,
  };
}

/**
 * Создать mock helpers
 */
function createMockHelpers(): GeneratorHelpers {
  return {
    indent: () => '',
    getInputExpression: (_node, portId) => {
      // Возвращаем имя порта как placeholder
      return `input_${portId}`;
    },
    getOutputExpression: (_node, portId) => `output_${portId}`,
    getExecutionTarget: () => null,
    generateFromNode: () => [],
    pushIndent: () => {},
    popIndent: () => {},
    addWarning: () => {},
    addError: () => {},
    isVariableDeclared: () => false,
    declareVariable: () => {},
    getVariable: () => null,
  };
}

describe('TemplateNodeGenerator', () => {
  beforeEach(() => {
    // Очищаем собранные includes перед каждым тестом
    TemplateNodeGenerator.clearCollectedIncludes();
  });

  describe('constructor and static methods', () => {
    it('should create generator for specified node types', () => {
      const getter: NodeDefinitionGetter = () => undefined;
      const generator = new TemplateNodeGenerator(['Print', 'Input'], getter);
      
      expect(generator.nodeTypes).toEqual(['Print', 'Input']);
    });

    it('should create generator for single type via createForType', () => {
      const getter: NodeDefinitionGetter = () => undefined;
      const generator = TemplateNodeGenerator.createForType('CustomNode' as BlueprintNodeType, getter);
      
      expect(generator.nodeTypes).toEqual(['CustomNode']);
    });
  });

  describe('generate - basic template', () => {
    it('should return empty result if no template', () => {
      const getter: NodeDefinitionGetter = () => ({
        type: 'NoTemplate' as BlueprintNodeType,
        label: 'No Template',
        category: 'other',
        inputs: [],
        outputs: [],
        // Нет _codegen
      });

      const generator = new TemplateNodeGenerator(['NoTemplate' as BlueprintNodeType], getter);
      const node = createTestNode('NoTemplate' as BlueprintNodeType, 'node-1');
      const context = createTestContext();
      const helpers = createMockHelpers();

      const result = generator.generate(node, context, helpers);

      expect(result.lines).toEqual([]);
      expect(result.followExecutionFlow).toBe(true);
    });

    it('should generate code from simple template', () => {
      const getter: NodeDefinitionGetter = () => ({
        type: 'SimplePrint' as BlueprintNodeType,
        label: 'Simple Print',
        labelRu: 'Простой вывод',
        category: 'io',
        inputs: [{ id: 'message', name: 'Message', dataType: 'string' }],
        outputs: [{ id: 'exec-out', name: 'Out', dataType: 'execution' }],
        _codegen: {
          cpp: {
            template: 'std::cout << {{input.message}} << std::endl;',
            includes: ['<iostream>'],
          },
        },
      } as NodeDefinitionWithCodegen);

      const generator = new TemplateNodeGenerator(['SimplePrint' as BlueprintNodeType], getter);
      const node = createTestNode(
        'SimplePrint' as BlueprintNodeType,
        'print-1',
        [{ id: 'message', dataType: 'string', value: '"Hello"' }],
        [{ id: 'exec-out', dataType: 'execution' }]
      );
      const context = createTestContext();
      const helpers = createMockHelpers();

      const result = generator.generate(node, context, helpers);

      expect(result.lines.length).toBeGreaterThan(0);
      expect(result.lines[0]).toContain('std::cout');
      expect(result.lines[0]).toContain('input_message');
      expect(result.followExecutionFlow).toBe(true);
    });

    it('should collect includes from template', () => {
      const getter: NodeDefinitionGetter = () => ({
        type: 'WithIncludes' as BlueprintNodeType,
        label: 'With Includes',
        category: 'io',
        inputs: [],
        outputs: [{ id: 'exec-out', name: 'Out', dataType: 'execution' }],
        _codegen: {
          cpp: {
            template: 'doSomething();',
            includes: ['<iostream>', '<vector>', '<string>'],
          },
        },
      } as NodeDefinitionWithCodegen);

      const generator = new TemplateNodeGenerator(['WithIncludes' as BlueprintNodeType], getter);
      const node = createTestNode(
        'WithIncludes' as BlueprintNodeType,
        'node-1',
        [],
        [{ id: 'exec-out', dataType: 'execution' }]
      );
      const context = createTestContext();
      const helpers = createMockHelpers();

      generator.generate(node, context, helpers);

      const collected = TemplateNodeGenerator.getCollectedIncludes();
      expect(collected).toContain('<iostream>');
      expect(collected).toContain('<vector>');
      expect(collected).toContain('<string>');
    });
  });

  describe('generate - before and after code', () => {
    it('should include before code', () => {
      const getter: NodeDefinitionGetter = () => ({
        type: 'WithBefore' as BlueprintNodeType,
        label: 'With Before',
        category: 'other',
        inputs: [],
        outputs: [{ id: 'exec-out', name: 'Out', dataType: 'execution' }],
        _codegen: {
          cpp: {
            template: 'doMain();',
            before: '// Setup code',
          },
        },
      } as NodeDefinitionWithCodegen);

      const generator = new TemplateNodeGenerator(['WithBefore' as BlueprintNodeType], getter);
      const node = createTestNode(
        'WithBefore' as BlueprintNodeType,
        'node-1',
        [],
        [{ id: 'exec-out', dataType: 'execution' }]
      );
      const context = createTestContext();
      const helpers = createMockHelpers();

      const result = generator.generate(node, context, helpers);

      expect(result.lines[0]).toContain('Setup code');
      expect(result.lines[1]).toContain('doMain');
    });

    it('should include after code', () => {
      const getter: NodeDefinitionGetter = () => ({
        type: 'WithAfter' as BlueprintNodeType,
        label: 'With After',
        category: 'other',
        inputs: [],
        outputs: [{ id: 'exec-out', name: 'Out', dataType: 'execution' }],
        _codegen: {
          cpp: {
            template: 'doMain();',
            after: '// Cleanup code',
          },
        },
      } as NodeDefinitionWithCodegen);

      const generator = new TemplateNodeGenerator(['WithAfter' as BlueprintNodeType], getter);
      const node = createTestNode(
        'WithAfter' as BlueprintNodeType,
        'node-1',
        [],
        [{ id: 'exec-out', dataType: 'execution' }]
      );
      const context = createTestContext();
      const helpers = createMockHelpers();

      const result = generator.generate(node, context, helpers);

      expect(result.lines[0]).toContain('doMain');
      expect(result.lines[1]).toContain('Cleanup code');
    });

    it('should include both before and after', () => {
      const getter: NodeDefinitionGetter = () => ({
        type: 'WithBoth' as BlueprintNodeType,
        label: 'With Both',
        category: 'other',
        inputs: [],
        outputs: [{ id: 'exec-out', name: 'Out', dataType: 'execution' }],
        _codegen: {
          cpp: {
            template: 'process();',
            before: '// BEGIN',
            after: '// END',
          },
        },
      } as NodeDefinitionWithCodegen);

      const generator = new TemplateNodeGenerator(['WithBoth' as BlueprintNodeType], getter);
      const node = createTestNode(
        'WithBoth' as BlueprintNodeType,
        'node-1',
        [],
        [{ id: 'exec-out', dataType: 'execution' }]
      );
      const context = createTestContext();
      const helpers = createMockHelpers();

      const result = generator.generate(node, context, helpers);

      expect(result.lines.length).toBe(3);
      expect(result.lines[0]).toContain('BEGIN');
      expect(result.lines[1]).toContain('process');
      expect(result.lines[2]).toContain('END');
    });
  });

  describe('placeholder substitution', () => {
    it('should substitute {{input.portId}}', () => {
      const getter: NodeDefinitionGetter = () => ({
        type: 'InputTest' as BlueprintNodeType,
        label: 'Input Test',
        category: 'other',
        inputs: [{ id: 'value', name: 'Value', dataType: 'int32' }],
        outputs: [{ id: 'exec-out', name: 'Out', dataType: 'execution' }],
        _codegen: {
          cpp: {
            template: 'result = {{input.value}};',
          },
        },
      } as NodeDefinitionWithCodegen);

      const generator = new TemplateNodeGenerator(['InputTest' as BlueprintNodeType], getter);
      const node = createTestNode(
        'InputTest' as BlueprintNodeType,
        'node-1',
        [{ id: 'value', dataType: 'int32', value: 42 }],
        [{ id: 'exec-out', dataType: 'execution' }]
      );
      const context = createTestContext();
      const helpers = createMockHelpers();

      const result = generator.generate(node, context, helpers);

      expect(result.lines[0]).toContain('result = input_value;');
    });

    it('should substitute {{output.portId}}', () => {
      const getter: NodeDefinitionGetter = () => ({
        type: 'OutputTest' as BlueprintNodeType,
        label: 'Output Test',
        category: 'other',
        inputs: [],
        outputs: [
          { id: 'result', name: 'Result', dataType: 'int32' },
          { id: 'exec-out', name: 'Out', dataType: 'execution' },
        ],
        _codegen: {
          cpp: {
            template: 'int {{output.result}} = 42;',
          },
        },
      } as NodeDefinitionWithCodegen);

      const generator = new TemplateNodeGenerator(['OutputTest' as BlueprintNodeType], getter);
      const node = createTestNode(
        'OutputTest' as BlueprintNodeType,
        'node-1',
        [],
        [
          { id: 'result', dataType: 'int32' },
          { id: 'exec-out', dataType: 'execution' },
        ]
      );
      const context = createTestContext();
      const helpers = createMockHelpers();

      const result = generator.generate(node, context, helpers);

      // Должна быть сгенерирована переменная с уникальным именем
      expect(result.lines[0]).toMatch(/int result_\w+ = 42;/);
    });

    it('should substitute {{prop.propId}} from node properties', () => {
      const getter: NodeDefinitionGetter = () => ({
        type: 'PropTest' as BlueprintNodeType,
        label: 'Prop Test',
        category: 'other',
        inputs: [],
        outputs: [{ id: 'exec-out', name: 'Out', dataType: 'execution' }],
        _codegen: {
          cpp: {
            template: 'setName("{{prop.name}}");',
          },
        },
      } as NodeDefinitionWithCodegen);

      const generator = new TemplateNodeGenerator(['PropTest' as BlueprintNodeType], getter);
      const node = createTestNode(
        'PropTest' as BlueprintNodeType,
        'node-1',
        [],
        [{ id: 'exec-out', dataType: 'execution' }],
        { name: 'MyEntity' }
      );
      const context = createTestContext();
      const helpers = createMockHelpers();

      const result = generator.generate(node, context, helpers);

      expect(result.lines[0]).toContain('setName("MyEntity");');
    });

    it('should use default value for missing property', () => {
      const getter: NodeDefinitionGetter = () => ({
        type: 'DefaultPropTest' as BlueprintNodeType,
        label: 'Default Prop Test',
        category: 'other',
        inputs: [],
        outputs: [{ id: 'exec-out', name: 'Out', dataType: 'execution' }],
        _properties: [
          { id: 'count', name: 'Count', type: 'int32', default: 10 },
        ],
        _codegen: {
          cpp: {
            template: 'repeat({{prop.count}});',
          },
        },
      } as NodeDefinitionWithCodegen);

      const generator = new TemplateNodeGenerator(['DefaultPropTest' as BlueprintNodeType], getter);
      const node = createTestNode(
        'DefaultPropTest' as BlueprintNodeType,
        'node-1',
        [],
        [{ id: 'exec-out', dataType: 'execution' }]
        // Без properties — должен использоваться default
      );
      const context = createTestContext();
      const helpers = createMockHelpers();

      const result = generator.generate(node, context, helpers);

      expect(result.lines[0]).toContain('repeat(10);');
    });

    it('should substitute {{node.label}} and {{node.labelRu}}', () => {
      const getter: NodeDefinitionGetter = () => ({
        type: 'LabelTest' as BlueprintNodeType,
        label: 'Label Test',
        labelRu: 'Тест метки',
        category: 'other',
        inputs: [],
        outputs: [{ id: 'exec-out', name: 'Out', dataType: 'execution' }],
        _codegen: {
          cpp: {
            template: '// EN: {{node.label}}, RU: {{node.labelRu}}',
          },
        },
      } as NodeDefinitionWithCodegen);

      const generator = new TemplateNodeGenerator(['LabelTest' as BlueprintNodeType], getter);
      const node = createTestNode(
        'LabelTest' as BlueprintNodeType,
        'node-1',
        [],
        [{ id: 'exec-out', dataType: 'execution' }]
      );
      const context = createTestContext();
      const helpers = createMockHelpers();

      const result = generator.generate(node, context, helpers);

      expect(result.lines[0]).toContain('EN: Label Test');
      expect(result.lines[0]).toContain('RU: Тест метки');
    });

    it('should show placeholder for missing input', () => {
      const getter: NodeDefinitionGetter = () => ({
        type: 'MissingInput' as BlueprintNodeType,
        label: 'Missing Input',
        category: 'other',
        inputs: [],
        outputs: [{ id: 'exec-out', name: 'Out', dataType: 'execution' }],
        _codegen: {
          cpp: {
            template: 'use({{input.nonexistent}});',
          },
        },
      } as NodeDefinitionWithCodegen);

      const generator = new TemplateNodeGenerator(['MissingInput' as BlueprintNodeType], getter);
      const node = createTestNode(
        'MissingInput' as BlueprintNodeType,
        'node-1',
        [],
        [{ id: 'exec-out', dataType: 'execution' }]
      );
      const context = createTestContext();
      // helpers.getInputExpression возвращает null для несуществующего порта
      const helpers = {
        ...createMockHelpers(),
        getInputExpression: () => null,
      };

      const result = generator.generate(node, context, helpers);

      expect(result.lines[0]).toContain('/* missing input */');
    });
  });

  describe('getOutputExpression', () => {
    it('should return processed template as expression', () => {
      const getter: NodeDefinitionGetter = () => ({
        type: 'PureNode' as BlueprintNodeType,
        label: 'Pure Node',
        category: 'math',
        inputs: [
          { id: 'a', name: 'A', dataType: 'float' },
          { id: 'b', name: 'B', dataType: 'float' },
        ],
        outputs: [{ id: 'result', name: 'Result', dataType: 'float' }],
        _codegen: {
          cpp: {
            template: '({{input.a}} + {{input.b}})',
          },
        },
      } as NodeDefinitionWithCodegen);

      const generator = new TemplateNodeGenerator(['PureNode' as BlueprintNodeType], getter);
      const node = createTestNode(
        'PureNode' as BlueprintNodeType,
        'node-1',
        [
          { id: 'a', dataType: 'float', value: 5 },
          { id: 'b', dataType: 'float', value: 3 },
        ],
        [{ id: 'result', dataType: 'float' }]
      );
      const context = createTestContext();
      const helpers = createMockHelpers();

      const expr = generator.getOutputExpression(node, 'result', context, helpers);

      expect(expr).toBe('(input_a + input_b)');
    });

    it('should return 0 for node without template', () => {
      const getter: NodeDefinitionGetter = () => ({
        type: 'NoTemplate' as BlueprintNodeType,
        label: 'No Template',
        category: 'other',
        inputs: [],
        outputs: [{ id: 'result', name: 'Result', dataType: 'int32' }],
      });

      const generator = new TemplateNodeGenerator(['NoTemplate' as BlueprintNodeType], getter);
      const node = createTestNode(
        'NoTemplate' as BlueprintNodeType,
        'node-1',
        [],
        [{ id: 'result', dataType: 'int32' }]
      );
      const context = createTestContext();
      const helpers = createMockHelpers();

      const expr = generator.getOutputExpression(node, 'result', context, helpers);

      expect(expr).toBe('0');
    });
  });

  describe('multiline templates', () => {
    it('should handle multiline template', () => {
      const getter: NodeDefinitionGetter = () => ({
        type: 'MultiLine' as BlueprintNodeType,
        label: 'Multi Line',
        category: 'other',
        inputs: [{ id: 'count', name: 'Count', dataType: 'int32' }],
        outputs: [{ id: 'exec-out', name: 'Out', dataType: 'execution' }],
        _codegen: {
          cpp: {
            template: `for (int i = 0; i < {{input.count}}; i++) {
    process(i);
}`,
          },
        },
      } as NodeDefinitionWithCodegen);

      const generator = new TemplateNodeGenerator(['MultiLine' as BlueprintNodeType], getter);
      const node = createTestNode(
        'MultiLine' as BlueprintNodeType,
        'node-1',
        [{ id: 'count', dataType: 'int32', value: 10 }],
        [{ id: 'exec-out', dataType: 'execution' }]
      );
      const context = createTestContext();
      const helpers = createMockHelpers();

      const result = generator.generate(node, context, helpers);

      expect(result.lines.length).toBe(3);
      expect(result.lines[0]).toContain('for (int i = 0; i < input_count; i++)');
      expect(result.lines[1]).toContain('process(i);');
      expect(result.lines[2]).toContain('}');
    });
  });

  describe('followExecutionFlow', () => {
    it('should return true for nodes with execution output', () => {
      const getter: NodeDefinitionGetter = () => ({
        type: 'WithExec' as BlueprintNodeType,
        label: 'With Exec',
        category: 'other',
        inputs: [],
        outputs: [{ id: 'exec-out', name: 'Out', dataType: 'execution' }],
        _codegen: {
          cpp: {
            template: 'doSomething();',
          },
        },
      } as NodeDefinitionWithCodegen);

      const generator = new TemplateNodeGenerator(['WithExec' as BlueprintNodeType], getter);
      const node = createTestNode(
        'WithExec' as BlueprintNodeType,
        'node-1',
        [],
        [{ id: 'exec-out', dataType: 'execution' }]
      );
      const context = createTestContext();
      const helpers = createMockHelpers();

      const result = generator.generate(node, context, helpers);

      expect(result.followExecutionFlow).toBe(true);
    });

    it('should return false for pure nodes without execution output', () => {
      const getter: NodeDefinitionGetter = () => ({
        type: 'PureOnly' as BlueprintNodeType,
        label: 'Pure Only',
        category: 'math',
        inputs: [{ id: 'x', name: 'X', dataType: 'float' }],
        outputs: [{ id: 'result', name: 'Result', dataType: 'float' }],
        _codegen: {
          cpp: {
            template: '{{input.x}} * 2',
          },
        },
      } as NodeDefinitionWithCodegen);

      const generator = new TemplateNodeGenerator(['PureOnly' as BlueprintNodeType], getter);
      const node = createTestNode(
        'PureOnly' as BlueprintNodeType,
        'node-1',
        [{ id: 'x', dataType: 'float', value: 5 }],
        [{ id: 'result', dataType: 'float' }]
      );
      const context = createTestContext();
      const helpers = createMockHelpers();

      const result = generator.generate(node, context, helpers);

      expect(result.followExecutionFlow).toBe(false);
    });
  });
});

describe('createPackageGenerators', () => {
  it('should create generators only for nodes with templates', () => {
    // Используем Custom как базовый тип для всех тестовых узлов
    const definitions: Record<string, NodeDefinitionWithCodegen> = {
      Custom: {
        type: 'Custom' as BlueprintNodeType,
        label: 'With Template',
        category: 'other',
        inputs: [],
        outputs: [],
        _codegen: {
          cpp: {
            template: 'code();',
          },
        },
      },
      Reroute: {
        type: 'Reroute' as BlueprintNodeType,
        label: 'Without Template',
        category: 'other',
        inputs: [],
        outputs: [],
        // Нет _codegen
      },
      Comment: {
        type: 'Comment' as BlueprintNodeType,
        label: 'Empty Codegen',
        category: 'other',
        inputs: [],
        outputs: [],
        _codegen: {
          cpp: {
            // Нет template
          },
        },
      },
    };

    const getter: NodeDefinitionGetter = (type) => definitions[type];
    const nodeTypes: BlueprintNodeType[] = ['Custom', 'Reroute', 'Comment'];

    const generators = createPackageGenerators(getter, nodeTypes);

    // Только один генератор — для Custom (с template)
    expect(generators.length).toBe(1);
    expect(generators[0].nodeTypes).toContain('Custom');
  });

  it('should return empty array if no templates', () => {
    const getter: NodeDefinitionGetter = () => ({
      type: 'Reroute' as BlueprintNodeType,
      label: 'No Template',
      category: 'other',
      inputs: [],
      outputs: [],
    });
    const nodeTypes: BlueprintNodeType[] = ['Reroute'];

    const generators = createPackageGenerators(getter, nodeTypes);

    expect(generators.length).toBe(0);
  });
});
