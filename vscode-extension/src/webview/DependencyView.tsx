import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { FixedSizeList, VariableSizeList } from 'react-window';
import type { SourceIntegration, SymbolDescriptor, SymbolKind } from '../shared/externalSymbols';
import type { SymbolBadgeState } from './externalSymbolUi';
import type { DependencyMapState } from './store/slices/indexerTypes';
import {
  createDependencyGroupsSelector,
  createDependencyRowsSelector,
  createDependencyTreeSelector,
  type DependencyKindFilter,
  type DependencyScopeFilter,
  type DependencySymbolGroup,
  type DependencySymbolRow,
} from './dependencyViewModel';
import { EXTERNAL_SYMBOL_DRAG_MIME, serializeExternalSymbolDragPayload } from './externalSymbolNodeFactory';

interface DependencyViewProps {
  displayLanguage: 'ru' | 'en';
  mode?: 'standalone' | 'sidebar';
  symbols: SymbolDescriptor[];
  integrations: SourceIntegration[];
  dependencyMap: DependencyMapState;
  activeFilePath: string | null;
  resolveLocalizedName: (symbol: SymbolDescriptor) => { value: string; stale: boolean };
  onRenameRu: (symbol: SymbolDescriptor, localizedNameRu: string) => Promise<void>;
  onResetRu: (symbol: SymbolDescriptor) => Promise<void>;
  onDetachDependency: (integrationId: string) => Promise<void>;
  onInsertSymbol?: (symbol: SymbolDescriptor, localizedName: string) => void;
  onStartDragSymbol?: (symbol: SymbolDescriptor, localizedName: string) => void;
  onDropSymbol?: (symbol: SymbolDescriptor, localizedName: string) => void;
}

type StatusFilter = 'all' | SymbolBadgeState;
type ViewportSize = { width: number; height: number };
type RowProps<TData> = { index: number; style: CSSProperties; data: TData };

type SymbolListItem =
  | { kind: 'group'; key: string; group: DependencySymbolGroup }
  | { kind: 'symbol'; key: string; row: DependencySymbolRow };

type TreeItem =
  | { kind: 'root'; key: 'root'; label: string }
  | { kind: 'integration'; key: string; label: string; meta: string }
  | { kind: 'file'; key: string; label: string };

const SEARCH_DEBOUNCE_MS = 180;
const GROUP_ROW_HEIGHT = 34;
const SYMBOL_ROW_HEIGHT = 82;
const TREE_ROW_HEIGHT = 28;
const STATUS_FILTERS: StatusFilter[] = ['all', 'ok', 'stale', 'broken', 'disabled'];

const badgeColors: Record<SymbolBadgeState, { bg: string; text: string; border: string }> = {
  ok: { bg: 'rgba(166, 227, 161, 0.15)', text: '#a6e3a1', border: 'rgba(166, 227, 161, 0.35)' },
  stale: { bg: 'rgba(249, 226, 175, 0.14)', text: '#f9e2af', border: 'rgba(249, 226, 175, 0.35)' },
  broken: { bg: 'rgba(243, 139, 168, 0.14)', text: '#f38ba8', border: 'rgba(243, 139, 168, 0.35)' },
  disabled: { bg: 'rgba(148, 156, 187, 0.14)', text: '#9399b2', border: 'rgba(148, 156, 187, 0.35)' },
};

const kindLabel: Record<SymbolKind, { ru: string; en: string }> = {
  function: { ru: 'Функции', en: 'Functions' },
  method: { ru: 'Методы', en: 'Methods' },
  class: { ru: 'Классы', en: 'Classes' },
  struct: { ru: 'Структуры', en: 'Structs' },
  enum: { ru: 'Перечисления', en: 'Enums' },
  variable: { ru: 'Переменные', en: 'Variables' },
};

const kindOptions: Array<{ value: DependencyKindFilter; ru: string; en: string }> = [
  { value: 'all', ru: 'Тип: все', en: 'Kind: all' },
  { value: 'function', ru: 'Тип: функция', en: 'Kind: function' },
  { value: 'method', ru: 'Тип: метод', en: 'Kind: method' },
  { value: 'class', ru: 'Тип: класс', en: 'Kind: class' },
  { value: 'struct', ru: 'Тип: структура', en: 'Kind: struct' },
  { value: 'enum', ru: 'Тип: перечисление', en: 'Kind: enum' },
  { value: 'variable', ru: 'Тип: переменная', en: 'Kind: variable' },
];
const statusOptionLabel = (status: StatusFilter, language: 'ru' | 'en'): string => {
  if (status === 'all') {
    return language === 'ru' ? 'все' : 'all';
  }
  if (language === 'ru') {
    switch (status) {
      case 'ok':
        return 'норма';
      case 'stale':
        return 'устарело';
      case 'broken':
        return 'ошибка';
      case 'disabled':
        return 'выкл';
      default:
        return status;
    }
  }
  return status;
};

const integrationModeLabel = (mode: SourceIntegration['mode'], language: 'ru' | 'en'): string => {
  if (language === 'ru') {
    return mode === 'explicit' ? 'вручную' : 'авто';
  }
  return mode;
};

const integrationKindLabel = (kind: SourceIntegration['kind'], language: 'ru' | 'en'): string => {
  if (!kind) {
    return language === 'ru' ? 'не указан' : 'unspecified';
  }
  if (language === 'ru') {
    switch (kind) {
      case 'file':
        return 'файл';
      case 'library':
        return 'библиотека';
      case 'framework':
        return 'фреймворк';
      default:
        return kind;
    }
  }
  return kind;
};

const normalizePath = (value: string): string => value.replace(/\\/g, '/').toLowerCase();
const getFileName = (filePath: string): string => filePath.replace(/\\/g, '/').split('/').at(-1) ?? filePath;
const toRowKey = (symbol: SymbolDescriptor): string =>
  `${symbol.integrationId}::${symbol.id}::${symbol.signatureHash ?? ''}`;

const scopedToActiveFile = (integration: SourceIntegration | undefined, activeFilePath: string | null): boolean => {
  if (!integration) {
    return false;
  }
  if (!activeFilePath) {
    return true;
  }
  const consumers = integration.consumerFiles ?? [];
  if (consumers.length === 0) {
    return true;
  }
  const active = normalizePath(activeFilePath);
  return consumers.some((item) => normalizePath(item) === active);
};

const transferReason = (row: DependencySymbolRow, language: 'ru' | 'en'): string | null => {
  if (row.transfer.enabled) {
    return null;
  }
  if (row.transfer.reasonCode === 'kind') {
    return language === 'ru'
      ? 'Перенос доступен только для function/method'
      : 'Transfer is available only for function/method';
  }
  if (row.transfer.reasonCode === 'status') {
    return language === 'ru'
      ? 'Символ недоступен из-за статуса зависимости'
      : 'Symbol is unavailable because of dependency status';
  }
  return language === 'ru' ? 'Символ нельзя перенести' : 'Symbol cannot be transferred';
};

const useMeasuredSize = (fallback: ViewportSize): { hostRef: React.RefObject<HTMLDivElement>; size: ViewportSize } => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<ViewportSize>(fallback);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const measure = (): void => {
      const rect = host.getBoundingClientRect();
      const width = rect.width > 1 ? rect.width : fallback.width;
      const height = rect.height > 1 ? rect.height : fallback.height;
      setSize((prev) => (Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1 ? prev : { width, height }));
    };
    measure();
    const timeout = window.setTimeout(measure, 0);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null;
    observer?.observe(host);
    window.addEventListener('resize', measure);
    return () => {
      window.clearTimeout(timeout);
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [fallback.height, fallback.width]);

  return { hostRef, size };
};

type SymbolListData = {
  items: SymbolListItem[];
  displayLanguage: 'ru' | 'en';
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onInsertSymbol?: (symbol: SymbolDescriptor, localizedName: string) => void;
  onStartDragSymbol?: (symbol: SymbolDescriptor, localizedName: string) => void;
  onDropSymbol?: (symbol: SymbolDescriptor, localizedName: string) => void;
};

const SymbolListRow = React.memo(({ index, style, data }: RowProps<SymbolListData>) => {
  const item = data.items[index];
  if (!item) {
    return null;
  }
  if (item.kind === 'group') {
    const label = kindLabel[item.group.kind];
    return (
      <div style={{ ...style, borderBottom: '1px solid #313244', background: '#191a2b', padding: '0 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, textTransform: 'uppercase', color: '#bac2de' }}>
        <span>{data.displayLanguage === 'ru' ? label.ru : label.en}</span>
        <span>{item.group.rows.length}</span>
      </div>
    );
  }

  const row = item.row;
  const selected = data.selectedKey === item.key;
  const badge = badgeColors[row.status.state];
  const localizedName = row.localized.value;
  const dragEnabled = row.transfer.enabled;
  const metaParts: string[] = [];
  if (row.symbol.name !== localizedName) {
    metaParts.push(row.symbol.name);
  }
  metaParts.push(row.symbol.symbolKind);
  if (row.namespaceText) {
    metaParts.push(row.namespaceText);
  }
  const metaText = metaParts.join(' • ');

  const onDragStart = (event: React.DragEvent<HTMLButtonElement>): void => {
    if (!dragEnabled) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData(EXTERNAL_SYMBOL_DRAG_MIME, serializeExternalSymbolDragPayload({ symbol: row.symbol, localizedName }));
    event.dataTransfer.setData('text/plain', row.qualifiedName);
    event.dataTransfer.effectAllowed = 'copyMove';
    data.onStartDragSymbol?.(row.symbol, localizedName);
  };

  const onDragEnd = (event: React.DragEvent<HTMLButtonElement>): void => {
    if (dragEnabled && event.dataTransfer.dropEffect !== 'none') {
      data.onDropSymbol?.(row.symbol, localizedName);
    }
  };

  return (
    <div style={{ ...style, borderBottom: '1px solid #313244', background: selected ? '#313244' : 'transparent', display: 'grid', gridTemplateColumns: '1fr auto', minWidth: 0 }} data-testid="dependency-symbol-row">
      <button type="button" onClick={() => data.onSelect(item.key)} draggable={dragEnabled} onDragStart={onDragStart} onDragEnd={onDragEnd} style={{ border: 'none', background: 'transparent', textAlign: 'left', color: '#cdd6f4', padding: '9px 10px', cursor: 'pointer', display: 'grid', gap: 4, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', minWidth: 0 }}>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={localizedName}>{localizedName}</span>
          <span style={{ background: badge.bg, color: badge.text, border: `1px solid ${badge.border}`, borderRadius: 999, padding: '1px 8px', fontSize: 11 }}>{data.displayLanguage === 'ru' ? row.status.labelRu : row.status.labelEn}</span>
        </div>
        <div style={{ fontSize: 11, color: '#7f849c', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={metaText}>{metaText}</div>
        <div style={{ fontSize: 11, color: '#9399b2', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.symbol.signature ?? ''}>{row.shortSignature || '—'}</div>
      </button>
      <button type="button" disabled={!row.transfer.enabled || !data.onInsertSymbol} onClick={(event) => { event.stopPropagation(); if (row.transfer.enabled) { data.onInsertSymbol?.(row.symbol, localizedName); } }} style={{ width: 34, border: 'none', borderLeft: '1px solid #313244', background: selected ? '#3b3d58' : '#222337', color: !row.transfer.enabled || !data.onInsertSymbol ? '#6c7086' : '#89dceb', cursor: !row.transfer.enabled || !data.onInsertSymbol ? 'not-allowed' : 'pointer' }}>+</button>
    </div>
  );
});
SymbolListRow.displayName = 'SymbolListRow';

type TreeData = { items: TreeItem[]; displayLanguage: 'ru' | 'en' };

const TreeRow = React.memo(({ index, style, data }: RowProps<TreeData>) => {
  const item = data.items[index];
  if (!item) {
    return null;
  }
  if (item.kind === 'root') {
    const label = data.displayLanguage === 'ru' ? 'Активный файл' : 'Active file';
    return (
      <div data-testid="dependency-tree-root" style={{ ...style, borderBottom: '1px solid #313244', display: 'flex', alignItems: 'center', padding: '0 10px', color: '#cdd6f4', fontSize: 12, gap: 6, minWidth: 0 }}>
        <span style={{ flexShrink: 0 }}>{label}:</span>
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.label}>{item.label}</span>
      </div>
    );
  }
  if (item.kind === 'integration') {
    return <div data-testid="dependency-tree-integration" style={{ ...style, borderBottom: '1px solid #313244', padding: '0 10px 0 18px', display: 'grid', alignContent: 'center', gap: 2 }}><span style={{ color: '#bac2de', fontSize: 12 }}>{item.label}</span><span style={{ color: '#7f849c', fontSize: 11 }}>{item.meta}</span></div>;
  }
  return <div data-testid="dependency-tree-file" style={{ ...style, borderBottom: '1px solid #313244', display: 'flex', alignItems: 'center', padding: '0 10px 0 34px', color: '#9399b2', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.label}>{item.label}</div>;
});
TreeRow.displayName = 'TreeRow';

const sectionStyle: CSSProperties = { background: '#1e1e2e', border: '1px solid #313244', borderRadius: 8, overflow: 'hidden' };
const formatNamespaceBreadcrumb = (namespacePath?: string[]): string =>
  Array.isArray(namespacePath) && namespacePath.length > 0 ? namespacePath.join(' > ') : '—';

interface InspectorProps {
  displayLanguage: 'ru' | 'en';
  row: DependencySymbolRow | null;
  activeFilePath: string | null;
  onRenameRu: (symbol: SymbolDescriptor, localizedNameRu: string) => Promise<void>;
  onResetRu: (symbol: SymbolDescriptor) => Promise<void>;
  onDetachDependency: (integrationId: string) => Promise<void>;
  onInsertSymbol?: (symbol: SymbolDescriptor, localizedName: string) => void;
}

const Inspector = React.memo((props: InspectorProps) => {
  const { displayLanguage, row, activeFilePath, onRenameRu, onResetRu, onDetachDependency, onInsertSymbol } = props;
  const [value, setValue] = useState('');
  const [pendingDetach, setPendingDetach] = useState(false);

  useEffect(() => {
    if (!row) {
      setValue('');
      return;
    }
    setValue(row.localized.value === row.symbol.name ? '' : row.localized.value);
  }, [row]);

  if (!row) {
    return <section style={{ ...sectionStyle, padding: 12 }}><h3 style={{ margin: 0, fontSize: 14, color: '#f5e0dc' }}>{displayLanguage === 'ru' ? 'Инспектор символа' : 'Symbol inspector'}</h3></section>;
  }

  const reason = transferReason(row, displayLanguage);
  const detachDisabledReason = row.integration?.mode === 'implicit'
    ? (displayLanguage === 'ru'
      ? 'Это авто-зависимость из #include (implicit). Чтобы убрать её, удалите #include в коде.'
      : 'This is an auto dependency from #include (implicit). Remove the #include line to get rid of it.')
    : null;

  return (
    <section style={{ ...sectionStyle, padding: 12, display: 'grid', gap: 10, minHeight: 0, overflow: 'auto' }}>
      <h3 style={{ margin: 0, fontSize: 14, color: '#f5e0dc' }}>{displayLanguage === 'ru' ? 'Инспектор символа' : 'Symbol inspector'}</h3>
      <div style={{ color: '#7f849c', fontSize: 12 }}>{row.symbol.id}</div>
      <label style={{ display: 'grid', gap: 6, fontSize: 12 }}>
        <span>{displayLanguage === 'ru' ? 'RU-имя (оверлей UI)' : 'RU name (UI overlay)'}</span>
        <input value={value} onChange={(event) => setValue(event.currentTarget.value)} placeholder={row.symbol.name} style={{ background: '#11111b', border: '1px solid #313244', color: '#cdd6f4', borderRadius: 6, padding: '8px 10px' }} />
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" onClick={() => void onRenameRu(row.symbol, value.trim())}>{displayLanguage === 'ru' ? 'Сохранить RU-имя' : 'Save RU name'}</button>
        <button type="button" onClick={() => { setValue(''); void onResetRu(row.symbol); }}>{displayLanguage === 'ru' ? 'Сбросить к оригиналу' : 'Reset to original'}</button>
        <button
          type="button"
          disabled={!row.integration || pendingDetach || row.integration?.mode === 'implicit'}
          title={detachDisabledReason ?? undefined}
          onClick={() => {
            if (!row.integration) {
              return;
            }
            setPendingDetach(true);
            void onDetachDependency(row.integration.integrationId).finally(() => setPendingDetach(false));
          }}
        >
          {displayLanguage === 'ru' ? 'Открепить' : 'Detach'}
        </button>
        <button type="button" data-testid="dependency-inspector-insert" disabled={!row.transfer.enabled || !onInsertSymbol} onClick={() => { if (row.transfer.enabled) { onInsertSymbol?.(row.symbol, row.localized.value); } }}>{displayLanguage === 'ru' ? 'Добавить в граф' : 'Insert to graph'}</button>
      </div>
      {detachDisabledReason && <div style={{ color: '#7f849c', fontSize: 12 }}>{detachDisabledReason}</div>}
      {reason && <div style={{ color: '#f9e2af', fontSize: 12 }}>{reason}</div>}
      <div style={{ fontSize: 12, color: '#bac2de', display: 'grid', gap: 6 }}>
        <div>{displayLanguage === 'ru' ? 'Оригинал' : 'Original'}: <code>{row.symbol.name}</code></div>
        <div data-testid="dependency-inspector-namespace">{displayLanguage === 'ru' ? 'Пространство имён' : 'Namespace'}: {row.namespaceText || '—'}</div>
        <div data-testid="dependency-inspector-namespace-breadcrumb">
          {displayLanguage === 'ru' ? 'Цепочка пространств имён' : 'Namespace breadcrumb'}: {formatNamespaceBreadcrumb(row.symbol.namespacePath)}
        </div>
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontSize: 12, color: '#cdd6f4' }}>{displayLanguage === 'ru' ? 'Полное имя (qualified)' : 'Qualified name'}</div>
        <pre data-testid="dependency-inspector-qualified-name" style={{ margin: 0, fontFamily: 'Consolas, "Courier New", monospace', fontSize: 11, background: '#11111b', border: '1px solid #313244', borderRadius: 6, padding: '8px 10px', overflowX: 'auto' }}>{row.qualifiedName}</pre>
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontSize: 12, color: '#cdd6f4' }}>{displayLanguage === 'ru' ? 'Сигнатура' : 'Signature'}</div>
        <pre data-testid="dependency-inspector-signature" style={{ margin: 0, fontFamily: 'Consolas, "Courier New", monospace', fontSize: 11, background: '#11111b', border: '1px solid #313244', borderRadius: 6, padding: '8px 10px', overflowX: 'auto' }}>{row.symbol.signature || '—'}</pre>
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontSize: 12, color: '#cdd6f4' }}>{displayLanguage === 'ru' ? 'Параметры' : 'Parameters'}</div>
        <div data-testid="dependency-inspector-parameters" style={{ margin: 0, fontFamily: 'Consolas, "Courier New", monospace', fontSize: 11, background: '#11111b', border: '1px solid #313244', borderRadius: 6, padding: '8px 10px', maxHeight: 120, overflow: 'auto' }}>
          {row.parameters.length === 0
            ? <div style={{ color: '#7f849c' }}>{displayLanguage === 'ru' ? 'Параметров нет' : 'No parameters'}</div>
            : row.parameters.map((parameter, index) => <div key={`${parameter}:${index}`}>{index + 1}. {parameter}</div>)}
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#7f849c', display: 'grid', gap: 4 }}>
        <div>{displayLanguage === 'ru' ? 'ID интеграции' : 'integration id'}: {row.symbol.integrationId}</div>
        <div>{displayLanguage === 'ru' ? 'Источник' : 'Source'}: {row.integration?.location?.value ?? row.integration?.displayName ?? row.symbol.integrationId}</div>
        {activeFilePath && (
          <div style={{ display: 'flex', gap: 6, minWidth: 0 }}>
            <span style={{ flexShrink: 0 }}>{displayLanguage === 'ru' ? 'Активный файл' : 'Active file'}:</span>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={activeFilePath}>{activeFilePath}</span>
          </div>
        )}
      </div>
    </section>
  );
});
Inspector.displayName = 'Inspector';

export const DependencyView: React.FC<DependencyViewProps> = ({
  displayLanguage,
  mode = 'standalone',
  symbols,
  integrations,
  dependencyMap,
  activeFilePath,
  resolveLocalizedName,
  onRenameRu,
  onResetRu,
  onDetachDependency,
  onInsertSymbol,
  onStartDragSymbol,
  onDropSymbol,
}) => {
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState<DependencyScopeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [kindFilter, setKindFilter] = useState<DependencyKindFilter>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detachingId, setDetachingId] = useState<string | null>(null);

  const rowsSelectorRef = useRef(createDependencyRowsSelector());
  const rowsMetricsSelectorRef = useRef(createDependencyRowsSelector());
  const groupsSelectorRef = useRef(createDependencyGroupsSelector());
  const treeSelectorRef = useRef(createDependencyTreeSelector());

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(queryInput), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  const rows = rowsSelectorRef.current({ symbols, integrations, activeFilePath, resolveLocalizedName, query, scopeFilter, statusFilter, kindFilter });
  const rowsForMetrics = rowsMetricsSelectorRef.current({
    symbols,
    integrations,
    activeFilePath,
    resolveLocalizedName,
    query,
    scopeFilter,
    statusFilter: 'all',
    kindFilter: 'all',
  });
  const groups = groupsSelectorRef.current(rows);
  const tree = treeSelectorRef.current(activeFilePath, integrations, dependencyMap);
  const integrationById = useMemo(() => new Map(integrations.map((integration) => [integration.integrationId, integration])), [integrations]);

  useEffect(() => {
    if (rows.length === 0) {
      if (selectedKey !== null) {
        setSelectedKey(null);
      }
      return;
    }
    if (!selectedKey || !rows.some((row) => toRowKey(row.symbol) === selectedKey)) {
      setSelectedKey(toRowKey(rows[0].symbol));
    }
  }, [rows, selectedKey]);

  const selectedRow = useMemo(() => {
    if (rows.length === 0) {
      return null;
    }
    if (!selectedKey) {
      return rows[0];
    }
    return rows.find((row) => toRowKey(row.symbol) === selectedKey) ?? rows[0];
  }, [rows, selectedKey]);

  const symbolItems = useMemo<SymbolListItem[]>(() => {
    const items: SymbolListItem[] = [];
    for (const group of groups) {
      items.push({ kind: 'group', key: `group:${group.kind}`, group });
      for (const row of group.rows) {
        items.push({ kind: 'symbol', key: toRowKey(row.symbol), row });
      }
    }
    return items;
  }, [groups]);

  const integrationSymbolCount = useMemo(() => {
    const result = new Map<string, number>();
    for (const row of rowsForMetrics) {
      const current = result.get(row.symbol.integrationId) ?? 0;
      result.set(row.symbol.integrationId, current + 1);
    }
    return result;
  }, [rowsForMetrics]);

  const treeItems = useMemo<TreeItem[]>(() => {
    const items: TreeItem[] = [{ kind: 'root', key: 'root', label: tree.rootFilePath ?? (displayLanguage === 'ru' ? 'не выбран' : 'not selected') }];
    for (const integration of tree.integrations) {
      const symbolCount = integrationSymbolCount.get(integration.integrationId) ?? 0;
      const symbolMeta = displayLanguage === 'ru' ? `${symbolCount} символов` : `${symbolCount} symbols`;
      items.push({
        kind: 'integration',
        key: `integration:${integration.integrationId}`,
        label: integration.displayName,
        meta: `${integrationModeLabel(integration.mode, displayLanguage)} · ${integrationKindLabel(integration.kind, displayLanguage)} · ${symbolMeta}`,
      });
      for (const filePath of integration.attachedFiles) {
        items.push({ kind: 'file', key: `file:${integration.integrationId}:${filePath}`, label: filePath });
      }
    }
    return items;
  }, [displayLanguage, integrationSymbolCount, tree.integrations, tree.rootFilePath]);

  const scopedIntegrations = useMemo(
    () => tree.integrations.filter((item) => scopedToActiveFile(integrationById.get(item.integrationId), activeFilePath)),
    [tree.integrations, integrationById, activeFilePath]
  );
  const explicitAttachedIntegrations = useMemo(() => {
    if (!activeFilePath) {
      return [];
    }

    const activeMatch = normalizePath(activeFilePath);
    return scopedIntegrations.filter((item) => {
      const integration = integrationById.get(item.integrationId);
      if (!integration || integration.mode !== 'explicit') {
        return false;
      }
      const consumers = integration.consumerFiles ?? [];
      if (consumers.length === 0) {
        return false;
      }
      return consumers.some((filePath) => normalizePath(filePath) === activeMatch);
    });
  }, [activeFilePath, integrationById, scopedIntegrations]);
  const implicitInScopeCount = useMemo(
    () => scopedIntegrations.filter((item) => item.mode === 'implicit').length,
    [scopedIntegrations]
  );

  const counters = useMemo(() => {
    const result = new Map<SymbolKind, number>();
    for (const group of groups) {
      result.set(group.kind, group.rows.length);
    }
    return result;
  }, [groups]);
  const statusCounters = useMemo(() => {
    const result = new Map<SymbolBadgeState, number>();
    for (const row of rowsForMetrics) {
      const current = result.get(row.status.state) ?? 0;
      result.set(row.status.state, current + 1);
    }
    return result;
  }, [rowsForMetrics]);
  const hasActiveFilters = queryInput.trim().length > 0 || scopeFilter !== 'all' || statusFilter !== 'all' || kindFilter !== 'all';

  const symbolListData = useMemo<SymbolListData>(() => ({ items: symbolItems, displayLanguage, selectedKey, onSelect: setSelectedKey, onInsertSymbol, onStartDragSymbol, onDropSymbol }), [symbolItems, displayLanguage, selectedKey, onInsertSymbol, onStartDragSymbol, onDropSymbol]);
  const treeData = useMemo(() => ({ items: treeItems, displayLanguage }), [treeItems, displayLanguage]);

  const symbolRef = useRef<VariableSizeList<SymbolListData> | null>(null);
  useEffect(() => {
    symbolRef.current?.resetAfterIndex(0, true);
  }, [symbolItems]);

  const { hostRef: symbolHostRef, size: symbolSize } = useMeasuredSize({ width: 560, height: 280 });
  const { hostRef: treeHostRef, size: treeSize } = useMeasuredSize({ width: 420, height: 160 });

  const getSize = useCallback((index: number): number => (symbolItems[index]?.kind === 'group' ? GROUP_ROW_HEIGHT : SYMBOL_ROW_HEIGHT), [symbolItems]);

  const detachIntegration = useCallback((integrationId: string): void => {
    if (detachingId) {
      return;
    }
    setDetachingId(integrationId);
    void onDetachDependency(integrationId).finally(() => setDetachingId(null));
  }, [detachingId, onDetachDependency]);

  const isSidebar = mode === 'sidebar';
  const rootStyle: CSSProperties = isSidebar
    ? { display: 'grid', gridTemplateColumns: '1fr', gap: 10, minHeight: 0, minWidth: 0 }
    : { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 12, minHeight: 0, minWidth: 0 };
  return (
    <div
      style={rootStyle}
    >
      <div style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: 10, minHeight: 0 }}>
        <section style={{ ...sectionStyle, padding: 10, display: 'grid', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 14, color: '#f5e0dc' }}>{displayLanguage === 'ru' ? 'Вручную прикреплено к активному файлу' : 'Manually attached to active file'}</h3>
          <div style={{ fontSize: 11, color: '#7f849c', display: 'flex', gap: 6, minWidth: 0 }}>
            <span style={{ flexShrink: 0 }}>{displayLanguage === 'ru' ? 'Активный файл' : 'Active file'}:</span>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={activeFilePath ?? ''}>
              {activeFilePath ?? (displayLanguage === 'ru' ? 'не выбран' : 'not selected')}
            </span>
          </div>
          {implicitInScopeCount > 0 && (
            <div style={{ fontSize: 11, color: '#7f849c' }}>
              {displayLanguage === 'ru'
                ? `Авто-зависимости из #include: ${implicitInScopeCount} (показаны в дереве и фильтрах)`
                : `Auto dependencies from #include (implicit): ${implicitInScopeCount} (shown in tree and filters)`}
            </div>
          )}
          {explicitAttachedIntegrations.length === 0 && <div style={{ fontSize: 12, color: '#7f849c' }}>{displayLanguage === 'ru' ? 'Для текущего файла нет вручную прикреплённых зависимостей' : 'No manual dependencies attached for the current file'}</div>}
           {explicitAttachedIntegrations.length > 0 && (
             <div style={{ display: 'grid', gap: 6, maxHeight: 120, overflowY: 'auto' }}>
               {explicitAttachedIntegrations.map((item) => {
                 const source = integrationById.get(item.integrationId)?.attachedFiles?.[0] ?? item.integrationId;
                 return (
                   <div key={item.integrationId} style={{ border: '1px solid #313244', borderRadius: 6, padding: '6px 8px', display: 'grid', gap: 4, background: '#181825' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', minWidth: 0 }}>
                       <span style={{ color: '#cdd6f4', fontSize: 12, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.displayName}>{item.displayName}</span>
                       <button type="button" style={{ flexShrink: 0 }} disabled={detachingId === item.integrationId} onClick={() => detachIntegration(item.integrationId)}>{displayLanguage === 'ru' ? 'Открепить' : 'Detach'}</button>
                     </div>
                     <span style={{ color: '#7f849c', fontSize: 11 }} title={source}>{getFileName(source)}</span>
                   </div>
                 );
               })}
             </div>
           )}
         </section>

        <section style={{ ...sectionStyle, display: 'grid', gridTemplateRows: 'auto auto auto minmax(0, 1fr)' }}>
          <div style={{ padding: 10, borderBottom: '1px solid #313244' }}><input value={queryInput} onChange={(event) => setQueryInput(event.currentTarget.value)} placeholder={displayLanguage === 'ru' ? 'Поиск внешнего символа' : 'Search external symbol'} style={{ width: '100%', background: '#11111b', border: '1px solid #313244', color: '#cdd6f4', borderRadius: 6, padding: '8px 10px' }} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, padding: '0 10px 10px 10px', borderBottom: '1px solid #313244' }}>
            <select style={{ minWidth: 0 }} value={scopeFilter} onChange={(event) => setScopeFilter(event.currentTarget.value as DependencyScopeFilter)}>
              <option value="all">{displayLanguage === 'ru' ? 'Охват: все' : 'Scope: all'}</option>
              <option value="explicit">{displayLanguage === 'ru' ? 'Охват: вручную' : 'Scope: explicit'}</option>
              <option value="implicit">{displayLanguage === 'ru' ? 'Охват: авто' : 'Scope: implicit'}</option>
            </select>
            <select style={{ minWidth: 0 }} value={statusFilter} onChange={(event) => setStatusFilter(event.currentTarget.value as StatusFilter)}>
              <option value="all">{displayLanguage === 'ru' ? 'Статус: все' : 'Status: all'}</option>
              <option value="ok">{displayLanguage === 'ru' ? 'норма' : 'ok'}</option>
              <option value="stale">{displayLanguage === 'ru' ? 'устарело' : 'stale'}</option>
              <option value="broken">{displayLanguage === 'ru' ? 'ошибка' : 'broken'}</option>
              <option value="disabled">{displayLanguage === 'ru' ? 'выключено' : 'disabled'}</option>
            </select>
            <select style={{ minWidth: 0 }} value={kindFilter} onChange={(event) => setKindFilter(event.currentTarget.value as DependencyKindFilter)}>
              {kindOptions.map((option) => <option key={option.value} value={option.value}>{displayLanguage === 'ru' ? option.ru : option.en}</option>)}
            </select>
          </div>
          <div data-testid="dependency-status-counters" style={{ borderBottom: '1px solid #313244', padding: '6px 10px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STATUS_FILTERS.map((status) => {
              const active = statusFilter === status;
              const count = status === 'all' ? rowsForMetrics.length : (statusCounters.get(status) ?? 0);
              const color = status === 'all'
                ? { bg: 'rgba(148, 156, 187, 0.14)', text: '#cdd6f4', border: 'rgba(148, 156, 187, 0.35)' }
                : badgeColors[status];
              return (
                <button
                  key={`status-counter:${status}`}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  style={{
                    borderRadius: 999,
                    border: `1px solid ${color.border}`,
                    background: active ? '#313244' : color.bg,
                    color: color.text,
                    fontSize: 11,
                    padding: '2px 9px',
                    cursor: 'pointer',
                  }}
                >
                  {statusOptionLabel(status, displayLanguage)}: {count}
                </button>
              );
            })}
            <button
              data-testid="dependency-filters-reset"
              type="button"
              disabled={!hasActiveFilters}
              onClick={() => {
                setQueryInput('');
                setQuery('');
                setScopeFilter('all');
                setStatusFilter('all');
                setKindFilter('all');
              }}
              style={{
                marginLeft: 'auto',
                fontSize: 11,
                color: hasActiveFilters ? '#f9e2af' : '#6c7086',
                border: '1px solid #45475a',
                borderRadius: 6,
                background: 'transparent',
                padding: '2px 8px',
                cursor: hasActiveFilters ? 'pointer' : 'not-allowed',
              }}
            >
              {displayLanguage === 'ru' ? 'Сбросить фильтры' : 'Reset filters'}
            </button>
          </div>
          <div style={{ borderBottom: '1px solid #313244', padding: '7px 10px', display: 'flex', gap: 10, flexWrap: 'wrap', color: '#7f849c', fontSize: 11 }}>
            {(Object.keys(kindLabel) as SymbolKind[]).map((kind) => {
              const label = kindLabel[kind];
              return <span key={`count:${kind}`}>{displayLanguage === 'ru' ? label.ru : label.en}: {counters.get(kind) ?? 0}</span>;
            })}
          </div>
          <div ref={symbolHostRef} style={{ minHeight: 240, height: '100%' }}>
            {symbolItems.length === 0 ? (
              <div style={{ padding: 12, color: '#7f849c', fontSize: 12 }}>{displayLanguage === 'ru' ? 'Символы не найдены для текущего фильтра' : 'No symbols found for current filters'}</div>
            ) : (
              <VariableSizeList
                ref={symbolRef}
                itemData={symbolListData}
                itemCount={symbolItems.length}
                itemSize={getSize}
                width={Math.max(1, Math.floor(symbolSize.width))}
                height={Math.max(1, Math.floor(symbolSize.height))}
                overscanCount={12}
                itemKey={(index: number, data: SymbolListData) => data.items[index]?.key ?? `row-${index}`}
              >
                {SymbolListRow}
              </VariableSizeList>
            )}
          </div>
        </section>
      </div>

      <div style={{ display: 'grid', gridTemplateRows: 'minmax(160px, 0.45fr) minmax(220px, 0.55fr)', gap: 10, minHeight: 0 }}>
        <section style={{ ...sectionStyle, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)' }}>
          <h3 style={{ margin: 0, padding: '10px 10px 8px 10px', fontSize: 14, color: '#f5e0dc' }}>{displayLanguage === 'ru' ? 'Дерево зависимостей' : 'Dependency tree'}</h3>
          <div ref={treeHostRef} style={{ minHeight: 120, height: '100%' }}>
            <FixedSizeList
              itemData={treeData}
              itemCount={treeItems.length}
              itemSize={TREE_ROW_HEIGHT}
              width={Math.max(1, Math.floor(treeSize.width))}
              height={Math.max(1, Math.floor(treeSize.height))}
              overscanCount={8}
              itemKey={(index: number, data: { items: TreeItem[] }) => data.items[index]?.key ?? `tree-${index}`}
            >
              {TreeRow}
            </FixedSizeList>
          </div>
        </section>
        <Inspector
          displayLanguage={displayLanguage}
          row={selectedRow}
          activeFilePath={activeFilePath}
          onRenameRu={onRenameRu}
          onResetRu={onResetRu}
          onDetachDependency={onDetachDependency}
          onInsertSymbol={onInsertSymbol}
        />
      </div>
    </div>
  );
};
