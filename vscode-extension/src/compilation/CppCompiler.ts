/**
 * CppCompiler — управление компиляцией C++ кода
 * 
 * Функции:
 * - Поиск компилятора (MSVC, GCC, Clang)
 * - Компиляция с выбранным стандартом (C++17/20/23)
 * - Запуск скомпилированного кода
 * - Обработка ошибок компиляции
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFile, spawnSync } from 'child_process';
import { promisify } from 'util';

export type CppStandard = 'cpp14' | 'cpp17' | 'cpp20' | 'cpp23';
export type CompilerType = 'msvc' | 'gcc' | 'clang';

export interface CompilationOptions {
  /** Стандарт C++ */
  standard: CppStandard;
  /** Строго придерживаться выбранного стандарта (без fallback на более старые) */
  strictStandard?: boolean;
  /** Компилятор */
  compiler?: CompilerType;
  /** Оптимизация */
  optimization: 'O0' | 'O1' | 'O2' | 'O3';
  /** Путь к компилятору */
  compilerPath?: string;
  /** Переменные окружения для запуска компилятора (PATH и т.п.) */
  env?: NodeJS.ProcessEnv;
  /** Доп. аргументы для компилятора (например, -isysroot на macOS) */
  extraArgs?: string[];
}

export interface CompilationResult {
  success: boolean;
  executable?: string;
  errors: string[];
  warnings: string[];
  stdout: string;
  stderr: string;
  duration: number;
  /** Какой компилятор реально использовался */
  compilerType?: CompilerType;
  /** Какая команда реально вызывалась (с учётом compilerPath) */
  compilerCommand?: string;
  /** Какой стандарт реально применился (может быть ниже requested при fallback) */
  standardUsed?: CppStandard;
}

export interface ExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

export interface ExecutionOptions {
  /** Переменные окружения для запуска программы (PATH и т.п.) */
  env?: NodeJS.ProcessEnv;
  /** Таймаут выполнения (мс) */
  timeoutMs?: number;
}

const COMPILER_PREFERENCE_ORDER: CompilerType[] = ['msvc', 'clang', 'gcc'];

const STANDARD_FALLBACKS: Record<CppStandard, CppStandard[]> = {
  cpp23: ['cpp23', 'cpp20', 'cpp17', 'cpp14'],
  cpp20: ['cpp20', 'cpp17', 'cpp14'],
  cpp17: ['cpp17', 'cpp14'],
  cpp14: ['cpp14'],
};

const inferCompilerTypeFromCommand = (command: string): CompilerType | null => {
  const base = path.basename(command).toLowerCase();
  if (base === 'cl' || base === 'cl.exe') return 'msvc';
  if (base.includes('clang')) return 'clang';
  if (base.includes('g++') || base.includes('gcc')) return 'gcc';
  return null;
};

/**
 * Поиск компилятора на системе
 */
export async function findCompiler(): Promise<CompilerType | null> {
  const candidates: Array<{ type: CompilerType; cmd: string }> = [
    { type: 'msvc', cmd: 'cl' },
    { type: 'clang', cmd: 'clang++' },
    { type: 'gcc', cmd: 'g++' },
  ];

  for (const { type, cmd } of candidates) {
    const result = spawnSync(cmd, ['--version'], {
      timeout: 5000,
      windowsHide: true,
    });
    if (!result.error) {
      return type;
    }
  }

  return null;
}

/**
 * Получить флаг стандарта для компилятора
 */
function getStandardFlag(standard: CppStandard, compiler: CompilerType): string {
  const map: Record<CppStandard, Record<CompilerType, string>> = {
    cpp14: {
      msvc: '/std:c++14',
      gcc: '-std=c++14',
      clang: '-std=c++14',
    },
    cpp17: {
      msvc: '/std:c++17',
      gcc: '-std=c++17',
      clang: '-std=c++17',
    },
    cpp20: {
      msvc: '/std:c++20',
      gcc: '-std=c++20',
      clang: '-std=c++20',
    },
    cpp23: {
      msvc: '/std:c++latest',
      gcc: '-std=c++23',
      clang: '-std=c++23',
    },
  };

  return map[standard][compiler];
}

/**
 * Получить флаг оптимизации
 */
function getOptimizationFlag(optimization: string, compiler: CompilerType): string {
  if (compiler === 'msvc') {
    const map: Record<string, string> = {
      O0: '/Od',
      O1: '/O1',
      O2: '/O2',
      O3: '/Ox',
    };
    return map[optimization] || '/Od';
  }

  return `-${optimization}`;
}

const resolveCompilerCommand = (compiler: CompilerType, compilerPath?: string): string => {
  if (compilerPath) {
    return compilerPath;
  }
  if (compiler === 'msvc') return 'cl';
  if (compiler === 'gcc') return 'g++';
  return 'clang++';
};

const isCompilerNotFoundError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  return record.code === 'ENOENT';
};

const getErrorStringField = (error: unknown, field: 'stdout' | 'stderr'): string => {
  if (!error || typeof error !== 'object') return '';
  const record = error as Record<string, unknown>;
  const value = record[field];
  return typeof value === 'string' ? value : '';
};

/**
 * Компилировать C++ файл
 */
export async function compileCpp(
  sourceFile: string,
  outputFile: string,
  options: Partial<CompilationOptions> = {}
): Promise<CompilationResult> {
  const startTime = Date.now();

  const opts: CompilationOptions = {
    standard: options.standard ?? 'cpp20',
    strictStandard: options.strictStandard,
    optimization: options.optimization ?? 'O2',
    compiler: options.compiler,
    compilerPath: options.compilerPath,
    env: options.env,
    extraArgs: options.extraArgs,
  };

  if (opts.compilerPath && !opts.compiler) {
    const inferred = inferCompilerTypeFromCommand(opts.compilerPath);
    if (inferred) {
      opts.compiler = inferred;
    } else {
      return {
        success: false,
        errors: [
          `Не удалось определить тип компилятора по пути: ${opts.compilerPath}. Укажите options.compiler (msvc/gcc/clang).`,
        ],
        warnings: [],
        stdout: '',
        stderr: '',
        duration: Date.now() - startTime,
      };
    }
  }

  // Валидировать входной файл
  if (!fs.existsSync(sourceFile)) {
    return {
      success: false,
      errors: [`Файл не найден: ${sourceFile}`],
      warnings: [],
      stdout: '',
      stderr: '',
      duration: Date.now() - startTime,
    };
  }

  const requestedStandard = opts.standard;
  const standardsToTry = opts.strictStandard
    ? [requestedStandard]
    : (STANDARD_FALLBACKS[requestedStandard] ?? [requestedStandard]);

  const compilerTypesToTry = opts.compiler
    ? [opts.compiler]
    : COMPILER_PREFERENCE_ORDER.slice();

  const execFileAsync = promisify(execFile);
  const attemptErrors: string[] = [];
  let lastStdout = '';
  let lastStderr = '';

  for (const standard of standardsToTry) {
    for (const compilerType of compilerTypesToTry) {
      const compilerCommand = resolveCompilerCommand(
        compilerType,
        opts.compilerPath && opts.compiler === compilerType ? opts.compilerPath : undefined
      );

      // Убираем потенциально старый артефакт от прошлой попытки, чтобы не принять его за успешный результат.
      try {
        if (fs.existsSync(outputFile)) {
          await promisify(fs.unlink)(outputFile);
        }
      } catch {
        // Ignore cleanup issues here; if файл нельзя удалить, компиляция всё равно вероятно упадёт.
      }

      const args: string[] = [];
      const standardFlag = getStandardFlag(standard, compilerType);
      const optimizationFlag = getOptimizationFlag(opts.optimization, compilerType);
      const extraArgs = opts.extraArgs ?? [];

      if (compilerType === 'msvc') {
        args.push(standardFlag, '/utf-8', optimizationFlag, ...extraArgs, `/Fe${outputFile}`, sourceFile);
      } else {
        args.push(standardFlag, optimizationFlag, ...extraArgs, '-o', outputFile, sourceFile);
      }

      try {
        const { stdout, stderr } = await execFileAsync(compilerCommand, args, {
          timeout: 30000,
          windowsHide: true,
          env: opts.env,
        });

        const duration = Date.now() - startTime;
        lastStdout = stdout;
        lastStderr = stderr;

        if (fs.existsSync(outputFile)) {
          const warnings = [];
          if (requestedStandard !== standard) {
            warnings.push(
              `Компилятор не поддерживает выбранный стандарт ${requestedStandard}; использован ${standard}.`
            );
          }
          if (stderr) {
            warnings.push(stderr);
          }

          return {
            success: true,
            executable: outputFile,
            errors: [],
            warnings,
            stdout,
            stderr,
            duration,
            compilerType,
            compilerCommand,
            standardUsed: standard,
          };
        }

        attemptErrors.push(
          `[${compilerCommand} ${standardFlag}] Компиляция завершилась без ошибки, но исполняемый файл не был создан`
        );
      } catch (error) {
        if (isCompilerNotFoundError(error)) {
          attemptErrors.push(`[${compilerCommand}] Компилятор не найден`);
          continue;
        }

        const message = error instanceof Error ? error.message : 'Неизвестная ошибка компилятора';
        const stderrText = getErrorStringField(error, 'stderr');
        const stdoutText = getErrorStringField(error, 'stdout');

        lastStdout = stdoutText || lastStdout;
        lastStderr = stderrText || lastStderr;

        attemptErrors.push(`[${compilerCommand} ${standardFlag}] ${stderrText || message}`);

        // Если компилятор запустился, но дал ошибку компиляции, пробуем следующий компилятор/стандарт.
        // Это важно для Windows: в PATH часто есть "старый" g++, хотя clang++ уже установлен.
      }
    }
  }

  return {
    success: false,
    errors: attemptErrors.length
      ? attemptErrors
      : ['Компилятор C++ не найден. Установите MSVC, GCC или Clang.'],
    warnings: [],
    stdout: lastStdout,
    stderr: lastStderr || attemptErrors[0] || '',
    duration: Date.now() - startTime,
  };
}

/**
 * Запустить исполняемый файл
 */
export async function executeProgram(
  executablePath: string,
  options: ExecutionOptions = {}
): Promise<ExecutionResult> {
  const startTime = Date.now();

  if (!fs.existsSync(executablePath)) {
    return {
      exitCode: -1,
      stdout: '',
      stderr: `Файл не найден: ${executablePath}`,
      duration: Date.now() - startTime,
    };
  }

  return new Promise((resolve) => {
    execFile(
      executablePath,
      [],
      { timeout: options.timeoutMs ?? 10000, env: options.env, windowsHide: true },
      (error, stdout, stderr) => {
      const duration = Date.now() - startTime;
      
      let exitCode = 0;
      if (error) {
        if (typeof error.code === 'number') {
          exitCode = error.code;
        } else if (typeof error.code === 'string') {
          exitCode = parseInt(error.code, 10) || -1;
        } else {
          exitCode = -1;
        }
      }

      resolve({
        exitCode,
        stdout,
        stderr,
        duration,
      });
      }
    );
  });
}

/**
 * Получить стандартный путь для временного файла
 */
export function getTempOutputPath(sourceFile: string): string {
  const dir = path.dirname(sourceFile);
  const name = path.basename(sourceFile, path.extname(sourceFile));
  const ext = process.platform === 'win32' ? '.exe' : '';

  return path.join(dir, `${name}_out${ext}`);
}

/**
 * Очистить временные файлы
 */
export async function cleanupTempFiles(files: string[]): Promise<void> {
  for (const file of files) {
    try {
      if (fs.existsSync(file)) {
        await promisify(fs.unlink)(file);
      }
    } catch {
      // Игнорируем ошибки удаления
    }
  }
}
