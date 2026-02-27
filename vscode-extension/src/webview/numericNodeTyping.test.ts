import { describe, expect, it } from 'vitest';
import { createNode } from '../shared/blueprintTypes';
import {
  canRetargetNodeToDataType,
  getDefaultNumericTypeForNodeType,
  inferNodeNumericType,
  isAutoRetargetComparisonNodeType,
  isNumericComparisonNodeType,
  retargetNodeNumericPorts,
} from './numericNodeTyping';

describe('numericNodeTyping', () => {
  it('retargets arithmetic node ports to requested numeric type', () => {
    const addNode = createNode('Add', { x: 0, y: 0 }, 'add-1');
    const retargeted = retargetNodeNumericPorts(addNode, 'int32');

    expect(retargeted).not.toBe(addNode);
    expect(retargeted.inputs.filter((port) => port.dataType !== 'execution').every((port) => port.dataType === 'int32')).toBe(true);
    expect(retargeted.outputs.filter((port) => port.dataType !== 'execution').every((port) => port.dataType === 'int32')).toBe(true);
    expect(retargeted.properties?.numericType).toBe('int32');
    expect(retargeted.properties?.autoTypeConversion).toBe(true);
  });

  it('keeps bool output for comparison nodes when retargeting input type', () => {
    const lessNode = createNode('Less', { x: 0, y: 0 }, 'less-1');
    const retargeted = retargetNodeNumericPorts(lessNode, 'int64');

    const inputTypes = retargeted.inputs.map((port) => port.dataType);
    const outputTypes = retargeted.outputs.map((port) => port.dataType);
    expect(inputTypes).toEqual(['int64', 'int64']);
    expect(outputTypes).toEqual(['bool']);
    expect(retargeted.properties?.numericType).toBe('int64');
  });

  it('uses node numericType property as preferred inferred type', () => {
    const multiplyNode = createNode('Multiply', { x: 0, y: 0 }, 'mul-1');
    multiplyNode.properties = { numericType: 'double' };

    expect(inferNodeNumericType(multiplyNode)).toBe('double');
  });

  it('returns modulo default type when no explicit type is inferred', () => {
    const moduloNode = createNode('Modulo', { x: 0, y: 0 }, 'mod-1');

    expect(inferNodeNumericType(moduloNode)).toBe('int32');
    expect(getDefaultNumericTypeForNodeType('Modulo')).toBe('int32');
  });

  it('marks only strict numeric comparisons as numeric comparison nodes', () => {
    expect(isNumericComparisonNodeType('Greater')).toBe(true);
    expect(isNumericComparisonNodeType('LessEqual')).toBe(true);
    expect(isNumericComparisonNodeType('Equal')).toBe(false);
    expect(isNumericComparisonNodeType('NotEqual')).toBe(false);
  });

  it('treats Equal and NotEqual as auto-retarget comparison nodes', () => {
    expect(isAutoRetargetComparisonNodeType('Equal')).toBe(true);
    expect(isAutoRetargetComparisonNodeType('NotEqual')).toBe(true);
    expect(isAutoRetargetComparisonNodeType('Greater')).toBe(true);
    expect(isAutoRetargetComparisonNodeType('Add')).toBe(false);
  });

  it('retargets Equal node ports for scalar comparison types', () => {
    const equalNode = createNode('Equal', { x: 0, y: 0 }, 'eq-1');
    const retargeted = retargetNodeNumericPorts(equalNode, 'string');

    expect(retargeted).not.toBe(equalNode);
    expect(retargeted.inputs.map((port) => port.dataType)).toEqual(['string', 'string']);
    expect(retargeted.outputs.map((port) => port.dataType)).toEqual(['bool']);
    expect(retargeted.properties?.comparisonType).toBe('string');
    expect(retargeted.properties?.autoTypeConversion).toBe(true);
  });

  it('allows comparison retarget only for supported comparison types', () => {
    expect(canRetargetNodeToDataType('Equal', 'bool')).toBe(true);
    expect(canRetargetNodeToDataType('Equal', 'float')).toBe(true);
    expect(canRetargetNodeToDataType('Equal', 'string')).toBe(true);
    expect(canRetargetNodeToDataType('Equal', 'class')).toBe(true);
    expect(canRetargetNodeToDataType('Equal', 'pointer')).toBe(true);
    expect(canRetargetNodeToDataType('Equal', 'vector')).toBe(false);
  });

  it('retargets NotEqual node ports for pointer comparison', () => {
    const notEqualNode = createNode('NotEqual', { x: 0, y: 0 }, 'neq-1');
    const retargeted = retargetNodeNumericPorts(notEqualNode, 'pointer');

    expect(retargeted).not.toBe(notEqualNode);
    expect(retargeted.inputs.map((port) => port.dataType)).toEqual(['pointer', 'pointer']);
    expect(retargeted.outputs.map((port) => port.dataType)).toEqual(['bool']);
    expect(retargeted.properties?.comparisonType).toBe('pointer');
    expect(retargeted.properties?.autoTypeConversion).toBe(true);
  });
});
