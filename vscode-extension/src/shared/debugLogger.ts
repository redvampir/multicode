/**
 * Система отладочного логирования для MultiCode
 * СОХРАНЯЕТ ВСЕ ЛОГИ В ФАЙЛ: multicode-debug.log.txt
 */

export type LogLevel = "info" | "warn" | "error" | "debug" | "action";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: unknown;
  stackTrace?: string;
}

export class DebugLogger {
  private static instance: DebugLogger;
  private logs: LogEntry[] = [];
  private maxLogs = 1000;
  private isEnabled = true;
  private listeners: Array<(entry: LogEntry) => void> = [];

  private constructor() {
    // Webview версия - только IPC логирование
    // Файловая запись выполняется на extension side в GraphPanel
  }

  public static getInstance(): DebugLogger {
    if (!DebugLogger.instance) {
      DebugLogger.instance = new DebugLogger();
    }
    return DebugLogger.instance;
  }

  public enable(): void {
    this.isEnabled = true;
  }

  public disable(): void {
    this.isEnabled = false;
  }

  public log(
    level: LogLevel,
    category: string,
    message: string,
    data?: unknown,
  ): void {
    if (!this.isEnabled) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data,
      stackTrace: level === "error" ? new Error().stack : undefined,
    };

    this.logs.push(entry);

    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    this.listeners.forEach((listener) => {
      try {
        listener(entry);
      } catch {
        // Игнорируем ошибки listener
      }
    });

    this.consoleLog(entry);
  }

  // Файловое логирование перенесено в GraphPanel (extension side)

  private consoleLog(entry: LogEntry): void {
    const prefix = `[${entry.timestamp}] [${entry.category}]`;
    const message = `${prefix} ${entry.message}`;

    switch (entry.level) {
      case "error":
        console.error(message, entry.data);
        break;
      case "warn":
        console.warn(message, entry.data);
        break;
      case "debug":
        console.debug(message, entry.data);
        break;
      case "action":
        console.log(
          `%c${message}`,
          "color: #89b4fa; font-weight: bold",
          entry.data,
        );
        break;
      default:
        console.log(message, entry.data);
    }
  }

  public info(category: string, message: string, data?: unknown): void {
    this.log("info", category, message, data);
  }

  public warn(category: string, message: string, data?: unknown): void {
    this.log("warn", category, message, data);
  }

  public error(category: string, message: string, data?: unknown): void {
    this.log("error", category, message, data);
  }

  public debug(category: string, message: string, data?: unknown): void {
    this.log("debug", category, message, data);
  }

  public action(category: string, message: string, data?: unknown): void {
    this.log("action", category, message, data);
  }

  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  public getLogsByCategory(category: string): LogEntry[] {
    return this.logs.filter((log) => log.category === category);
  }

  public getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter((log) => log.level === level);
  }

  public clear(): void {
    this.logs = [];
  }

  public addListener(listener: (entry: LogEntry) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  public exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  public exportLogsAsText(): string {
    return this.logs
      .map((log) => {
        const data = log.data ? ` | ${JSON.stringify(log.data)}` : "";
        return `[${log.timestamp}] [${log.level.toUpperCase()}] [${log.category}] ${log.message}${data}`;
      })
      .join("\n");
  }
}

export const logger = DebugLogger.getInstance();

export const LOG_CATEGORIES = {
  WEBVIEW_INIT: "webview:init",
  WEBVIEW_IPC: "webview:ipc",
  WEBVIEW_ERROR: "webview:error",
  GRAPH_CHANGE: "graph:change",
  GRAPH_LOAD: "graph:load",
  GRAPH_SAVE: "graph:save",
  GRAPH_VALIDATE: "graph:validate",
  NODE_CREATE: "node:create",
  NODE_DELETE: "node:delete",
  NODE_UPDATE: "node:update",
  NODE_CONNECT: "node:connect",
  VARIABLE_CREATE: "variable:create",
  VARIABLE_UPDATE: "variable:update",
  VARIABLE_DELETE: "variable:delete",
  VARIABLE_GET_NODE: "variable:get-node",
  VARIABLE_SET_NODE: "variable:set-node",
  FUNCTION_CREATE: "function:create",
  FUNCTION_UPDATE: "function:update",
  FUNCTION_DELETE: "function:delete",
  FUNCTION_SWITCH: "function:switch",
  CODEGEN_START: "codegen:start",
  CODEGEN_SUCCESS: "codegen:success",
  CODEGEN_ERROR: "codegen:error",
  EXTENSION_ACTIVATE: "extension:activate",
  EXTENSION_COMMAND: "extension:command",
  EXTENSION_ERROR: "extension:error",
} as const;
