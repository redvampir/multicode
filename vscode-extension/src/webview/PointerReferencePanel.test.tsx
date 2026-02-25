import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PointerReferencePanel } from './PointerReferencePanel';
import type { BlueprintGraphState } from '../shared/blueprintTypes';

const createGraphState = (): BlueprintGraphState => ({
  id: 'graph-pointer-test',
  name: 'Pointer Test',
  language: 'cpp',
  displayLanguage: 'ru',
  nodes: [],
  edges: [],
  variables: [],
  updatedAt: new Date().toISOString(),
});

describe('PointerReferencePanel', () => {
  it('создаёт pointer переменную с режимом shared по умолчанию', async () => {
    const onVariablesChange = vi.fn();
    const graph = createGraphState();

    render(
      <PointerReferencePanel
        graphState={graph}
        onVariablesChange={onVariablesChange}
        displayLanguage="ru"
        collapsed={false}
        onToggleCollapsed={() => undefined}
      />
    );

    fireEvent.click(screen.getByTitle('Создать указатель/ссылку'));
    fireEvent.change(screen.getByLabelText('Имя (латиница)'), {
      target: { value: 'my_ptr' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(onVariablesChange).toHaveBeenCalledTimes(1);
    });

    const payload = onVariablesChange.mock.calls[0][0] as BlueprintGraphState['variables'];
    expect(Array.isArray(payload)).toBe(true);
    expect(payload?.[0]).toMatchObject({
      dataType: 'pointer',
      name: 'my_ptr',
      pointerMeta: {
        mode: 'unique',
      },
    });
  });

  it('позволяет привязать unique указатель к обычной переменной и синхронизирует тип', async () => {
    const onVariablesChange = vi.fn();
    const graph: BlueprintGraphState = {
      ...createGraphState(),
      variables: [
        {
          id: 'var-int',
          name: 'value',
          nameRu: 'значение',
          dataType: 'int32',
          defaultValue: 7,
          category: 'default',
        },
      ],
    };

    render(
      <PointerReferencePanel
        graphState={graph}
        onVariablesChange={onVariablesChange}
        displayLanguage="ru"
        collapsed={false}
        onToggleCollapsed={() => undefined}
      />
    );

    fireEvent.click(screen.getByTitle('Создать указатель/ссылку'));
    fireEvent.change(screen.getByLabelText('Имя (латиница)'), {
      target: { value: 'ptr_value' },
    });
    fireEvent.change(screen.getByLabelText('Инициализировать из переменной'), {
      target: { value: 'var-int' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(onVariablesChange).toHaveBeenCalledTimes(1);
    });

    const payload = onVariablesChange.mock.calls[0][0] as BlueprintGraphState['variables'];
    const pointer = Array.isArray(payload)
      ? payload.find((item) => item.dataType === 'pointer')
      : undefined;
    expect(pointer).toMatchObject({
      name: 'ptr_value',
      pointerMeta: {
        mode: 'unique',
        targetVariableId: 'var-int',
        pointeeDataType: 'int32',
      },
    });
  });

  it('не сохраняет reference без target', async () => {
    const onVariablesChange = vi.fn();
    const graph = createGraphState();

    render(
      <PointerReferencePanel
        graphState={graph}
        onVariablesChange={onVariablesChange}
        displayLanguage="ru"
        collapsed={false}
        onToggleCollapsed={() => undefined}
      />
    );

    fireEvent.click(screen.getByTitle('Создать указатель/ссылку'));
    fireEvent.change(screen.getByLabelText('Имя (латиница)'), {
      target: { value: 'ref_value' },
    });
    fireEvent.change(screen.getByLabelText('Режим'), {
      target: { value: 'reference' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(onVariablesChange).not.toHaveBeenCalled();
      expect(
        screen.getByText('Для выбранного режима требуется привязка к переменной.')
      ).toBeTruthy();
    });
  });

  it('для weak показывает только shared pointer в списке target', async () => {
    const onVariablesChange = vi.fn();
    const graph: BlueprintGraphState = {
      ...createGraphState(),
      variables: [
        {
          id: 'var-int',
          name: 'value',
          nameRu: 'значение',
          dataType: 'int32',
          defaultValue: 1,
          category: 'default',
        },
        {
          id: 'ptr-shared',
          name: 'ptrShared',
          nameRu: 'ptrShared',
          dataType: 'pointer',
          defaultValue: null,
          category: 'default',
          pointerMeta: {
            mode: 'shared',
            pointeeDataType: 'double',
          },
        },
        {
          id: 'ptr-unique',
          name: 'ptrUnique',
          nameRu: 'ptrUnique',
          dataType: 'pointer',
          defaultValue: null,
          category: 'default',
          pointerMeta: {
            mode: 'unique',
            pointeeDataType: 'double',
          },
        },
      ],
    };

    render(
      <PointerReferencePanel
        graphState={graph}
        onVariablesChange={onVariablesChange}
        displayLanguage="ru"
        collapsed={false}
        onToggleCollapsed={() => undefined}
      />
    );

    fireEvent.click(screen.getByTitle('Создать указатель/ссылку'));
    fireEvent.change(screen.getByLabelText('Режим'), {
      target: { value: 'weak' },
    });

    const options = Array.from(screen.getByLabelText('Цель (умный указатель)').querySelectorAll('option')).map(
      (option) => option.textContent ?? ''
    );

    expect(options.some((value) => value.includes('ptrShared'))).toBe(true);
    expect(options.some((value) => value.includes('ptrUnique'))).toBe(true);
    expect(options.some((value) => value.includes('значение'))).toBe(false);
  });

  it('автоматически апгрейдит цель unique -> shared при сохранении weak указателя', async () => {
    const onVariablesChange = vi.fn();
    const graph: BlueprintGraphState = {
      ...createGraphState(),
      variables: [
        {
          id: 'ptr-unique',
          name: 'ptrUnique',
          nameRu: 'ptrUnique',
          dataType: 'pointer',
          defaultValue: null,
          category: 'default',
          pointerMeta: {
            mode: 'unique',
            pointeeDataType: 'double',
          },
        },
      ],
    };

    render(
      <PointerReferencePanel
        graphState={graph}
        onVariablesChange={onVariablesChange}
        displayLanguage="ru"
        collapsed={false}
        onToggleCollapsed={() => undefined}
      />
    );

    fireEvent.click(screen.getByTitle('Создать указатель/ссылку'));
    fireEvent.change(screen.getByLabelText('Имя (латиница)'), {
      target: { value: 'weak_ptr' },
    });
    fireEvent.change(screen.getByLabelText('Режим'), {
      target: { value: 'weak' },
    });
    fireEvent.change(screen.getByLabelText('Цель (умный указатель)'), {
      target: { value: 'ptr-unique' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(onVariablesChange).toHaveBeenCalledTimes(1);
    });

    const payload = onVariablesChange.mock.calls[0][0] as BlueprintGraphState['variables'];
    const upgradedTarget = Array.isArray(payload)
      ? payload.find((item) => item.id === 'ptr-unique')
      : undefined;
    expect(upgradedTarget).toMatchObject({
      dataType: 'pointer',
      pointerMeta: {
        mode: 'shared',
      },
    });
  });
});
