import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ClassPanel } from '../ClassPanel';
import type { BlueprintGraphState } from '../../shared/blueprintTypes';
import type { ClassStorageStatus } from '../../shared/messages';

const createGraphState = (withClass = false): BlueprintGraphState => ({
  id: 'graph-id',
  name: 'Graph',
  language: 'cpp',
  displayLanguage: 'ru',
  nodes: [],
  edges: [],
  functions: [],
  variables: [],
  classes: withClass
    ? [
        {
          id: 'class-1',
          name: 'Player',
          nameRu: 'Игрок',
          members: [],
          methods: [],
        },
      ]
    : [],
  updatedAt: new Date().toISOString(),
});

const createClassStorageStatus = (): ClassStorageStatus => ({
  mode: 'sidecar',
  isBoundSource: true,
  graphFilePath: 'f:/workspace/.multicode/graph-1.multicode',
  classesDirPath: 'f:/workspace/.multicode/classes',
  bindingsTotal: 1,
  classesLoaded: 1,
  missing: 0,
  failed: 0,
  fallbackEmbedded: 0,
  updatedAt: new Date().toISOString(),
  classItems: [
    {
      classId: 'class-1',
      className: 'Игрок',
      filePath: 'f:/workspace/.multicode/classes/class-1.multicode',
      status: 'ok',
    },
  ],
});

describe('ClassPanel', () => {
  it('renders panel shell', () => {
    render(
      <ClassPanel
        graphState={createGraphState()}
        onClassesChange={vi.fn()}
        displayLanguage="ru"
      />,
    );

    expect(screen.getByTestId('class-panel')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Классы' })).toBeInTheDocument();
  });

  it('creates new class with RU overlay fields', () => {
    const onClassesChange = vi.fn();

    render(
      <ClassPanel
        graphState={createGraphState()}
        onClassesChange={onClassesChange}
        displayLanguage="ru"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /\+ Класс/i }));

    expect(onClassesChange).toHaveBeenCalledTimes(1);
    const classes = onClassesChange.mock.calls[0][0] as Array<{ name: string; nameRu?: string }>;
    expect(classes).toHaveLength(1);
    expect(classes[0].name).toBe('NewClass1');
    expect(classes[0].nameRu).toBe('Новый класс 1');
  });

  it('calls class node insertion callback from mini panel', () => {
    const onInsertClassNode = vi.fn();

    render(
      <ClassPanel
        graphState={createGraphState(true)}
        onClassesChange={vi.fn()}
        displayLanguage="ru"
        onInsertClassNode={onInsertClassNode}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '+Ctor' }));
    expect(onInsertClassNode).toHaveBeenCalledWith({ kind: 'constructor', classId: 'class-1' });
  });

  it('opens modal ClassEditor', () => {
    render(
      <ClassPanel
        graphState={createGraphState(true)}
        onClassesChange={vi.fn()}
        displayLanguage="ru"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Редактор' }));
    expect(screen.getByText('Редактор класса')).toBeInTheDocument();
  });

  it('updates class RU name separately from code name', () => {
    const onClassesChange = vi.fn();
    render(
      <ClassPanel
        graphState={createGraphState(true)}
        onClassesChange={onClassesChange}
        displayLanguage="ru"
      />,
    );

    const ruInputs = screen.getAllByPlaceholderText('RU имя');
    fireEvent.change(ruInputs[0], { target: { value: 'Персонаж' } });

    expect(onClassesChange).toHaveBeenCalled();
    const classes = onClassesChange.mock.calls.at(-1)?.[0] as Array<{ name: string; nameRu?: string }>;
    expect(classes[0].name).toBe('Player');
    expect(classes[0].nameRu).toBe('Персонаж');
  });

  it('shows class storage chip and supports open actions', () => {
    const onOpenClassSidecar = vi.fn();
    const onOpenGraphMulticode = vi.fn();

    render(
      <ClassPanel
        graphState={createGraphState(true)}
        onClassesChange={vi.fn()}
        displayLanguage="ru"
        classStorageStatus={createClassStorageStatus()}
        onOpenClassSidecar={onOpenClassSidecar}
        onOpenGraphMulticode={onOpenGraphMulticode}
      />,
    );

    expect(screen.getByTestId('class-storage-chip-class-1')).toHaveTextContent('ok');

    fireEvent.click(screen.getByRole('button', { name: 'Sidecar' }));
    expect(onOpenClassSidecar).toHaveBeenCalledWith('class-1');

    const graphButtons = screen.getAllByRole('button', { name: 'Graph' });
    fireEvent.click(graphButtons[0]);
    expect(onOpenGraphMulticode).toHaveBeenCalledTimes(1);
  });

  it('supports sidecar quick actions and class filter', () => {
    const onReloadClassStorage = vi.fn();
    const onRepairClassStorage = vi.fn();
    const classStorageStatus: ClassStorageStatus = {
      ...createClassStorageStatus(),
      classItems: [
        {
          classId: 'class-1',
          className: 'Игрок',
          filePath: 'f:/workspace/.multicode/classes/class-1.multicode',
          status: 'ok',
        },
        {
          classId: 'class-2',
          className: 'НПС',
          filePath: 'f:/workspace/.multicode/classes/class-2.multicode',
          status: 'missing',
          reason: 'Файл sidecar не найден',
        },
      ],
      missing: 1,
      bindingsTotal: 2,
      classesLoaded: 2,
    };

    const graphState = {
      ...createGraphState(true),
      classes: [
        ...(createGraphState(true).classes ?? []),
        {
          id: 'class-2',
          name: 'Npc',
          nameRu: 'НПС',
          members: [],
          methods: [],
        },
      ],
    } satisfies BlueprintGraphState;

    render(
      <ClassPanel
        graphState={graphState}
        onClassesChange={vi.fn()}
        displayLanguage="ru"
        classStorageStatus={classStorageStatus}
        onReloadClassStorage={onReloadClassStorage}
        onRepairClassStorage={onRepairClassStorage}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Проблемные' }));
    expect(screen.queryByText('Игрок')).not.toBeInTheDocument();
    expect(screen.getByText('НПС')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Перечитать' })[0]);
    expect(onReloadClassStorage).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Починить привязки' }));
    expect(onRepairClassStorage).toHaveBeenCalledTimes(1);
  });

  it('shows advanced class actions only when feature flag is enabled', () => {
    const onInsertClassNode = vi.fn();
    const graphState = {
      ...createGraphState(true),
      classes: [
        {
          id: 'class-1',
          name: 'Player',
          nameRu: 'Игрок',
          baseClasses: ['ActorBase'],
          members: [
            { id: 'member-1', name: 'score', nameRu: 'Счёт', dataType: 'int32', access: 'public' as const },
          ],
          methods: [
            { id: 'method-1', name: 'Tick', nameRu: 'Тик', returnType: 'bool', params: [], access: 'public' as const },
          ],
        },
      ],
    } satisfies BlueprintGraphState;

    const { rerender } = render(
      <ClassPanel
        graphState={graphState}
        onClassesChange={vi.fn()}
        displayLanguage="ru"
        onInsertClassNode={onInsertClassNode}
      />,
    );

    expect(screen.queryByRole('button', { name: '+Delete' })).not.toBeInTheDocument();

    rerender(
      <ClassPanel
        graphState={graphState}
        onClassesChange={vi.fn()}
        displayLanguage="ru"
        onInsertClassNode={onInsertClassNode}
        classNodesAdvancedEnabled
      />,
    );

    expect(screen.getByText('ADVANCED')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+Delete' }));
    expect(onInsertClassNode).toHaveBeenCalledWith({ kind: 'delete-object', classId: 'class-1' });
    fireEvent.click(screen.getByRole('button', { name: '+Addr' }));
    expect(onInsertClassNode).toHaveBeenCalledWith({ kind: 'address-of-member', classId: 'class-1', memberId: 'member-1' });
  });
});
