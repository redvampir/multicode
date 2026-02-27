import { describe, expect, it } from 'vitest';
import {
  createEdge,
  createNode,
  type BlueprintVariable,
} from '../shared/blueprintTypes';
import { resolveVariableValuesPreview } from './variableValueResolver';

const createVariable = (
  id: string,
  name: string,
  defaultValue: number
): BlueprintVariable => ({
  id,
  name,
  nameRu: name,
  dataType: 'int32',
  defaultValue,
  category: 'default',
});

describe('variableValueResolver', () => {
  it('resolves value from GetVariable to SetVariable through data edge', () => {
    const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
    const getSource = createNode('GetVariable', { x: 120, y: 0 }, 'get-64');
    const setTarget = createNode('SetVariable', { x: 280, y: 0 }, 'set-32');

    getSource.properties = { variableId: 'var-64', dataType: 'int32' };
    setTarget.properties = { variableId: 'var-32', dataType: 'int32' };

    const resolved = resolveVariableValuesPreview({
      nodes: [startNode, getSource, setTarget],
      edges: [
        createEdge('start', 'start-exec-out', 'set-32', 'set-32-exec-in', 'execution'),
        createEdge('get-64', 'get-64-value-out', 'set-32', 'set-32-value-in', 'int32'),
      ],
      variables: [
        createVariable('var-32', 'var32', 32),
        createVariable('var-64', 'var64', 64),
      ],
    });

    expect(resolved['var-32']).toMatchObject({
      currentValue: 64,
      sourceNodeId: 'set-32',
      status: 'resolved',
    });
  });

  it('resolves Add node expression for SetVariable preview', () => {
    const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
    const get23 = createNode('GetVariable', { x: 100, y: 0 }, 'get-23');
    const get34 = createNode('GetVariable', { x: 100, y: 120 }, 'get-34');
    const addNode = createNode('Add', { x: 240, y: 60 }, 'add');
    const setTarget = createNode('SetVariable', { x: 400, y: 60 }, 'set-0');

    get23.properties = { variableId: 'var-23', dataType: 'int32' };
    get34.properties = { variableId: 'var-34', dataType: 'int32' };
    setTarget.properties = { variableId: 'var-0', dataType: 'double' };

    const resolved = resolveVariableValuesPreview({
      nodes: [startNode, get23, get34, addNode, setTarget],
      edges: [
        createEdge('start', 'start-exec-out', 'set-0', 'set-0-exec-in', 'execution'),
        createEdge('get-23', 'get-23-value-out', 'add', 'add-a', 'int32'),
        createEdge('get-34', 'get-34-value-out', 'add', 'add-b', 'int32'),
        createEdge('add', 'add-result', 'set-0', 'set-0-value-in', 'double'),
      ],
      variables: [
        createVariable('var-0', 'var0', 0),
        createVariable('var-23', 'var23', 23),
        createVariable('var-34', 'var34', 34),
      ],
    });

    expect(resolved['var-0']).toMatchObject({
      currentValue: 57,
      sourceNodeId: 'set-0',
      status: 'resolved',
    });
  });

  it('resolves Add node with dynamically appended operands', () => {
    const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
    const get23 = createNode('GetVariable', { x: 100, y: 0 }, 'get-23');
    const get34 = createNode('GetVariable', { x: 100, y: 120 }, 'get-34');
    const get10 = createNode('GetVariable', { x: 100, y: 240 }, 'get-10');
    const addNode = createNode('Add', { x: 240, y: 80 }, 'add');
    const setTarget = createNode('SetVariable', { x: 420, y: 80 }, 'set-0');

    addNode.inputs.push({
      id: 'add-c',
      name: 'C',
      dataType: 'float',
      direction: 'input',
      index: addNode.inputs.length,
      connected: false,
      defaultValue: 0,
    });

    get23.properties = { variableId: 'var-23', dataType: 'int32' };
    get34.properties = { variableId: 'var-34', dataType: 'int32' };
    get10.properties = { variableId: 'var-10', dataType: 'int32' };
    setTarget.properties = { variableId: 'var-0', dataType: 'double' };

    const resolved = resolveVariableValuesPreview({
      nodes: [startNode, get23, get34, get10, addNode, setTarget],
      edges: [
        createEdge('start', 'start-exec-out', 'set-0', 'set-0-exec-in', 'execution'),
        createEdge('get-23', 'get-23-value-out', 'add', 'add-a', 'int32'),
        createEdge('get-34', 'get-34-value-out', 'add', 'add-b', 'int32'),
        createEdge('get-10', 'get-10-value-out', 'add', 'add-c', 'int32'),
        createEdge('add', 'add-result', 'set-0', 'set-0-value-in', 'double'),
      ],
      variables: [
        createVariable('var-0', 'var0', 0),
        createVariable('var-10', 'var10', 10),
        createVariable('var-23', 'var23', 23),
        createVariable('var-34', 'var34', 34),
      ],
    });

    expect(resolved['var-0']).toMatchObject({
      currentValue: 67,
      sourceNodeId: 'set-0',
      status: 'resolved',
    });
  });

  it('resolves Subtract node with multiple operands (left fold)', () => {
    const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
    const get20 = createNode('GetVariable', { x: 100, y: 0 }, 'get-20');
    const get5 = createNode('GetVariable', { x: 100, y: 120 }, 'get-5');
    const get3 = createNode('GetVariable', { x: 100, y: 240 }, 'get-3');
    const subNode = createNode('Subtract', { x: 240, y: 80 }, 'sub');
    const setTarget = createNode('SetVariable', { x: 420, y: 80 }, 'set-0');

    subNode.inputs.push({
      id: 'sub-c',
      name: 'C',
      nameRu: 'C',
      dataType: 'float',
      direction: 'input',
      index: subNode.inputs.length,
      connected: false,
      defaultValue: 0,
    });

    get20.properties = { variableId: 'var-20', dataType: 'int32' };
    get5.properties = { variableId: 'var-5', dataType: 'int32' };
    get3.properties = { variableId: 'var-3', dataType: 'int32' };
    setTarget.properties = { variableId: 'var-0', dataType: 'double' };

    const resolved = resolveVariableValuesPreview({
      nodes: [startNode, get20, get5, get3, subNode, setTarget],
      edges: [
        createEdge('start', 'start-exec-out', 'set-0', 'set-0-exec-in', 'execution'),
        createEdge('get-20', 'get-20-value-out', 'sub', 'sub-a', 'int32'),
        createEdge('get-5', 'get-5-value-out', 'sub', 'sub-b', 'int32'),
        createEdge('get-3', 'get-3-value-out', 'sub', 'sub-c', 'int32'),
        createEdge('sub', 'sub-result', 'set-0', 'set-0-value-in', 'double'),
      ],
      variables: [
        createVariable('var-0', 'var0', 0),
        createVariable('var-20', 'var20', 20),
        createVariable('var-5', 'var5', 5),
        createVariable('var-3', 'var3', 3),
      ],
    });

    expect(resolved['var-0']).toMatchObject({
      currentValue: 12,
      sourceNodeId: 'set-0',
      status: 'resolved',
    });
  });

  it('resolves Multiply node with multiple operands', () => {
    const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
    const get2 = createNode('GetVariable', { x: 100, y: 0 }, 'get-2');
    const get3 = createNode('GetVariable', { x: 100, y: 120 }, 'get-3');
    const get4 = createNode('GetVariable', { x: 100, y: 240 }, 'get-4');
    const mulNode = createNode('Multiply', { x: 240, y: 80 }, 'mul');
    const setTarget = createNode('SetVariable', { x: 420, y: 80 }, 'set-0');

    mulNode.inputs.push({
      id: 'mul-c',
      name: 'C',
      nameRu: 'C',
      dataType: 'float',
      direction: 'input',
      index: mulNode.inputs.length,
      connected: false,
      defaultValue: 0,
    });

    get2.properties = { variableId: 'var-2', dataType: 'int32' };
    get3.properties = { variableId: 'var-3', dataType: 'int32' };
    get4.properties = { variableId: 'var-4', dataType: 'int32' };
    setTarget.properties = { variableId: 'var-0', dataType: 'double' };

    const resolved = resolveVariableValuesPreview({
      nodes: [startNode, get2, get3, get4, mulNode, setTarget],
      edges: [
        createEdge('start', 'start-exec-out', 'set-0', 'set-0-exec-in', 'execution'),
        createEdge('get-2', 'get-2-value-out', 'mul', 'mul-a', 'int32'),
        createEdge('get-3', 'get-3-value-out', 'mul', 'mul-b', 'int32'),
        createEdge('get-4', 'get-4-value-out', 'mul', 'mul-c', 'int32'),
        createEdge('mul', 'mul-result', 'set-0', 'set-0-value-in', 'double'),
      ],
      variables: [
        createVariable('var-0', 'var0', 0),
        createVariable('var-2', 'var2', 2),
        createVariable('var-3', 'var3', 3),
        createVariable('var-4', 'var4', 4),
      ],
    });

    expect(resolved['var-0']).toMatchObject({
      currentValue: 24,
      sourceNodeId: 'set-0',
      status: 'resolved',
    });
  });

  it('resolves Divide and Modulo nodes with left fold semantics', () => {
    const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
    const get40 = createNode('GetVariable', { x: 100, y: 0 }, 'get-40');
    const get4 = createNode('GetVariable', { x: 100, y: 120 }, 'get-4');
    const get2 = createNode('GetVariable', { x: 100, y: 240 }, 'get-2');
    const get17 = createNode('GetVariable', { x: 100, y: 360 }, 'get-17');
    const get5 = createNode('GetVariable', { x: 100, y: 480 }, 'get-5');
    const get3 = createNode('GetVariable', { x: 100, y: 600 }, 'get-3');
    const divNode = createNode('Divide', { x: 260, y: 100 }, 'div');
    const modNode = createNode('Modulo', { x: 260, y: 420 }, 'mod');
    const setDiv = createNode('SetVariable', { x: 460, y: 100 }, 'set-div');
    const setMod = createNode('SetVariable', { x: 460, y: 420 }, 'set-mod');

    divNode.inputs.push({
      id: 'div-c',
      name: 'C',
      nameRu: 'C',
      dataType: 'float',
      direction: 'input',
      index: divNode.inputs.length,
      connected: false,
      defaultValue: 1,
    });
    modNode.inputs.push({
      id: 'mod-c',
      name: 'C',
      nameRu: 'C',
      dataType: 'int32',
      direction: 'input',
      index: modNode.inputs.length,
      connected: false,
      defaultValue: 1,
    });

    get40.properties = { variableId: 'var-40', dataType: 'int32' };
    get4.properties = { variableId: 'var-4', dataType: 'int32' };
    get2.properties = { variableId: 'var-2', dataType: 'int32' };
    get17.properties = { variableId: 'var-17', dataType: 'int32' };
    get5.properties = { variableId: 'var-5', dataType: 'int32' };
    get3.properties = { variableId: 'var-3', dataType: 'int32' };
    setDiv.properties = { variableId: 'var-div', dataType: 'double' };
    setMod.properties = { variableId: 'var-mod', dataType: 'int32' };

    const resolved = resolveVariableValuesPreview({
      nodes: [startNode, get40, get4, get2, get17, get5, get3, divNode, modNode, setDiv, setMod],
      edges: [
        createEdge('start', 'start-exec-out', 'set-div', 'set-div-exec-in', 'execution'),
        createEdge('start', 'start-exec-out', 'set-mod', 'set-mod-exec-in', 'execution'),
        createEdge('get-40', 'get-40-value-out', 'div', 'div-a', 'int32'),
        createEdge('get-4', 'get-4-value-out', 'div', 'div-b', 'int32'),
        createEdge('get-2', 'get-2-value-out', 'div', 'div-c', 'int32'),
        createEdge('div', 'div-result', 'set-div', 'set-div-value-in', 'double'),
        createEdge('get-17', 'get-17-value-out', 'mod', 'mod-a', 'int32'),
        createEdge('get-5', 'get-5-value-out', 'mod', 'mod-b', 'int32'),
        createEdge('get-3', 'get-3-value-out', 'mod', 'mod-c', 'int32'),
        createEdge('mod', 'mod-result', 'set-mod', 'set-mod-value-in', 'int32'),
      ],
      variables: [
        createVariable('var-div', 'varDiv', 0),
        createVariable('var-mod', 'varMod', 0),
        createVariable('var-40', 'var40', 40),
        createVariable('var-4', 'var4', 4),
        createVariable('var-2', 'var2', 2),
        createVariable('var-17', 'var17', 17),
        createVariable('var-5', 'var5', 5),
        createVariable('var-3', 'var3', 3),
      ],
    });

    expect(resolved['var-div']).toMatchObject({
      currentValue: 5,
      sourceNodeId: 'set-div',
      status: 'resolved',
    });
    expect(resolved['var-mod']).toMatchObject({
      currentValue: 2,
      sourceNodeId: 'set-mod',
      status: 'resolved',
    });
  });

  it('keeps manual override from SetVariable when no data edge connected', () => {
    const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
    const setTarget = createNode('SetVariable', { x: 220, y: 0 }, 'set-override');
    setTarget.properties = {
      variableId: 'var-32',
      dataType: 'int32',
      inputValue: 99,
      inputValueIsOverride: true,
    };

    const resolved = resolveVariableValuesPreview({
      nodes: [startNode, setTarget],
      edges: [
        createEdge('start', 'start-exec-out', 'set-override', 'set-override-exec-in', 'execution'),
      ],
      variables: [createVariable('var-32', 'var32', 32)],
    });

    expect(resolved['var-32']).toMatchObject({
      currentValue: 99,
      sourceNodeId: 'set-override',
      status: 'resolved',
    });
  });

  it('returns ambiguous when two reachable SetVariable nodes assign different values', () => {
    const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
    const setA = createNode('SetVariable', { x: 220, y: 0 }, 'set-a');
    const setB = createNode('SetVariable', { x: 220, y: 120 }, 'set-b');
    setA.properties = {
      variableId: 'var-32',
      dataType: 'int32',
      inputValue: 10,
      inputValueIsOverride: true,
    };
    setB.properties = {
      variableId: 'var-32',
      dataType: 'int32',
      inputValue: 20,
      inputValueIsOverride: true,
    };

    const resolved = resolveVariableValuesPreview({
      nodes: [startNode, setA, setB],
      edges: [
        createEdge('start', 'start-exec-out', 'set-a', 'set-a-exec-in', 'execution'),
        createEdge('start', 'start-exec-out', 'set-b', 'set-b-exec-in', 'execution'),
      ],
      variables: [createVariable('var-32', 'var32', 32)],
    });

    expect(resolved['var-32'].status).toBe('ambiguous');
  });

  it('marks values as unknown when execution graph contains a cycle', () => {
    const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
    const setNode = createNode('SetVariable', { x: 220, y: 0 }, 'set-cycle');
    setNode.properties = {
      variableId: 'var-32',
      dataType: 'int32',
      inputValue: 77,
      inputValueIsOverride: true,
    };

    const resolved = resolveVariableValuesPreview({
      nodes: [startNode, setNode],
      edges: [
        createEdge('start', 'start-exec-out', 'set-cycle', 'set-cycle-exec-in', 'execution'),
        createEdge('set-cycle', 'set-cycle-exec-out', 'start', 'start-exec-in', 'execution'),
      ],
      variables: [createVariable('var-32', 'var32', 32)],
    });

    expect(resolved['var-32'].status).toBe('unknown');
  });

  it('keeps default value as resolved when there is no reachable SetVariable', () => {
    const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
    const getNode = createNode('GetVariable', { x: 160, y: 0 }, 'get-default');
    getNode.properties = {
      variableId: 'var-32',
      dataType: 'int32',
    };

    const resolved = resolveVariableValuesPreview({
      nodes: [startNode, getNode],
      edges: [],
      variables: [createVariable('var-32', 'var32', 32)],
    });

    expect(resolved['var-32']).toMatchObject({
      currentValue: 32,
      sourceNodeId: 'default',
      status: 'resolved',
    });
  });
});
