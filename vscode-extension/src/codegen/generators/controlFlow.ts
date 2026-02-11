/**
 * Генераторы для Control Flow узлов
 * 
 * Start, End, Return, Branch, ForLoop, WhileLoop, Sequence
 */

import type { BlueprintNode, BlueprintNodeType } from '../../shared/blueprintTypes';
import type { CodeGenContext } from '../types';
import { CodeGenWarningCode } from '../types';
import {
  BaseNodeGenerator,
  GeneratorHelpers,
  NodeGenerationResult,
} from './base';

/**
 * Start — точка входа в граф
 */
export class StartNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Start'];
  
  generate(): NodeGenerationResult {
    // Start не генерирует код, только начинает execution flow
    return this.noop();
  }
}

/**
 * End / Return — завершение выполнения
 */
export class EndNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['End', 'Return'];
  
  generate(
    node: BlueprintNode,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    
    // Для Return с возвращаемым значением
    if (node.type === 'Return') {
      const returnValue = helpers.getInputExpression(node, 'value');
      if (returnValue && returnValue !== '0') {
        return this.code([`${ind}return ${returnValue};`], false);
      }
    }
    
    return this.code([`${ind}return 0;`], false);
  }
}

/**
 * Branch — условный переход (if/else)
 */
export class BranchNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Branch'];
  
  generate(
    node: BlueprintNode,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    const lines: string[] = [];
    
    // Получить условие
    const conditionExpr = helpers.getInputExpression(node, 'condition') ?? 'true';
    
    lines.push(`${ind}if (${conditionExpr}) {`);
    
    // True ветка
    helpers.pushIndent();
    const trueNode = helpers.getExecutionTarget(node, 'true');
    if (trueNode) {
      const trueLines = helpers.generateFromNode(trueNode);
      lines.push(...trueLines);
    } else {
      lines.push(helpers.indent() + '// Пустая ветка');
      helpers.addWarning(node.id, CodeGenWarningCode.EMPTY_BRANCH, 'Ветка "True" пуста');
    }
    helpers.popIndent();
    
    // False ветка
    const falseNode = helpers.getExecutionTarget(node, 'false');
    if (falseNode) {
      lines.push(`${ind}} else {`);
      helpers.pushIndent();
      const falseLines = helpers.generateFromNode(falseNode);
      lines.push(...falseLines);
      helpers.popIndent();
    }
    
    lines.push(`${ind}}`);
    
    return this.customExecution(lines);
  }
}

/**
 * ForLoop — цикл с счётчиком
 */
export class ForLoopNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['ForLoop'];
  
  generate(
    node: BlueprintNode,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    const lines: string[] = [];
    
    const firstIndex = helpers.getInputExpression(node, 'first') ?? '0';
    const lastIndex = helpers.getInputExpression(node, 'last') ?? '10';
    
    // Генерируем читаемое имя переменной
    const indexVar = `i_${node.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6)}`;
    
    lines.push(`${ind}for (int ${indexVar} = ${firstIndex}; ${indexVar} <= ${lastIndex}; ${indexVar}++) {`);
    
    // Тело цикла
    helpers.pushIndent();
    const bodyNode = helpers.getExecutionTarget(node, 'loop-body');
    if (bodyNode) {
      // Регистрируем index как переменную для использования внутри цикла
      helpers.declareVariable(`${node.id}-index`, indexVar, 'Index', 'int', node.id);
      
      const bodyLines = helpers.generateFromNode(bodyNode);
      lines.push(...bodyLines);
    }
    helpers.popIndent();
    
    lines.push(`${ind}}`);
    
    // После цикла — completed
    const completedNode = helpers.getExecutionTarget(node, 'completed');
    if (completedNode) {
      const completedLines = helpers.generateFromNode(completedNode);
      lines.push(...completedLines);
    }
    
    return this.customExecution(lines);
  }
  
  getOutputExpression(
    node: BlueprintNode,
    portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    if (portId.includes('index')) {
      const varInfo = helpers.getVariable(`${node.id}-index`);
      return varInfo?.codeName ?? 'i';
    }
    return '0';
  }
}

/**
 * WhileLoop — цикл с условием
 */
export class WhileLoopNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['WhileLoop'];
  
  generate(
    node: BlueprintNode,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    const lines: string[] = [];
    
    const conditionExpr = helpers.getInputExpression(node, 'condition') ?? 'true';
    
    // Предупреждение о бесконечном цикле
    if (conditionExpr === 'true') {
      helpers.addWarning(
        node.id,
        CodeGenWarningCode.INFINITE_LOOP,
        'Условие цикла всегда true — возможен бесконечный цикл'
      );
    }
    
    lines.push(`${ind}while (${conditionExpr}) {`);
    
    helpers.pushIndent();
    const bodyNode = helpers.getExecutionTarget(node, 'loop-body');
    if (bodyNode) {
      const bodyLines = helpers.generateFromNode(bodyNode);
      lines.push(...bodyLines);
    }
    helpers.popIndent();
    
    lines.push(`${ind}}`);
    
    // После цикла
    const completedNode = helpers.getExecutionTarget(node, 'completed');
    if (completedNode) {
      const completedLines = helpers.generateFromNode(completedNode);
      lines.push(...completedLines);
    }
    
    return this.customExecution(lines);
  }
}

/**
 * Sequence — последовательное выполнение нескольких веток
 */
export class SequenceNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Sequence'];
  
  generate(
    node: BlueprintNode,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const lines: string[] = [];
    
    // Найти все then-N выходы и отсортировать
    const thenPorts = node.outputs.filter(p => p.id.includes('then-'));
    thenPorts.sort((a, b) => {
      const aNum = parseInt(a.id.split('-').pop() ?? '0');
      const bNum = parseInt(b.id.split('-').pop() ?? '0');
      return aNum - bNum;
    });
    
    for (const port of thenPorts) {
      // Извлекаем суффикс порта (then-0, then-1, etc.)
      const portSuffix = port.id.split('-').slice(-2).join('-');
      const targetNode = helpers.getExecutionTarget(node, portSuffix);
      if (targetNode) {
        const targetLines = helpers.generateFromNode(targetNode);
        lines.push(...targetLines);
      }
    }
    
    return this.customExecution(lines);
  }
}

/**
 * Parallel — запуск нескольких execution веток через std::thread
 */
export class ParallelNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Parallel'];

  generate(
    node: BlueprintNode,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    const lines: string[] = [];

    const threadGroupVar = `parallel_threads_${node.id.replace(/[^a-zA-Z0-9]/g, '')}`;
    const threadErrorVar = `parallel_error_${node.id.replace(/[^a-zA-Z0-9]/g, '')}`;

    const threadPorts = node.outputs
      .filter(port => port.id.includes('thread-'))
      .sort((a, b) => {
        const aNum = parseInt(a.id.split('-').pop() ?? '0', 10);
        const bNum = parseInt(b.id.split('-').pop() ?? '0', 10);
        return aNum - bNum;
      });

    const connectedThreads: BlueprintNode[] = [];
    for (const port of threadPorts) {
      const suffix = port.id.split('-').slice(-2).join('-');
      const target = helpers.getExecutionTarget(node, suffix);
      if (target) {
        connectedThreads.push(target);
      }
    }

    if (threadPorts.length > connectedThreads.length) {
      helpers.addWarning(
        node.id,
        CodeGenWarningCode.EMPTY_BRANCH,
        `Parallel: подключено ${connectedThreads.length} из ${threadPorts.length} Thread-веток`
      );
    }

    if (connectedThreads.length === 0) {
      helpers.addWarning(node.id, CodeGenWarningCode.EMPTY_BRANCH, 'Parallel: нет подключённых Thread-веток');
    } else {
      lines.push(`${ind}std::vector<std::thread> ${threadGroupVar};`);
      lines.push(`${ind}std::exception_ptr ${threadErrorVar};`);

      for (const threadNode of connectedThreads) {
        lines.push(`${ind}${threadGroupVar}.emplace_back([&]() {`);
        helpers.pushIndent();
        lines.push(`${helpers.indent()}try {`);
        helpers.pushIndent();
        const threadLines = helpers.generateFromNode(threadNode);
        lines.push(...threadLines);
        helpers.popIndent();
        lines.push(`${helpers.indent()}} catch (...) {`);
        helpers.pushIndent();
        lines.push(`${helpers.indent()}if (!${threadErrorVar}) {`);
        helpers.pushIndent();
        lines.push(`${helpers.indent()}${threadErrorVar} = std::current_exception();`);
        helpers.popIndent();
        lines.push(`${helpers.indent()}}`);
        helpers.popIndent();
        lines.push(`${helpers.indent()}}`);
        helpers.popIndent();
        lines.push(`${ind}});`);
      }

      lines.push(`${ind}for (auto& thread : ${threadGroupVar}) {`);
      helpers.pushIndent();
      lines.push(`${helpers.indent()}thread.join();`);
      helpers.popIndent();
      lines.push(`${ind}}`);
      lines.push(`${ind}if (${threadErrorVar}) {`);
      helpers.pushIndent();
      lines.push(`${helpers.indent()}std::rethrow_exception(${threadErrorVar});`);
      helpers.popIndent();
      lines.push(`${ind}}`);
    }

    const completedNode = helpers.getExecutionTarget(node, 'completed');
    if (completedNode) {
      lines.push(...helpers.generateFromNode(completedNode));
    }

    return this.customExecution(lines);
  }
}

/**
 * Gate — управляемый шлюз (упрощённая модель: пропуск только при открытом состоянии)
 */
export class GateNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Gate'];

  generate(
    node: BlueprintNode,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    const stateVar = `gate_open_${node.id.replace(/[^a-zA-Z0-9]/g, '')}`;
    const exitNode = helpers.getExecutionTarget(node, 'exit');
    const lines: string[] = [`${ind}static bool ${stateVar} = false;`, `${ind}if (${stateVar}) {`];

    helpers.pushIndent();
    if (exitNode) {
      lines.push(...helpers.generateFromNode(exitNode));
    } else {
      lines.push(`${helpers.indent()}// Gate открыт, но выход Exit не подключён`);
      helpers.addWarning(node.id, CodeGenWarningCode.EMPTY_BRANCH, 'Gate: выход Exit не подключён');
    }
    helpers.popIndent();

    lines.push(`${ind}} else {`);
    helpers.pushIndent();
    lines.push(`${helpers.indent()}// Gate закрыт — выполнение остановлено`);
    helpers.popIndent();
    lines.push(`${ind}}`);

    return this.customExecution(lines);
  }
}

/**
 * DoN — разрешает проход только первые N вызовов
 */
export class DoNNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['DoN'];

  generate(
    node: BlueprintNode,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    const suffix = node.id.replace(/[^a-zA-Z0-9]/g, '');
    const counterVar = `do_n_counter_${suffix}`;
    const limitExpr = helpers.getInputExpression(node, 'n') ?? '1';
    const exitNode = helpers.getExecutionTarget(node, 'exit');
    const lines: string[] = [
      `${ind}static int ${counterVar} = 0;`,
      `${ind}const int do_n_limit_${suffix} = (${limitExpr}) < 0 ? 0 : (${limitExpr});`,
      `${ind}if (${counterVar} < do_n_limit_${suffix}) {`,
    ];

    helpers.declareVariable(`${node.id}-counter`, counterVar, 'Counter', 'int', node.id);

    helpers.pushIndent();
    lines.push(`${helpers.indent()}++${counterVar};`);
    if (exitNode) {
      lines.push(...helpers.generateFromNode(exitNode));
    } else {
      lines.push(`${helpers.indent()}// DoN: лимит ещё не исчерпан, но выход Exit не подключён`);
      helpers.addWarning(node.id, CodeGenWarningCode.EMPTY_BRANCH, 'DoN: выход Exit не подключён');
    }
    helpers.popIndent();
    lines.push(`${ind}}`);

    return this.customExecution(lines);
  }

  getOutputExpression(
    node: BlueprintNode,
    portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    if (portId.includes('counter')) {
      return helpers.getVariable(`${node.id}-counter`)?.codeName ?? '0';
    }
    return '0';
  }
}

/**
 * DoOnce — пропускает выполнение только один раз
 */
export class DoOnceNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['DoOnce'];

  generate(
    node: BlueprintNode,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    const stateVar = `do_once_done_${node.id.replace(/[^a-zA-Z0-9]/g, '')}`;
    const completedNode = helpers.getExecutionTarget(node, 'completed');
    const lines: string[] = [
      `${ind}static bool ${stateVar} = false;`,
      `${ind}if (!${stateVar}) {`,
    ];

    helpers.pushIndent();
    lines.push(`${helpers.indent()}${stateVar} = true;`);
    if (completedNode) {
      lines.push(...helpers.generateFromNode(completedNode));
    } else {
      lines.push(`${helpers.indent()}// DoOnce выполнен, но выход Completed не подключён`);
      helpers.addWarning(node.id, CodeGenWarningCode.EMPTY_BRANCH, 'DoOnce: выход Completed не подключён');
    }
    helpers.popIndent();
    lines.push(`${ind}}`);

    return this.customExecution(lines);
  }
}

/**
 * FlipFlop — попеременно запускает A и B
 */
export class FlipFlopNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['FlipFlop'];

  generate(
    node: BlueprintNode,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    const stateVar = `flip_flop_is_a_${node.id.replace(/[^a-zA-Z0-9]/g, '')}`;
    const nodeA = helpers.getExecutionTarget(node, 'a');
    const nodeB = helpers.getExecutionTarget(node, 'b');
    const lines: string[] = [
      `${ind}static bool ${stateVar} = true;`,
      `${ind}if (${stateVar}) {`,
    ];

    helpers.declareVariable(`${node.id}-is-a`, stateVar, 'Is A', 'bool', node.id);

    helpers.pushIndent();
    if (nodeA) {
      lines.push(...helpers.generateFromNode(nodeA));
    } else {
      lines.push(`${helpers.indent()}// FlipFlop: ветка A не подключена`);
      helpers.addWarning(node.id, CodeGenWarningCode.EMPTY_BRANCH, 'FlipFlop: ветка A не подключена');
    }
    helpers.popIndent();

    lines.push(`${ind}} else {`);
    helpers.pushIndent();
    if (nodeB) {
      lines.push(...helpers.generateFromNode(nodeB));
    } else {
      lines.push(`${helpers.indent()}// FlipFlop: ветка B не подключена`);
      helpers.addWarning(node.id, CodeGenWarningCode.EMPTY_BRANCH, 'FlipFlop: ветка B не подключена');
    }
    helpers.popIndent();

    lines.push(`${ind}}`);
    lines.push(`${ind}${stateVar} = !${stateVar};`);

    return this.customExecution(lines);
  }

  getOutputExpression(
    node: BlueprintNode,
    portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    if (portId.includes('is-a')) {
      return helpers.getVariable(`${node.id}-is-a`)?.codeName ?? 'true';
    }
    return '0';
  }
}

/**
 * MultiGate — выбирает один из выходов по кругу или случайно
 */
export class MultiGateNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['MultiGate'];

  generate(
    node: BlueprintNode,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    const suffix = node.id.replace(/[^a-zA-Z0-9]/g, '');
    const indexVar = `multi_gate_index_${suffix}`;
    const rngVar = `multi_gate_rng_${suffix}`;
    const randomExpr = helpers.getInputExpression(node, 'is-random') ?? 'false';
    const loopExpr = helpers.getInputExpression(node, 'loop') ?? 'true';

    const outputPorts = node.outputs
      .filter(port => port.id.includes('out-'))
      .sort((a, b) => {
        const aNum = parseInt(a.id.split('-').pop() ?? '0', 10);
        const bNum = parseInt(b.id.split('-').pop() ?? '0', 10);
        return aNum - bNum;
      });

    const branches: BlueprintNode[] = [];
    for (const port of outputPorts) {
      const suffixValue = port.id.split('-').slice(-2).join('-');
      const target = helpers.getExecutionTarget(node, suffixValue);
      if (target) {
        branches.push(target);
      }
    }

    const deterministicSeed = Array.from(node.id).reduce((acc, ch) => ((acc * 131) + ch.charCodeAt(0)) >>> 0, 0);
    const lines: string[] = [
      `${ind}static int ${indexVar} = 0;`,
      `${ind}static std::mt19937 ${rngVar}(${deterministicSeed});`,
    ];

    if (outputPorts.length > branches.length) {
      helpers.addWarning(
        node.id,
        CodeGenWarningCode.EMPTY_BRANCH,
        `MultiGate: подключено ${branches.length} из ${outputPorts.length} выходов Out-*`
      );
    }

    if (branches.length === 0) {
      lines.push(`${ind}// MultiGate: нет подключённых выходов Out-*`);
      helpers.addWarning(node.id, CodeGenWarningCode.EMPTY_BRANCH, 'MultiGate: нет подключённых выходов Out-*');
      return this.customExecution(lines);
    }

    lines.push(`${ind}if (${randomExpr}) {`);
    helpers.pushIndent();
    lines.push(`${helpers.indent()}std::uniform_int_distribution<int> multi_gate_dist_${suffix}(0, ${branches.length - 1});`);
    lines.push(`${helpers.indent()}const int multi_gate_pick_${suffix} = multi_gate_dist_${suffix}(${rngVar});`);
    lines.push(`${helpers.indent()}switch (multi_gate_pick_${suffix}) {`);
    helpers.pushIndent();

    branches.forEach((branchNode, caseIndex) => {
      lines.push(`${helpers.indent()}case ${caseIndex}:`);
      helpers.pushIndent();
      lines.push(...helpers.generateFromNode(branchNode));
      lines.push(`${helpers.indent()}break;`);
      helpers.popIndent();
    });

    lines.push(`${helpers.indent()}default:`);
    helpers.pushIndent();
    lines.push(`${helpers.indent()}break;`);
    helpers.popIndent();
    helpers.popIndent();
    lines.push(`${helpers.indent()}}`);
    helpers.popIndent();
    lines.push(`${ind}} else {`);

    helpers.pushIndent();
    lines.push(`${helpers.indent()}if (${indexVar} >= ${branches.length}) {`);
    helpers.pushIndent();
    lines.push(`${helpers.indent()}${indexVar} = ${branches.length - 1};`);
    helpers.popIndent();
    lines.push(`${helpers.indent()}}`);
    lines.push(`${helpers.indent()}switch (${indexVar}) {`);
    helpers.pushIndent();

    branches.forEach((branchNode, caseIndex) => {
      lines.push(`${helpers.indent()}case ${caseIndex}:`);
      helpers.pushIndent();
      lines.push(...helpers.generateFromNode(branchNode));
      lines.push(`${helpers.indent()}break;`);
      helpers.popIndent();
    });

    lines.push(`${helpers.indent()}default:`);
    helpers.pushIndent();
    lines.push(`${helpers.indent()}break;`);
    helpers.popIndent();
    helpers.popIndent();
    lines.push(`${helpers.indent()}}`);
    lines.push(`${helpers.indent()}if (${loopExpr}) {`);
    helpers.pushIndent();
    lines.push(`${helpers.indent()}${indexVar} = (${indexVar} + 1) % ${branches.length};`);
    helpers.popIndent();
    lines.push(`${helpers.indent()}} else if (${indexVar} < ${branches.length - 1}) {`);
    helpers.pushIndent();
    lines.push(`${helpers.indent()}++${indexVar};`);
    helpers.popIndent();
    lines.push(`${helpers.indent()}}`);
    helpers.popIndent();
    lines.push(`${ind}}`);

    return this.customExecution(lines);
  }
}

/**
 * DoWhile — цикл с постусловием (выполняется минимум 1 раз)
 */
export class DoWhileNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['DoWhile'];
  
  generate(
    node: BlueprintNode,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    const lines: string[] = [];
    
    const conditionExpr = helpers.getInputExpression(node, 'condition') ?? 'true';
    
    lines.push(`${ind}do {`);
    
    helpers.pushIndent();
    const bodyNode = helpers.getExecutionTarget(node, 'loop-body');
    if (bodyNode) {
      const bodyLines = helpers.generateFromNode(bodyNode);
      lines.push(...bodyLines);
    }
    helpers.popIndent();
    
    lines.push(`${ind}} while (${conditionExpr});`);
    
    // После цикла
    const completedNode = helpers.getExecutionTarget(node, 'completed');
    if (completedNode) {
      const completedLines = helpers.generateFromNode(completedNode);
      lines.push(...completedLines);
    }
    
    return this.customExecution(lines);
  }
}

/**
 * ForEach — итерация по элементам массива
 */
export class ForEachNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['ForEach'];
  
  generate(
    node: BlueprintNode,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    const lines: string[] = [];
    
    const arrayExpr = helpers.getInputExpression(node, 'array') ?? 'items';
    
    // Генерируем уникальные имена переменных
    const suffix = node.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6);
    const indexVar = `i_${suffix}`;
    const elemVar = `elem_${suffix}`;
    
    // Range-based for с индексом через счётчик
    lines.push(`${ind}int ${indexVar} = 0;`);
    lines.push(`${ind}for (const auto& ${elemVar} : ${arrayExpr}) {`);
    
    helpers.pushIndent();
    
    // Регистрируем переменные
    helpers.declareVariable(`${node.id}-element`, elemVar, 'Element', 'auto', node.id);
    helpers.declareVariable(`${node.id}-index`, indexVar, 'Index', 'int', node.id);
    
    const bodyNode = helpers.getExecutionTarget(node, 'loop-body');
    if (bodyNode) {
      const bodyLines = helpers.generateFromNode(bodyNode);
      lines.push(...bodyLines);
    }
    
    lines.push(`${helpers.indent()}${indexVar}++;`);
    helpers.popIndent();
    
    lines.push(`${ind}}`);
    
    // После цикла
    const completedNode = helpers.getExecutionTarget(node, 'completed');
    if (completedNode) {
      const completedLines = helpers.generateFromNode(completedNode);
      lines.push(...completedLines);
    }
    
    return this.customExecution(lines);
  }
  
  getOutputExpression(
    node: BlueprintNode,
    portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    if (portId.includes('element')) {
      const varInfo = helpers.getVariable(`${node.id}-element`);
      return varInfo?.codeName ?? 'elem';
    }
    if (portId.includes('index')) {
      const varInfo = helpers.getVariable(`${node.id}-index`);
      return varInfo?.codeName ?? 'i';
    }
    return '0';
  }
}

/**
 * Switch — множественный выбор по значению
 */
export class SwitchNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Switch'];
  
  generate(
    node: BlueprintNode,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    const lines: string[] = [];
    
    const selectionExpr = helpers.getInputExpression(node, 'selection') ?? '0';
    
    lines.push(`${ind}switch (${selectionExpr}) {`);
    
    // Найти все case-N выходы
    const casePorts = node.outputs.filter(p => p.id.includes('case-'));
    casePorts.sort((a, b) => {
      const aNum = parseInt(a.id.split('-').pop() ?? '0');
      const bNum = parseInt(b.id.split('-').pop() ?? '0');
      return aNum - bNum;
    });
    
    for (const port of casePorts) {
      const caseNum = port.id.split('-').pop() ?? '0';
      const portSuffix = `case-${caseNum}`;
      const targetNode = helpers.getExecutionTarget(node, portSuffix);
      
      lines.push(`${ind}case ${caseNum}:`);
      helpers.pushIndent();
      
      if (targetNode) {
        const targetLines = helpers.generateFromNode(targetNode);
        lines.push(...targetLines);
      }
      lines.push(`${helpers.indent()}break;`);
      
      helpers.popIndent();
    }
    
    // Default ветка
    const defaultNode = helpers.getExecutionTarget(node, 'default');
    lines.push(`${ind}default:`);
    helpers.pushIndent();
    if (defaultNode) {
      const defaultLines = helpers.generateFromNode(defaultNode);
      lines.push(...defaultLines);
    }
    lines.push(`${helpers.indent()}break;`);
    helpers.popIndent();
    
    lines.push(`${ind}}`);
    
    return this.customExecution(lines);
  }
}

/**
 * Break — выход из цикла
 */
export class BreakNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Break'];
  
  generate(
    _node: BlueprintNode,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    return this.code([`${ind}break;`], false);
  }
}

/**
 * Continue — переход к следующей итерации
 */
export class ContinueNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Continue'];
  
  generate(
    _node: BlueprintNode,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    return this.code([`${ind}continue;`], false);
  }
}

/**
 * Фабричная функция для создания всех Control Flow генераторов
 */
export function createControlFlowGenerators(): BaseNodeGenerator[] {
  return [
    new StartNodeGenerator(),
    new EndNodeGenerator(),
    new BranchNodeGenerator(),
    new ForLoopNodeGenerator(),
    new WhileLoopNodeGenerator(),
    new ParallelNodeGenerator(),
    new GateNodeGenerator(),
    new DoNNodeGenerator(),
    new DoOnceNodeGenerator(),
    new FlipFlopNodeGenerator(),
    new MultiGateNodeGenerator(),
    new DoWhileNodeGenerator(),
    new ForEachNodeGenerator(),
    new SwitchNodeGenerator(),
    new BreakNodeGenerator(),
    new ContinueNodeGenerator(),
    new SequenceNodeGenerator(),
  ];
}
