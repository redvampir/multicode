import * as fs from 'fs/promises';
import * as path from 'path';
import { sha1 } from '../panel/symbol-indexer/hash';
import {
  buildSessionSummaryDocumentDraft,
  discoverCanonicalSources,
  resolveCorpusSourceToDraft,
} from './corpus';
import { searchDocuments } from './ranking';
import type {
  ContextPack,
  MemoryCorpusSource,
  MemoryDiagnostics,
  MemoryDocument,
  MemoryDocumentDraft,
  MemoryIndexSnapshot,
  MemoryLogger,
  MemoryReindexOptions,
  MemorySearchQuery,
  SessionSummaryInput,
  SessionSummaryRecord,
} from './types';
import { tokenizeText } from './tokenizer';

const INDEX_VERSION = 1 as const;
const INDEX_FILE_NAME = 'index.json';
const SESSION_SUMMARY_SUFFIX = '.session-summary.json';

const normalizeFsPath = (filePath: string): string => path.normalize(filePath);
const unique = <T>(items: T[]): T[] => Array.from(new Set(items));
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const createWorkspaceId = (workspaceRoot: string | null): string =>
  workspaceRoot ? sha1(normalizeFsPath(workspaceRoot).toLowerCase()).slice(0, 12) : 'no-workspace';

const toDiagnostics = (workspaceId: string, warnings: string[]): MemoryDiagnostics => ({
  workspaceId,
  indexedDocuments: 0,
  indexedChunks: 0,
  canonicalDocuments: 0,
  advisoryDocuments: 0,
  reusedDocuments: 0,
  rebuiltDocuments: 0,
  removedDocuments: 0,
  lastIndexedAt: new Date().toISOString(),
  warnings,
});

const ensureArrayOfStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const ensureFilePath = async (targetPath: string): Promise<void> => {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
};

export class ProjectMemoryEngine {
  private snapshot: MemoryIndexSnapshot | null = null;
  private snapshotLoaded = false;
  private initialIndexVerified = false;
  private readonly workspaceRoot: string | null;
  private readonly workspaceId: string;
  private readonly workspaceStorageDir: string;
  private readonly indexFilePath: string;
  private readonly sessionSummaryDir: string;

  public constructor(
    private readonly options: {
      workspaceRoot?: string;
      storageRoot: string;
      logger?: MemoryLogger;
    }
  ) {
    this.workspaceRoot = options.workspaceRoot ? normalizeFsPath(options.workspaceRoot) : null;
    this.workspaceId = createWorkspaceId(this.workspaceRoot);
    this.workspaceStorageDir = path.join(options.storageRoot, this.workspaceId);
    this.indexFilePath = path.join(this.workspaceStorageDir, INDEX_FILE_NAME);
    this.sessionSummaryDir = path.join(this.workspaceStorageDir, 'session-summaries');
  }

  public async reindex(options: MemoryReindexOptions = {}): Promise<MemoryDiagnostics> {
    await this.ensureLoaded();

    if (!this.workspaceRoot) {
      this.snapshot = {
        version: INDEX_VERSION,
        workspaceId: this.workspaceId,
        workspaceRoot: null,
        documents: [],
        diagnostics: toDiagnostics(this.workspaceId, ['Workspace не открыт: память проекта недоступна.']),
      };
      await this.saveSnapshot();
      this.initialIndexVerified = true;
      return this.snapshot.diagnostics;
    }

    const warnings: string[] = [];
    const existingBySource = new Map<string, MemoryDocument>(
      (this.snapshot?.documents ?? []).map((document) => [this.makeDocumentCacheKey(document.kind, document.sourcePath), document])
    );

    const { sources: canonicalSources, warnings: sourceWarnings } = await discoverCanonicalSources(
      this.workspaceRoot,
      this.options.logger
    );
    warnings.push(...sourceWarnings);

    const sessionSummarySources = await this.loadSessionSummarySources();
    const allSources = [...canonicalSources, ...sessionSummarySources];
    const targetPath = options.sourcePath ? normalizeFsPath(options.sourcePath) : null;
    const nextDocuments: MemoryDocument[] = [];
    const desiredKeys = new Set(allSources.map((source) => this.makeDocumentCacheKey(source.kind, source.sourcePath)));
    let reusedDocuments = 0;
    let rebuiltDocuments = 0;

    for (const source of allSources) {
      const cacheKey = this.makeDocumentCacheKey(source.kind, source.sourcePath);
      const existing = existingBySource.get(cacheKey);
      const shouldRebuild =
        Boolean(options.force) ||
        existing === undefined ||
        existing.revision !== source.revision ||
        (targetPath !== null && normalizeFsPath(source.sourcePath) === targetPath);

      if (!shouldRebuild) {
        nextDocuments.push(existing);
        reusedDocuments += 1;
        continue;
      }

      const nextDocument = await this.buildDocument(source);
      if (nextDocument) {
        nextDocuments.push(nextDocument);
      }
      rebuiltDocuments += 1;
    }

    const removedDocuments = (this.snapshot?.documents ?? []).filter((document) => {
      const cacheKey = this.makeDocumentCacheKey(document.kind, document.sourcePath);
      return !desiredKeys.has(cacheKey);
    }).length;

    const diagnostics: MemoryDiagnostics = {
      workspaceId: this.workspaceId,
      indexedDocuments: nextDocuments.length,
      indexedChunks: nextDocuments.reduce((total, document) => total + document.chunks.length, 0),
      canonicalDocuments: nextDocuments.filter((document) => document.authority === 'canonical').length,
      advisoryDocuments: nextDocuments.filter((document) => document.authority === 'advisory').length,
      reusedDocuments,
      rebuiltDocuments,
      removedDocuments,
      lastIndexedAt: new Date().toISOString(),
      warnings: unique(warnings),
    };

    this.snapshot = {
      version: INDEX_VERSION,
      workspaceId: this.workspaceId,
      workspaceRoot: this.workspaceRoot,
      documents: nextDocuments.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath)),
      diagnostics,
    };

    await this.saveSnapshot();
    this.initialIndexVerified = true;
    this.options.logger?.('Индекс памяти обновлён', {
      documents: diagnostics.indexedDocuments,
      chunks: diagnostics.indexedChunks,
      rebuiltDocuments: diagnostics.rebuiltDocuments,
      reusedDocuments: diagnostics.reusedDocuments,
      removedDocuments: diagnostics.removedDocuments,
    });
    return diagnostics;
  }

  public async search(query: MemorySearchQuery): Promise<ContextPack> {
    await this.ensureIndexed();
    const snapshot = this.snapshot ?? this.createEmptySnapshot();
    const normalizedQuery: MemorySearchQuery = {
      text: query.text.trim(),
      limit: query.limit,
      tags: query.tags,
      kinds: query.kinds,
    };

    return {
      query: normalizedQuery,
      generatedAt: new Date().toISOString(),
      hits: searchDocuments(snapshot.documents, normalizedQuery),
      diagnostics: snapshot.diagnostics,
    };
  }

  public async saveSessionSummary(input: SessionSummaryInput): Promise<SessionSummaryRecord> {
    const title = input.title.trim();
    const summary = input.summary.trim();

    if (title.length === 0) {
      throw new Error('Не указан заголовок session summary.');
    }
    if (summary.length === 0) {
      throw new Error('Не заполнен текст session summary.');
    }

    const createdAt = new Date().toISOString();
    const record: SessionSummaryRecord = {
      id: sha1(`${this.workspaceId}:${title}:${createdAt}`).slice(0, 16),
      title,
      summary,
      tags: unique((input.tags ?? []).map((item) => item.trim()).filter((item) => item.length > 0)),
      relatedFiles: unique((input.relatedFiles ?? []).map((item) => item.trim()).filter((item) => item.length > 0)),
      createdAt,
      workspaceId: this.workspaceId,
      authority: 'advisory',
    };

    const summaryPath = path.join(this.sessionSummaryDir, `${record.id}${SESSION_SUMMARY_SUFFIX}`);
    await ensureFilePath(summaryPath);
    await fs.writeFile(summaryPath, JSON.stringify(record, null, 2), 'utf8');
    await this.reindex({ sourcePath: summaryPath });
    return record;
  }

  public getSnapshot(): MemoryIndexSnapshot | null {
    return this.snapshot;
  }

  private async ensureIndexed(): Promise<void> {
    await this.ensureLoaded();
    if (this.initialIndexVerified) {
      return;
    }
    await this.reindex();
  }

  private async ensureLoaded(): Promise<void> {
    if (this.snapshotLoaded) {
      return;
    }
    this.snapshot = await this.loadSnapshot();
    this.snapshotLoaded = true;
  }

  private async loadSnapshot(): Promise<MemoryIndexSnapshot | null> {
    try {
      const raw = await fs.readFile(this.indexFilePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!isRecord(parsed) || parsed.version !== INDEX_VERSION || !Array.isArray(parsed.documents) || !isRecord(parsed.diagnostics)) {
        return null;
      }

      return {
        version: INDEX_VERSION,
        workspaceId: typeof parsed.workspaceId === 'string' ? parsed.workspaceId : this.workspaceId,
        workspaceRoot: typeof parsed.workspaceRoot === 'string' ? parsed.workspaceRoot : null,
        documents: parsed.documents
          .filter((item): item is Record<string, unknown> => isRecord(item))
          .map((document) => ({
            id: String(document.id ?? ''),
            kind: document.kind === 'code_note' || document.kind === 'session_summary' ? document.kind : 'doc',
            authority: document.authority === 'advisory' ? 'advisory' : 'canonical',
            sourcePath: String(document.sourcePath ?? ''),
            title: String(document.title ?? ''),
            tags: ensureArrayOfStrings(document.tags),
            revision: String(document.revision ?? ''),
            chunks: Array.isArray(document.chunks)
              ? document.chunks
                  .filter((chunk): chunk is Record<string, unknown> => isRecord(chunk))
                  .map((chunk) => ({
                    id: String(chunk.id ?? ''),
                    documentId: String(chunk.documentId ?? ''),
                    headingPath: ensureArrayOfStrings(chunk.headingPath),
                    text: String(chunk.text ?? ''),
                    tokens: ensureArrayOfStrings(chunk.tokens),
                    weight: typeof chunk.weight === 'number' ? chunk.weight : 1,
                  }))
              : [],
          })),
        diagnostics: {
          workspaceId: typeof parsed.diagnostics.workspaceId === 'string' ? parsed.diagnostics.workspaceId : this.workspaceId,
          indexedDocuments:
            typeof parsed.diagnostics.indexedDocuments === 'number' ? parsed.diagnostics.indexedDocuments : 0,
          indexedChunks: typeof parsed.diagnostics.indexedChunks === 'number' ? parsed.diagnostics.indexedChunks : 0,
          canonicalDocuments:
            typeof parsed.diagnostics.canonicalDocuments === 'number' ? parsed.diagnostics.canonicalDocuments : 0,
          advisoryDocuments:
            typeof parsed.diagnostics.advisoryDocuments === 'number' ? parsed.diagnostics.advisoryDocuments : 0,
          reusedDocuments: typeof parsed.diagnostics.reusedDocuments === 'number' ? parsed.diagnostics.reusedDocuments : 0,
          rebuiltDocuments:
            typeof parsed.diagnostics.rebuiltDocuments === 'number' ? parsed.diagnostics.rebuiltDocuments : 0,
          removedDocuments:
            typeof parsed.diagnostics.removedDocuments === 'number' ? parsed.diagnostics.removedDocuments : 0,
          lastIndexedAt:
            typeof parsed.diagnostics.lastIndexedAt === 'string'
              ? parsed.diagnostics.lastIndexedAt
              : new Date().toISOString(),
          warnings: ensureArrayOfStrings(parsed.diagnostics.warnings),
        },
      };
    } catch {
      return null;
    }
  }

  private async saveSnapshot(): Promise<void> {
    if (!this.snapshot) {
      return;
    }
    await ensureFilePath(this.indexFilePath);
    await fs.writeFile(this.indexFilePath, JSON.stringify(this.snapshot, null, 2), 'utf8');
  }

  private async buildDocument(source: MemoryCorpusSource): Promise<MemoryDocument | null> {
    if (!this.workspaceRoot) {
      return null;
    }

    let draft: MemoryDocumentDraft | null = null;
    if (source.kind === 'session_summary') {
      const record = await this.loadSessionSummaryRecord(source.sourcePath);
      if (record) {
        draft = await buildSessionSummaryDocumentDraft(record, source.sourcePath, this.workspaceRoot);
      }
    } else {
      draft = await resolveCorpusSourceToDraft(source, this.workspaceRoot);
    }

    if (!draft || draft.chunks.length === 0) {
      return null;
    }

    const documentId = sha1(`${this.workspaceId}:${draft.kind}:${draft.sourcePath}:${draft.revision}`);
    return {
      id: documentId,
      kind: draft.kind,
      authority: draft.authority,
      sourcePath: draft.sourcePath,
      title: draft.title,
      tags: unique(draft.tags.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag.length > 0)),
      revision: draft.revision,
      chunks: draft.chunks.map((chunk, index) => ({
        id: sha1(`${documentId}:${index}:${chunk.headingPath.join('>')}`),
        documentId,
        headingPath: chunk.headingPath,
        text: chunk.text.trim(),
        tokens: tokenizeText([draft.title, ...chunk.headingPath, chunk.text].join(' ')),
        weight: chunk.weight,
      })),
    };
  }

  private async loadSessionSummarySources(): Promise<MemoryCorpusSource[]> {
    if (!(await this.pathExists(this.sessionSummaryDir))) {
      return [];
    }

    const files = (await fs.readdir(this.sessionSummaryDir))
      .filter((fileName) => fileName.endsWith(SESSION_SUMMARY_SUFFIX))
      .map((fileName) => path.join(this.sessionSummaryDir, fileName));

    const sources: MemoryCorpusSource[] = [];
    for (const filePath of files) {
      try {
        const stat = await fs.stat(filePath);
        sources.push({
          kind: 'session_summary',
          authority: 'advisory',
          sourcePath: normalizeFsPath(filePath),
          revision: sha1(`${Math.trunc(stat.mtimeMs)}:${stat.size}`),
          tags: ['summary'],
        });
      } catch {
        continue;
      }
    }

    return sources.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
  }

  private async loadSessionSummaryRecord(sourcePath: string): Promise<SessionSummaryRecord | null> {
    try {
      const raw = await fs.readFile(sourcePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!isRecord(parsed) || typeof parsed.title !== 'string' || typeof parsed.summary !== 'string') {
        return null;
      }
      return {
        id: typeof parsed.id === 'string' ? parsed.id : path.basename(sourcePath, SESSION_SUMMARY_SUFFIX),
        title: parsed.title,
        summary: parsed.summary,
        tags: ensureArrayOfStrings(parsed.tags),
        relatedFiles: ensureArrayOfStrings(parsed.relatedFiles),
        createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
        workspaceId: typeof parsed.workspaceId === 'string' ? parsed.workspaceId : this.workspaceId,
        authority: 'advisory',
      };
    } catch {
      return null;
    }
  }

  private makeDocumentCacheKey(kind: string, sourcePath: string): string {
    return `${kind}:${normalizeFsPath(sourcePath)}`;
  }

  private createEmptySnapshot(): MemoryIndexSnapshot {
    return {
      version: INDEX_VERSION,
      workspaceId: this.workspaceId,
      workspaceRoot: this.workspaceRoot,
      documents: [],
      diagnostics: toDiagnostics(this.workspaceId, []),
    };
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await fs.stat(targetPath);
      return true;
    } catch {
      return false;
    }
  }
}
