import { describe, expect, it } from 'vitest';
import {
  TYPE_CONVERSION_RULES,
  TYPE_CONVERSION_RULES_BY_STAGE,
  applyTypeConversionTemplate,
  canDirectlyConnectDataPorts,
  findTypeConversionRule,
  findTypeConversionRuleById,
  formatIncompatiblePortMessage,
  formatIncompatibleTypeMessage,
  formatTypeConversionLabel,
  getTypeLabelForMessage,
  validateDataPortCompatibility,
} from './typeConversions';

describe('typeConversions', () => {
  it('contains complete Stage 1-4 conversion catalog', () => {
    expect(TYPE_CONVERSION_RULES).toHaveLength(38);
    expect(TYPE_CONVERSION_RULES_BY_STAGE[1]).toHaveLength(12);
    expect(TYPE_CONVERSION_RULES_BY_STAGE[2]).toHaveLength(8);
    expect(TYPE_CONVERSION_RULES_BY_STAGE[3]).toHaveLength(10);
    expect(TYPE_CONVERSION_RULES_BY_STAGE[4]).toHaveLength(8);

    expect(findTypeConversionRule('int32', 'double')?.id).toBe('int32_to_double');
    expect(findTypeConversionRule('string', 'int64')?.id).toBe('string_to_int64');
    expect(findTypeConversionRule('string', 'bool')?.id).toBe('string_to_bool');
    expect(findTypeConversionRule('pointer', 'string')?.id).toBe('pointer_to_string');
    expect(findTypeConversionRule('string', 'array')?.id).toBe('string_to_array');
    expect(findTypeConversionRule('object-reference', 'string')?.id).toBe('object-reference_to_string');
  });

  it('returns null for unsupported conversion', () => {
    expect(findTypeConversionRule('bool', 'pointer')).toBeNull();
    expect(findTypeConversionRule('pointer', 'int32')).toBeNull();
    expect(findTypeConversionRule('array', 'pointer')).toBeNull();
  });

  it('supports lookup by id', () => {
    const rule = findTypeConversionRuleById('string_to_bool');
    expect(rule).not.toBeNull();
    expect(rule?.sourceType).toBe('string');
    expect(rule?.targetType).toBe('bool');
    expect(rule?.stage).toBe(3);
    expect(rule?.strategy).toBe('helper');
  });

  it('formats conversion labels for both locales', () => {
    const rule = findTypeConversionRule('int32', 'double');
    expect(rule).not.toBeNull();
    expect(formatTypeConversionLabel(rule!, 'ru')).toBe('Преобразовать: Int32 → Double');
    expect(formatTypeConversionLabel(rule!, 'en')).toBe('Convert: Int32 -> Double');
  });

  it('applies cpp template for template strategy', () => {
    const rule = findTypeConversionRule('string', 'double');
    expect(rule).not.toBeNull();
    expect(rule?.strategy).toBe('template');
    expect(applyTypeConversionTemplate(rule!, 'valueExpr')).toBe('std::stod(valueExpr)');
  });

  it('returns original expression for helper strategy', () => {
    const rule = findTypeConversionRule('pointer', 'bool');
    expect(rule).not.toBeNull();
    expect(rule?.strategy).toBe('helper');
    expect(applyTypeConversionTemplate(rule!, 'valueExpr')).toBe('valueExpr');
  });

  it('allows direct data connection for same type, wildcard and object-reference family', () => {
    expect(canDirectlyConnectDataPorts('int32', 'int32')).toBe(true);
    expect(canDirectlyConnectDataPorts('int32', 'any')).toBe(true);
    expect(canDirectlyConnectDataPorts('any', 'string')).toBe(true);
    expect(canDirectlyConnectDataPorts('pointer', 'object-reference')).toBe(true);
    expect(canDirectlyConnectDataPorts('int32', 'float')).toBe(false);
    expect(canDirectlyConnectDataPorts('execution', 'execution')).toBe(false);
  });

  it('formats incompatible message in ru/en', () => {
    expect(formatIncompatibleTypeMessage('bool', 'int32', 'ru')).toBe('Типы несовместимы: bool → int32');
    expect(formatIncompatibleTypeMessage('bool', 'int32', 'en')).toBe('Incompatible types: bool -> int32');
  });

  it('returns short type labels for messages', () => {
    expect(getTypeLabelForMessage('int32', 'ru')).toBe('int32');
    expect(getTypeLabelForMessage('string', 'en')).toBe('string');
  });

  it('exact match: class ports compatible', () => {
    expect(validateDataPortCompatibility(
      { dataType: 'class', typeId: 'UE.Actor' },
      { dataType: 'class', typeId: 'UE.Actor' }
    ).compatible).toBe(true);
  });

  it('upcast by hierarchy is allowed, downcast is blocked', () => {
    const context = {
      hierarchy: {
        policyVersion: '2.0.0',
        inheritance: {
          'UE.Object': [],
          'UE.Actor': ['UE.Object'],
          'UE.Pawn': ['UE.Actor'],
          'UE.Character': ['UE.Pawn'],
        },
      },
    };

    const upcast = validateDataPortCompatibility(
      { dataType: 'object-reference', typeId: 'UE.Character' },
      { dataType: 'class', typeId: 'UE.Actor' },
      context
    );
    expect(upcast).toMatchObject({ compatible: true, reason: 'ok' });

    const downcast = validateDataPortCompatibility(
      { dataType: 'class', typeId: 'UE.Actor' },
      { dataType: 'object-reference', typeId: 'UE.Character' },
      context
    );
    expect(downcast).toMatchObject({ compatible: false, reason: 'unsafe-downcast' });
  });

  it('unknown type returns diagnostic', () => {
    const result = validateDataPortCompatibility(
      { dataType: 'class', typeId: 'UE.Missing' },
      { dataType: 'class', typeId: 'UE.Actor' },
      {
        hierarchy: {
          policyVersion: '2.0.0',
          inheritance: { 'UE.Actor': ['UE.Object'], 'UE.Object': [] },
        },
      }
    );

    expect(result.reason).toBe('unknown-type');
    expect(formatIncompatiblePortMessage(
      { dataType: 'class', typeId: 'UE.Missing' },
      { dataType: 'class', typeId: 'UE.Actor' },
      'ru',
      {
        hierarchy: {
          policyVersion: '2.0.0',
          inheritance: { 'UE.Actor': ['UE.Object'], 'UE.Object': [] },
        },
      }
    )).toContain('Тип не найден в реестре иерархии');
  });

  it('detects cyclic and broken hierarchy', () => {
    const cyclic = validateDataPortCompatibility(
      { dataType: 'class', typeId: 'A' },
      { dataType: 'class', typeId: 'B' },
      { hierarchy: { policyVersion: '2.0.0', inheritance: { A: ['B'], B: ['A'] } } }
    );
    expect(cyclic.reason).toBe('hierarchy-cycle');

    const broken = validateDataPortCompatibility(
      { dataType: 'class', typeId: 'A' },
      { dataType: 'class', typeId: 'Root' },
      { hierarchy: { policyVersion: '2.0.0', inheritance: { A: [''], Root: [] } } }
    );
    expect(broken.reason).toBe('hierarchy-invalid');
  });
});
