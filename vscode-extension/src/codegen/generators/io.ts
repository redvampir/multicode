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

function sanitizeInputNamePart(value: string, fallback: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized.length > 0 ? normalized : fallback;
}

function buildInputVariableName(node: BlueprintNode): string {
  const promptPort = node.inputs.find((port) => port.id.endsWith('-prompt') || port.id === 'prompt');
  const promptLiteral = typeof promptPort?.value === 'string'
    ? promptPort.value
    : typeof promptPort?.defaultValue === 'string'
      ? promptPort.defaultValue
      : '';
  const semanticPart = sanitizeInputNamePart(promptLiteral, 'value');
  const nodeTokenRaw = node.id.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const nodeToken = nodeTokenRaw.slice(Math.max(0, nodeTokenRaw.length - 4));
  return nodeToken.length > 0
    ? `input_${semanticPart}_${nodeToken}`
    : `input_${semanticPart}`;
}

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
    const varName = buildInputVariableName(node);
    
    // Вывести prompt если есть
    if (promptExpr && promptExpr !== '""') {
      lines.push(`${ind}std::cout << ${promptExpr};`);
    }
    
    lines.push(`${ind}std::string ${varName};`);
    // getline с std::ws корректно работает после предыдущих formatted-input операций.
    lines.push(`${ind}std::getline(std::cin >> std::ws, ${varName});`);
    
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
