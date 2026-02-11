/**
 * Генераторы для пользовательских функций (UE Blueprint-style)
 * 
 * FunctionEntry — точка входа в функцию (генерирует сигнатуру)
 * FunctionReturn — возврат из функции
 * CallUserFunction — вызов пользовательской функции
 */

import type { BlueprintNode, BlueprintNodeType, BlueprintFunction } from '../../shared/blueprintTypes';
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
    'object': 'void*',
    'pointer': 'void*',
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



/**
 * C++ тип возврата для функции с учётом multiple return
 */
function getFunctionReturnType(func: BlueprintFunction): string {
  const outputParams = func.parameters.filter(p => p.direction === 'output');

  if (outputParams.length === 0) {
    return 'void';
  }

  if (outputParams.length === 1) {
    return portTypeToCpp(outputParams[0].dataType);
  }

  return getFunctionResultTypeName(func);
}

/**
 * Получить имя C++ типа результата для функции с несколькими output
 */
function getFunctionResultTypeName(func: BlueprintFunction): string {
  return `${transliterate(func.name)}Result`;
}

/**
 * Сгенерировать объявление именованного типа результата функции
 */
function generateFunctionResultTypeDeclaration(func: BlueprintFunction): string | null {
  const outputParams = func.parameters.filter(p => p.direction === 'output');
  if (outputParams.length <= 1) {
    return null;
  }

  const outputTypes = outputParams.map(param => portTypeToCpp(param.dataType));
  const resultTypeName = getFunctionResultTypeName(func);
  return `using ${resultTypeName} = std::tuple<${outputTypes.join(', ')}>;`;
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

function getResultVariableName(node: BlueprintNode): string {
  return `result_${node.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6)}`;
}

function getOutputIndexByPort(
  node: BlueprintNode,
  func: BlueprintFunction,
  portId: string
): number {
  const outputParams = func.parameters.filter(p => p.direction === 'output');
  const normalizedPortId = portId.split('-').slice(-1)[0] ?? portId;

  const parameterIndex = outputParams.findIndex(param =>
    portId === param.id ||
    normalizedPortId === param.id ||
    portId.endsWith(`-${param.id}`)
  );
  if (parameterIndex >= 0) {
    return parameterIndex;
  }

  const nodeOutputPorts = node.outputs
    .filter(port => port.dataType !== 'execution')
    .sort((a, b) => a.index - b.index);
  const nodePortIndex = nodeOutputPorts.findIndex(port =>
    port.id === portId ||
    port.id.endsWith(`-${normalizedPortId}`) ||
    port.name === normalizedPortId
  );

  return nodePortIndex;
}

function getOutputVariableName(node: BlueprintNode, outputIndex: number, parameterName?: string): string {
  const baseName = parameterName ? transliterate(parameterName) : `out${outputIndex + 1}`;
  const sanitizedBaseName = baseName.length > 0 ? baseName : `out${outputIndex + 1}`;
  const suffix = node.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6);
  return `${sanitizedBaseName}_${suffix}`;
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

    return this.code([`${ind}return ${resultTypeName}{${values.join(', ')}};`], false);
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
      const resultVar = getResultVariableName(node);
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

    const outputParams = func.parameters.filter(p => p.direction === 'output');
    if (outputParams.length <= 1) {
      return resultVar;
    }

    const outputIndex = getOutputIndexByPort(node, func, portId);
    if (outputIndex < 0) {
      return resultVar;
    }

    const outputParam = outputParams[outputIndex];
    const outputVarInfo = helpers.getVariable(`${node.id}-result-${outputParam.id}`);
    if (outputVarInfo) {
      return outputVarInfo.codeName;
    }

    return `std::get<${outputIndex}>(${resultVar})`;
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
    'object': 'nullptr',
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
};
