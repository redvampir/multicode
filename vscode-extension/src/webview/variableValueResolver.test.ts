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
});
