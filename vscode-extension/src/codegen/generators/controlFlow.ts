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
    new DoWhileNodeGenerator(),
    new ForEachNodeGenerator(),
    new SwitchNodeGenerator(),
    new BreakNodeGenerator(),
    new ContinueNodeGenerator(),
    new SequenceNodeGenerator(),
  ];
}
