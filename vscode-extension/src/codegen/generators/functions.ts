/**
 * Генераторы для пользовательских функций (UE Blueprint-style)
 * 
 * FunctionEntry — точка входа в функцию (генерирует сигнатуру)
 * FunctionReturn — возврат из функции
 * CallUserFunction — вызов пользовательской функции
 */

import type {
  BlueprintNode,
  BlueprintNodeType,
  BlueprintFunction,
  FunctionParameter,
} from '../../shared/blueprintTypes';
import type { CodeGenContext } from '../types';
import { CodeGenWarningCode, CodeGenErrorCode } from '../types';
import {
  BaseNodeGenerator,
  GeneratorHelpers,
  NodeGenerationResult,
} from './base';
import type { PortDataType } from '../../shared/portTypes';

// ============================================
// Утилиты
// ============================================

/**
 * Преобразовать PortDataType в C++ тип
 */
function portTypeToCpp(dataType: PortDataType): string {
  const typeMap: Record<PortDataType, string> = {
    'execution': 'void',
    'bool': 'bool',
    'int32': 'int',
    'int64': 'long long',
    'float': 'float',
    'double': 'double',
    'string': 'std::string',
    'vector': 'std::vector<float>',
    'pointer': 'std::shared_ptr<void>',
    'class': 'auto',
    'any': 'auto',
    'array': 'std::vector<int>',
  };
  return typeMap[dataType] ?? 'auto';
}

/**
 * Транслитерация русских имён в валидные C++ идентификаторы
 */
function transliterate(name: string): string {
  const map: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
    'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
    'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
    'Ф': 'F', 'Х': 'H', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch',
    'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya',
    ' ': '_',
  };
  
  return name
    .split('')
    .map(char => map[char] ?? char)
    .join('')
    .replace(/[^a-zA-Z0-9_]/g, '');
}

function sanitizeIdentifierPart(value: string, fallback: string): string {
  const transliterated = transliterate(value)
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (transliterated.length === 0) {
    return fallback;
  }

  if (/^\d/.test(transliterated)) {
    return `${fallback}_${transliterated}`;
  }

  return transliterated;
}

function buildCallResultVariableName(
  node: BlueprintNode,
  functionName: string,
  outputName?: string
): string {
  const functionToken = sanitizeIdentifierPart(functionName, 'func');
  const outputToken = sanitizeIdentifierPart(outputName ?? 'result', 'result');
  const nodeTokenRaw = node.id.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const nodeToken = nodeTokenRaw.slice(Math.max(0, nodeTokenRaw.length - 4));

  return nodeToken.length > 0
    ? `result_${functionToken}_${outputToken}_${nodeToken}`
    : `result_${functionToken}_${outputToken}`;
}

// ============================================
// Интерфейс для получения функций из контекста
// ============================================

/**
 * Расширенный контекст с информацией о функциях
 */
export interface FunctionAwareContext extends CodeGenContext {
  /** Текущая функция (если генерируем код внутри функции) */
  currentFunction?: BlueprintFunction;
  /** Все функции графа */
  functions?: BlueprintFunction[];
}

/**
 * Получить функцию по ID из properties узла
 */
function getFunctionFromNode(
  node: BlueprintNode,
  context: FunctionAwareContext
): BlueprintFunction | null {
  const functionId = node.properties?.functionId as string | undefined;
  if (!functionId || !context.functions) return null;
  
  return context.functions.find(f => f.id === functionId) ?? null;
}

function matchesPortToken(portId: string, token: string): boolean {
  if (!portId || !token) {
    return false;
  }

  return (
    portId === token ||
    portId.endsWith(`-${token}`) ||
    portId.endsWith(`_${token}`) ||
    token.endsWith(`-${portId}`) ||
    token.endsWith(`_${portId}`)
  );
}

function resolveInputParameterByEntryPort(
  node: BlueprintNode,
  func: BlueprintFunction,
  portId: string
): FunctionParameter | null {
  const normalizedPortId = portId.trim();
  if (normalizedPortId.length === 0) {
    return null;
  }

  const inputParams = func.parameters.filter((parameter) => parameter.direction === 'input');
  if (inputParams.length === 0) {
    return null;
  }

  const byId = inputParams.find((parameter) => matchesPortToken(normalizedPortId, parameter.id));
  if (byId) {
    return byId;
  }

  const outputPort = node.outputs.find((port) => matchesPortToken(port.id, normalizedPortId));
  if (!outputPort) {
    return null;
  }

  const byName = inputParams.find(
    (parameter) =>
      parameter.name === outputPort.name ||
      parameter.nameRu === outputPort.name ||
      parameter.id === outputPort.name
  );
  if (byName) {
    return byName;
  }

  const outputIndex = Number.isFinite(outputPort.index) ? outputPort.index : -1;
  if (outputIndex > 0 && outputIndex - 1 < inputParams.length) {
    return inputParams[outputIndex - 1];
  }

  return null;
}

// ============================================
// Генераторы
// ============================================

/**
 * FunctionEntry — точка входа в пользовательскую функцию
 * 
 * Генерирует сигнатуру функции:
 * ```cpp
 * ReturnType functionName(int param1, float param2) {
 * ```
 * 
 * Примечание: FunctionEntry НЕ генерирует код напрямую при обходе графа main().
 * Вместо этого, CppCodeGenerator должен отдельно генерировать каждую функцию.
 */
export class FunctionEntryNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['FunctionEntry'];
  
  generate(
    node: BlueprintNode,
    context: CodeGenContext,
    _helpers: GeneratorHelpers
  ): NodeGenerationResult {
    // FunctionEntry не генерирует код при обычном обходе —
    // генерация функций происходит отдельно в CppCodeGenerator
    const funcContext = context as FunctionAwareContext;
    
    // Если мы внутри генерации функции, просто продолжаем execution flow
    if (funcContext.currentFunction) {
      return this.noop();
    }
    
    // Иначе это orphan FunctionEntry — предупреждение
    return this.noop();
  }

  getOutputExpression(
    node: BlueprintNode,
    portId: string,
    context: CodeGenContext,
    _helpers: GeneratorHelpers
  ): string {
    if (portId.includes('exec')) {
      return '';
    }

    const funcContext = context as FunctionAwareContext;
    const func = funcContext.currentFunction ?? getFunctionFromNode(node, funcContext);
    if (!func) {
      return '0';
    }

    const parameter = resolveInputParameterByEntryPort(node, func, portId);
    if (!parameter) {
      return '0';
    }

    return transliterate(parameter.name);
  }
  
  /**
   * Генерировать сигнатуру функции (вызывается из CppCodeGenerator)
   */
  static generateFunctionSignature(func: BlueprintFunction): string {
    const inputParams = func.parameters.filter(p => p.direction === 'input');

    // Определяем тип возврата
    const returnType = getFunctionReturnType(func);
    
    // Формируем параметры
    const params = inputParams.map(p => {
      const cppType = portTypeToCpp(p.dataType);
      const paramName = transliterate(p.name);
      return `${cppType} ${paramName}`;
    }).join(', ');
    
    const funcName = transliterate(func.name);
    
    return `${returnType} ${funcName}(${params})`;
  }
}

/**
 * FunctionReturn — возврат из пользовательской функции
 * 
 * Генерирует:
 * ```cpp
 *     return result;
 * }
 * ```
 */
export class FunctionReturnNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['FunctionReturn'];
  
  generate(
    node: BlueprintNode,
    context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    const funcContext = context as FunctionAwareContext;
    const func = funcContext.currentFunction ?? getFunctionFromNode(node, funcContext);
    
    if (!func) {
      helpers.addWarning(
        node.id,
        CodeGenWarningCode.EMPTY_BRANCH,
        'FunctionReturn без связанной функции'
      );
      return this.code([`${ind}return;`], false);
    }
    
    const outputParams = func.parameters.filter(p => p.direction === 'output');
    
    if (outputParams.length === 0) {
      // Нет выходных параметров — просто return
      return this.code([`${ind}return;`], false);
    }
    
    if (outputParams.length === 1) {
      // Один выходной параметр — return value
      const param = outputParams[0];
      const portSuffix = param.id;
      const value = helpers.getInputExpression(node, portSuffix);
      const returnValue = value ?? getDefaultValue(param.dataType);
      return this.code([`${ind}return ${returnValue};`], false);
    }
    
    // Множественные выходные параметры — возвращаем std::tuple
    const values = outputParams.map(param => {
      const value = helpers.getInputExpression(node, param.id);
      return value ?? getDefaultValue(param.dataType);
    });

    const resultTypeName = getFunctionResultTypeName(func);

    return this.code([`${ind}return ${resultTypeName}${buildTupleExpression(values)};`], false);
  }
}

/**
 * CallUserFunction — вызов пользовательской функции
 * 
 * Генерирует:
 * ```cpp
 *     auto result = myFunction(arg1, arg2);
 * ```
 */
export class CallUserFunctionNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['CallUserFunction'];
  
  generate(
    node: BlueprintNode,
    context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    const funcContext = context as FunctionAwareContext;
    
    const functionId = node.properties?.functionId as string | undefined;
    const functionName = node.properties?.functionName as string | undefined;
    
    if (!functionId || !functionName) {
      helpers.addError(
        node.id,
        CodeGenErrorCode.UNKNOWN_NODE_TYPE,
        'CallUserFunction без functionId',
        'CallUserFunction without functionId'
      );
      return this.code([`${ind}// Ошибка: функция не указана`], true);
    }
    
    // Получаем функцию для информации о параметрах
    const func = funcContext.functions?.find(f => f.id === functionId);
    const cppFuncName = transliterate(functionName);
    
    // Собираем аргументы
    const args: string[] = [];
    
    if (func) {
      const inputParams = func.parameters.filter(p => p.direction === 'input');
      for (const param of inputParams) {
        const value = helpers.getInputExpression(node, param.id);
        args.push(value ?? getDefaultValue(param.dataType));
      }
    } else {
      // Функция не найдена — пытаемся собрать аргументы из портов
      const dataPorts = node.inputs.filter(p => p.dataType !== 'execution');
      for (const port of dataPorts) {
        const portSuffix = port.id.split('-').slice(-1)[0];
        const value = helpers.getInputExpression(node, portSuffix);
        if (value !== null) {
          args.push(value);
        }
      }
    }
    
    const call = `${cppFuncName}(${args.join(', ')})`;
    
    // Проверяем, есть ли выходные параметры
    const hasOutputs = func 
      ? func.parameters.some(p => p.direction === 'output')
      : node.outputs.some(p => p.dataType !== 'execution');
    
    if (hasOutputs) {
      // Генерируем присваивание результата
      const firstOutputName = func?.parameters.find((parameter) => parameter.direction === 'output')?.name
        ?? node.outputs.find((port) => port.dataType !== 'execution')?.name
        ?? 'result';
      const resultVar = buildCallResultVariableName(node, functionName, firstOutputName);
      helpers.declareVariable(`${node.id}-result`, resultVar, 'Result', 'auto', node.id);

      const lines = [`${ind}auto ${resultVar} = ${call};`];
      const outputParams = func?.parameters.filter(p => p.direction === 'output') ?? [];

      if (outputParams.length > 1) {
        outputParams.forEach((param, index) => {
          const outputVar = getOutputVariableName(node, index, param.name);
          helpers.declareVariable(`${node.id}-result-${param.id}`, outputVar, param.name, 'auto', node.id);
          lines.push(`${ind}auto ${outputVar} = std::get<${index}>(${resultVar});`);
        });
      }

      return this.code(lines, true);
    }
    
    // Нет выходов — просто вызов
    return this.code([`${ind}${call};`], true);
  }
  
  getOutputExpression(
    node: BlueprintNode,
    portId: string,
    context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    if (portId.includes('exec')) {
      return ''; // execution порты не имеют значений
    }

    const funcContext = context as FunctionAwareContext;
    const functionId = node.properties?.functionId as string | undefined;
    const func = functionId
      ? funcContext.functions?.find(f => f.id === functionId)
      : null;

    const varInfo = helpers.getVariable(`${node.id}-result`);
    const resultVar = varInfo?.codeName ?? getResultVariableName(node);

    if (!func) {
      return resultVar;
    }
    
    // Fallback
    const functionName = typeof node.properties?.functionName === 'string'
      ? node.properties.functionName
      : 'func';
    const outputName = node.outputs.find((port) =>
      port.id === portId ||
      port.id.endsWith(`-${portId}`) ||
      port.name === portId
    )?.name;
    return buildCallResultVariableName(node, functionName, outputName);
  }
}

// ============================================
// Вспомогательные функции
// ============================================

/**
 * Получить значение по умолчанию для типа
 */
function getDefaultValue(dataType: PortDataType): string {
  const defaults: Record<PortDataType, string> = {
    'execution': '',
    'bool': 'false',
    'int32': '0',
    'int64': '0LL',
    'float': '0.0f',
    'double': '0.0',
    'string': '""',
    'vector': '{}',
    'pointer': 'nullptr',
    'class': '{}',
    'any': '{}',
    'array': '{}',
  };
  return defaults[dataType] ?? '0';
}

/**
 * Фабричная функция для создания всех генераторов функций
 */
export function createFunctionGenerators(): BaseNodeGenerator[] {
  return [
    new FunctionEntryNodeGenerator(),
    new FunctionReturnNodeGenerator(),
    new CallUserFunctionNodeGenerator(),
  ];
}

// ============================================
// Экспорт утилит для CppCodeGenerator
// ============================================

export {
  portTypeToCpp,
  transliterate,
  getDefaultValue,
  getFunctionResultTypeName,
  generateFunctionResultTypeDeclaration,
  buildTupleExpression,
};
