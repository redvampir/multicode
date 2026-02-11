/**
 * Лёгкий debug logger для webview.
 *
 * Цель: централизовать журналирование действий UI без зависимости от VS Code API.
 * INVARIANT: логирование не должно ломать UX даже при ошибке console.
 */

export const LOG_CATEGORIES = {
  VARIABLE_CREATE: 'variable:create',
  VARIABLE_UPDATE: 'variable:update',
  VARIABLE_DELETE: 'variable:delete',
} as const;

type LogCategory = (typeof LOG_CATEGORIES)[keyof typeof LOG_CATEGORIES];

interface LogPayload {
  [key: string]: unknown;
}

export const logger = {
  action(category: LogCategory, message: string, payload?: LogPayload): void {
    try {
      // NOTE: оставляем debug-уровень, чтобы не шуметь в production-консолях.
      if (payload) {
        console.debug(`[MultiCode][${category}] ${message}`, payload);
        return;
      }

      console.debug(`[MultiCode][${category}] ${message}`);
    } catch {
      // DANGER: логгер не должен ронять webview при проблемах среды.
    }
  },
};
