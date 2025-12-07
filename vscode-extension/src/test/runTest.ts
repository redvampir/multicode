import fs from 'fs';
import path from 'path';
import { downloadAndUnzipVSCode, runTests } from '@vscode/test-electron';

const resolveVsCodeExecutable = (): string | undefined => {
  const candidates = [
    process.env.VSCODE_EXECUTABLE,
    process.env.VSCODE_EXECUTABLE_PATH,
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe')
      : undefined,
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'Microsoft VS Code', 'Code.exe') : undefined,
    process.env['ProgramFiles(x86)']
      ? path.join(process.env['ProgramFiles(x86)'], 'Microsoft VS Code', 'Code.exe')
      : undefined
  ].filter(Boolean) as string[];

  return candidates.find((candidate) => fs.existsSync(candidate));
};

const shouldSkip = process.env.SKIP_VSCODE_TESTS !== '0';

const downloadVsCodeWithTimeout = async (): Promise<string | undefined> => {
  try {
    const cachePath = path.resolve(__dirname, '../../.vscode-test');
    return await downloadAndUnzipVSCode({
      cachePath,
      timeout: 60_000,
      version: '1.85.0'
    });
  } catch (error) {
    console.warn('VS Code download failed, will try system installation:', error);
    return undefined;
  }
};

async function main(): Promise<void> {
  if (shouldSkip) {
    console.warn('Skipping VS Code integration tests (SKIP_VSCODE_TESTS=1).');
    return;
  }

  const extensionDevelopmentPath = path.resolve(__dirname, '..', '..');
  const extensionTestsPath = path.resolve(__dirname, './suite/index');

  const downloadedExecutable = await downloadVsCodeWithTimeout();
  const vscodeExecutablePath =
    downloadedExecutable || (process.env.USE_SYSTEM_VSCODE === '1' ? resolveVsCodeExecutable() : undefined);

  if (!vscodeExecutablePath) {
    console.warn('VS Code executable not available; skipping integration tests.');
    return;
  }

  await runTests({ extensionDevelopmentPath, extensionTestsPath, vscodeExecutablePath });
}

main().catch((error) => {
  console.error('Failed to run VS Code tests:', error);
  process.exit(1);
});
