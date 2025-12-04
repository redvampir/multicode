import type { GraphState } from '../shared/graphState';

declare global {
  function acquireVsCodeApi<TState = unknown>(): {
    postMessage(message: unknown): void;
    getState(): TState | undefined;
    setState(data: TState): void;
  };

  const initialGraphState: GraphState | undefined;
}

export {};
