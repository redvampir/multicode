/**
 * Тесты для CppCodeGenerator
 * 
 * Проверяет генерацию C++ кода из Blueprint графов.
 */

import { describe, it, expect } from 'vitest';
import { CppCodeGenerator } from './CppCodeGenerator';
import type { INodeGenerator } from './generators';
import { TemplateNodeGenerator } from './generators/template';
import { CodeGenErrorCode } from './types';
import { 
  BlueprintGraphState, 
  BlueprintNode, 
  BlueprintNodeType,
  BlueprintFunction,
  createNode, 
  createEdge 
} from '../shared/blueprintTypes';
import { PortDataType } from '../shared/portTypes';

/**
 * Создать минимальный тестовый граф
 */
function createTestGraph(nodes: BlueprintNode[], edges: ReturnType<typeof createEdge>[] = []): BlueprintGraphState {
  return {
    id: 'test-graph',
    name: 'Test Graph',
    language: 'cpp',
    displayLanguage: 'ru',
    nodes,
    edges,
    updatedAt: new Date().toISOString(),
  };
}

describe('CppCodeGenerator', () => {
  const generator = new CppCodeGenerator();
  
  describe('canGenerate', () => {
    it('should reject graph without Start node', () => {
      const graph = createTestGraph([
        createNode('Print', { x: 0, y: 0 }, 'print-1'),
      ]);
      
      const result = generator.canGenerate(graph);
      
      expect(result.canGenerate).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('NO_START_NODE');
    });
    
    it('should reject graph with multiple Start nodes', () => {
      const graph = createTestGraph([
        createNode('Start', { x: 0, y: 0 }, 'start-1'),
        createNode('Start', { x: 100, y: 0 }, 'start-2'),
      ]);
      
      const result = generator.canGenerate(graph);
      
      expect(result.canGenerate).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MULTIPLE_START_NODES');
    });
    
    it('should support extended control flow nodes in canGenerate', () => {
      const graph = createTestGraph([
        createNode('Start', { x: 0, y: 0 }, 'start-1'),
        createNode('Parallel', { x: 100, y: 0 }, 'parallel-1'),
        createNode('Gate', { x: 200, y: 0 }, 'gate-1'),
        createNode('DoN', { x: 300, y: 0 }, 'don-1'),
        createNode('DoOnce', { x: 400, y: 0 }, 'doonce-1'),
        createNode('FlipFlop', { x: 500, y: 0 }, 'flipflop-1'),
        createNode('MultiGate', { x: 600, y: 0 }, 'multigate-1'),
      ]);

      const result = generator.canGenerate(graph);

      expect(result.errors.filter(error => error.code === 'UNKNOWN_NODE_TYPE')).toHaveLength(0);
    });

    it('should accept valid graph with Start node', () => {
      const graph = createTestGraph([
        createNode('Start', { x: 0, y: 0 }, 'start-1'),
      ]);
      
      const result = generator.canGenerate(graph);
      
      expect(result.canGenerate).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
  
  describe('generate - Basic nodes', () => {
    it('should generate minimal main() with Start only', () => {
      const graph = createTestGraph([
        createNode('Start', { x: 0, y: 0 }, 'start'),
      ]);
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('int main()');
      expect(result.code).toContain('return 0;');
    });
    
    it('should generate Print statement', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const printNode = createNode('Print', { x: 200, y: 0 }, 'print');
      // Установим значение для вывода
      printNode.inputs[1].value = 'Hello, World!';
      
      const graph = createTestGraph(
        [startNode, printNode],
        [createEdge('start', 'start-exec-out', 'print', 'print-exec-in')]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('std::cout');
      expect(result.code).toContain('Hello, World!');
    });
    
    it('should generate Print with empty string', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const printNode = createNode('Print', { x: 200, y: 0 }, 'print');
      // Не устанавливаем значение
      
      const graph = createTestGraph(
        [startNode, printNode],
        [createEdge('start', 'start-exec-out', 'print', 'print-exec-in')]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('std::cout <<');
    });

    it('should escape special characters for Print string literal', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const printNode = createNode('Print', { x: 200, y: 0 }, 'print');
      printNode.inputs[1].value = 'line1\n\t"quoted"\\path';

      const graph = createTestGraph(
        [startNode, printNode],
        [createEdge('start', 'start-exec-out', 'print', 'print-exec-in')]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('std::cout << "line1\\n\\t\\"quoted\\"\\\\path" << std::endl;');
    });

    it('should interpret user typed escape sequences for Print string literal', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const printNode = createNode('Print', { x: 200, y: 0 }, 'print');
      printNode.inputs[1].value = 'line1\\nline2';

      const graph = createTestGraph(
        [startNode, printNode],
        [createEdge('start', 'start-exec-out', 'print', 'print-exec-in')]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('std::cout << "line1\\nline2" << std::endl;');
    });

    it('should keep literal backslash-n when user enters double escaped value in Print', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const printNode = createNode('Print', { x: 200, y: 0 }, 'print');
      printNode.inputs[1].value = 'line1\\\\nline2';

      const graph = createTestGraph(
        [startNode, printNode],
        [createEdge('start', 'start-exec-out', 'print', 'print-exec-in')]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('std::cout << "line1\\\\nline2" << std::endl;');
    });

    it('should keep only one return when source markers are enabled and End node exists', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const endNode = createNode('End', { x: 220, y: 0 }, 'end');
      const graph = createTestGraph(
        [startNode, endNode],
        [createEdge('start', 'start-exec-out', 'end', 'end-exec-in')]
      );

      const result = generator.generate(graph, { includeSourceMarkers: true });

      expect(result.success).toBe(true);
      const returnMatches = result.code.match(/return 0;/g) ?? [];
      expect(returnMatches).toHaveLength(1);
    });

    it('should omit human-readable node comments when includeRussianComments is false', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const printNode = createNode('Print', { x: 200, y: 0 }, 'print');
      printNode.inputs[1].value = 'hello';
      const graph = createTestGraph(
        [startNode, printNode],
        [createEdge('start', 'start-exec-out', 'print', 'print-exec-in')]
      );

      const result = generator.generate(graph, {
        includeRussianComments: false,
        includeSourceMarkers: false,
      });

      expect(result.success).toBe(true);
      expect(result.code).not.toContain('// Начало');
      expect(result.code).not.toContain('// Вывод строки');
    });
  });

  describe('generate - Class declarations and class nodes', () => {
    it('should generate class declarations before graph body', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const graph = createTestGraph([startNode]);
      graph.classes = [
        {
          id: 'class-player',
          name: 'Player',
          members: [
            {
              id: 'member-score',
              name: 'Score',
              dataType: 'int32',
              access: 'public',
              defaultValue: 0,
            },
          ],
          methods: [
            {
              id: 'method-jump',
              name: 'Jump',
              returnType: 'bool',
              params: [],
              access: 'public',
            },
          ],
        },
      ];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('class player {');
      expect(result.code).toContain('public:');
      expect(result.code).toContain('int score = 0;');
      expect(result.code).toContain('bool jump();');
      expect(result.code).toContain('bool player::jump() {');
      expect(result.code.indexOf('class player {')).toBeLessThan(result.code.indexOf('int main() {'));
    });


    it('should generate class constructor + method call integration scenario', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const constructorNode = createNode('ClassConstructorCall', { x: 200, y: 0 }, 'ctor');
      constructorNode.properties = { classId: 'class-player' };

      const methodNode = createNode('ClassMethodCall', { x: 400, y: 0 }, 'call');
      methodNode.properties = {
        classId: 'class-player',
        methodId: 'method-jump',
      };

      const graph = createTestGraph(
        [startNode, constructorNode, methodNode],
        [
          createEdge('start', 'start-exec-out', 'ctor', 'ctor-exec-in', 'execution'),
          createEdge('ctor', 'ctor-exec-out', 'call', 'call-exec-in', 'execution'),
          createEdge('ctor', 'ctor-instance', 'call', 'call-target', 'class'),
        ]
      );

      graph.classes = [
        {
          id: 'class-player',
          name: 'Player',
          members: [],
          methods: [
            {
              id: 'method-jump',
              name: 'Jump',
              returnType: 'bool',
              params: [],
              access: 'public',
            },
          ],
        },
      ];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('player class_instance_ctor{};');
      expect(result.code).toContain('auto class_method_result_call = class_instance_ctor.jump();');
    });

    it('should return explicit error for invalid class method binding', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const methodNode = createNode('ClassMethodCall', { x: 200, y: 0 }, 'call');
      methodNode.properties = {
        classId: 'class-missing',
        methodId: 'method-missing',
      };

      const graph = createTestGraph(
        [startNode, methodNode],
        [createEdge('start', 'start-exec-out', 'call', 'exec-in')]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(false);
      expect(result.errors.some((error) =>
        error.code === CodeGenErrorCode.TYPE_MISMATCH &&
        error.message.includes('Класс для вызова не найден')
      )).toBe(true);
    });
  });
  
  describe('generate - Input node', () => {
    it('should generate Input with prompt', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const inputNode = createNode('Input', { x: 200, y: 0 }, 'input');
      // Устанавливаем prompt
      inputNode.inputs[1].value = 'Enter value: ';
      
      const graph = createTestGraph(
        [startNode, inputNode],
        [createEdge('start', 'start-exec-out', 'input', 'input-exec-in')]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('std::cout << "Enter value: "');
      expect(result.code).toContain('std::cin >>');
      expect(result.code).toContain('std::string input_');
    });
    
    it('should generate Input without prompt', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const inputNode = createNode('Input', { x: 200, y: 0 }, 'input');
      // Не устанавливаем prompt
      
      const graph = createTestGraph(
        [startNode, inputNode],
        [createEdge('start', 'start-exec-out', 'input', 'input-exec-in')]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('std::cin >>');
    });
    
    it('should use Input value in Print', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const inputNode = createNode('Input', { x: 200, y: 0 }, 'input');
      const printNode = createNode('Print', { x: 400, y: 0 }, 'print');
      
      const graph = createTestGraph(
        [startNode, inputNode, printNode],
        [
          createEdge('start', 'start-exec-out', 'input', 'input-exec-in'),
          createEdge('input', 'input-exec-out', 'print', 'print-exec-in'),
          createEdge('input', 'input-value', 'print', 'print-string', 'string'),
        ]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('std::cin >>');
      expect(result.code).toContain('std::cout <<');
    });
  });
  
  describe('generate - Control Flow', () => {
    it('should generate Branch (if/else)', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const branchNode = createNode('Branch', { x: 200, y: 0 }, 'branch');
      
      const graph = createTestGraph(
        [startNode, branchNode],
        [createEdge('start', 'start-exec-out', 'branch', 'branch-exec-in')]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('if (');
    });

    it('should generate merged continuation after Branch convergence only once', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const branchNode = createNode('Branch', { x: 200, y: 0 }, 'branch');
      const printTrueNode = createNode('Print', { x: 420, y: -80 }, 'print-true');
      const printFalseNode = createNode('Print', { x: 420, y: 80 }, 'print-false');
      const endNode = createNode('End', { x: 640, y: 0 }, 'end');
      printTrueNode.inputs[1].value = 'T';
      printFalseNode.inputs[1].value = 'F';

      const graph = createTestGraph(
        [startNode, branchNode, printTrueNode, printFalseNode, endNode],
        [
          createEdge('start', 'start-exec-out', 'branch', 'branch-exec-in'),
          createEdge('branch', 'branch-true', 'print-true', 'print-true-exec-in'),
          createEdge('branch', 'branch-false', 'print-false', 'print-false-exec-in'),
          createEdge('print-true', 'print-true-exec-out', 'end', 'end-exec-in'),
          createEdge('print-false', 'print-false-exec-out', 'end', 'end-exec-in'),
        ]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('std::cout << "T"');
      expect(result.code).toContain('std::cout << "F"');
      const returnMatches = result.code.match(/return 0;/g) ?? [];
      expect(returnMatches).toHaveLength(1);
    });
    
    it('should generate ForLoop', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const forNode = createNode('ForLoop', { x: 200, y: 0 }, 'for');
      
      const graph = createTestGraph(
        [startNode, forNode],
        [createEdge('start', 'start-exec-out', 'for', 'for-exec-in')]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('for (int');
      expect(result.code).toContain('++i_for');
    });

    it('should generate ForLoop with exclusive bound and custom step', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const forNode = createNode('ForLoop', { x: 200, y: 0 }, 'for');
      forNode.properties = {
        forLoopStep: 2,
        forLoopBoundMode: 'exclusive',
        forLoopDirection: 'up',
      };

      const graph = createTestGraph(
        [startNode, forNode],
        [createEdge('start', 'start-exec-out', 'for', 'for-exec-in')]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('for (int i_for = 0; i_for < 10; i_for += 2)');
    });

    it('should generate ForLoop with auto direction', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const forNode = createNode('ForLoop', { x: 200, y: 0 }, 'for');
      forNode.properties = {
        forLoopStep: 3,
        forLoopBoundMode: 'inclusive',
        forLoopDirection: 'auto',
      };

      const graph = createTestGraph(
        [startNode, forNode],
        [createEdge('start', 'start-exec-out', 'for', 'for-exec-in')]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('const int step_for = 3;');
      expect(result.code).toContain('const int dir_for = (0 <= 10) ? step_for : -step_for;');
      expect(result.code).toContain('i_for += dir_for');
    });

    it('should normalize non-positive ForLoop step and emit warning', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const forNode = createNode('ForLoop', { x: 200, y: 0 }, 'for');
      forNode.properties = {
        forLoopStep: 0,
      };

      const graph = createTestGraph(
        [startNode, forNode],
        [createEdge('start', 'start-exec-out', 'for', 'for-exec-in')]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('for (int i_for = 0; i_for <= 10; ++i_for)');
      expect(result.warnings.some((warning) => warning.code === 'INFINITE_LOOP')).toBe(true);
    });
    
    it('should generate WhileLoop', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const whileNode = createNode('WhileLoop', { x: 200, y: 0 }, 'while');
      
      const graph = createTestGraph(
        [startNode, whileNode],
        [createEdge('start', 'start-exec-out', 'while', 'while-exec-in')]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('while (');
      expect(result.warnings.some(w => w.code === 'INFINITE_LOOP')).toBe(true);
    });
    
    it('should generate DoWhile', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const doWhileNode = createNode('DoWhile', { x: 200, y: 0 }, 'dowhile');
      
      const graph = createTestGraph(
        [startNode, doWhileNode],
        [createEdge('start', 'start-exec-out', 'dowhile', 'dowhile-exec-in')]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('do {');
      expect(result.code).toContain('} while (');
    });

    it('should generate Parallel via std::async and join all branches via future::get', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const parallelNode = createNode('Parallel', { x: 200, y: 0 }, 'parallel');
      const printThread0 = createNode('Print', { x: 420, y: -80 }, 'print-thread-0');
      const printThread1 = createNode('Print', { x: 420, y: 80 }, 'print-thread-1');
      const printDone = createNode('Print', { x: 620, y: 0 }, 'print-done');
      printThread0.inputs[1].value = 'thread-0';
      printThread1.inputs[1].value = 'thread-1';
      printDone.inputs[1].value = 'all-done';

      const graph = createTestGraph(
        [startNode, parallelNode, printThread0, printThread1, printDone],
        [
          createEdge('start', 'start-exec-out', 'parallel', 'parallel-exec-in'),
          createEdge('parallel', 'parallel-thread-0', 'print-thread-0', 'print-thread-0-exec-in'),
          createEdge('parallel', 'parallel-thread-1', 'print-thread-1', 'print-thread-1-exec-in'),
          createEdge('parallel', 'parallel-completed', 'print-done', 'print-done-exec-in'),
        ]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.errors.some((error) => error.code === 'UNKNOWN_NODE_TYPE')).toBe(false);
      expect(result.code).toContain('#include <future>');
      expect(result.code).toContain('std::async(std::launch::async');
      expect(result.code).toContain('.get();');
      expect(result.code).toContain('"thread-0"');
      expect(result.code).toContain('"thread-1"');
      expect(result.code).toContain('"all-done"');
    });

    it('should generate Gate node', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const gateNode = createNode('Gate', { x: 200, y: 0 }, 'gate');
      const printNode = createNode('Print', { x: 420, y: 0 }, 'print');
      printNode.inputs[1].value = 'gate-exit';

      const graph = createTestGraph(
        [startNode, gateNode, printNode],
        [
          createEdge('start', 'start-exec-out', 'gate', 'gate-enter'),
          createEdge('gate', 'gate-exit', 'print', 'print-exec-in'),
        ]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.errors.some((error) => error.code === 'UNKNOWN_NODE_TYPE')).toBe(false);
      expect(result.code).toContain('static bool gate_open_');
      expect(result.code).toContain('if (gate_open_');
      expect(result.code).toContain('"gate-exit"');
    });

    it('should respect Gate initial closed state in generated code', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const gateNode = createNode('Gate', { x: 200, y: 0 }, 'gate');
      gateNode.properties = { gateInitiallyOpen: false };

      const graph = createTestGraph(
        [startNode, gateNode],
        [createEdge('start', 'start-exec-out', 'gate', 'gate-enter')]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('static bool gate_open_');
      expect(result.code).toContain('= false;');
    });

    it('should generate DoN node and expose counter output expression', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const doNNode = createNode('DoN', { x: 200, y: 0 }, 'do-n');
      const printNode = createNode('Print', { x: 420, y: 0 }, 'print');

      const nInput = doNNode.inputs.find((port) => /-n$/i.test(port.id));
      if (nInput) {
        nInput.value = 3;
      }

      const graph = createTestGraph(
        [startNode, doNNode, printNode],
        [
          createEdge('start', 'start-exec-out', 'do-n', 'do-n-exec-in'),
          createEdge('do-n', 'do-n-exit', 'print', 'print-exec-in'),
          createEdge('do-n', 'do-n-counter', 'print', 'print-string', 'int32'),
        ]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.errors.some((error) => error.code === 'UNKNOWN_NODE_TYPE')).toBe(false);
      expect(result.code).toContain('static int do_n_counter_');
      expect(result.code).toContain('do_n_limit_');
      expect(result.code).toContain('++do_n_counter_');
    });

    it('should generate DoOnce node', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const doOnceNode = createNode('DoOnce', { x: 200, y: 0 }, 'do-once');
      const printNode = createNode('Print', { x: 420, y: 0 }, 'print');
      printNode.inputs[1].value = 'done';

      const graph = createTestGraph(
        [startNode, doOnceNode, printNode],
        [
          createEdge('start', 'start-exec-out', 'do-once', 'do-once-exec-in'),
          createEdge('do-once', 'do-once-completed', 'print', 'print-exec-in'),
        ]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.errors.some((error) => error.code === 'UNKNOWN_NODE_TYPE')).toBe(false);
      expect(result.code).toContain('static bool do_once_done_');
      expect(result.code).toContain('if (!do_once_done_');
      expect(result.code).toContain('"done"');
    });

    it('should generate DoOnce reset path when reset input is triggered', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const sequenceNode = createNode('Sequence', { x: 160, y: 0 }, 'seq');
      const doOnceNode = createNode('DoOnce', { x: 360, y: 0 }, 'do-once');
      const printNode = createNode('Print', { x: 560, y: 0 }, 'print');
      printNode.inputs[1].value = 'after-reset';

      const graph = createTestGraph(
        [startNode, sequenceNode, doOnceNode, printNode],
        [
          createEdge('start', 'start-exec-out', 'seq', 'seq-exec-in'),
          createEdge('seq', 'seq-then-0', 'do-once', 'do-once-exec-in'),
          createEdge('seq', 'seq-then-1', 'do-once', 'do-once-reset'),
          createEdge('do-once', 'do-once-completed', 'print', 'print-exec-in'),
        ]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.errors.some((error) => error.code === 'UNKNOWN_NODE_TYPE')).toBe(false);
      expect(result.code).toContain('static bool do_once_done_');
      expect(result.code).toContain('if (!do_once_done_');
      expect(result.code).toContain('= false;');
      expect(result.code).toContain('"after-reset"');
    });

    it('should generate FlipFlop node', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const flipFlopNode = createNode('FlipFlop', { x: 200, y: 0 }, 'flip');
      const printANode = createNode('Print', { x: 420, y: -80 }, 'print-a');
      const printBNode = createNode('Print', { x: 420, y: 80 }, 'print-b');
      printANode.inputs[1].value = 'branch-a';
      printBNode.inputs[1].value = 'branch-b';

      const graph = createTestGraph(
        [startNode, flipFlopNode, printANode, printBNode],
        [
          createEdge('start', 'start-exec-out', 'flip', 'flip-exec-in'),
          createEdge('flip', 'flip-a', 'print-a', 'print-a-exec-in'),
          createEdge('flip', 'flip-b', 'print-b', 'print-b-exec-in'),
        ]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.errors.some((error) => error.code === 'UNKNOWN_NODE_TYPE')).toBe(false);
      expect(result.code).toContain('static bool flip_flop_state_');
      expect(result.code).toContain('const bool flip_flop_was_a_');
      expect(result.code).toContain('"branch-a"');
      expect(result.code).toContain('"branch-b"');
    });

    it('should generate MultiGate node', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const multiGateNode = createNode('MultiGate', { x: 200, y: 0 }, 'multi');
      const print0 = createNode('Print', { x: 420, y: -120 }, 'print-0');
      const print1 = createNode('Print', { x: 420, y: 0 }, 'print-1');
      const print2 = createNode('Print', { x: 420, y: 120 }, 'print-2');
      print0.inputs[1].value = 'mg-0';
      print1.inputs[1].value = 'mg-1';
      print2.inputs[1].value = 'mg-2';

      const randomInput = multiGateNode.inputs.find((port) => /is-random$/i.test(port.id));
      if (randomInput) {
        randomInput.value = true;
      }

      const loopInput = multiGateNode.inputs.find((port) => /-loop$/i.test(port.id));
      if (loopInput) {
        loopInput.value = true;
      }

      const graph = createTestGraph(
        [startNode, multiGateNode, print0, print1, print2],
        [
          createEdge('start', 'start-exec-out', 'multi', 'multi-exec-in'),
          createEdge('multi', 'multi-out-0', 'print-0', 'print-0-exec-in'),
          createEdge('multi', 'multi-out-1', 'print-1', 'print-1-exec-in'),
          createEdge('multi', 'multi-out-2', 'print-2', 'print-2-exec-in'),
        ]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.errors.some((error) => error.code === 'UNKNOWN_NODE_TYPE')).toBe(false);
      expect(result.code).toContain('static int multi_gate_index_');
      expect(result.code).toContain('switch (multi_gate_selected_');
      expect(result.code).toContain('case 0:');
      expect(result.code).toContain('case 1:');
      expect(result.code).toContain('case 2:');
      expect(result.code).toContain('"mg-0"');
      expect(result.code).toContain('"mg-1"');
      expect(result.code).toContain('"mg-2"');
    });
    
    it('should generate Switch', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const switchNode = createNode('Switch', { x: 200, y: 0 }, 'switch');
      
      const graph = createTestGraph(
        [startNode, switchNode],
        [createEdge('start', 'start-exec-out', 'switch', 'switch-exec-in')]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('switch (');
      expect(result.code).toContain('case 0:');
      expect(result.code).toContain('default:');
    });

    it('should generate merged continuation after Switch convergence only once', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const switchNode = createNode('Switch', { x: 200, y: 0 }, 'switch');
      const printCase0Node = createNode('Print', { x: 420, y: -120 }, 'print-case-0');
      const printCase1Node = createNode('Print', { x: 420, y: 0 }, 'print-case-1');
      const printDefaultNode = createNode('Print', { x: 420, y: 120 }, 'print-default');
      const endNode = createNode('End', { x: 640, y: 0 }, 'end');
      printCase0Node.inputs[1].value = 'case0';
      printCase1Node.inputs[1].value = 'case1';
      printDefaultNode.inputs[1].value = 'default';

      const graph = createTestGraph(
        [startNode, switchNode, printCase0Node, printCase1Node, printDefaultNode, endNode],
        [
          createEdge('start', 'start-exec-out', 'switch', 'switch-exec-in'),
          createEdge('switch', 'switch-case-0', 'print-case-0', 'print-case-0-exec-in'),
          createEdge('switch', 'switch-case-1', 'print-case-1', 'print-case-1-exec-in'),
          createEdge('switch', 'switch-default', 'print-default', 'print-default-exec-in'),
          createEdge('print-case-0', 'print-case-0-exec-out', 'end', 'end-exec-in'),
          createEdge('print-case-1', 'print-case-1-exec-out', 'end', 'end-exec-in'),
          createEdge('print-default', 'print-default-exec-out', 'end', 'end-exec-in'),
        ]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('switch (');
      expect(result.code).toContain('"case0"');
      expect(result.code).toContain('"case1"');
      expect(result.code).toContain('"default"');
      const returnMatches = result.code.match(/return 0;/g) ?? [];
      expect(returnMatches).toHaveLength(1);
    });

    it('should use Switch case value from port metadata even for legacy case ids', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const switchNode = createNode('Switch', { x: 200, y: 0 }, 'switch');
      const printCaseNode = createNode('Print', { x: 420, y: 0 }, 'print-case');
      printCaseNode.inputs[1].value = 'legacy-case-0';

      const legacyCasePort = switchNode.outputs.find((port) => port.id === 'switch-case-1');
      if (legacyCasePort) {
        legacyCasePort.defaultValue = 0;
        legacyCasePort.name = 'Case 0';
        legacyCasePort.nameRu = 'Случай 0';
      }
      switchNode.outputs = switchNode.outputs.filter(
        (port) => port.id === 'switch-case-1' || port.id === 'switch-default'
      );

      const graph = createTestGraph(
        [startNode, switchNode, printCaseNode],
        [
          createEdge('start', 'start-exec-out', 'switch', 'switch-exec-in'),
          createEdge('switch', 'switch-case-1', 'print-case', 'print-case-exec-in'),
        ]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('case 0:');
      expect(result.code).toContain('"legacy-case-0"');
      expect(result.code).not.toContain('case 1:');
    });

    it('should combine switch case labels that target the same node into one block', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const switchNode = createNode('Switch', { x: 200, y: 0 }, 'switch');
      const printSharedNode = createNode('Print', { x: 420, y: 0 }, 'print-shared');
      printSharedNode.inputs[1].value = 'grouped-cases';

      const graph = createTestGraph(
        [startNode, switchNode, printSharedNode],
        [
          createEdge('start', 'start-exec-out', 'switch', 'switch-exec-in'),
          createEdge('switch', 'switch-case-0', 'print-shared', 'print-shared-exec-in'),
          createEdge('switch', 'switch-case-1', 'print-shared', 'print-shared-exec-in'),
        ]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toMatch(/case 0:\s*\n\s*case 1:\s*\n\s*\{/);
      const groupedPrintMatches = result.code.match(/"grouped-cases"/g) ?? [];
      expect(groupedPrintMatches).toHaveLength(1);
    });

    it('should wrap switch case and default bodies into braces', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const switchNode = createNode('Switch', { x: 200, y: 0 }, 'switch');

      const graph = createTestGraph(
        [startNode, switchNode],
        [createEdge('start', 'start-exec-out', 'switch', 'switch-exec-in')]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toMatch(/case 0:\s*\n\s*\{/);
      expect(result.code).toMatch(/default:\s*\n\s*\{/);
    });

    it('should generate switch with initializer when enabled in node properties', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const switchNode = createNode('Switch', { x: 200, y: 0 }, 'switch');
      switchNode.properties = {
        switchInitEnabled: true,
        switchInit: 'int k{2}',
      };

      const graph = createTestGraph(
        [startNode, switchNode],
        [createEdge('start', 'start-exec-out', 'switch', 'switch-exec-in')]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('switch (int k{2}; k)');
    });

    it('should sanitize trailing semicolon in switch initializer', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const switchNode = createNode('Switch', { x: 200, y: 0 }, 'switch');
      switchNode.properties = {
        switchInitEnabled: true,
        switchInit: 'int k{2};',
      };

      const graph = createTestGraph(
        [startNode, switchNode],
        [createEdge('start', 'start-exec-out', 'switch', 'switch-exec-in')]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('switch (int k{2}; k)');
      expect(result.code).not.toContain('int k{2};; k');
    });

    it('should use legacy switch value input when selection input id is absent', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const switchNode = createNode('Switch', { x: 200, y: 0 }, 'switch');
      const constNode = createNode('ConstNumber', { x: 40, y: 120 }, 'const');
      constNode.properties = { value: 7 };
      const constOutputPortId = constNode.outputs.find((port) => port.dataType !== 'execution')?.id ?? 'const-result';
      const switchSelectionPort = switchNode.inputs.find((port) => port.dataType !== 'execution');
      if (switchSelectionPort) {
        switchSelectionPort.id = 'value';
      }
      switchNode.properties = {
        switchInitEnabled: true,
        switchInit: 'int k{2}',
      };

      const graph = createTestGraph(
        [startNode, switchNode, constNode],
        [
          createEdge('start', 'start-exec-out', 'switch', 'switch-exec-in'),
          createEdge('const', constOutputPortId, 'switch', 'switch-value', 'int32'),
        ]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('switch (int k{2}; 7)');
    });

    it('should warn when switch initializer variable is unused', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const switchNode = createNode('Switch', { x: 200, y: 0 }, 'switch');
      switchNode.properties = {
        switchInitEnabled: true,
        switchInit: 'int k{2}',
      };
      const selectionPort = switchNode.inputs.find((port) => port.dataType !== 'execution');
      if (selectionPort) {
        // Явно заданное значение должно сохраняться и не подменяться на `k`.
        selectionPort.value = 0;
      }

      const graph = createTestGraph(
        [startNode, switchNode],
        [createEdge('start', 'start-exec-out', 'switch', 'switch-exec-in')]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.warnings.some((warning) => warning.code === 'UNUSED_SWITCH_INIT')).toBe(true);
    });

    it('should not emit unused-switch-init warning for non-declaration init expression', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const switchNode = createNode('Switch', { x: 200, y: 0 }, 'switch');
      switchNode.properties = {
        switchInitEnabled: true,
        switchInit: 'prepare_switch_context()',
      };

      const graph = createTestGraph(
        [startNode, switchNode],
        [createEdge('start', 'start-exec-out', 'switch', 'switch-exec-in')]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.warnings.some((warning) => warning.code === 'UNUSED_SWITCH_INIT')).toBe(false);
    });
    
    it('should generate Break', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const forNode = createNode('ForLoop', { x: 200, y: 0 }, 'for');
      const breakNode = createNode('Break', { x: 400, y: 0 }, 'break');
      
      const graph = createTestGraph(
        [startNode, forNode, breakNode],
        [
          createEdge('start', 'start-exec-out', 'for', 'for-exec-in'),
          createEdge('for', 'for-loop-body', 'break', 'break-exec-in'),
        ]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('break;');
    });
    
    it('should generate Continue', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const forNode = createNode('ForLoop', { x: 200, y: 0 }, 'for');
      const continueNode = createNode('Continue', { x: 400, y: 0 }, 'continue');
      
      const graph = createTestGraph(
        [startNode, forNode, continueNode],
        [
          createEdge('start', 'start-exec-out', 'for', 'for-exec-in'),
          createEdge('for', 'for-loop-body', 'continue', 'continue-exec-in'),
        ]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('continue;');
    });
    
    it('should generate Parallel with fallback when thread outputs are not connected', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const parallelNode = createNode('Parallel', { x: 200, y: 0 }, 'parallel');

      const graph = createTestGraph(
        [startNode, parallelNode],
        [createEdge('start', 'start-exec-out', 'parallel', 'parallel-exec-in')]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.warnings.some(w => w.message.includes('Parallel: нет подключённых Thread-веток'))).toBe(true);
    });

    it('should generate Gate', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const gateNode = createNode('Gate', { x: 200, y: 0 }, 'gate');
      const printNode = createNode('Print', { x: 400, y: 0 }, 'print');

      const graph = createTestGraph(
        [startNode, gateNode, printNode],
        [
          createEdge('start', 'start-exec-out', 'gate', 'gate-enter'),
          createEdge('gate', 'gate-exit', 'print', 'print-exec-in'),
        ]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('static bool gate_open_gate = false;');
    });

    it('should generate DoN and expose counter output', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const doNNode = createNode('DoN', { x: 200, y: 0 }, 'don');
      const printNode = createNode('Print', { x: 400, y: 0 }, 'print');

      const graph = createTestGraph(
        [startNode, doNNode, printNode],
        [
          createEdge('start', 'start-exec-out', 'don', 'don-exec-in'),
          createEdge('don', 'don-exit', 'print', 'print-exec-in'),
          createEdge('don', 'don-counter', 'print', 'print-string', 'int32'),
        ]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('static int do_n_counter_don = 0;');
      expect(result.code).toContain('std::cout << do_n_counter_don');
    });

    it('should generate DoOnce', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const doOnceNode = createNode('DoOnce', { x: 200, y: 0 }, 'doonce');

      const graph = createTestGraph(
        [startNode, doOnceNode],
        [createEdge('start', 'start-exec-out', 'doonce', 'doonce-exec-in')]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('static bool do_once_done_doonce = false;');
    });

    it('should generate FlipFlop', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const flipFlopNode = createNode('FlipFlop', { x: 200, y: 0 }, 'flipflop');

      const graph = createTestGraph(
        [startNode, flipFlopNode],
        [createEdge('start', 'start-exec-out', 'flipflop', 'flipflop-exec-in')]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('static bool flip_flop_is_a_flipflop = true;');
      expect(result.code).toContain('flip_flop_is_a_flipflop = !flip_flop_is_a_flipflop;');
    });

    it('should generate MultiGate', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const multiGateNode = createNode('MultiGate', { x: 200, y: 0 }, 'multigate');
      const printNode = createNode('Print', { x: 400, y: 0 }, 'print');

      const graph = createTestGraph(
        [startNode, multiGateNode, printNode],
        [
          createEdge('start', 'start-exec-out', 'multigate', 'multigate-exec-in'),
          createEdge('multigate', 'multigate-out-0', 'print', 'print-exec-in'),
        ]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('static int multi_gate_index_multigate = 0;');
      expect(result.code).toContain('switch (multi_gate_index_multigate)');
    });

    it('should use deterministic random generator for MultiGate', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const multiGateNode = createNode('MultiGate', { x: 200, y: 0 }, 'multigate-rng');
      const printNode = createNode('Print', { x: 400, y: 0 }, 'print');

      const graph = createTestGraph(
        [startNode, multiGateNode, printNode],
        [
          createEdge('start', 'start-exec-out', 'multigate-rng', 'multigate-rng-exec-in'),
          createEdge('multigate-rng', 'multigate-rng-out-0', 'print', 'print-exec-in'),
        ]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('static std::mt19937 multi_gate_rng_multigaterng');
      expect(result.code).toContain('std::uniform_int_distribution<int>');
    });

    it('should warn about partially connected MultiGate outputs', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const multiGateNode = createNode('MultiGate', { x: 200, y: 0 }, 'multigate-partial');
      const printNode = createNode('Print', { x: 400, y: 0 }, 'print');

      const graph = createTestGraph(
        [startNode, multiGateNode, printNode],
        [
          createEdge('start', 'start-exec-out', 'multigate-partial', 'multigate-partial-exec-in'),
          createEdge('multigate-partial', 'multigate-partial-out-0', 'print', 'print-exec-in'),
        ]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.warnings.some(w => w.message.includes('MultiGate: подключено 1 из 3 выходов Out-*'))).toBe(true);
    });

    it('should warn about partially connected Parallel outputs', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const parallelNode = createNode('Parallel', { x: 200, y: 0 }, 'parallel-partial');
      const printNode = createNode('Print', { x: 400, y: 0 }, 'print');

      const graph = createTestGraph(
        [startNode, parallelNode, printNode],
        [
          createEdge('start', 'start-exec-out', 'parallel-partial', 'parallel-partial-exec-in'),
          createEdge('parallel-partial', 'parallel-partial-thread-0', 'print', 'print-exec-in'),
        ]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.warnings.some(w => w.message.includes('Parallel: подключено 1 из 2 Thread-веток'))).toBe(true);
    });

    it('should generate ForEach', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const forEachNode = createNode('ForEach', { x: 200, y: 0 }, 'foreach');
      
      const graph = createTestGraph(
        [startNode, forEachNode],
        [createEdge('start', 'start-exec-out', 'foreach', 'foreach-exec-in')]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('for (const auto&');
    });
  });
  
  describe('generate - Math operations', () => {
    it('should generate ConstNumber expression', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const constNode = createNode('ConstNumber', { x: 200, y: 0 }, 'const-number');
      const printNode = createNode('Print', { x: 400, y: 0 }, 'print');
      constNode.properties = { value: 42.5 };

      const graph = createTestGraph(
        [startNode, constNode, printNode],
        [
          createEdge('start', 'start-exec-out', 'print', 'print-exec-in'),
          createEdge('const-number', 'const-number-result', 'print', 'print-string', 'double'),
        ]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('std::cout << 42.5');
    });

    it('should generate Add expression', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const addNode = createNode('Add', { x: 200, y: 0 }, 'add');
      const printNode = createNode('Print', { x: 400, y: 0 }, 'print');
      
      // Устанавливаем значения для Add
      addNode.inputs[0].value = 5;
      addNode.inputs[1].value = 3;
      
      const graph = createTestGraph(
        [startNode, addNode, printNode],
        [
          createEdge('start', 'start-exec-out', 'print', 'print-exec-in'),
          createEdge('add', 'add-result', 'print', 'print-string', 'float'),
        ]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      // Add узел pure — не генерирует код напрямую, но его выражение используется
    });

    it('should generate Add expression with three operands', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const addNode = createNode('Add', { x: 200, y: 0 }, 'add');
      const setNode = createNode('SetVariable', { x: 380, y: 0 }, 'set');

      addNode.inputs.push({
        id: 'add-c',
        name: 'C',
        dataType: 'float',
        direction: 'input',
        index: addNode.inputs.length,
        defaultValue: 0,
      });
      addNode.inputs[0].value = 1;
      addNode.inputs[1].value = 2;
      addNode.inputs[2].value = 3;
      setNode.properties = {
        variableId: 'var-sum',
        dataType: 'double',
      };

      const graph = createTestGraph(
        [startNode, addNode, setNode],
        [
          createEdge('start', 'start-exec-out', 'set', 'set-exec-in'),
          createEdge('add', 'add-result', 'set', 'set-value-in', 'double'),
        ]
      );
      graph.variables = [
        {
          id: 'var-sum',
          name: 'sum',
          nameRu: 'сумма',
          codeName: 'sum',
          dataType: 'double',
          defaultValue: 0,
          category: 'default',
        },
      ];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('sum = (1 + 2 + 3);');
    });
  });
  
  describe('generate - Variables', () => {
    it('should generate Variable declaration', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const varNode = createNode('Variable', { x: 200, y: 0 }, 'var');
      varNode.properties = { name: 'counter', dataType: 'int32', defaultValue: '0' };
      
      const setNode = createNode('SetVariable', { x: 400, y: 0 }, 'set');
      setNode.properties = { variableId: 'var' };
      
      const graph = createTestGraph(
        [startNode, varNode, setNode],
        [createEdge('start', 'start-exec-out', 'set', 'set-exec-in')]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
    });

    it('should skip redundant first SetVariable assignment when it equals declaration default', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const setNode = createNode('SetVariable', { x: 220, y: 0 }, 'set-counter');
      const endNode = createNode('End', { x: 420, y: 0 }, 'end');
      setNode.properties = { variableId: 'var-counter', dataType: 'int32' };

      const graph = createTestGraph(
        [startNode, setNode, endNode],
        [
          createEdge('start', 'start-exec-out', 'set-counter', 'set-counter-exec-in'),
          createEdge('set-counter', 'set-counter-exec-out', 'end', 'end-exec-in'),
        ]
      );
      graph.variables = [
        {
          id: 'var-counter',
          name: 'counter',
          nameRu: 'Счётчик',
          codeName: 'counter',
          dataType: 'int32',
          defaultValue: 32,
          category: 'default',
        },
      ];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      const assignmentMatches = result.code.match(/counter\s*=\s*32;/g) ?? [];
      expect(assignmentMatches).toHaveLength(1);
      expect(result.code).toContain('int counter = 32;');
    });

    it('should skip redundant first SetVariable assignment when variableId is missing but identifier matches graph variable', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const setNode = createNode('SetVariable', { x: 220, y: 0 }, 'set-counter');
      const endNode = createNode('End', { x: 420, y: 0 }, 'end');
      setNode.properties = {
        dataType: 'int32',
        codeName: 'counter',
        inputValue: 32,
        inputValueIsOverride: true,
      };

      const graph = createTestGraph(
        [startNode, setNode, endNode],
        [
          createEdge('start', 'start-exec-out', 'set-counter', 'set-counter-exec-in'),
          createEdge('set-counter', 'set-counter-exec-out', 'end', 'end-exec-in'),
        ]
      );
      graph.variables = [
        {
          id: 'var-counter',
          name: 'counter',
          nameRu: 'Счётчик',
          codeName: 'counter',
          dataType: 'int32',
          defaultValue: 32,
          category: 'default',
        },
      ];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      const assignmentMatches = result.code.match(/counter\s*=\s*32;/g) ?? [];
      expect(assignmentMatches).toHaveLength(1);
      expect(result.code).toContain('int counter = 32;');
    });

    it('should keep first SetVariable assignment when value differs from declaration default', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const setNode = createNode('SetVariable', { x: 220, y: 0 }, 'set-counter');
      const endNode = createNode('End', { x: 420, y: 0 }, 'end');
      setNode.properties = {
        variableId: 'var-counter',
        dataType: 'int32',
        inputValue: 33,
        inputValueIsOverride: true,
      };

      const graph = createTestGraph(
        [startNode, setNode, endNode],
        [
          createEdge('start', 'start-exec-out', 'set-counter', 'set-counter-exec-in'),
          createEdge('set-counter', 'set-counter-exec-out', 'end', 'end-exec-in'),
        ]
      );
      graph.variables = [
        {
          id: 'var-counter',
          name: 'counter',
          nameRu: 'Счётчик',
          codeName: 'counter',
          dataType: 'int32',
          defaultValue: 32,
          category: 'default',
        },
      ];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('int counter = 32;');
      expect(result.code).toContain('counter = 33;');
    });

    it('should generate explicit conversion expression for TypeConversion node', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const getNode = createNode('GetVariable', { x: 160, y: 120 }, 'get-count');
      const conversionNode = createNode('TypeConversion', { x: 300, y: 120 }, 'convert-count');
      const printNode = createNode('Print', { x: 460, y: 0 }, 'print');
      const endNode = createNode('End', { x: 660, y: 0 }, 'end');

      getNode.properties = { variableId: 'var-counter', dataType: 'int32' };
      conversionNode.properties = {
        conversionId: 'int32_to_string',
        fromType: 'int32',
        toType: 'string',
      };
      conversionNode.inputs = conversionNode.inputs.map((port) =>
        port.id.endsWith('value-in') ? { ...port, dataType: 'int32' } : port
      );
      conversionNode.outputs = conversionNode.outputs.map((port) =>
        port.id.endsWith('value-out') ? { ...port, dataType: 'string' } : port
      );

      const graph = createTestGraph(
        [startNode, getNode, conversionNode, printNode, endNode],
        [
          createEdge('start', 'start-exec-out', 'print', 'print-exec-in'),
          createEdge('print', 'print-exec-out', 'end', 'end-exec-in'),
          createEdge('get-count', 'get-count-value-out', 'convert-count', 'convert-count-value-in', 'int32'),
          createEdge('convert-count', 'convert-count-value-out', 'print', 'print-string', 'string'),
        ]
      );
      graph.variables = [
        {
          id: 'var-counter',
          name: 'counter',
          nameRu: 'Счётчик',
          codeName: 'counter',
          dataType: 'int32',
          defaultValue: 42,
          category: 'default',
        },
      ];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('std::cout << std::to_string(counter) << std::endl;');
    });

    it('should show SetVariable comment with real RHS expression from incoming conversion', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const inputNode = createNode('Input', { x: 160, y: 0 }, 'input');
      const conversionNode = createNode('TypeConversion', { x: 340, y: 140 }, 'convert');
      const setNode = createNode('SetVariable', { x: 520, y: 0 }, 'set-counter');
      const endNode = createNode('End', { x: 720, y: 0 }, 'end');

      setNode.properties = { variableId: 'var-counter', dataType: 'int32' };
      conversionNode.properties = {
        conversionId: 'string_to_int32',
        fromType: 'string',
        toType: 'int32',
      };
      conversionNode.inputs = conversionNode.inputs.map((port) =>
        port.id.endsWith('value-in') ? { ...port, dataType: 'string' } : port
      );
      conversionNode.outputs = conversionNode.outputs.map((port) =>
        port.id.endsWith('value-out') ? { ...port, dataType: 'int32' } : port
      );

      const graph = createTestGraph(
        [startNode, inputNode, conversionNode, setNode, endNode],
        [
          createEdge('start', 'start-exec-out', 'input', 'input-exec-in'),
          createEdge('input', 'input-exec-out', 'set-counter', 'set-counter-exec-in'),
          createEdge('set-counter', 'set-counter-exec-out', 'end', 'end-exec-in'),
          createEdge('input', 'input-value', 'convert', 'convert-value-in', 'string'),
          createEdge('convert', 'convert-value-out', 'set-counter', 'set-counter-value-in', 'int32'),
        ]
      );
      graph.variables = [
        {
          id: 'var-counter',
          name: 'counter',
          nameRu: 'Счётчик',
          codeName: 'counter',
          dataType: 'int32',
          defaultValue: 0,
          category: 'default',
        },
      ];

      const result = generator.generate(graph, {
        includeRussianComments: true,
        includeSourceMarkers: false,
      });

      expect(result.success).toBe(true);
      expect(result.code).toMatch(/\/\/ Установить: Счётчик <- std::stoi\(/);
      expect(result.code).toContain('counter = std::stoi(');
    });

    it('should resolve TypeConversion input expression even with non-standard port ids', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const getNode = createNode('GetVariable', { x: 160, y: 120 }, 'get-count');
      const conversionNode = createNode('TypeConversion', { x: 300, y: 120 }, 'convert-count');
      const printNode = createNode('Print', { x: 460, y: 0 }, 'print');
      const endNode = createNode('End', { x: 660, y: 0 }, 'end');

      getNode.properties = { variableId: 'var-counter', dataType: 'int32' };
      conversionNode.properties = {
        conversionId: 'int32_to_string',
        fromType: 'int32',
        toType: 'string',
      };
      conversionNode.inputs = conversionNode.inputs.map((port, index) =>
        index === 0 ? { ...port, id: 'convert-count-src', dataType: 'int32' } : port
      );
      conversionNode.outputs = conversionNode.outputs.map((port, index) =>
        index === 0 ? { ...port, id: 'convert-count-dst', dataType: 'string' } : port
      );

      const graph = createTestGraph(
        [startNode, getNode, conversionNode, printNode, endNode],
        [
          createEdge('start', 'start-exec-out', 'print', 'print-exec-in'),
          createEdge('print', 'print-exec-out', 'end', 'end-exec-in'),
          createEdge('get-count', 'get-count-value-out', 'convert-count', 'convert-count-src', 'int32'),
          createEdge('convert-count', 'convert-count-dst', 'print', 'print-string', 'string'),
        ]
      );
      graph.variables = [
        {
          id: 'var-counter',
          name: 'counter',
          nameRu: 'Счётчик',
          codeName: 'counter',
          dataType: 'int32',
          defaultValue: 42,
          category: 'default',
        },
      ];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('std::cout << std::to_string(counter) << std::endl;');
    });

    it('should inject bool parser helper only when string -> bool conversion is used', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const getNode = createNode('GetVariable', { x: 120, y: 120 }, 'get-text');
      const conversionNode = createNode('TypeConversion', { x: 280, y: 120 }, 'convert-bool');
      const setNode = createNode('SetVariable', { x: 460, y: 0 }, 'set-flag');
      const endNode = createNode('End', { x: 640, y: 0 }, 'end');

      getNode.properties = { variableId: 'var-text', dataType: 'string' };
      conversionNode.properties = {
        conversionId: 'string_to_bool',
        fromType: 'string',
        toType: 'bool',
        meta: {},
      };
      conversionNode.inputs = conversionNode.inputs.map((port) =>
        port.id.endsWith('value-in') ? { ...port, dataType: 'string' } : port
      );
      conversionNode.outputs = conversionNode.outputs.map((port) =>
        port.id.endsWith('value-out') ? { ...port, dataType: 'bool' } : port
      );
      setNode.properties = { variableId: 'var-flag', dataType: 'bool' };
      setNode.inputs = setNode.inputs.map((port) =>
        port.id.endsWith('value-in') ? { ...port, dataType: 'bool' } : port
      );
      setNode.outputs = setNode.outputs.map((port) =>
        port.id.endsWith('value-out') ? { ...port, dataType: 'bool' } : port
      );

      const graph = createTestGraph(
        [startNode, getNode, conversionNode, setNode, endNode],
        [
          createEdge('start', 'start-exec-out', 'set-flag', 'set-flag-exec-in'),
          createEdge('set-flag', 'set-flag-exec-out', 'end', 'end-exec-in'),
          createEdge('get-text', 'get-text-value-out', 'convert-bool', 'convert-bool-value-in', 'string'),
          createEdge('convert-bool', 'convert-bool-value-out', 'set-flag', 'set-flag-value-in', 'bool'),
        ]
      );
      graph.variables = [
        {
          id: 'var-text',
          name: 'text',
          nameRu: 'текст',
          codeName: 'text',
          dataType: 'string',
          defaultValue: 'true',
          category: 'default',
        },
        {
          id: 'var-flag',
          name: 'flag',
          nameRu: 'флаг',
          codeName: 'flag',
          dataType: 'bool',
          defaultValue: false,
          category: 'default',
        },
      ];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('#include <algorithm>');
      expect(result.code).toContain('#include <cctype>');
      expect(result.code).toContain('#include <stdexcept>');
      expect(result.code).toContain('static auto multicode_parse_bool_strict(const std::string& raw_value) -> bool');
      expect(result.code).toContain('flag = multicode_parse_bool_strict(text);');
    });

    it('should inject pointer-to-string helper when pointer conversion is used', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const getNode = createNode('GetVariable', { x: 120, y: 120 }, 'get-ptr');
      const conversionNode = createNode('TypeConversion', { x: 280, y: 120 }, 'convert-ptr');
      const printNode = createNode('Print', { x: 460, y: 0 }, 'print');
      const endNode = createNode('End', { x: 640, y: 0 }, 'end');

      getNode.properties = { variableId: 'var-ptr', dataType: 'pointer' };
      conversionNode.properties = {
        conversionId: 'pointer_to_string',
        fromType: 'pointer',
        toType: 'string',
        meta: {},
      };
      conversionNode.inputs = conversionNode.inputs.map((port) =>
        port.id.endsWith('value-in') ? { ...port, dataType: 'pointer' } : port
      );
      conversionNode.outputs = conversionNode.outputs.map((port) =>
        port.id.endsWith('value-out') ? { ...port, dataType: 'string' } : port
      );

      const graph = createTestGraph(
        [startNode, getNode, conversionNode, printNode, endNode],
        [
          createEdge('start', 'start-exec-out', 'print', 'print-exec-in'),
          createEdge('print', 'print-exec-out', 'end', 'end-exec-in'),
          createEdge('get-ptr', 'get-ptr-value-out', 'convert-ptr', 'convert-ptr-value-in', 'pointer'),
          createEdge('convert-ptr', 'convert-ptr-value-out', 'print', 'print-string', 'string'),
        ]
      );
      graph.variables = [
        {
          id: 'var-ptr',
          name: 'ptr',
          nameRu: 'ptr',
          codeName: 'ptr',
          dataType: 'pointer',
          category: 'default',
          pointerMeta: {
            mode: 'shared',
            pointeeDataType: 'int32',
          },
          defaultValue: 7,
        },
      ];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('#include <sstream>');
      expect(result.code).toContain('auto multicode_pointer_to_string(const std::shared_ptr<T>& value) -> std::string');
      expect(result.code).toContain('std::cout << multicode_pointer_to_string(ptr) << std::endl;');
    });
  });
  
  describe('generate - Options', () => {
    it('should respect includeHeaders option', () => {
      const graph = createTestGraph([
        createNode('Start', { x: 0, y: 0 }, 'start'),
      ]);
      
      const withHeaders = generator.generate(graph, { includeHeaders: true });
      const withoutHeaders = generator.generate(graph, { includeHeaders: false });
      
      expect(withHeaders.code).toContain('#include');
      expect(withoutHeaders.code).not.toContain('#include');
    });
    
    it('should respect generateMainWrapper option', () => {
      const graph = createTestGraph([
        createNode('Start', { x: 0, y: 0 }, 'start'),
      ]);
      
      const withMain = generator.generate(graph, { generateMainWrapper: true });
      const withoutMain = generator.generate(graph, { generateMainWrapper: false });
      
      expect(withMain.code).toContain('int main()');
      expect(withoutMain.code).not.toContain('int main()');
    });
  });
  
  describe('stats', () => {
    it('should count processed nodes', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const printNode = createNode('Print', { x: 200, y: 0 }, 'print');
      const endNode = createNode('End', { x: 400, y: 0 }, 'end');
      
      const graph = createTestGraph(
        [startNode, printNode, endNode],
        [
          createEdge('start', 'start-exec-out', 'print', 'print-exec-in'),
          createEdge('print', 'print-exec-out', 'end', 'end-exec-in'),
        ]
      );
      
      const result = generator.generate(graph);
      
      expect(result.stats.nodesProcessed).toBe(3);
    });
    
    it('should warn about unused nodes', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const unusedPrint = createNode('Print', { x: 200, y: 200 }, 'unused');
      
      const graph = createTestGraph([startNode, unusedPrint]);
      
      const result = generator.generate(graph);
      
      expect(result.warnings.some(w => w.code === 'UNUSED_NODE')).toBe(true);
    });
  });
  
  describe('generate - Other nodes', () => {
    it('should generate Comment node', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const commentNode = createNode('Comment', { x: 200, y: 0 }, 'comment');
      commentNode.comment = 'This is a test comment';
      
      const printNode = createNode('Print', { x: 400, y: 0 }, 'print');
      
      const graph = createTestGraph(
        [startNode, commentNode, printNode],
        [
          createEdge('start', 'start-exec-out', 'print', 'print-exec-in'),
        ]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      // Comment не генерирует код напрямую в execution flow
    });
    
    it('should generate multiline Comment', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const commentNode = createNode('Comment', { x: 200, y: 0 }, 'comment');
      commentNode.comment = 'Line 1\nLine 2\nLine 3';
      
      const graph = createTestGraph(
        [startNode, commentNode],
        []
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
    });
    
    it('should handle Reroute node (passthrough)', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const rerouteNode = createNode('Reroute', { x: 200, y: 0 }, 'reroute');
      const printNode = createNode('Print', { x: 400, y: 0 }, 'print');
      
      const graph = createTestGraph(
        [startNode, rerouteNode, printNode],
        [
          createEdge('start', 'start-exec-out', 'print', 'print-exec-in'),
        ]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
    });
    
    it('should return structured error for Custom node (fallback)', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const customNode: BlueprintNode = {
        id: 'custom-1',
        type: 'Custom' as BlueprintNodeType,
        label: 'MyCustomNode',
        position: { x: 200, y: 0 },
        inputs: [
          { id: 'custom-1-exec-in', name: 'In', dataType: 'execution', direction: 'input', index: 0 },
        ],
        outputs: [
          { id: 'custom-1-exec-out', name: 'Out', dataType: 'execution', direction: 'output', index: 0 },
        ],
      };
      
      const graph = createTestGraph(
        [startNode, customNode],
        [createEdge('start', 'start-exec-out', 'custom-1', 'custom-1-exec-in')]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(expect.objectContaining({
        nodeId: 'custom-1',
        code: 'UNIMPLEMENTED_NODE_TYPE',
      }));
      expect(result.code).not.toContain('TODO');
    });
    
    it('should return structured error for Function node (fallback)', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const functionNode: BlueprintNode = {
        id: 'func-1',
        type: 'Function' as BlueprintNodeType,
        label: 'MyFunction',
        position: { x: 200, y: 0 },
        inputs: [
          { id: 'func-1-exec-in', name: 'In', dataType: 'execution', direction: 'input', index: 0 },
        ],
        outputs: [
          { id: 'func-1-exec-out', name: 'Out', dataType: 'execution', direction: 'output', index: 0 },
        ],
      };
      
      const graph = createTestGraph(
        [startNode, functionNode],
        [createEdge('start', 'start-exec-out', 'func-1', 'func-1-exec-in')]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(expect.objectContaining({
        nodeId: 'func-1',
        code: 'UNIMPLEMENTED_NODE_TYPE',
      }));
      expect(result.code).not.toContain('TODO');
    });
    
    it('should return structured error for Event node (fallback)', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const eventNode: BlueprintNode = {
        id: 'event-1',
        type: 'Event' as BlueprintNodeType,
        label: 'OnClick',
        position: { x: 200, y: 0 },
        inputs: [
          { id: 'event-1-exec-in', name: 'In', dataType: 'execution', direction: 'input', index: 0 },
        ],
        outputs: [
          { id: 'event-1-exec-out', name: 'Out', dataType: 'execution', direction: 'output', index: 0 },
        ],
      };
      
      const graph = createTestGraph(
        [startNode, eventNode],
        [createEdge('start', 'start-exec-out', 'event-1', 'event-1-exec-in')]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(expect.objectContaining({
        nodeId: 'event-1',
        code: 'UNIMPLEMENTED_NODE_TYPE',
      }));
      expect(result.code).not.toContain('TODO');
    });

    it('should deduplicate repeated errors with stable order', () => {
      const localGenerator = new CppCodeGenerator();
      const duplicateErrorGenerator: INodeGenerator = {
        nodeTypes: ['Custom' as BlueprintNodeType],
        generate: (node, _context, helpers) => {
          helpers.addError(
            node.id,
            CodeGenErrorCode.UNIMPLEMENTED_NODE_TYPE,
            'Дублируемая ошибка',
            'Duplicated error'
          );
          // Имитируем вложенный проход: та же ошибка добавляется повторно.
          helpers.addError(
            node.id,
            CodeGenErrorCode.UNIMPLEMENTED_NODE_TYPE,
            'Дублируемая ошибка',
            'Duplicated error'
          );

          return { lines: [], followExecutionFlow: true };
        },
      };
      localGenerator.registerGenerator(duplicateErrorGenerator);

      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const customNode = createNode('Custom' as BlueprintNodeType, { x: 200, y: 0 }, 'custom-1');

      const graph = createTestGraph(
        [startNode, customNode],
        [createEdge('start', 'start-exec-out', 'custom-1', 'custom-1-exec-in')]
      );

      const firstPass = localGenerator.generate(graph);
      const secondPass = localGenerator.generate(graph);

      expect(firstPass.success).toBe(false);
      expect(secondPass.success).toBe(false);

      expect(firstPass.errors).toEqual([
        {
          nodeId: 'custom-1',
          code: CodeGenErrorCode.UNIMPLEMENTED_NODE_TYPE,
          message: 'Дублируемая ошибка',
          messageEn: 'Duplicated error',
        },
      ]);

      expect(secondPass.errors).toEqual(firstPass.errors);
    });


    it('не должен генерировать TODO для поддержанных узлов', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const printNode = createNode('Print', { x: 200, y: 0 }, 'print');
      const endNode = createNode('End', { x: 400, y: 0 }, 'end');

      const graph = createTestGraph(
        [startNode, printNode, endNode],
        [
          createEdge('start', 'start-exec-out', 'print', 'print-exec-in'),
          createEdge('print', 'print-exec-out', 'end', 'end-exec-in'),
        ]
      );

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).not.toContain('TODO');
    });

  });
  
  describe('generate - Variables detailed', () => {
    it('should add explicit cast when assigning double source to int target variable', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const getNode = createNode('GetVariable', { x: 180, y: 120 }, 'get-src');
      const setNode = createNode('SetVariable', { x: 320, y: 0 }, 'set-dst');
      const endNode = createNode('End', { x: 520, y: 0 }, 'end');

      getNode.properties = { variableId: 'var-src', dataType: 'double' };
      setNode.properties = { variableId: 'var-dst', dataType: 'int32' };

      const graph = createTestGraph(
        [startNode, getNode, setNode, endNode],
        [
          createEdge('start', 'start-exec-out', 'set-dst', 'set-dst-exec-in'),
          createEdge('set-dst', 'set-dst-exec-out', 'end', 'end-exec-in'),
          createEdge('get-src', 'get-src-value-out', 'set-dst', 'set-dst-value-in', 'double'),
        ]
      );
      graph.variables = [
        {
          id: 'var-src',
          name: 'src',
          nameRu: 'src',
          codeName: 'src',
          dataType: 'double',
          defaultValue: 10.5,
          category: 'default',
        },
        {
          id: 'var-dst',
          name: 'dst',
          nameRu: 'dst',
          codeName: 'dst',
          dataType: 'int32',
          defaultValue: 0,
          category: 'default',
        },
      ];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('dst = static_cast<int>(src);');
    });

    it('should resolve variableId-based Set/Get without unnamed identifiers', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const getNode = createNode('GetVariable', { x: 200, y: 100 }, 'get-64');
      const setNode = createNode('SetVariable', { x: 320, y: 0 }, 'set-32');
      const endNode = createNode('End', { x: 520, y: 0 }, 'end');

      getNode.label = '';
      setNode.label = '';
      getNode.properties = { variableId: 'var-64', dataType: 'int32' };
      setNode.properties = { variableId: 'var-32', dataType: 'int32' };

      const getValueOut = getNode.outputs.find((port) => port.id.includes('value-out'))?.id ?? 'get-64-value-out';
      const setValueIn = setNode.inputs.find((port) => port.id.includes('value-in'))?.id ?? 'set-32-value-in';
      const startExecOut = startNode.outputs.find((port) => port.dataType === 'execution')?.id ?? 'start-exec-out';
      const setExecIn = setNode.inputs.find((port) => port.dataType === 'execution')?.id ?? 'set-32-exec-in';
      const setExecOut = setNode.outputs.find((port) => port.id.includes('exec-out'))?.id ?? 'set-32-exec-out';
      const endExecIn = endNode.inputs.find((port) => port.dataType === 'execution')?.id ?? 'end-exec-in';

      const graph = createTestGraph(
        [startNode, getNode, setNode, endNode],
        [
          createEdge('start', startExecOut, 'set-32', setExecIn),
          createEdge('set-32', setExecOut, 'end', endExecIn),
          createEdge('get-64', getValueOut, 'set-32', setValueIn, 'int32'),
        ]
      );
      graph.variables = [
        {
          id: 'var-32',
          name: '32',
          nameRu: '32',
          dataType: 'int32',
          defaultValue: 0,
          category: 'default',
        },
        {
          id: 'var-64',
          name: '64',
          nameRu: '64',
          dataType: 'int32',
          defaultValue: 34,
          category: 'default',
        },
      ];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('int var_32 = 0;');
      expect(result.code).toContain('int var_64 = 34;');
      expect(result.code).toContain('var_32 = var_64;');
      expect(result.code).not.toContain('unnamed');
    });

    it('should transliterate cyrillic variable names for Set/Get assignment', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const getNode = createNode('GetVariable', { x: 200, y: 100 }, 'get-src');
      const setNode = createNode('SetVariable', { x: 320, y: 0 }, 'set-dst');
      const endNode = createNode('End', { x: 520, y: 0 }, 'end');

      getNode.label = '';
      setNode.label = '';
      getNode.properties = { variableId: 'var-src', dataType: 'int32', nameRu: 'тест_34' };
      setNode.properties = { variableId: 'var-dst', dataType: 'int32', nameRu: 'тест' };

      const graph = createTestGraph(
        [startNode, getNode, setNode, endNode],
        [
          createEdge('start', 'start-exec-out', 'set-dst', 'set-dst-exec-in'),
          createEdge('set-dst', 'set-dst-exec-out', 'end', 'end-exec-in'),
          createEdge('get-src', 'get-src-value-out', 'set-dst', 'set-dst-value-in', 'int32'),
        ]
      );
      graph.variables = [
        {
          id: 'var-dst',
          name: 'тест',
          nameRu: 'тест',
          dataType: 'int32',
          defaultValue: 32,
          category: 'default',
        },
        {
          id: 'var-src',
          name: 'тест_34',
          nameRu: 'тест_34',
          dataType: 'int32',
          defaultValue: 34,
          category: 'default',
        },
      ];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('int test = 32;');
      expect(result.code).toContain('int test_34 = 34;');
      expect(result.code).toContain('test = test_34;');
      expect(result.code).not.toContain('unnamed');
    });

    it('should fallback to variableId if variable name cannot form identifier', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const setNode = createNode('SetVariable', { x: 220, y: 0 }, 'set-emoji');
      const endNode = createNode('End', { x: 420, y: 0 }, 'end');

      setNode.label = '';
      setNode.properties = { variableId: 'var-emoji', dataType: 'int32' };

      const graph = createTestGraph(
        [startNode, setNode, endNode],
        [
          createEdge('start', 'start-exec-out', 'set-emoji', 'set-emoji-exec-in'),
          createEdge('set-emoji', 'set-emoji-exec-out', 'end', 'end-exec-in'),
        ]
      );
      graph.variables = [
        {
          id: 'var-emoji',
          name: '🧪',
          nameRu: '🧪',
          dataType: 'int32',
          defaultValue: 7,
          category: 'default',
        },
      ];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('int var_varemoji = 7;');
      expect(result.code).not.toContain('unnamed');
    });

    it('should prioritize codeName over display names in generated code', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const getNode = createNode('GetVariable', { x: 200, y: 100 }, 'get-src');
      const setNode = createNode('SetVariable', { x: 320, y: 0 }, 'set-dst');
      const endNode = createNode('End', { x: 520, y: 0 }, 'end');

      getNode.label = '';
      setNode.label = '';
      getNode.properties = { variableId: 'var-src', dataType: 'int32' };
      setNode.properties = { variableId: 'var-dst', dataType: 'int32' };

      const graph = createTestGraph(
        [startNode, getNode, setNode, endNode],
        [
          createEdge('start', 'start-exec-out', 'set-dst', 'set-dst-exec-in'),
          createEdge('set-dst', 'set-dst-exec-out', 'end', 'end-exec-in'),
          createEdge('get-src', 'get-src-value-out', 'set-dst', 'set-dst-value-in', 'int32'),
        ]
      );
      graph.variables = [
        {
          id: 'var-dst',
          name: 'приёмник',
          nameRu: 'Приёмник',
          codeName: 'dst_value',
          dataType: 'int32',
          defaultValue: 32,
          category: 'default',
        },
        {
          id: 'var-src',
          name: 'источник',
          nameRu: 'Источник',
          codeName: 'src_value',
          dataType: 'int32',
          defaultValue: 34,
          category: 'default',
        },
      ];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('int dst_value = 32;');
      expect(result.code).toContain('int src_value = 34;');
      expect(result.code).toContain('dst_value = src_value;');
      expect(result.code).not.toContain('unnamed');
    });

    it('should generate vector variables with configured element type', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const endNode = createNode('End', { x: 220, y: 0 }, 'end');
      const graph = createTestGraph(
        [startNode, endNode],
        [createEdge('start', 'start-exec-out', 'end', 'end-exec-in')]
      );

      graph.variables = [
        {
          id: 'var-points',
          name: 'points',
          nameRu: 'точки',
          codeName: 'points',
          dataType: 'vector',
          vectorElementType: 'int32',
          defaultValue: [1, 2, 3],
          category: 'default',
        },
      ];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('std::vector<int> points = {1, 2, 3};');
      expect(result.code).not.toContain('std::vector<double> points');
    });

    it('should generate std::vector<std::string> declarations with escaped literals', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const endNode = createNode('End', { x: 220, y: 0 }, 'end');
      const graph = createTestGraph(
        [startNode, endNode],
        [createEdge('start', 'start-exec-out', 'end', 'end-exec-in')]
      );

      graph.variables = [
        {
          id: 'var-tags',
          name: 'tags',
          nameRu: 'теги',
          codeName: 'tags',
          dataType: 'vector',
          vectorElementType: 'string',
          defaultValue: ['alpha', 'line "quoted"'],
          category: 'default',
        },
      ];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('std::vector<std::string> tags = {"alpha", "line \\"quoted\\""};');
    });

    it('should generate std::vector<T> declaration when variable has isArray=true', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const endNode = createNode('End', { x: 220, y: 0 }, 'end');
      const graph = createTestGraph(
        [startNode, endNode],
        [createEdge('start', 'start-exec-out', 'end', 'end-exec-in')]
      );

      graph.variables = [
        {
          id: 'var-array-values',
          name: 'values',
          nameRu: 'значения',
          codeName: 'values',
          dataType: 'int32',
          isArray: true,
          defaultValue: [10, 20, 30],
          category: 'default',
        },
      ];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('std::vector<int> values = {10, 20, 30};');
    });

    it('should generate nested std::vector declarations for vector<T>[] variables', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const endNode = createNode('End', { x: 220, y: 0 }, 'end');
      const graph = createTestGraph(
        [startNode, endNode],
        [createEdge('start', 'start-exec-out', 'end', 'end-exec-in')]
      );

      graph.variables = [
        {
          id: 'var-matrix',
          name: 'matrix',
          nameRu: 'матрица',
          codeName: 'matrix',
          dataType: 'vector',
          vectorElementType: 'double',
          isArray: true,
          defaultValue: [[1, 2], [3.5, 4]],
          category: 'default',
        },
      ];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('std::vector<std::vector<double>> matrix = {{1, 2}, {3.5, 4}};');
    });

    it('should generate nested std::vector declarations for scalar arrayRank=2 variables', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const endNode = createNode('End', { x: 220, y: 0 }, 'end');
      const graph = createTestGraph(
        [startNode, endNode],
        [createEdge('start', 'start-exec-out', 'end', 'end-exec-in')]
      );

      graph.variables = [
        {
          id: 'var-grid',
          name: 'grid',
          nameRu: 'сетка',
          codeName: 'grid',
          dataType: 'int32',
          arrayRank: 2,
          defaultValue: [[1, 2], [3, 4]],
          category: 'default',
        },
      ];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('std::vector<std::vector<int>> grid = {{1, 2}, {3, 4}};');
    });

    it('should generate pointer/reference declarations and include <memory>', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const endNode = createNode('End', { x: 220, y: 0 }, 'end');
      const graph = createTestGraph(
        [startNode, endNode],
        [createEdge('start', 'start-exec-out', 'end', 'end-exec-in')]
      );

      graph.variables = [
        {
          id: 'var-base',
          name: 'base',
          nameRu: 'base',
          codeName: 'base',
          dataType: 'int32',
          defaultValue: 7,
          category: 'default',
        },
        {
          id: 'ptr-shared',
          name: 'ptrShared',
          nameRu: 'ptrShared',
          codeName: 'ptr_shared',
          dataType: 'pointer',
          defaultValue: 7,
          category: 'default',
          pointerMeta: {
            mode: 'shared',
            pointeeDataType: 'int32',
          },
        },
        {
          id: 'ptr-raw',
          name: 'ptrRaw',
          nameRu: 'ptrRaw',
          codeName: 'ptr_raw',
          dataType: 'pointer',
          defaultValue: null,
          category: 'default',
          pointerMeta: {
            mode: 'raw',
            pointeeDataType: 'int32',
            targetVariableId: 'var-base',
          },
        },
        {
          id: 'ref-base',
          name: 'refBase',
          nameRu: 'refBase',
          codeName: 'ref_base',
          dataType: 'pointer',
          defaultValue: null,
          category: 'default',
          pointerMeta: {
            mode: 'reference',
            pointeeDataType: 'int32',
            targetVariableId: 'var-base',
          },
        },
      ];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('#include <memory>');
      expect(result.code).toContain('std::shared_ptr<int> ptr_shared = std::make_shared<int>(7);');
      expect(result.code).toContain('int* ptr_raw = &base;');
      expect(result.code).toContain('int& ref_base = base;');
    });

    it('should recover pointerMeta for declarations from variable nodes when graph variable lost meta', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const getPointerNode = createNode('GetVariable', { x: 120, y: 120 }, 'get-pointer');
      const endNode = createNode('End', { x: 220, y: 0 }, 'end');
      getPointerNode.properties = {
        variableId: 'ptr-shared',
        pointerMeta: {
          mode: 'shared',
          pointeeDataType: 'int32',
          targetVariableId: 'var-base',
        },
      };

      const graph = createTestGraph(
        [startNode, getPointerNode, endNode],
        [createEdge('start', 'start-exec-out', 'end', 'end-exec-in')]
      );

      graph.variables = [
        {
          id: 'var-base',
          name: 'base',
          nameRu: 'base',
          codeName: 'base',
          dataType: 'int32',
          defaultValue: 7,
          category: 'default',
        },
        {
          id: 'ptr-shared',
          name: 'ptrShared',
          nameRu: 'ptrShared',
          codeName: 'ptr_shared',
          dataType: 'pointer',
          defaultValue: 0,
          category: 'default',
        },
      ];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('std::shared_ptr<int> ptr_shared = std::make_shared<int>(base);');
    });

    it('should keep legacy pointer without meta backward compatible', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const endNode = createNode('End', { x: 220, y: 0 }, 'end');
      const graph = createTestGraph(
        [startNode, endNode],
        [createEdge('start', 'start-exec-out', 'end', 'end-exec-in')]
      );

      graph.variables = [
        {
          id: 'legacy-pointer',
          name: 'legacyPointer',
          nameRu: 'legacyPointer',
          codeName: 'legacy_ptr',
          dataType: 'pointer',
          defaultValue: null,
          category: 'default',
        },
      ];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('std::shared_ptr<void> legacy_ptr = nullptr;');
    });

    it('should not warn about pure GetVariable as unreachable node', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const getNode = createNode('GetVariable', { x: 200, y: 120 }, 'get-value');
      const setNode = createNode('SetVariable', { x: 320, y: 0 }, 'set-value');
      const endNode = createNode('End', { x: 520, y: 0 }, 'end');

      getNode.properties = { variableId: 'var-source', dataType: 'int32' };
      setNode.properties = { variableId: 'var-target', dataType: 'int32' };

      const graph = createTestGraph(
        [startNode, getNode, setNode, endNode],
        [
          createEdge('start', 'start-exec-out', 'set-value', 'set-value-exec-in'),
          createEdge('set-value', 'set-value-exec-out', 'end', 'end-exec-in'),
          createEdge('get-value', 'get-value-value-out', 'set-value', 'set-value-value-in', 'int32'),
        ]
      );
      graph.variables = [
        {
          id: 'var-source',
          name: 'source',
          nameRu: 'источник',
          dataType: 'int32',
          defaultValue: 12,
          category: 'default',
        },
        {
          id: 'var-target',
          name: 'target',
          nameRu: 'цель',
          dataType: 'int32',
          defaultValue: 0,
          category: 'default',
        },
      ];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(
        result.warnings.some(
          (warning) => warning.code === 'UNUSED_NODE' && warning.nodeId === getNode.id
        )
      ).toBe(false);
    });

    it('should localize node comments to English without mixed labels', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const setNode = createNode('SetVariable', { x: 220, y: 0 }, 'set-value');
      const endNode = createNode('End', { x: 420, y: 0 }, 'end');

      startNode.label = 'Start';
      setNode.label = '';
      endNode.label = 'End';
      setNode.properties = { variableId: 'var-counter', dataType: 'int32' };

      const graph = createTestGraph(
        [startNode, setNode, endNode],
        [
          createEdge('start', 'start-exec-out', 'set-value', 'set-value-exec-in'),
          createEdge('set-value', 'set-value-exec-out', 'end', 'end-exec-in'),
        ]
      );
      graph.displayLanguage = 'en';
      graph.variables = [
        {
          id: 'var-counter',
          name: 'counter',
          nameRu: 'Счётчик',
          dataType: 'int32',
          defaultValue: 1,
          category: 'default',
        },
      ];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('// Event Begin Play');
      expect(result.code).toContain('// Set: counter');
      expect(result.code).toContain('// Return');
      expect(result.code).not.toContain('Начало: Start');
      expect(result.code).not.toContain('Установить:');
    });

    it('should generate SetVariable for new variable', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const setNode = createNode('SetVariable', { x: 200, y: 0 }, 'set');
      setNode.label = 'myCounter';
      // Устанавливаем value
      const valuePort = setNode.inputs.find(p => p.id.includes('value'));
      if (valuePort) valuePort.value = 42;
      
      const graph = createTestGraph(
        [startNode, setNode],
        [createEdge('start', 'start-exec-out', 'set', 'set-exec-in')]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('mycounter');
    });
    
    it('should use GetVariable in expression', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      
      // Сначала SetVariable
      const setNode = createNode('SetVariable', { x: 200, y: 0 }, 'set');
      setNode.label = 'counter';
      const setValuePort = setNode.inputs.find(p => p.id.includes('value'));
      if (setValuePort) setValuePort.value = 10;
      
      // Затем GetVariable
      const getNode = createNode('GetVariable', { x: 300, y: 100 }, 'get');
      getNode.label = 'counter';
      
      // Print использует GetVariable
      const printNode = createNode('Print', { x: 400, y: 0 }, 'print');
      
      const graph = createTestGraph(
        [startNode, setNode, getNode, printNode],
        [
          createEdge('start', 'start-exec-out', 'set', 'set-exec-in'),
          createEdge('set', 'set-exec-out', 'print', 'print-exec-in'),
          createEdge('get', 'get-value', 'print', 'print-string', 'float'),
        ]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('counter');
    });
    
    it('should reassign existing variable with SetVariable', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      
      // Variable declaration
      const varNode = createNode('Variable', { x: 100, y: 100 }, 'var');
      varNode.label = 'myVar';
      
      // First SetVariable (should declare if not exists)
      const setNode1 = createNode('SetVariable', { x: 200, y: 0 }, 'set1');
      setNode1.label = 'myVar';
      const setValuePort1 = setNode1.inputs.find(p => p.id.includes('value'));
      if (setValuePort1) setValuePort1.value = 10;
      
      // Second SetVariable (should reassign)
      const setNode2 = createNode('SetVariable', { x: 400, y: 0 }, 'set2');
      setNode2.label = 'myVar';
      const setValuePort2 = setNode2.inputs.find(p => p.id.includes('value'));
      if (setValuePort2) setValuePort2.value = 20;
      
      const graph = createTestGraph(
        [startNode, varNode, setNode1, setNode2],
        [
          createEdge('start', 'start-exec-out', 'set1', 'set1-exec-in'),
          createEdge('set1', 'set1-exec-out', 'set2', 'set2-exec-in'),
        ]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      // Должно быть присваивание (без объявления типа)
      // Имя переменной конвертируется в lowercase (myvar)
      expect(result.code).toContain('myvar =');
    });
    
    it('should use SetVariable output value in chaining', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      
      // SetVariable
      const setNode = createNode('SetVariable', { x: 200, y: 0 }, 'set');
      setNode.label = 'value';
      const setValuePort = setNode.inputs.find(p => p.id.includes('value'));
      if (setValuePort) setValuePort.value = 100;
      
      // Print использует выход SetVariable
      const printNode = createNode('Print', { x: 400, y: 0 }, 'print');
      
      const graph = createTestGraph(
        [startNode, setNode, printNode],
        [
          createEdge('start', 'start-exec-out', 'set', 'set-exec-in'),
          createEdge('set', 'set-exec-out', 'print', 'print-exec-in'),
          createEdge('set', 'set-value', 'print', 'print-string', 'float'),
        ]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('value');
    });
    
    it('should generate Variable node with different data types', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      
      // Variable with string type
      const varNode = createNode('Variable', { x: 200, y: 0 }, 'var');
      varNode.label = 'myString';
      // Устанавливаем тип через output port
      const valueOutput = varNode.outputs.find(p => p.id.includes('value'));
      if (valueOutput) valueOutput.dataType = 'string';
      
      const graph = createTestGraph(
        [startNode, varNode],
        [createEdge('start', 'start-exec-out', 'var', 'var-exec-in')]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('mystring');
    });
    
    it('should get Variable output expression', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      
      // Variable declaration
      const varNode = createNode('Variable', { x: 200, y: 0 }, 'var');
      varNode.label = 'counter';
      
      // Print использует Variable
      const printNode = createNode('Print', { x: 400, y: 0 }, 'print');
      
      const graph = createTestGraph(
        [startNode, varNode, printNode],
        [
          createEdge('start', 'start-exec-out', 'var', 'var-exec-in'),
          createEdge('var', 'var-exec-out', 'print', 'print-exec-in'),
          createEdge('var', 'var-value', 'print', 'print-string', 'float'),
        ]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('counter');
    });
  });
  
  describe('generate - Math and Logic operations', () => {
    it('should generate Subtract expression with three operands using left fold', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const subNode = createNode('Subtract', { x: 200, y: 0 }, 'sub');
      const setNode = createNode('SetVariable', { x: 380, y: 0 }, 'set');

      subNode.inputs.push({
        id: 'sub-c',
        name: 'C',
        nameRu: 'C',
        dataType: 'float',
        direction: 'input',
        index: subNode.inputs.length,
        defaultValue: 0,
      });
      subNode.inputs[0].value = 20;
      subNode.inputs[1].value = 5;
      subNode.inputs[2].value = 3;
      setNode.properties = {
        variableId: 'var-sub',
        dataType: 'double',
      };

      const graph = createTestGraph(
        [startNode, subNode, setNode],
        [
          createEdge('start', 'start-exec-out', 'set', 'set-exec-in'),
          createEdge('sub', 'sub-result', 'set', 'set-value-in', 'double'),
        ]
      );
      graph.variables = [
        {
          id: 'var-sub',
          name: 'sub_result',
          nameRu: 'разность',
          codeName: 'sub_result',
          dataType: 'double',
          defaultValue: 0,
          category: 'default',
        },
      ];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('sub_result = ((20 - 5) - 3);');
    });

    it('should generate Divide expression with three operands using left fold', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const divNode = createNode('Divide', { x: 200, y: 0 }, 'div');
      const setNode = createNode('SetVariable', { x: 380, y: 0 }, 'set');

      divNode.inputs.push({
        id: 'div-c',
        name: 'C',
        nameRu: 'C',
        dataType: 'float',
        direction: 'input',
        index: divNode.inputs.length,
        defaultValue: 1,
      });
      divNode.inputs[0].value = 40;
      divNode.inputs[1].value = 4;
      divNode.inputs[2].value = 2;
      setNode.properties = {
        variableId: 'var-div',
        dataType: 'double',
      };

      const graph = createTestGraph(
        [startNode, divNode, setNode],
        [
          createEdge('start', 'start-exec-out', 'set', 'set-exec-in'),
          createEdge('div', 'div-result', 'set', 'set-value-in', 'double'),
        ]
      );
      graph.variables = [
        {
          id: 'var-div',
          name: 'div_result',
          nameRu: 'частное',
          codeName: 'div_result',
          dataType: 'double',
          defaultValue: 0,
          category: 'default',
        },
      ];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('div_result = ((40 / 4) / 2);');
    });

    it('should generate Modulo expression with three operands using left fold', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const modNode = createNode('Modulo', { x: 200, y: 0 }, 'mod');
      const setNode = createNode('SetVariable', { x: 380, y: 0 }, 'set');

      modNode.inputs.push({
        id: 'mod-c',
        name: 'C',
        nameRu: 'C',
        dataType: 'int32',
        direction: 'input',
        index: modNode.inputs.length,
        defaultValue: 1,
      });
      modNode.inputs[0].value = 17;
      modNode.inputs[1].value = 5;
      modNode.inputs[2].value = 3;
      setNode.properties = {
        variableId: 'var-mod',
        dataType: 'int32',
      };

      const graph = createTestGraph(
        [startNode, modNode, setNode],
        [
          createEdge('start', 'start-exec-out', 'set', 'set-exec-in'),
          createEdge('mod', 'mod-result', 'set', 'set-value-in', 'int32'),
        ]
      );
      graph.variables = [
        {
          id: 'var-mod',
          name: 'mod_result',
          nameRu: 'остаток',
          codeName: 'mod_result',
          dataType: 'int32',
          defaultValue: 0,
          category: 'default',
        },
      ];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('mod_result = ((17 % 5) % 3);');
    });

    it('should generate Subtract expression', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const subNode = createNode('Subtract', { x: 200, y: 0 }, 'sub');
      subNode.inputs[0].value = 10;
      subNode.inputs[1].value = 3;
      
      const printNode = createNode('Print', { x: 400, y: 0 }, 'print');
      
      const graph = createTestGraph(
        [startNode, subNode, printNode],
        [
          createEdge('start', 'start-exec-out', 'print', 'print-exec-in'),
          createEdge('sub', 'sub-result', 'print', 'print-string', 'float'),
        ]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
    });
    
    it('should generate Multiply expression', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const mulNode = createNode('Multiply', { x: 200, y: 0 }, 'mul');
      mulNode.inputs[0].value = 5;
      mulNode.inputs[1].value = 4;
      
      const printNode = createNode('Print', { x: 400, y: 0 }, 'print');
      
      const graph = createTestGraph(
        [startNode, mulNode, printNode],
        [
          createEdge('start', 'start-exec-out', 'print', 'print-exec-in'),
          createEdge('mul', 'mul-result', 'print', 'print-string', 'float'),
        ]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
    });
    
    it('should generate Divide expression', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const divNode = createNode('Divide', { x: 200, y: 0 }, 'div');
      divNode.inputs[0].value = 20;
      divNode.inputs[1].value = 4;
      
      const printNode = createNode('Print', { x: 400, y: 0 }, 'print');
      
      const graph = createTestGraph(
        [startNode, divNode, printNode],
        [
          createEdge('start', 'start-exec-out', 'print', 'print-exec-in'),
          createEdge('div', 'div-result', 'print', 'print-string', 'float'),
        ]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
    });
    
    it('should generate Modulo expression', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const modNode = createNode('Modulo', { x: 200, y: 0 }, 'mod');
      modNode.inputs[0].value = 17;
      modNode.inputs[1].value = 5;
      
      const printNode = createNode('Print', { x: 400, y: 0 }, 'print');
      
      const graph = createTestGraph(
        [startNode, modNode, printNode],
        [
          createEdge('start', 'start-exec-out', 'print', 'print-exec-in'),
          createEdge('mod', 'mod-result', 'print', 'print-string', 'float'),
        ]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
    });

    it('should use correct Less inputs even when node id contains a/b characters', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const mulNode = createNode('Multiply', { x: 120, y: 0 }, 'node-mul');
      const modNode = createNode('Modulo', { x: 120, y: 140 }, 'node-mod');
      const lessNode = createNode('Less', { x: 320, y: 60 }, 'node-ab-compare');
      const setNode = createNode('SetVariable', { x: 520, y: 60 }, 'set');

      mulNode.inputs[0].value = 20;
      mulNode.inputs[1].value = 6;
      modNode.inputs[0].value = 63;
      modNode.inputs[1].value = 5;
      setNode.properties = {
        variableId: 'var-cmp',
        dataType: 'bool',
      };

      const lessInputA = lessNode.inputs.find((port) => port.id.endsWith('-a'));
      const lessInputB = lessNode.inputs.find((port) => port.id.endsWith('-b'));

      const graph = createTestGraph(
        [startNode, mulNode, modNode, lessNode, setNode],
        [
          createEdge('start', 'start-exec-out', 'set', 'set-exec-in'),
          createEdge('node-mul', 'node-mul-result', 'node-ab-compare', lessInputA?.id ?? 'node-ab-compare-a', 'float'),
          createEdge('node-mod', 'node-mod-result', 'node-ab-compare', lessInputB?.id ?? 'node-ab-compare-b', 'int32'),
          createEdge('node-ab-compare', 'node-ab-compare-result', 'set', 'set-value-in', 'bool'),
        ]
      );
      graph.variables = [
        {
          id: 'var-cmp',
          name: 'cmp_result',
          nameRu: 'сравнение',
          codeName: 'cmp_result',
          dataType: 'bool',
          defaultValue: false,
          category: 'default',
        },
      ];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('cmp_result = ((20 * 6) < (63 % 5));');
    });
    
    it('should generate And expression', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const andNode = createNode('And', { x: 200, y: 0 }, 'and');
      andNode.inputs[0].value = true;
      andNode.inputs[1].value = false;
      
      const branchNode = createNode('Branch', { x: 400, y: 0 }, 'branch');
      
      const graph = createTestGraph(
        [startNode, andNode, branchNode],
        [
          createEdge('start', 'start-exec-out', 'branch', 'branch-exec-in'),
          createEdge('and', 'and-result', 'branch', 'branch-condition', 'bool'),
        ]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('if (');
    });
    
    it('should generate Or expression', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const orNode = createNode('Or', { x: 200, y: 0 }, 'or');
      orNode.inputs[0].value = true;
      orNode.inputs[1].value = false;
      
      const branchNode = createNode('Branch', { x: 400, y: 0 }, 'branch');
      
      const graph = createTestGraph(
        [startNode, orNode, branchNode],
        [
          createEdge('start', 'start-exec-out', 'branch', 'branch-exec-in'),
          createEdge('or', 'or-result', 'branch', 'branch-condition', 'bool'),
        ]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('if (');
    });
    
    it('should generate Not expression', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const notNode = createNode('Not', { x: 200, y: 0 }, 'not');
      notNode.inputs[0].value = true;
      
      const branchNode = createNode('Branch', { x: 400, y: 0 }, 'branch');
      
      const graph = createTestGraph(
        [startNode, notNode, branchNode],
        [
          createEdge('start', 'start-exec-out', 'branch', 'branch-exec-in'),
          createEdge('not', 'not-result', 'branch', 'branch-condition', 'bool'),
        ]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('if (');
    });
    
    it('should generate Greater expression', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const gtNode = createNode('Greater', { x: 200, y: 0 }, 'gt');
      gtNode.inputs[0].value = 10;
      gtNode.inputs[1].value = 5;
      
      const branchNode = createNode('Branch', { x: 400, y: 0 }, 'branch');
      
      const graph = createTestGraph(
        [startNode, gtNode, branchNode],
        [
          createEdge('start', 'start-exec-out', 'branch', 'branch-exec-in'),
          createEdge('gt', 'gt-result', 'branch', 'branch-condition', 'bool'),
        ]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('if (');
    });
    
    it('should generate Less expression', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const ltNode = createNode('Less', { x: 200, y: 0 }, 'lt');
      ltNode.inputs[0].value = 3;
      ltNode.inputs[1].value = 7;
      
      const branchNode = createNode('Branch', { x: 400, y: 0 }, 'branch');
      
      const graph = createTestGraph(
        [startNode, ltNode, branchNode],
        [
          createEdge('start', 'start-exec-out', 'branch', 'branch-exec-in'),
          createEdge('lt', 'lt-result', 'branch', 'branch-condition', 'bool'),
        ]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('if (');
    });
    
    it('should generate Equal expression', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const eqNode = createNode('Equal', { x: 200, y: 0 }, 'eq');
      eqNode.inputs[0].value = 5;
      eqNode.inputs[1].value = 5;
      
      const branchNode = createNode('Branch', { x: 400, y: 0 }, 'branch');
      
      const graph = createTestGraph(
        [startNode, eqNode, branchNode],
        [
          createEdge('start', 'start-exec-out', 'branch', 'branch-exec-in'),
          createEdge('eq', 'eq-result', 'branch', 'branch-condition', 'bool'),
        ]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('if (');
    });
    
    it('should generate NotEqual expression', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const neqNode = createNode('NotEqual', { x: 200, y: 0 }, 'neq');
      neqNode.inputs[0].value = 5;
      neqNode.inputs[1].value = 3;
      
      const branchNode = createNode('Branch', { x: 400, y: 0 }, 'branch');
      
      const graph = createTestGraph(
        [startNode, neqNode, branchNode],
        [
          createEdge('start', 'start-exec-out', 'branch', 'branch-exec-in'),
          createEdge('neq', 'neq-result', 'branch', 'branch-condition', 'bool'),
        ]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('if (');
    });
    
    it('should generate GreaterEqual expression', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const geqNode = createNode('GreaterEqual', { x: 200, y: 0 }, 'geq');
      geqNode.inputs[0].value = 5;
      geqNode.inputs[1].value = 5;
      
      const branchNode = createNode('Branch', { x: 400, y: 0 }, 'branch');
      
      const graph = createTestGraph(
        [startNode, geqNode, branchNode],
        [
          createEdge('start', 'start-exec-out', 'branch', 'branch-exec-in'),
          createEdge('geq', 'geq-result', 'branch', 'branch-condition', 'bool'),
        ]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('if (');
    });
    
    it('should generate LessEqual expression', () => {
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const leqNode = createNode('LessEqual', { x: 200, y: 0 }, 'leq');
      leqNode.inputs[0].value = 5;
      leqNode.inputs[1].value = 10;
      
      const branchNode = createNode('Branch', { x: 400, y: 0 }, 'branch');
      
      const graph = createTestGraph(
        [startNode, leqNode, branchNode],
        [
          createEdge('start', 'start-exec-out', 'branch', 'branch-exec-in'),
          createEdge('leq', 'leq-result', 'branch', 'branch-condition', 'bool'),
        ]
      );
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('if (');
    });
  });
  
  describe('withPackages - Template-based generation', () => {
    it('should create generator with package support', () => {
      const getNode = () => undefined;
      const packageGenerator = CppCodeGenerator.withPackages(getNode, []);
      
      expect(packageGenerator).toBeInstanceOf(CppCodeGenerator);
    });
    
    it('should use template from package definition', () => {
      // Определение узла CustomLog из пакета (используем Custom как базовый тип)
      const customNodeDef = {
        type: 'Custom' as BlueprintNodeType,
        label: 'Custom Log',
        labelRu: 'Кастомный лог',
        category: 'io',
        inputs: [
          { id: 'exec-in', name: 'In', dataType: 'execution' },
          { id: 'message', name: 'Message', dataType: 'string' },
        ],
        outputs: [
          { id: 'exec-out', name: 'Out', dataType: 'execution' },
        ],
        _codegen: {
          cpp: {
            template: 'LOG_INFO({{input.message}});',
            includes: ['<logging.h>'],
          },
        },
      };
      
      const getNode = (type: string) => {
        if (type === 'Custom') return customNodeDef;
        return undefined;
      };
      
      const packageGenerator = CppCodeGenerator.withPackages(
        getNode,
        ['Custom' as BlueprintNodeType]
      );
      
      // Создаём граф с Custom узлом
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      
      // Вручную создаём Custom узел
      const customLogNode: BlueprintNode = {
        id: 'customlog-1',
        type: 'Custom' as BlueprintNodeType,
        label: 'Custom Log',
        position: { x: 200, y: 0 },
        inputs: [
          { id: 'customlog-1-exec-in', name: 'In', dataType: 'execution', direction: 'input', index: 0 },
          { id: 'customlog-1-message', name: 'Message', dataType: 'string', direction: 'input', index: 1, value: 'Test message' },
        ],
        outputs: [
          { id: 'customlog-1-exec-out', name: 'Out', dataType: 'execution', direction: 'output', index: 0 },
        ],
      };
      
      const graph = createTestGraph(
        [startNode, customLogNode],
        [createEdge('start', 'start-exec-out', 'customlog-1', 'customlog-1-exec-in')]
      );
      
      const result = packageGenerator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('LOG_INFO(');
      expect(result.code).toContain('<logging.h>');
    });
    

    it('should generate final code for package node with codegen.cpp.template and collect includes', () => {
      const customNodeDef = {
        type: 'Custom' as BlueprintNodeType,
        label: 'Package Delay',
        labelRu: 'Пакетная задержка',
        category: 'flow',
        inputs: [
          { id: 'exec-in', name: 'In', dataType: 'execution' },
          { id: 'ms', name: 'Milliseconds', dataType: 'float' },
        ],
        outputs: [
          { id: 'exec-out', name: 'Out', dataType: 'execution' },
        ],
        _codegen: {
          cpp: {
            template: 'std::this_thread::sleep_for(std::chrono::milliseconds({{input.ms}}));',
            includes: ['<chrono>'],
          },
        },
      };

      const packageGenerator = CppCodeGenerator.withPackages(
        (type: string) => (type === 'Custom' ? customNodeDef : undefined),
        ['Custom' as BlueprintNodeType]
      );

      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const delayNode: BlueprintNode = {
        id: 'delay-1',
        type: 'Custom' as BlueprintNodeType,
        label: 'Package Delay',
        position: { x: 200, y: 0 },
        inputs: [
          { id: 'delay-1-exec-in', name: 'In', dataType: 'execution', direction: 'input', index: 0 },
          { id: 'delay-1-ms', name: 'Milliseconds', dataType: 'float', direction: 'input', index: 1, value: 250 },
        ],
        outputs: [
          { id: 'delay-1-exec-out', name: 'Out', dataType: 'execution', direction: 'output', index: 0 },
        ],
      };

      const graph = createTestGraph(
        [startNode, delayNode],
        [createEdge('start', 'start-exec-out', 'delay-1', 'delay-1-exec-in')]
      );

      const result = packageGenerator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('std::this_thread::sleep_for(std::chrono::milliseconds(250));');
      expect(result.code).toContain('#include <chrono>');
      expect(TemplateNodeGenerator.getCollectedIncludes()).toContain('<chrono>');
    });

    it('should include custom headers from package templates', () => {
      const customNodeDef = {
        type: 'Custom' as BlueprintNodeType,
        label: 'File Writer',
        labelRu: 'Запись файла',
        category: 'io',
        inputs: [
          { id: 'exec-in', name: 'In', dataType: 'execution' },
        ],
        outputs: [
          { id: 'exec-out', name: 'Out', dataType: 'execution' },
        ],
        _codegen: {
          cpp: {
            template: 'writeFile();',
            includes: ['<fstream>', '<filesystem>'],
          },
        },
      };
      
      const getNode = (type: string) => {
        if (type === 'Custom') return customNodeDef;
        return undefined;
      };
      
      const packageGenerator = CppCodeGenerator.withPackages(
        getNode,
        ['Custom' as BlueprintNodeType]
      );
      
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      const fileWriterNode: BlueprintNode = {
        id: 'fw-1',
        type: 'Custom' as BlueprintNodeType,
        label: 'File Writer',
        position: { x: 200, y: 0 },
        inputs: [
          { id: 'fw-1-exec-in', name: 'In', dataType: 'execution', direction: 'input', index: 0 },
        ],
        outputs: [
          { id: 'fw-1-exec-out', name: 'Out', dataType: 'execution', direction: 'output', index: 0 },
        ],
      };
      
      const graph = createTestGraph(
        [startNode, fileWriterNode],
        [createEdge('start', 'start-exec-out', 'fw-1', 'fw-1-exec-in')]
      );
      
      const result = packageGenerator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('#include <fstream>');
      expect(result.code).toContain('#include <filesystem>');

      const fstreamOccurrences = (result.code.match(/#include <fstream>/g) ?? []).length;
      expect(fstreamOccurrences).toBe(1);

      const includeLines = result.code
        .split('\n')
        .filter((line) => line.startsWith('#include '));
      const sortedIncludeLines = [...includeLines].sort();
      expect(includeLines).toEqual(sortedIncludeLines);
    });
  });
  
  // ============================================
  // Тесты пользовательских функций
  // ============================================
  
  describe('generate - User Functions', () => {
    /**
     * Создать тестовую функцию с входами и выходом
     */
    function createTestFunction(overrides?: Partial<BlueprintFunction>): BlueprintFunction {
      return {
        id: 'func-test',
        name: 'testFunction',
        nameRu: 'Тестовая функция',
        description: 'Описание тестовой функции',
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
    
    /**
     * Создать edge для графа функции
     */
    function createFuncEdge(sourceNode: string, sourcePort: string, targetNode: string, targetPort: string) {
      return { 
        id: `${sourceNode}-${targetNode}`,
        sourceNode, 
        sourcePort, 
        targetNode, 
        targetPort,
        kind: 'execution' as const,
      };
    }
    
    /**
     * Создать порт с index
     */
    function port(id: string, name: string, dataType: PortDataType, direction: 'input' | 'output', index: number, value?: number) {
      return { id, name, dataType, direction, index, ...(value !== undefined && { value }) };
    }

    it('should generate function body from graph.functions with FunctionEntry and FunctionReturn without TODO markers', () => {
      const func = createTestFunction({
        id: 'func-format-message',
        name: 'formatMessage',
        nameRu: 'Форматировать сообщение',
        parameters: [
          { id: 'text', name: 'text', nameRu: 'текст', dataType: 'string', direction: 'input' },
          { id: 'result', name: 'result', nameRu: 'результат', dataType: 'string', direction: 'output' },
        ],
        graph: {
          nodes: [
            {
              id: 'entry-format',
              type: 'FunctionEntry',
              label: 'Вход',
              position: { x: 0, y: 0 },
              inputs: [],
              outputs: [
                port('entry-format-exec-out', 'exec', 'execution', 'output', 0),
                port('entry-format-text', 'text', 'string', 'output', 1),
              ],
              properties: { functionId: 'func-format-message' },
            },
            {
              id: 'return-format',
              type: 'FunctionReturn',
              label: 'Возврат',
              position: { x: 220, y: 0 },
              inputs: [
                port('return-format-exec-in', 'exec', 'execution', 'input', 0),
                port('return-format-result', 'result', 'string', 'input', 1),
              ],
              outputs: [],
              properties: { functionId: 'func-format-message' },
            },
          ],
          edges: [
            createFuncEdge('entry-format', 'entry-format-exec-out', 'return-format', 'return-format-exec-in'),
          ],
        },
      });

      const callNode: BlueprintNode = {
        id: 'call-format',
        type: 'CallUserFunction',
        label: 'Вызов: formatMessage',
        position: { x: 200, y: 0 },
        inputs: [
          port('call-format-exec-in', 'exec', 'execution', 'input', 0),
          { ...port('call-format-text', 'text', 'string', 'input', 1), value: 'Привет, MultiCode!' },
        ],
        outputs: [
          port('call-format-exec-out', 'exec', 'execution', 'output', 0),
          port('call-format-result', 'result', 'string', 'output', 1),
        ],
        properties: { functionId: 'func-format-message', functionName: 'formatMessage' },
      };

      const graph = createTestGraph(
        [createNode('Start', { x: 0, y: 0 }, 'start'), callNode],
        [createEdge('start', 'start-exec-out', 'call-format', 'call-format-exec-in')]
      );
      graph.functions = [func];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('std::string formatMessage(std::string text)');
      expect(result.code).toContain('auto result_');
      expect(result.code).toContain('formatMessage("Привет, MultiCode!")');
      expect(result.code).not.toContain('TODO');
    });

    it('should generate full path for multiple custom functions without TODO markers', () => {
      const normalizeFunction = createTestFunction({
        id: 'func-normalize',
        name: 'normalizeName',
        nameRu: 'Нормализовать имя',
        parameters: [
          { id: 'name', name: 'name', nameRu: 'имя', dataType: 'string', direction: 'input' },
          { id: 'result', name: 'result', nameRu: 'результат', dataType: 'string', direction: 'output' },
        ],
        graph: {
          nodes: [
            {
              id: 'entry-normalize',
              type: 'FunctionEntry',
              label: 'Вход',
              position: { x: 0, y: 0 },
              inputs: [],
              outputs: [
                port('entry-normalize-exec-out', 'exec', 'execution', 'output', 0),
                port('entry-normalize-name', 'name', 'string', 'output', 1),
              ],
              properties: { functionId: 'func-normalize' },
            },
            {
              id: 'return-normalize',
              type: 'FunctionReturn',
              label: 'Возврат',
              position: { x: 200, y: 0 },
              inputs: [
                port('return-normalize-exec-in', 'exec', 'execution', 'input', 0),
                port('return-normalize-result', 'result', 'string', 'input', 1),
              ],
              outputs: [],
              properties: { functionId: 'func-normalize' },
            },
          ],
          edges: [
            createFuncEdge('entry-normalize', 'entry-normalize-exec-out', 'return-normalize', 'return-normalize-exec-in'),
          ],
        },
      });

      const buildGreetingFunction = createTestFunction({
        id: 'func-build-greeting',
        name: 'buildGreeting',
        nameRu: 'Собрать приветствие',
        parameters: [
          { id: 'name', name: 'name', nameRu: 'имя', dataType: 'string', direction: 'input' },
          { id: 'result', name: 'result', nameRu: 'результат', dataType: 'string', direction: 'output' },
        ],
        graph: {
          nodes: [
            {
              id: 'entry-greeting',
              type: 'FunctionEntry',
              label: 'Вход',
              position: { x: 0, y: 0 },
              inputs: [],
              outputs: [
                port('entry-greeting-exec-out', 'exec', 'execution', 'output', 0),
                port('entry-greeting-name', 'name', 'string', 'output', 1),
              ],
              properties: { functionId: 'func-build-greeting' },
            },
            {
              id: 'return-greeting',
              type: 'FunctionReturn',
              label: 'Возврат',
              position: { x: 200, y: 0 },
              inputs: [
                port('return-greeting-exec-in', 'exec', 'execution', 'input', 0),
                port('return-greeting-result', 'result', 'string', 'input', 1),
              ],
              outputs: [],
              properties: { functionId: 'func-build-greeting' },
            },
          ],
          edges: [
            createFuncEdge('entry-greeting', 'entry-greeting-exec-out', 'return-greeting', 'return-greeting-exec-in'),
          ],
        },
      });

      const callNormalize: BlueprintNode = {
        id: 'call-normalize',
        type: 'CallUserFunction',
        label: 'Вызов: normalizeName',
        position: { x: 200, y: 0 },
        inputs: [
          port('call-normalize-exec-in', 'exec', 'execution', 'input', 0),
          { ...port('call-normalize-name', 'name', 'string', 'input', 1), value: 'София' },
        ],
        outputs: [
          port('call-normalize-exec-out', 'exec', 'execution', 'output', 0),
          port('call-normalize-result', 'result', 'string', 'output', 1),
        ],
        properties: { functionId: 'func-normalize', functionName: 'normalizeName' },
      };

      const callGreeting: BlueprintNode = {
        id: 'call-greeting',
        type: 'CallUserFunction',
        label: 'Вызов: buildGreeting',
        position: { x: 400, y: 0 },
        inputs: [
          port('call-greeting-exec-in', 'exec', 'execution', 'input', 0),
          port('call-greeting-name', 'name', 'string', 'input', 1),
        ],
        outputs: [
          port('call-greeting-exec-out', 'exec', 'execution', 'output', 0),
          port('call-greeting-result', 'result', 'string', 'output', 1),
        ],
        properties: { functionId: 'func-build-greeting', functionName: 'buildGreeting' },
      };

      const printNode = createNode('Print', { x: 620, y: 0 }, 'print-greeting');

      const graph = createTestGraph(
        [createNode('Start', { x: 0, y: 0 }, 'start'), callNormalize, callGreeting, printNode],
        [
          createEdge('start', 'start-exec-out', 'call-normalize', 'call-normalize-exec-in'),
          createEdge('call-normalize', 'call-normalize-exec-out', 'call-greeting', 'call-greeting-exec-in'),
          createEdge('call-normalize', 'call-normalize-result', 'call-greeting', 'call-greeting-name', 'string'),
          createEdge('call-greeting', 'call-greeting-exec-out', 'print-greeting', 'print-greeting-exec-in'),
          createEdge('call-greeting', 'call-greeting-result', 'print-greeting', 'print-greeting-string', 'string'),
        ]
      );
      graph.functions = [normalizeFunction, buildGreetingFunction];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('std::string normalizeName(std::string name)');
      expect(result.code).toContain('std::string buildGreeting(std::string name)');
      expect(result.code).toContain('normalizeName("София")');
      expect(result.code).toContain('buildGreeting(result_');
      expect(result.code).toContain('std::cout << result_');
      expect(result.code).not.toContain('TODO');
    });
    
    it('should generate void function without parameters', () => {
      const func = createTestFunction({
        name: 'doNothing',
        nameRu: 'Ничего не делать',
        graph: {
          nodes: [
            {
              id: 'entry-1',
              type: 'FunctionEntry',
              label: 'Вход',
              position: { x: 0, y: 0 },
              inputs: [],
              outputs: [
                port('entry-1-exec-out', 'exec', 'execution', 'output', 0),
              ],
              properties: { functionId: 'func-test' },
            },
            {
              id: 'return-1',
              type: 'FunctionReturn',
              label: 'Возврат',
              position: { x: 200, y: 0 },
              inputs: [
                port('return-1-exec-in', 'exec', 'execution', 'input', 0),
              ],
              outputs: [],
              properties: { functionId: 'func-test' },
            },
          ],
          edges: [
            createFuncEdge('entry-1', 'entry-1-exec-out', 'return-1', 'return-1-exec-in'),
          ],
        },
      });
      
      const graph = createTestGraph(
        [createNode('Start', { x: 0, y: 0 }, 'start')],
        []
      );
      graph.functions = [func];
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('void doNothing()');
      expect(result.code).toContain('return;');
    });
    
    it('should generate function with input parameters', () => {
      const func = createTestFunction({
        name: 'add',
        nameRu: 'Сложение',
        parameters: [
          { id: 'a', name: 'a', nameRu: 'а', dataType: 'int32', direction: 'input' },
          { id: 'b', name: 'b', nameRu: 'б', dataType: 'int32', direction: 'input' },
          { id: 'result', name: 'result', nameRu: 'результат', dataType: 'int32', direction: 'output' },
        ],
        graph: {
          nodes: [
            {
              id: 'entry-1',
              type: 'FunctionEntry',
              label: 'Вход',
              position: { x: 0, y: 0 },
              inputs: [],
              outputs: [
                port('entry-1-exec-out', 'exec', 'execution', 'output', 0),
                port('entry-1-a', 'a', 'int32', 'output', 1),
                port('entry-1-b', 'b', 'int32', 'output', 2),
              ],
              properties: { functionId: 'func-test' },
            },
            {
              id: 'return-1',
              type: 'FunctionReturn',
              label: 'Возврат',
              position: { x: 200, y: 0 },
              inputs: [
                port('return-1-exec-in', 'exec', 'execution', 'input', 0),
                port('return-1-result', 'result', 'int32', 'input', 1, 0),
              ],
              outputs: [],
              properties: { functionId: 'func-test' },
            },
          ],
          edges: [
            createFuncEdge('entry-1', 'entry-1-exec-out', 'return-1', 'return-1-exec-in'),
          ],
        },
      });
      
      const graph = createTestGraph(
        [createNode('Start', { x: 0, y: 0 }, 'start')],
        []
      );
      graph.functions = [func];
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('int add(int a, int b)');
      expect(result.code).toContain('return');
    });

    it('should pass FunctionEntry input parameters into SetVariable assignments inside function body', () => {
      const func = createTestFunction({
        id: 'func-newFunction1',
        name: 'newFunction1',
        nameRu: 'Новая функция 1',
        parameters: [
          { id: 'param-1', name: 'Summa_1', nameRu: 'Сумма_1', dataType: 'int32', direction: 'input' },
          { id: 'param-2', name: 'Summ_2', nameRu: 'Сумма_2', dataType: 'int32', direction: 'input' },
          { id: 'result', name: 'result', nameRu: 'результат', dataType: 'int32', direction: 'output' },
        ],
        graph: {
          nodes: [
            {
              id: 'entry-1',
              type: 'FunctionEntry',
              label: 'Вход',
              position: { x: 0, y: 0 },
              inputs: [],
              outputs: [
                port('entry-1-exec-out', 'exec', 'execution', 'output', 0),
                port('entry-1-param-1', 'Summa_1', 'int32', 'output', 1),
                port('entry-1-param-2', 'Summ_2', 'int32', 'output', 2),
              ],
              properties: { functionId: 'func-newFunction1' },
            },
            {
              id: 'set-32',
              type: 'SetVariable',
              label: 'Установить: 32',
              position: { x: 200, y: 0 },
              inputs: [
                port('set-32-exec-in', 'exec', 'execution', 'input', 0),
                port('set-32-value-in', 'Значение', 'int32', 'input', 1),
              ],
              outputs: [
                port('set-32-exec-out', 'exec', 'execution', 'output', 0),
                port('set-32-value-out', 'Значение', 'int32', 'output', 1),
              ],
              properties: { codeName: 'var_32', dataType: 'int32' },
            },
            {
              id: 'set-proverka',
              type: 'SetVariable',
              label: 'Установить: Проверка',
              position: { x: 420, y: 0 },
              inputs: [
                port('set-proverka-exec-in', 'exec', 'execution', 'input', 0),
                port('set-proverka-value-in', 'Значение', 'int32', 'input', 1),
              ],
              outputs: [
                port('set-proverka-exec-out', 'exec', 'execution', 'output', 0),
                port('set-proverka-value-out', 'Значение', 'int32', 'output', 1),
              ],
              properties: { codeName: 'proverka', dataType: 'int32' },
            },
            {
              id: 'return-1',
              type: 'FunctionReturn',
              label: 'Возврат',
              position: { x: 640, y: 0 },
              inputs: [
                port('return-1-exec-in', 'exec', 'execution', 'input', 0),
                port('return-1-result', 'result', 'int32', 'input', 1, 0),
              ],
              outputs: [],
              properties: { functionId: 'func-newFunction1' },
            },
          ],
          edges: [
            createFuncEdge('entry-1', 'entry-1-exec-out', 'set-32', 'set-32-exec-in'),
            createFuncEdge('set-32', 'set-32-exec-out', 'set-proverka', 'set-proverka-exec-in'),
            createFuncEdge('set-proverka', 'set-proverka-exec-out', 'return-1', 'return-1-exec-in'),
            {
              id: 'entry-1-set-32-value',
              sourceNode: 'entry-1',
              sourcePort: 'entry-1-param-1',
              targetNode: 'set-32',
              targetPort: 'set-32-value-in',
              kind: 'data',
              dataType: 'int32',
            },
            {
              id: 'entry-1-set-proverka-value',
              sourceNode: 'entry-1',
              sourcePort: 'entry-1-param-2',
              targetNode: 'set-proverka',
              targetPort: 'set-proverka-value-in',
              kind: 'data',
              dataType: 'int32',
            },
          ],
        },
      });

      const graph = createTestGraph(
        [createNode('Start', { x: 0, y: 0 }, 'start')],
        []
      );
      graph.functions = [func];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('int newFunction1(int Summa_1, int Summ_2)');
      expect(result.code).toContain('int var_32 = Summa_1;');
      expect(result.code).toContain('int proverka = Summ_2;');
    });

    it('should use function-local variables instead of EventGraph variables in function scope', () => {
      const func = createTestFunction({
        id: 'func-local-vars',
        name: 'withLocalVar',
        nameRu: 'С локальной переменной',
        parameters: [],
        variables: [
          {
            id: 'func-var-counter',
            name: 'counter',
            nameRu: 'Счётчик',
            codeName: 'local_counter',
            dataType: 'int32',
            defaultValue: 10,
            category: 'local',
          },
        ],
        graph: {
          nodes: [
            {
              id: 'entry-1',
              type: 'FunctionEntry',
              label: 'Вход',
              position: { x: 0, y: 0 },
              inputs: [],
              outputs: [
                port('entry-1-exec-out', 'exec', 'execution', 'output', 0),
              ],
              properties: { functionId: 'func-local-vars' },
            },
            {
              id: 'set-local',
              type: 'SetVariable',
              label: 'Установить: Счётчик',
              position: { x: 220, y: 0 },
              inputs: [
                port('set-local-exec-in', 'exec', 'execution', 'input', 0),
                port('set-local-value-in', 'Значение', 'int32', 'input', 1, 42),
              ],
              outputs: [
                port('set-local-exec-out', 'exec', 'execution', 'output', 0),
                port('set-local-value-out', 'Значение', 'int32', 'output', 1),
              ],
              properties: {
                variableId: 'func-var-counter',
                dataType: 'int32',
              },
            },
            {
              id: 'return-1',
              type: 'FunctionReturn',
              label: 'Возврат',
              position: { x: 440, y: 0 },
              inputs: [
                port('return-1-exec-in', 'exec', 'execution', 'input', 0),
              ],
              outputs: [],
              properties: { functionId: 'func-local-vars' },
            },
          ],
          edges: [
            createFuncEdge('entry-1', 'entry-1-exec-out', 'set-local', 'set-local-exec-in'),
            createFuncEdge('set-local', 'set-local-exec-out', 'return-1', 'return-1-exec-in'),
          ],
        },
      });

      const graph = createTestGraph(
        [createNode('Start', { x: 0, y: 0 }, 'start')],
        []
      );
      graph.variables = [
        {
          id: 'global-var-counter',
          name: 'globalCounter',
          nameRu: 'ГлобальныйСчётчик',
          codeName: 'global_counter',
          dataType: 'int32',
          defaultValue: 5,
          category: 'default',
        },
      ];
      graph.functions = [func];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('void withLocalVar()');
      expect(result.code).toContain('int local_counter = 10;');
      expect(result.code).toContain('local_counter = 42;');
      expect(result.code).toContain('int global_counter = 5;');
    });
    
    it('should generate function with Russian name (transliterated)', () => {
      const func = createTestFunction({
        name: 'вычислить',
        nameRu: 'Вычислить',
        parameters: [
          { id: 'значение', name: 'значение', nameRu: 'значение', dataType: 'int32', direction: 'input' },
        ],
        graph: {
          nodes: [
            {
              id: 'entry-1',
              type: 'FunctionEntry',
              label: 'Вход',
              position: { x: 0, y: 0 },
              inputs: [],
              outputs: [
                port('entry-1-exec-out', 'exec', 'execution', 'output', 0),
              ],
              properties: { functionId: 'func-test' },
            },
            {
              id: 'return-1',
              type: 'FunctionReturn',
              label: 'Возврат',
              position: { x: 200, y: 0 },
              inputs: [
                port('return-1-exec-in', 'exec', 'execution', 'input', 0),
              ],
              outputs: [],
              properties: { functionId: 'func-test' },
            },
          ],
          edges: [
            createFuncEdge('entry-1', 'entry-1-exec-out', 'return-1', 'return-1-exec-in'),
          ],
        },
      });
      
      const graph = createTestGraph(
        [createNode('Start', { x: 0, y: 0 }, 'start')],
        []
      );
      graph.functions = [func];
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      // Проверяем что имя транслитерировано
      expect(result.code).toContain('vychislit');
      expect(result.code).toContain('znachenie');
    });
    
    it('should include Russian comment with function name', () => {
      const func = createTestFunction({
        name: 'myFunction',
        nameRu: 'Моя функция',
        description: 'Это описание функции',
      });
      
      const graph = createTestGraph(
        [createNode('Start', { x: 0, y: 0 }, 'start')],
        []
      );
      graph.functions = [func];
      
      const result = generator.generate(graph, { includeRussianComments: true });
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('// Функция: Моя функция');
      expect(result.code).toContain('// Это описание функции');
    });
    
    it('should generate function call from main', () => {
      // Функция
      const func = createTestFunction({
        id: 'func-greet',
        name: 'greet',
        nameRu: 'Приветствие',
        parameters: [],
        graph: {
          nodes: [
            {
              id: 'entry-1',
              type: 'FunctionEntry',
              label: 'Вход',
              position: { x: 0, y: 0 },
              inputs: [],
              outputs: [
                port('entry-1-exec-out', 'exec', 'execution', 'output', 0),
              ],
              properties: { functionId: 'func-greet' },
            },
            {
              id: 'return-1',
              type: 'FunctionReturn',
              label: 'Возврат',
              position: { x: 200, y: 0 },
              inputs: [
                port('return-1-exec-in', 'exec', 'execution', 'input', 0),
              ],
              outputs: [],
              properties: { functionId: 'func-greet' },
            },
          ],
          edges: [
            createFuncEdge('entry-1', 'entry-1-exec-out', 'return-1', 'return-1-exec-in'),
          ],
        },
      });
      
      // Узел вызова функции
      const callNode: BlueprintNode = {
        id: 'call-1',
        type: 'CallUserFunction',
        label: 'Вызов: greet',
        position: { x: 200, y: 0 },
        inputs: [
          port('call-1-exec-in', 'exec', 'execution', 'input', 0),
        ],
        outputs: [
          port('call-1-exec-out', 'exec', 'execution', 'output', 0),
        ],
        properties: { functionId: 'func-greet', functionName: 'greet' },
      };
      
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      
      const graph = createTestGraph(
        [startNode, callNode],
        [createEdge('start', 'start-exec-out', 'call-1', 'call-1-exec-in')]
      );
      graph.functions = [func];
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      // Функция должна быть определена перед main
      expect(result.code).toContain('void greet()');
      // Вызов функции внутри main
      expect(result.code).toContain('greet();');
      
      // Проверим порядок: функция перед main
      const funcPos = result.code.indexOf('void greet()');
      const mainPos = result.code.indexOf('int main()');
      expect(funcPos).toBeLessThan(mainPos);
    });
    

    it('should generate named result type before function signature for multiple outputs', () => {
      const func = createTestFunction({
        id: 'func-minmax',
        name: 'getMinMax',
        nameRu: 'Получить минимум и максимум',
        parameters: [
          { id: 'min', name: 'min', nameRu: 'мин', dataType: 'int32', direction: 'output' },
          { id: 'max', name: 'max', nameRu: 'макс', dataType: 'int32', direction: 'output' },
        ],
        graph: {
          nodes: [
            {
              id: 'entry-1',
              type: 'FunctionEntry',
              label: 'Вход',
              position: { x: 0, y: 0 },
              inputs: [],
              outputs: [
                port('entry-1-exec-out', 'exec', 'execution', 'output', 0),
              ],
              properties: { functionId: 'func-minmax' },
            },
            {
              id: 'return-1',
              type: 'FunctionReturn',
              label: 'Возврат',
              position: { x: 200, y: 0 },
              inputs: [
                port('return-1-exec-in', 'exec', 'execution', 'input', 0),
                port('return-1-min', 'min', 'int32', 'input', 1, 1),
                port('return-1-max', 'max', 'int32', 'input', 2, 10),
              ],
              outputs: [],
              properties: { functionId: 'func-minmax' },
            },
          ],
          edges: [
            createFuncEdge('entry-1', 'entry-1-exec-out', 'return-1', 'return-1-exec-in'),
          ],
        },
      });

      const graph = createTestGraph(
        [createNode('Start', { x: 0, y: 0 }, 'start')],
        []
      );
      graph.functions = [func];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('using getMinMaxResult = std::tuple<int, int>;');
      expect(result.code).toContain('getMinMaxResult getMinMax()');
      expect(result.code).toContain('return getMinMaxResult{1, 10};');

      const aliasPos = result.code.indexOf('using getMinMaxResult = std::tuple<int, int>;');
      const signaturePos = result.code.indexOf('getMinMaxResult getMinMax()');
      expect(aliasPos).toBeLessThan(signaturePos);
    });

    it('should not include <tuple> when no tuple usage is generated', () => {
      const func = createTestFunction({
        id: 'func-single-output',
        name: 'singleOutput',
        nameRu: 'Функция с одним выходом',
        parameters: [
          { id: 'value', name: 'value', nameRu: 'значение', dataType: 'int32', direction: 'output' },
        ],
        graph: {
          nodes: [
            {
              id: 'entry-single',
              type: 'FunctionEntry',
              label: 'Вход',
              position: { x: 0, y: 0 },
              inputs: [],
              outputs: [
                port('entry-single-exec-out', 'exec', 'execution', 'output', 0),
              ],
              properties: { functionId: 'func-single-output' },
            },
            {
              id: 'return-single',
              type: 'FunctionReturn',
              label: 'Возврат',
              position: { x: 200, y: 0 },
              inputs: [
                port('return-single-exec-in', 'exec', 'execution', 'input', 0),
                port('return-single-value', 'value', 'int32', 'input', 1, 7),
              ],
              outputs: [],
              properties: { functionId: 'func-single-output' },
            },
          ],
          edges: [
            createFuncEdge('entry-single', 'entry-single-exec-out', 'return-single', 'return-single-exec-in'),
          ],
        },
      });

      const graph = createTestGraph([createNode('Start', { x: 0, y: 0 }, 'start')], []);
      graph.functions = [func];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).not.toContain('#include <tuple>');
      expect(result.code).toContain('int singleOutput()');
    });

    it('should include <tuple> when function has multiple outputs', () => {
      const func = createTestFunction({
        id: 'func-multi-output',
        name: 'multiOutput',
        nameRu: 'Функция с несколькими выходами',
        parameters: [
          { id: 'left', name: 'left', nameRu: 'левый', dataType: 'int32', direction: 'output' },
          { id: 'right', name: 'right', nameRu: 'правый', dataType: 'int32', direction: 'output' },
        ],
        graph: {
          nodes: [
            {
              id: 'entry-multi',
              type: 'FunctionEntry',
              label: 'Вход',
              position: { x: 0, y: 0 },
              inputs: [],
              outputs: [
                port('entry-multi-exec-out', 'exec', 'execution', 'output', 0),
              ],
              properties: { functionId: 'func-multi-output' },
            },
            {
              id: 'return-multi',
              type: 'FunctionReturn',
              label: 'Возврат',
              position: { x: 200, y: 0 },
              inputs: [
                port('return-multi-exec-in', 'exec', 'execution', 'input', 0),
                port('return-multi-left', 'left', 'int32', 'input', 1, 2),
                port('return-multi-right', 'right', 'int32', 'input', 2, 9),
              ],
              outputs: [],
              properties: { functionId: 'func-multi-output' },
            },
          ],
          edges: [
            createFuncEdge('entry-multi', 'entry-multi-exec-out', 'return-multi', 'return-multi-exec-in'),
          ],
        },
      });

      const graph = createTestGraph([createNode('Start', { x: 0, y: 0 }, 'start')], []);
      graph.functions = [func];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('#include <tuple>');
      expect(result.code).toContain('using multiOutputResult = std::tuple<int, int>;');
    });

    it('should generate function with return value used in main', () => {
      // Функция возвращающая число
      const func = createTestFunction({
        id: 'func-getvalue',
        name: 'getValue',
        nameRu: 'Получить значение',
        parameters: [
          { id: 'result', name: 'result', nameRu: 'результат', dataType: 'int32', direction: 'output' },
        ],
        graph: {
          nodes: [
            {
              id: 'entry-1',
              type: 'FunctionEntry',
              label: 'Вход',
              position: { x: 0, y: 0 },
              inputs: [],
              outputs: [
                port('entry-1-exec-out', 'exec', 'execution', 'output', 0),
              ],
              properties: { functionId: 'func-getvalue' },
            },
            {
              id: 'return-1',
              type: 'FunctionReturn',
              label: 'Возврат',
              position: { x: 200, y: 0 },
              inputs: [
                port('return-1-exec-in', 'exec', 'execution', 'input', 0),
                port('return-1-result', 'result', 'int32', 'input', 1, 42),
              ],
              outputs: [],
              properties: { functionId: 'func-getvalue' },
            },
          ],
          edges: [
            createFuncEdge('entry-1', 'entry-1-exec-out', 'return-1', 'return-1-exec-in'),
          ],
        },
      });
      
      // Узел вызова функции с выходом
      const callNode: BlueprintNode = {
        id: 'call-1',
        type: 'CallUserFunction',
        label: 'Вызов: getValue',
        position: { x: 200, y: 0 },
        inputs: [
          port('call-1-exec-in', 'exec', 'execution', 'input', 0),
        ],
        outputs: [
          port('call-1-exec-out', 'exec', 'execution', 'output', 0),
          port('call-1-result', 'result', 'int32', 'output', 1),
        ],
        properties: { functionId: 'func-getvalue', functionName: 'getValue' },
      };
      
      const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
      
      const graph = createTestGraph(
        [startNode, callNode],
        [createEdge('start', 'start-exec-out', 'call-1', 'call-1-exec-in')]
      );
      graph.functions = [func];
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('int getValue()');
      expect(result.code).toContain('auto result_');
      expect(result.code).toContain('= getValue()');
    });
    
    it('should generate multiple functions', () => {
      const func1 = createTestFunction({
        id: 'func-1',
        name: 'funcOne',
        nameRu: 'Первая функция',
      });
      
      const func2 = createTestFunction({
        id: 'func-2',
        name: 'funcTwo',
        nameRu: 'Вторая функция',
        parameters: [
          { id: 'x', name: 'x', nameRu: 'x', dataType: 'int32', direction: 'input' },
        ],
      });
      
      const graph = createTestGraph(
        [createNode('Start', { x: 0, y: 0 }, 'start')],
        []
      );
      graph.functions = [func1, func2];
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('void funcOne()');
      expect(result.code).toContain('void funcTwo(int x)');
    });
    
    it('should generate function with string parameters', () => {
      const func = createTestFunction({
        name: 'greet',
        nameRu: 'Приветствие',
        parameters: [
          { id: 'name', name: 'name', nameRu: 'имя', dataType: 'string', direction: 'input' },
          { id: 'greeting', name: 'greeting', nameRu: 'приветствие', dataType: 'string', direction: 'output' },
        ],
      });
      
      const graph = createTestGraph(
        [createNode('Start', { x: 0, y: 0 }, 'start')],
        []
      );
      graph.functions = [func];
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('std::string greet(std::string name)');
    });
    
    it('should handle empty functions array', () => {
      const graph = createTestGraph(
        [createNode('Start', { x: 0, y: 0 }, 'start')],
        []
      );
      graph.functions = [];
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('int main()');
    });
    
    it('should handle function without FunctionEntry node', () => {
      const func = createTestFunction({
        name: 'emptyFunc',
        nameRu: 'Пустая функция',
        graph: {
          nodes: [],  // Нет FunctionEntry
          edges: [],
        },
      });
      
      const graph = createTestGraph(
        [createNode('Start', { x: 0, y: 0 }, 'start')],
        []
      );
      graph.functions = [func];
      
      const result = generator.generate(graph);
      
      expect(result.success).toBe(true);
      expect(result.code).toContain('void emptyFunc()');
      expect(result.code).toContain('// Пустая функция');
    });


    it('should use unified tuple expression style for default returns with multiple outputs', () => {
      const func = createTestFunction({
        id: 'func-default-multi',
        name: 'defaultMulti',
        nameRu: 'Пустая функция с множественным выходом',
        parameters: [
          { id: 'out-int', name: 'resultInt', nameRu: 'целое', dataType: 'int32', direction: 'output' },
          { id: 'out-bool', name: 'resultBool', nameRu: 'булево', dataType: 'bool', direction: 'output' },
        ],
        graph: {
          nodes: [],
          edges: [],
        },
      });

      const graph = createTestGraph(
        [createNode('Start', { x: 0, y: 0 }, 'start')],
        []
      );
      graph.functions = [func];

      const result = generator.generate(graph);

      expect(result.success).toBe(true);
      expect(result.code).toContain('using defaultMultiResult = std::tuple<int, bool>;');
      expect(result.code).toContain('defaultMultiResult defaultMulti()');
      expect(result.code).toContain('return defaultMultiResult{0, false};');
    });

  });
});
