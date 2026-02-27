import * as crypto from 'crypto';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as http from 'http';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  compileCpp,
  type CompilationResult,
  type CompilerType,
} from './CppCompiler';
import type { TranslationKey } from '../shared/translations';

export type ToolchainSource = 'system' | 'managed';
export type ToolchainMode = 'auto' | 'system' | 'managed';
export type ToolchainInstallLocation = 'global' | 'workspace';
export type ToolchainDownloadConsent = 'once' | 'always' | 'never';
export type ToolchainVersionChannel = 'pinned' | 'latest';

export interface ResolvedToolchain {
  source: ToolchainSource;
  compilerType: CompilerType;
  /** Абсолютный путь к компилятору ИЛИ командное имя (clang++/g++/cl) */
  compilerPath: string;
  /** Окружение (PATH и т.п.) для компилятора и запуска программы */
  env: NodeJS.ProcessEnv;
  /** Доп. аргументы компиляции (isysroot/sysroot/static и т.п.) */
  extraCompileArgs: string[];
  managedRoot?: string;
}

export interface ToolchainUi {
  withProgress<T>(
    title: string,
    task: (progress: (message: string) => void, signal: AbortSignal) => Promise<T>
  ): Promise<T>;

  confirm(
    message: string,
    acceptLabel: string,
    cancelLabel: string
  ): Promise<boolean>;

  showError(message: string): Promise<void>;
}

export interface ToolchainHost {
  platform: NodeJS.Platform;
  arch: NodeJS.Architecture;
  env: NodeJS.ProcessEnv;
  globalStoragePath: string;
  workspaceRootPath?: string;

  getSetting<T>(key: string, defaultValue: T): T;
  globalStateGet<T>(key: string): T | undefined;
  globalStateUpdate(key: string, value: unknown): Promise<void>;

  /** Локализация UI строк */
  translate(key: TranslationKey, replacements?: Record<string, string>): string;
  locale: 'ru' | 'en';

  ui: ToolchainUi;
  log?: (message: string, data?: unknown) => void;
}

export interface ToolchainManagerDeps {
  downloadToFile?: (
    url: string,
    destinationPath: string,
    opts?: { signal?: AbortSignal; onProgress?: (downloaded: number, total?: number) => void }
  ) => Promise<void>;
  sha256File?: (filePath: string, signal?: AbortSignal) => Promise<string>;
  extractArchive?: (
    archivePath: string,
    destinationDir: string,
    archiveKind: ManagedArchiveSpec['archiveKind']
  ) => Promise<void>;
  tryGetContentLengthBytes?: (url: string, signal?: AbortSignal) => Promise<number | null>;
}

export class ToolchainError extends Error {
  public readonly code:
    | 'consent-denied'
    | 'install-cancelled'
    | 'platform-not-supported'
    | 'toolchain-not-found'
    | 'clt-required'
    | 'download-failed'
    | 'checksum-failed'
    | 'extract-failed';

  public constructor(code: ToolchainError['code'], message: string) {
    super(message);
    this.name = 'ToolchainError';
    this.code = code;
  }
}

const DOWNLOAD_ALLOWED_KEY = 'multicode.toolchain.downloadAllowed';

interface ToolchainSettings {
  mode: ToolchainMode;
  autoInstall: boolean;
  installLocation: ToolchainInstallLocation;
  downloadConsent: ToolchainDownloadConsent;
  versionChannel: ToolchainVersionChannel;
}

interface ManagedArchiveSpec {
  id: string;
  version: string;
  url: string;
  archiveKind: 'zip' | 'tar.xz';
  /** Если задано — используем pinned SHA256 */
  sha256?: string;
  /** Если задано — скачиваем checksum из этого URL и парсим sha256 */
  sha256Url?: string;
  /** Имя файла в checksum, если нужно найти digest по имени (для jsonl) */
  expectedFileName?: string;
}

const execFileAsync = promisify(execFile);

const ensureDir = async (dir: string): Promise<void> => {
  await fsp.mkdir(dir, { recursive: true });
};

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await fsp.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const rmrf = async (targetPath: string): Promise<void> => {
  try {
    await fsp.rm(targetPath, { recursive: true, force: true });
  } catch {
    // ignore
  }
};

const sha256File = async (filePath: string, signal?: AbortSignal): Promise<string> =>
  await new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    const abort = (): void => {
      stream.destroy(new Error('aborted'));
    };
    if (signal) {
      if (signal.aborted) abort();
      signal.addEventListener('abort', abort, { once: true });
    }

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => {
      resolve(hash.digest('hex').toUpperCase());
    });
  });

const downloadToFile = async (
  url: string,
  destinationPath: string,
  opts: { signal?: AbortSignal; onProgress?: (downloaded: number, total?: number) => void } = {}
): Promise<void> => {
  const maxRedirects = 8;

  const doRequest = async (currentUrl: string, redirectsLeft: number): Promise<void> => {
    const u = new URL(currentUrl);
    const mod = u.protocol === 'https:' ? https : http;

    await new Promise<void>((resolve, reject) => {
      const request = mod.request(
        {
          method: 'GET',
          hostname: u.hostname,
          path: `${u.pathname}${u.search}`,
          headers: {
            // GitHub иногда требует User-Agent
            'User-Agent': 'MultiCode',
          },
        },
        (response) => {
          if (
            response.statusCode &&
            response.statusCode >= 300 &&
            response.statusCode < 400 &&
            response.headers.location
          ) {
            response.resume();
            if (redirectsLeft <= 0) {
              reject(new Error(`Too many redirects for ${url}`));
              return;
            }
            const nextUrl = new URL(response.headers.location, currentUrl).toString();
            void doRequest(nextUrl, redirectsLeft - 1).then(resolve, reject);
            return;
          }

          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            response.resume();
            reject(new Error(`HTTP ${response.statusCode ?? '??'} for ${currentUrl}`));
            return;
          }

          const total = response.headers['content-length']
            ? Number(response.headers['content-length'])
            : undefined;
          let downloaded = 0;

          const fileStream = fs.createWriteStream(destinationPath);
          const cleanup = (error: unknown): void => {
            try {
              fileStream.close();
            } catch {
              // ignore
            }
            void rmrf(destinationPath);
            reject(error instanceof Error ? error : new Error('Download failed'));
          };

          fileStream.on('error', cleanup);
          response.on('error', cleanup);
          response.on('data', (chunk: Buffer) => {
            downloaded += chunk.length;
            opts.onProgress?.(downloaded, total);
          });
          response.pipe(fileStream);
          fileStream.on('finish', () => {
            fileStream.close();
            resolve();
          });
        }
      );

      const abort = (): void => {
        request.destroy(new Error('aborted'));
        void rmrf(destinationPath);
        reject(new Error('aborted'));
      };
      if (opts.signal) {
        if (opts.signal.aborted) abort();
        opts.signal.addEventListener('abort', abort, { once: true });
      }

      request.on('error', (err) => {
        void rmrf(destinationPath);
        reject(err);
      });
      request.end();
    });
  };

  await doRequest(url, maxRedirects);
};

const tryGetContentLengthBytes = async (url: string, signal?: AbortSignal): Promise<number | null> => {
  const maxRedirects = 6;
  const timeoutMs = 6000;

  const doHead = async (currentUrl: string, redirectsLeft: number): Promise<number | null> => {
    const u = new URL(currentUrl);
    const mod = u.protocol === 'https:' ? https : http;

    return await new Promise<number | null>((resolve, reject) => {
      const request = mod.request(
        {
          method: 'HEAD',
          hostname: u.hostname,
          path: `${u.pathname}${u.search}`,
          headers: { 'User-Agent': 'MultiCode' },
          timeout: timeoutMs,
        },
        (response) => {
          if (
            response.statusCode &&
            response.statusCode >= 300 &&
            response.statusCode < 400 &&
            response.headers.location
          ) {
            response.resume();
            if (redirectsLeft <= 0) {
              reject(new Error(`Too many redirects for ${url}`));
              return;
            }
            const nextUrl = new URL(response.headers.location, currentUrl).toString();
            void doHead(nextUrl, redirectsLeft - 1).then(resolve, reject);
            return;
          }

          response.resume();
          const raw = response.headers['content-length'];
          const size = raw ? Number(raw) : NaN;
          resolve(Number.isFinite(size) && size > 0 ? size : null);
        }
      );

      const abort = (): void => {
        request.destroy(new Error('aborted'));
        reject(new Error('aborted'));
      };
      if (signal) {
        if (signal.aborted) abort();
        signal.addEventListener('abort', abort, { once: true });
      }

      request.on('timeout', () => request.destroy(new Error('timeout')));
      request.on('error', (err) => reject(err));
      request.end();
    });
  };

  try {
    return await doHead(url, maxRedirects);
  } catch {
    return null;
  }
};

const parseBootlinSha256 = (text: string): string => {
  const firstToken = text.trim().split(/\s+/)[0] ?? '';
  if (!/^[a-fA-F0-9]{64}$/.test(firstToken)) {
    throw new Error('Invalid sha256 format');
  }
  return firstToken.toUpperCase();
};

const parseLlvmSigstoreBundleSha256 = (jsonlText: string, expectedName: string): string => {
  const line = jsonlText.split(/\r?\n/).find((value) => value.trim().length > 0);
  if (!line) {
    throw new Error('Empty jsonl');
  }

  const outer = JSON.parse(line) as {
    dsseEnvelope?: { payload?: string };
  };
  const payloadB64 = outer.dsseEnvelope?.payload;
  if (!payloadB64) {
    throw new Error('Missing dsseEnvelope.payload');
  }

  const decoded = Buffer.from(payloadB64, 'base64').toString('utf8');
  const statement = JSON.parse(decoded) as {
    subject?: Array<{ name?: string; digest?: Record<string, string> }>;
  };

  const subject = statement.subject?.find((item) => item.name === expectedName);
  const digest = subject?.digest?.sha256;
  if (!digest || !/^[a-fA-F0-9]{64}$/.test(digest)) {
    throw new Error('Missing sha256 digest in bundle');
  }
  return digest.toUpperCase();
};

const extractArchive = async (
  archivePath: string,
  destinationDir: string,
  archiveKind: ManagedArchiveSpec['archiveKind']
): Promise<void> => {
  await ensureDir(destinationDir);

  if (archiveKind === 'zip') {
    if (process.platform !== 'win32') {
      throw new Error('zip extraction is only supported on Windows in current implementation');
    }

    // Expand-Archive работает без прав администратора, если писать в user-space.
    await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destinationDir.replace(/'/g, "''")}' -Force`,
      ],
      { timeout: 10 * 60_000, windowsHide: true }
    );
    return;
  }

  // tar.xz (macOS/Linux)
  await execFileAsync('tar', ['-xJf', archivePath, '-C', destinationDir], {
    timeout: 10 * 60_000,
    windowsHide: true,
  });
};

const prependPath = (env: NodeJS.ProcessEnv, prepend: string): NodeJS.ProcessEnv => {
  const delimiter = path.delimiter;
  const current = env.PATH ?? env.Path ?? '';
  const next = prepend + (current ? delimiter + current : '');
  return { ...env, PATH: next };
};

const getToolchainSettings = (host: ToolchainHost): ToolchainSettings => {
  const mode = host.getSetting<ToolchainMode>('cpp.toolchain.mode', 'auto');
  const autoInstall = host.getSetting<boolean>('cpp.toolchain.autoInstall', true);
  const installLocation = host.getSetting<ToolchainInstallLocation>('cpp.toolchain.installLocation', 'global');
  const downloadConsent = host.getSetting<ToolchainDownloadConsent>('cpp.toolchain.downloadConsent', 'once');
  const versionChannel = host.getSetting<ToolchainVersionChannel>('cpp.toolchain.managedVersionChannel', 'pinned');

  const normalizeMode = (value: string): ToolchainMode =>
    value === 'system' || value === 'managed' || value === 'auto' ? value : 'auto';

  const normalizeLocation = (value: string): ToolchainInstallLocation =>
    value === 'workspace' || value === 'global' ? value : 'global';

  const normalizeConsent = (value: string): ToolchainDownloadConsent =>
    value === 'always' || value === 'never' || value === 'once' ? value : 'once';

  const normalizeChannel = (value: string): ToolchainVersionChannel =>
    value === 'latest' || value === 'pinned' ? value : 'pinned';

  return {
    mode: normalizeMode(String(mode)),
    autoInstall: Boolean(autoInstall),
    installLocation: normalizeLocation(String(installLocation)),
    downloadConsent: normalizeConsent(String(downloadConsent)),
    versionChannel: normalizeChannel(String(versionChannel)),
  };
};

const getToolchainsRoot = async (host: ToolchainHost, settings: ToolchainSettings): Promise<string> => {
  if (settings.installLocation === 'workspace' && host.workspaceRootPath) {
    const root = path.join(host.workspaceRootPath, '.multicode', 'toolchains');
    await ensureDir(root);
    return root;
  }

  const root = path.join(host.globalStoragePath, 'toolchains');
  await ensureDir(root);
  return root;
};

const writeInstallMarker = async (installDir: string, spec: ManagedArchiveSpec): Promise<void> => {
  const markerPath = path.join(installDir, 'multicode-toolchain.json');
  const payload = {
    id: spec.id,
    version: spec.version,
    url: spec.url,
    installedAt: new Date().toISOString(),
  };
  await fsp.writeFile(markerPath, JSON.stringify(payload, null, 2), 'utf8');
};

const isInstalled = async (installDir: string): Promise<boolean> =>
  await fileExists(path.join(installDir, 'multicode-toolchain.json'));

const downloadText = async (
  url: string,
  download: (
    url: string,
    destinationPath: string,
    opts?: { signal?: AbortSignal; onProgress?: (downloaded: number, total?: number) => void }
  ) => Promise<void>,
  signal?: AbortSignal
): Promise<string> => {
  const tmp = path.join(os.tmpdir(), `multicode_dl_${Date.now()}_${Math.random().toString(16).slice(2)}.txt`);
  try {
    await download(url, tmp, { signal });
    return await fsp.readFile(tmp, 'utf8');
  } finally {
    void rmrf(tmp);
  }
};

const ensureManagedArchiveInstalled = async (
  host: ToolchainHost,
  rootDir: string,
  spec: ManagedArchiveSpec,
  deps: ToolchainManagerDeps,
  signal?: AbortSignal
): Promise<string> => {
  const download = deps.downloadToFile ?? downloadToFile;
  const computeSha256 = deps.sha256File ?? sha256File;
  const extract = deps.extractArchive ?? extractArchive;

  const installDir = path.join(rootDir, spec.id, spec.version);
  if (await isInstalled(installDir)) {
    return installDir;
  }

  await ensureDir(path.dirname(installDir));

  const expectedSha =
    spec.sha256 ??
    (spec.sha256Url
      ? (() => {
          if (!spec.expectedFileName) {
            return downloadText(spec.sha256Url!, download, signal).then(parseBootlinSha256);
          }
          return downloadText(spec.sha256Url!, download, signal).then((text) =>
            parseLlvmSigstoreBundleSha256(text, spec.expectedFileName!)
          );
        })()
      : Promise.resolve(undefined));

  const resolvedExpectedSha = (await expectedSha) ?? undefined;
  if (!resolvedExpectedSha) {
    throw new ToolchainError('checksum-failed', `Не удалось получить sha256 для ${spec.url}`);
  }

  const urlFileName = path.basename(new URL(spec.url).pathname);
  const downloadPath = path.join(
    os.tmpdir(),
    `multicode_${spec.id}_${spec.version}_${Date.now()}_${urlFileName}`
  );

  const installTmpDir = `${installDir}.partial-${Date.now()}`;

  try {
    await host.ui.withProgress(host.translate('toolchain.downloading'), async (report, innerSignal) => {
      const effectiveSignal = signal ?? innerSignal;
      report(host.translate('toolchain.downloading'));
      try {
        await download(spec.url, downloadPath, {
          signal: effectiveSignal,
          onProgress: (downloaded, total) => {
            if (!total) return;
            const percent = Math.max(0, Math.min(100, Math.floor((downloaded / total) * 100)));
            report(`${host.translate('toolchain.downloading')} (${percent}%)`);
          },
        });
      } catch (error) {
        if (error instanceof Error && error.message === 'aborted') {
          throw new ToolchainError('install-cancelled', host.translate('toolchain.installCancelled'));
        }
        throw new ToolchainError(
          'download-failed',
          host.translate('toolchain.installFailed', { reason: String(error) })
        );
      }
    });

    const actualSha = await computeSha256(downloadPath, signal);
    if (actualSha.toUpperCase() !== resolvedExpectedSha.toUpperCase()) {
      throw new ToolchainError(
        'checksum-failed',
        `SHA256 не совпал для ${spec.url}. Ожидалось ${resolvedExpectedSha}, получено ${actualSha}`
      );
    }

    await host.ui.withProgress(host.translate('toolchain.extracting'), async (report) => {
      report(host.translate('toolchain.extracting'));
      await rmrf(installTmpDir);
      try {
        await extract(downloadPath, installTmpDir, spec.archiveKind);
      } catch (error) {
        throw new ToolchainError(
          'extract-failed',
          host.translate('toolchain.installFailed', { reason: String(error) })
        );
      }
    });

    await writeInstallMarker(installTmpDir, spec);

    // Atomic-ish replace
    await rmrf(installDir);
    await fsp.rename(installTmpDir, installDir);

    return installDir;
  } catch (error) {
    await rmrf(installTmpDir);
    if (error instanceof ToolchainError) {
      throw error;
    }
    throw new ToolchainError('extract-failed', host.translate('toolchain.installFailed', { reason: String(error) }));
  } finally {
    await rmrf(downloadPath);
  }
};

const makeProbeSource = (): string => `#include <iostream>
int main() { std::cout << "multicode"; return 0; }
`;

const probeCompiler = async (
  host: ToolchainHost,
  compilerPath: string | undefined,
  compilerType: CompilerType | undefined,
  env: NodeJS.ProcessEnv | undefined,
  extraArgs: string[] | undefined
): Promise<CompilationResult> => {
  const tmpDir = os.tmpdir();
  const stamp = Date.now();
  const sourceFile = path.join(tmpDir, `multicode_probe_${stamp}.cpp`);
  const outExt = host.platform === 'win32' ? '.exe' : '';
  const outputFile = path.join(tmpDir, `multicode_probe_${stamp}${outExt}`);

  try {
    await fsp.writeFile(sourceFile, makeProbeSource(), 'utf8');
    return await compileCpp(sourceFile, outputFile, {
      standard: 'cpp23',
      strictStandard: true,
      optimization: 'O0',
      compiler: compilerType,
      compilerPath,
      env,
      extraArgs,
    });
  } finally {
    void rmrf(sourceFile);
    void rmrf(outputFile);
  }
};

const resolveLlvmReleaseSpecs = (
  host: ToolchainHost,
  channel: ToolchainVersionChannel
): { version: string; linuxArm64: ManagedArchiveSpec; macArm64: ManagedArchiveSpec } => {
  // На данном этапе поддерживаем только pinned канал для managed LLVM.
  const version = '21.1.8';
  if (channel !== 'pinned') {
    // Для "latest" нужно будет добавить динамический резолв через GitHub API + верификацию.
  }

  const base = `https://github.com/llvm/llvm-project/releases/download/llvmorg-${version}`;

  return {
    version,
    linuxArm64: {
      id: 'llvm-linux-arm64',
      version,
      url: `${base}/LLVM-${version}-Linux-ARM64.tar.xz`,
      sha256Url: `${base}/LLVM-${version}-Linux-ARM64.tar.xz.jsonl`,
      expectedFileName: `LLVM-${version}-Linux-ARM64.tar.xz`,
      archiveKind: 'tar.xz',
    },
    macArm64: {
      id: 'llvm-macos-arm64',
      version,
      url: `${base}/LLVM-${version}-macOS-ARM64.tar.xz`,
      sha256Url: `${base}/LLVM-${version}-macOS-ARM64.tar.xz.jsonl`,
      expectedFileName: `LLVM-${version}-macOS-ARM64.tar.xz`,
      archiveKind: 'tar.xz',
    },
  };
};

const resolveManagedToolchainSpecs = (
  host: ToolchainHost,
  settings: ToolchainSettings
): { main: ManagedArchiveSpec; extra?: ManagedArchiveSpec } | null => {
  if (host.platform === 'win32') {
    if (host.arch === 'x64') {
      return {
        main: {
          id: 'llvm-mingw-ucrt-win32',
          version: '21.1.8-20251216',
          url: 'https://github.com/mstorsjo/llvm-mingw/releases/download/20251216/llvm-mingw-20251216-ucrt-x86_64.zip',
          sha256: '2D96A4B758F7F8DEAEC5065833FE025AA53CFC5F704D0524002510984DA0CCF4',
          archiveKind: 'zip',
        },
      };
    }
    if (host.arch === 'arm64') {
      return {
        main: {
          id: 'llvm-mingw-ucrt-win32',
          version: '21.1.8-20251216',
          url: 'https://github.com/mstorsjo/llvm-mingw/releases/download/20251216/llvm-mingw-20251216-ucrt-aarch64.zip',
          sha256: '60C06BD255FEB2EF1EB6FCE7EE6B307D8F78EE6639660F49861C7C10A8A86164',
          archiveKind: 'zip',
        },
      };
    }
    return null;
  }

  if (host.platform === 'linux') {
    if (host.arch === 'x64') {
      return {
        main: {
          id: 'bootlin-x86_64-musl',
          version: 'stable-2025.08-1',
          url: 'https://toolchains.bootlin.com/downloads/releases/toolchains/x86-64/tarballs/x86-64--musl--stable-2025.08-1.tar.xz',
          sha256Url:
            'https://toolchains.bootlin.com/downloads/releases/toolchains/x86-64/tarballs/x86-64--musl--stable-2025.08-1.sha256',
          archiveKind: 'tar.xz',
        },
      };
    }

    if (host.arch === 'arm64') {
      const llvm = resolveLlvmReleaseSpecs(host, settings.versionChannel);
      return {
        main: llvm.linuxArm64,
        extra: {
          id: 'bootlin-aarch64-musl',
          version: 'stable-2025.08-1',
          url: 'https://toolchains.bootlin.com/downloads/releases/toolchains/aarch64/tarballs/aarch64--musl--stable-2025.08-1.tar.xz',
          sha256Url:
            'https://toolchains.bootlin.com/downloads/releases/toolchains/aarch64/tarballs/aarch64--musl--stable-2025.08-1.sha256',
          archiveKind: 'tar.xz',
        },
      };
    }

    return null;
  }

  if (host.platform === 'darwin') {
    const llvm = resolveLlvmReleaseSpecs(host, settings.versionChannel);
    if (host.arch === 'arm64') {
      return { main: llvm.macArm64 };
    }
    return null;
  }

  return null;
};

const findFirstMatchingFile = async (
  rootDir: string,
  predicate: (candidatePath: string, dirent: fs.Dirent) => boolean,
  maxDepth = 6
): Promise<string | null> => {
  const visit = async (dir: string, depth: number): Promise<string | null> => {
    if (depth > maxDepth) return null;
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return null;
    }

    for (const entry of entries) {
      const candidate = path.join(dir, entry.name);
      if (predicate(candidate, entry)) {
        return candidate;
      }
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(dir, entry.name);
      const found = await visit(candidate, depth + 1);
      if (found) return found;
    }

    return null;
  };

  return await visit(rootDir, 0);
};

const resolveCompilerPathFromInstall = async (
  installDir: string,
  kind: 'clang' | 'gcc',
  hostPlatform: NodeJS.Platform
): Promise<{ compilerPath: string; binDir: string } | null> => {
  const expectedName =
    kind === 'clang'
      ? hostPlatform === 'win32'
        ? 'clang++.exe'
        : 'clang++'
      : hostPlatform === 'win32'
        ? 'g++.exe'
        : 'g++';

  const found = await findFirstMatchingFile(
    installDir,
    (candidate, dirent) => dirent.isFile() && path.basename(candidate).toLowerCase() === expectedName.toLowerCase(),
    7
  );

  if (!found) return null;
  return { compilerPath: found, binDir: path.dirname(found) };
};

const resolveBootlinGppFromInstall = async (
  bootlinInstallDir: string,
  arch: NodeJS.Architecture
): Promise<{ compilerPath: string; binDir: string } | null> => {
  const prefix = arch === 'arm64' ? 'aarch64-' : 'x86_64-';
  const found = await findFirstMatchingFile(
    bootlinInstallDir,
    (candidate, dirent) => {
      if (!dirent.isFile()) return false;
      const name = path.basename(candidate);
      return name.startsWith(prefix) && name.endsWith('-g++') && candidate.includes(`${path.sep}bin${path.sep}`);
    },
    8
  );

  if (!found) return null;
  return { compilerPath: found, binDir: path.dirname(found) };
};

const findBootlinSysrootDir = async (toolchainRoot: string, maxDepth = 8): Promise<string | null> => {
  const visit = async (dir: string, depth: number): Promise<string | null> => {
    if (depth > maxDepth) return null;
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return null;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name !== 'sysroot') continue;
      const candidate = path.join(dir, entry.name);
      const header = path.join(candidate, 'usr', 'include', 'stdio.h');
      if (await fileExists(header)) {
        return candidate;
      }
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(dir, entry.name);
      const found = await visit(candidate, depth + 1);
      if (found) return found;
    }

    return null;
  };

  return await visit(toolchainRoot, 0);
};

const resolveBootlinTripleAndRoot = async (
  bootlinInstallDir: string,
  arch: NodeJS.Architecture
): Promise<{ triple: string; toolchainRoot: string; sysroot: string } | null> => {
  // Ищем <toolchainRoot>/bin/<triple>-gcc
  const gccNamePrefix = arch === 'arm64' ? 'aarch64' : 'x86_64';
  const gccPath = await findFirstMatchingFile(
    bootlinInstallDir,
    (candidate, dirent) =>
      dirent.isFile() &&
      path.basename(candidate).startsWith(`${gccNamePrefix}-`) &&
      (candidate.endsWith('-gcc') || candidate.endsWith('-gcc.exe')) &&
      candidate.includes(`${path.sep}bin${path.sep}`),
    8
  );

  if (!gccPath) return null;
  const toolchainRoot = path.dirname(path.dirname(gccPath));
  const base = path.basename(gccPath);
  const triple = base.replace(/-gcc(\.exe)?$/, '');

  // sysroot обычно лежит в <toolchainRoot>/<triple>/sysroot или где-то рядом; найдём надёжно.
  const sysroot = await findBootlinSysrootDir(toolchainRoot);

  if (!sysroot) return null;
  return { triple, toolchainRoot, sysroot };
};

const ensureMacClt = async (host: ToolchainHost): Promise<void> => {
  if (host.platform !== 'darwin') return;

  try {
    await execFileAsync('xcode-select', ['-p'], { timeout: 8000, windowsHide: true });
  } catch {
    // Попробуем инициировать установку
    try {
      await execFileAsync('xcode-select', ['--install'], { timeout: 8000, windowsHide: true });
    } catch {
      // ignore: даже если команда вернула ошибку (например, уже идёт установка), сообщение всё равно показываем.
    }
    throw new ToolchainError('clt-required', host.translate('toolchain.macosCltRequired'));
  }
};

const resolveMacSdkArgs = async (): Promise<string[]> => {
  try {
    const { stdout } = await execFileAsync('xcrun', ['--show-sdk-path'], {
      timeout: 8000,
      windowsHide: true,
    });
    const sdkPath = stdout.trim();
    if (!sdkPath) return [];
    return ['-isysroot', sdkPath];
  } catch {
    return [];
  }
};

const ensureDownloadConsent = async (
  host: ToolchainHost,
  settings: ToolchainSettings,
  sizeHint: string
): Promise<void> => {
  if (settings.downloadConsent === 'never') {
    throw new ToolchainError(
      'consent-denied',
      host.locale === 'ru'
        ? 'Загрузка managed toolchain запрещена настройкой multicode.cpp.toolchain.downloadConsent=never.'
        : 'Managed toolchain download is disabled by multicode.cpp.toolchain.downloadConsent=never.'
    );
  }

  if (settings.downloadConsent === 'always') {
    const ok = await host.ui.confirm(
      host.translate('toolchain.downloadPrompt', { sizeHint }),
      host.locale === 'ru' ? 'Скачать' : 'Download',
      host.locale === 'ru' ? 'Отмена' : 'Cancel'
    );
    if (!ok) {
      throw new ToolchainError('consent-denied', host.translate('toolchain.installCancelled'));
    }
    return;
  }

  const cached = host.globalStateGet<boolean>(DOWNLOAD_ALLOWED_KEY);
  if (typeof cached === 'boolean') {
    if (!cached) {
      throw new ToolchainError('consent-denied', host.translate('toolchain.installCancelled'));
    }
    return;
  }

  const ok = await host.ui.confirm(
    host.translate('toolchain.downloadPrompt', { sizeHint }),
    host.locale === 'ru' ? 'Скачать' : 'Download',
    host.locale === 'ru' ? 'Отмена' : 'Cancel'
  );

  await host.globalStateUpdate(DOWNLOAD_ALLOWED_KEY, ok);
  if (!ok) {
    throw new ToolchainError('consent-denied', host.translate('toolchain.installCancelled'));
  }
};

const tryResolveSystemToolchain = async (host: ToolchainHost): Promise<ResolvedToolchain | null> => {
  if (host.platform === 'darwin') {
    await ensureMacClt(host);
  }

  const probe = await probeCompiler(host, undefined, undefined, host.env, []);
  if (!probe.success || !probe.compilerType || !probe.compilerCommand) {
    return null;
  }

  return {
    source: 'system',
    compilerType: probe.compilerType,
    compilerPath: probe.compilerCommand,
    env: host.env,
    extraCompileArgs: host.platform === 'darwin' ? await resolveMacSdkArgs() : [],
  };
};

/**
 * Определяет системный компилятор (если он реально умеет C++23),
 * иначе (по настройкам) скачивает managed toolchain и возвращает его.
 */
export async function ensureCppToolchain(host: ToolchainHost): Promise<ResolvedToolchain> {
  return await ensureCppToolchainWithDeps(host, {});
}

export async function ensureCppToolchainWithDeps(
  host: ToolchainHost,
  deps: ToolchainManagerDeps
): Promise<ResolvedToolchain> {
  const settings = getToolchainSettings(host);
  const wantSystem = settings.mode === 'auto' || settings.mode === 'system';
  const wantManaged = settings.mode === 'auto' || settings.mode === 'managed';

  if (wantSystem) {
    const system = await tryResolveSystemToolchain(host);
    if (system) {
      host.log?.('[Toolchain] Используется системный компилятор', system);
      return system;
    }
    if (settings.mode === 'system') {
      throw new ToolchainError('toolchain-not-found', 'Системный компилятор с поддержкой C++23 не найден');
    }
  }

  if (!wantManaged) {
    throw new ToolchainError('toolchain-not-found', 'Managed toolchain отключён настройками');
  }

  if (!settings.autoInstall) {
    throw new ToolchainError('toolchain-not-found', 'Авто-установка компилятора отключена (multicode.cpp.toolchain.autoInstall=false)');
  }

  const managed = await ensureManagedToolchainWithDeps(host, settings, deps);

  // Факт наличия toolchain == не гарантия, что он реально компилирует; проверим короткой probe-компиляцией.
  const probe = await probeCompiler(
    host,
    managed.compilerPath,
    managed.compilerType,
    managed.env,
    managed.extraCompileArgs
  );

  if (!probe.success) {
    throw new ToolchainError('toolchain-not-found', `Установленный toolchain не прошёл проверку C++23: ${probe.stderr || probe.errors[0] || 'unknown error'}`);
  }

  host.log?.('[Toolchain] Используется managed toolchain', managed);
  return managed;
}

const ensureManagedToolchainWithDeps = async (
  host: ToolchainHost,
  settings: ToolchainSettings,
  deps: ToolchainManagerDeps
): Promise<ResolvedToolchain> => {
  const specs = resolveManagedToolchainSpecs(host, settings);
  if (!specs) {
    throw new ToolchainError('platform-not-supported', `Managed toolchain не поддержан: ${host.platform}/${host.arch}`);
  }

  const toolchainsRoot = await getToolchainsRoot(host, settings);

  const plannedMainInstallDir = path.join(toolchainsRoot, specs.main.id, specs.main.version);
  const plannedExtraInstallDir = specs.extra
    ? path.join(toolchainsRoot, specs.extra.id, specs.extra.version)
    : undefined;

  const needMain = !(await isInstalled(plannedMainInstallDir));
  const needExtra = plannedExtraInstallDir ? !(await isInstalled(plannedExtraInstallDir)) : false;
  const needsDownload = needMain || needExtra;

  if (needsDownload) {
    const cached = host.globalStateGet<boolean>(DOWNLOAD_ALLOWED_KEY);
    const needsPrompt =
      settings.downloadConsent === 'always' ||
      (settings.downloadConsent === 'once' && typeof cached !== 'boolean');

    let sizeHint = '';
    if (needsPrompt) {
      const urls = [specs.main.url, specs.extra?.url].filter(Boolean) as string[];
      const getLengthBytes = deps.tryGetContentLengthBytes ?? tryGetContentLengthBytes;
      const sizes = await Promise.all(urls.map((url) => getLengthBytes(url)));
      const totalBytes = sizes.reduce<number>((acc, value) => acc + (value ?? 0), 0);
      sizeHint =
        totalBytes > 0
          ? host.locale === 'ru'
            ? ` (≈${Math.ceil(totalBytes / (1024 * 1024))} МБ)`
            : ` (~${Math.ceil(totalBytes / (1024 * 1024))} MB)`
          : '';
    }

    await ensureDownloadConsent(host, settings, sizeHint);
  }

  const mainInstallDir = await ensureManagedArchiveInstalled(host, toolchainsRoot, specs.main, deps);
  const extraInstallDir = specs.extra
    ? await ensureManagedArchiveInstalled(host, toolchainsRoot, specs.extra, deps)
    : undefined;

  if (host.platform === 'darwin') {
    await ensureMacClt(host);
  }

  if (host.platform === 'win32') {
    const resolved = await resolveCompilerPathFromInstall(mainInstallDir, 'clang', host.platform);
    if (!resolved) {
      throw new ToolchainError('toolchain-not-found', 'Не найден clang++ внутри установленного llvm-mingw');
    }

    const env = prependPath(host.env, resolved.binDir);
    return {
      source: 'managed',
      compilerType: 'clang',
      compilerPath: resolved.compilerPath,
      env,
      extraCompileArgs: [],
      managedRoot: mainInstallDir,
    };
  }

  if (host.platform === 'linux') {
    if (host.arch === 'x64') {
      const resolved = await resolveBootlinGppFromInstall(mainInstallDir, host.arch);
      if (!resolved) {
        throw new ToolchainError('toolchain-not-found', 'Не найден g++ внутри установленного Bootlin toolchain');
      }

      const env = prependPath(host.env, resolved.binDir);
      return {
        source: 'managed',
        compilerType: 'gcc',
        compilerPath: resolved.compilerPath,
        env,
        extraCompileArgs: ['-static', '-static-libstdc++', '-static-libgcc'],
        managedRoot: mainInstallDir,
      };
    }

    if (host.arch === 'arm64') {
      if (!extraInstallDir) {
        throw new ToolchainError('toolchain-not-found', 'Не установлен sysroot (Bootlin) для Linux arm64');
      }

      const llvmResolved = await resolveCompilerPathFromInstall(mainInstallDir, 'clang', host.platform);
      if (!llvmResolved) {
        throw new ToolchainError('toolchain-not-found', 'Не найден clang++ внутри LLVM toolchain');
      }

      const bootlin = await resolveBootlinTripleAndRoot(extraInstallDir, host.arch);
      if (!bootlin) {
        throw new ToolchainError('toolchain-not-found', 'Не удалось определить triple/sysroot в Bootlin toolchain');
      }

      const env = prependPath(host.env, llvmResolved.binDir);
      return {
        source: 'managed',
        compilerType: 'clang',
        compilerPath: llvmResolved.compilerPath,
        env,
        extraCompileArgs: [
          `--target=${bootlin.triple}`,
          `--gcc-toolchain=${bootlin.toolchainRoot}`,
          `--sysroot=${bootlin.sysroot}`,
          '-fuse-ld=lld',
          '-static',
          '-static-libstdc++',
          '-static-libgcc',
        ],
        managedRoot: mainInstallDir,
      };
    }
  }

  if (host.platform === 'darwin') {
    // Managed поддерживается только на arm64 (LLVM tarball). На x64 используем system toolchain.
    const resolved = await resolveCompilerPathFromInstall(mainInstallDir, 'clang', host.platform);
    if (!resolved) {
      throw new ToolchainError('toolchain-not-found', 'Не найден clang++ внутри LLVM toolchain (macOS)');
    }

    const sdkArgs = await resolveMacSdkArgs();
    const env = prependPath(host.env, resolved.binDir);
    return {
      source: 'managed',
      compilerType: 'clang',
      compilerPath: resolved.compilerPath,
      env,
      extraCompileArgs: [...sdkArgs, '-stdlib=libc++'],
      managedRoot: mainInstallDir,
    };
  }

  throw new ToolchainError('platform-not-supported', `Managed toolchain не поддержан: ${host.platform}/${host.arch}`);
};
