/**
 * Типы и интерфейсы для кодогенерации
 * 
 * Кодогенератор создаёт C++ код из визуального графа.
 * Поддерживает русские названия узлов — они сохраняются в комментариях.
 */

import type { BlueprintGraphState, BlueprintNode, BlueprintNodeType, BlueprintFunction } from '../shared/blueprintTypes';
import type { GraphLanguage } from '../shared/blueprintTypes';
import type { TypeConversionHelperId } from '../shared/typeConversions';

/** Ошибка генерации кода */
export interface CodeGenError {
  /** ID узла, вызвавшего ошибку */
  nodeId: string;
  /** Код ошибки */
  code: CodeGenErrorCode;
  /** Сообщение на русском */
  message: string;
  /** Сообщение на английском */
  messageEn: string;
}

/** Предупреждение генерации */
export interface CodeGenWarning {
  /** ID узла */
  nodeId?: string;
  /** Код предупреждения */
  code: CodeGenWarningCode;
  /** Сообщение на русском */
  message: string;
}

/** Коды ошибок */
export enum CodeGenErrorCode {
  /** Узел Start не найден */
  NO_START_NODE = 'NO_START_NODE',
  /** Множественные узлы Start */
  MULTIPLE_START_NODES = 'MULTIPLE_START_NODES',
  /** Обнаружен цикл в execution flow */
  CYCLE_DETECTED = 'CYCLE_DETECTED',
  /** Неподключённый обязательный порт */
  UNCONNECTED_REQUIRED_PORT = 'UNCONNECTED_REQUIRED_PORT',
  /** Неизвестный тип узла */
  UNKNOWN_NODE_TYPE = 'UNKNOWN_NODE_TYPE',
  /** Тип узла известен, но генерация для него ещё не реализована */
  UNIMPLEMENTED_NODE_TYPE = 'UNIMPLEMENTED_NODE_TYPE',
  /** Несовместимые типы данных */
  TYPE_MISMATCH = 'TYPE_MISMATCH',
  /** Недостижимый узел */
  UNREACHABLE_NODE = 'UNREACHABLE_NODE',
  /** Язык кодогенерации не поддерживается */
  UNSUPPORTED_LANGUAGE = 'UNSUPPORTED_LANGUAGE',
  /** Внешний символ не найден в индексе */
  EXTERNAL_SYMBOL_NOT_FOUND = 'EXTERNAL_SYMBOL_NOT_FOUND',
  /** Хэш сигнатуры внешнего символа не совпадает */
  EXTERNAL_SYMBOL_SIGNATURE_MISMATCH = 'EXTERNAL_SYMBOL_SIGNATURE_MISMATCH',
  /** Конструкция не поддерживается target-ом Unreal Engine */
  UE_UNSUPPORTED_CONSTRUCT = 'UE_UNSUPPORTED_CONSTRUCT',
}

/** Коды предупреждений */
export enum CodeGenWarningCode {
  /** Узел не используется */
  UNUSED_NODE = 'UNUSED_NODE',
  /** Переменная не инициализирована */
  UNINITIALIZED_VARIABLE = 'UNINITIALIZED_VARIABLE',
  /** Переменная из switch(init; expr) не используется */
  UNUSED_SWITCH_INIT = 'UNUSED_SWITCH_INIT',
  /** Пустая ветка условия */
  EMPTY_BRANCH = 'EMPTY_BRANCH',
  /** Бесконечный цикл (условие всегда true) */
  INFINITE_LOOP = 'INFINITE_LOOP',
  /** Выбран язык, который пока не поддерживается генератором */
  UNSUPPORTED_LANGUAGE = 'UNSUPPORTED_LANGUAGE',
}

/** Маппинг узел → строки кода */
export interface SourceMapEntry {
  /** ID узла */
  nodeId: string;
  /** Начальная строка (1-based) */
  startLine: number;
  /** Конечная строка (1-based) */
  endLine: number;
}

/** Результат генерации кода */
export interface CodeGenerationResult {
  /** Успешность генерации */
  success: boolean;
  /** Сгенерированный код */
  code: string;
  /** Ошибки (если success = false) */
  errors: CodeGenError[];
  /** Предупреждения */
  warnings: CodeGenWarning[];
  /** Маппинг узлов на строки кода */
  sourceMap: SourceMapEntry[];
  /** Статистика */
  stats: {
    /** Количество обработанных узлов */
    nodesProcessed: number;
    /** Количество строк кода */
    linesOfCode: number;
    /** Время генерации (мс) */
    generationTimeMs: number;
  };
}

/** Опции генерации */
export interface CodeGenOptions {
  /** Добавлять комментарии с русскими названиями узлов */
  includeRussianComments: boolean;
  /** Добавлять маркеры multicode:begin/end */
  includeSourceMarkers: boolean;
  /** Имя графа для маркеров */
  graphName?: string;
  /** Уровень отступа (пробелы) */
  indentSize: number;
  /** Добавлять #include заголовки */
  includeHeaders: boolean;
  /** Генерировать main() обёртку */
  generateMainWrapper: boolean;
  /** Генерировать объявления/определения классов из IR */
  generateClassDeclarations?: boolean;
  /** Режим вывода class-блоков */
  classEmissionMode?: 'combined' | 'declarations-only' | 'definitions-only' | 'none';
  /** Выводить ли body графа (узлы/функции/main). Для header-режима может быть отключено */
  emitGraphBody?: boolean;
  /** Принудительные include (например, #include "MyClass.hpp"), вставляются в начало include-блока */
  forcedIncludes?: string[];
}

/** Опции по умолчанию */
export const DEFAULT_CODEGEN_OPTIONS: CodeGenOptions = {
  includeRussianComments: true,
  includeSourceMarkers: false,
  indentSize: 4,
  includeHeaders: true,
  generateMainWrapper: true,
  generateClassDeclarations: true,
  classEmissionMode: 'combined',
  emitGraphBody: true,
  forcedIncludes: [],
};

/** Контекст генерации (передаётся между узлами) */
export interface CodeGenContext {
  /** Текущий граф */
  graph: BlueprintGraphState;
  /** Опции генерации */
  options: CodeGenOptions;
  /** Уровень вложенности (для отступов) */
  indentLevel: number;
  /** Объявленные переменные */
  declaredVariables: Map<string, VariableInfo>;
  /** Инициализаторы объявленных переменных (alias -> expr) */
  declaredVariableInitializers?: Map<string, string>;
  /** Обработанные узлы (для предотвращения повторов) */
  processedNodes: Set<string>;
  /** Обработанные входы execution для узлов, у которых поведение зависит от входного порта */
  processedExecutionEntries?: Set<string>;
  /** Очередь ожидаемых targetPort для последующих вызовов generateFromNode */
  pendingExecutionEntryPorts?: Map<string, string[]>;
  /** Текущий execution-вход узла (targetPort), через который узел был вызван */
  currentExecutionEntryPort?: string;
  /** Ошибки */
  errors: CodeGenError[];
  /** Предупреждения */
  warnings: CodeGenWarning[];
  /** Source map */
  sourceMap: SourceMapEntry[];
  /** Текущая строка кода */
  currentLine: number;
  /** Текущая функция (при генерации тела функции) */
  currentFunction?: BlueprintFunction;
  /** Все функции графа */
  functions?: BlueprintFunction[];
  /** Количество выполненных Set-записей по переменным (для подавления дублирующих first Set) */
  variableWriteCounts?: Map<string, number>;
  /** Набор helper-функций, которые нужно сгенерировать в C++ прологе */
  requiredHelpers?: Set<TypeConversionHelperId>;
  /** Список поддерживаемых типов узлов (для fallback-диагностики) */
  supportedNodeTypes?: BlueprintNodeType[];
}

/** Информация о переменной */
export interface VariableInfo {
  /** Имя переменной в коде */
  codeName: string;
  /** Оригинальное имя (может быть русским) */
  originalName: string;
  /** Тип данных C++ */
  cppType: string;
  /** ID узла, создавшего переменную */
  nodeId: string;
}

/** Интерфейс генератора кода */
export interface ICodeGenerator {
  /** Генерировать код из графа */
  generate(graph: BlueprintGraphState, options?: Partial<CodeGenOptions>): CodeGenerationResult;
  
  /** Получить поддерживаемые типы узлов */
  getSupportedNodeTypes(): BlueprintNodeType[];
  
  /** Получить целевой язык */
  getLanguage(): GraphLanguage;
  
  /** Проверить возможность генерации */
  canGenerate(graph: BlueprintGraphState): { canGenerate: boolean; errors: CodeGenError[] };
}

/** Генератор для отдельного типа узла */
export interface INodeCodeGenerator {
  /** Тип узла */
  nodeType: BlueprintNodeType;
  
  /** Генерировать код для узла */
  generate(node: BlueprintNode, context: CodeGenContext): string[];
  
  /** Получить выражение для выходного порта */
  getOutputExpression?(node: BlueprintNode, portId: string, context: CodeGenContext): string;
}

/** Вспомогательные функции */

/** Создать отступ */
export function indent(level: number, size: number = 4): string {
  return ' '.repeat(level * size);
}

/** Транслитерация русского текста в латиницу для идентификаторов */
export function transliterate(text: string): string {
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
  };
  
  return text.split('').map(char => map[char] ?? char).join('');
}

/** Преобразовать текст в валидный C++ идентификатор */
export function toValidIdentifier(text: string): string {
  // Транслитерация
  let result = transliterate(text);
  
  // Заменить пробелы на подчёркивания
  result = result.replace(/\s+/g, '_');
  
  // Удалить недопустимые символы
  result = result.replace(/[^a-zA-Z0-9_]/g, '');
  
  // Если начинается с цифры, добавить префикс
  if (/^[0-9]/.test(result)) {
    result = 'var_' + result;
  }
  
  // Если пустая строка, использовать дефолтное имя
  if (!result) {
    result = 'unnamed';
  }
  
  return result.toLowerCase();
}

/** Получить C++ тип для PortDataType */
export function getCppType(dataType: string, vectorElementType?: string): string {
  const vectorElementTypeMap: Record<string, string> = {
    bool: 'bool',
    int32: 'int',
    int64: 'long long',
    float: 'float',
    double: 'double',
    string: 'std::string',
  };
  const resolvedVectorElementType = vectorElementTypeMap[vectorElementType ?? '']
    ?? vectorElementTypeMap.double;
  const typeMap: Record<string, string> = {
    'execution': 'void',
    'bool': 'bool',
    'int32': 'int',
    'int64': 'long long',
    'float': 'double',
    'double': 'double',
    'string': 'std::string',
    'vector': `std::vector<${resolvedVectorElementType}>`,
    'pointer': 'std::shared_ptr<void>',  // Умный указатель
    'class': 'auto',                      // Класс по значению (требуется typeName)
    'object-reference': 'auto',
    'array': 'std::vector<int>',
    'any': 'auto',
  };
  
  return typeMap[dataType] ?? 'auto';
}

/** Нормализовать ранг массива (legacy boolean поддерживается как rank=1) */
export function normalizeArrayRank(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = Math.trunc(value);
    return normalized > 0 ? normalized : 0;
  }
  return value === true ? 1 : 0;
}

/** Получить C++ тип для переменной с учётом ранга массива */
export function getCppVariableType(
  dataType: string,
  vectorElementType?: string,
  arrayRank: number | boolean = 0
): string {
  const baseType = getCppType(dataType, vectorElementType);
  const normalizedArrayRank = normalizeArrayRank(arrayRank);
  if (normalizedArrayRank === 0) {
    return baseType;
  }

  if (dataType === 'execution') {
    return baseType;
  }

  let wrappedType = baseType;
  for (let depth = 0; depth < normalizedArrayRank; depth += 1) {
    wrappedType = `std::vector<${wrappedType}>`;
  }
  return wrappedType;
}

/** Получить значение по умолчанию для типа */
export function getDefaultValue(dataType: string): string {
  const defaults: Record<string, string> = {
    'bool': 'false',
    'int32': '0',
    'int64': '0LL',
    'float': '0.0',
    'double': '0.0',
    'string': '""',
    'vector': '{}',
    'pointer': 'nullptr',  // Умный указатель по умолчанию nullptr
    'class': '{}',         // Класс - default constructor
    'array': '{}',
  };
  
  return defaults[dataType] ?? '{}';
}
