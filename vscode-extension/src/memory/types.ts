export type MemorySourceKind = 'doc' | 'code_note' | 'session_summary';
export type MemoryAuthority = 'canonical' | 'advisory';

export interface MemoryChunk {
  id: string;
  documentId: string;
  headingPath: string[];
  text: string;
  tokens: string[];
  weight: number;
}

export interface MemoryChunkDraft {
  headingPath: string[];
  text: string;
  weight: number;
}

export interface MemoryDocument {
  id: string;
  kind: MemorySourceKind;
  authority: MemoryAuthority;
  sourcePath: string;
  title: string;
  tags: string[];
  revision: string;
  chunks: MemoryChunk[];
}

export interface MemoryDocumentDraft {
  kind: MemorySourceKind;
  authority: MemoryAuthority;
  sourcePath: string;
  title: string;
  tags: string[];
  revision: string;
  chunks: MemoryChunkDraft[];
}

export interface MemorySearchQuery {
  text: string;
  limit?: number;
  tags?: string[];
  kinds?: MemorySourceKind[];
}

export interface MemorySearchHit {
  chunkId: string;
  score: number;
  authority: MemoryAuthority;
  kind: MemorySourceKind;
  title: string;
  snippet: string;
  sourcePath: string;
  headingPath: string[];
  tags: string[];
}

export interface MemoryDiagnostics {
  workspaceId: string;
  indexedDocuments: number;
  indexedChunks: number;
  canonicalDocuments: number;
  advisoryDocuments: number;
  reusedDocuments: number;
  rebuiltDocuments: number;
  removedDocuments: number;
  lastIndexedAt: string;
  warnings: string[];
}

export interface ContextPack {
  query: MemorySearchQuery;
  generatedAt: string;
  hits: MemorySearchHit[];
  diagnostics: MemoryDiagnostics;
}

export interface SessionSummaryInput {
  title: string;
  summary: string;
  tags?: string[];
  relatedFiles?: string[];
}

export interface SessionSummaryRecord extends SessionSummaryInput {
  id: string;
  createdAt: string;
  workspaceId: string;
  authority: 'advisory';
}

export interface MemoryIndexSnapshot {
  version: 1;
  workspaceId: string;
  workspaceRoot: string | null;
  documents: MemoryDocument[];
  diagnostics: MemoryDiagnostics;
}

export interface MemoryReindexOptions {
  force?: boolean;
  sourcePath?: string;
}

export interface MemoryLogger {
  (message: string, data?: Record<string, unknown>): void;
}

export interface MemoryCorpusSource {
  kind: MemorySourceKind;
  authority: MemoryAuthority;
  sourcePath: string;
  revision: string;
  tags: string[];
}
