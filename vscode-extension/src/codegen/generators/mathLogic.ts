/**
 * Генераторы для Math, Comparison и Logic узлов
 * 
 * Все эти узлы — "pure" (чистые), не генерируют строки кода,
 * только возвращают выражения через getOutputExpression()
 */

import type { BlueprintNode, BlueprintNodeType } from '../../shared/blueprintTypes';
import type { CodeGenContext } from '../types';
import {
  BaseNodeGenerator,
  GeneratorHelpers,
  NodeGenerationResult,
} from './base';

/**
 * Конфигурация бинарного оператора
 */
interface BinaryOperatorConfig {
  operator: string;
  defaultA: string;
  defaultB: string;
  /** Нужны ли скобки вокруг операндов */
  wrapOperands?: boolean;
}

/**
 * Базовый класс для бинарных операторов (A op B)
 */
abstract class BinaryOperatorGenerator extends BaseNodeGenerator {
  protected abstract getConfig(): BinaryOperatorConfig;
  
  generate(): NodeGenerationResult {
    // Pure nodes не генерируют строки кода
    return this.noop();
  }
  
  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    const config = this.getConfig();
    const a = helpers.getInputExpression(node, 'a') ?? config.defaultA;
    const b = helpers.getInputExpression(node, 'b') ?? config.defaultB;
    
    return `(${a} ${config.operator} ${b})`;
  }
}

interface VariadicOperatorConfig {
  operator: string;
  emptyFallback: string;
  firstFallback: string;
  restFallback: string;
}

interface LiteralNodeProperties extends Record<string, unknown> {
  value?: unknown;
}

const asLiteralNodeProperties = (value: unknown): LiteralNodeProperties =>
  typeof value === 'object' && value !== null
    ? (value as LiteralNodeProperties)
    : {};

const escapeCppStringLiteral = (raw: string): string =>
  raw
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');

const isZeroLiteral = (expression: string): boolean => {
  const normalized = expression
    .trim()
    .replace(/^\(+/, '')
    .replace(/\)+$/, '')
    .replace(/[uUlLfF]+$/g, '');
  return /^[-+]?0+(?:\.0+)?$/.test(normalized);
};

const formatPortValueLiteral = (value: string | number | boolean): string => {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'string') {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return String(value);
};

const getDataOperandPorts = (node: BlueprintNode) =>
  node.inputs
    .filter((port) => port.dataType !== 'execution')
    .sort((left, right) => left.index - right.index);

const foldLeftOperands = (operands: string[], operator: string): string => {
  if (operands.length === 0) {
    return '';
  }
  if (operands.length === 1) {
    return operands[0];
  }

  let expression = `(${operands[0]} ${operator} ${operands[1]})`;
  for (let index = 2; index < operands.length; index += 1) {
    expression = `(${expression} ${operator} ${operands[index]})`;
  }
  return expression;
};

abstract class VariadicMathOperatorGenerator extends BaseNodeGenerator {
  protected abstract getConfig(): VariadicOperatorConfig;

  generate(): NodeGenerationResult {
    return this.noop();
  }

  protected resolveOperands(node: BlueprintNode, helpers: GeneratorHelpers): string[] {
    const config = this.getConfig();
    const operandPorts = getDataOperandPorts(node);

    return operandPorts.map((port, index) => {
      const connectedExpression = helpers.getInputExpression(node, port.id);
      if (connectedExpression !== null) {
        return connectedExpression;
      }

      if (port.value !== undefined) {
        return formatPortValueLiteral(port.value);
      }

      if (port.defaultValue !== undefined) {
        return formatPortValueLiteral(port.defaultValue);
      }

      return index === 0 ? config.firstFallback : config.restFallback;
    });
  }

  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    const config = this.getConfig();
    const operands = this.resolveOperands(node, helpers);
    if (operands.length === 0) {
      return config.emptyFallback;
    }
    return foldLeftOperands(operands, config.operator);
  }
}

export class ConstNumberNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['ConstNumber'];

  generate(): NodeGenerationResult {
    return this.noop();
  }

  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    _context: CodeGenContext
  ): string {
    const properties = asLiteralNodeProperties(node.properties);
    const rawValue = properties.value;
    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      return String(rawValue);
    }

    if (typeof rawValue === 'string' && rawValue.trim().length > 0) {
      const parsed = Number(rawValue.trim());
      if (Number.isFinite(parsed)) {
        return String(parsed);
      }
    }

    const outputValue = node.outputs[0]?.value;
    if (typeof outputValue === 'number' && Number.isFinite(outputValue)) {
      return String(outputValue);
    }

    const outputDefault = node.outputs[0]?.defaultValue;
    if (typeof outputDefault === 'number' && Number.isFinite(outputDefault)) {
      return String(outputDefault);
    }

    return '0';
  }
}

export class ConstStringNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['ConstString'];

  generate(): NodeGenerationResult {
    return this.noop();
  }

  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    _context: CodeGenContext
  ): string {
    const properties = asLiteralNodeProperties(node.properties);
    const rawValue = properties.value;
    if (typeof rawValue === 'string') {
      return `"${escapeCppStringLiteral(rawValue)}"`;
    }

    const outputValue = node.outputs[0]?.value;
    if (typeof outputValue === 'string') {
      return `"${escapeCppStringLiteral(outputValue)}"`;
    }

    const outputDefault = node.outputs[0]?.defaultValue;
    if (typeof outputDefault === 'string') {
      return `"${escapeCppStringLiteral(outputDefault)}"`;
    }

    return '""';
  }
}

export class ConstBoolNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['ConstBool'];

  generate(): NodeGenerationResult {
    return this.noop();
  }

  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    _context: CodeGenContext
  ): string {
    const properties = asLiteralNodeProperties(node.properties);
    const rawValue = properties.value;
    if (typeof rawValue === 'boolean') {
      return rawValue ? 'true' : 'false';
    }

    if (typeof rawValue === 'string') {
      const normalized = rawValue.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') {
        return 'true';
      }
      if (normalized === 'false' || normalized === '0') {
        return 'false';
      }
    }

    const outputValue = node.outputs[0]?.value;
    if (typeof outputValue === 'boolean') {
      return outputValue ? 'true' : 'false';
    }

    const outputDefault = node.outputs[0]?.defaultValue;
    if (typeof outputDefault === 'boolean') {
      return outputDefault ? 'true' : 'false';
    }

    return 'false';
  }
}

// ============================================
// Math операторы
// ============================================

export class AddNodeGenerator extends VariadicMathOperatorGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Add'];
  protected getConfig(): VariadicOperatorConfig {
    return { operator: '+', emptyFallback: '0', firstFallback: '0', restFallback: '0' };
  }

  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    const operands = this.resolveOperands(node, helpers);
    if (operands.length === 0) {
      return this.getConfig().emptyFallback;
    }
    if (operands.length === 1) {
      return operands[0];
    }
    return `(${operands.join(' + ')})`;
  }
}

export class SubtractNodeGenerator extends VariadicMathOperatorGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Subtract'];
  protected getConfig(): VariadicOperatorConfig {
    return { operator: '-', emptyFallback: '0', firstFallback: '0', restFallback: '0' };
  }
}

export class MultiplyNodeGenerator extends VariadicMathOperatorGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Multiply'];
  protected getConfig(): VariadicOperatorConfig {
    return { operator: '*', emptyFallback: '0', firstFallback: '0', restFallback: '0' };
  }
}

export class DivideNodeGenerator extends VariadicMathOperatorGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Divide'];
  protected getConfig(): VariadicOperatorConfig {
    return { operator: '/', emptyFallback: '0', firstFallback: '0', restFallback: '1' };
  }
  
  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    const config = this.getConfig();
    const operands = this.resolveOperands(node, helpers);
    if (operands.length === 0) {
      return config.emptyFallback;
    }

    for (let index = 1; index < operands.length; index += 1) {
      if (isZeroLiteral(operands[index])) {
        helpers.addWarning(node.id, 'DIVISION_BY_ZERO', 'Деление на ноль');
        break;
      }
    }

    return foldLeftOperands(operands, config.operator);
  }
}

export class ModuloNodeGenerator extends VariadicMathOperatorGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Modulo'];
  protected getConfig(): VariadicOperatorConfig {
    return { operator: '%', emptyFallback: '0', firstFallback: '0', restFallback: '1' };
  }
  
  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    const config = this.getConfig();
    const operands = this.resolveOperands(node, helpers);
    if (operands.length === 0) {
      return config.emptyFallback;
    }

    for (let index = 1; index < operands.length; index += 1) {
      if (isZeroLiteral(operands[index])) {
        helpers.addWarning(node.id, 'MODULO_BY_ZERO', 'Остаток от деления на ноль');
        break;
      }
    }

    return foldLeftOperands(operands, config.operator);
  }
}

// ============================================
// Comparison операторы
// ============================================

export class EqualNodeGenerator extends BinaryOperatorGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Equal'];
  protected getConfig(): BinaryOperatorConfig {
    return { operator: '==', defaultA: '0', defaultB: '0' };
  }
}

export class NotEqualNodeGenerator extends BinaryOperatorGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['NotEqual'];
  protected getConfig(): BinaryOperatorConfig {
    return { operator: '!=', defaultA: '0', defaultB: '0' };
  }
}

export class GreaterNodeGenerator extends BinaryOperatorGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Greater'];
  protected getConfig(): BinaryOperatorConfig {
    return { operator: '>', defaultA: '0', defaultB: '0' };
  }
}

export class LessNodeGenerator extends BinaryOperatorGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Less'];
  protected getConfig(): BinaryOperatorConfig {
    return { operator: '<', defaultA: '0', defaultB: '0' };
  }
}

export class GreaterEqualNodeGenerator extends BinaryOperatorGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['GreaterEqual'];
  protected getConfig(): BinaryOperatorConfig {
    return { operator: '>=', defaultA: '0', defaultB: '0' };
  }
}

export class LessEqualNodeGenerator extends BinaryOperatorGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['LessEqual'];
  protected getConfig(): BinaryOperatorConfig {
    return { operator: '<=', defaultA: '0', defaultB: '0' };
  }
}

// ============================================
// Logic операторы
// ============================================

export class AndNodeGenerator extends BinaryOperatorGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['And'];
  protected getConfig(): BinaryOperatorConfig {
    return { operator: '&&', defaultA: 'false', defaultB: 'false' };
  }
}

export class OrNodeGenerator extends BinaryOperatorGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Or'];
  protected getConfig(): BinaryOperatorConfig {
    return { operator: '||', defaultA: 'false', defaultB: 'false' };
  }
}

/**
 * Not — унарный оператор
 */
export class NotNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Not'];
  
  generate(): NodeGenerationResult {
    return this.noop();
  }
  
  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    const a = helpers.getInputExpression(node, 'a') ?? 'false';
    return `(!${a})`;
  }
}

/**
 * Фабричная функция для создания всех Math/Comparison/Logic генераторов
 */
export function createMathLogicGenerators(): BaseNodeGenerator[] {
  return [
    // Constants
    new ConstNumberNodeGenerator(),
    new ConstStringNodeGenerator(),
    new ConstBoolNodeGenerator(),
    // Math
    new AddNodeGenerator(),
    new SubtractNodeGenerator(),
    new MultiplyNodeGenerator(),
    new DivideNodeGenerator(),
    new ModuloNodeGenerator(),
    // Comparison
    new EqualNodeGenerator(),
    new NotEqualNodeGenerator(),
    new GreaterNodeGenerator(),
    new LessNodeGenerator(),
    new GreaterEqualNodeGenerator(),
    new LessEqualNodeGenerator(),
    // Logic
    new AndNodeGenerator(),
    new OrNodeGenerator(),
    new NotNodeGenerator(),
  ];
}
