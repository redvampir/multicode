import { createEdge, createNode, type BlueprintGraphState } from '../../shared/blueprintTypes';

export const createCommonTargetGraphFixture = (language: BlueprintGraphState['language']): BlueprintGraphState => {
  const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
  const printNode = createNode('Print', { x: 220, y: 0 }, 'print');
  printNode.inputs[1].value = 'Hello UE';

  return {
    id: `fixture-${language}`,
    name: 'TargetMatrixGraph',
    language,
    displayLanguage: 'ru',
    nodes: [startNode, printNode],
    edges: [createEdge('start', 'start-exec-out', 'print', 'print-exec-in')],
    updatedAt: new Date().toISOString(),
  };
};

export const createUeUnsupportedGraphFixture = (): BlueprintGraphState => {
  const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
  const parallelNode = createNode('Parallel', { x: 220, y: 0 }, 'parallel');

  return {
    id: 'fixture-ue-unsupported',
    name: 'UeUnsupportedGraph',
    language: 'ue',
    displayLanguage: 'ru',
    nodes: [startNode, parallelNode],
    edges: [createEdge('start', 'start-exec-out', 'parallel', 'parallel-exec-in')],
    updatedAt: new Date().toISOString(),
  };
};
