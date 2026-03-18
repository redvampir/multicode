import React, { useCallback, useMemo } from 'react';
import { DependencyView } from './DependencyView';
import type { SymbolDescriptor } from '../shared/externalSymbols';
import type { GraphStoreHook } from './store';

interface DependencyViewPanelProps {
  useGraphStore: GraphStoreHook;
  displayLanguage: 'ru' | 'en';
  mode?: 'standalone' | 'sidebar';
  activeFilePath: string | null;
  onDetachDependency: (integrationId: string) => Promise<void>;
  onInsertSymbol?: (symbol: SymbolDescriptor, localizedName: string) => void;
  onStartDragSymbol?: (symbol: SymbolDescriptor, localizedName: string) => void;
  onDropSymbol?: (symbol: SymbolDescriptor, localizedName: string) => void;
}

export const DependencyViewPanel: React.FC<DependencyViewPanelProps> = ({
  useGraphStore,
  displayLanguage,
  mode = 'standalone',
  activeFilePath,
  onDetachDependency,
  onInsertSymbol,
  onStartDragSymbol,
  onDropSymbol,
}) => {
  const integrations = useGraphStore((state) => state.integrations);
  const dependencyMap = useGraphStore((state) => state.dependencyMap);
  const symbolCatalog = useGraphStore((state) => state.symbolCatalog);
  const resolveLocalizedSymbol = useGraphStore((state) => state.resolveLocalizedSymbol);
  const renameRuOverlayOptimistic = useGraphStore((state) => state.renameRuOverlayOptimistic);

  const symbols = useMemo<SymbolDescriptor[]>(() => Object.values(symbolCatalog).flat(), [symbolCatalog]);
  const resolveLocalizedName = useCallback(
    (symbol: SymbolDescriptor) => resolveLocalizedSymbol(symbol, displayLanguage),
    [displayLanguage, resolveLocalizedSymbol]
  );
  const handleRenameRu = useCallback(
    async (symbol: SymbolDescriptor, localizedNameRu: string): Promise<void> => {
      await renameRuOverlayOptimistic(
        {
          integrationId: symbol.integrationId,
          symbolId: symbol.id,
          signatureHash: symbol.signatureHash,
          localizedNameRu,
        },
        async () => Promise.resolve()
      );
    },
    [renameRuOverlayOptimistic]
  );
  const handleResetRu = useCallback(
    async (symbol: SymbolDescriptor): Promise<void> => {
      await renameRuOverlayOptimistic(
        {
          integrationId: symbol.integrationId,
          symbolId: symbol.id,
          signatureHash: symbol.signatureHash,
          localizedNameRu: '',
        },
        async () => Promise.resolve()
      );
    },
    [renameRuOverlayOptimistic]
  );

  const content = (
    <DependencyView
      displayLanguage={displayLanguage}
      mode={mode}
      symbols={symbols}
      integrations={integrations}
      dependencyMap={dependencyMap}
      activeFilePath={activeFilePath}
      resolveLocalizedName={resolveLocalizedName}
      onRenameRu={handleRenameRu}
      onResetRu={handleResetRu}
      onDetachDependency={onDetachDependency}
      onInsertSymbol={onInsertSymbol}
      onStartDragSymbol={onStartDragSymbol}
      onDropSymbol={onDropSymbol}
    />
  );

  if (mode === 'sidebar') {
    return (
      <div style={{ height: '100%', minHeight: 0, minWidth: 0, overflowY: 'auto', overflowX: 'hidden' }}>
        {content}
      </div>
    );
  }

  return (
    <div className="panel" style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="panel-title">{displayLanguage === 'ru' ? 'Зависимости' : 'Dependency View'}</div>
      <div style={{ flex: '1 1 auto', minHeight: 0, minWidth: 0, overflowY: 'auto', overflowX: 'hidden' }}>
        {content}
      </div>
    </div>
  );
};
