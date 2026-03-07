import * as path from 'path';
import * as vscode from 'vscode';
import {
  formatMulticodeGraphBindingLine,
  resolveGraphBindingFilePath,
  sanitizeGraphBindingFileName,
} from '../shared/graphBinding';
import { formatMulticodeClassBindingLine } from '../shared/classBinding';
import { createDetachedSourceGraphId } from '../panel/sourceGraphFallback';
import { createDefaultGraphState, type GraphDisplayLanguage, type GraphLanguage, type GraphState } from '../shared/graphState';
import { serializeGraphState } from '../shared/serializer';
import { serializeClassSidecar, type BlueprintClassSidecar } from '../shared/classSidecar';

type ClassStorageMode = 'embedded' | 'sidecar';
type GraphExportMode = 'legacy' | 'modern';
type HeaderPairMode = 'hpp-cpp' | 'h-cpp';
type HeaderStyleMode = 'pragma-once' | 'include-guard';
type IncludePolicyMode = 'quotes' | 'angles';

const CPP_FILE_EXTENSIONS = new Set(['.c', '.cc', '.cpp', '.cxx', '.h', '.hh', '.hpp', '.hxx']);
const DEFAULT_CLASS_NAME = 'NewClass';
const CLASS_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NAMESPACE_REGEX = /^[A-Za-z_][A-Za-z0-9_]*(::[A-Za-z_][A-Za-z0-9_]*)*$/;
const BASE_CLASS_REGEX = /^[A-Za-z_][A-Za-z0-9_:<>,\s*&]*$/;

interface ClassScaffoldOptions {
  pairMode: HeaderPairMode;
  headerStyle: HeaderStyleMode;
  includePolicy: IncludePolicyMode;
  namespacePath?: string;
  baseClass?: string;
}

const normalizeBindingFolder = (rawFolder: string): string => {
  const trimmed = rawFolder.trim();
  const normalized = trimmed.replace(/\\/g, '/').replace(/\/+$/g, '');
  return normalized.length > 0 ? normalized : '.multicode';
};

const makeGraphBindingFile = (graphId: string, folderSetting: string): string => {
  const normalizedFolder = normalizeBindingFolder(folderSetting);
  return `${normalizedFolder}/${sanitizeGraphBindingFileName(graphId)}.multicode`;
};

const makeClassBindingFile = (classId: string, folderSetting: string): string => {
  const normalizedFolder = normalizeBindingFolder(folderSetting);
  return `${normalizedFolder}/classes/${sanitizeGraphBindingFileName(classId)}.multicode`;
};

const toCodeFriendlyClassName = (value: string): string => {
  const stripped = value.trim().replace(/\.[^/.]+$/g, '');
  const cleaned = stripped.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (!cleaned) {
    return DEFAULT_CLASS_NAME;
  }
  if (/^[A-Za-z_]/.test(cleaned)) {
    return cleaned;
  }
  return `C_${cleaned}`;
};

const pathExists = async (uri: vscode.Uri): Promise<boolean> => {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
};

const resolveTargetFolder = async (resourceUri: vscode.Uri | undefined): Promise<vscode.Uri> => {
  if (resourceUri?.scheme === 'file') {
    try {
      const stat = await vscode.workspace.fs.stat(resourceUri);
      if ((stat.type & vscode.FileType.Directory) !== 0) {
        return resourceUri;
      }
      return vscode.Uri.file(path.dirname(resourceUri.fsPath));
    } catch {
      return vscode.Uri.file(path.dirname(resourceUri.fsPath));
    }
  }

  const activePath = vscode.window.activeTextEditor?.document.uri;
  if (activePath?.scheme === 'file') {
    return vscode.Uri.file(path.dirname(activePath.fsPath));
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (workspaceRoot) {
    return workspaceRoot;
  }

  throw new Error('Не удалось определить папку для создания класса');
};

const guessDefaultClassName = (resourceUri: vscode.Uri | undefined): string => {
  if (!resourceUri?.fsPath) {
    return DEFAULT_CLASS_NAME;
  }

  const ext = path.extname(resourceUri.fsPath).toLowerCase();
  if (CPP_FILE_EXTENSIONS.has(ext)) {
    return toCodeFriendlyClassName(path.basename(resourceUri.fsPath, ext));
  }

  return DEFAULT_CLASS_NAME;
};

const resolveHeaderExtension = (pairMode: HeaderPairMode): 'hpp' | 'h' => (pairMode === 'h-cpp' ? 'h' : 'hpp');

const toGuardSegment = (value: string): string =>
  value
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();

const makeIncludeGuard = (params: { className: string; namespacePath?: string; headerExtension: string }): string => {
  const namespaceParts = (params.namespacePath ?? '')
    .split('::')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => toGuardSegment(part));
  const classPart = toGuardSegment(params.className);
  const extPart = toGuardSegment(params.headerExtension);
  const parts = ['MULTICODE', ...namespaceParts, classPart, extPart];
  return parts.filter((part) => part.length > 0).join('_');
};

const indentBlock = (lines: string[], indent: string): string[] => lines.map((line) => (line.length > 0 ? `${indent}${line}` : line));

const buildHeaderContent = (params: {
  className: string;
  namespacePath?: string;
  baseClass?: string;
  headerStyle: HeaderStyleMode;
  headerExtension: string;
}): string => {
  const inheritanceClause = params.baseClass ? ` : public ${params.baseClass}` : '';
  const classBlock: string[] = [
    `class ${params.className}${inheritanceClause} {`,
    'public:',
    `    ${params.className}() = default;`,
    `    ~${params.className}() = default;`,
    '',
    'private:',
    '};',
  ];

  const bodyLines =
    params.namespacePath && params.namespacePath.length > 0
      ? [
          `namespace ${params.namespacePath} {`,
          '',
          ...indentBlock(classBlock, '  '),
          '',
          `} // namespace ${params.namespacePath}`,
        ]
      : classBlock;

  if (params.headerStyle === 'pragma-once') {
    return ['#pragma once', '', ...bodyLines, ''].join('\n');
  }

  const includeGuard = makeIncludeGuard({
    className: params.className,
    namespacePath: params.namespacePath,
    headerExtension: params.headerExtension,
  });
  return [
    `#ifndef ${includeGuard}`,
    `#define ${includeGuard}`,
    '',
    ...bodyLines,
    '',
    `#endif // ${includeGuard}`,
    '',
  ].join('\n');
};

const buildSourceContent = (params: {
  className: string;
  headerExtension: string;
  includePolicy: IncludePolicyMode;
  graphId: string;
  graphFile: string;
  classId?: string;
  classFile?: string;
}): string => {
  const includeTarget = `${params.className}.${params.headerExtension}`;
  const includeLine =
    params.includePolicy === 'angles' ? `#include <${includeTarget}>` : `#include "${includeTarget}"`;
  const lines: string[] = [
    includeLine,
    '',
    '// Сгенерировано MultiCode',
    formatMulticodeGraphBindingLine({ graphId: params.graphId, file: params.graphFile }),
  ];

  if (params.classId && params.classFile) {
    lines.push(formatMulticodeClassBindingLine({ classId: params.classId, file: params.classFile }));
  }

  lines.push('');
  return lines.join('\n');
};

const resolveLanguage = (config: vscode.WorkspaceConfiguration): GraphLanguage => {
  const value = config.get<string>('language', 'cpp');
  if (value === 'cpp' || value === 'ue' || value === 'rust' || value === 'asm') {
    return value;
  }
  return 'cpp';
};

const resolveDisplayLanguage = (config: vscode.WorkspaceConfiguration): GraphDisplayLanguage => {
  const value = config.get<string>('displayLanguage', 'ru');
  return value === 'en' ? 'en' : 'ru';
};

const resolveExportMode = (config: vscode.WorkspaceConfiguration): GraphExportMode => {
  const value = config.get<string>('graphExport.compatibilityMode', 'legacy');
  return value === 'modern' ? 'modern' : 'legacy';
};

const resolveStorageMode = (config: vscode.WorkspaceConfiguration): ClassStorageMode => {
  const value = config.get<string>('classStorage.mode', 'embedded');
  return value === 'sidecar' ? 'sidecar' : 'embedded';
};

const normalizeOptional = (value: string | undefined): string | undefined => {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeBaseClass = (value: string | undefined): string | undefined => {
  const raw = normalizeOptional(value);
  if (!raw) {
    return undefined;
  }
  return raw.replace(/^(public|protected|private)\s+/i, '').trim();
};

type PickerItem<T extends string> = vscode.QuickPickItem & { value: T };

const pickFromQuickPick = async <T extends string>(
  title: string,
  items: PickerItem<T>[]
): Promise<T | null> => {
  const picked = await vscode.window.showQuickPick(items, {
    title,
    ignoreFocusOut: true,
    canPickMany: false,
  });
  return picked ? picked.value : null;
};

const pickClassScaffoldOptions = async (): Promise<ClassScaffoldOptions | null> => {
  const pairMode = await pickFromQuickPick<HeaderPairMode>('Class Scaffold: формат файлов', [
    {
      label: 'hpp + cpp (Recommended)',
      description: 'Стандартный C++ формат',
      value: 'hpp-cpp',
    },
    {
      label: 'h + cpp',
      description: 'C-style header + C++ source',
      value: 'h-cpp',
    },
  ]);
  if (!pairMode) {
    return null;
  }

  const headerStyle = await pickFromQuickPick<HeaderStyleMode>('Class Scaffold: стиль заголовка', [
    {
      label: '#pragma once (Recommended)',
      description: 'Компактный и современный стиль',
      value: 'pragma-once',
    },
    {
      label: 'Include Guard',
      description: 'Классический #ifndef/#define',
      value: 'include-guard',
    },
  ]);
  if (!headerStyle) {
    return null;
  }

  const includePolicy = await pickFromQuickPick<IncludePolicyMode>('Class Scaffold: policy для #include в .cpp', [
    {
      label: 'Локальный include: "Class.hpp" (Recommended)',
      description: 'Подходит для файлов в проекте',
      value: 'quotes',
    },
    {
      label: 'Системный include: <Class.hpp>',
      description: 'Для include path toolchain',
      value: 'angles',
    },
  ]);
  if (!includePolicy) {
    return null;
  }

  const namespaceRaw = await vscode.window.showInputBox({
    title: 'Class Scaffold: namespace',
    prompt: 'Namespace (опционально), например: MyGame::Core',
    placeHolder: 'MyGame::Core',
    ignoreFocusOut: true,
    validateInput: (value) => {
      const normalized = normalizeOptional(value);
      if (!normalized) {
        return undefined;
      }
      if (!NAMESPACE_REGEX.test(normalized)) {
        return 'Используйте формат Namespace::SubNamespace';
      }
      return undefined;
    },
  });
  if (namespaceRaw === undefined) {
    return null;
  }

  const baseClassRaw = await vscode.window.showInputBox({
    title: 'Class Scaffold: базовый класс',
    prompt: 'Base class (опционально), например: UObject или Engine::Base<T>',
    placeHolder: 'UObject',
    ignoreFocusOut: true,
    validateInput: (value) => {
      const normalized = normalizeBaseClass(value);
      if (!normalized) {
        return undefined;
      }
      if (!BASE_CLASS_REGEX.test(normalized)) {
        return 'Некорректная запись базового класса';
      }
      return undefined;
    },
  });
  if (baseClassRaw === undefined) {
    return null;
  }

  return {
    pairMode,
    headerStyle,
    includePolicy,
    namespacePath: normalizeOptional(namespaceRaw),
    baseClass: normalizeBaseClass(baseClassRaw),
  };
};

const pickResolvedClassName = async (
  className: string,
  targetFolder: vscode.Uri,
  headerExtension: string,
  sourceExtension: string
): Promise<{ className: string; overwrite: boolean } | null> => {
  const headerUri = vscode.Uri.joinPath(targetFolder, `${className}.${headerExtension}`);
  const sourceUri = vscode.Uri.joinPath(targetFolder, `${className}.${sourceExtension}`);

  if (!(await pathExists(headerUri)) && !(await pathExists(sourceUri))) {
    return { className, overwrite: false };
  }

  const choice = await vscode.window.showWarningMessage(
    `Файлы ${className}.${headerExtension}/${className}.${sourceExtension} уже существуют.`,
    { modal: true },
    'Автосуффикс',
    'Перезаписать'
  );

  if (!choice) {
    return null;
  }

  if (choice === 'Перезаписать') {
    return { className, overwrite: true };
  }

  for (let suffix = 1; suffix <= 999; suffix += 1) {
    const candidate = `${className}_${suffix}`;
    const candidateHeader = vscode.Uri.joinPath(targetFolder, `${candidate}.${headerExtension}`);
    const candidateSource = vscode.Uri.joinPath(targetFolder, `${candidate}.${sourceExtension}`);
    if (!(await pathExists(candidateHeader)) && !(await pathExists(candidateSource))) {
      return { className: candidate, overwrite: false };
    }
  }

  throw new Error('Не удалось подобрать свободное имя класса');
};

const writeGraphSidecar = async (params: {
  sourceFilePath: string;
  className: string;
  namespacePath?: string;
  classId: string;
  graphFile: string;
  classFile: string;
  rootFsPath: string;
  language: GraphLanguage;
  displayLanguage: GraphDisplayLanguage;
  exportMode: GraphExportMode;
  storageMode: ClassStorageMode;
}): Promise<void> => {
  const graphId = createDetachedSourceGraphId(params.sourceFilePath);
  const classItem: BlueprintClassSidecar = {
    id: params.classId,
    name: params.className,
    nameRu: params.className,
    namespace: params.namespacePath,
    members: [],
    methods: [],
  };

  if (params.storageMode === 'sidecar') {
    const classFsPath = resolveGraphBindingFilePath(params.rootFsPath, params.classFile);
    const classUri = vscode.Uri.file(classFsPath);
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(classUri.fsPath)));
    await vscode.workspace.fs.writeFile(
      classUri,
      Buffer.from(JSON.stringify(serializeClassSidecar(classItem), null, 2), 'utf8')
    );
  }

  const baseGraph = createDefaultGraphState();
  const graphState: GraphState = {
    ...baseGraph,
    id: graphId,
    name: params.className,
    language: params.language,
    displayLanguage: params.displayLanguage,
    updatedAt: new Date().toISOString(),
    dirty: false,
    classes: params.storageMode === 'sidecar' ? [] : [classItem],
    classBindings: params.storageMode === 'sidecar' ? [{ classId: params.classId, file: params.classFile }] : [],
  };

  const graphFsPath = resolveGraphBindingFilePath(params.rootFsPath, params.graphFile);
  const graphUri = vscode.Uri.file(graphFsPath);
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(graphUri.fsPath)));
  await vscode.workspace.fs.writeFile(
    graphUri,
    Buffer.from(JSON.stringify(serializeGraphState(graphState, { mode: params.exportMode }), null, 2), 'utf8')
  );
};

export const registerCreateClassFilesAndBindCommand = (): vscode.Disposable =>
  vscode.commands.registerCommand('multicode.createClassFilesAndBind', async (resourceUri?: vscode.Uri) => {
    try {
      const targetFolder = await resolveTargetFolder(resourceUri);
      const defaultClassName = guessDefaultClassName(resourceUri);
      const scaffoldOptions = await pickClassScaffoldOptions();
      if (!scaffoldOptions) {
        return;
      }
      const headerExtension = resolveHeaderExtension(scaffoldOptions.pairMode);
      const sourceExtension = 'cpp';
      const classNameInput = await vscode.window.showInputBox({
        prompt: 'Имя класса (C++ identifier)',
        placeHolder: 'MyClass',
        value: defaultClassName,
        validateInput: (value) => {
          const trimmed = value.trim();
          if (!trimmed) {
            return 'Введите имя класса';
          }
          if (!CLASS_NAME_REGEX.test(trimmed)) {
            return 'Разрешены только C++ идентификаторы: [A-Za-z_][A-Za-z0-9_]*';
          }
          return undefined;
        },
      });

      if (!classNameInput) {
        return;
      }

      const chosen = await pickResolvedClassName(
        classNameInput.trim(),
        targetFolder,
        headerExtension,
        sourceExtension
      );
      if (!chosen) {
        return;
      }

      const className = chosen.className;
      const headerUri = vscode.Uri.joinPath(targetFolder, `${className}.${headerExtension}`);
      const sourceUri = vscode.Uri.joinPath(targetFolder, `${className}.${sourceExtension}`);
      const sourceFilePath = sourceUri.fsPath;

      const config = vscode.workspace.getConfiguration('multicode', targetFolder);
      const graphFolderSetting = config.get<string>('graphBinding.folder', '.multicode') ?? '.multicode';
      const language = resolveLanguage(config);
      const displayLanguage = resolveDisplayLanguage(config);
      const exportMode = resolveExportMode(config);
      const storageMode = resolveStorageMode(config);
      const graphBindingEnabled = config.get<boolean>('graphBinding.enabled', true);

      const graphId = createDetachedSourceGraphId(sourceFilePath);
      const graphFile = makeGraphBindingFile(graphId, graphFolderSetting);
      const classId = `class-${sanitizeGraphBindingFileName(className).toLowerCase()}-${Date.now().toString(36)}`;
      const classFile = makeClassBindingFile(classId, graphFolderSetting);

      const sourceContent = buildSourceContent({
        className,
        headerExtension,
        includePolicy: scaffoldOptions.includePolicy,
        graphId,
        graphFile,
        classId: storageMode === 'sidecar' ? classId : undefined,
        classFile: storageMode === 'sidecar' ? classFile : undefined,
      });
      const headerContent = buildHeaderContent({
        className,
        namespacePath: scaffoldOptions.namespacePath,
        baseClass: scaffoldOptions.baseClass,
        headerStyle: scaffoldOptions.headerStyle,
        headerExtension,
      });

      await vscode.workspace.fs.writeFile(headerUri, Buffer.from(headerContent, 'utf8'));
      await vscode.workspace.fs.writeFile(sourceUri, Buffer.from(sourceContent, 'utf8'));

      const workspaceFolder = vscode.workspace.getWorkspaceFolder(targetFolder);
      const rootFsPath = workspaceFolder?.uri.fsPath ?? targetFolder.fsPath;
      await writeGraphSidecar({
        sourceFilePath,
        className,
        namespacePath: scaffoldOptions.namespacePath,
        classId,
        graphFile,
        classFile,
        rootFsPath,
        language,
        displayLanguage,
        exportMode,
        storageMode,
      });

      const sourceDocument = await vscode.workspace.openTextDocument(sourceUri);
      await vscode.window.showTextDocument(sourceDocument, { preview: false, preserveFocus: false });
      await vscode.commands.executeCommand('multicode.openEditor');

      if (!graphBindingEnabled) {
        void vscode.window.showWarningMessage(
          'Файлы класса созданы, но автопривязка к исходнику отключена (multicode.graphBinding.enabled=false).'
        );
      } else {
        void vscode.window.showInformationMessage(
          `Создан класс ${className} и привязка к MultiCode (файлы: ${className}.${headerExtension}, ${className}.${sourceExtension}).`
        );
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      void vscode.window.showErrorMessage(`Не удалось создать файлы класса: ${reason}`);
    }
  });
