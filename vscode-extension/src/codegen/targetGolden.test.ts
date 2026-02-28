import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { CppCodeGenerator } from './CppCodeGenerator';
import { UeCodeGenerator } from './UeCodeGenerator';
import {
  createClassPipelineGraphFixture,
  createCommonTargetGraphFixture,
} from './__fixtures__/targetGraphFixtures';

const goldenPath = (fileName: string): string =>
  path.resolve(__dirname, '__golden__', fileName);

const normalizeGeneratedCode = (code: string): string =>
  code.replace(/^\/\/ Дата: .*$/m, '// Дата: <normalized>');

describe('golden output by target', () => {
  it('UE: common fixture output stays stable', () => {
    const generator = new UeCodeGenerator();
    const result = generator.generate(createCommonTargetGraphFixture('ue'));

    expect(result.success).toBe(true);
    expect(normalizeGeneratedCode(result.code)).toMatchFileSnapshot(goldenPath('ue-common.golden.h'));
  });

  it('UE: class fixture output stays stable', () => {
    const generator = new UeCodeGenerator();
    const result = generator.generate(createClassPipelineGraphFixture('ue'));

    expect(result.success).toBe(true);
    expect(normalizeGeneratedCode(result.code)).toMatchFileSnapshot(goldenPath('ue-class.golden.h'));
  });

  it('CPP regression: common fixture output is unchanged', () => {
    const generator = new CppCodeGenerator();
    const result = generator.generate(createCommonTargetGraphFixture('cpp'));

    expect(result.success).toBe(true);
    expect(normalizeGeneratedCode(result.code)).toMatchFileSnapshot(goldenPath('cpp-common-regression.golden.cpp'));
  });
});
