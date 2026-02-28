import { describe, expect, it } from 'vitest';

import { CppCodeGenerator } from './CppCodeGenerator';
import { UeCodeGenerator } from './UeCodeGenerator';
import { CodeGenErrorCode } from './types';
import { buildClassModelFromGraph } from './model/classModel';
import {
  createClassPipelineGraphFixture,
  createCommonTargetGraphFixture,
  createUeUnsupportedGraphFixture,
} from './__fixtures__/targetGraphFixtures';

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
});
