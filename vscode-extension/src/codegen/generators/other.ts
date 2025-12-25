/**
 * Генераторы для прочих узлов
 * 
 * Comment, Reroute и другие вспомогательные узлы
 */

import type { BlueprintNode, BlueprintNodeType } from '../../shared/blueprintTypes';
import type { CodeGenContext } from '../types';
import {
  BaseNodeGenerator,
  GeneratorHelpers,
  NodeGenerationResult,
} from './base';

/**
 * Comment — комментарий в коде
 */
export class CommentNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Comment'];
  
  generate(
    node: BlueprintNode,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    const lines: string[] = [];
    
    const text = node.comment ?? node.label;
    if (text) {
      // Многострочные комментарии
      const commentLines = text.split('\n');
      for (const line of commentLines) {
        lines.push(`${ind}// ${line}`);
      }
    }
    
    return this.code(lines, false); // Comment не имеет execution flow
  }
}

/**
 * Reroute — просто передаёт данные, не генерирует код
 */
export class RerouteNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Reroute'];
  
  generate(): NodeGenerationResult {
    return this.noop();
  }
  
  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    // Просто проксируем входное выражение
    return helpers.getInputExpression(node, 'in') ?? '0';
  }
}

/**
 * Fallback генератор для неподдерживаемых типов узлов
 */
export class FallbackNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Custom', 'Function', 'FunctionCall', 'Event'];
  
  generate(
    node: BlueprintNode,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    const lines: string[] = [];
    
    // Генерируем TODO комментарий
    lines.push(`${ind}// TODO: ${node.type} - ${node.label}`);
    
    return this.code(lines);
  }
}

/**
 * Фабричная функция для создания прочих генераторов
 */
export function createOtherGenerators(): BaseNodeGenerator[] {
  return [
    new CommentNodeGenerator(),
    new RerouteNodeGenerator(),
    new FallbackNodeGenerator(),
  ];
}
