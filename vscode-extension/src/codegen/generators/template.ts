/**
 * TemplateNodeGenerator — Генератор кода на основе шаблонов из пакетов
 * 
 * Использует шаблоны `codegen.<target>.template` (с fallback на `codegen.cpp.template`) из определений узлов пакетов.
 * 
 * Плейсхолдеры:
 * - {{input.portId}} — значение входного порта
 * - {{output.portId}} — имя переменной выходного порта
 * - {{prop.propId}} — значение свойства узла
 * - {{node.label}} — английское название узла
 * - {{node.labelRu}} — русское название узла
 */

import type { BlueprintNode, BlueprintNodeType } from '../../shared/blueprintTypes';
import type { CodeGenContext } from '../types';
import {
  INodeGenerator,
  GeneratorHelpers,
  NodeGenerationResult,
} from './base';

type TemplateCodegenTarget = 'cpp' | 'ue';

/** Определение порта для шаблонного генератора */
interface PortDef {
  id: string;
  name: string;
  dataType: string;
}

/** Расширенное определение узла с данными кодогенерации (автономный тип) */
export interface NodeDefinitionWithCodegen {
  type: BlueprintNodeType;
  label: string;
  labelRu?: string;
  category: string;
  description?: string;
  descriptionRu?: string;
  inputs: PortDef[];
  outputs: PortDef[];
  headerColor?: string;
  _codegen?: {
    cpp?: {
      template?: string;
      includes?: string[];
      before?: string;
      after?: string;
    };
    ue?: {
      template?: string;
      includes?: string[];
      before?: string;
      after?: string;
    };
  };
  _properties?: Array<{
    id: string;
    name: string;
    nameRu?: string;
    type: string;
    default?: unknown;
  }>;
}

/** Функция для получения определения узла с кодогенерацией */
export type NodeDefinitionGetter = (type: string) => NodeDefinitionWithCodegen | undefined;

/**
 * Генератор кода на основе шаблонов из пакетов
 */
export class TemplateNodeGenerator implements INodeGenerator {
  /** Типы узлов, которые обрабатывает этот генератор */
  readonly nodeTypes: BlueprintNodeType[];
  
  /** Функция для получения определения узла */
  private getNodeDefinition: NodeDefinitionGetter;
  
  /** Кеш includes для сбора в конце */
  private static collectedIncludes = new Set<string>();

  /** Язык target для шаблонного кодогенератора */
  private readonly targetLanguage: TemplateCodegenTarget;
  
  constructor(
    nodeTypes: BlueprintNodeType[],
    getNodeDefinition: NodeDefinitionGetter,
    targetLanguage: TemplateCodegenTarget = 'cpp'
  ) {
    this.nodeTypes = nodeTypes;
    this.getNodeDefinition = getNodeDefinition;
    this.targetLanguage = targetLanguage;
  }
  
  /**
   * Создать генератор для конкретного типа узла
   */
  static createForType(
    nodeType: BlueprintNodeType,
    getNodeDefinition: NodeDefinitionGetter,
    targetLanguage: TemplateCodegenTarget = 'cpp'
  ): TemplateNodeGenerator {
    return new TemplateNodeGenerator([nodeType], getNodeDefinition, targetLanguage);
  }
  
  /**
   * Получить собранные includes
   */
  static getCollectedIncludes(): string[] {
    return Array.from(TemplateNodeGenerator.collectedIncludes);
  }
  
  /**
   * Очистить собранные includes
   */
  static clearCollectedIncludes(): void {
    TemplateNodeGenerator.collectedIncludes.clear();
  }
  
  generate(
    node: BlueprintNode,
    context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const def = this.getNodeDefinition(node.type);
    const codegen = def?._codegen?.[this.targetLanguage] ?? def?._codegen?.cpp;
    
    // Если нет шаблона — возвращаем пустой результат
    if (!codegen?.template) {
      return { lines: [], followExecutionFlow: true };
    }
    
    const lines: string[] = [];
    const indentStr = helpers.indent();
    
    // Собираем includes
    if (codegen.includes) {
      for (const inc of codegen.includes) {
        TemplateNodeGenerator.collectedIncludes.add(inc);
      }
    }
    
    // Добавляем before-код
    if (codegen.before) {
      const beforeLines = this.processTemplate(codegen.before, node, def, context, helpers);
      lines.push(...beforeLines.map(l => indentStr + l));
    }
    
    // Обрабатываем основной шаблон
    const templateLines = this.processTemplate(codegen.template, node, def, context, helpers);
    lines.push(...templateLines.map(l => indentStr + l));
    
    // Добавляем after-код
    if (codegen.after) {
      const afterLines = this.processTemplate(codegen.after, node, def, context, helpers);
      lines.push(...afterLines.map(l => indentStr + l));
    }
    
    // Определяем, нужно ли следовать по execution flow
    // Для узлов с execution выходами — да
    const hasExecOut = node.outputs.some(p => p.dataType === 'execution');
    
    return {
      lines,
      followExecutionFlow: hasExecOut,
    };
  }
  
  /**
   * Получить выражение для выходного порта (для pure nodes)
   */
  getOutputExpression(
    node: BlueprintNode,
    portId: string,
    context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    const def = this.getNodeDefinition(node.type);
    const codegen = def?._codegen?.[this.targetLanguage] ?? def?._codegen?.cpp;
    
    // Для pure nodes (математика, логика) шаблон — это само выражение
    if (codegen?.template) {
      const processed = this.processTemplate(codegen.template, node, def, context, helpers);
      return processed.join('').trim();
    }
    
    return '0';
  }
  
  /**
   * Обработать шаблон с подстановкой плейсхолдеров
   */
  private processTemplate(
    template: string,
    node: BlueprintNode,
    def: NodeDefinitionWithCodegen | undefined,
    context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string[] {
    let result = template;
    
    // {{input.portId}} — значение входного порта
    result = result.replace(/\{\{input\.(\w+)\}\}/g, (match, portId) => {
      const value = helpers.getInputExpression(node, portId);
      return value ?? '/* missing input */';
    });
    
    // {{output.portId}} — имя переменной выходного порта
    result = result.replace(/\{\{output\.(\w+)\}\}/g, (match, portId) => {
      // Генерируем уникальное имя переменной
      return this.generateVarName(node.id, portId);
    });
    
    // {{prop.propId}} — значение свойства узла
    result = result.replace(/\{\{prop\.(\w+)\}\}/g, (match, propId) => {
      const propValue = node.properties?.[propId];
      if (propValue !== undefined) {
        return String(propValue);
      }
      // Ищем default значение в определении
      const propDef = def?._properties?.find(p => p.id === propId);
      return propDef?.default !== undefined ? String(propDef.default) : '/* missing prop */';
    });
    
    // {{node.label}} — английское название
    result = result.replace(/\{\{node\.label\}\}/g, def?.label ?? node.label);
    
    // {{node.labelRu}} — русское название
    result = result.replace(/\{\{node\.labelRu\}\}/g, def?.labelRu ?? node.label);
    
    // Разбиваем по строкам
    return result.split('\n');
  }
  
  /**
   * Генерация имени переменной для выходного порта
   */
  private generateVarName(nodeId: string, portId: string): string {
    // Создаём читаемое имя из nodeId и portId
    const cleanNodeId = nodeId.replace(/[^a-zA-Z0-9]/g, '_').slice(-8);
    const cleanPortId = portId.replace(/[^a-zA-Z0-9]/g, '_');
    return `${cleanPortId}_${cleanNodeId}`;
  }
}

/**
 * Создать генераторы для всех узлов из пакетов
 */
export function createPackageGenerators(
  getNodeDefinition: NodeDefinitionGetter,
  nodeTypes: BlueprintNodeType[],
  targetLanguage: TemplateCodegenTarget = 'cpp'
): INodeGenerator[] {
  const generators: INodeGenerator[] = [];
  
  for (const nodeType of nodeTypes) {
    const def = getNodeDefinition(nodeType) as NodeDefinitionWithCodegen | undefined;
    const targetCodegen = def?._codegen?.[targetLanguage] ?? def?._codegen?.cpp;
    
    // Если у узла есть шаблон кодогенерации — создаём генератор
    if (targetCodegen?.template) {
      generators.push(
        TemplateNodeGenerator.createForType(nodeType, getNodeDefinition, targetLanguage)
      );
    }
  }
  
  return generators;
}
