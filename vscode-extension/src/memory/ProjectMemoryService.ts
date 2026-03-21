import * as path from 'path';
import * as vscode from 'vscode';
import { ProjectMemoryEngine } from './ProjectMemoryEngine';
import type {
  ContextPack,
  MemoryDiagnostics,
  MemoryReindexOptions,
  MemorySearchQuery,
  SessionSummaryInput,
  SessionSummaryRecord,
} from './types';

const WATCH_PATTERNS = [
  'README.md',
  'ROADMAP.md',
  'AI_AGENTS_GUIDE.md',
  'CODING_GUIDELINES.md',
  'Документы/README.md',
  'include/visprog/core/**/*',
  'vscode-extension/src/shared/**/*',
  'vscode-extension/src/panel/**/*',
];

const normalizeFsPath = (filePath: string): string => path.normalize(filePath);

export class ProjectMemoryService implements vscode.Disposable {
  private readonly engine: ProjectMemoryEngine;
  private readonly watchers: vscode.FileSystemWatcher[] = [];
  private readonly pendingPaths = new Set<string>();
  private pendingFullReindex = false;
  private reindexTimer: NodeJS.Timeout | undefined;
  private readonly workspaceRoot: string | undefined;

  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly outputChannel: vscode.OutputChannel
  ) {
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    this.engine = new ProjectMemoryEngine({
      workspaceRoot: this.workspaceRoot,
      storageRoot: path.join(context.globalStorageUri.fsPath, 'project-memory'),
      logger: (message, data) => this.log(message, data),
    });
    this.initializeWatchers();
  }

  public async reindex(options: MemoryReindexOptions = {}): Promise<MemoryDiagnostics> {
    return this.engine.reindex(options);
  }

  public async search(query: MemorySearchQuery): Promise<ContextPack> {
    return this.engine.search(query);
  }

  public async saveSessionSummary(input: SessionSummaryInput): Promise<SessionSummaryRecord> {
    return this.engine.saveSessionSummary(input);
  }

  public dispose(): void {
    for (const watcher of this.watchers) {
      watcher.dispose();
    }
    if (this.reindexTimer) {
      clearTimeout(this.reindexTimer);
      this.reindexTimer = undefined;
    }
  }

  private initializeWatchers(): void {
    if (!this.workspaceRoot) {
      return;
    }

    for (const pattern of WATCH_PATTERNS) {
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(this.workspaceRoot, pattern));
      watcher.onDidChange((uri) => this.scheduleReindex(uri.fsPath));
      watcher.onDidCreate((uri) => this.scheduleReindex(uri.fsPath));
      watcher.onDidDelete((uri) => this.scheduleReindex(uri.fsPath));
      this.watchers.push(watcher);
      this.context.subscriptions.push(watcher);
    }
  }

  private scheduleReindex(sourcePath: string): void {
    const normalizedPath = normalizeFsPath(sourcePath);
    if (normalizedPath.endsWith(normalizeFsPath(path.join('Документы', 'README.md')))) {
      this.pendingFullReindex = true;
    } else {
      this.pendingPaths.add(normalizedPath);
    }

    if (this.reindexTimer) {
      clearTimeout(this.reindexTimer);
    }
    this.reindexTimer = setTimeout(() => {
      void this.flushPendingReindex();
    }, 250);
  }

  private async flushPendingReindex(): Promise<void> {
    const shouldRunFullReindex = this.pendingFullReindex || this.pendingPaths.size === 0 || this.pendingPaths.size > 5;
    const paths = Array.from(this.pendingPaths);
    this.pendingPaths.clear();
    this.pendingFullReindex = false;
    this.reindexTimer = undefined;

    try {
      if (shouldRunFullReindex) {
        await this.engine.reindex();
        return;
      }

      for (const sourcePath of paths) {
        await this.engine.reindex({ sourcePath });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`[Memory] Не удалось переиндексировать корпус: ${message}`);
    }
  }

  private log(message: string, data?: Record<string, unknown>): void {
    const suffix = data ? ` ${JSON.stringify(data)}` : '';
    this.outputChannel.appendLine(`[Memory] ${message}${suffix}`);
  }
}
