import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SourceIntegration, SymbolDescriptor } from '../shared/externalSymbols';
import type { DependencyMapState } from './store/slices/indexerTypes';
import { DependencyView } from './DependencyView';

const integration: SourceIntegration = {
  integrationId: 'perf-lib',
  attachedFiles: ['F:/sdk/perf.hpp'],
  consumerFiles: ['F:/project/main.cpp'],
  mode: 'explicit',
  kind: 'file',
  displayName: 'perf.hpp',
  location: {
    type: 'local_file',
    value: 'F:/sdk/perf.hpp',
  },
};

const dependencyMap: DependencyMapState = {
  nodes: [
    { id: 'F:/project/main.cpp', kind: 'file' },
    { id: 'perf-lib', kind: 'library' },
  ],
  edges: [{ from: 'F:/project/main.cpp', to: 'perf-lib' }],
};

const buildSymbols = (count: number): SymbolDescriptor[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `perf-lib::fn_${index}`,
    integrationId: 'perf-lib',
    symbolKind: 'function',
    name: `fn_${index}`,
    signature: `fn_${index}(int value_${index})`,
    signatureHash: `sig-${index}`,
    namespacePath: ['perf', 'api'],
  }));

describe('DependencyView performance smoke', () => {
  it('виртуализирует список и фильтрует 5k+ символов без регресса UX', async () => {
    const symbols = buildSymbols(5600);

    render(
      <div style={{ width: 1500, height: 860 }}>
        <DependencyView
          displayLanguage="ru"
          mode="standalone"
          symbols={symbols}
          integrations={[integration]}
          dependencyMap={dependencyMap}
          activeFilePath="F:/project/main.cpp"
          resolveLocalizedName={(symbol) => ({ value: symbol.name, stale: false })}
          onRenameRu={async () => undefined}
          onResetRu={async () => undefined}
          onDetachDependency={async () => undefined}
          onInsertSymbol={() => undefined}
        />
      </div>
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('dependency-symbol-row').length).toBeLessThan(180);
    });

    fireEvent.change(screen.getByPlaceholderText('Поиск внешнего символа'), {
      target: { value: 'fn_5599' },
    });

    await waitFor(() => {
      expect(screen.getAllByTestId('dependency-symbol-row').length).toBe(1);
      expect(screen.getAllByTestId('dependency-symbol-row')[0]).toHaveTextContent('fn_5599');
    });
  });
});
