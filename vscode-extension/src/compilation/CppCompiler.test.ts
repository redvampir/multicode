// @vitest-environment node
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { compileCpp } from './CppCompiler';

const makeTempDir = async (): Promise<string> =>
  await fs.mkdtemp(path.join(os.tmpdir(), 'multicode-cpp-compiler-test-'));

describe('CppCompiler', () => {
  it('возвращает ошибку, если отсутствует дополнительный translation unit', async () => {
    const tempDir = await makeTempDir();
    const sourceFile = path.join(tempDir, 'main.cpp');
    const outputFile = path.join(tempDir, 'a.exe');
    const missingSource = path.join(tempDir, 'dep_check_text.cpp');

    await fs.writeFile(sourceFile, 'int main() { return 0; }', 'utf8');

    const result = await compileCpp(sourceFile, outputFile, {
      additionalSourceFiles: [missingSource],
    });

    expect(result.success).toBe(false);
    expect(result.errors).toContain(`Файл не найден: ${path.normalize(missingSource)}`);
  });

  it('дедуплицирует additionalSourceFiles при проверке существования', async () => {
    const tempDir = await makeTempDir();
    const sourceFile = path.join(tempDir, 'main.cpp');
    const outputFile = path.join(tempDir, 'a.exe');
    const missingSource = path.join(tempDir, 'dep_check_text.cpp');

    await fs.writeFile(sourceFile, 'int main() { return 0; }', 'utf8');

    const result = await compileCpp(sourceFile, outputFile, {
      additionalSourceFiles: [missingSource, ` ${missingSource} `, ''],
    });

    expect(result.success).toBe(false);
    expect(result.errors).toEqual([`Файл не найден: ${path.normalize(missingSource)}`]);
  });
});
