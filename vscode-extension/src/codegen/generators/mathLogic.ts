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

// ============================================
// Math операторы
// ============================================

export class AddNodeGenerator extends BinaryOperatorGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Add'];
  protected getConfig(): BinaryOperatorConfig {
    return { operator: '+', defaultA: '0', defaultB: '0' };
  }
}

export class SubtractNodeGenerator extends BinaryOperatorGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Subtract'];
  protected getConfig(): BinaryOperatorConfig {
    return { operator: '-', defaultA: '0', defaultB: '0' };
  }
}

export class MultiplyNodeGenerator extends BinaryOperatorGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Multiply'];
  protected getConfig(): BinaryOperatorConfig {
    return { operator: '*', defaultA: '0', defaultB: '0' };
  }
}

export class DivideNodeGenerator extends BinaryOperatorGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Divide'];
  protected getConfig(): BinaryOperatorConfig {
    return { operator: '/', defaultA: '0', defaultB: '1' };
  }
  
  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    const a = helpers.getInputExpression(node, 'a') ?? '0';
    const b = helpers.getInputExpression(node, 'b') ?? '1';
    
    // Защита от деления на 0 для константных значений
    if (b === '0' || b === '0.0') {
      helpers.addWarning(node.id, 'DIVISION_BY_ZERO', 'Деление на ноль');
    }
    
    return `(${a} / ${b})`;
  }
}

export class ModuloNodeGenerator extends BinaryOperatorGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Modulo'];
  protected getConfig(): BinaryOperatorConfig {
    return { operator: '%', defaultA: '0', defaultB: '1' };
  }
  
  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    const a = helpers.getInputExpression(node, 'a') ?? '0';
    const b = helpers.getInputExpression(node, 'b') ?? '1';
    
    if (b === '0') {
      helpers.addWarning(node.id, 'MODULO_BY_ZERO', 'Остаток от деления на ноль');
    }
    
    return `(${a} % ${b})`;
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
