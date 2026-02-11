/**
 * CppCodeGenerator — Генератор C++ кода из Blueprint графа
 * 
 * Использует плагинную архитектуру: каждый тип узла обрабатывается
 * отдельным генератором из реестра NodeGeneratorRegistry.
 * 
 * Поддерживает:
 * - Control Flow: Start, End, Branch, ForLoop, WhileLoop, Sequence
 * - Variables: Variable, GetVariable, SetVariable
 * - Math: Add, Subtract, Multiply, Divide, Modulo
 * - Comparison: Equal, NotEqual, Greater, Less, GreaterEqual, LessEqual
 * - Logic: And, Or, Not
 * - I/O: Print, Input
 * 
 * Особенности:
 * - Русские названия узлов сохраняются в комментариях
 * - Транслитерация русских переменных
 * - Source map для связи кода с узлами
 * - Расширяемость через добавление новых генераторов
 */

import type { 
  BlueprintGraphState, 
  BlueprintNode, 
  BlueprintNodeType,
  BlueprintFunction,
} from '../shared/blueprintTypes';
import { NODE_TYPE_DEFINITIONS } from '../shared/blueprintTypes';
import type { GraphLanguage } from '../shared/blueprintTypes';
import {
  ICodeGenerator,
  CodeGenerationResult,
  CodeGenContext,
  CodeGenOptions,
  CodeGenError,
  CodeGenErrorCode,
  CodeGenWarningCode,
  DEFAULT_CODEGEN_OPTIONS,
  indent,
} from './types';
import {
  NodeGeneratorRegistry,
  GeneratorHelpers,
  INodeGenerator,
  createDefaultRegistry,
  createRegistryWithPackages,
  TemplateNodeGenerator,
  NodeDefinitionGetter,
  FunctionEntryNodeGenerator,
  generateFunctionResultTypeDeclaration,
  getFunctionResultTypeName,
  buildTupleExpression,
} from './generators';

export class CppCodeGenerator implements ICodeGenerator {
  private registry: NodeGeneratorRegistry;

  private static readonly TUPLE_EXPRESSION_PATTERN = /(std::tuple\s*<|std::make_tuple\s*\(|std::tie\s*\(|\b\w+Result\s*\{)/;
  
  constructor(registry?: NodeGeneratorRegistry) {
    this.registry = registry ?? createDefaultRegistry();
  }
  
  /**
   * Создать генератор с поддержкой пакетов
   * 
   * @param getNodeDefinition Функция для получения определения узла из реестра пакетов
   * @param packageNodeTypes Типы узлов из пакетов
   */
  static withPackages(
    getNodeDefinition: NodeDefinitionGetter,
    packageNodeTypes: BlueprintNodeType[]
  ): CppCodeGenerator {
    const registry = createRegistryWithPackages(getNodeDefinition, packageNodeTypes);
    return new CppCodeGenerator(registry);
  }
  
  getLanguage(): GraphLanguage {
    return 'cpp';
  }
  
  getSupportedNodeTypes(): BlueprintNodeType[] {
    return this.registry.getSupportedTypes();
  }
  
  /**
   * Добавить кастомный генератор
   */
  registerGenerator(generator: INodeGenerator): void {
    this.registry.register(generator);
  }
  
  canGenerate(graph: BlueprintGraphState): { canGenerate: boolean; errors: CodeGenError[] } {
    const errors: CodeGenError[] = [];
    
    // Проверить наличие Start узла
    const startNodes = graph.nodes.filter(n => n.type === 'Start');
    if (startNodes.length === 0) {
      errors.push({
        nodeId: '',
        code: CodeGenErrorCode.NO_START_NODE,
        message: 'Граф должен содержать узел "Начало"',
        messageEn: 'Graph must contain a Start node',
      });
    } else if (startNodes.length > 1) {
      errors.push({
        nodeId: startNodes[1].id,
        code: CodeGenErrorCode.MULTIPLE_START_NODES,
        message: 'Граф может содержать только один узел "Начало"',
        messageEn: 'Graph can only contain one Start node',
      });
    }
    
    // Проверить неизвестные типы узлов
    for (const node of graph.nodes) {
      if (!this.registry.has(node.type)) {
        errors.push({
          nodeId: node.id,
          code: CodeGenErrorCode.UNKNOWN_NODE_TYPE,
          message: `Неизвестный тип узла: ${node.type}`,
          messageEn: `Unknown node type: ${node.type}`,
        });
      }
    }
    
    return {
      canGenerate: errors.length === 0,
      errors,
    };
  }
  
  generate(graph: BlueprintGraphState, options?: Partial<CodeGenOptions>): CodeGenerationResult {
    const startTime = performance.now();
    const opts: CodeGenOptions = { ...DEFAULT_CODEGEN_OPTIONS, ...options };
    
    // Проверить возможность генерации
    const validation = this.canGenerate(graph);
    if (!validation.canGenerate) {
      return {
        success: false,
        code: '',
        errors: validation.errors,
        warnings: [],
        sourceMap: [],
        stats: {
          nodesProcessed: 0,
          linesOfCode: 0,
          generationTimeMs: performance.now() - startTime,
        },
      };
    }
    
    // Создать контекст
    const context: CodeGenContext = {
      graph,
      options: opts,
      indentLevel: 0,
      declaredVariables: new Map(),
      processedNodes: new Set(),
      errors: [],
      warnings: [],
      sourceMap: [],
      currentLine: 1,
      functions: graph.functions ?? [],
      supportedNodeTypes: this.getSupportedNodeTypes(),
    };
    
    // Создать helpers для генераторов
    const helpers = this.createHelpers(context);
    
    // Очистить собранные includes от предыдущих генераций
    TemplateNodeGenerator.clearCollectedIncludes();
    
    // Генерировать тело кода (нужно сделать до headers, чтобы собрать includes)
    const bodyLines: string[] = [];
    
    // Генерируем пользовательские функции перед main()
    if (graph.functions && graph.functions.length > 0) {
      for (const func of graph.functions) {
        const funcLines = this.generateUserFunction(func, context, helpers);
        bodyLines.push(...funcLines);
        bodyLines.push('');
      }
    }
    
    // main() обёртка — открытие
    if (opts.generateMainWrapper) {
      bodyLines.push('int main() {');
      context.indentLevel = 1;
    }
    
    // Найти Start узел и начать обход
    const startNode = graph.nodes.find(n => n.type === 'Start');
    if (startNode) {
      const nodeLines = this.generateFromNode(startNode, context, helpers);
      bodyLines.push(...nodeLines);
    }
    
    // Закрыть main()
    if (opts.generateMainWrapper) {
      const lastLine = bodyLines[bodyLines.length - 1];
      if (!lastLine?.includes('return')) {
        bodyLines.push(indent(1, opts.indentSize) + 'return 0;');
      }
      bodyLines.push('}');
    }
    
    // Теперь собираем всё вместе с правильными includes
    const lines: string[] = [];
    
    // Заголовок с includes
    if (opts.includeHeaders) {
      lines.push('// Сгенерировано MultiCode');
      lines.push(`// Граф: ${graph.name}`);
      lines.push(`// Дата: ${new Date().toLocaleString('ru-RU')}`);
      lines.push('');
      
      // Стандартные includes
      const standardIncludes = new Set(['<exception>', '<iostream>', '<random>', '<string>', '<thread>', '<vector>']);

      const requiresTupleInclude = this.hasFunctionWithMultipleOutputs(graph.functions ?? [])
        || this.hasGeneratedTupleExpression(bodyLines);
      if (requiresTupleInclude) {
        standardIncludes.add('<tuple>');
      }
      
      // Добавляем includes из шаблонных генераторов
      const templateIncludes = TemplateNodeGenerator.getCollectedIncludes();
      for (const inc of templateIncludes) {
        standardIncludes.add(inc);
      }
      
      // Сортируем и выводим
      const sortedIncludes = Array.from(standardIncludes).sort();
      for (const inc of sortedIncludes) {
        lines.push(`#include ${inc}`);
      }
      lines.push('');
    }
    
    context.currentLine = lines.length + 1;
    
    // Добавляем тело
    lines.push(...bodyLines);
    
    lines.push('');
    
    const code = lines.join('\n');
    
    // Найти неиспользованные узлы
    for (const node of graph.nodes) {
      if (!context.processedNodes.has(node.id) && node.type !== 'Comment') {
        context.warnings.push({
          nodeId: node.id,
          code: CodeGenWarningCode.UNUSED_NODE,
          message: `Узел "${node.label}" не достижим из Start`,
        });
      }
    }
    
    return {
      success: context.errors.length === 0,
      code,
      errors: context.errors,
      warnings: context.warnings,
      sourceMap: context.sourceMap,
      stats: {
        nodesProcessed: context.processedNodes.size,
        linesOfCode: lines.filter(l => l.trim() && !l.trim().startsWith('//')).length,
        generationTimeMs: performance.now() - startTime,
      },
    };
  }

  private hasFunctionWithMultipleOutputs(functions: BlueprintFunction[]): boolean {
    return functions.some(func => func.parameters.filter(param => param.direction === 'output').length > 1);
  }

  private hasGeneratedTupleExpression(bodyLines: string[]): boolean {
    return bodyLines.some(line => CppCodeGenerator.TUPLE_EXPRESSION_PATTERN.test(line));
  }
  
  /**
   * Генерировать код начиная с узла, следуя по execution flow
   */
  private generateFromNode(
    node: BlueprintNode,
    context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string[] {
    const lines: string[] = [];
    
    // Предотвратить бесконечные циклы
    if (context.processedNodes.has(node.id)) {
      return lines;
    }
    context.processedNodes.add(node.id);
    
    const startLine = context.currentLine;
    
    // Получить генератор для этого типа узла
    const generator = this.registry.get(node.type);
    if (!generator) {
      lines.push(`${indent(context.indentLevel, context.options.indentSize)}// Неподдерживаемый тип: ${node.type}`);
      return lines;
    }
    
    // Добавить русский комментарий
    if (context.options.includeRussianComments) {
      const def = NODE_TYPE_DEFINITIONS[node.type];
      const russianName = def?.labelRu ?? node.type;
      if (node.label !== def?.label && node.label !== def?.labelRu) {
        lines.push(`${indent(context.indentLevel, context.options.indentSize)}// ${russianName}: ${node.label}`);
      }
    }
    
    // Маркер начала
    if (context.options.includeSourceMarkers) {
      lines.push(`${indent(context.indentLevel, context.options.indentSize)}// multicode:begin node="${node.id}"`);
    }
    
    // Генерировать код через плагин
    const result = generator.generate(node, context, helpers);
    lines.push(...result.lines);
    context.currentLine += result.lines.length;
    
    // Маркер конца
    if (context.options.includeSourceMarkers && result.lines.length > 0) {
      lines.push(`${indent(context.indentLevel, context.options.indentSize)}// multicode:end`);
    }
    
    // Добавить в source map
    if (result.lines.length > 0) {
      context.sourceMap.push({
        nodeId: node.id,
        startLine,
        endLine: context.currentLine - 1,
      });
    }
    
    // Следовать по execution flow если нужно
    if (result.followExecutionFlow && !result.customExecutionHandling) {
      const nextNode = this.getNextExecutionNode(node, context);
      if (nextNode) {
        const nextLines = this.generateFromNode(nextNode, context, helpers);
        lines.push(...nextLines);
      }
    }
    
    return lines;
  }
  
  /**
   * Генерировать код пользовательской функции
   * 
   * @param func Определение функции
   * @param context Контекст генерации (будет модифицирован)
   * @param helpers Вспомогательные функции
   * @returns Строки C++ кода функции
   */
  private generateUserFunction(
    func: BlueprintFunction,
    context: CodeGenContext,
    _helpers: GeneratorHelpers
  ): string[] {
    const lines: string[] = [];
    const opts = context.options;
    
    // Комментарий с русским названием
    if (opts.includeRussianComments && func.nameRu) {
      lines.push(`// Функция: ${func.nameRu}`);
      if (func.description) {
        lines.push(`// ${func.description}`);
      }
    }
    
    // Объявление именованного типа результата для множественного output
    const resultTypeDeclaration = generateFunctionResultTypeDeclaration(func);
    if (resultTypeDeclaration) {
      lines.push(resultTypeDeclaration);
    }

    // Сигнатура функции
    const signature = FunctionEntryNodeGenerator.generateFunctionSignature(func);
    lines.push(`${signature} {`);
    
    // Сохраняем текущее состояние контекста
    const savedIndentLevel = context.indentLevel;
    const savedCurrentFunction = context.currentFunction;
    // Не сохраняем processedNodes и declaredVariables — они специфичны для функции
    
    // Устанавливаем контекст функции
    context.currentFunction = func;
    context.indentLevel = 1;
    
    // Находим FunctionEntry в графе функции
    const entryNode = func.graph.nodes.find(n => n.type === 'FunctionEntry');
    
    if (entryNode) {
      // Создаём временный контекст для графа функции
      const funcContext: CodeGenContext = {
        ...context,
        graph: {
          ...context.graph,
          nodes: func.graph.nodes,
          edges: func.graph.edges,
        },
        processedNodes: new Set<string>(),
        declaredVariables: new Map(),
        currentFunction: func,
        indentLevel: 1,
      };
      
      // Создаём helpers для контекста функции
      const funcHelpers = this.createHelpersForContext(funcContext);
      
      // Отмечаем FunctionEntry как обработанный
      funcContext.processedNodes.add(entryNode.id);
      
      // Находим следующий узел после FunctionEntry
      const nextNode = this.getNextExecutionNodeInGraph(entryNode, func.graph.nodes, func.graph.edges);
      
      if (nextNode) {
        const bodyLines = this.generateFromNodeInContext(nextNode, funcContext, funcHelpers);
        lines.push(...bodyLines);
      }
      
      // Объединяем ошибки и предупреждения
      context.errors.push(...funcContext.errors);
      context.warnings.push(...funcContext.warnings);
    } else {
      // Нет FunctionEntry — пустая функция
      const ind = indent(1, opts.indentSize);
      lines.push(`${ind}// Пустая функция`);
      
      // Добавляем return по умолчанию
      const outputParams = func.parameters.filter(p => p.direction === 'output');
      if (outputParams.length === 0) {
        lines.push(`${ind}return;`);
      } else if (outputParams.length === 1) {
        const defaultVal = this.getDefaultValueForType(outputParams[0].dataType);
        lines.push(`${ind}return ${defaultVal};`);
      } else {
        const defaults = outputParams.map(p => this.getDefaultValueForType(p.dataType));
        const resultTypeName = getFunctionResultTypeName(func);
        lines.push(`${ind}return ${resultTypeName}${buildTupleExpression(defaults)};`);
      }
    }
    
    lines.push('}');
    
    // Восстанавливаем контекст
    context.indentLevel = savedIndentLevel;
    context.currentFunction = savedCurrentFunction;
    // Не восстанавливаем processedNodes и declaredVariables,
    // чтобы не помечать узлы функций как неиспользованные
    
    return lines;
  }
  
  /**
   * Получить значение по умолчанию для типа данных
   */
  private getDefaultValueForType(dataType: string): string {
    const defaults: Record<string, string> = {
      'bool': 'false',
      'int32': '0',
      'int64': '0LL',
      'float': '0.0f',
      'double': '0.0',
      'string': '""',
      'vector': '{}',
      'array': '{}',
      'object': 'nullptr',
    };
    return defaults[dataType] ?? '0';
  }
  
  /**
   * Получить следующий execution узел в заданном графе
   */
  private getNextExecutionNodeInGraph(
    node: BlueprintNode,
    nodes: BlueprintNode[],
    edges: Array<{ sourceNode: string; sourcePort: string; targetNode: string; targetPort: string }>
  ): BlueprintNode | null {
    const edge = edges.find(e => 
      e.sourceNode === node.id && 
      (e.sourcePort.includes('exec-out') || e.sourcePort.includes('exec_out'))
    );
    
    if (!edge) return null;
    
    return nodes.find(n => n.id === edge.targetNode) ?? null;
  }
  
  /**
   * Генерация кода из узла в заданном контексте
   */
  private generateFromNodeInContext(
    node: BlueprintNode,
    context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string[] {
    const lines: string[] = [];
    
    if (context.processedNodes.has(node.id)) {
      return lines;
    }
    context.processedNodes.add(node.id);
    
    const startLine = context.currentLine;
    
    const generator = this.registry.get(node.type);
    if (!generator) {
      lines.push(`${indent(context.indentLevel, context.options.indentSize)}// Неподдерживаемый тип: ${node.type}`);
      return lines;
    }
    
    // Добавить русский комментарий
    if (context.options.includeRussianComments) {
      const def = NODE_TYPE_DEFINITIONS[node.type];
      const russianName = def?.labelRu ?? node.type;
      if (node.label !== def?.label && node.label !== def?.labelRu) {
        lines.push(`${indent(context.indentLevel, context.options.indentSize)}// ${russianName}: ${node.label}`);
      }
    }
    
    const result = generator.generate(node, context, helpers);
    lines.push(...result.lines);
    context.currentLine += result.lines.length;
    
    if (result.lines.length > 0) {
      context.sourceMap.push({
        nodeId: node.id,
        startLine,
        endLine: context.currentLine - 1,
      });
    }
    
    // Следовать по execution flow
    if (result.followExecutionFlow && !result.customExecutionHandling) {
      const funcGraph = context.currentFunction?.graph;
      if (funcGraph) {
        const nextNode = this.getNextExecutionNodeInGraph(node, funcGraph.nodes, funcGraph.edges);
        if (nextNode) {
          const nextLines = this.generateFromNodeInContext(nextNode, context, helpers);
          lines.push(...nextLines);
        }
      }
    }
    
    return lines;
  }
  
  /**
   * Создать helpers для указанного контекста
   */
  private createHelpersForContext(context: CodeGenContext): GeneratorHelpers {
    const helpers: GeneratorHelpers = {
      indent: (): string => {
        return indent(context.indentLevel, context.options.indentSize);
      },
      
      getInputExpression: (node: BlueprintNode, portSuffix: string): string | null => {
        return this.getInputExpressionInContext(node, portSuffix, context);
      },
      
      getOutputExpression: (node: BlueprintNode, portId: string): string => {
        return this.getOutputExpressionInContext(node, portId, context);
      },
      
      getExecutionTarget: (node: BlueprintNode, portSuffix: string): BlueprintNode | null => {
        const funcGraph = context.currentFunction?.graph;
        if (!funcGraph) return null;
        
        const edge = funcGraph.edges.find(e => 
          e.sourceNode === node.id && 
          (e.sourcePort.includes(portSuffix) || e.sourcePort.endsWith(portSuffix))
        );
        
        if (!edge) return null;
        return funcGraph.nodes.find(n => n.id === edge.targetNode) ?? null;
      },
      
      generateFromNode: (node: BlueprintNode): string[] => {
        return this.generateFromNodeInContext(node, context, helpers);
      },
      
      pushIndent: (): void => {
        context.indentLevel++;
      },
      
      popIndent: (): void => {
        context.indentLevel--;
      },
      
      addWarning: (nodeId: string, code: string, message: string): void => {
        context.warnings.push({ nodeId, code: code as CodeGenWarningCode, message });
      },
      
      addError: (nodeId: string, code: string, message: string, messageEn: string): void => {
        context.errors.push({ nodeId, code: code as CodeGenErrorCode, message, messageEn });
      },
      
      isVariableDeclared: (name: string): boolean => {
        return context.declaredVariables.has(name);
      },
      
      declareVariable: (id: string, codeName: string, originalName: string, cppType: string, nodeId: string): void => {
        context.declaredVariables.set(id, { codeName, originalName, cppType, nodeId });
      },
      
      getVariable: (idOrName: string): { codeName: string; cppType: string } | null => {
        const info = context.declaredVariables.get(idOrName);
        if (info) {
          return { codeName: info.codeName, cppType: info.cppType };
        }
        return null;
      },
    };
    
    return helpers;
  }
  
  /**
   * Получить выражение для входного порта в контексте функции
   */
  private getInputExpressionInContext(
    node: BlueprintNode,
    portSuffix: string,
    context: CodeGenContext
  ): string | null {
    const port = node.inputs.find(p => 
      p.id.includes(portSuffix) || p.id.endsWith(portSuffix)
    );
    
    if (!port) return null;
    
    const funcGraph = context.currentFunction?.graph;
    const edges = funcGraph?.edges ?? context.graph.edges;
    const nodes = funcGraph?.nodes ?? context.graph.nodes;
    
    // Найти входящую связь
    const edge = edges.find(e => 
      e.targetNode === node.id && 
      (e.targetPort.includes(portSuffix) || e.targetPort.endsWith(portSuffix))
    );
    
    if (edge) {
      const sourceNode = nodes.find(n => n.id === edge.sourceNode);
      if (sourceNode) {
        return this.getOutputExpressionInContext(sourceNode, edge.sourcePort, context);
      }
    }
    
    // Значение по умолчанию
    if (port.value !== undefined) {
      if (port.dataType === 'string') {
        return `"${port.value}"`;
      }
      return String(port.value);
    }
    
    if (port.defaultValue !== undefined) {
      if (port.dataType === 'string') {
        return `"${port.defaultValue}"`;
      }
      return String(port.defaultValue);
    }
    
    return null;
  }
  
  /**
   * Получить выражение для выходного порта в контексте функции
   */
  private getOutputExpressionInContext(
    node: BlueprintNode,
    portId: string,
    context: CodeGenContext
  ): string {
    const generator = this.registry.get(node.type);
    
    if (generator?.getOutputExpression) {
      const helpers = this.createHelpersForContext(context);
      return generator.getOutputExpression(node, portId, context, helpers);
    }
    
    return '0';
  }
  
  /**
   * Создать объект helpers для генераторов
   */
  private createHelpers(context: CodeGenContext): GeneratorHelpers {
    // Сохраняем ссылки на методы через bind
    const boundGetInputExpression = this.getInputExpression.bind(this);
    const boundGetOutputExpression = this.getOutputExpression.bind(this);
    const boundGetExecutionTarget = this.getExecutionTarget.bind(this);
    const boundGenerateFromNode = this.generateFromNode.bind(this);
    
    const helpers: GeneratorHelpers = {
      indent(): string {
        return indent(context.indentLevel, context.options.indentSize);
      },
      
      getInputExpression(node: BlueprintNode, portSuffix: string): string | null {
        return boundGetInputExpression(node, portSuffix, context);
      },
      
      getOutputExpression(node: BlueprintNode, portId: string): string {
        return boundGetOutputExpression(node, portId, context);
      },
      
      getExecutionTarget(node: BlueprintNode, portSuffix: string): BlueprintNode | null {
        return boundGetExecutionTarget(node, portSuffix, context);
      },
      
      generateFromNode(node: BlueprintNode): string[] {
        return boundGenerateFromNode(node, context, helpers);
      },
      
      pushIndent(): void {
        context.indentLevel++;
      },
      
      popIndent(): void {
        context.indentLevel--;
      },
      
      addWarning(nodeId: string, code: string, message: string): void {
        context.warnings.push({ nodeId, code: code as CodeGenWarningCode, message });
      },
      
      addError(nodeId: string, code: string, message: string, messageEn: string): void {
        context.errors.push({ nodeId, code: code as CodeGenErrorCode, message, messageEn });
      },
      
      isVariableDeclared(name: string): boolean {
        return context.declaredVariables.has(name);
      },
      
      declareVariable(id: string, codeName: string, originalName: string, cppType: string, nodeId: string): void {
        context.declaredVariables.set(id, { codeName, originalName, cppType, nodeId });
      },
      
      getVariable(idOrName: string): { codeName: string; cppType: string } | null {
        const info = context.declaredVariables.get(idOrName);
        if (info) {
          return { codeName: info.codeName, cppType: info.cppType };
        }
        return null;
      },
    };
    
    return helpers;
  }
  
  /**
   * Получить следующий узел по execution flow
   */
  private getNextExecutionNode(node: BlueprintNode, context: CodeGenContext): BlueprintNode | null {
    const execOutPort = node.outputs.find(p => 
      p.dataType === 'execution' && 
      (p.id.includes('exec-out') || p.id.includes('exec_out'))
    );
    
    if (!execOutPort) return null;
    
    return this.getExecutionTarget(node, 'exec-out', context);
  }
  
  /**
   * Получить целевой узел для execution порта
   */
  private getExecutionTarget(
    node: BlueprintNode,
    portSuffix: string,
    context: CodeGenContext
  ): BlueprintNode | null {
    const edge = context.graph.edges.find(e => 
      e.sourceNode === node.id && 
      (e.sourcePort.includes(portSuffix) || e.sourcePort.endsWith(portSuffix))
    );
    
    if (!edge) return null;
    
    return context.graph.nodes.find(n => n.id === edge.targetNode) ?? null;
  }
  
  /**
   * Получить выражение для входного порта
   */
  private getInputExpression(
    node: BlueprintNode,
    portSuffix: string,
    context: CodeGenContext
  ): string | null {
    const port = node.inputs.find(p => 
      p.id.includes(portSuffix) || p.id.endsWith(portSuffix)
    );
    
    if (!port) return null;
    
    // Найти входящую связь
    const edge = context.graph.edges.find(e => 
      e.targetNode === node.id && 
      (e.targetPort.includes(portSuffix) || e.targetPort.endsWith(portSuffix))
    );
    
    if (edge) {
      const sourceNode = context.graph.nodes.find(n => n.id === edge.sourceNode);
      if (sourceNode) {
        return this.getOutputExpression(sourceNode, edge.sourcePort, context);
      }
    }
    
    // Использовать значение по умолчанию
    if (port.value !== undefined) {
      if (port.dataType === 'string') {
        return `"${port.value}"`;
      }
      return String(port.value);
    }
    
    if (port.defaultValue !== undefined) {
      if (port.dataType === 'string') {
        return `"${port.defaultValue}"`;
      }
      return String(port.defaultValue);
    }
    
    return null;
  }
  
  /**
   * Получить выражение для выходного порта узла
   */
  private getOutputExpression(
    node: BlueprintNode,
    portId: string,
    context: CodeGenContext
  ): string {
    const generator = this.registry.get(node.type);
    
    if (generator?.getOutputExpression) {
      const helpers = this.createHelpers(context);
      return generator.getOutputExpression(node, portId, context, helpers);
    }
    
    // Fallback для неизвестных типов
    return '0';
  }
}
