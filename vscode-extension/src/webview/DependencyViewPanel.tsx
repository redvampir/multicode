import React, { useMemo } from 'react';
import { DependencyView } from './DependencyView';
import type { SymbolDescriptor } from '../shared/externalSymbols';
import type { GraphStoreHook } from './store';

interface DependencyViewPanelProps {
  useGraphStore: GraphStoreHook;
  displayLanguage: 'ru' | 'en';
  activeFilePath: string | null;
}

export const DependencyViewPanel: React.FC<DependencyViewPanelProps> = ({
  useGraphStore,
  displayLanguage,
  activeFilePath,
}) => {
  const integrations = useGraphStore((state) => state.integrations);
  const symbolCatalog = useGraphStore((state) => state.symbolCatalog);
  const resolveLocalizedSymbol = useGraphStore((state) => state.resolveLocalizedSymbol);
  const renameRuOverlayOptimistic = useGraphStore((state) => state.renameRuOverlayOptimistic);

  const symbols = useMemo<SymbolDescriptor[]>(() => Object.values(symbolCatalog).flat(), [symbolCatalog]);

  return (
    <div className="panel" style={{ height: '100%', minHeight: 320 }}>
      <div className="panel-title">{displayLanguage === 'ru' ? 'Dependency View' : 'Dependency View'}</div>
      <DependencyView
        displayLanguage={displayLanguage}
        symbols={symbols}
        integrations={integrations}
        activeFilePath={activeFilePath}
        resolveLocalizedName={(symbol) => resolveLocalizedSymbol(symbol, displayLanguage)}
        onRenameRu={async (symbol, localizedNameRu) => {
          await renameRuOverlayOptimistic(
            {
              integrationId: symbol.integrationId,
              symbolId: symbol.id,
              signatureHash: symbol.signatureHash,
              localizedNameRu,
            },
            async () => Promise.resolve()
          );
        }}
        onResetRu={async (symbol) => {
          await renameRuOverlayOptimistic(
            {
              integrationId: symbol.integrationId,
              symbolId: symbol.id,
              signatureHash: symbol.signatureHash,
              localizedNameRu: '',
            },
            async () => Promise.resolve()
          );
        }}
      />
    </div>
  );
};
