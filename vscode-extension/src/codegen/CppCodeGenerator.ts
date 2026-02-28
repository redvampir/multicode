/**
 * CppCodeGenerator — Генератор C++ кода из Blueprint графа
 * 
 * Использует плагинную архитектуру: каждый тип узла обрабатывается
 * отдельным генератором из реестра NodeGeneratorRegistry.
 * 
 * Поддерживает:
 * - Control Flow: Start, End, Branch, ForLoop, WhileLoop, Sequence
 * - Variables: Variable, GetVariable, SetVariable
 * - Math: ConstNumber, ConstString, ConstBool, Add, Subtract, Multiply, Divide, Modulo
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
  BlueprintVariable,
  VectorElementType,
} from '../shared/blueprintTypes';
import { NODE_TYPE_DEFINITIONS, normalizePointerMeta } from '../shared/blueprintTypes';
import type { GraphLanguage } from '../shared/blueprintTypes';
import type { PortDataType } from '../shared/portTypes';
import type { TypeConversionHelperId } from '../shared/typeConversions';
import { parseArrayInput, supportsArrayDataType } from '../shared/vectorValue';
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
  toValidIdentifier,
  getCppType,
  getCppVariableType,
  getDefaultValue,
  normalizeArrayRank,
} from './types';
import {
  resolvePointerCppType,
  resolvePointerInitializer,
} from './pointerCodegen';
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
import {
  buildClassModelFromGraph,
  type ClassModel,
  type ClassModelField,
  type ClassModelMethod,
} from './model/classModel';

const VECTOR_ELEMENT_TYPES: VectorElementType[] = [
  'int32',
  'int64',
  'float',
  'double',
  'bool',
  'string',
];

const isVectorElementType = (value: unknown): value is VectorElementType =>
  typeof value === 'string' && VECTOR_ELEMENT_TYPES.includes(value as VectorElementType);

const PORT_DATA_TYPES = new Set([
  'execution',
  'bool',
  'int32',
  'int64',
  'float',
  'double',
  'string',
  'vector',
  'pointer',
  'class',
  'array',
  'any',
]);

const isPortDataType = (value: unknown): value is PortDataType =>
  typeof value === 'string' && PORT_DATA_TYPES.has(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export class CppCodeGenerator implements ICodeGenerator {
  private registry: NodeGeneratorRegistry;

  private resolveFunctionScopedVariables(
    func: BlueprintFunction
  ): BlueprintVariable[] {
    if (!Array.isArray(func.variables)) {
      return [];
    }

    return func.variables;
  }

  private decodeStringEscapes(raw: string): string {
    let result = '';

    for (let index = 0; index < raw.length; index += 1) {
      const current = raw[index];
      if (current !== '\\') {
        result += current;
        continue;
      }

      if (index + 1 >= raw.length) {
        result += '\\';
        break;
      }

      const escapeCode = raw[index + 1];
      index += 1;

      switch (escapeCode) {
        case 'n':
          result += '\n';
          break;
        case 'r':
          result += '\r';
          break;
        case 't':
          result += '\t';
          break;
        case '0':
          result += '\0';
          break;
        case 'b':
          result += '\b';
          break;
        case 'f':
          result += '\f';
          break;
        case 'v':
          result += '\v';
          break;
        case 'a':
          result += '\x07';
          break;
        case '"':
          result += '"';
          break;
        case '\'':
          result += '\'';
          break;
        case '\\':
          result += '\\';
          break;
        case 'x': {
          const hexMatch = raw.slice(index + 1).match(/^[0-9a-fA-F]{1,2}/);
          if (!hexMatch) {
            result += '\\x';
            break;
          }
          const codePoint = Number.parseInt(hexMatch[0], 16);
          result += String.fromCodePoint(codePoint);
          index += hexMatch[0].length;
          break;
        }
        case 'u': {
          const hex = raw.slice(index + 1, index + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
            result += '\\u';
            break;
          }
          const codePoint = Number.parseInt(hex, 16);
          result += String.fromCodePoint(codePoint);
          index += 4;
          break;
        }
        case 'U': {
          const hex = raw.slice(index + 1, index + 9);
          if (!/^[0-9a-fA-F]{8}$/.test(hex)) {
            result += '\\U';
            break;
          }
          const codePoint = Number.parseInt(hex, 16);
          result += Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : '\\U';
          index += 8;
          break;
        }
        default:
          result += `\\${escapeCode}`;
          break;
      }
    }

    return result;
  }

  private formatPortLiteral(value: string | number | boolean): string {
    if (typeof value === 'string') {
      const escaped = this.decodeStringEscapes(value)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .replace(/\t/g, '\\t')
        .replace(/\0/g, '\\0');
      return `"${escaped}"`;
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    return String(value);
  }

  /**
   * Сопоставить ID порта с суффиксом безопасно:
   * - точное совпадение (legacy),
   * - стандартные разделители `-` и `_`.
   *
   * Важно: не используем `includes`, чтобы `...-a` не совпадал с `...-b`
   * только потому, что в ID узла есть символ `a`/`b`.
   */
  private matchesPortSuffix(portId: string, portSuffix: string): boolean {
    if (!portId || !portSuffix) {
      return false;
    }

    const normalizedPortId = portId.toLowerCase();
    const normalizedSuffix = portSuffix.toLowerCase();

    return (
      normalizedPortId === normalizedSuffix ||
      normalizedPortId.endsWith(`-${normalizedSuffix}`) ||
      normalizedPortId.endsWith(`_${normalizedSuffix}`) ||
      this.hasPortTokenMatch(normalizedPortId, normalizedSuffix)
    );
  }

  private hasPortTokenMatch(portId: string, portSuffix: string): boolean {
    const portTokens = portId.split(/[-_]/).filter(Boolean);
    const suffixTokens = portSuffix.split(/[-_]/).filter(Boolean);

    if (suffixTokens.length === 0 || portTokens.length === 0) {
      return false;
    }

    if (suffixTokens.length === 1) {
      return portTokens.includes(suffixTokens[0]);
    }

    for (let start = 0; start <= portTokens.length - suffixTokens.length; start += 1) {
      let matched = true;
      for (let offset = 0; offset < suffixTokens.length; offset += 1) {
        if (portTokens[start + offset] !== suffixTokens[offset]) {
          matched = false;
          break;
        }
      }
      if (matched) {
        return true;
      }
    }

    return false;
  }

  private isExecutionEntrySensitiveNode(nodeType: BlueprintNodeType): boolean {
    return nodeType === 'DoOnce';
  }

  private ensureProcessedExecutionEntries(context: CodeGenContext): Set<string> {
    if (!(context.processedExecutionEntries instanceof Set)) {
      context.processedExecutionEntries = new Set<string>();
    }
    return context.processedExecutionEntries;
  }

  private ensurePendingExecutionEntryPorts(context: CodeGenContext): Map<string, string[]> {
    if (!(context.pendingExecutionEntryPorts instanceof Map)) {
      context.pendingExecutionEntryPorts = new Map<string, string[]>();
    }
    return context.pendingExecutionEntryPorts;
  }

  private enqueueExecutionEntryPort(
    context: CodeGenContext,
    nodeId: string,
    targetPort: string
  ): void {
    if (!nodeId || !targetPort) {
      return;
    }

    const pending = this.ensurePendingExecutionEntryPorts(context);
    const queue = pending.get(nodeId);
    if (queue) {
      queue.push(targetPort);
    } else {
      pending.set(nodeId, [targetPort]);
    }
  }

  private consumeExecutionEntryPort(
    context: CodeGenContext,
    nodeId: string
  ): string | undefined {
    const pending = this.ensurePendingExecutionEntryPorts(context);
    const queue = pending.get(nodeId);
    if (!queue || queue.length === 0) {
      return undefined;
    }

    const port = queue.shift();
    if (queue.length === 0) {
      pending.delete(nodeId);
    }
    return port;
  }
  
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
    const registry = createRegistryWithPackages(getNodeDefinition, packageNodeTypes, 'cpp');
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
      declaredVariableInitializers: new Map(),
      processedNodes: new Set(),
      processedExecutionEntries: new Set(),
      pendingExecutionEntryPorts: new Map(),
      currentExecutionEntryPort: undefined,
      errors: [],
      warnings: [],
      sourceMap: [],
      currentLine: 1,
      functions: graph.functions ?? [],
      variableWriteCounts: new Map(),
      requiredHelpers: new Set<TypeConversionHelperId>(),
      supportedNodeTypes: this.getSupportedNodeTypes(),
    };
    
    // Создать helpers для генераторов
    const helpers = this.createHelpers(context);
    
    // Очистить собранные includes от предыдущих генераций
    TemplateNodeGenerator.clearCollectedIncludes();
    
    // Генерировать тело кода (нужно сделать до headers, чтобы собрать includes)
    const bodyLines: string[] = [];

    // Объявления и определения классов должны появиться до тела графа,
    // чтобы вызовы узлов Class* могли ссылаться на корректные C++ типы.
    if (opts.generateClassDeclarations) {
      bodyLines.push(...this.generateClassDeclarationsAndDefinitions(graph));
      if (bodyLines.length > 0) {
        bodyLines.push('');
      }
    }
    
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

    // Предобъявления переменных графа (Blueprint variables),
    // чтобы GetVariable всегда имел валидный идентификатор в коде.
    bodyLines.push(...this.generateGraphVariableDeclarations(context));
    
    // Найти Start узел и начать обход
    const startNode = graph.nodes.find(n => n.type === 'Start');
    if (startNode) {
      const nodeLines = this.generateFromNode(startNode, context, helpers);
      bodyLines.push(...nodeLines);
    }
    
    // Закрыть main()
    if (opts.generateMainWrapper) {
      const lastMeaningfulLine = this.getLastMeaningfulCodeLine(bodyLines);
      if (!lastMeaningfulLine || !/^\s*return\b/.test(lastMeaningfulLine)) {
        bodyLines.push(indent(1, opts.indentSize) + 'return 0;');
      }
      bodyLines.push('}');
    }
    
    // Теперь собираем всё вместе с правильными includes
    const lines: string[] = [];
    const helperIncludes = this.getRequiredHelperIncludes(context);
    const helperLines = this.buildRequiredHelperLines(context);
    
    // Заголовок с includes
    if (opts.includeHeaders) {
      lines.push('// Сгенерировано MultiCode');
      lines.push(`// Граф: ${graph.name}`);
      lines.push(`// Дата: ${new Date().toLocaleString('ru-RU')}`);

      // Служебная привязка к sidecar-файлу графа (для round-trip: код <-> ноды).
      // Важно: эта строка должна попадать в первые строки файла, чтобы её можно было быстро найти.
      const safeGraphId = String(graph.id ?? '').replace(/[^a-zA-Z0-9._-]+/g, '_');
      lines.push(`// @multicode:graph id=${String(graph.id)} file=.multicode/${safeGraphId}.multicode`);
      lines.push('');
      
      // Стандартные includes
      const standardIncludes = new Set(['<iostream>', '<string>', '<vector>']);
      const hasPointerVariables = (graph.variables ?? []).some((variable) => variable.dataType === 'pointer');
      const bodyNeedsMemoryInclude = bodyLines.some((line) =>
        line.includes('std::shared_ptr') ||
        line.includes('std::unique_ptr') ||
        line.includes('std::weak_ptr') ||
        line.includes('std::make_shared') ||
        line.includes('std::make_unique')
      );
      if (hasPointerVariables || bodyNeedsMemoryInclude) {
        standardIncludes.add('<memory>');
      }
      const bodyNeedsFutureInclude = bodyLines.some((line) =>
        line.includes('std::future') ||
        line.includes('std::async') ||
        line.includes('std::launch::')
      );
      if (bodyNeedsFutureInclude) {
        standardIncludes.add('<future>');
      }
      const bodyNeedsThreadInclude = bodyLines.some((line) =>
        line.includes('std::thread')
      );
      if (bodyNeedsThreadInclude) {
        standardIncludes.add('<thread>');
      }
      const bodyNeedsTupleInclude = bodyLines.some((line) =>
        line.includes('std::tuple') || line.includes('std::get<')
      );
      if (bodyNeedsTupleInclude) {
        standardIncludes.add('<tuple>');
      }
      const bodyNeedsRandomInclude = bodyLines.some((line) =>
        line.includes('std::mt19937') || line.includes('std::uniform_int_distribution')
      );
      if (bodyNeedsRandomInclude) {
        standardIncludes.add('<random>');
      }
      const bodyNeedsStringStreamInclude = bodyLines.some((line) =>
        line.includes('std::stringstream')
      );
      if (bodyNeedsStringStreamInclude) {
        standardIncludes.add('<sstream>');
      }
      const bodyNeedsTypeTraitsInclude = bodyLines.some((line) =>
        line.includes('std::decay_t')
      );
      if (bodyNeedsTypeTraitsInclude) {
        standardIncludes.add('<type_traits>');
      }
      const bodyNeedsExceptionInclude = bodyLines.some((line) =>
        line.includes('std::exception_ptr') ||
        line.includes('std::current_exception') ||
        line.includes('std::rethrow_exception')
      );
      if (bodyNeedsExceptionInclude) {
        standardIncludes.add('<exception>');
      }
      const bodyNeedsExpectedInclude = bodyLines.some((line) =>
        line.includes('std::expected') || line.includes('std::unexpected')
      );
      if (bodyNeedsExpectedInclude) {
        standardIncludes.add('<expected>');
      }
      const bodyNeedsOptionalInclude = bodyLines.some((line) =>
        line.includes('std::optional') || line.includes('std::nullopt')
      );
      if (bodyNeedsOptionalInclude) {
        standardIncludes.add('<optional>');
      }
      const bodyNeedsVariantInclude = bodyLines.some((line) =>
        line.includes('std::variant') || line.includes('std::visit')
      );
      if (bodyNeedsVariantInclude) {
        standardIncludes.add('<variant>');
      }
      const bodyNeedsFormatInclude = bodyLines.some((line) =>
        line.includes('std::format(')
      );
      if (bodyNeedsFormatInclude) {
        standardIncludes.add('<format>');
      }
      
      // Добавляем includes из шаблонных генераторов
      const templateIncludes = TemplateNodeGenerator.getCollectedIncludes();
      for (const inc of templateIncludes) {
        standardIncludes.add(inc);
      }

      for (const include of helperIncludes) {
        standardIncludes.add(include);
      }
      
      // Сортируем и выводим
      const sortedIncludes = Array.from(standardIncludes).sort();
      for (const inc of sortedIncludes) {
        lines.push(`#include ${inc}`);
      }
      lines.push('');
    }

    if (helperLines.length > 0) {
      lines.push(...helperLines);
      lines.push('');
    }
    
    context.currentLine = lines.length + 1;
    
    // Добавляем тело
    lines.push(...bodyLines);
    
    lines.push('');
    
    const code = lines.join('\n');
    
    // Найти неиспользованные узлы
    for (const node of graph.nodes) {
      if (context.processedNodes.has(node.id)) {
        continue;
      }
      if (!this.isExecutionRelevantForUnusedWarning(node)) {
        continue;
      }
      if (node.type === 'Comment') {
        continue;
      }
      const readableLabel = this.getReadableNodeLabel(node, context);
      if (!context.processedNodes.has(node.id)) {
        context.warnings.push({
          nodeId: node.id,
          code: CodeGenWarningCode.UNUSED_NODE,
          message: `Узел "${readableLabel}" не достижим из Start`,
        });
      }
    }
    
    const processedErrors = this.postProcessErrors(context.errors);

    return {
      success: processedErrors.length === 0,
      code,
      errors: processedErrors,
      warnings: context.warnings,
      sourceMap: context.sourceMap,
      stats: {
        nodesProcessed: context.processedNodes.size,
        linesOfCode: lines.filter(l => l.trim() && !l.trim().startsWith('//')).length,
        generationTimeMs: performance.now() - startTime,
      },
    };
  }

  private resolveCppType(dataType: PortDataType, typeName?: string): string {
    const resolvedTypeName = typeof typeName === 'string' ? typeName.trim() : '';
    if ((dataType === 'class' || dataType === 'pointer') && resolvedTypeName.length > 0) {
      return resolvedTypeName;
    }
    return getCppType(dataType);
  }

  private formatClassMemberDefault(member: ClassModelField): string {
    if (member.defaultValue === undefined || member.defaultValue === null) {
      return '';
    }

    if (member.dataType === 'string') {
      return ` = ${this.formatPortLiteral(String(member.defaultValue))}`;
    }

    if (member.dataType === 'bool') {
      return ` = ${member.defaultValue ? 'true' : 'false'}`;
    }

    if (typeof member.defaultValue === 'number') {
      return ` = ${String(member.defaultValue)}`;
    }

    return '';
  }

  private formatMethodSignature(method: ClassModelMethod, className: string, withClassScope: boolean): string {
    const returnType = this.resolveCppType(method.returnType, method.returnTypeName);
    const methodName = toValidIdentifier(method.name);
    const params = method.params
      .map((param, index) => {
        const paramType = this.resolveCppType(param.dataType, param.typeName);
        const paramName = toValidIdentifier(param.name || `arg_${index}`);
        return `${paramType} ${paramName}`;
      })
      .join(', ');

    if (withClassScope) {
      return `${returnType} ${className}::${methodName}(${params})`;
    }

    const constSuffix = method.isConst ? ' const' : '';
    const staticPrefix = method.isStatic ? 'static ' : '';
    const virtualPrefix = method.isVirtual ? 'virtual ' : '';
    const overrideSuffix = method.isOverride ? ' override' : '';
    return `${virtualPrefix}${staticPrefix}${returnType} ${methodName}(${params})${constSuffix}${overrideSuffix}`;
  }

  private generateClassDeclarationsAndDefinitions(graph: BlueprintGraphState): string[] {
    const classes: ClassModel[] = buildClassModelFromGraph(graph, 'cpp');
    if (classes.length === 0) {
      return [];
    }

    const lines: string[] = [];
    for (const blueprintClass of classes) {
      const className = toValidIdentifier(blueprintClass.name || 'UnnamedClass');
      lines.push(`class ${className} {`);

      const membersByAccess = new Map<string, ClassModelField[]>();
      const methodsByAccess = new Map<string, ClassModelMethod[]>();

      for (const member of blueprintClass.fields) {
        const access = member.access || 'private';
        const list = membersByAccess.get(access) ?? [];
        list.push(member);
        membersByAccess.set(access, list);
      }

      for (const method of blueprintClass.methods) {
        const access = method.access || 'private';
        const list = methodsByAccess.get(access) ?? [];
        list.push(method);
        methodsByAccess.set(access, list);
      }

      for (const access of ['public', 'protected', 'private'] as const) {
        const members = membersByAccess.get(access) ?? [];
        const methods = methodsByAccess.get(access) ?? [];

        if (members.length === 0 && methods.length === 0) {
          continue;
        }

        lines.push(`${access}:`);
        for (const member of members) {
          const memberType = this.resolveCppType(member.dataType, member.typeName);
          const memberName = toValidIdentifier(member.name);
          lines.push(indent(1) + `${memberType} ${memberName}${this.formatClassMemberDefault(member)};`);
        }

        for (const method of methods) {
          lines.push(indent(1) + `${this.formatMethodSignature(method, className, false)};`);
        }
      }

      lines.push('};');
      lines.push('');
    }

    for (const blueprintClass of classes) {
      const className = toValidIdentifier(blueprintClass.name || 'UnnamedClass');
      for (const method of blueprintClass.methods) {
        lines.push(`${this.formatMethodSignature(method, className, true)} {`);
        if (method.returnType !== 'execution') {
          const returnType = this.resolveCppType(method.returnType, method.returnTypeName);
          if (returnType !== 'void') {
            lines.push(indent(1) + `return ${getDefaultValue(method.returnType)};`);
          }
        }
        lines.push('}');
        lines.push('');
      }
    }

    while (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }

    return lines;
  }

  private getRequiredHelperSet(context: CodeGenContext): Set<TypeConversionHelperId> {
    if (!(context.requiredHelpers instanceof Set)) {
      return new Set<TypeConversionHelperId>();
    }
    return context.requiredHelpers;
  }

  /**
   * Удаляет дубликаты ошибок (по nodeId+code+message+messageEn), сохраняя порядок.
   */
  private postProcessErrors(errors: CodeGenError[]): CodeGenError[] {
    const seen = new Set<string>();
    const result: CodeGenError[] = [];

    for (const error of errors) {
      const key = `${error.nodeId}|${error.code}|${error.message}|${error.messageEn}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(error);
    }

    return result;
  }

  private getRequiredHelperIncludes(context: CodeGenContext): Set<string> {
    const helperSet = this.getRequiredHelperSet(context);
    const includes = new Set<string>();

    if (helperSet.size === 0) {
      return includes;
    }

    const needsParseBool =
      helperSet.has('parse_bool_strict') ||
      helperSet.has('parse_vector_strict') ||
      helperSet.has('parse_array_strict');
    const needsCollectionHelpers =
      helperSet.has('vector_to_string') ||
      helperSet.has('array_to_string') ||
      helperSet.has('parse_vector_strict') ||
      helperSet.has('parse_array_strict');
    const needsStringStreams =
      helperSet.has('pointer_to_string') ||
      helperSet.has('class_to_string') ||
      needsCollectionHelpers;
    const needsTypeTraits = helperSet.has('pointer_truthy') || needsCollectionHelpers;

    if (needsParseBool) {
      includes.add('<algorithm>');
      includes.add('<cctype>');
      includes.add('<stdexcept>');
    }

    if (needsStringStreams) {
      includes.add('<sstream>');
    }

    if (needsTypeTraits) {
      includes.add('<type_traits>');
    }

    if (helperSet.has('pointer_truthy') || helperSet.has('pointer_to_string')) {
      includes.add('<memory>');
    }

    return includes;
  }

  private buildRequiredHelperLines(context: CodeGenContext): string[] {
    const helperSet = this.getRequiredHelperSet(context);
    if (helperSet.size === 0) {
      return [];
    }

    const lines: string[] = [];
    const pushBlock = (blockLines: string[]): void => {
      if (blockLines.length === 0) {
        return;
      }
      if (lines.length > 0) {
        lines.push('');
      }
      lines.push(...blockLines);
    };

    const needsParseBool =
      helperSet.has('parse_bool_strict') ||
      helperSet.has('parse_vector_strict') ||
      helperSet.has('parse_array_strict');
    const needsPointerTruthy = helperSet.has('pointer_truthy');
    const needsPointerToString = helperSet.has('pointer_to_string');
    const needsClassToString = helperSet.has('class_to_string');
    const needsCollectionStringify =
      helperSet.has('vector_to_string') || helperSet.has('array_to_string');
    const needsCollectionParse =
      helperSet.has('parse_vector_strict') || helperSet.has('parse_array_strict');
    const needsCollectionHelpers = needsCollectionStringify || needsCollectionParse;

    pushBlock(['// Helper-функции MultiCode (автогенерация по используемым конвертациям)']);

    if (needsParseBool) {
      pushBlock([
        'static auto multicode_parse_bool_strict(const std::string& raw_value) -> bool {',
        '  const auto begin = std::find_if_not(raw_value.begin(), raw_value.end(), [](unsigned char ch) {',
        '    return std::isspace(ch) != 0;',
        '  });',
        '  const auto end = std::find_if_not(raw_value.rbegin(), raw_value.rend(), [](unsigned char ch) {',
        '    return std::isspace(ch) != 0;',
        '  }).base();',
        '  if (begin >= end) {',
        '    throw std::invalid_argument("multicode_parse_bool_strict: empty token");',
        '  }',
        '',
        '  std::string normalized;',
        '  normalized.reserve(static_cast<std::size_t>(end - begin));',
        '  for (auto it = begin; it != end; ++it) {',
        '    normalized.push_back(static_cast<char>(std::tolower(static_cast<unsigned char>(*it))));',
        '  }',
        '',
        '  if (normalized == "true" || normalized == "1") {',
        '    return true;',
        '  }',
        '  if (normalized == "false" || normalized == "0") {',
        '    return false;',
        '  }',
        '',
        '  throw std::invalid_argument("multicode_parse_bool_strict: unsupported boolean token");',
        '}',
      ]);
    }

    if (needsCollectionHelpers) {
      pushBlock([
        'template <typename T>',
        'struct multicode_is_std_vector : std::false_type {};',
        '',
        'template <typename T, typename Allocator>',
        'struct multicode_is_std_vector<std::vector<T, Allocator>> : std::true_type {};',
      ]);
    }

    if (needsCollectionStringify) {
      pushBlock([
        'static auto multicode_escape_string(const std::string& value) -> std::string {',
        '  std::string escaped;',
        '  escaped.reserve(value.size());',
        '  for (char ch : value) {',
        '    switch (ch) {',
        '      case \'\\\\\': escaped += "\\\\\\\\"; break;',
        '      case \'"\': escaped += "\\\\\\""; break;',
        '      case \'\\n\': escaped += "\\\\n"; break;',
        '      case \'\\r\': escaped += "\\\\r"; break;',
        '      case \'\\t\': escaped += "\\\\t"; break;',
        '      default: escaped.push_back(ch); break;',
        '    }',
        '  }',
        '  return escaped;',
        '}',
        '',
        'template <typename T>',
        'auto multicode_stringify_value(const T& value) -> std::string;',
        '',
        'template <typename T>',
        'auto multicode_stringify_vector(const T& values) -> std::string {',
        '  std::ostringstream stream;',
        '  stream << "[";',
        '  bool first = true;',
        '  for (const auto& item : values) {',
        '    if (!first) {',
        '      stream << ", ";',
        '    }',
        '    first = false;',
        '    stream << multicode_stringify_value(item);',
        '  }',
        '  stream << "]";',
        '  return stream.str();',
        '}',
        '',
        'template <typename T>',
        'auto multicode_stringify_value(const T& value) -> std::string {',
        '  if constexpr (multicode_is_std_vector<T>::value) {',
        '    return multicode_stringify_vector(value);',
        '  } else if constexpr (std::is_same_v<T, std::string>) {',
        '    return std::string(1, \'"\') + multicode_escape_string(value) + std::string(1, \'"\');',
        '  } else if constexpr (std::is_same_v<T, bool>) {',
        '    return value ? "true" : "false";',
        '  } else {',
        '    std::ostringstream stream;',
        '    stream << value;',
        '    return stream.str();',
        '  }',
        '}',
      ]);
    }

    if (needsCollectionParse) {
      pushBlock([
        'static auto multicode_trim_copy(const std::string& value) -> std::string {',
        '  const auto begin = std::find_if_not(value.begin(), value.end(), [](unsigned char ch) {',
        '    return std::isspace(ch) != 0;',
        '  });',
        '  const auto end = std::find_if_not(value.rbegin(), value.rend(), [](unsigned char ch) {',
        '    return std::isspace(ch) != 0;',
        '  }).base();',
        '  if (begin >= end) {',
        '    return "";',
        '  }',
        '  return std::string(begin, end);',
        '}',
        '',
        'static auto multicode_unescape_quoted_string(const std::string& token) -> std::string {',
        '  if (token.size() < 2 || token.front() != \'"\' || token.back() != \'"\') {',
        '    throw std::invalid_argument("Expected quoted string token");',
        '  }',
        '',
        '  std::string result;',
        '  result.reserve(token.size() - 2);',
        '  bool escaped = false;',
        '  for (std::size_t i = 1; i + 1 < token.size(); ++i) {',
        '    const char ch = token[i];',
        '    if (escaped) {',
        '      switch (ch) {',
        '        case \'n\': result.push_back(\'\\n\'); break;',
        '        case \'r\': result.push_back(\'\\r\'); break;',
        '        case \'t\': result.push_back(\'\\t\'); break;',
        '        case \'\\\\\': result.push_back(\'\\\\\'); break;',
        '        case \'"\': result.push_back(\'"\'); break;',
        '        default: result.push_back(ch); break;',
        '      }',
        '      escaped = false;',
        '      continue;',
        '    }',
        '',
        '    if (ch == \'\\\\\') {',
        '      escaped = true;',
        '      continue;',
        '    }',
        '',
        '    result.push_back(ch);',
        '  }',
        '',
        '  if (escaped) {',
        '    throw std::invalid_argument("Invalid escaped string token");',
        '  }',
        '',
        '  return result;',
        '}',
        '',
        'static auto multicode_split_top_level_array(const std::string& raw_value) -> std::vector<std::string> {',
        '  const std::string trimmed = multicode_trim_copy(raw_value);',
        '  if (trimmed.size() < 2 || trimmed.front() != \'[\' || trimmed.back() != \']\') {',
        '    throw std::invalid_argument("Expected array token in JSON-like format");',
        '  }',
        '',
        '  std::vector<std::string> items;',
        '  std::string current;',
        '  int depth = 0;',
        '  bool in_string = false;',
        '  bool escaped = false;',
        '',
        '  for (std::size_t i = 1; i + 1 < trimmed.size(); ++i) {',
        '    const char ch = trimmed[i];',
        '    if (escaped) {',
        '      current.push_back(ch);',
        '      escaped = false;',
        '      continue;',
        '    }',
        '',
        '    if (ch == \'\\\\\') {',
        '      current.push_back(ch);',
        '      escaped = true;',
        '      continue;',
        '    }',
        '',
        '    if (ch == \'"\') {',
        '      current.push_back(ch);',
        '      in_string = !in_string;',
        '      continue;',
        '    }',
        '',
        '    if (!in_string && ch == \'[\') {',
        '      depth += 1;',
        '      current.push_back(ch);',
        '      continue;',
        '    }',
        '',
        '    if (!in_string && ch == \']\') {',
        '      depth -= 1;',
        '      if (depth < 0) {',
        '        throw std::invalid_argument("Invalid nested array format");',
        '      }',
        '      current.push_back(ch);',
        '      continue;',
        '    }',
        '',
        '    if (!in_string && depth == 0 && ch == \',\') {',
        '      const std::string token = multicode_trim_copy(current);',
        '      if (token.empty()) {',
        '        throw std::invalid_argument("Empty array token is not allowed");',
        '      }',
        '      items.push_back(token);',
        '      current.clear();',
        '      continue;',
        '    }',
        '',
        '    current.push_back(ch);',
        '  }',
        '',
        '  if (in_string || depth != 0) {',
        '    throw std::invalid_argument("Unbalanced array token");',
        '  }',
        '',
        '  const std::string last = multicode_trim_copy(current);',
        '  if (!last.empty()) {',
        '    items.push_back(last);',
        '  }',
        '',
        '  return items;',
        '}',
        '',
        'template <typename T>',
        'auto multicode_parse_scalar_token(const std::string& token) -> T {',
        '  const std::string trimmed = multicode_trim_copy(token);',
        '  if (trimmed.empty()) {',
        '    throw std::invalid_argument("Empty scalar token is not allowed");',
        '  }',
        '',
        '  if constexpr (std::is_same_v<T, std::string>) {',
        '    return multicode_unescape_quoted_string(trimmed);',
        '  } else if constexpr (std::is_same_v<T, bool>) {',
        '    return multicode_parse_bool_strict(trimmed);',
        '  } else if constexpr (std::is_same_v<T, int>) {',
        '    return static_cast<T>(std::stoi(trimmed));',
        '  } else if constexpr (std::is_same_v<T, long long>) {',
        '    return static_cast<T>(std::stoll(trimmed));',
        '  } else if constexpr (std::is_same_v<T, float>) {',
        '    return static_cast<T>(std::stof(trimmed));',
        '  } else if constexpr (std::is_same_v<T, double>) {',
        '    return static_cast<T>(std::stod(trimmed));',
        '  } else {',
        '    std::istringstream stream(trimmed);',
        '    T parsed{};',
        '    if (!(stream >> parsed) || !(stream >> std::ws).eof()) {',
        '      throw std::invalid_argument("Unsupported scalar token conversion");',
        '    }',
        '    return parsed;',
        '  }',
        '}',
        '',
        'template <typename T>',
        'auto multicode_parse_array_value(const std::string& token) -> T {',
        '  if constexpr (multicode_is_std_vector<T>::value) {',
        '    using ItemType = typename T::value_type;',
        '    const auto parts = multicode_split_top_level_array(token);',
        '    T result;',
        '    result.reserve(parts.size());',
        '    for (const auto& part : parts) {',
        '      result.push_back(multicode_parse_array_value<ItemType>(part));',
        '    }',
        '    return result;',
        '  } else {',
        '    return multicode_parse_scalar_token<T>(token);',
        '  }',
        '}',
      ]);
    }

    if (needsPointerTruthy) {
      pushBlock([
        'template <typename T>',
        'auto multicode_pointer_truthy(T* value) -> bool {',
        '  return value != nullptr;',
        '}',
        '',
        'template <typename T>',
        'auto multicode_pointer_truthy(const std::shared_ptr<T>& value) -> bool {',
        '  return static_cast<bool>(value);',
        '}',
        '',
        'template <typename T>',
        'auto multicode_pointer_truthy(const std::unique_ptr<T>& value) -> bool {',
        '  return static_cast<bool>(value);',
        '}',
        '',
        'template <typename T>',
        'auto multicode_pointer_truthy(const std::weak_ptr<T>& value) -> bool {',
        '  return !value.expired();',
        '}',
        '',
        'template <typename T>',
        'auto multicode_pointer_truthy(const T& value) -> bool {',
        '  if constexpr (std::is_convertible_v<T, bool>) {',
        '    return static_cast<bool>(value);',
        '  }',
        '  return true;',
        '}',
      ]);
    }

    if (needsPointerToString) {
      pushBlock([
        'template <typename T>',
        'auto multicode_pointer_address_to_string(T* value) -> std::string {',
        '  if (value == nullptr) {',
        '    return "nullptr";',
        '  }',
        '  std::ostringstream stream;',
        '  stream << static_cast<const void*>(value);',
        '  return stream.str();',
        '}',
        '',
        'template <typename T>',
        'auto multicode_pointer_to_string(T* value) -> std::string {',
        '  return multicode_pointer_address_to_string(value);',
        '}',
        '',
        'template <typename T>',
        'auto multicode_pointer_to_string(const std::shared_ptr<T>& value) -> std::string {',
        '  return multicode_pointer_address_to_string(value.get());',
        '}',
        '',
        'template <typename T>',
        'auto multicode_pointer_to_string(const std::unique_ptr<T>& value) -> std::string {',
        '  return multicode_pointer_address_to_string(value.get());',
        '}',
        '',
        'template <typename T>',
        'auto multicode_pointer_to_string(const std::weak_ptr<T>& value) -> std::string {',
        '  if (value.expired()) {',
        '    return "expired";',
        '  }',
        '  return multicode_pointer_address_to_string(value.lock().get());',
        '}',
        '',
        'template <typename T>',
        'auto multicode_pointer_to_string(const T& value) -> std::string {',
        '  std::ostringstream stream;',
        '  stream << value;',
        '  return stream.str();',
        '}',
      ]);
    }

    if (needsClassToString) {
      pushBlock([
        'template <typename T>',
        'auto multicode_class_to_string(const T& value) -> std::string {',
        '  std::ostringstream stream;',
        '  stream << value;',
        '  return stream.str();',
        '}',
      ]);
    }

    if (helperSet.has('vector_to_string')) {
      pushBlock([
        'template <typename T>',
        'auto multicode_vector_to_string(const std::vector<T>& value) -> std::string {',
        '  return multicode_stringify_vector(value);',
        '}',
      ]);
    }

    if (helperSet.has('array_to_string')) {
      pushBlock([
        'template <typename T>',
        'auto multicode_array_to_string(const T& value) -> std::string {',
        '  return multicode_stringify_value(value);',
        '}',
      ]);
    }

    if (helperSet.has('parse_vector_strict')) {
      pushBlock([
        'template <typename T>',
        'auto multicode_parse_vector_strict(const std::string& raw_value) -> std::vector<T> {',
        '  return multicode_parse_array_value<std::vector<T>>(raw_value);',
        '}',
      ]);
    }

    if (helperSet.has('parse_array_strict')) {
      pushBlock([
        'template <typename T>',
        'auto multicode_parse_array_strict(const std::string& raw_value) -> T {',
        '  return multicode_parse_array_value<T>(raw_value);',
        '}',
      ]);
    }

    return lines;
  }
  
  /**
   * Генерировать код начиная с узла, следуя по execution flow
   */
  private generateFromNode(
    node: BlueprintNode,
    context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string[] {
    const previousExecutionEntryPort = context.currentExecutionEntryPort;
    context.currentExecutionEntryPort = this.consumeExecutionEntryPort(context, node.id);

    try {
      const lines: string[] = [];
      const isEntrySensitive = this.isExecutionEntrySensitiveNode(node.type);
      const entryPortKey = context.currentExecutionEntryPort ?? '__default';

      if (isEntrySensitive) {
        const processedExecutionEntries = this.ensureProcessedExecutionEntries(context);
        const entryScopedKey = `${node.id}::${entryPortKey}`;
        if (processedExecutionEntries.has(entryScopedKey)) {
          return lines;
        }
        processedExecutionEntries.add(entryScopedKey);
        context.processedNodes.add(node.id);
      } else {
        // Предотвратить бесконечные циклы
        if (context.processedNodes.has(node.id)) {
          return lines;
        }
        context.processedNodes.add(node.id);
      }

      const startLine = context.currentLine;

      // Получить генератор для этого типа узла
      const generator = this.registry.get(node.type);
      if (!generator) {
        const unsupportedLabel = this.isRussianDisplayLanguage(context)
          ? `Неподдерживаемый тип: ${node.type}`
          : `Unsupported node type: ${node.type}`;
        lines.push(`${indent(context.indentLevel, context.options.indentSize)}// ${unsupportedLabel}`);
        return lines;
      }

      // Добавить русский комментарий
      if (context.options.includeRussianComments) {
        const commentLabel = this.resolveNodeCommentLabel(node, context);
        if (commentLabel) {
          lines.push(`${indent(context.indentLevel, context.options.indentSize)}// ${commentLabel}`);
        }
      }

      const markerNodeId = String(node.id).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const markerNodeType = String(node.type).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

      // Маркер начала
      if (context.options.includeSourceMarkers) {
        lines.push(
          `${indent(context.indentLevel, context.options.indentSize)}// @multicode:node begin id="${markerNodeId}" type="${markerNodeType}"`
        );
      }

      // Генерировать код через плагин
      const result = generator.generate(node, context, helpers);
      lines.push(...result.lines);
      context.currentLine += result.lines.length;

      // Маркер конца
      if (context.options.includeSourceMarkers && result.lines.length > 0) {
        lines.push(
          `${indent(context.indentLevel, context.options.indentSize)}// @multicode:node end id="${markerNodeId}"`
        );
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
    } finally {
      context.currentExecutionEntryPort = previousExecutionEntryPort;
    }
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
    
    // Комментарий с названием функции в текущей локали графа
    if (opts.includeRussianComments) {
      const isRu = this.isRussianDisplayLanguage(context);
      const functionName = isRu
        ? (func.nameRu || func.name)
        : (func.name || func.nameRu);
      const functionPrefix = isRu ? 'Функция' : 'Function';
      if (functionName) {
        lines.push(`// ${functionPrefix}: ${functionName}`);
      }
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
    const functionVariables = this.resolveFunctionScopedVariables(func);
    
    if (entryNode) {
      // Создаём временный контекст для графа функции
      const funcContext: CodeGenContext = {
        ...context,
        graph: {
          ...context.graph,
          nodes: func.graph.nodes,
          edges: func.graph.edges,
          variables: functionVariables,
        },
        processedNodes: new Set<string>(),
        processedExecutionEntries: new Set<string>(),
        pendingExecutionEntryPorts: new Map<string, string[]>(),
        currentExecutionEntryPort: undefined,
        declaredVariables: new Map(),
        declaredVariableInitializers: new Map(),
        currentFunction: func,
        indentLevel: 1,
        variableWriteCounts: new Map(),
      };
      
      // Создаём helpers для контекста функции
      const funcHelpers = this.createHelpersForContext(funcContext);

      // Локальные переменные функции объявляются в её теле.
      lines.push(...this.generateGraphVariableDeclarations(funcContext));
      
      // Отмечаем FunctionEntry как обработанный
      funcContext.processedNodes.add(entryNode.id);
      
      // Находим следующий узел после FunctionEntry
      const nextNode = this.getNextExecutionNodeInGraph(entryNode, func.graph.nodes, func.graph.edges, funcContext);
      
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
      const emptyFunctionComment = this.isRussianDisplayLanguage(context)
        ? 'Пустая функция'
        : 'Empty function';
      lines.push(`${ind}// ${emptyFunctionComment}`);
      
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
      'pointer': 'nullptr',
      'class': '{}',
    };
    return defaults[dataType] ?? '0';
  }

  private isExecutionRelevantForUnusedWarning(node: BlueprintNode): boolean {
    if (node.type === 'Start' || node.type === 'End') {
      return true;
    }

    const hasExecutionInput = node.inputs.some((port) => port.dataType === 'execution');
    const hasExecutionOutput = node.outputs.some((port) => port.dataType === 'execution');
    return hasExecutionInput || hasExecutionOutput;
  }

  private isRussianDisplayLanguage(context: CodeGenContext): boolean {
    return context.graph.displayLanguage !== 'en';
  }

  private pickLocalizedValue(
    context: CodeGenContext,
    russianValue: unknown,
    englishValue: unknown
  ): string | null {
    const ru = typeof russianValue === 'string' ? russianValue.trim() : '';
    const en = typeof englishValue === 'string' ? englishValue.trim() : '';

    if (this.isRussianDisplayLanguage(context)) {
      return ru || en || null;
    }

    return en || ru || null;
  }

  /**
   * Получить имя переменной из узла SetVariable/GetVariable/Variable
   */
  private resolveVariableNameFromNode(node: BlueprintNode, context: CodeGenContext): string | null {
    const props = node.properties as Record<string, unknown> | undefined;
    if (!props) {
      return null;
    }

    // Пробуем найти переменную по variableId
    const variableId = typeof props.variableId === 'string' ? props.variableId.trim() : '';
    if (variableId) {
      const variables = context.graph.variables ?? [];
      const variable = variables.find((v) => v.id === variableId);
      if (variable) {
        const name = this.pickLocalizedValue(context, variable.nameRu, variable.name);
        if (name) {
          return name;
        }
      }
    }

    // Имя из свойств узла
    const nodeLevelName = this.pickLocalizedValue(context, props.nameRu, props.name);
    if (nodeLevelName) {
      return nodeLevelName;
    }

    return variableId || null;
  }

  /**
   * Сформировать текст комментария для узла
   */
  private resolveNodeCommentLabel(node: BlueprintNode, context: CodeGenContext): string | null {
    const def = NODE_TYPE_DEFINITIONS[node.type];
    const baseLabel = this.pickLocalizedValue(context, def?.labelRu, def?.label) ?? node.type;
    const alternateLabel = this.isRussianDisplayLanguage(context) ? def?.label : def?.labelRu;
    const label = node.label.trim();
    const isDefaultNodeLabel =
      label.length === 0 ||
      label === node.type ||
      label === baseLabel ||
      (typeof alternateLabel === 'string' && label === alternateLabel);

    // Для Variable-узлов: показать имя переменной
    const variableTypes: BlueprintNodeType[] = ['Variable', 'GetVariable', 'SetVariable'];
    if (variableTypes.includes(node.type)) {
      const varName = this.resolveVariableNameFromNode(node, context);
      if (node.type === 'SetVariable') {
        const rhsExpr =
          this.getInputExpressionInContext(node, 'value-in', context) ??
          this.getInputExpressionInContext(node, 'value', context) ??
          this.getInputExpressionInContext(node, 'in', context);
        if (rhsExpr) {
          const readableExpr = this.truncateCommentExpression(rhsExpr);
          if (varName) {
            return `${baseLabel}: ${varName} <- ${readableExpr}`;
          }
          return `${baseLabel}: ${readableExpr}`;
        }
      }
      if (varName) {
        return `${baseLabel}: ${varName}`;
      }
      return baseLabel;
    }

    if (!isDefaultNodeLabel) {
      return `${baseLabel}: ${label}`;
    }

    return baseLabel;
  }

  private getReadableNodeLabel(node: BlueprintNode, context: CodeGenContext): string {
    const trimmed = node.label.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }

    const definition = NODE_TYPE_DEFINITIONS[node.type];
    if (definition) {
      return this.pickLocalizedValue(context, definition.labelRu, definition.label) ?? node.type;
    }

    return node.id;
  }

  private getLastMeaningfulCodeLine(lines: string[]): string | null {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index]?.trim() ?? '';
      if (line.length === 0) {
        continue;
      }
      if (line.startsWith('//')) {
        continue;
      }
      return lines[index] ?? null;
    }
    return null;
  }

  private truncateCommentExpression(expression: string, maxLength: number = 96): string {
    const normalized = expression.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }
    return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
  }

  private formatVectorElementLiteral(value: unknown, elementType: VectorElementType): string | null {
    if (elementType === 'string') {
      if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
        return null;
      }
      const escaped = String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
      return `"${escaped}"`;
    }

    if (elementType === 'bool') {
      if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value !== 0 ? 'true' : 'false';
      }
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1') {
          return 'true';
        }
        if (normalized === 'false' || normalized === '0') {
          return 'false';
        }
      }
      return null;
    }

    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? value.trim().length > 0
            ? Number(value.trim().replace(',', '.'))
            : Number.NaN
          : Number.NaN;
    if (!Number.isFinite(parsed)) {
      return null;
    }

    if ((elementType === 'int32' || elementType === 'int64') && !Number.isInteger(parsed)) {
      return null;
    }

    return String(parsed);
  }

  private formatVectorLiteral(value: unknown, vectorElementType: VectorElementType | undefined): string {
    if (!Array.isArray(value)) {
      return '{}';
    }

    const elementType = vectorElementType ?? 'double';
    const literals: string[] = [];
    for (const item of value) {
      const literal = this.formatVectorElementLiteral(item, elementType);
      if (literal === null) {
        return '{}';
      }
      literals.push(literal);
    }

    return `{${literals.join(', ')}}`;
  }

  private formatArrayLiteral(
    value: unknown,
    dataType: PortDataType,
    arrayRank: number,
    vectorElementType: VectorElementType | undefined
  ): string {
    const parsed = parseArrayInput(value, dataType, {
      vectorElementType,
      arrayRank,
      allowLegacyCsv: true,
    });
    if (!parsed.ok || !Array.isArray(parsed.value)) {
      return '{}';
    }

    const formatLevel = (items: unknown[], remainingRank: number): string | null => {
      const levelLiterals: string[] = [];

      for (const item of items) {
        if (remainingRank === 1) {
          const leafLiteral =
            dataType === 'vector'
              ? this.formatVectorLiteral(item, vectorElementType)
              : this.formatVariableLiteral(item, dataType, vectorElementType, 0);
          levelLiterals.push(leafLiteral);
          continue;
        }

        if (!Array.isArray(item)) {
          return null;
        }

        const nestedLiteral = formatLevel(item, remainingRank - 1);
        if (nestedLiteral === null) {
          return null;
        }
        levelLiterals.push(nestedLiteral);
      }

      return `{${levelLiterals.join(', ')}}`;
    };

    const literal = formatLevel(parsed.value as unknown[], normalizeArrayRank(arrayRank));
    return literal ?? '{}';
  }

  private formatVariableLiteral(
    value: unknown,
    dataType: string,
    vectorElementType?: VectorElementType,
    arrayRank: number | boolean = 0
  ): string {
    const normalizedArrayRank = normalizeArrayRank(arrayRank);
    if (value === undefined || value === null) {
      return normalizedArrayRank > 0 ? '{}' : getDefaultValue(dataType);
    }

    if (normalizedArrayRank > 0) {
      if (!isPortDataType(dataType)) {
        return '{}';
      }
      return this.formatArrayLiteral(value, dataType, normalizedArrayRank, vectorElementType);
    }

    if (dataType === 'bool') {
      if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
      }
      if (typeof value === 'string') {
        const normalized = value.toLowerCase();
        return normalized === 'true' || normalized === '1' ? 'true' : 'false';
      }
      if (typeof value === 'number') {
        return value !== 0 ? 'true' : 'false';
      }
      return 'false';
    }

    if (dataType === 'string') {
      const escaped = String(value)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
      return `"${escaped}"`;
    }

    if (dataType === 'vector') {
      return this.formatVectorLiteral(value, vectorElementType);
    }

    if (dataType === 'array') {
      if (Array.isArray(value)) {
        return `{${value.map((item) => String(item)).join(', ')}}`;
      }
      return getDefaultValue(dataType);
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? String(value) : getDefaultValue(dataType);
    }

    if (typeof value === 'string') {
      const normalized = value.trim().replace(',', '.');
      if (normalized.length === 0) {
        return getDefaultValue(dataType);
      }

      if (dataType === 'int32' || dataType === 'int64' || dataType === 'float' || dataType === 'double') {
        return Number.isFinite(Number(normalized)) ? normalized : getDefaultValue(dataType);
      }
    }

    if (dataType === 'pointer') {
      if (value === null || value === undefined) {
        return 'nullptr';
      }

      if (typeof value === 'number' || typeof value === 'boolean') {
        // Для указателей валиден только nullptr/0. Любые числа кроме 0 приводят к ошибке компиляции,
        // поэтому нормализуем их в nullptr.
        return 'nullptr';
      }

      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length === 0) {
          return 'nullptr';
        }
        const normalized = trimmed.toLowerCase();
        if (normalized === '0' || normalized === 'null' || normalized === 'nullptr') {
          return 'nullptr';
        }
        return trimmed;
      }

      return 'nullptr';
    }

    return String(value);
  }

  private recoverPointerMetaFromVariableNodes(
    graph: BlueprintGraphState
  ): Map<string, ReturnType<typeof normalizePointerMeta>> {
    const pointerMetaByVariableId = new Map<string, ReturnType<typeof normalizePointerMeta>>();

    for (const node of graph.nodes) {
      if (node.type !== 'GetVariable' && node.type !== 'SetVariable') {
        continue;
      }

      if (!isRecord(node.properties)) {
        continue;
      }

      const variableId = typeof node.properties.variableId === 'string'
        ? node.properties.variableId.trim()
        : '';
      if (!variableId) {
        continue;
      }

      if (node.properties.pointerMeta === undefined) {
        continue;
      }

      pointerMetaByVariableId.set(variableId, normalizePointerMeta(node.properties.pointerMeta));
    }

    return pointerMetaByVariableId;
  }

  private generateGraphVariableDeclarations(context: CodeGenContext): string[] {
    const variables = context.graph.variables ?? [];
    if (variables.length === 0) {
      return [];
    }

    const recoveredPointerMeta = this.recoverPointerMetaFromVariableNodes(context.graph);
    const variablesWithRecoveredPointers = variables.map((variable) => {
      if (variable.dataType !== 'pointer' || variable.pointerMeta) {
        return variable;
      }

      const pointerMeta = recoveredPointerMeta.get(variable.id);
      if (!pointerMeta) {
        return variable;
      }

      return {
        ...variable,
        pointerMeta,
      };
    });

    const declarationOrderWeight = (variable: (typeof variables)[number]): number => {
      if (variable.dataType !== 'pointer') {
        return 0;
      }
      const mode = normalizePointerMeta(variable.pointerMeta).mode;
      if (mode === 'shared' || mode === 'unique' || mode === 'raw') {
        return 1;
      }
      if (mode === 'weak') {
        return 2;
      }
      return 3;
    };
    const orderedVariables = [...variablesWithRecoveredPointers].sort(
      (left, right) => declarationOrderWeight(left) - declarationOrderWeight(right)
    );

    const lines: string[] = [];
    const usedIdentifiers = new Set<string>();
    const ind = indent(context.indentLevel, context.options.indentSize);

    const reserveIdentifier = (base: string): string => {
      let candidate = base;
      let suffix = 1;
      while (usedIdentifiers.has(candidate)) {
        candidate = `${base}_${suffix}`;
        suffix += 1;
      }
      usedIdentifiers.add(candidate);
      return candidate;
    };

    const resolveStableIdentifierBase = (preferredName: string, fallbackName: string): string => {
      const preferredIdentifier = toValidIdentifier(preferredName);
      if (preferredIdentifier !== 'unnamed') {
        return preferredIdentifier;
      }

      const fallbackIdentifier = toValidIdentifier(fallbackName);
      if (fallbackIdentifier !== 'unnamed') {
        return fallbackIdentifier;
      }

      return toValidIdentifier(`var_${fallbackName}`);
    };

    for (const variable of orderedVariables) {
      const variableId = typeof variable.id === 'string' ? variable.id : '';
      if (variableId.length === 0) {
        continue;
      }

      const fallbackName = `var_${variableId}`;
      const displayName =
        (typeof variable.name === 'string' && variable.name.trim().length > 0
          ? variable.name
          : typeof variable.nameRu === 'string' && variable.nameRu.trim().length > 0
            ? variable.nameRu
            : fallbackName);
      const codeNameBase =
        typeof variable.codeName === 'string' && variable.codeName.trim().length > 0
          ? variable.codeName
          : displayName;
      const identifier = reserveIdentifier(resolveStableIdentifierBase(codeNameBase, fallbackName));
      const dataType = typeof variable.dataType === 'string' ? variable.dataType : 'float';
      const arrayRank =
        supportsArrayDataType(dataType as PortDataType)
          ? (() => {
              const normalized = normalizeArrayRank(variable.arrayRank);
              if (normalized > 0) {
                return normalized;
              }
              return variable.isArray === true ? 1 : 0;
            })()
          : 0;
      const vectorElementType = isVectorElementType(variable.vectorElementType)
        ? variable.vectorElementType
        : undefined;
      const cppType =
        dataType === 'pointer'
          ? resolvePointerCppType(variable, variablesWithRecoveredPointers)
          : getCppVariableType(dataType, vectorElementType, arrayRank);
      const defaultExpr =
        dataType === 'pointer'
          ? resolvePointerInitializer(variable, variablesWithRecoveredPointers, context.declaredVariables)
          : this.formatVariableLiteral(variable.defaultValue, dataType, vectorElementType, arrayRank);

      lines.push(`${ind}${cppType} ${identifier} = ${defaultExpr};`);

      const aliases = new Set<string>([
        variableId,
        typeof variable.name === 'string' ? variable.name : '',
        typeof variable.nameRu === 'string' ? variable.nameRu : '',
        typeof variable.codeName === 'string' ? variable.codeName : '',
        identifier,
      ]);

      if (context.declaredVariableInitializers instanceof Map) {
        const initializer = defaultExpr.trim();
        for (const alias of aliases) {
          if (!alias || context.declaredVariableInitializers.has(alias)) {
            continue;
          }
          context.declaredVariableInitializers.set(alias, initializer);
        }
      }

      for (const alias of aliases) {
        if (!alias || context.declaredVariables.has(alias)) {
          continue;
        }
        context.declaredVariables.set(alias, {
          codeName: identifier,
          originalName: displayName,
          cppType,
          nodeId: variableId,
        });
      }
    }

    if (lines.length > 0) {
      lines.push('');
    }

    return lines;
  }
  
  /**
   * Получить следующий execution узел в заданном графе
   */
  private getNextExecutionNodeInGraph(
    node: BlueprintNode,
    nodes: BlueprintNode[],
    edges: Array<{ sourceNode: string; sourcePort: string; targetNode: string; targetPort: string }>,
    context?: CodeGenContext
  ): BlueprintNode | null {
    const edge = edges.find(e => 
      e.sourceNode === node.id && 
      (this.matchesPortSuffix(e.sourcePort, 'exec-out') || this.matchesPortSuffix(e.sourcePort, 'exec_out'))
    );
    
    if (!edge) return null;

    if (context) {
      this.enqueueExecutionEntryPort(context, edge.targetNode, edge.targetPort);
    }
    
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
    const previousExecutionEntryPort = context.currentExecutionEntryPort;
    context.currentExecutionEntryPort = this.consumeExecutionEntryPort(context, node.id);

    try {
      const lines: string[] = [];
      const isEntrySensitive = this.isExecutionEntrySensitiveNode(node.type);
      const entryPortKey = context.currentExecutionEntryPort ?? '__default';

      if (isEntrySensitive) {
        const processedExecutionEntries = this.ensureProcessedExecutionEntries(context);
        const entryScopedKey = `${node.id}::${entryPortKey}`;
        if (processedExecutionEntries.has(entryScopedKey)) {
          return lines;
        }
        processedExecutionEntries.add(entryScopedKey);
        context.processedNodes.add(node.id);
      } else {
        if (context.processedNodes.has(node.id)) {
          return lines;
        }
        context.processedNodes.add(node.id);
      }

      const startLine = context.currentLine;

      const generator = this.registry.get(node.type);
      if (!generator) {
        const unsupportedLabel = this.isRussianDisplayLanguage(context)
          ? `Неподдерживаемый тип: ${node.type}`
          : `Unsupported node type: ${node.type}`;
        lines.push(`${indent(context.indentLevel, context.options.indentSize)}// ${unsupportedLabel}`);
        return lines;
      }

      // Добавить русский комментарий
      if (context.options.includeRussianComments) {
        const commentLabel = this.resolveNodeCommentLabel(node, context);
        if (commentLabel) {
          lines.push(`${indent(context.indentLevel, context.options.indentSize)}// ${commentLabel}`);
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
          const nextNode = this.getNextExecutionNodeInGraph(node, funcGraph.nodes, funcGraph.edges, context);
          if (nextNode) {
            const nextLines = this.generateFromNodeInContext(nextNode, context, helpers);
            lines.push(...nextLines);
          }
        }
      }

      return lines;
    } finally {
      context.currentExecutionEntryPort = previousExecutionEntryPort;
    }
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
          this.matchesPortSuffix(e.sourcePort, portSuffix)
        );
        
        if (!edge) return null;
        this.enqueueExecutionEntryPort(context, edge.targetNode, edge.targetPort);
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
      this.matchesPortSuffix(p.id, portSuffix)
    );
    
    if (!port) return null;
    
    const funcGraph = context.currentFunction?.graph;
    const edges = funcGraph?.edges ?? context.graph.edges;
    const nodes = funcGraph?.nodes ?? context.graph.nodes;
    
    // Найти входящую связь
    const edge = edges.find(e => 
      e.targetNode === node.id && 
      this.matchesPortSuffix(e.targetPort, portSuffix)
    );
    
    if (edge) {
      const sourceNode = nodes.find(n => n.id === edge.sourceNode);
      if (sourceNode) {
        return this.getOutputExpressionInContext(sourceNode, edge.sourcePort, context);
      }
    }
    
    // Значение по умолчанию
    if (port.value !== undefined) {
      return this.formatPortLiteral(port.value);
    }
    
    if (port.defaultValue !== undefined) {
      return this.formatPortLiteral(port.defaultValue);
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
      (this.matchesPortSuffix(p.id, 'exec-out') || this.matchesPortSuffix(p.id, 'exec_out'))
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
      this.matchesPortSuffix(e.sourcePort, portSuffix)
    );
    
    if (!edge) return null;
    this.enqueueExecutionEntryPort(context, edge.targetNode, edge.targetPort);
    
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
      this.matchesPortSuffix(p.id, portSuffix)
    );
    
    if (!port) return null;
    
    // Найти входящую связь
    const edge = context.graph.edges.find(e => 
      e.targetNode === node.id && 
      this.matchesPortSuffix(e.targetPort, portSuffix)
    );
    
    if (edge) {
      const sourceNode = context.graph.nodes.find(n => n.id === edge.sourceNode);
      if (sourceNode) {
        return this.getOutputExpression(sourceNode, edge.sourcePort, context);
      }
    }
    
    // Использовать значение по умолчанию
    if (port.value !== undefined) {
      return this.formatPortLiteral(port.value);
    }
    
    if (port.defaultValue !== undefined) {
      return this.formatPortLiteral(port.defaultValue);
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
