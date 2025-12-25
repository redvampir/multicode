/**
 * Генераторы для I/O узлов
 * 
 * Print, Input
 */

import type { BlueprintNode, BlueprintNodeType } from '../../shared/blueprintTypes';
import type { CodeGenContext } from '../types';
import {
  BaseNodeGenerator,
  GeneratorHelpers,
  NodeGenerationResult,
} from './base';

/**
 * Print — вывод строки в консоль
 */
export class PrintNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Print'];
  
  generate(
    node: BlueprintNode,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    const lines: string[] = [];
    
    const stringExpr = helpers.getInputExpression(node, 'string') ?? '""';
    
    lines.push(`${ind}std::cout << ${stringExpr} << std::endl;`);
    
    return this.code(lines);
  }
}

/**
 * Input — ввод данных с консоли
 */
export class InputNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Input'];
  
  generate(
    node: BlueprintNode,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    const lines: string[] = [];
    
    const promptExpr = helpers.getInputExpression(node, 'prompt');
    const varName = `input_${node.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6)}`;
    
    // Вывести prompt если есть
    if (promptExpr && promptExpr !== '""') {
      lines.push(`${ind}std::cout << ${promptExpr};`);
    }
    
    lines.push(`${ind}std::string ${varName};`);
    lines.push(`${ind}std::cin >> ${varName};`);
    
    // Сохранить как переменную для использования
    helpers.declareVariable(`${node.id}-value`, varName, 'Input Value', 'std::string', node.id);
    
    return this.code(lines);
  }
  
  getOutputExpression(
    node: BlueprintNode,
    portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    if (portId.includes('value')) {
      const varInfo = helpers.getVariable(`${node.id}-value`);
      return varInfo?.codeName ?? 'input';
    }
    return '""';
  }
}

/**
 * Фабричная функция для создания всех I/O генераторов
 */
export function createIOGenerators(): BaseNodeGenerator[] {
  return [
    new PrintNodeGenerator(),
    new InputNodeGenerator(),
  ];
}
