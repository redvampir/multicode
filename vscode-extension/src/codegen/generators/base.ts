/**
 * Базовые интерфейсы и классы для плагинной архитектуры кодогенератора
 * 
 * Архитектура:
 * - INodeGenerator — интерфейс для генератора конкретного типа узла
 * - NodeGeneratorRegistry — реестр всех генераторов
 * - BaseNodeGenerator — базовый класс с общей логикой
 */

import type { BlueprintNode, BlueprintNodeType } from '../../shared/blueprintTypes';
import type { CodeGenContext } from '../types';

/**
 * Результат генерации узла
 */
export interface NodeGenerationResult {
  /** Строки кода */
  lines: string[];
  /** Нужно ли следовать по execution output после этого узла */
  followExecutionFlow: boolean;
  /** Кастомные execution выходы для обработки (для Branch, Loop и т.д.) */
  customExecutionHandling?: boolean;
}

/**
 * Интерфейс генератора для конкретного типа узла
 */
export interface INodeGenerator {
  /** Типы узлов, которые обрабатывает этот генератор */
  readonly nodeTypes: BlueprintNodeType[];
  
  /**
   * Генерировать код для узла
   * @param node Узел для генерации
   * @param context Контекст генерации
   * @param helpers Вспомогательные функции
   */
  generate(
    node: BlueprintNode,
    context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult;
  
  /**
   * Получить выражение для выходного порта (для pure nodes)
   * @param node Узел
   * @param portId ID порта
   * @param context Контекст
   * @param helpers Вспомогательные функции
   */
  getOutputExpression?(
    node: BlueprintNode,
    portId: string,
    context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string;
}

/**
 * Вспомогательные функции, доступные генераторам
 */
export interface GeneratorHelpers {
  /** Получить отступ для текущего уровня */
  indent(): string;
  
  /** Получить выражение для входного порта */
  getInputExpression(node: BlueprintNode, portSuffix: string): string | null;
  
  /** Получить выражение для выходного порта другого узла */
  getOutputExpression(node: BlueprintNode, portId: string): string;
  
  /** Получить целевой узел для execution порта */
  getExecutionTarget(node: BlueprintNode, portSuffix: string): BlueprintNode | null;
  
  /** Генерировать код начиная с узла (для вложенных блоков) */
  generateFromNode(node: BlueprintNode): string[];
  
  /** Увеличить уровень отступа */
  pushIndent(): void;
  
  /** Уменьшить уровень отступа */
  popIndent(): void;
  
  /** Добавить предупреждение */
  addWarning(nodeId: string, code: string, message: string): void;
  
  /** Добавить ошибку */
  addError(nodeId: string, code: string, message: string, messageEn: string): void;
  
  /** Проверить, объявлена ли переменная */
  isVariableDeclared(name: string): boolean;
  
  /** Объявить переменную */
  declareVariable(id: string, codeName: string, originalName: string, cppType: string, nodeId: string): void;
  
  /** Получить информацию о переменной */
  getVariable(idOrName: string): { codeName: string; cppType: string } | null;
}

/**
 * Реестр генераторов узлов
 */
export class NodeGeneratorRegistry {
  private generators = new Map<BlueprintNodeType, INodeGenerator>();
  
  /**
   * Зарегистрировать генератор
   */
  register(generator: INodeGenerator): void {
    for (const nodeType of generator.nodeTypes) {
      if (this.generators.has(nodeType)) {
        console.warn(`Генератор для типа ${nodeType} уже зарегистрирован, перезаписываем`);
      }
      this.generators.set(nodeType, generator);
    }
  }
  
  /**
   * Получить генератор для типа узла
   */
  get(nodeType: BlueprintNodeType): INodeGenerator | undefined {
    return this.generators.get(nodeType);
  }
  
  /**
   * Проверить, есть ли генератор для типа
   */
  has(nodeType: BlueprintNodeType): boolean {
    return this.generators.has(nodeType);
  }
  
  /**
   * Получить все зарегистрированные типы
   */
  getSupportedTypes(): BlueprintNodeType[] {
    return Array.from(this.generators.keys());
  }
  
  /**
   * Получить все генераторы
   */
  getAll(): INodeGenerator[] {
    return Array.from(new Set(this.generators.values()));
  }
}

/**
 * Базовый класс для генераторов с общей логикой
 */
export abstract class BaseNodeGenerator implements INodeGenerator {
  abstract readonly nodeTypes: BlueprintNodeType[];
  
  abstract generate(
    node: BlueprintNode,
    context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult;
  
  /**
   * Создать результат без кода (для pure nodes)
   */
  protected noop(): NodeGenerationResult {
    return { lines: [], followExecutionFlow: true };
  }
  
  /**
   * Создать результат с кодом
   */
  protected code(lines: string[], followExecutionFlow = true): NodeGenerationResult {
    return { lines, followExecutionFlow };
  }
  
  /**
   * Создать результат для узлов с кастомной обработкой execution (Branch, Loop)
   */
  protected customExecution(lines: string[]): NodeGenerationResult {
    return { lines, followExecutionFlow: false, customExecutionHandling: true };
  }
}

/**
 * Категории генераторов для организации
 */
export type GeneratorCategory = 
  | 'flow'       // Control flow: Start, End, Branch, Loop, etc.
  | 'variable'   // Variable operations
  | 'math'       // Math operations
  | 'comparison' // Comparison operations
  | 'logic'      // Logic operations
  | 'io'         // Input/Output
  | 'other';     // Comments, Reroute, etc.
