// @vitest-environment node
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { describe, expect, it, vi } from 'vitest';
import type { CompilationOptions, CompilationResult } from './CppCompiler';

vi.mock('./CppCompiler', () => ({
  compileCpp: vi.fn(),
}));

const makeTempDir = async (): Promise<string> =>
  await fs.mkdtemp(path.join(os.tmpdir(), 'multicode-toolchain-test-'));

const makeHost = async (overrides?: Partial<import('./ToolchainManager').ToolchainHost>) => {
  const storageRoot = await makeTempDir();
  const state = new Map<string, unknown>();

  const host: import('./ToolchainManager').ToolchainHost = {
    platform: 'win32',
    arch: 'x64',
    env: { ...process.env },
    globalStoragePath: storageRoot,
    workspaceRootPath: undefined,
    locale: 'ru',
    getSetting: <T,>(key: string, defaultValue: T): T => defaultValue,
    globalStateGet: <T,>(key: string): T | undefined => state.get(key) as T | undefined,
    globalStateUpdate: async (key: string, value: unknown): Promise<void> => {
      state.set(key, value);
    },
    translate: (key, replacements) => {
      if (!replacements) return key;
      return `${key} ${JSON.stringify(replacements)}`;
    },
    ui: {
      withProgress: async (_title, task) => {
        const controller = new AbortController();
        return await task(() => {}, controller.signal);
      },
      confirm: async () => true,
      showError: async () => {},
    },
  };

  Object.assign(host, overrides ?? {});
  return { host, storageRoot, state };
};

const makeCompilationResult = (partial: Partial<CompilationResult>): CompilationResult => ({
  success: false,
  errors: [],
  warnings: [],
  stdout: '',
  stderr: '',
  duration: 1,
  ...partial,
});

describe('ToolchainManager', () => {
  it('использует system toolchain, если probe C++23 успешен', async () => {
    const { compileCpp } = await import('./CppCompiler');
    const compileCppMock = vi.mocked(compileCpp);
    compileCppMock.mockResolvedValue(
      makeCompilationResult({
        success: true,
        compilerType: 'clang',
        compilerCommand: 'clang++',
        standardUsed: 'cpp23',
      })
    );

    const { ensureCppToolchainWithDeps } = await import('./ToolchainManager');
    const { host } = await makeHost({
      platform: 'win32',
      arch: 'x64',
      getSetting: <T,>(key: string, def: T): T => {
        if (key === 'cpp.toolchain.mode') return 'auto' as T;
        return def;
      },
    });

    const toolchain = await ensureCppToolchainWithDeps(host, {});
    expect(toolchain.source).toBe('system');
    expect(toolchain.compilerPath).toBe('clang++');
    expect(toolchain.compilerType).toBe('clang');
  });

  it('падает с consent-denied, если пользователь отказался от скачивания (once)', async () => {
    const { compileCpp } = await import('./CppCompiler');
    const compileCppMock = vi.mocked(compileCpp);
    compileCppMock.mockResolvedValue(
      makeCompilationResult({
        success: false,
        errors: ['no compiler'],
        compilerType: undefined,
        compilerCommand: undefined,
      })
    );

    const { ensureCppToolchainWithDeps, ToolchainError } = await import('./ToolchainManager');
    const { host } = await makeHost({
      platform: 'win32',
      arch: 'x64',
      ui: {
        withProgress: async (_title, task) => {
          const controller = new AbortController();
          return await task(() => {}, controller.signal);
        },
        confirm: async () => false,
        showError: async () => {},
      },
      getSetting: <T,>(key: string, def: T): T => {
        if (key === 'cpp.toolchain.mode') return 'managed' as T;
        if (key === 'cpp.toolchain.autoInstall') return true as T;
        if (key === 'cpp.toolchain.downloadConsent') return 'once' as T;
        return def;
      },
    });

    const promise = ensureCppToolchainWithDeps(host, { tryGetContentLengthBytes: async () => null });
    await expect(promise).rejects.toBeInstanceOf(ToolchainError);
    await expect(promise).rejects.toMatchObject({ code: 'consent-denied' });
  });

  it('в managed режиме может установить toolchain через deps (download+extract) без интернета', async () => {
    const { compileCpp } = await import('./CppCompiler');
    const compileCppMock = vi.mocked(compileCpp);
    compileCppMock.mockImplementation(async (_src, _out, opts?: Partial<CompilationOptions>) => {
      // system probe отключён (mode=managed), но managed probe должен быть успешным
      if (opts?.compilerPath && String(opts.compilerPath).includes('g++')) {
        return makeCompilationResult({
          success: true,
          compilerType: 'gcc',
          compilerCommand: opts.compilerPath,
          standardUsed: 'cpp23',
        });
      }
      return makeCompilationResult({ success: false, errors: ['probe failed'] });
    });

    const { ensureCppToolchainWithDeps } = await import('./ToolchainManager');
    const { host, storageRoot, state } = await makeHost({
      platform: 'linux',
      arch: 'x64',
      locale: 'en',
      getSetting: <T,>(key: string, def: T): T => {
        if (key === 'cpp.toolchain.mode') return 'managed' as T;
        if (key === 'cpp.toolchain.autoInstall') return true as T;
        if (key === 'cpp.toolchain.downloadConsent') return 'once' as T;
        if (key === 'cpp.toolchain.managedVersionChannel') return 'pinned' as T;
        if (key === 'cpp.toolchain.installLocation') return 'global' as T;
        return def;
      },
    });

    // Пропускаем prompt: считаем, что пользователь уже разрешил скачивание ранее
    state.set('multicode.toolchain.downloadAllowed', true);

    const fakeSha = 'A'.repeat(64);

    const toolchain = await ensureCppToolchainWithDeps(host, {
      downloadToFile: async (url, destinationPath) => {
        // Для checksum URL (.sha256) возвращаем ожидаемый sha.
        if (url.endsWith('.sha256')) {
          await fs.writeFile(destinationPath, `${fakeSha}  bootlin.tar.xz\n`, 'utf8');
          return;
        }
        // Для архива — произвольное содержимое (sha256File мы тоже мокнем).
        await fs.writeFile(destinationPath, 'dummy', 'utf8');
      },
      sha256File: async () => fakeSha,
      extractArchive: async (_archivePath, destinationDir) => {
        // Создаём структуру, которую ожидает resolveBootlinGppFromInstall().
        const binDir = path.join(destinationDir, 'x86_64-buildroot-linux-musl', 'bin');
        await fs.mkdir(binDir, { recursive: true });
        await fs.writeFile(path.join(binDir, 'x86_64-buildroot-linux-musl-g++'), 'echo', 'utf8');
      },
    });

    expect(toolchain.source).toBe('managed');
    expect(toolchain.compilerType).toBe('gcc');
    expect(toolchain.compilerPath).toContain('x86_64-buildroot-linux-musl-g++');

    // Убедимся, что marker-файл записан в глобальное хранилище.
    const marker = path.join(
      storageRoot,
      'toolchains',
      'bootlin-x86_64-musl',
      'stable-2025.08-1',
      'multicode-toolchain.json'
    );
    expect(await fs.readFile(marker, 'utf8')).toContain('bootlin-x86_64-musl');
  });

  it('в managed Windows режиме передаёт в extractArchive путь с расширением .zip', async () => {
    const { compileCpp } = await import('./CppCompiler');
    const compileCppMock = vi.mocked(compileCpp);
    compileCppMock.mockImplementation(async (_src, _out, opts?: Partial<CompilationOptions>) => {
      if (opts?.compilerPath && String(opts.compilerPath).toLowerCase().includes('clang++')) {
        return makeCompilationResult({
          success: true,
          compilerType: 'clang',
          compilerCommand: opts.compilerPath,
          standardUsed: 'cpp23',
        });
      }
      return makeCompilationResult({ success: false, errors: ['probe failed'] });
    });

    const { ensureCppToolchainWithDeps } = await import('./ToolchainManager');
    const { host, state } = await makeHost({
      platform: 'win32',
      arch: 'x64',
      locale: 'ru',
      getSetting: <T,>(key: string, def: T): T => {
        if (key === 'cpp.toolchain.mode') return 'managed' as T;
        if (key === 'cpp.toolchain.autoInstall') return true as T;
        if (key === 'cpp.toolchain.downloadConsent') return 'once' as T;
        if (key === 'cpp.toolchain.managedVersionChannel') return 'pinned' as T;
        if (key === 'cpp.toolchain.installLocation') return 'global' as T;
        return def;
      },
    });

    state.set('multicode.toolchain.downloadAllowed', true);

    const fakeSha = '2D96A4B758F7F8DEAEC5065833FE025AA53CFC5F704D0524002510984DA0CCF4';
    let extractedArchivePath: string | null = null;

    const toolchain = await ensureCppToolchainWithDeps(host, {
      downloadToFile: async (_url, destinationPath) => {
        await fs.writeFile(destinationPath, 'dummy', 'utf8');
      },
      sha256File: async () => fakeSha,
      extractArchive: async (archivePath, destinationDir) => {
        extractedArchivePath = archivePath;
        const binDir = path.join(destinationDir, 'llvm-mingw-20251216-ucrt-x86_64', 'bin');
        await fs.mkdir(binDir, { recursive: true });
        await fs.writeFile(path.join(binDir, 'clang++.exe'), 'echo', 'utf8');
      },
    });

    expect(toolchain.source).toBe('managed');
    expect(toolchain.compilerType).toBe('clang');
    expect(extractedArchivePath).not.toBeNull();
    expect(String(extractedArchivePath).toLowerCase().endsWith('.zip')).toBe(true);
  });
});
