import type { ProjectMemoryService } from './ProjectMemoryService';
import type {
  ContextPack,
  MemoryDiagnostics,
  MemoryReindexOptions,
  MemorySearchQuery,
  SessionSummaryInput,
} from './types';

export const MEMORY_COMMAND_IDS = {
  reindex: 'multicode.memory.reindex',
  search: 'multicode.memory.search',
  saveSessionSummary: 'multicode.memory.saveSessionSummary',
} as const;

interface DisposableLike {
  dispose(): void;
}

interface CommandHost {
  commands: {
    registerCommand(command: string, callback: (...args: unknown[]) => unknown): DisposableLike;
  };
  window: {
    showInputBox(options?: {
      prompt?: string;
      placeHolder?: string;
      ignoreFocusOut?: boolean;
    }): PromiseLike<string | undefined>;
  };
}

interface OutputLike {
  appendLine(value: string): void;
  show?(preserveFocus?: boolean): void;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const ensureStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
};

const formatDiagnostics = (diagnostics: MemoryDiagnostics): string =>
  `docs=${diagnostics.indexedDocuments}, chunks=${diagnostics.indexedChunks}, rebuilt=${diagnostics.rebuiltDocuments}, reused=${diagnostics.reusedDocuments}, removed=${diagnostics.removedDocuments}`;

const logSearchResult = (output: OutputLike, pack: ContextPack): void => {
  output.appendLine(`[Memory] Search "${pack.query.text}" -> hits=${pack.hits.length}`);
  for (const hit of pack.hits) {
    const heading = hit.headingPath.length > 0 ? ` :: ${hit.headingPath.join(' > ')}` : '';
    output.appendLine(
      `[Memory]   ${hit.kind}/${hit.authority} score=${hit.score.toFixed(2)} ${hit.title}${heading} :: ${hit.sourcePath}`
    );
  }
};

const promptForText = async (host: CommandHost, prompt: string, placeHolder: string): Promise<string | null> => {
  const value = await host.window.showInputBox({
    prompt,
    placeHolder,
    ignoreFocusOut: true,
  });
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
};

const toReindexOptions = (value: unknown): MemoryReindexOptions => {
  if (!isRecord(value)) {
    return {};
  }
  return {
    force: value.force === true,
    sourcePath: typeof value.sourcePath === 'string' ? value.sourcePath : undefined,
  };
};

const toSearchQuery = (value: unknown): MemorySearchQuery | null => {
  if (typeof value === 'string') {
    return { text: value };
  }
  if (!isRecord(value) || typeof value.text !== 'string') {
    return null;
  }
  return {
    text: value.text,
    limit: typeof value.limit === 'number' ? value.limit : undefined,
    tags: ensureStringArray(value.tags),
    kinds: ensureStringArray(value.kinds) as MemorySearchQuery['kinds'],
  };
};

const toSummaryInput = (value: unknown): SessionSummaryInput | null => {
  if (!isRecord(value) || typeof value.title !== 'string' || typeof value.summary !== 'string') {
    return null;
  }
  return {
    title: value.title,
    summary: value.summary,
    tags: ensureStringArray(value.tags),
    relatedFiles: ensureStringArray(value.relatedFiles),
  };
};

export const registerMemoryCommands = (
  host: CommandHost,
  service: ProjectMemoryService,
  output: OutputLike
): DisposableLike[] => {
  const reindexCommand = host.commands.registerCommand(MEMORY_COMMAND_IDS.reindex, async (value?: unknown) => {
    const diagnostics = await service.reindex(toReindexOptions(value));
    output.appendLine(`[Memory] Reindex complete: ${formatDiagnostics(diagnostics)}`);
    output.show?.(true);
    return diagnostics;
  });

  const searchCommand = host.commands.registerCommand(MEMORY_COMMAND_IDS.search, async (value?: unknown) => {
    let effectiveQuery = toSearchQuery(value);
    if (!effectiveQuery) {
      const text = await promptForText(host, 'Что искать в памяти проекта?', 'Например: сериализация .multicode');
      if (!text) {
        return null;
      }
      effectiveQuery = { text };
    }

    const pack = await service.search(effectiveQuery);
    logSearchResult(output, pack);
    output.show?.(true);
    return pack;
  });

  const saveSummaryCommand = host.commands.registerCommand(MEMORY_COMMAND_IDS.saveSessionSummary, async (value?: unknown) => {
    let summaryInput = toSummaryInput(value);
    if (!summaryInput) {
      const title = await promptForText(host, 'Заголовок session summary', 'Короткое название решения');
      if (!title) {
        return null;
      }
      const summary = await promptForText(host, 'Содержимое session summary', 'Что решили и почему');
      if (!summary) {
        return null;
      }
      summaryInput = { title, summary };
    }

    const record = await service.saveSessionSummary(summaryInput);
    output.appendLine(`[Memory] Session summary saved: ${record.id} :: ${record.title}`);
    output.show?.(true);
    return record;
  });

  return [reindexCommand, searchCommand, saveSummaryCommand];
};

export type { CommandHost, OutputLike };
