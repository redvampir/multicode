import { describe, expect, it } from 'vitest';

import { buildClassModelFromGraph } from './classModel';
import { createClassPipelineGraphFixture } from '../__fixtures__/targetGraphFixtures';

describe('classModel single-source pipeline', () => {
  it('строит одинаковую базовую модель для cpp и ue, различая только ue extension', () => {
    const cppGraph = createClassPipelineGraphFixture('cpp');
    const ueGraph = createClassPipelineGraphFixture('ue');

    const cppModel = buildClassModelFromGraph(cppGraph, 'cpp');
    const ueModel = buildClassModelFromGraph(ueGraph, 'ue');

    expect(cppModel).toHaveLength(1);
    expect(ueModel).toHaveLength(1);

    const [cppClass] = cppModel;
    const [ueClass] = ueModel;

    expect(cppClass.name).toBe(ueClass.name);
    expect(cppClass.fields).toEqual(ueClass.fields);
    expect(cppClass.methods).toEqual(ueClass.methods);
    expect(cppClass.extensions?.ue).toBeUndefined();
    expect(ueClass.extensions?.ue?.classMacro).toBe('UCLASS(BlueprintType)');
    expect(ueClass.extensions?.ue?.generatedBodyMacro).toBe('GENERATED_BODY()');
    expect(ueClass.extensions?.ue?.methodMacro).toContain('UFUNCTION');
  });
});
