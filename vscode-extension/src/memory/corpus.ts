import * as fs from 'fs/promises';
import * as path from 'path';
import { sha1 } from '../panel/symbol-indexer/hash';
import type {
  MemoryAuthority,
  MemoryCorpusSource,
  MemoryDocumentDraft,
  MemoryLogger,
  SessionSummaryRecord,
} from './types';
import { tokenizeText } from './tokenizer';

const ROOT_CANONICAL_DOCS = ['README.md', 'ROADMAP.md', 'AI_AGENTS_GUIDE.md', 'CODING_GUIDELINES.md'];
const DOCS_INDEX_RELATIVE_PATH = path.join('Документы', 'README.md');
const CODE_NOTE_ROOTS = [
  path.join('include', 'visprog', 'core'),
  path.join('vscode-extension', 'src', 'shared'),
  path.join('vscode-extension', 'src', 'panel'),
];
const CODE_NOTE_EXTENSIONS = new Set(['.ts', '.tsx', '.cpp', '.cc', '.cxx', '.c', '.hpp', '.hh', '.hxx', '.h', '.ipp']);
const COMMENT_MARKER_PATTERN = /\b(?:INVARIANT|NOTE|DANGER)\s*:/u;
const JSDOC_EXPORT_PATTERN =
  /\/\*\*([\s\S]*?)\*\/\s*export\s+(?:default\s+)?(?:async\s+)?(?:class|interface|type|const|function|enum)\s+([A-Za-z_][\w]*)/gu;
const BLOCK_COMMENT_PATTERN = /\/\*[\s\S]*?\*\//gu;
const LINE_COMMENT_GROUP_PATTERN = /(?:^[ \t]*\/\/.*(?:\r?\n|$))+/gmu;

const normalizeFsPath = (filePath: string): string => path.normalize(filePath);
const unique = <T>(items: T[]): T[] => Array.from(new Set(items));

const makeRelativePath = (workspaceRoot: string, sourcePath: string): string =>
  path.relative(workspaceRoot, sourcePath).replace(/\\/g, '/');

const exists = async (targetPath: string): Promise<boolean> => {
  try {
    await fs.stat(targetPath);
    return true;
  } catch {
    return false;
  }
};

const computeRevision = async (sourcePath: string): Promise<string> => {
  const stat = await fs.stat(sourcePath);
  return sha1(`${Math.trunc(stat.mtimeMs)}:${stat.size}`);
};

const stripCommentDecorators = (value: string): string =>
  value
    .replace(/^\s*\/\*\*?/u, '')
    .replace(/\*\/\s*$/u, '')
    .split(/\r?\n/u)
    .map((line) => line.replace(/^\s*\/\/\s?/u, '').replace(/^\s*\*\s?/u, '').trimEnd())
    .join('\n')
    .trim();

const toTags = (workspaceRoot: string, sourcePath: string, extraTags: string[] = []): string[] => {
  const relativePath = makeRelativePath(workspaceRoot, sourcePath);
  const parts = tokenizeText(relativePath.replace(/\.[^.]+$/u, ''));
  return unique(
    [...parts, ...extraTags.map((item) => item.trim().toLowerCase())].filter((item) => item.length > 0)
  );
};

const getMarkdownTitle = (sourcePath: string, text: string): string => {
  const titleMatch = text.match(/^#\s+(.+?)\s*$/mu);
  if (titleMatch?.[1]) {
    return titleMatch[1].trim();
  }
  return path.basename(sourcePath, path.extname(sourcePath));
};

const chunkMarkdownSections = (text: string): Array<{ headingPath: string[]; text: string }> => {
  const lines = text.split(/\r?\n/u);
  const sections: Array<{ headingPath: string[]; text: string }> = [];
  const headingStack: string[] = [];
  let currentLines: string[] = [];

  const flush = (): void => {
    const chunkText = currentLines.join('\n').trim();
    if (chunkText.length === 0) {
      currentLines = [];
      return;
    }
    sections.push({ headingPath: [...headingStack], text: chunkText });
    currentLines = [];
  };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/u);
    if (headingMatch) {
      flush();
      const level = headingMatch[1].length;
      headingStack.splice(level - 1);
      headingStack[level - 1] = headingMatch[2].trim();
      continue;
    }
    currentLines.push(line);
  }

  flush();
  return sections;
};

const extractTopOfFileComment = (text: string): string | null => {
  const firstLines = text.split(/\r?\n/u).slice(0, 80).join('\n');
  const blockMatch = firstLines.match(/^\s*\/\*[\s\S]*?\*\//u);
  if (blockMatch?.[0]) {
    return stripCommentDecorators(blockMatch[0]);
  }

  const lineMatch = firstLines.match(/^\s*(?:\/\/.*(?:\r?\n|$))+/u);
  if (lineMatch?.[0]) {
    return stripCommentDecorators(lineMatch[0]);
  }

  return null;
};

const extractJsDocNotes = (text: string): Array<{ headingPath: string[]; text: string; weight: number }> => {
  const results: Array<{ headingPath: string[]; text: string; weight: number }> = [];
  for (const match of text.matchAll(JSDOC_EXPORT_PATTERN)) {
    const comment = stripCommentDecorators(match[1] ?? '');
    const symbolName = (match[2] ?? '').trim();
    if (comment.length === 0 || symbolName.length === 0) {
      continue;
    }
    results.push({
      headingPath: [symbolName],
      text: comment,
      weight: 0.92,
    });
  }
  return results;
};

const extractMarkerNotes = (text: string): Array<{ headingPath: string[]; text: string; weight: number }> => {
  const results: Array<{ headingPath: string[]; text: string; weight: number }> = [];
  const seen = new Set<string>();
  const pushIfMarked = (comment: string): void => {
    if (!COMMENT_MARKER_PATTERN.test(comment)) {
      return;
    }
    const cleaned = stripCommentDecorators(comment);
    if (cleaned.length === 0 || seen.has(cleaned)) {
      return;
    }
    seen.add(cleaned);
    results.push({
      headingPath: ['markers'],
      text: cleaned,
      weight: 0.88,
    });
  };

  for (const match of text.matchAll(BLOCK_COMMENT_PATTERN)) {
    pushIfMarked(match[0]);
  }
  for (const match of text.matchAll(LINE_COMMENT_GROUP_PATTERN)) {
    pushIfMarked(match[0]);
  }

  return results;
};

export const parseActiveDocumentLinks = (markdown: string, docsReadmePath: string, workspaceRoot: string): string[] => {
  const activePart = markdown.split(/^##\s+Архив\s*$/mu)[0] ?? markdown;
  const baseDir = path.dirname(docsReadmePath);
  const matches = activePart.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu);
  const resolvedPaths: string[] = [];

  for (const match of matches) {
    const target = (match[1] ?? '').trim();
    if (!target || target.startsWith('http://') || target.startsWith('https://') || target.startsWith('#')) {
      continue;
    }
    if (path.extname(target).toLowerCase() !== '.md') {
      continue;
    }
    const absolutePath = normalizeFsPath(path.resolve(baseDir, target));
    const relative = makeRelativePath(workspaceRoot, absolutePath);
    if (relative.startsWith('..')) {
      continue;
    }
    if (/^Документы\/Архив\//u.test(relative) || /(^|\/)AGENTS\.md$/u.test(relative)) {
      continue;
    }
    resolvedPaths.push(absolutePath);
  }

  return unique(resolvedPaths);
};

const collectFilesRecursively = async (rootPath: string): Promise<string[]> => {
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFilesRecursively(absolutePath)));
      continue;
    }
    if (entry.isFile() && CODE_NOTE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(normalizeFsPath(absolutePath));
    }
  }

  return files;
};

export const discoverCanonicalSources = async (
  workspaceRoot: string,
  logger?: MemoryLogger
): Promise<{ sources: MemoryCorpusSource[]; warnings: string[]; docsManifestPath: string }> => {
  const warnings: string[] = [];
  const docsManifestPath = normalizeFsPath(path.join(workspaceRoot, DOCS_INDEX_RELATIVE_PATH));
  const sources: MemoryCorpusSource[] = [];

  const addSource = async (sourcePath: string, authority: MemoryAuthority, kind: MemoryCorpusSource['kind']): Promise<void> => {
    if (!(await exists(sourcePath))) {
      warnings.push(`Источник корпуса не найден: ${makeRelativePath(workspaceRoot, sourcePath)}`);
      return;
    }
    sources.push({
      kind,
      authority,
      sourcePath,
      revision: await computeRevision(sourcePath),
      tags: toTags(workspaceRoot, sourcePath, kind === 'doc' ? ['docs'] : ['code']),
    });
  };

  await addSource(docsManifestPath, 'canonical', 'doc');

  if (await exists(docsManifestPath)) {
    const docsReadme = await fs.readFile(docsManifestPath, 'utf8');
    for (const sourcePath of parseActiveDocumentLinks(docsReadme, docsManifestPath, workspaceRoot)) {
      await addSource(sourcePath, 'canonical', 'doc');
    }
  }

  for (const rootDocument of ROOT_CANONICAL_DOCS) {
    await addSource(normalizeFsPath(path.join(workspaceRoot, rootDocument)), 'canonical', 'doc');
  }

  for (const relativeRoot of CODE_NOTE_ROOTS) {
    const absoluteRoot = normalizeFsPath(path.join(workspaceRoot, relativeRoot));
    if (!(await exists(absoluteRoot))) {
      warnings.push(`Каталог code notes не найден: ${makeRelativePath(workspaceRoot, absoluteRoot)}`);
      continue;
    }
    for (const sourcePath of await collectFilesRecursively(absoluteRoot)) {
      await addSource(sourcePath, 'canonical', 'code_note');
    }
  }

  logger?.('Обнаружены источники корпуса', {
    docs: sources.filter((item) => item.kind === 'doc').length,
    codeNotes: sources.filter((item) => item.kind === 'code_note').length,
  });

  return {
    sources: sources.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath)),
    warnings,
    docsManifestPath,
  };
};

export const buildMarkdownDocumentDraft = async (
  source: MemoryCorpusSource
): Promise<MemoryDocumentDraft | null> => {
  const text = await fs.readFile(source.sourcePath, 'utf8');
  const chunks = chunkMarkdownSections(text)
    .map((section) => ({
      headingPath: section.headingPath,
      text: section.text,
      weight: 1,
    }))
    .filter((chunk) => chunk.text.trim().length > 0);

  if (chunks.length === 0) {
    return null;
  }

  return {
    kind: source.kind,
    authority: source.authority,
    sourcePath: source.sourcePath,
    title: getMarkdownTitle(source.sourcePath, text),
    tags: source.tags,
    revision: source.revision,
    chunks,
  };
};

export const extractCodeNotesFromText = (text: string): Array<{ headingPath: string[]; text: string; weight: number }> => {
  const notes: Array<{ headingPath: string[]; text: string; weight: number }> = [];
  const topComment = extractTopOfFileComment(text);
  if (topComment && topComment.length > 0) {
    notes.push({
      headingPath: ['top-of-file'],
      text: topComment,
      weight: 0.96,
    });
  }
  notes.push(...extractJsDocNotes(text));
  notes.push(...extractMarkerNotes(text));
  return notes;
};

export const buildCodeNoteDocumentDraft = async (
  source: MemoryCorpusSource,
  workspaceRoot: string
): Promise<MemoryDocumentDraft | null> => {
  const text = await fs.readFile(source.sourcePath, 'utf8');
  const chunks = extractCodeNotesFromText(text).filter((chunk) => chunk.text.trim().length > 0);
  if (chunks.length === 0) {
    return null;
  }

  return {
    kind: source.kind,
    authority: source.authority,
    sourcePath: source.sourcePath,
    title: makeRelativePath(workspaceRoot, source.sourcePath),
    tags: source.tags,
    revision: source.revision,
    chunks,
  };
};

export const buildSessionSummaryDocumentDraft = async (
  record: SessionSummaryRecord,
  sourcePath: string,
  workspaceRoot: string
): Promise<MemoryDocumentDraft | null> => {
  if (!(await exists(sourcePath))) {
    return null;
  }

  const revision = await computeRevision(sourcePath);
  const relatedFiles = (record.relatedFiles ?? []).map((filePath) => path.basename(filePath)).filter((item) => item.length > 0);
  const summaryText = [
    record.summary.trim(),
    relatedFiles.length > 0 ? `Связанные файлы: ${relatedFiles.join(', ')}` : '',
  ]
    .filter((item) => item.length > 0)
    .join('\n\n');

  if (summaryText.length === 0) {
    return null;
  }

  const extraTags = [...(record.tags ?? []), ...relatedFiles];
  return {
    kind: 'session_summary',
    authority: 'advisory',
    sourcePath,
    title: record.title.trim(),
    tags: toTags(workspaceRoot, sourcePath, ['summary', ...extraTags]),
    revision,
    chunks: [
      {
        headingPath: ['session-summary'],
        text: summaryText,
        weight: 0.72,
      },
    ],
  };
};

export const resolveCorpusSourceToDraft = async (
  source: MemoryCorpusSource,
  workspaceRoot: string,
  sessionSummaryRecord?: SessionSummaryRecord
): Promise<MemoryDocumentDraft | null> => {
  if (source.kind === 'doc') {
    return buildMarkdownDocumentDraft(source);
  }
  if (source.kind === 'code_note') {
    return buildCodeNoteDocumentDraft(source, workspaceRoot);
  }
  if (!sessionSummaryRecord) {
    return null;
  }
  return buildSessionSummaryDocumentDraft(sessionSummaryRecord, source.sourcePath, workspaceRoot);
};
