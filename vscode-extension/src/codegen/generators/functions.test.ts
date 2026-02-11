/**
 * Тесты для генераторов пользовательских функций
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FunctionEntryNodeGenerator,
  FunctionReturnNodeGenerator,
  CallUserFunctionNodeGenerator,
  createFunctionGenerators,
  portTypeToCpp,
  transliterate,
  getDefaultValue,
  FunctionAwareContext,
} from './functions';
import type { BlueprintNode, BlueprintFunction } from '../../shared/blueprintTypes';
import type { CodeGenContext } from '../types';
import { CodeGenErrorCode, CodeGenWarningCode } from '../types';
import type { GeneratorHelpers } from './base';

// ============================================
// Фабрики для тестовых данных
// ============================================

function createMockContext(overrides?: Partial<FunctionAwareContext>): FunctionAwareContext {
  return {
    graph: {
      id: 'test-graph',
      name: 'Test Graph',
      nodes: [],
      edges: [],
      language: 'cpp',
      displayLanguage: 'ru',
      viewport: { x: 0, y: 0, zoom: 1 },
      updatedAt: new Date().toISOString(),
    },
    options: {
      includeRussianComments: true,
      includeSourceMarkers: false,
      graphName: 'Test',
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
    currentFunction: undefined,
    functions: [],
    ...overrides,
  };
}

function createMockHelpers(context: CodeGenContext): GeneratorHelpers {
  const inputValues = new Map<string, string>();
  const declaredVars = new Map<string, { codeName: string; cppType: string }>();
  
  return {
    indent: () => '    '.repeat(context.indentLevel),
    getInputExpression: (_node: BlueprintNode, portSuffix: string) => {
      return inputValues.get(portSuffix) ?? null;
    },
    getOutputExpression: () => '0',
    getExecutionTarget: () => null,
    generateFromNode: () => [],
    pushIndent: () => { context.indentLevel++; },
    popIndent: () => { context.indentLevel--; },
    addWarning: (nodeId: string, code: string, message: string) => {
      context.warnings.push({ nodeId, code: code as CodeGenWarningCode, message });
    },
    addError: (nodeId: string, code: string, message: string, messageEn: string) => {
      context.errors.push({ nodeId, code: code as CodeGenErrorCode, message, messageEn });
    },
    isVariableDeclared: (name: string) => declaredVars.has(name),
    declareVariable: (id: string, codeName: string, _originalName: string, cppType: string) => {
      declaredVars.set(id, { codeName, cppType });
    },
    getVariable: (id: string) => declaredVars.get(id) ?? null,
    // Для тестов добавляем setter
    _setInputValue: (port: string, value: string) => inputValues.set(port, value),
  } as GeneratorHelpers & { _setInputValue: (port: string, value: string) => void };
}

function createTestFunction(overrides?: Partial<BlueprintFunction>): BlueprintFunction {
  return {
    id: 'func-1',
    name: 'testFunction',
    nameRu: 'Тестовая функция',
    description: 'Описание функции',
    parameters: [],
    graph: {
      nodes: [],
      edges: [],
    },
    isPure: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createFunctionEntryNode(functionId: string): BlueprintNode {
  return {
    id: 'entry-1',
    type: 'FunctionEntry',
    label: 'Вход функции',
    position: { x: 0, y: 0 },
    inputs: [],
    outputs: [
      { id: 'entry-1-exec-out', name: 'exec', dataType: 'execution', direction: 'output', index: 0 },
    ],
    properties: { functionId },
  };
}

function createFunctionReturnNode(functionId: string): BlueprintNode {
  return {
    id: 'return-1',
    type: 'FunctionReturn',
    label: 'Возврат',
    position: { x: 200, y: 0 },
    inputs: [
      { id: 'return-1-exec-in', name: 'exec', dataType: 'execution', direction: 'input', index: 0 },
    ],
    outputs: [],
    properties: { functionId },
  };
}

function createCallUserFunctionNode(functionId: string, functionName: string): BlueprintNode {
  return {
    id: 'call-1',
    type: 'CallUserFunction',
    label: `Вызов: ${functionName}`,
    position: { x: 100, y: 100 },
    inputs: [
      { id: 'call-1-exec-in', name: 'exec', dataType: 'execution', direction: 'input', index: 0 },
    ],
    outputs: [
      { id: 'call-1-exec-out', name: 'exec', dataType: 'execution', direction: 'output', index: 0 },
    ],
    properties: { functionId, functionName },
  };
}

// ============================================
// Тесты утилит
// ============================================

describe('Утилиты functions.ts', () => {
  describe('portTypeToCpp', () => {
    it('преобразует базовые типы', () => {
      expect(portTypeToCpp('bool')).toBe('bool');
      expect(portTypeToCpp('int32')).toBe('int');
      expect(portTypeToCpp('int64')).toBe('long long');
      expect(portTypeToCpp('float')).toBe('float');
      expect(portTypeToCpp('double')).toBe('double');
      expect(portTypeToCpp('string')).toBe('std::string');
    });

    it('преобразует контейнерные типы', () => {
      expect(portTypeToCpp('vector')).toBe('std::vector<float>');
      expect(portTypeToCpp('array')).toBe('std::vector<int>');
    });

    it('преобразует специальные типы', () => {
      expect(portTypeToCpp('execution')).toBe('void');
      expect(portTypeToCpp('object')).toBe('void*');
      expect(portTypeToCpp('any')).toBe('auto');
    });
  });

  describe('transliterate', () => {
    it('транслитерирует русские буквы', () => {
      expect(transliterate('привет')).toBe('privet');
      expect(transliterate('Мир')).toBe('Mir');
      expect(transliterate('функция')).toBe('funktsiya');
    });

    it('сохраняет латиницу', () => {
      expect(transliterate('hello')).toBe('hello');
      expect(transliterate('Test123')).toBe('Test123');
    });

    it('заменяет пробелы на подчёркивания', () => {
      expect(transliterate('моя функция')).toBe('moya_funktsiya');
    });

    it('удаляет спецсимволы', () => {
      expect(transliterate('функция!')).toBe('funktsiya');
      expect(transliterate('test@#$')).toBe('test');
    });

    it('обрабатывает смешанный текст', () => {
      expect(transliterate('myФункция123')).toBe('myFunktsiya123');
    });
  });

  describe('getDefaultValue', () => {
    it('возвращает значения для числовых типов', () => {
      expect(getDefaultValue('int32')).toBe('0');
      expect(getDefaultValue('int64')).toBe('0LL');
      expect(getDefaultValue('float')).toBe('0.0f');
      expect(getDefaultValue('double')).toBe('0.0');
    });

    it('возвращает значения для других типов', () => {
      expect(getDefaultValue('bool')).toBe('false');
      expect(getDefaultValue('string')).toBe('""');
      expect(getDefaultValue('object')).toBe('nullptr');
    });

    it('возвращает {} для контейнеров', () => {
      expect(getDefaultValue('vector')).toBe('{}');
      expect(getDefaultValue('array')).toBe('{}');
      expect(getDefaultValue('any')).toBe('{}');
    });
  });
});

// ============================================
// Тесты FunctionEntryNodeGenerator
// ============================================

describe('FunctionEntryNodeGenerator', () => {
  let generator: FunctionEntryNodeGenerator;

  beforeEach(() => {
    generator = new FunctionEntryNodeGenerator();
  });

  describe('nodeTypes', () => {
    it('поддерживает FunctionEntry', () => {
      expect(generator.nodeTypes).toContain('FunctionEntry');
    });
  });

  describe('generate', () => {
    it('возвращает noop при обычном обходе', () => {
      const node = createFunctionEntryNode('func-1');
      const context = createMockContext();
      const helpers = createMockHelpers(context);

      const result = generator.generate(node, context, helpers);

      expect(result.lines).toHaveLength(0);
    });

    it('возвращает noop внутри функции', () => {
      const func = createTestFunction();
      const node = createFunctionEntryNode(func.id);
      const context = createMockContext({ currentFunction: func });
      const helpers = createMockHelpers(context);

      const result = generator.generate(node, context, helpers);

      expect(result.lines).toHaveLength(0);
    });
  });

  describe('generateFunctionSignature', () => {
    it('генерирует void для функции без параметров', () => {
      const func = createTestFunction({ name: 'doSomething' });
      
      const signature = FunctionEntryNodeGenerator.generateFunctionSignature(func);
      
      expect(signature).toBe('void doSomething()');
    });

    it('генерирует сигнатуру с входными параметрами', () => {
      const func = createTestFunction({
        name: 'add',
        parameters: [
          { id: 'p1', name: 'a', nameRu: 'а', dataType: 'int32', direction: 'input' },
          { id: 'p2', name: 'b', nameRu: 'б', dataType: 'int32', direction: 'input' },
        ],
      });

      const signature = FunctionEntryNodeGenerator.generateFunctionSignature(func);
      
      expect(signature).toBe('void add(int a, int b)');
    });

    it('генерирует возвращаемый тип для одного выхода', () => {
      const func = createTestFunction({
        name: 'getNumber',
        parameters: [
          { id: 'out1', name: 'result', nameRu: 'результат', dataType: 'int32', direction: 'output' },
        ],
      });

      const signature = FunctionEntryNodeGenerator.generateFunctionSignature(func);
      
      expect(signature).toBe('int getNumber()');
    });

    it('генерирует std::tuple для множественных выходов', () => {
      const func = createTestFunction({
        name: 'getMinMax',
        parameters: [
          { id: 'out1', name: 'min', nameRu: 'мин', dataType: 'int32', direction: 'output' },
          { id: 'out2', name: 'max', nameRu: 'макс', dataType: 'int32', direction: 'output' },
        ],
      });

      const signature = FunctionEntryNodeGenerator.generateFunctionSignature(func);
      
      expect(signature).toBe('std::tuple<int, int> getMinMax()');
    });

    it('генерирует полную сигнатуру с входами и выходом', () => {
      const func = createTestFunction({
        name: 'multiply',
        parameters: [
          { id: 'p1', name: 'x', nameRu: 'x', dataType: 'float', direction: 'input' },
          { id: 'p2', name: 'y', nameRu: 'y', dataType: 'float', direction: 'input' },
          { id: 'out', name: 'result', nameRu: 'результат', dataType: 'float', direction: 'output' },
        ],
      });

      const signature = FunctionEntryNodeGenerator.generateFunctionSignature(func);
      
      expect(signature).toBe('float multiply(float x, float y)');
    });

    it('транслитерирует русские имена', () => {
      const func = createTestFunction({
        name: 'вычислить',
        parameters: [
          { id: 'p1', name: 'значение', nameRu: 'значение', dataType: 'int32', direction: 'input' },
        ],
      });

      const signature = FunctionEntryNodeGenerator.generateFunctionSignature(func);
      
      expect(signature).toBe('void vychislit(int znachenie)');
    });

    it('обрабатывает string параметры', () => {
      const func = createTestFunction({
        name: 'greet',
        parameters: [
          { id: 'p1', name: 'name', nameRu: 'имя', dataType: 'string', direction: 'input' },
          { id: 'out', name: 'greeting', nameRu: 'приветствие', dataType: 'string', direction: 'output' },
        ],
      });

      const signature = FunctionEntryNodeGenerator.generateFunctionSignature(func);
      
      expect(signature).toBe('std::string greet(std::string name)');
    });
  });
});

// ============================================
// Тесты FunctionReturnNodeGenerator
// ============================================

describe('FunctionReturnNodeGenerator', () => {
  let generator: FunctionReturnNodeGenerator;

  beforeEach(() => {
    generator = new FunctionReturnNodeGenerator();
  });

  describe('nodeTypes', () => {
    it('поддерживает FunctionReturn', () => {
      expect(generator.nodeTypes).toContain('FunctionReturn');
    });
  });

  describe('generate', () => {
    it('генерирует return; без выходных параметров', () => {
      const func = createTestFunction();
      const node = createFunctionReturnNode(func.id);
      const context = createMockContext({ currentFunction: func });
      const helpers = createMockHelpers(context);

      const result = generator.generate(node, context, helpers);

      expect(result.lines).toContain('    return;');
      expect(result.followExecutionFlow).toBe(false);
    });

    it('генерирует return с одним значением', () => {
      const func = createTestFunction({
        parameters: [
          { id: 'result', name: 'result', nameRu: 'результат', dataType: 'int32', direction: 'output' },
        ],
      });
      const node: BlueprintNode = {
        ...createFunctionReturnNode(func.id),
        inputs: [
          { id: 'return-1-exec-in', name: 'exec', dataType: 'execution', direction: 'input', index: 0 },
          { id: 'return-1-result', name: 'result', dataType: 'int32', direction: 'input', index: 1 },
        ],
      };
      const context = createMockContext({ currentFunction: func });
      const helpers = createMockHelpers(context) as GeneratorHelpers & { _setInputValue: (port: string, value: string) => void };
      helpers._setInputValue('result', '42');

      const result = generator.generate(node, context, helpers);

      expect(result.lines).toContain('    return 42;');
    });

    it('использует значение по умолчанию если вход не подключён', () => {
      const func = createTestFunction({
        parameters: [
          { id: 'result', name: 'result', nameRu: 'результат', dataType: 'int32', direction: 'output' },
        ],
      });
      const node = createFunctionReturnNode(func.id);
      const context = createMockContext({ currentFunction: func });
      const helpers = createMockHelpers(context);

      const result = generator.generate(node, context, helpers);

      expect(result.lines).toContain('    return 0;');
    });

    it('генерирует tuple для множественных выходов', () => {
      const func = createTestFunction({
        parameters: [
          { id: 'min', name: 'min', nameRu: 'мин', dataType: 'int32', direction: 'output' },
          { id: 'max', name: 'max', nameRu: 'макс', dataType: 'int32', direction: 'output' },
        ],
      });
      const node: BlueprintNode = {
        ...createFunctionReturnNode(func.id),
        inputs: [
          { id: 'return-1-exec-in', name: 'exec', dataType: 'execution', direction: 'input', index: 0 },
          { id: 'return-1-min', name: 'min', dataType: 'int32', direction: 'input', index: 1 },
          { id: 'return-1-max', name: 'max', dataType: 'int32', direction: 'input', index: 2 },
        ],
      };
      const context = createMockContext({ currentFunction: func });
      const helpers = createMockHelpers(context) as GeneratorHelpers & { _setInputValue: (port: string, value: string) => void };
      helpers._setInputValue('min', '1');
      helpers._setInputValue('max', '100');

      const result = generator.generate(node, context, helpers);

      expect(result.lines[0]).toContain('std::tuple{1, 100}');
    });

    it('добавляет предупреждение без связанной функции', () => {
      const node = createFunctionReturnNode('unknown-func');
      const context = createMockContext();
      const helpers = createMockHelpers(context);

      const result = generator.generate(node, context, helpers);

      expect(context.warnings).toHaveLength(1);
      expect(context.warnings[0].message).toContain('без связанной функции');
      expect(result.lines).toContain('    return;');
    });
  });
});

// ============================================
// Тесты CallUserFunctionNodeGenerator
// ============================================

describe('CallUserFunctionNodeGenerator', () => {
  let generator: CallUserFunctionNodeGenerator;

  beforeEach(() => {
    generator = new CallUserFunctionNodeGenerator();
  });

  describe('nodeTypes', () => {
    it('поддерживает CallUserFunction', () => {
      expect(generator.nodeTypes).toContain('CallUserFunction');
    });
  });

  describe('generate', () => {
    it('генерирует простой вызов без параметров', () => {
      const func = createTestFunction({ name: 'doWork' });
      const node = createCallUserFunctionNode(func.id, func.name);
      const context = createMockContext({ functions: [func] });
      const helpers = createMockHelpers(context);

      const result = generator.generate(node, context, helpers);

      expect(result.lines).toContain('    doWork();');
      expect(result.followExecutionFlow).toBe(true);
    });

    it('генерирует вызов с аргументами', () => {
      const func = createTestFunction({
        name: 'add',
        parameters: [
          { id: 'a', name: 'a', nameRu: 'а', dataType: 'int32', direction: 'input' },
          { id: 'b', name: 'b', nameRu: 'б', dataType: 'int32', direction: 'input' },
        ],
      });
      const node: BlueprintNode = {
        ...createCallUserFunctionNode(func.id, func.name),
        inputs: [
          { id: 'call-1-exec-in', name: 'exec', dataType: 'execution', direction: 'input', index: 0 },
          { id: 'call-1-a', name: 'a', dataType: 'int32', direction: 'input', index: 1 },
          { id: 'call-1-b', name: 'b', dataType: 'int32', direction: 'input', index: 2 },
        ],
      };
      const context = createMockContext({ functions: [func] });
      const helpers = createMockHelpers(context) as GeneratorHelpers & { _setInputValue: (port: string, value: string) => void };
      helpers._setInputValue('a', '5');
      helpers._setInputValue('b', '10');

      const result = generator.generate(node, context, helpers);

      expect(result.lines[0]).toContain('add(5, 10)');
    });

    it('генерирует присваивание результата', () => {
      const func = createTestFunction({
        name: 'getValue',
        parameters: [
          { id: 'result', name: 'result', nameRu: 'результат', dataType: 'int32', direction: 'output' },
        ],
      });
      const node: BlueprintNode = {
        ...createCallUserFunctionNode(func.id, func.name),
        outputs: [
          { id: 'call-1-exec-out', name: 'exec', dataType: 'execution', direction: 'output', index: 0 },
          { id: 'call-1-result', name: 'result', dataType: 'int32', direction: 'output', index: 1 },
        ],
      };
      const context = createMockContext({ functions: [func] });
      const helpers = createMockHelpers(context);

      const result = generator.generate(node, context, helpers);

      expect(result.lines[0]).toContain('auto result_');
      expect(result.lines[0]).toContain('= getValue()');
    });

    it('добавляет ошибку без functionId', () => {
      const node: BlueprintNode = {
        id: 'call-bad',
        type: 'CallUserFunction',
        label: 'Bad Call',
        position: { x: 0, y: 0 },
        inputs: [],
        outputs: [],
        properties: {},
      };
      const context = createMockContext();
      const helpers = createMockHelpers(context);

      const result = generator.generate(node, context, helpers);

      expect(context.errors).toHaveLength(1);
      expect(context.errors[0].code).toBe(CodeGenErrorCode.UNKNOWN_NODE_TYPE);
      expect(result.lines[0]).toContain('Ошибка');
    });

    it('транслитерирует русское имя функции', () => {
      const func = createTestFunction({ name: 'вычислить' });
      const node = createCallUserFunctionNode(func.id, func.name);
      const context = createMockContext({ functions: [func] });
      const helpers = createMockHelpers(context);

      const result = generator.generate(node, context, helpers);

      expect(result.lines[0]).toContain('vychislit()');
    });
  });

  describe('getOutputExpression', () => {
    it('возвращает имя переменной результата', () => {
      const func = createTestFunction({ name: 'getValue' });
      const node = createCallUserFunctionNode(func.id, func.name);
      node.id = 'call-abc123';
      
      const context = createMockContext({ functions: [func] });
      const helpers = createMockHelpers(context);
      helpers.declareVariable('call-abc123-result', 'result_abc123', 'Result', 'int', 'call-abc123');

      const expr = generator.getOutputExpression(node, 'result', context, helpers);

      expect(expr).toBe('result_abc123');
    });

    it('возвращает fallback имя без объявленной переменной', () => {
      const node = createCallUserFunctionNode('func-1', 'test');
      node.id = 'call-xyz789';
      
      const context = createMockContext();
      const helpers = createMockHelpers(context);

      const expr = generator.getOutputExpression(node, 'result', context, helpers);

      expect(expr).toContain('result_');
    });

    it('возвращает пустую строку для execution портов', () => {
      const node = createCallUserFunctionNode('func-1', 'test');
      const context = createMockContext();
      const helpers = createMockHelpers(context);

      const expr = generator.getOutputExpression(node, 'exec-out', context, helpers);

      expect(expr).toBe('');
    });
  });
});

// ============================================
// Тесты фабричной функции
// ============================================

describe('createFunctionGenerators', () => {
  it('возвращает массив из 3 генераторов', () => {
    const generators = createFunctionGenerators();
    
    expect(generators).toHaveLength(3);
  });

  it('содержит все типы генераторов функций', () => {
    const generators = createFunctionGenerators();
    const types = generators.flatMap(g => g.nodeTypes);
    
    expect(types).toContain('FunctionEntry');
    expect(types).toContain('FunctionReturn');
    expect(types).toContain('CallUserFunction');
  });
});
