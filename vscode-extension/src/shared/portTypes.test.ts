/**
 * Тесты для portTypes — типы данных портов и проверка совместимости
 */

import { describe, expect, it } from 'vitest';
import {
  areTypesCompatible,
  getTypeDisplayName,
  PORT_TYPE_COLORS,
  PORT_TYPE_ICONS,
  PortDataType,
} from './portTypes';

describe('portTypes', () => {
  describe('PORT_TYPE_COLORS', () => {
    it('должен содержать цвета для всех типов', () => {
      const types: PortDataType[] = [
        'execution', 'bool', 'int32', 'int64', 'float', 'double',
        'string', 'vector', 'object', 'array', 'any'
      ];
      
      for (const type of types) {
        expect(PORT_TYPE_COLORS[type]).toBeDefined();
        expect(PORT_TYPE_COLORS[type].main).toBeDefined();
        expect(PORT_TYPE_COLORS[type].light).toBeDefined();
        expect(PORT_TYPE_COLORS[type].dark).toBeDefined();
      }
    });
    
    it('execution должен быть белым', () => {
      expect(PORT_TYPE_COLORS.execution.main).toBe('#FFFFFF');
    });
  });
  
  describe('PORT_TYPE_ICONS', () => {
    it('должен содержать иконки для всех типов', () => {
      const types: PortDataType[] = [
        'execution', 'bool', 'int32', 'int64', 'float', 'double',
        'string', 'vector', 'object', 'array', 'any'
      ];
      
      for (const type of types) {
        expect(PORT_TYPE_ICONS[type]).toBeDefined();
        expect(typeof PORT_TYPE_ICONS[type]).toBe('string');
      }
    });
  });
  
  describe('areTypesCompatible', () => {
    describe('одинаковые типы', () => {
      it('должен возвращать true для одинаковых типов', () => {
        expect(areTypesCompatible('int32', 'int32')).toBe(true);
        expect(areTypesCompatible('string', 'string')).toBe(true);
        expect(areTypesCompatible('execution', 'execution')).toBe(true);
        expect(areTypesCompatible('bool', 'bool')).toBe(true);
      });
    });
    
    describe('any тип', () => {
      it('any совместим со всеми типами данных', () => {
        expect(areTypesCompatible('any', 'int32')).toBe(true);
        expect(areTypesCompatible('any', 'string')).toBe(true);
        expect(areTypesCompatible('any', 'bool')).toBe(true);
        expect(areTypesCompatible('any', 'object')).toBe(true);
        
        expect(areTypesCompatible('int32', 'any')).toBe(true);
        expect(areTypesCompatible('string', 'any')).toBe(true);
      });
      
      it('any НЕ совместим с execution', () => {
        expect(areTypesCompatible('any', 'execution')).toBe(false);
        expect(areTypesCompatible('execution', 'any')).toBe(false);
      });
    });
    
    describe('execution тип', () => {
      it('execution совместим только с execution', () => {
        expect(areTypesCompatible('execution', 'execution')).toBe(true);
        expect(areTypesCompatible('execution', 'int32')).toBe(false);
        expect(areTypesCompatible('execution', 'string')).toBe(false);
        expect(areTypesCompatible('int32', 'execution')).toBe(false);
      });
    });
    
    describe('числовые типы', () => {
      it('числовые типы совместимы между собой', () => {
        expect(areTypesCompatible('int32', 'float')).toBe(true);
        expect(areTypesCompatible('float', 'int32')).toBe(true);
        expect(areTypesCompatible('int64', 'double')).toBe(true);
        expect(areTypesCompatible('double', 'int64')).toBe(true);
        expect(areTypesCompatible('int32', 'int64')).toBe(true);
        expect(areTypesCompatible('float', 'double')).toBe(true);
      });
    });
    
    describe('bool преобразования', () => {
      it('bool может конвертироваться в числовые типы', () => {
        expect(areTypesCompatible('bool', 'int32')).toBe(true);
        expect(areTypesCompatible('bool', 'float')).toBe(true);
        expect(areTypesCompatible('bool', 'double')).toBe(true);
      });
      
      it('числа НЕ конвертируются в bool неявно', () => {
        expect(areTypesCompatible('int32', 'bool')).toBe(false);
        expect(areTypesCompatible('float', 'bool')).toBe(false);
      });
    });
    
    describe('string преобразования', () => {
      it('всё может конвертироваться в string', () => {
        expect(areTypesCompatible('int32', 'string')).toBe(true);
        expect(areTypesCompatible('float', 'string')).toBe(true);
        expect(areTypesCompatible('bool', 'string')).toBe(true);
        expect(areTypesCompatible('object', 'string')).toBe(true);
        expect(areTypesCompatible('array', 'string')).toBe(true);
        expect(areTypesCompatible('vector', 'string')).toBe(true);
      });
      
      it('string НЕ конвертируется в другие типы неявно', () => {
        expect(areTypesCompatible('string', 'int32')).toBe(false);
        expect(areTypesCompatible('string', 'bool')).toBe(false);
        expect(areTypesCompatible('string', 'object')).toBe(false);
      });
    });
    
    describe('несовместимые типы', () => {
      it('object и array несовместимы с числами', () => {
        expect(areTypesCompatible('object', 'int32')).toBe(false);
        expect(areTypesCompatible('array', 'float')).toBe(false);
        expect(areTypesCompatible('int32', 'object')).toBe(false);
      });
      
      it('vector несовместим с числами', () => {
        expect(areTypesCompatible('vector', 'int32')).toBe(false);
        expect(areTypesCompatible('int32', 'vector')).toBe(false);
      });
    });
  });
  
  describe('getTypeDisplayName', () => {
    it('должен возвращать читаемые имена для всех типов', () => {
      expect(getTypeDisplayName('execution')).toBe('Exec');
      expect(getTypeDisplayName('bool')).toBe('Boolean');
      expect(getTypeDisplayName('int32')).toBe('Integer');
      expect(getTypeDisplayName('int64')).toBe('Integer64');
      expect(getTypeDisplayName('float')).toBe('Float');
      expect(getTypeDisplayName('double')).toBe('Double');
      expect(getTypeDisplayName('string')).toBe('String');
      expect(getTypeDisplayName('vector')).toBe('Vector');
      expect(getTypeDisplayName('object')).toBe('Object');
      expect(getTypeDisplayName('array')).toBe('Array');
      expect(getTypeDisplayName('any')).toBe('Wildcard');
    });
  });
});
