/**
 * Тесты для codegen/index.ts — реэкспорты модуля кодогенерации
 */

import { describe, it, expect } from 'vitest';

// Тестируем что все экспорты доступны
import {
  // Типы (проверяем что можно импортировать) — используем в type assertions
  type ICodeGenerator,
  type CodeGenOptions,
  // Значения
  CodeGenErrorCode,
  CodeGenWarningCode,
  DEFAULT_CODEGEN_OPTIONS,
  indent,
  transliterate,
  toValidIdentifier,
  getCppType,
  getDefaultValue,
  // Генератор
  CppCodeGenerator,
} from './index';

describe('codegen/index', () => {
  describe('экспорты типов', () => {
    it('должен экспортировать CodeGenErrorCode enum', () => {
      expect(CodeGenErrorCode).toBeDefined();
      expect(CodeGenErrorCode.UNKNOWN_NODE_TYPE).toBe('UNKNOWN_NODE_TYPE');
      expect(CodeGenErrorCode.NO_START_NODE).toBe('NO_START_NODE');
      expect(CodeGenErrorCode.CYCLE_DETECTED).toBe('CYCLE_DETECTED');
    });

    it('должен экспортировать CodeGenWarningCode enum', () => {
      expect(CodeGenWarningCode).toBeDefined();
      expect(CodeGenWarningCode.UNUSED_NODE).toBe('UNUSED_NODE');
      expect(CodeGenWarningCode.EMPTY_BRANCH).toBe('EMPTY_BRANCH');
    });

    it('должен экспортировать DEFAULT_CODEGEN_OPTIONS', () => {
      expect(DEFAULT_CODEGEN_OPTIONS).toBeDefined();
      expect(DEFAULT_CODEGEN_OPTIONS.includeRussianComments).toBe(true);
      expect(DEFAULT_CODEGEN_OPTIONS.indentSize).toBe(4);
      expect(DEFAULT_CODEGEN_OPTIONS.includeHeaders).toBe(true);
      expect(DEFAULT_CODEGEN_OPTIONS.generateMainWrapper).toBe(true);
    });
  });

  describe('экспорты утилит', () => {
    describe('indent', () => {
      it('должен создавать отступ заданного уровня', () => {
        expect(indent(0)).toBe('');
        expect(indent(1)).toBe('    '); // 4 пробела по умолчанию
        expect(indent(2)).toBe('        '); // 8 пробелов
      });

      it('должен использовать кастомный размер отступа', () => {
        expect(indent(1, 2)).toBe('  ');
        expect(indent(2, 2)).toBe('    ');
        expect(indent(1, 8)).toBe('        ');
      });
    });

    describe('transliterate', () => {
      it('должен транслитерировать русский текст', () => {
        expect(transliterate('Привет')).toBe('Privet');
        expect(transliterate('Мир')).toBe('Mir');
        expect(transliterate('привет')).toBe('privet');
      });

      it('должен оставлять английский текст без изменений', () => {
        expect(transliterate('Hello')).toBe('Hello');
        expect(transliterate('World')).toBe('World');
      });

      it('должен обрабатывать смешанный текст', () => {
        expect(transliterate('Hello Мир')).toBe('Hello Mir');
      });

      it('должен обрабатывать специальные русские буквы', () => {
        expect(transliterate('Ёж')).toBe('Yozh');
        expect(transliterate('Щука')).toBe('Schuka');
        expect(transliterate('Цапля')).toBe('Tsaplya');
      });

      it('должен игнорировать ъ и ь', () => {
        expect(transliterate('подъезд')).toBe('podezd');
        expect(transliterate('мышь')).toBe('mysh');
      });
    });

    describe('toValidIdentifier', () => {
      it('должен создавать валидный C++ идентификатор', () => {
        expect(toValidIdentifier('myVar')).toBe('myvar');
        expect(toValidIdentifier('my-var')).toBe('myvar');
        expect(toValidIdentifier('my var')).toBe('my_var');
      });

      it('должен добавлять префикс если начинается с цифры', () => {
        expect(toValidIdentifier('123abc')).toBe('var_123abc');
        expect(toValidIdentifier('1test')).toBe('var_1test');
      });

      it('должен транслитерировать русские символы', () => {
        const result = toValidIdentifier('Переменная');
        expect(result).toBe('peremennaya');
        expect(result).toMatch(/^[a-z_][a-z0-9_]*$/);
      });

      it('должен удалять специальные символы', () => {
        expect(toValidIdentifier('test@#$%')).toBe('test');
        expect(toValidIdentifier('var!')).toBe('var');
      });

      it('должен возвращать unnamed для пустой строки', () => {
        expect(toValidIdentifier('')).toBe('unnamed');
        expect(toValidIdentifier('!@#$%')).toBe('unnamed');
      });
    });

    describe('getCppType', () => {
      it('должен возвращать C++ тип для базовых типов', () => {
        expect(getCppType('bool')).toBe('bool');
        expect(getCppType('int32')).toBe('int');
        expect(getCppType('float')).toBe('double');
        expect(getCppType('string')).toBe('std::string');
      });

      it('должен возвращать void для execution', () => {
        expect(getCppType('execution')).toBe('void');
      });

      it('должен возвращать контейнерные типы', () => {
        expect(getCppType('vector')).toBe('std::vector<double>');
        expect(getCppType('array')).toBe('std::vector<int>');
      });

      it('должен возвращать auto для неизвестных типов', () => {
        expect(getCppType('unknown')).toBe('auto');
        expect(getCppType('any')).toBe('auto');
      });
    });

    describe('getDefaultValue', () => {
      it('должен возвращать значения по умолчанию для типов', () => {
        expect(getDefaultValue('bool')).toBe('false');
        expect(getDefaultValue('int32')).toBe('0');
        expect(getDefaultValue('float')).toBe('0.0');
        expect(getDefaultValue('string')).toBe('""');
      });

      it('должен возвращать {} для контейнеров', () => {
        expect(getDefaultValue('vector')).toBe('{}');
        expect(getDefaultValue('array')).toBe('{}');
      });

      it('должен возвращать {} для неизвестных типов', () => {
        expect(getDefaultValue('unknown')).toBe('{}');
      });
    });
  });

  describe('экспорт CppCodeGenerator', () => {
    it('должен экспортировать класс CppCodeGenerator', () => {
      expect(CppCodeGenerator).toBeDefined();
      expect(typeof CppCodeGenerator).toBe('function');
    });

    it('должен позволять создавать экземпляр', () => {
      const generator = new CppCodeGenerator();
      expect(generator).toBeInstanceOf(CppCodeGenerator);
    });

    it('экземпляр должен иметь метод generate', () => {
      const generator = new CppCodeGenerator();
      expect(typeof generator.generate).toBe('function');
    });

    it('экземпляр должен иметь метод getSupportedNodeTypes', () => {
      const generator = new CppCodeGenerator();
      expect(typeof generator.getSupportedNodeTypes).toBe('function');
    });

    it('экземпляр должен иметь метод getLanguage', () => {
      const generator = new CppCodeGenerator();
      expect(typeof generator.getLanguage).toBe('function');
      expect(generator.getLanguage()).toBe('cpp');
    });

    it('экземпляр должен иметь метод canGenerate', () => {
      const generator = new CppCodeGenerator();
      expect(typeof generator.canGenerate).toBe('function');
    });
  });

  describe('согласованность типов', () => {
    it('DEFAULT_CODEGEN_OPTIONS должен соответствовать CodeGenOptions', () => {
      const options: CodeGenOptions = DEFAULT_CODEGEN_OPTIONS;
      expect(options.includeRussianComments).toBeDefined();
      expect(options.indentSize).toBeDefined();
      expect(options.includeHeaders).toBeDefined();
      expect(options.generateMainWrapper).toBeDefined();
    });

    it('CppCodeGenerator должен реализовывать ICodeGenerator', () => {
      const generator: ICodeGenerator = new CppCodeGenerator();
      expect(typeof generator.generate).toBe('function');
      expect(typeof generator.getSupportedNodeTypes).toBe('function');
      expect(typeof generator.getLanguage).toBe('function');
      expect(typeof generator.canGenerate).toBe('function');
    });

    it('CodeGenErrorCode должен содержать все необходимые коды', () => {
      expect(CodeGenErrorCode.NO_START_NODE).toBeDefined();
      expect(CodeGenErrorCode.MULTIPLE_START_NODES).toBeDefined();
      expect(CodeGenErrorCode.CYCLE_DETECTED).toBeDefined();
      expect(CodeGenErrorCode.UNCONNECTED_REQUIRED_PORT).toBeDefined();
      expect(CodeGenErrorCode.UNKNOWN_NODE_TYPE).toBeDefined();
      expect(CodeGenErrorCode.TYPE_MISMATCH).toBeDefined();
      expect(CodeGenErrorCode.UNREACHABLE_NODE).toBeDefined();
    });

    it('CodeGenWarningCode должен содержать все необходимые коды', () => {
      expect(CodeGenWarningCode.UNUSED_NODE).toBeDefined();
      expect(CodeGenWarningCode.UNINITIALIZED_VARIABLE).toBeDefined();
      expect(CodeGenWarningCode.EMPTY_BRANCH).toBeDefined();
      expect(CodeGenWarningCode.INFINITE_LOOP).toBeDefined();
    });
  });
});
