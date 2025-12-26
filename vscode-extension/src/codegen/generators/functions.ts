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
    const outputParams = func.parameters.filter(p => p.direction === 'output');
    
    // Определяем тип возврата
    let returnType = 'void';
    if (outputParams.length === 1) {
      returnType = portTypeToCpp(outputParams[0].dataType);
    } else if (outputParams.length > 1) {
      // Множественные выходы — используем структуру или tuple
      returnType = 'auto'; // TODO: генерировать struct
    }
    
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
    
    // Множественные выходные параметры — return tuple/struct
    // TODO: поддержка multiple returns через struct
    const values = outputParams.map(param => {
      const value = helpers.getInputExpression(node, param.id);
      return value ?? getDefaultValue(param.dataType);
    });
    
    return this.code([`${ind}return std::make_tuple(${values.join(', ')});`], false);
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
      const resultVar = `result_${node.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6)}`;
      helpers.declareVariable(`${node.id}-result`, resultVar, 'Result', 'auto', node.id);
      return this.code([`${ind}auto ${resultVar} = ${call};`], true);
    }
    
    // Нет выходов — просто вызов
    return this.code([`${ind}${call};`], true);
  }
  
  getOutputExpression(
    node: BlueprintNode,
    portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    // Возвращаем имя переменной с результатом
    if (portId.includes('exec')) {
      return ''; // execution порты не имеют значений
    }
    
    const varInfo = helpers.getVariable(`${node.id}-result`);
    if (varInfo) {
      return varInfo.codeName;
    }
    
    // Fallback
    return `result_${node.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6)}`;
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
};
