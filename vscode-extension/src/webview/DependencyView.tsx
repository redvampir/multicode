import React, { useMemo, useState } from 'react';
import type { SourceIntegration, SymbolDescriptor } from '../shared/externalSymbols';
import type { SymbolBadgeState } from './externalSymbolUi';
import { resolveSymbolUiStatus } from './externalSymbolUi';

interface DependencyViewProps {
  displayLanguage: 'ru' | 'en';
  symbols: SymbolDescriptor[];
  integrations: SourceIntegration[];
  activeFilePath: string | null;
  resolveLocalizedName: (symbol: SymbolDescriptor) => { value: string; stale: boolean };
  onRenameRu: (symbol: SymbolDescriptor, localizedNameRu: string) => Promise<void>;
  onResetRu: (symbol: SymbolDescriptor) => Promise<void>;
}

type ScopeFilter = 'all' | 'explicit' | 'implicit';

const badgeColors: Record<SymbolBadgeState, { bg: string; text: string; border: string }> = {
  ok: { bg: 'rgba(166, 227, 161, 0.15)', text: '#a6e3a1', border: 'rgba(166, 227, 161, 0.35)' },
  stale: { bg: 'rgba(249, 226, 175, 0.14)', text: '#f9e2af', border: 'rgba(249, 226, 175, 0.35)' },
  broken: { bg: 'rgba(243, 139, 168, 0.14)', text: '#f38ba8', border: 'rgba(243, 139, 168, 0.35)' },
  disabled: { bg: 'rgba(148, 156, 187, 0.14)', text: '#9399b2', border: 'rgba(148, 156, 187, 0.35)' },
};

export const DependencyView: React.FC<DependencyViewProps> = ({
  displayLanguage,
  symbols,
  integrations,
  activeFilePath,
  resolveLocalizedName,
  onRenameRu,
  onResetRu,
}) => {
  const [query, setQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | SymbolBadgeState>('all');
  const [selectedSymbolId, setSelectedSymbolId] = useState<string | null>(null);
  const integrationById = useMemo(
    () => new Map(integrations.map((integration) => [integration.integrationId, integration])),
    [integrations]
  );

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return symbols
      .map((symbol) => {
        const integration = integrationById.get(symbol.integrationId);
        const localized = resolveLocalizedName(symbol);
        const status = resolveSymbolUiStatus({
          symbol,
          integration,
          localizationStale: localized.stale,
          activeFilePath,
        });

        return {
          symbol,
          integration,
          localized,
          status,
        };
      })
      .filter(({ symbol, integration, status, localized }) => {
        if (scopeFilter !== 'all' && integration?.mode !== scopeFilter) {
          return false;
        }

        if (statusFilter !== 'all' && status.state !== statusFilter) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        const haystack = [
          symbol.id,
          symbol.name,
          localized.value,
          symbol.integrationId,
          integration?.displayName ?? '',
        ]
          .join(' ')
          .toLowerCase();

        return haystack.includes(normalizedQuery);
      })
      .sort((left, right) => left.localized.value.localeCompare(right.localized.value, 'ru'));
  }, [symbols, integrationById, resolveLocalizedName, activeFilePath, scopeFilter, statusFilter, query]);

  const selectedRow = rows.find((row) => row.symbol.id === selectedSymbolId) ?? rows[0] ?? null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', height: '100%', gap: 12 }}>
      <section style={{ background: '#1e1e2e', border: '1px solid #313244', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: 10, borderBottom: '1px solid #313244', display: 'grid', gap: 8 }}>
          <input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={displayLanguage === 'ru' ? 'Поиск внешнего символа' : 'Search external symbol'}
            style={{ background: '#11111b', border: '1px solid #313244', color: '#cdd6f4', borderRadius: 6, padding: '7px 10px' }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={scopeFilter} onChange={(event) => setScopeFilter(event.currentTarget.value as ScopeFilter)}>
              <option value="all">{displayLanguage === 'ru' ? 'Скоуп: все' : 'Scope: all'}</option>
              <option value="explicit">{displayLanguage === 'ru' ? 'Скоуп: explicit' : 'Scope: explicit'}</option>
              <option value="implicit">{displayLanguage === 'ru' ? 'Скоуп: implicit' : 'Scope: implicit'}</option>
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.currentTarget.value as 'all' | SymbolBadgeState)}>
              <option value="all">{displayLanguage === 'ru' ? 'Статус: все' : 'Status: all'}</option>
              <option value="ok">ok</option>
              <option value="stale">stale</option>
              <option value="broken">broken</option>
              <option value="disabled">disabled</option>
            </select>
          </div>
        </div>
        <div style={{ overflow: 'auto', height: 'calc(100% - 90px)' }}>
          {rows.map((row) => {
            const isSelected = selectedRow?.symbol.id === row.symbol.id;
            const badgeColor = badgeColors[row.status.state];
            return (
              <button
                key={`${row.symbol.integrationId}:${row.symbol.id}`}
                onClick={() => setSelectedSymbolId(row.symbol.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  background: isSelected ? '#313244' : 'transparent',
                  color: '#cdd6f4',
                  borderBottom: '1px solid #313244',
                  padding: '10px 12px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span title={row.symbol.name}>{row.localized.value}</span>
                  <span style={{ background: badgeColor.bg, color: badgeColor.text, border: `1px solid ${badgeColor.border}`, borderRadius: 999, fontSize: 11, padding: '1px 8px' }}>
                    {row.status.state}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#7f849c' }}>{row.symbol.integrationId}</div>
              </button>
            );
          })}
        </div>
      </section>

      <section style={{ background: '#1e1e2e', border: '1px solid #313244', borderRadius: 8, padding: 12 }}>
        {!selectedRow && (
          <div style={{ color: '#7f849c' }}>{displayLanguage === 'ru' ? 'Нет символов для отображения' : 'No symbols to display'}</div>
        )}
        {selectedRow && (
          <DependencySymbolInspector
            displayLanguage={displayLanguage}
            activeFilePath={activeFilePath}
            symbol={selectedRow.symbol}
            localizedValue={selectedRow.localized.value}
            onRenameRu={onRenameRu}
            onResetRu={onResetRu}
          />
        )}
      </section>
    </div>
  );
};

const DependencySymbolInspector: React.FC<{
  displayLanguage: 'ru' | 'en';
  symbol: SymbolDescriptor;
  localizedValue: string;
  activeFilePath: string | null;
  onRenameRu: (symbol: SymbolDescriptor, localizedNameRu: string) => Promise<void>;
  onResetRu: (symbol: SymbolDescriptor) => Promise<void>;
}> = ({ displayLanguage, symbol, localizedValue, activeFilePath, onRenameRu, onResetRu }) => {
  const [value, setValue] = useState(localizedValue === symbol.name ? '' : localizedValue);

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <h3 style={{ margin: 0, fontSize: 14 }}>{displayLanguage === 'ru' ? 'Инспектор символа' : 'Symbol inspector'}</h3>
      <div style={{ fontSize: 12, color: '#7f849c' }}>{symbol.id}</div>
      <label style={{ display: 'grid', gap: 6, fontSize: 12 }}>
        <span>{displayLanguage === 'ru' ? 'RU-имя (оверлей UI)' : 'RU name (UI overlay)'}</span>
        <input
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          placeholder={symbol.name}
          title={symbol.name}
          style={{ background: '#11111b', border: '1px solid #313244', color: '#cdd6f4', borderRadius: 6, padding: '8px 10px' }}
        />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => void onRenameRu(symbol, value)}>{displayLanguage === 'ru' ? 'Сохранить RU-имя' : 'Save RU name'}</button>
        <button onClick={() => { setValue(''); void onResetRu(symbol); }}>
          {displayLanguage === 'ru' ? 'Сбросить к оригиналу' : 'Reset to original'}
        </button>
      </div>
      <div style={{ fontSize: 12, color: '#7f849c' }}>
        {displayLanguage === 'ru' ? 'Оригинал' : 'Original'}: <code>{symbol.name}</code>
      </div>
      {activeFilePath && (
        <div style={{ fontSize: 11, color: '#6c7086' }}>
          {displayLanguage === 'ru' ? 'Активный файл' : 'Active file'}: {activeFilePath}
        </div>
      )}
    </div>
  );
};
