/**
 * Тесты для CppCodeGenerator
 * 
 * Проверяет генерацию C++ кода из Blueprint графов.
 */

import { describe, it, expect } from 'vitest';
import { CppCodeGenerator } from './CppCodeGenerator';
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
      expect(result.code).toContain('++)');
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
        code: 'UNKNOWN_NODE_TYPE',
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
        code: 'UNKNOWN_NODE_TYPE',
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
        code: 'UNKNOWN_NODE_TYPE',
      }));
      expect(result.code).not.toContain('TODO');
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
      expect(result.code).toContain('myCounter');
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
  });
});
