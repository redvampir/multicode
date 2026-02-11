/**
 * Модуль кодогенерации MultiCode
 * 
 * Экспортирует типы и генераторы для создания C++ кода из визуального графа.
 */

// Типы и интерфейсы
export type {
  ICodeGenerator,
  INodeCodeGenerator,
  CodeGenerationResult,
  CodeGenContext,
  CodeGenOptions,
  CodeGenError,
  CodeGenWarning,
  VariableInfo,
  SourceMapEntry,
} from './types';

export {
  CodeGenErrorCode,
  CodeGenWarningCode,
  DEFAULT_CODEGEN_OPTIONS,
  indent,
  transliterate,
  toValidIdentifier,
  getCppType,
  getDefaultValue,
} from './types';

// Генераторы
export { CppCodeGenerator } from './CppCodeGenerator';

export {
  createGenerator,
  UnsupportedLanguageError,
  getUnsupportedLanguageMessages,
  createUnsupportedLanguageError,
} from './factory';
