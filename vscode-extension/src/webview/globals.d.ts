declare function acquireVsCodeApi<TState = unknown>(): {
  postMessage(message: unknown): void;
  getState(): TState | undefined;
  setState(data: TState): void;
};
