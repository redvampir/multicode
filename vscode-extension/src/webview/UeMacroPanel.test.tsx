import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import type { BlueprintGraphState, UeMacroBinding } from '../shared/blueprintTypes';
import { UeMacroPanel } from './UeMacroPanel';

const createGraphState = (ueMacros: UeMacroBinding[] = []): BlueprintGraphState => ({
  id: 'graph-ue',
  name: 'UE Graph',
  language: 'ue',
  displayLanguage: 'ru',
  nodes: [],
  edges: [],
  ueMacros,
  updatedAt: new Date().toISOString(),
});

describe('UeMacroPanel', () => {
  it('требует отдельное отображаемое имя и сохраняет его как meta.DisplayName', () => {
    const onUeMacrosChange = vi.fn();

    render(
      <UeMacroPanel
        graphState={createGraphState()}
        onUeMacrosChange={onUeMacrosChange}
        displayLanguage="ru"
        collapsed={false}
      />,
    );

    fireEvent.click(screen.getByTitle('+ Макрос UFUNCTION'));

    const displayNameInput = screen.getByRole('textbox', { name: 'Отображаемое имя' });
    const createButton = screen.getByRole('button', { name: 'Создать' });

    fireEvent.change(displayNameInput, { target: { value: '' } });

    expect(createButton).toBeDisabled();
    expect(screen.getByText(/Заполните отображаемое имя/i)).toBeInTheDocument();

    fireEvent.change(displayNameInput, { target: { value: 'Тестовая функция' } });
    fireEvent.click(createButton);

    expect(onUeMacrosChange).toHaveBeenCalledTimes(1);
    const savedMacros = onUeMacrosChange.mock.calls[0][0] as UeMacroBinding[];
    expect(savedMacros).toHaveLength(1);
    expect(savedMacros[0].meta?.DisplayName).toBe('Тестовая функция');
  });

  it('выносит DisplayName из дополнительных meta-аргументов в отдельное русское поле', () => {
    const onUeMacrosChange = vi.fn();
    const graphState = createGraphState([
      {
        id: 'macro-function',
        name: 'UE Function',
        nameRu: 'Тестовая функция',
        macroType: 'UFUNCTION',
        specifiers: ['BlueprintCallable'],
        category: 'MultiCode',
        meta: {
          DisplayName: 'Показать статус',
          Tooltip: 'Печатает строку',
        },
        targetId: 'func-1',
        targetKind: 'function',
        createdAt: new Date().toISOString(),
      },
    ]);

    render(
      <UeMacroPanel
        graphState={graphState}
        onUeMacrosChange={onUeMacrosChange}
        displayLanguage="ru"
        collapsed={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Изменить' }));

    expect(screen.getByText('Отображаемое имя')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Отображаемое имя' })).toHaveValue('Показать статус');
    expect(screen.getByDisplayValue('Tooltip')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('DisplayName')).toBeNull();
  });
});
