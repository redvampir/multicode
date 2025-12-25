/**
 * Генераторы для Variable узлов
 * 
 * Variable, GetVariable, SetVariable
 */

import type { BlueprintNode, BlueprintNodeType } from '../../shared/blueprintTypes';
import type { CodeGenContext } from '../types';
import { toValidIdentifier, getCppType, getDefaultValue } from '../types';
import {
  BaseNodeGenerator,
  GeneratorHelpers,
  NodeGenerationResult,
} from './base';

/**
 * Variable — объявление переменной
 */
export class VariableNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Variable'];
  
  generate(
    node: BlueprintNode,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    const lines: string[] = [];
    
    const varName = toValidIdentifier(node.label);
    const valuePort = node.outputs.find(p => p.id.includes('value'));
    const dataType = valuePort?.dataType ?? 'float';
    const cppType = getCppType(dataType);
    const defaultValue = getDefaultValue(dataType);
    
    // Проверить, не объявлена ли уже
    if (!helpers.isVariableDeclared(node.id)) {
      lines.push(`${ind}${cppType} ${varName} = ${defaultValue};`);
      helpers.declareVariable(node.id, varName, node.label, cppType, node.id);
    }
    
    return this.code(lines);
  }
  
  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    const varInfo = helpers.getVariable(node.id) ?? helpers.getVariable(node.label);
    return varInfo?.codeName ?? toValidIdentifier(node.label);
  }
}

/**
 * GetVariable — получение значения переменной (pure node)
 */
export class GetVariableNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['GetVariable'];
  
  generate(): NodeGenerationResult {
    // Pure node — не генерирует строки
    return this.noop();
  }
  
  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    const varInfo = helpers.getVariable(node.id) ?? helpers.getVariable(node.label);
    return varInfo?.codeName ?? toValidIdentifier(node.label);
  }
}

/**
 * SetVariable — установка значения переменной
 */
export class SetVariableNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['SetVariable'];
  
  generate(
    node: BlueprintNode,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    const lines: string[] = [];
    
    const varName = toValidIdentifier(node.label);
    const valueExpr = helpers.getInputExpression(node, 'value') ?? '0';
    
    // Если переменная не объявлена, объявить с типом
    if (!helpers.isVariableDeclared(node.label) && !helpers.isVariableDeclared(node.id)) {
      const valuePort = node.inputs.find(p => p.id.includes('value'));
      const dataType = valuePort?.dataType ?? 'float';
      const cppType = getCppType(dataType);
      
      lines.push(`${ind}${cppType} ${varName} = ${valueExpr};`);
      helpers.declareVariable(node.label, varName, node.label, cppType, node.id);
    } else {
      lines.push(`${ind}${varName} = ${valueExpr};`);
    }
    
    return this.code(lines);
  }
  
  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    // SetVariable также имеет выход value для chaining
    const varInfo = helpers.getVariable(node.label) ?? helpers.getVariable(node.id);
    return varInfo?.codeName ?? toValidIdentifier(node.label);
  }
}

/**
 * Фабричная функция для создания всех Variable генераторов
 */
export function createVariableGenerators(): BaseNodeGenerator[] {
  return [
    new VariableNodeGenerator(),
    new GetVariableNodeGenerator(),
    new SetVariableNodeGenerator(),
  ];
}
