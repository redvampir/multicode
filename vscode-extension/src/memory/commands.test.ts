import { describe, expect, it, vi } from 'vitest';
import { MEMORY_COMMAND_IDS, registerMemoryCommands } from './commands';

describe('memory/commands', () => {
  it('регистрирует команды и проксирует вызовы в service', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const host = {
      commands: {
        registerCommand: (command: string, callback: (...args: unknown[]) => unknown) => {
          handlers.set(command, callback);
          return {
            dispose: () => handlers.delete(command),
          };
        },
      },
      window: {
        showInputBox: vi.fn(),
      },
    };

    const service = {
      reindex: vi.fn(async () => ({
        workspaceId: 'workspace',
        indexedDocuments: 3,
        indexedChunks: 5,
        canonicalDocuments: 2,
        advisoryDocuments: 1,
        reusedDocuments: 2,
        rebuiltDocuments: 1,
        removedDocuments: 0,
        lastIndexedAt: new Date().toISOString(),
        warnings: [],
      })),
      search: vi.fn(async () => ({
        query: { text: 'serializer' },
        generatedAt: new Date().toISOString(),
        hits: [],
        diagnostics: {
          workspaceId: 'workspace',
          indexedDocuments: 3,
          indexedChunks: 5,
          canonicalDocuments: 2,
          advisoryDocuments: 1,
          reusedDocuments: 2,
          rebuiltDocuments: 1,
          removedDocuments: 0,
          lastIndexedAt: new Date().toISOString(),
          warnings: [],
        },
      })),
      saveSessionSummary: vi.fn(async () => ({
        id: 'summary',
        title: 'Session',
        summary: 'text',
        tags: [],
        relatedFiles: [],
        createdAt: new Date().toISOString(),
        workspaceId: 'workspace',
        authority: 'advisory' as const,
      })),
    };
    const output = {
      appendLine: vi.fn(),
      show: vi.fn(),
    };

    const disposables = registerMemoryCommands(host, service as never, output);

    expect(disposables).toHaveLength(3);
    expect(handlers.has(MEMORY_COMMAND_IDS.reindex)).toBe(true);
    expect(handlers.has(MEMORY_COMMAND_IDS.search)).toBe(true);
    expect(handlers.has(MEMORY_COMMAND_IDS.saveSessionSummary)).toBe(true);

    const reindexResult = await handlers.get(MEMORY_COMMAND_IDS.reindex)?.({ force: true });
    const searchResult = await handlers.get(MEMORY_COMMAND_IDS.search)?.({ text: 'serializer', limit: 2 });
    const summaryResult = await handlers
      .get(MEMORY_COMMAND_IDS.saveSessionSummary)
      ?.({ title: 'Session', summary: 'text' });

    expect(service.reindex).toHaveBeenCalledWith({ force: true, sourcePath: undefined });
    expect(service.search).toHaveBeenCalledWith({ text: 'serializer', limit: 2, tags: undefined, kinds: undefined });
    expect(service.saveSessionSummary).toHaveBeenCalledWith({ title: 'Session', summary: 'text', tags: undefined, relatedFiles: undefined });
    expect(reindexResult).toBeTruthy();
    expect(searchResult).toBeTruthy();
    expect(summaryResult).toBeTruthy();
    expect(output.appendLine).toHaveBeenCalled();
  });
});
