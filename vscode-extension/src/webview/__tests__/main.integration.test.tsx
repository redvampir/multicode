import React from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultGraphState, type GraphState } from '../../shared/graphState';
import type { ThemeMessage } from '../../shared/messages';

type WebviewGlobals = typeof globalThis & {
  acquireVsCodeApi: <T>() => {
    postMessage: (message: unknown) => void;
    setState: (state: T) => void;
    getState: () => T | undefined;
  };
  initialGraphState?: GraphState;
  initialTheme?: ThemeMessage;
};

const postMessageMock = vi.fn();
const setStateMock = vi.fn();
const getStateMock = vi.fn(() => undefined);
const acquireVsCodeApiMock: WebviewGlobals['acquireVsCodeApi'] = <T,>() => ({
  postMessage: postMessageMock,
  setState: (state: T): void => {
    setStateMock(state);
  },
  getState: (): T | undefined => getStateMock() as T | undefined
});

vi.mock('../BlueprintEditor', () => ({
  BlueprintEditor: ({ graph, onGraphChange }: { graph: any; onGraphChange: (next: any) => void }) => (
    <div data-testid="blueprint-editor-mock">
      Blueprint Editor Mock
      <button
        type="button"
        onClick={() =>
          onGraphChange({
            ...graph,
            name: 'local-change',
            dirty: true,
            updatedAt: new Date().toISOString(),
          })
        }
      >
        Simulate Blueprint Change
      </button>
    </div>
  )
}));

vi.mock('../GraphEditor', () => ({
  GraphEditor: () => <div data-testid="graph-editor-mock">Graph Editor Mock</div>
}));

vi.mock('../EnhancedCodePreviewPanel', () => ({
  EnhancedCodePreviewPanel: () => <div data-testid="enhanced-code-preview-mock">Code Preview Mock</div>
}));

vi.mock('../HelpPanel', () => ({
  default: () => <div data-testid="help-panel-mock">Help Panel Mock</div>
}));

const setEditorMode = (mode: 'blueprint' | 'cytoscape'): void => {
  const editorModeSelect = screen.getAllByRole('combobox')[0];
  fireEvent.change(editorModeSelect, { target: { value: mode } });
};

const dispatchValidationResult = (): void => {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: '',
        data: {
          type: 'validationResult',
          payload: {
            ok: false,
            errors: ['Тестовая ошибка'],
            warnings: [],
            issues: [{ severity: 'error', message: 'Тестовая ошибка' }]
          }
        }
      })
    );
  });
};

const dispatchSetState = (graph: GraphState): void => {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: '',
        data: {
          type: 'setState',
          payload: graph,
        },
      })
    );
  });
};

describe('main.tsx integration', () => {
  beforeAll(async () => {
    localStorage.clear();
    document.body.innerHTML = '<div id="root"></div>';

    const globals = globalThis as WebviewGlobals;
    globals.acquireVsCodeApi = acquireVsCodeApiMock;
    globals.initialGraphState = undefined;
    globals.initialTheme = undefined;

    await act(async () => {
      await import('../main');
    });
    await waitFor(() =>
      expect(postMessageMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'ready' }))
    );
  });

  beforeEach(() => {
    postMessageMock.mockClear();
    setStateMock.mockClear();
    getStateMock.mockClear();
    getStateMock.mockReturnValue(undefined);
  });

  afterAll(() => {
    document.body.innerHTML = '';
  });

  it('показывает общие правые панели в режиме Blueprint', async () => {
    setEditorMode('blueprint');
    dispatchValidationResult();

    expect(await screen.findByText('Перевод графа')).toBeInTheDocument();
    expect(screen.getByText('Настройки расположения')).toBeInTheDocument();
    expect(screen.getByText('Алгоритм')).toBeInTheDocument();
    expect(screen.getByText('Сводка графа')).toBeInTheDocument();
    expect(screen.getByText('Тестовая ошибка')).toBeInTheDocument();
    expect(screen.queryByText('Создать связь')).not.toBeInTheDocument();
  });

  it('в режиме Classic сохраняет общие панели и показывает NodeActions', async () => {
    setEditorMode('cytoscape');
    dispatchValidationResult();

    await waitFor(() => expect(screen.getByTestId('graph-editor-mock')).toBeInTheDocument());
    expect(screen.getByText('Перевод графа')).toBeInTheDocument();
    expect(screen.getByText('Настройки расположения')).toBeInTheDocument();
    expect(screen.getByText('Алгоритм')).toBeInTheDocument();
    expect(screen.getByText('Сводка графа')).toBeInTheDocument();
    expect(screen.getByText('Тестовая ошибка')).toBeInTheDocument();
    expect(screen.getByText('Создать связь')).toBeInTheDocument();
  });

  it('кнопка перевода в toolbar отправляет requestTranslate', async () => {
    setEditorMode('blueprint');

    const toolbar = document.querySelector('.toolbar');
    expect(toolbar).toBeTruthy();
    const translateButton = within(toolbar as HTMLElement).getByRole('button', { name: /Перевести/i });

    fireEvent.click(translateButton);

    expect(postMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'requestTranslate',
        payload: expect.objectContaining({ direction: 'ru-en' })
      })
    );
  });

  it('отправляет graphId вместе с graphChanged', async () => {
    setEditorMode('blueprint');
    postMessageMock.mockClear();
    vi.useFakeTimers();

    try {
      fireEvent.click(screen.getByRole('button', { name: 'Simulate Blueprint Change' }));

      dispatchSetState({
        ...createDefaultGraphState(),
        id: 'graph-switched',
        name: 'Switched graph',
        displayLanguage: 'ru',
        language: 'cpp',
      });

      await act(async () => {
        vi.advanceTimersByTime(220);
      });

      const graphChangedCalls = postMessageMock.mock.calls
        .map((entry) => entry[0])
        .filter((message) => message?.type === 'graphChanged');
      expect(graphChangedCalls.length).toBeGreaterThan(0);
      const payload = graphChangedCalls[graphChangedCalls.length - 1]?.payload as Record<string, unknown>;
      expect(typeof payload.graphId).toBe('string');
    } finally {
      vi.useRealTimers();
    }
  });
});
