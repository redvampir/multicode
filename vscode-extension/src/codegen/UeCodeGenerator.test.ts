import { describe, expect, it } from 'vitest';

import { CppCodeGenerator } from './CppCodeGenerator';
import { UeCodeGenerator } from './UeCodeGenerator';
import { CodeGenErrorCode } from './types';
import { buildClassModelFromGraph } from './model/classModel';
import type {
  BlueprintEdge,
  BlueprintFunction,
  BlueprintGraphState,
  BlueprintNode,
} from '../shared/blueprintTypes';
import type { PortDataType } from '../shared/portTypes';
import {
  createClassPipelineGraphFixture,
  createCommonTargetGraphFixture,
  createUeUnsupportedGraphFixture,
} from './__fixtures__/targetGraphFixtures';

const port = (
  id: string,
  name: string,
  dataType: PortDataType,
  direction: 'input' | 'output',
  index: number,
  value?: string | number | boolean,
) => ({
  id,
  name,
  dataType,
  direction,
  index,
  ...(value !== undefined ? { value } : {}),
});

const createEdgeFixture = (
  sourceNode: string,
  sourcePort: string,
  targetNode: string,
  targetPort: string,
  kind: BlueprintEdge['kind'] = 'execution',
  dataType?: PortDataType,
): BlueprintEdge => ({
  id: `${sourceNode}-${sourcePort}-${targetNode}-${targetPort}`,
  sourceNode,
  sourcePort,
  targetNode,
  targetPort,
  kind,
  ...(dataType ? { dataType } : {}),
});

const createTopLevelUeReflectionFixture = (): BlueprintGraphState => {
  const startNode: BlueprintNode = {
    id: 'start',
    type: 'Start',
    label: 'Начало',
    position: { x: 0, y: 0 },
    inputs: [],
    outputs: [
      port('start-exec-out', 'Out', 'execution', 'output', 0),
    ],
  };

  const setHealthNode: BlueprintNode = {
    id: 'set-health',
    type: 'SetVariable',
    label: 'Установить здоровье',
    position: { x: 220, y: 0 },
    inputs: [
      port('set-health-exec-in', 'In', 'execution', 'input', 0),
      port('set-health-value-in', 'Значение', 'int32', 'input', 1, 42),
    ],
    outputs: [
      port('set-health-exec-out', 'Out', 'execution', 'output', 0),
      port('set-health-value-out', 'Значение', 'int32', 'output', 1),
    ],
    properties: {
      variableId: 'var-health',
      dataType: 'int32',
    },
  };

  const callScoreNode: BlueprintNode = {
    id: 'call-score',
    type: 'CallUserFunction',
    label: 'Вызов calculateScore',
    position: { x: 440, y: 0 },
    inputs: [
      port('call-score-exec-in', 'In', 'execution', 'input', 0),
      port('call-score-delta', 'delta', 'int32', 'input', 1, 5),
    ],
    outputs: [
      port('call-score-exec-out', 'Out', 'execution', 'output', 0),
      port('call-score-result', 'result', 'int32', 'output', 1),
    ],
    properties: {
      functionId: 'func-calc-score',
      functionName: 'calculateScore',
    },
  };

  const calculateScoreFunction: BlueprintFunction = {
    id: 'func-calc-score',
    name: 'calculateScore',
    nameRu: 'РассчитатьОчки',
    description: 'Возвращает переданное значение как результат.',
    parameters: [
      { id: 'delta', name: 'delta', nameRu: 'дельта', dataType: 'int32', direction: 'input' },
      { id: 'result', name: 'result', nameRu: 'результат', dataType: 'int32', direction: 'output' },
    ],
    graph: {
      nodes: [
        {
          id: 'entry-score',
          type: 'FunctionEntry',
          label: 'Вход',
          position: { x: 0, y: 0 },
          inputs: [],
          outputs: [
            port('entry-score-exec-out', 'exec', 'execution', 'output', 0),
            port('entry-score-delta', 'delta', 'int32', 'output', 1),
          ],
          properties: { functionId: 'func-calc-score' },
        },
        {
          id: 'return-score',
          type: 'FunctionReturn',
          label: 'Возврат',
          position: { x: 220, y: 0 },
          inputs: [
            port('return-score-exec-in', 'exec', 'execution', 'input', 0),
            port('return-score-result', 'result', 'int32', 'input', 1),
          ],
          outputs: [],
          properties: { functionId: 'func-calc-score' },
        },
      ],
      edges: [
        createEdgeFixture('entry-score', 'entry-score-exec-out', 'return-score', 'return-score-exec-in'),
        createEdgeFixture('entry-score', 'entry-score-delta', 'return-score', 'return-score-result', 'data', 'int32'),
      ],
    },
    isPure: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    id: 'fixture-ue-top-level-reflection',
    name: 'TopLevelReflection',
    language: 'ue',
    displayLanguage: 'ru',
    nodes: [startNode, setHealthNode, callScoreNode],
    edges: [
      createEdgeFixture('start', 'start-exec-out', 'set-health', 'set-health-exec-in'),
      createEdgeFixture('set-health', 'set-health-exec-out', 'call-score', 'call-score-exec-in'),
    ],
    variables: [
      {
        id: 'var-health',
        name: 'health',
        nameRu: 'Здоровье',
        codeName: 'health_points',
        dataType: 'int32',
        defaultValue: 100,
        category: 'default',
      },
    ],
    functions: [calculateScoreFunction],
    ueMacros: [
      {
        id: 'macro-health',
        name: 'UE Property',
        nameRu: 'Свойство UE',
        macroType: 'UPROPERTY',
        specifiers: ['VisibleAnywhere', 'BlueprintReadOnly'],
        category: 'Stats',
        targetId: 'var-health',
        targetKind: 'variable',
      },
      {
        id: 'macro-calc',
        name: 'UE Function',
        nameRu: 'Функция UE',
        macroType: 'UFUNCTION',
        specifiers: ['BlueprintPure'],
        category: 'Stats',
        targetId: 'func-calc-score',
        targetKind: 'function',
      },
    ],
    updatedAt: new Date().toISOString(),
  };
};

describe('UeCodeGenerator', () => {
  it('генерирует UE-обёртку с UCLASS/UFUNCTION и UE include-правилами', () => {
    const ueGenerator = new UeCodeGenerator();
    const graph = createCommonTargetGraphFixture('ue');

    const result = ueGenerator.generate(graph);

    expect(result.success).toBe(true);
    expect(result.code).toContain('#include "CoreMinimal.h"');
    expect(result.code).toContain('UCLASS(BlueprintType)');
    expect(result.code).toContain('UFUNCTION(BlueprintCallable, Category = "MultiCode")');
    expect(result.code).toContain('void ExecuteGraph();');
  });

  it('выполняет fail-fast валидацию для UE-несовместимого узла', () => {
    const ueGenerator = new UeCodeGenerator();

    const result = ueGenerator.generate(createUeUnsupportedGraphFixture());

    expect(result.success).toBe(false);
    expect(result.errors.some((error) => error.code === CodeGenErrorCode.UE_UNSUPPORTED_CONSTRUCT)).toBe(true);
    expect(result.errors[0].message).toContain('не поддерживается для target ue');
  });

  it('одинаковая фикстура даёт разный output для cpp и ue target', () => {
    const cppGenerator = new CppCodeGenerator();
    const ueGenerator = new UeCodeGenerator();
    const cppGraph = createCommonTargetGraphFixture('cpp');
    const ueGraph = createCommonTargetGraphFixture('ue');

    const cppResult = cppGenerator.generate(cppGraph);
    const ueResult = ueGenerator.generate(ueGraph);

    expect(cppResult.success).toBe(true);
    expect(ueResult.success).toBe(true);
    expect(cppResult.code).toContain('int main() {');
    expect(ueResult.code).toContain('UCLASS(BlueprintType)');
    expect(ueResult.code).not.toContain('int main() {');
  });

  it('использует общий class-пайплайн и различает только target strategy', () => {
    const cppGenerator = new CppCodeGenerator();
    const ueGenerator = new UeCodeGenerator();
    const cppGraph = createClassPipelineGraphFixture('cpp');
    const ueGraph = createClassPipelineGraphFixture('ue');

    const cppResult = cppGenerator.generate(cppGraph);
    const ueResult = ueGenerator.generate(ueGraph);

    expect(cppResult.success).toBe(true);
    expect(ueResult.success).toBe(true);
    expect(cppResult.code).toContain('class playerstate {');
    expect(cppResult.code).toContain('int gethealth();');
    expect(ueResult.code).toContain('UCLASS(BlueprintType)');
    expect(ueResult.code).toContain('class UPlayerstateGenerated : public UObject {');
  });

  it('один граф строит единый IR, который затем рендерится разными backend-стратегиями', () => {
    const graph = createClassPipelineGraphFixture('cpp');
    const baseIr = buildClassModelFromGraph(graph, 'cpp');
    const ueIr = buildClassModelFromGraph({ ...graph, language: 'ue' }, 'ue');

    const cppGenerator = new CppCodeGenerator();
    const ueGenerator = new UeCodeGenerator();

    const cppResult = cppGenerator.generate(graph);
    const ueResult = ueGenerator.generate({ ...graph, language: 'ue' });

    expect(baseIr).toHaveLength(1);
    expect(ueIr).toHaveLength(1);
    expect(baseIr[0].name).toBe(ueIr[0].name);
    expect(baseIr[0].fields).toHaveLength(1);
    expect(baseIr[0].methods).toHaveLength(1);
    expect(ueIr[0].fields[0]?.extensions?.ue?.propertyMacro).toContain('UPROPERTY');
    expect(ueIr[0].methods[0]?.extensions?.ue?.functionMacro).toContain('UFUNCTION');

    expect(cppResult.success).toBe(true);
    expect(ueResult.success).toBe(true);
    expect(cppResult.code).toContain('class playerstate {');
    expect(ueResult.code).toContain('UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "MultiCode")');
    expect(ueResult.code).toContain('UFUNCTION(BlueprintCallable, Category = "MultiCode")');
  });

  it('рендерит верхнеуровневые функции и переменные как реальные UFUNCTION/UPROPERTY members', () => {
    const ueGenerator = new UeCodeGenerator();
    const graph = createTopLevelUeReflectionFixture();

    const result = ueGenerator.generate(graph);

    expect(result.success).toBe(true);
    expect(result.code).toContain('UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Stats")');
    expect(result.code).toContain('int health_points = 100;');
    expect(result.code.match(/int health_points = 100;/g)?.length).toBe(1);
    expect(result.code).toContain('UFUNCTION(BlueprintPure, Category = "Stats")');
    expect(result.code).toContain('int calculateScore(int delta);');
    expect(result.code).toMatch(/int U\w+Generated::calculateScore\(int delta\) \{/);
    expect(result.code).toContain('return delta;');
    expect(result.code).toMatch(/void U\w+Generated::ExecuteGraph\(\) \{/);
    expect(result.code).toContain('health_points = 42;');
    expect(result.code).toContain('calculateScore(5)');
    expect(result.code).not.toContain('\nint calculateScore(int delta) {');
  });
});
