import React from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultGraphState, type GraphState } from '../../shared/graphState';
import type { BlueprintGraphState } from '../../shared/blueprintTypes';
import type { SymbolDescriptor } from '../../shared/externalSymbols';
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
  BlueprintEditor: ({ graph, onGraphChange }: { graph: BlueprintGraphState; onGraphChange: (next: BlueprintGraphState) => void }) => (
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

vi.mock('../DependencyViewPanel', () => ({
  DependencyViewPanel: ({ onInsertSymbol }: { onInsertSymbol?: (symbol: SymbolDescriptor, localizedName: string) => void }) => {
    const symbol: SymbolDescriptor = {
      id: 'depcheck::print_status',
      integrationId: 'depcheck',
      symbolKind: 'function',
      name: 'print_status',
      signature: 'print_status(std::string_view message)',
      signatureHash: 'sig-main-test',
      namespacePath: ['depcheck'],
    };

    return (
      <div data-testid="dependency-view-panel-mock">
        <button
          type="button"
          onClick={() => onInsertSymbol?.(symbol, 'Напечатать статус')}
        >
          Insert External Symbol
        </button>
      </div>
    );
  },
}));

const openToolbarMenu = async (triggerTestId: string, popupTestId: string): Promise<void> => {
  const trigger = screen.getByTestId(triggerTestId);
  fireEvent.click(trigger);
  if (!screen.queryByTestId(popupTestId)) {
    fireEvent.click(trigger);
  }
  await screen.findByTestId(popupTestId);
};

const setEditorMode = async (mode: 'blueprint' | 'cytoscape' | 'dependency'): Promise<void> => {
  await openToolbarMenu('toolbar-mode-menu-trigger', 'toolbar-mode-menu-popup');
  const editorModeSelect = screen.getByTestId('toolbar-editor-mode-select');
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

const dispatchExternalIpcResponse = (data: unknown): void => {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: '',
        data,
      })
    );
  });
};

const openWorkingFilesMenu = async (): Promise<void> =>
  openToolbarMenu('toolbar-files-menu-trigger', 'toolbar-files-menu-popup');

const openUtilityTab = (tabId: 'problems' | 'generated' | 'console' | 'packages' | 'dependencies'): void => {
  fireEvent.click(screen.getByTestId(`utility-tab-${tabId}`));
};

const setViewportWidth = (width: number): void => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
};

describe('main.tsx integration', () => {
  beforeAll(async () => {
    localStorage.clear();
    document.body.innerHTML = '<div id="root"></div>';
    setViewportWidth(1440);

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
    setViewportWidth(1440);
  });

  afterAll(() => {
    document.body.innerHTML = '';
  });

  it('показывает общие правые панели в режиме Blueprint', async () => {
    await setEditorMode('blueprint');
    dispatchValidationResult();

    expect(await screen.findByText('Перевод графа')).toBeInTheDocument();
    expect(screen.getByText('Настройки расположения')).toBeInTheDocument();
    expect(screen.getByText('Алгоритм')).toBeInTheDocument();
    expect(screen.getByText('Сводка графа')).toBeInTheDocument();
    expect(screen.getAllByText('Тестовая ошибка').length).toBeGreaterThan(0);
    expect(screen.queryByText('Создать связь')).not.toBeInTheDocument();
  });

  it('в режиме Classic сохраняет общие панели и показывает NodeActions', async () => {
    await setEditorMode('cytoscape');
    dispatchValidationResult();

    await waitFor(() => expect(screen.getByTestId('graph-editor-mock')).toBeInTheDocument());
    expect(screen.getByText('Перевод графа')).toBeInTheDocument();
    expect(screen.getByText('Настройки расположения')).toBeInTheDocument();
    expect(screen.getByText('Алгоритм')).toBeInTheDocument();
    expect(screen.getByText('Сводка графа')).toBeInTheDocument();
    expect(screen.getAllByText('Тестовая ошибка').length).toBeGreaterThan(0);
    expect(screen.getByText('Создать связь')).toBeInTheDocument();
  });

  it('кнопка перевода в toolbar отправляет requestTranslate', async () => {
    await setEditorMode('blueprint');

    await openToolbarMenu('toolbar-view-menu-trigger', 'toolbar-view-menu-popup');
    const translateButton = within(screen.getByTestId('toolbar-view-menu-popup')).getByRole('button', { name: /Перевести/i });

    fireEvent.click(translateButton);

    expect(postMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'requestTranslate',
        payload: expect.objectContaining({ direction: 'ru-en' })
      })
    );
  });

  it('validation errors автоматически раскрывают Problems в utility panel', async () => {
    await setEditorMode('blueprint');

    dispatchValidationResult();

    expect(await screen.findByTestId('utility-panel-body-problems')).toBeInTheDocument();
    expect(screen.getByTestId('utility-tab-problems')).toHaveTextContent('1');
  });

  it('на compact width inspector схлопнут по умолчанию и открывается drawer-ом', async () => {
    await setEditorMode('blueprint');
    setViewportWidth(1200);

    await waitFor(() => {
      expect(screen.queryByTestId('inspector-panel')).not.toBeInTheDocument();
    });

    const toggle = screen.getByTestId('toolbar-inspector-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(toggle);

    expect(await screen.findByTestId('inspector-panel')).toBeInTheDocument();
    expect(screen.getByTestId('inspector-panel').className).toContain('side-panel--drawer');
    expect(screen.getByText('Перевод графа')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('inspector-drawer-close'));

    await waitFor(() => {
      expect(screen.queryByTestId('inspector-panel')).not.toBeInTheDocument();
    });
  });

  it('Generate C++ раскрывает вкладку сгенерированного кода внизу', async () => {
    await setEditorMode('blueprint');
    vi.useFakeTimers();

    try {
      fireEvent.click(screen.getByRole('button', { name: /Сгенерировать C\+\+/i }));

      expect(postMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'requestGenerate',
        })
      );
      expect(screen.getByTestId('utility-panel-body-generated')).toBeInTheDocument();
      expect(screen.getByTestId('enhanced-code-preview-mock')).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(2100);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('переключает целевую платформу графа через toolbar', async () => {
    await setEditorMode('blueprint');
    postMessageMock.mockClear();
    vi.useFakeTimers();

    dispatchSetState({
      ...createDefaultGraphState(),
      id: 'graph-target-switch',
      name: 'Target switch graph',
      displayLanguage: 'ru',
      language: 'cpp',
    });

    try {
      const targetSelect = screen.getByTestId('toolbar-target-platform') as HTMLSelectElement;
      expect(targetSelect.value).toBe('cpp');

      fireEvent.change(targetSelect, { target: { value: 'ue' } });
      expect((screen.getByTestId('toolbar-target-platform') as HTMLSelectElement).value).toBe('ue');
      expect(screen.getByText(/Кодоген: UE/i)).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(220);
      });

      const graphChangedCalls = postMessageMock.mock.calls
        .map((entry) => entry[0])
        .filter((message) => message?.type === 'graphChanged');
      expect(graphChangedCalls.length).toBeGreaterThan(0);

      const payload = graphChangedCalls[graphChangedCalls.length - 1]?.payload as Record<string, unknown>;
      expect(payload.language).toBe('ue');
    } finally {
      vi.useRealTimers();
    }
  });

  it('отправляет graphId вместе с graphChanged', async () => {
    await setEditorMode('blueprint');
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

  it('graphChanged включает symbolLocalization после локального изменения', async () => {
    await setEditorMode('blueprint');
    postMessageMock.mockClear();
    vi.useFakeTimers();

    const localizationKey = 'file_dep::file_dep::print_status::*';
    dispatchSetState({
      ...createDefaultGraphState(),
      id: 'graph-localization',
      name: 'Graph with localization',
      displayLanguage: 'ru',
      language: 'cpp',
      symbolLocalization: {
        [localizationKey]: {
          integrationId: 'file_dep',
          symbolId: 'file_dep::print_status',
          localizedNameRu: 'Напечатать статус',
        },
      },
    });

    try {
      fireEvent.click(screen.getByRole('button', { name: 'Simulate Blueprint Change' }));

      await act(async () => {
        vi.advanceTimersByTime(220);
      });

      const graphChangedCalls = postMessageMock.mock.calls
        .map((entry) => entry[0])
        .filter((message) => message?.type === 'graphChanged');
      expect(graphChangedCalls.length).toBeGreaterThan(0);

      const payload = graphChangedCalls[graphChangedCalls.length - 1]?.payload as Record<string, unknown>;
      expect(payload.symbolLocalization).toEqual(
        expect.objectContaining({
          [localizationKey]: expect.objectContaining({
            localizedNameRu: 'Напечатать статус',
          }),
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('graphChanged сохраняет ueMacros после локального изменения', async () => {
    await setEditorMode('blueprint');
    postMessageMock.mockClear();
    vi.useFakeTimers();

    dispatchSetState({
      ...createDefaultGraphState(),
      id: 'graph-ue-macros',
      name: 'Graph with UE macros',
      displayLanguage: 'ru',
      language: 'ue',
      ueMacros: [
        {
          id: 'macro-function',
          name: 'UE Function',
          nameRu: 'Функция UE',
          macroType: 'UFUNCTION',
          specifiers: ['BlueprintCallable'],
          category: 'MultiCode',
          meta: {
            DisplayName: 'Показать статус',
          },
          targetId: 'func-1',
          targetKind: 'function',
          createdAt: '2025-01-15T12:00:00.000Z',
        },
      ],
    });

    try {
      fireEvent.click(screen.getByRole('button', { name: 'Simulate Blueprint Change' }));

      await act(async () => {
        vi.advanceTimersByTime(220);
      });

      const graphChangedCalls = postMessageMock.mock.calls
        .map((entry) => entry[0])
        .filter((message) => message?.type === 'graphChanged');
      expect(graphChangedCalls.length).toBeGreaterThan(0);

      const payload = graphChangedCalls[graphChangedCalls.length - 1]?.payload as Record<string, unknown>;
      expect(payload.ueMacros).toEqual([
        expect.objectContaining({
          id: 'macro-function',
          macroType: 'UFUNCTION',
          meta: expect.objectContaining({
            DisplayName: 'Показать статус',
          }),
        }),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('в режиме Dependency добавляет внешний symbol в graph state по клику', async () => {
    await setEditorMode('dependency');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Insert External Symbol' })).toBeInTheDocument();
    });

    postMessageMock.mockClear();
    vi.useFakeTimers();

    try {
      fireEvent.click(screen.getByRole('button', { name: 'Insert External Symbol' }));

      await act(async () => {
        vi.advanceTimersByTime(220);
      });

      const graphChangedCalls = postMessageMock.mock.calls
        .map((entry) => entry[0])
        .filter((message) => message?.type === 'graphChanged');
      expect(graphChangedCalls.length).toBeGreaterThan(0);

      const payload = graphChangedCalls[graphChangedCalls.length - 1]?.payload as Record<string, unknown>;
      const nodes = payload.nodes as Array<Record<string, unknown>>;
      expect(nodes.length).toBeGreaterThan(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('Dependencies открываются в нижней utility panel по вкладке', async () => {
    await setEditorMode('blueprint');

    openUtilityTab('dependencies');

    expect(await screen.findByTestId('utility-panel-body-dependencies')).toBeInTheDocument();
    expect(screen.getByTestId('dependency-view-panel-mock')).toBeInTheDocument();
  });

  it('кнопки выбора файлов отправляют file/pick с нужной целью', async () => {
    await setEditorMode('blueprint');
    postMessageMock.mockClear();

    await openWorkingFilesMenu();
    fireEvent.click(screen.getByTestId('toolbar-bind-file-pick'));
    await waitFor(() =>
      expect(postMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'file/pick',
          payload: expect.objectContaining({ purpose: 'bind' }),
        })
      )
    );
    dispatchExternalIpcResponse({
      type: 'file/pick',
      ok: true,
      payload: {
        filePath: null,
        fileName: null,
      },
    });

    await openWorkingFilesMenu();
    fireEvent.click(screen.getByTestId('toolbar-dependency-file-pick'));
    await waitFor(() =>
      expect(postMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'file/pick',
          payload: expect.objectContaining({ purpose: 'dependency' }),
        })
      )
    );
    dispatchExternalIpcResponse({
      type: 'file/pick',
      ok: true,
      payload: {
        filePath: null,
        fileName: null,
      },
    });
  });

  it('меню рабочего файла позволяет открыть файл и блокирует удаление активного', async () => {
    await setEditorMode('blueprint');
    postMessageMock.mockClear();

    dispatchExternalIpcResponse({
      type: 'editableFilesChanged',
      payload: {
        files: [
          {
            fileName: 'alpha.cpp',
            filePath: 'f:/workspace/alpha.cpp',
          },
        ],
      },
    });

    await openWorkingFilesMenu();
    expect(screen.getByTestId('toolbar-files-menu-popup')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'alpha.cpp' }));
    expect(postMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'bindFile',
        payload: { filePath: 'f:/workspace/alpha.cpp' },
      })
    );

    await openWorkingFilesMenu();
    fireEvent.click(screen.getByLabelText('Убрать из списка alpha.cpp'));

    await openWorkingFilesMenu();
    expect(screen.getByRole('button', { name: 'alpha.cpp' })).toBeInTheDocument();
  });

  it('поиск в меню рабочих файлов фильтрует список по имени', async () => {
    await setEditorMode('blueprint');
    postMessageMock.mockClear();

    dispatchExternalIpcResponse({
      type: 'editableFilesChanged',
      payload: {
        files: [
          {
            fileName: 'alpha.cpp',
            filePath: 'f:/workspace/alpha.cpp',
          },
          {
            fileName: 'beta.cpp',
            filePath: 'f:/workspace/beta.cpp',
          },
        ],
      },
    });

    await openWorkingFilesMenu();
    expect(screen.getByTestId('toolbar-files-menu-popup')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('toolbar-working-file-search'), { target: { value: 'beta' } });

    expect(screen.getByRole('button', { name: 'beta.cpp' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'alpha.cpp' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'beta.cpp' }));
    expect(postMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'bindFile',
        payload: { filePath: 'f:/workspace/beta.cpp' },
      })
    );
  });

  it('показывает статус class storage в header и сводке графа', async () => {
    await setEditorMode('blueprint');

    dispatchExternalIpcResponse({
      type: 'classStorageStatusChanged',
      payload: {
        mode: 'sidecar',
        isBoundSource: true,
        graphFilePath: 'f:/workspace/.multicode/graph-1.multicode',
        classesDirPath: 'f:/workspace/.multicode/classes',
        bindingsTotal: 2,
        classesLoaded: 2,
        missing: 1,
        failed: 0,
        fallbackEmbedded: 1,
        updatedAt: new Date().toISOString(),
        classItems: [
          { classId: 'class-a', filePath: 'f:/workspace/.multicode/classes/class-a.multicode', status: 'ok' },
          { classId: 'class-b', filePath: 'f:/workspace/.multicode/classes/class-b.multicode', status: 'missing' },
        ],
      },
    });

    expect(await screen.findByTestId('class-storage-badge')).toHaveTextContent('Хранение классов: внешние файлы');
    expect(screen.getAllByText(/(Class Storage|Хранение классов)/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/нет 1/i)).toBeInTheDocument();
  });
});
