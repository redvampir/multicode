import { describe, expect, it } from 'vitest';
import type { BlueprintEdge, BlueprintNode } from '../shared/blueprintTypes';
import { createEdge, createNode } from '../shared/blueprintTypes';
import {
  bindVariableToNode,
  findNonOverlappingPosition,
  getEffectiveSetInputValue,
  getVariableNodeTitle,
  removeNodesByDeletedVariables,
  type AvailableVariableBinding,
} from './variableNodeBinding';

const makeVariable = (overrides?: Partial<AvailableVariableBinding>): AvailableVariableBinding => ({
  id: 'var-1',
  name: 'testValue',
  nameRu: 'ТестЗначение',
  dataType: 'bool',
  defaultValue: false,
  color: '#E53935',
  ...overrides,
});

describe('variableNodeBinding', () => {
  it('bindVariableToNode должен заполнять metadata и типы портов для Get/Set', () => {
    const variable = makeVariable();
    const getNode = createNode('GetVariable', { x: 10, y: 20 }, 'node-get');
    const setNode = createNode('SetVariable', { x: 30, y: 40 }, 'node-set');

    const boundGet = bindVariableToNode(getNode, variable, 'ru');
    const boundSet = bindVariableToNode(setNode, variable, 'ru');

    expect(boundGet.properties?.variableId).toBe(variable.id);
    expect(boundGet.properties?.dataType).toBe('bool');
    expect(boundGet.outputs.find((port) => port.id.endsWith('value-out'))?.dataType).toBe('bool');

    expect(boundSet.properties?.variableId).toBe(variable.id);
    expect(boundSet.properties?.dataType).toBe('bool');
    expect(boundSet.properties?.inputValue).toBe(false);
    expect(boundSet.properties?.inputValueIsOverride).toBe(false);
    expect(boundSet.inputs.find((port) => port.id.endsWith('value-in'))?.dataType).toBe('bool');
    expect(boundSet.outputs.find((port) => port.id.endsWith('value-out'))?.dataType).toBe('bool');
  });

  it('getEffectiveSetInputValue соблюдает правило override', () => {
    const variable = makeVariable({ defaultValue: 21, dataType: 'int32' });
    const setNode = bindVariableToNode(createNode('SetVariable', { x: 0, y: 0 }, 'node-set'), variable, 'ru');
    const noOverrideValue = getEffectiveSetInputValue(setNode, variable.defaultValue);

    const overrideNode: BlueprintNode = {
      ...setNode,
      properties: {
        ...setNode.properties,
        inputValue: 55,
        inputValueIsOverride: true,
      },
    };
    const overrideValue = getEffectiveSetInputValue(overrideNode, variable.defaultValue);

    expect(noOverrideValue).toBe(21);
    expect(overrideValue).toBe(55);
  });

  it('removeNodesByDeletedVariables удаляет Get/Set узлы и связанные рёбра', () => {
    const variableOne = makeVariable({ id: 'var-1' });
    const variableTwo = makeVariable({ id: 'var-2', name: 'other', nameRu: 'Другая', dataType: 'float' });

    const startNode = createNode('Start', { x: 0, y: 0 }, 'node-start');
    const getNode = bindVariableToNode(createNode('GetVariable', { x: 120, y: 0 }, 'node-get'), variableOne, 'ru');
    const setNode = bindVariableToNode(createNode('SetVariable', { x: 240, y: 0 }, 'node-set'), variableTwo, 'ru');

    const edges: BlueprintEdge[] = [
      createEdge('node-start', 'node-start-exec-out', 'node-get', 'node-get-value-out'),
      createEdge('node-get', 'node-get-value-out', 'node-set', 'node-set-value-in', 'bool'),
    ];

    const result = removeNodesByDeletedVariables(
      [startNode, getNode, setNode],
      edges,
      ['var-1']
    );

    expect(result.removedNodeIds).toContain('node-get');
    expect(result.nodes.map((node) => node.id)).toEqual(['node-start', 'node-set']);
    expect(result.edges).toHaveLength(0);
  });

  it('findNonOverlappingPosition должен находить свободное место каскадным offset', () => {
    const occupied = [
      { id: 'n-1', position: { x: 100, y: 100 } },
      { id: 'n-2', position: { x: 136, y: 124 } },
    ];

    const resolved = findNonOverlappingPosition({ x: 100, y: 100 }, occupied);

    expect(resolved).not.toEqual({ x: 100, y: 100 });
    expect(occupied.some((item) => item.position.x === resolved.x && item.position.y === resolved.y)).toBe(false);
  });

  it('getVariableNodeTitle формирует заголовок с именем переменной', () => {
    expect(getVariableNodeTitle('GetVariable', 'Скорость', 'Получить')).toBe('Получить: Скорость');
    expect(getVariableNodeTitle('SetVariable', 'speed', 'Set')).toBe('Set: speed');
    expect(getVariableNodeTitle('Start', 'speed', 'Начало')).toBe('Начало');
  });
});

