import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { VariableListPanel } from './VariableListPanel';
import type { BlueprintGraphState, BlueprintVariable } from '../shared/blueprintTypes';

const createBaseGraph = (variables: unknown[]): BlueprintGraphState => ({
  id: 'graph-test',
  name: 'Test',
  language: 'cpp',
  displayLanguage: 'ru',
  nodes: [],
  edges: [],
  variables: variables as BlueprintVariable[],
  updatedAt: new Date().toISOString(),
});

describe('VariableListPanel', () => {
  it('does not crash when legacy variables contain invalid entries', () => {
    const graphState = createBaseGraph([
      {
        id: 'var-valid',
        name: 'count',
        nameRu: 'Счётчик',
        dataType: 'int32',
        category: 'default',
        defaultValue: 0,
      },
      null,
      {
        id: 'var-broken',
        name: '',
        nameRu: '',
        dataType: 'broken-type',
        category: 'legacy-category',
      },
    ]);

    render(
      <VariableListPanel
        graphState={graphState}
        onVariablesChange={vi.fn()}
        onCreateGetVariable={vi.fn()}
        onCreateSetVariable={vi.fn()}
        displayLanguage="ru"
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Переменные' })).toBeInTheDocument();
    expect(screen.getAllByText(/Текущее:/).length).toBeGreaterThan(0);
  });

  it('normalizes malformed variable payload and reports sanitized list', async () => {
    const onVariablesChange = vi.fn();
    const graphState = createBaseGraph([
      {
        id: '',
        name: '',
        nameRu: '',
        dataType: 'broken-type',
        category: 'legacy-category',
        color: '',
      },
      undefined,
    ]);

    render(
      <VariableListPanel
        graphState={graphState}
        onVariablesChange={onVariablesChange}
        onCreateGetVariable={vi.fn()}
        onCreateSetVariable={vi.fn()}
        displayLanguage="ru"
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />,
    );

    await waitFor(() => expect(onVariablesChange).toHaveBeenCalled());

    const sanitizedVariables = onVariablesChange.mock.calls[0][0] as BlueprintVariable[];
    expect(sanitizedVariables).toHaveLength(1);
    expect(sanitizedVariables[0].id).toBe('legacy_var_1');
    expect(sanitizedVariables[0].name).toBe('var_1');
    expect(sanitizedVariables[0].nameRu).toBe('var_1');
    expect(sanitizedVariables[0].dataType).toBe('any');
    expect(sanitizedVariables[0].category).toBe('default');
    expect(typeof sanitizedVariables[0].color).toBe('string');
  });

  it('renders vector element type in variable badge', () => {
    const graphState = createBaseGraph([
      {
        id: 'var-vec',
        name: 'points',
        nameRu: 'Точки',
        dataType: 'vector',
        vectorElementType: 'int32',
        category: 'default',
        defaultValue: [1, 2, 3],
      },
    ]);

    render(
      <VariableListPanel
        graphState={graphState}
        onVariablesChange={vi.fn()}
        onCreateGetVariable={vi.fn()}
        onCreateSetVariable={vi.fn()}
        displayLanguage="ru"
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />,
    );

    expect(screen.getByText('Вектор<Целое (32)>')).toBeInTheDocument();
  });

  it('не отображает pointer-переменные в общей секции переменных', () => {
    const graphState = createBaseGraph([
      {
        id: 'var-value',
        name: 'value',
        nameRu: 'значение',
        dataType: 'int32',
        category: 'default',
        defaultValue: 10,
      },
      {
        id: 'var-pointer',
        name: 'ptr',
        nameRu: 'ptr',
        dataType: 'pointer',
        category: 'default',
        defaultValue: null,
      },
    ]);

    render(
      <VariableListPanel
        graphState={graphState}
        onVariablesChange={vi.fn()}
        onCreateGetVariable={vi.fn()}
        onCreateSetVariable={vi.fn()}
        displayLanguage="ru"
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />,
    );

    expect(screen.getByText('значение')).toBeInTheDocument();
    expect(screen.queryByText('ptr')).not.toBeInTheDocument();
  });

  it('preserves pointerMeta when variable list normalization runs', async () => {
    const onVariablesChange = vi.fn();
    const graphState = createBaseGraph([
      {
        id: 'var-value',
        name: '',
        nameRu: '',
        dataType: 'int32',
        category: 'default',
        defaultValue: 10,
      },
      {
        id: 'var-pointer',
        name: 'ptr',
        nameRu: 'ptr',
        dataType: 'pointer',
        category: 'default',
        defaultValue: 0,
        pointerMeta: {
          mode: 'shared',
          pointeeDataType: 'int32',
          targetVariableId: 'var-value',
        },
      },
    ]);

    render(
      <VariableListPanel
        graphState={graphState}
        onVariablesChange={onVariablesChange}
        onCreateGetVariable={vi.fn()}
        onCreateSetVariable={vi.fn()}
        displayLanguage="ru"
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />,
    );

    await waitFor(() => expect(onVariablesChange).toHaveBeenCalled());

    const normalized = onVariablesChange.mock.calls[onVariablesChange.mock.calls.length - 1][0] as BlueprintVariable[];
    const pointer = normalized.find((variable) => variable.id === 'var-pointer');
    expect(pointer?.pointerMeta).toEqual({
      mode: 'shared',
      pointeeDataType: 'int32',
      pointeeVectorElementType: undefined,
      targetVariableId: 'var-value',
    });
  });

  it('does not trigger migration loop when defaultValue arrays are value-equal', async () => {
    const onVariablesChange = vi.fn();
    const baseVariable = {
      id: 'var-vector',
      name: 'vectorVar',
      nameRu: 'vectorVar',
      codeName: 'vectorVar',
      dataType: 'vector',
      vectorElementType: 'double',
      category: 'default',
      defaultValue: [1, 2, 3],
      description: '',
      isArray: false,
      arrayRank: 0,
      isPrivate: false,
      color: '#FFC107',
    };

    const firstGraphState = createBaseGraph([baseVariable]);
    const { rerender } = render(
      <VariableListPanel
        graphState={firstGraphState}
        onVariablesChange={onVariablesChange}
        onCreateGetVariable={vi.fn()}
        onCreateSetVariable={vi.fn()}
        displayLanguage="ru"
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Переменные' })).toBeInTheDocument());
    onVariablesChange.mockClear();

    const secondGraphState = createBaseGraph([
      {
        ...baseVariable,
        defaultValue: [1, 2, 3],
      },
    ]);
    rerender(
      <VariableListPanel
        graphState={secondGraphState}
        onVariablesChange={onVariablesChange}
        onCreateGetVariable={vi.fn()}
        onCreateSetVariable={vi.fn()}
        displayLanguage="ru"
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Переменные' })).toBeInTheDocument());
    expect(onVariablesChange).not.toHaveBeenCalled();
  });

  it('creates vector variable with JSON default value of arbitrary length', async () => {
    const onVariablesChange = vi.fn();
    const graphState = createBaseGraph([]);

    render(
      <VariableListPanel
        graphState={graphState}
        onVariablesChange={onVariablesChange}
        onCreateGetVariable={vi.fn()}
        onCreateSetVariable={vi.fn()}
        displayLanguage="ru"
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /\+ Переменная/i }));

    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'vec_numbers' } });

    const selectsBeforeVector = screen.getAllByRole('combobox');
    fireEvent.change(selectsBeforeVector[0], { target: { value: 'vector' } });

    fireEvent.change(screen.getByPlaceholderText('[1.25, 2.5, 3.75]'), {
      target: { value: '[1, 2, 3, 4, 5]' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(onVariablesChange).toHaveBeenCalled());

    const saved = onVariablesChange.mock.calls[onVariablesChange.mock.calls.length - 1][0] as BlueprintVariable[];
    expect(saved).toHaveLength(1);
    expect(saved[0].dataType).toBe('vector');
    expect(saved[0].defaultValue).toEqual([1, 2, 3, 4, 5]);
  });

  it('creates vector<string> variable from JSON input', async () => {
    const onVariablesChange = vi.fn();
    const graphState = createBaseGraph([]);

    render(
      <VariableListPanel
        graphState={graphState}
        onVariablesChange={onVariablesChange}
        onCreateGetVariable={vi.fn()}
        onCreateSetVariable={vi.fn()}
        displayLanguage="ru"
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /\+ Переменная/i }));

    const textboxes = screen.getAllByRole('textbox');
    fireEvent.change(textboxes[0], { target: { value: 'vec_strings' } });

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'vector' } });

    const selectsAfterVector = screen.getAllByRole('combobox');
    fireEvent.change(selectsAfterVector[1], { target: { value: 'string' } });
    fireEvent.change(screen.getByPlaceholderText('["red", "green", "blue"]'), {
      target: { value: '["red","green","blue"]' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(onVariablesChange).toHaveBeenCalled());

    const saved = onVariablesChange.mock.calls[onVariablesChange.mock.calls.length - 1][0] as BlueprintVariable[];
    expect(saved[0].vectorElementType).toBe('string');
    expect(saved[0].defaultValue).toEqual(['red', 'green', 'blue']);
  });

  it('normalizes legacy CSV vector defaults to arrays', async () => {
    const onVariablesChange = vi.fn();
    const graphState = createBaseGraph([
      {
        id: 'var-legacy-vector',
        name: 'legacy_vec',
        nameRu: 'legacy_vec',
        dataType: 'vector',
        vectorElementType: 'int32',
        category: 'default',
        defaultValue: '1,2,3,4',
      },
    ]);

    render(
      <VariableListPanel
        graphState={graphState}
        onVariablesChange={onVariablesChange}
        onCreateGetVariable={vi.fn()}
        onCreateSetVariable={vi.fn()}
        displayLanguage="ru"
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />,
    );

    await waitFor(() => expect(onVariablesChange).toHaveBeenCalled());

    const migrated = onVariablesChange.mock.calls[onVariablesChange.mock.calls.length - 1][0] as BlueprintVariable[];
    expect(migrated[0].defaultValue).toEqual([1, 2, 3, 4]);
  });

  it('normalizes malformed multidimensional array defaults without crashing', async () => {
    const onVariablesChange = vi.fn();
    const graphState = createBaseGraph([
      {
        id: 'var-bad-array',
        name: 'bad_array',
        nameRu: 'bad_array',
        dataType: 'int32',
        isArray: true,
        arrayRank: 2,
        category: 'default',
        defaultValue: { bad: true },
      },
    ]);

    render(
      <VariableListPanel
        graphState={graphState}
        onVariablesChange={onVariablesChange}
        onCreateGetVariable={vi.fn()}
        onCreateSetVariable={vi.fn()}
        displayLanguage="ru"
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />,
    );

    await waitFor(() => expect(onVariablesChange).toHaveBeenCalled());

    const normalized = onVariablesChange.mock.calls[onVariablesChange.mock.calls.length - 1][0] as BlueprintVariable[];
    expect(normalized[0].arrayRank).toBe(2);
    expect(normalized[0].defaultValue).toEqual([]);
  });

  it('does not save vector when JSON input is invalid', async () => {
    const onVariablesChange = vi.fn();

    render(
      <VariableListPanel
        graphState={createBaseGraph([])}
        onVariablesChange={onVariablesChange}
        onCreateGetVariable={vi.fn()}
        onCreateSetVariable={vi.fn()}
        displayLanguage="ru"
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /\+ Переменная/i }));

    const textboxes = screen.getAllByRole('textbox');
    fireEvent.change(textboxes[0], { target: { value: 'invalid_vec' } });

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'vector' } });
    fireEvent.change(screen.getByPlaceholderText('[1.25, 2.5, 3.75]'), {
      target: { value: '[1, 2,' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(screen.getByText(/Некорректный JSON-массив/i)).toBeInTheDocument();
    expect(onVariablesChange).not.toHaveBeenCalled();
  });

  it('creates scalar array variable when array checkbox is enabled', async () => {
    const onVariablesChange = vi.fn();

    render(
      <VariableListPanel
        graphState={createBaseGraph([])}
        onVariablesChange={onVariablesChange}
        onCreateGetVariable={vi.fn()}
        onCreateSetVariable={vi.fn()}
        displayLanguage="ru"
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /\+ Переменная/i }));

    const textboxes = screen.getAllByRole('textbox');
    fireEvent.change(textboxes[0], { target: { value: 'arr_numbers' } });

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'int32' } });

    fireEvent.click(screen.getByLabelText('Массив'));
    fireEvent.change(screen.getByPlaceholderText('[1, 2, 3, 4]'), {
      target: { value: '[10, 20, 30, 40]' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(onVariablesChange).toHaveBeenCalled());

    const saved = onVariablesChange.mock.calls[onVariablesChange.mock.calls.length - 1][0] as BlueprintVariable[];
    expect(saved).toHaveLength(1);
    expect(saved[0].dataType).toBe('int32');
    expect(saved[0].isArray).toBe(true);
    expect(saved[0].defaultValue).toEqual([10, 20, 30, 40]);
  });

  it('creates vector array variable as nested JSON arrays', async () => {
    const onVariablesChange = vi.fn();

    render(
      <VariableListPanel
        graphState={createBaseGraph([])}
        onVariablesChange={onVariablesChange}
        onCreateGetVariable={vi.fn()}
        onCreateSetVariable={vi.fn()}
        displayLanguage="ru"
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /\+ Переменная/i }));

    const textboxes = screen.getAllByRole('textbox');
    fireEvent.change(textboxes[0], { target: { value: 'arr_vectors' } });

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'vector' } });

    const vectorSelects = screen.getAllByRole('combobox');
    fireEvent.change(vectorSelects[1], { target: { value: 'int32' } });

    fireEvent.click(screen.getByLabelText('Массив'));
    fireEvent.change(screen.getByPlaceholderText('[[1, 2], [3, 4]]'), {
      target: { value: '[[1,2],[3,4]]' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(onVariablesChange).toHaveBeenCalled());

    const saved = onVariablesChange.mock.calls[onVariablesChange.mock.calls.length - 1][0] as BlueprintVariable[];
    expect(saved[0].dataType).toBe('vector');
    expect(saved[0].isArray).toBe(true);
    expect(saved[0].defaultValue).toEqual([[1, 2], [3, 4]]);
  });
});
