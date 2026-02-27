import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FunctionEditor } from '../FunctionEditor';
import { createUserFunction } from '../../shared/blueprintTypes';

describe('FunctionEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds input parameter with separate code and ru names', () => {
    const func = createUserFunction('testFunction', 'Тестовая функция');
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <FunctionEditor
        function={func}
        onSave={onSave}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByText('➕ Добавить входной параметр'));

    expect(screen.getByDisplayValue('param_1')).toBeTruthy();
    expect(screen.getByDisplayValue('Параметр 1')).toBeTruthy();
  });

  it('shows explicit EN and RU labels for editable name fields', () => {
    const func = createUserFunction('testFunction', 'Тестовая функция');

    render(
      <FunctionEditor
        function={func}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getAllByText('EN (Code)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('RU (Display)').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('➕ Добавить входной параметр'));

    expect(screen.getAllByText('EN (Code)').length).toBeGreaterThan(1);
    expect(screen.getAllByText('RU (Display)').length).toBeGreaterThan(1);
  });

  it('syncs graph display name with code name if ru name was not set manually', () => {
    const func = createUserFunction('testFunction', 'Тестовая функция');
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <FunctionEditor
        function={func}
        onSave={onSave}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByText('➕ Добавить входной параметр'));

    const codeNameInput = screen.getByDisplayValue('param_1');
    fireEvent.change(codeNameInput, { target: { value: 'Summa_1' } });
    fireEvent.click(screen.getByText('💾 Сохранить'));

    expect(onSave).toHaveBeenCalledTimes(1);
    const savedFunction = onSave.mock.calls[0][0];
    expect(savedFunction.parameters[0].name).toBe('Summa_1');
    expect(savedFunction.parameters[0].nameRu).toBe('Summa_1');
  });

  it('preserves explicit ru graph name when user sets it manually', () => {
    const func = createUserFunction('testFunction', 'Тестовая функция');
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <FunctionEditor
        function={func}
        onSave={onSave}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByText('➕ Добавить входной параметр'));

    const codeNameInput = screen.getByDisplayValue('param_1');
    const ruNameInput = screen.getByDisplayValue('Параметр 1');

    fireEvent.change(codeNameInput, { target: { value: 'sum_1' } });
    fireEvent.change(ruNameInput, { target: { value: 'Сумма 1' } });
    fireEvent.click(screen.getByText('💾 Сохранить'));

    expect(onSave).toHaveBeenCalledTimes(1);
    const savedFunction = onSave.mock.calls[0][0];
    expect(savedFunction.parameters[0].name).toBe('sum_1');
    expect(savedFunction.parameters[0].nameRu).toBe('Сумма 1');
  });
});
