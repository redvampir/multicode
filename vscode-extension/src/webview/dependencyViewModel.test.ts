import { describe, expect, it } from 'vitest';
import type { SourceIntegration, SymbolDescriptor } from '../shared/externalSymbols';
import type { DependencyMapState } from './store/slices/indexerTypes';
import {
  buildDependencyRows,
  buildDependencyTreeModel,
  createDependencyRowsSelector,
  extractParametersFromSignature,
  groupDependencyRowsByKind,
} from './dependencyViewModel';

const integrations: SourceIntegration[] = [
  {
    integrationId: 'libA',
    attachedFiles: ['F:/sdk/libA.hpp'],
    consumerFiles: ['F:/project/main.cpp'],
    mode: 'explicit',
    kind: 'file',
    displayName: 'libA.hpp',
  },
  {
    integrationId: 'libB',
    attachedFiles: ['F:/sdk/libB.hpp'],
    consumerFiles: ['F:/project/other.cpp'],
    mode: 'implicit',
    kind: 'file',
    displayName: 'libB.hpp',
  },
];

const symbols: SymbolDescriptor[] = [
  {
    id: 'libA::alpha',
    integrationId: 'libA',
    symbolKind: 'function',
    name: 'alpha',
    signature: 'alpha(std::vector<int> values)',
    namespacePath: ['libA'],
  },
  {
    id: 'libB::beta',
    integrationId: 'libB',
    symbolKind: 'method',
    name: 'beta',
    signature: 'beta(const std::string& message)',
    namespacePath: ['libB', 'detail'],
  },
  {
    id: 'libA::Config',
    integrationId: 'libA',
    symbolKind: 'class',
    name: 'Config',
    namespacePath: ['libA'],
  },
];

describe('dependencyViewModel', () => {
  it('строит строки с учётом статуса и фильтра active-file scope', () => {
    const rows = buildDependencyRows({
      symbols,
      integrations,
      activeFilePath: 'F:/project/main.cpp',
      resolveLocalizedName: (symbol) => ({ value: symbol.name, stale: false }),
      query: '',
      scopeFilter: 'all',
      statusFilter: 'all',
      kindFilter: 'all',
    });

    const rowA = rows.find((row) => row.symbol.integrationId === 'libA');
    const rowB = rows.find((row) => row.symbol.integrationId === 'libB');
    expect(rowA?.status.state).toBe('ok');
    expect(rowB?.status.state).toBe('disabled');

    const disabledOnly = buildDependencyRows({
      symbols,
      integrations,
      activeFilePath: 'F:/project/main.cpp',
      resolveLocalizedName: (symbol) => ({ value: symbol.name, stale: false }),
      query: '',
      scopeFilter: 'all',
      statusFilter: 'disabled',
      kindFilter: 'all',
    });

    expect(disabledOnly).toHaveLength(1);
    expect(disabledOnly[0]?.symbol.integrationId).toBe('libB');
  });

  it('группирует символы по kind в фиксированном порядке', () => {
    const rows = buildDependencyRows({
      symbols,
      integrations,
      activeFilePath: null,
      resolveLocalizedName: (symbol) => ({ value: symbol.name, stale: false }),
      query: '',
      scopeFilter: 'all',
      statusFilter: 'all',
      kindFilter: 'all',
    });

    const groups = groupDependencyRowsByKind(rows);
    expect(groups.map((group) => group.kind)).toEqual(['function', 'method', 'class']);
  });

  it('строит dependency tree из scoped integrations и dependency-map', () => {
    const dependencyMap: DependencyMapState = {
      nodes: [
        { id: 'F:/project/main.cpp', kind: 'file' },
        { id: 'libA', kind: 'library' },
        { id: 'libB', kind: 'library' },
      ],
      edges: [{ from: 'F:/project/main.cpp', to: 'libB' }],
    };

    const tree = buildDependencyTreeModel('F:/project/main.cpp', integrations, dependencyMap);
    expect(tree.rootFilePath).toBe('F:/project/main.cpp');
    expect(tree.integrations.map((item) => item.integrationId)).toEqual(['libA', 'libB']);
  });

  it('корректно парсит параметры сложной сигнатуры', () => {
    const signature = 'call(std::map<std::string, std::vector<int>> values, std::function<void(int)> cb)';
    const parameters = extractParametersFromSignature(signature);
    expect(parameters).toEqual([
      'std::map<std::string, std::vector<int>> values',
      'std::function<void(int)> cb',
    ]);
  });

  it('memo-selector возвращает тот же reference при неизменных зависимостях', () => {
    const selector = createDependencyRowsSelector();
    const params = {
      symbols,
      integrations,
      activeFilePath: 'F:/project/main.cpp',
      resolveLocalizedName: (symbol: SymbolDescriptor) => ({ value: symbol.name, stale: false }),
      query: '',
      scopeFilter: 'all' as const,
      statusFilter: 'all' as const,
      kindFilter: 'all' as const,
    };

    const first = selector(params);
    const second = selector(params);

    expect(second).toBe(first);
  });
});
