import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SourceIntegration, SymbolDescriptor } from '../shared/externalSymbols';
import type { DependencyMapState } from './store/slices/indexerTypes';
import { DependencyView } from './DependencyView';

const integrations: SourceIntegration[] = [
  {
    integrationId: 'depcheck',
    attachedFiles: ['F:/MultiCode/MultiCode_VS/dep_check_text.hpp'],
    consumerFiles: ['F:/MultiCode/MultiCode_VS/test.cpp'],
    mode: 'explicit',
    kind: 'file',
    displayName: 'dep_check_text.hpp',
    location: {
      type: 'local_file',
      value: 'F:/MultiCode/MultiCode_VS/dep_check_text.hpp',
    },
  },
  {
    integrationId: 'depcheck_math',
    attachedFiles: ['F:/MultiCode/MultiCode_VS/dep_check_math.hpp'],
    consumerFiles: ['F:/MultiCode/MultiCode_VS/test_2.cpp'],
    mode: 'implicit',
    kind: 'file',
    displayName: 'dep_check_math.hpp',
    location: {
      type: 'local_file',
      value: 'F:/MultiCode/MultiCode_VS/dep_check_math.hpp',
    },
  },
];

const symbols: SymbolDescriptor[] = [
  {
    id: 'depcheck::print_status',
    integrationId: 'depcheck',
    symbolKind: 'function',
    name: 'print_status',
    signature: 'print_status(std::string_view message)',
    signatureHash: 'sig-1',
    namespacePath: ['depcheck'],
  },
  {
    id: 'depcheck::starts_with_token',
    integrationId: 'depcheck',
    symbolKind: 'function',
    name: 'starts_with_token',
    signature: 'starts_with_token(std::map<std::string, std::vector<int>> values, std::function<void(int)> cb)',
    signatureHash: 'sig-3',
    namespacePath: ['depcheck'],
  },
  {
    id: 'depcheck::Config',
    integrationId: 'depcheck',
    symbolKind: 'class',
    name: 'Config',
    signature: 'class Config',
    signatureHash: 'sig-2',
    namespacePath: ['depcheck'],
  },
  {
    id: 'depcheck_math::sum_values',
    integrationId: 'depcheck_math',
    symbolKind: 'function',
    name: 'sum_values',
    signature: 'sum_values(int lhs, int rhs)',
    signatureHash: 'sig-4',
    namespacePath: ['depcheck_math'],
  },
];

const dependencyMap: DependencyMapState = {
  nodes: [
    { id: 'F:/MultiCode/MultiCode_VS/test.cpp', kind: 'file' },
    { id: 'depcheck', kind: 'library' },
    { id: 'depcheck_math', kind: 'library' },
  ],
  edges: [
    { from: 'F:/MultiCode/MultiCode_VS/test.cpp', to: 'depcheck' },
    { from: 'F:/MultiCode/MultiCode_VS/test.cpp', to: 'depcheck_math' },
  ],
};

describe('DependencyView v2', () => {
  it('показывает блок прикреплений, mini-tree и расширенный инспектор', async () => {
    render(
      <div style={{ width: 1400, height: 720 }}>
        <DependencyView
          displayLanguage="ru"
          mode="standalone"
          symbols={symbols}
          integrations={integrations}
          dependencyMap={dependencyMap}
          activeFilePath="F:/MultiCode/MultiCode_VS/test.cpp"
          resolveLocalizedName={(symbol) => ({
            value:
              symbol.id === 'depcheck::print_status'
                ? 'Напечатать статус'
                : symbol.id === 'depcheck::starts_with_token'
                  ? 'Начинается с токена'
                  : symbol.id === 'depcheck_math::sum_values'
                    ? 'Сумма значений'
                  : symbol.name,
            stale: false,
          })}
          onRenameRu={async () => undefined}
          onResetRu={async () => undefined}
          onDetachDependency={async () => undefined}
        />
      </div>
    );

    expect(screen.getByText('Вручную прикреплено к активному файлу')).toBeInTheDocument();
    expect(screen.getAllByText('dep_check_text.hpp').length).toBeGreaterThan(0);
    expect(screen.getByTestId('dependency-tree-root')).toHaveTextContent('test.cpp');
    expect(screen.getAllByTestId('dependency-tree-integration').some((item) => item.textContent?.includes('dep_check_text.hpp'))).toBe(true);
    expect(screen.getAllByTestId('dependency-tree-file').some((item) => item.textContent?.includes('dep_check_text.hpp'))).toBe(true);
    expect(screen.getAllByTestId('dependency-tree-integration').some((item) => item.textContent?.includes('dep_check_math.hpp'))).toBe(true);

    fireEvent.click(screen.getByText('Напечатать статус'));

    await waitFor(() => {
      expect(screen.getByTestId('dependency-inspector-namespace')).toHaveTextContent('Пространство имён');
      expect(screen.getByTestId('dependency-inspector-namespace')).toHaveTextContent('depcheck');
      expect(screen.getByTestId('dependency-inspector-namespace-breadcrumb')).toHaveTextContent('depcheck');
      expect(screen.getByTestId('dependency-inspector-qualified-name')).toHaveTextContent('depcheck::print_status');
      expect(screen.getByText('Сигнатура')).toBeInTheDocument();
      expect(screen.getByTestId('dependency-inspector-signature')).toHaveTextContent('print_status(std::string_view message)');
      expect(screen.getByTestId('dependency-inspector-parameters')).toHaveTextContent('1. std::string_view message');
    });

    fireEvent.click(screen.getByText('Начинается с токена'));
    await waitFor(() => {
      const parameters = screen.getByTestId('dependency-inspector-parameters');
      expect(parameters).toHaveTextContent('1. std::map<std::string, std::vector<int>> values');
      expect(parameters).toHaveTextContent('2. std::function<void(int)> cb');
    });
  });

  it('вызывает onInsertSymbol для function и блокирует class на текущем этапе', async () => {
    const onInsertSymbol = vi.fn();

    render(
      <div style={{ width: 1400, height: 720 }}>
        <DependencyView
          displayLanguage="ru"
          mode="standalone"
          symbols={symbols}
          integrations={integrations}
          dependencyMap={dependencyMap}
          activeFilePath="F:/MultiCode/MultiCode_VS/test.cpp"
          resolveLocalizedName={(symbol) => ({
            value: symbol.id === 'depcheck::print_status' ? 'Напечатать статус' : symbol.name,
            stale: false,
          })}
          onRenameRu={async () => undefined}
          onResetRu={async () => undefined}
          onDetachDependency={async () => undefined}
          onInsertSymbol={onInsertSymbol}
        />
      </div>
    );

    fireEvent.click(screen.getByText('Напечатать статус'));
    fireEvent.click(screen.getByTestId('dependency-inspector-insert'));

    expect(onInsertSymbol).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'depcheck::print_status',
        symbolKind: 'function',
      }),
      'Напечатать статус'
    );

    fireEvent.click(screen.getByText('Config'));
    const insertButton = screen.getByTestId('dependency-inspector-insert');
    expect(insertButton).toBeDisabled();
    expect(screen.getByText(/только для function\/method/i)).toBeInTheDocument();
  });

  it('показывает status counters и поддерживает быстрый reset фильтров', async () => {
    render(
      <div style={{ width: 1400, height: 720 }}>
        <DependencyView
          displayLanguage="ru"
          mode="standalone"
          symbols={symbols}
          integrations={integrations}
          dependencyMap={dependencyMap}
          activeFilePath="F:/MultiCode/MultiCode_VS/test.cpp"
          resolveLocalizedName={(symbol) => ({ value: symbol.name, stale: false })}
          onRenameRu={async () => undefined}
          onResetRu={async () => undefined}
          onDetachDependency={async () => undefined}
        />
      </div>
    );

    const statusCounters = screen.getByTestId('dependency-status-counters');
    expect(statusCounters).toHaveTextContent('все: 4');
    expect(statusCounters).toHaveTextContent('выкл: 1');

    fireEvent.click(screen.getByRole('button', { name: 'выкл: 1' }));
    await waitFor(() => {
      const rows = screen.getAllByTestId('dependency-symbol-row');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toHaveTextContent('sum_values');
      expect(rows[0]).not.toHaveTextContent('print_status');
    });

    const searchInput = screen.getByPlaceholderText('Поиск внешнего символа') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'sum_values' } });
    expect(searchInput.value).toBe('sum_values');
    fireEvent.click(screen.getByTestId('dependency-filters-reset'));

    await waitFor(() => {
      expect(searchInput.value).toBe('');
      expect(screen.getAllByTestId('dependency-symbol-row').some((row) => row.textContent?.includes('print_status'))).toBe(true);
    });
  });
});
