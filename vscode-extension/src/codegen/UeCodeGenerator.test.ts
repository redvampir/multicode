import { describe, expect, it } from 'vitest';

import { CppCodeGenerator } from './CppCodeGenerator';
import { UeCodeGenerator } from './UeCodeGenerator';
import { CodeGenErrorCode } from './types';
import {
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
});
