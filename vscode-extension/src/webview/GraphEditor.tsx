import React, { useEffect, useMemo, useRef, useState } from 'react';
import cytoscape, { type Core, type ElementDefinition, type LayoutOptions } from 'cytoscape';
import dagre from 'cytoscape-dagre';
import klay from 'cytoscape-klay';
import type { GraphNodeType, GraphState } from '../shared/graphState';
import { getTranslation } from '../shared/translations';
import type { GraphStoreHook, LayoutSettings, SearchResult } from './store';
import type { ThemeTokens } from './theme';

cytoscape.use(dagre);
cytoscape.use(klay);

type Stylesheet = cytoscape.StylesheetStyle;
type DagreLayoutOptions = LayoutOptions & {
  name: 'dagre';
  rankDir?: 'LR' | 'TB' | 'BT' | 'RL';
  padding?: number;
  nodeSep?: number;
  edgeSep?: number;
  spacingFactor?: number;
};

type KlayLayoutOptions = LayoutOptions & {
  name: 'klay';
  nodeDimensionsIncludeLabels?: boolean;
  klay?: {
    spacing?: number;
    edgeSpacingFactor?: number;
    inLayerSpacingFactor?: number;
    direction?: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
  };
};

type EditorLayoutOptions = DagreLayoutOptions | KlayLayoutOptions;

const layoutPadding = 30;

type ContextMenuKind = 'node' | 'edge' | 'canvas';

type ContextMenuState = {
  x: number;
  y: number;
  kind: ContextMenuKind;
  targetId?: string;
};

const buildElements = (graph: GraphState): ElementDefinition[] => {
  const nodes: ElementDefinition[] = graph.nodes.map((node) => ({
    data: {
      id: node.id,
      label: node.label,
      type: node.type
    },
    position: node.position
  }));

  const edges: ElementDefinition[] = graph.edges.map((edge) => ({
    data: {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label ?? '',
      kind: edge.kind ?? 'execution'
    }
  }));

  return [...nodes, ...edges];
};

const buildStyles = (tokens: ThemeTokens): Stylesheet[] => [
  {
    selector: 'node',
    style: {
      shape: 'round-rectangle',
      width: 'label',
      height: 'label',
      padding: `${tokens.nodes.padding}px`,
      'background-color': tokens.nodePalette.Function.fill,
      'background-opacity': 0.98,
      'border-color': tokens.nodePalette.Function.border,
      'border-width': tokens.nodes.borderWidth,
      'border-opacity': tokens.nodes.borderOpacity,
      'text-valign': 'center',
      'text-halign': 'center',
      'font-size': tokens.nodes.fontSize,
      'font-weight': 600,
      color: tokens.nodes.textColor,
      label: 'data(label)',
      'text-outline-color': tokens.nodes.textOutline,
      'text-outline-width': tokens.nodes.textOutlineWidth,
      'text-max-width': tokens.nodes.labelMaxWidth,
      'text-wrap': 'wrap',
      roundness: tokens.nodes.radius,
      'box-shadow': tokens.nodes.shadow,
      'transition-property': 'background-color, border-color'
    } as cytoscape.Css.Node
  },
  {
    selector: 'node[type = "Start"]',
    style: {
      'background-color': tokens.nodePalette.Start.fill,
      'border-color': tokens.nodePalette.Start.border
    } as cytoscape.Css.Node
  },
  {
    selector: 'node[type = "End"]',
    style: {
      'background-color': tokens.nodePalette.End.fill,
      'border-color': tokens.nodePalette.End.border
    } as cytoscape.Css.Node
  },
  {
    selector: 'node[type = "Variable"]',
    style: {
      'background-color': tokens.nodePalette.Variable.fill,
      'border-color': tokens.nodePalette.Variable.border
    } as cytoscape.Css.Node
  },
  {
    selector: 'node[type = "Custom"]',
    style: {
      'background-color': tokens.nodePalette.Custom.fill,
      'border-color': tokens.nodePalette.Custom.border
    } as cytoscape.Css.Node
  },
  {
    selector: 'edge',
    style: {
      width: tokens.edges.width * tokens.geometry.arrowThickness,
      'curve-style': 'bezier',
      'line-color': tokens.ports.palette.execution,
      'line-cap': 'round',
      'target-arrow-color': tokens.ports.palette.execution,
      'target-arrow-shape': 'triangle',
      'arrow-scale': tokens.edges.arrowScale,
      'text-background-opacity': 0.92,
      'text-background-color': tokens.edges.labelBackground,
      'text-background-padding': '4px',
      'text-rotation': 'autorotate',
      label: 'data(label)',
      color: tokens.ports.labelColor,
      'font-size': tokens.ports.labelFontSize,
      'text-max-width': '120px',
      'text-wrap': 'wrap'
    } as cytoscape.Css.Edge
  },
  {
    selector: 'edge[kind = "data"]',
    style: {
      'line-style': 'dashed',
      'line-color': tokens.ports.palette.data,
      'target-arrow-color': tokens.ports.palette.data
    } as cytoscape.Css.Edge
  },
  {
    selector: 'edge.edge--active',
    style: {
      'line-color': tokens.edges.activeGlow,
      'target-arrow-color': tokens.edges.activeGlow,
      width: tokens.edges.width * tokens.geometry.arrowThickness + 1.5,
      'text-background-color': tokens.edges.labelBackground,
      'text-background-opacity': 1
    } as cytoscape.Css.Edge
  },
  {
    selector: 'node:selected',
    style: {
      'border-color': tokens.edges.activeGlow,
      'border-width': tokens.nodes.borderWidth + 1,
      'box-shadow': `0 0 18px ${tokens.edges.activeGlow}`
    } as cytoscape.Css.Node
  },
  {
    selector: 'node.search-hit',
    style: {
      'border-color': tokens.edges.activeGlow,
      'border-width': tokens.nodes.borderWidth + 1,
      'box-shadow': `0 0 12px ${tokens.edges.activeGlow}`,
      'background-opacity': 1
    } as cytoscape.Css.Node
  },
  {
    selector: 'edge.search-hit',
    style: {
      'line-color': tokens.edges.activeGlow,
      'target-arrow-color': tokens.edges.activeGlow,
      width: tokens.edges.width * tokens.geometry.arrowThickness + 1
    } as cytoscape.Css.Edge
  },
  {
    selector: '.search-dim',
    style: {
      opacity: 0.25
    }
  }
];

const klayDirectionMap: Record<LayoutSettings['rankDir'], 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'> = {
  LR: 'RIGHT',
  RL: 'LEFT',
  TB: 'DOWN',
  BT: 'UP'
};

const buildLayoutOptions = (settings: LayoutSettings): EditorLayoutOptions => {
  if (settings.algorithm === 'klay') {
    return {
      name: 'klay',
      padding: layoutPadding,
      nodeDimensionsIncludeLabels: true,
      klay: {
        spacing: settings.nodeSep,
        edgeSpacingFactor: settings.edgeSep,
        inLayerSpacingFactor: settings.spacing,
        direction: klayDirectionMap[settings.rankDir]
      }
    } satisfies KlayLayoutOptions;
  }

  return {
    name: 'dagre',
    rankDir: settings.rankDir,
    nodeSep: settings.nodeSep,
    edgeSep: settings.edgeSep,
    spacingFactor: settings.spacing,
    padding: layoutPadding
  } satisfies DagreLayoutOptions;
};

export const GraphEditor: React.FC<{
  graphStore: GraphStoreHook;
  theme: ThemeTokens;
  onAddNode: (payload: { label?: string; nodeType?: GraphNodeType }) => void;
  onConnectNodes: (payload: { sourceId?: string; targetId?: string }) => void;
  onLayoutReady?: (runner: () => void) => void;
}> = ({ graphStore, theme, onAddNode, onConnectNodes, onLayoutReady }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const graph = graphStore((state) => state.graph);
  const selectedNodeIds = graphStore((state) => state.selectedNodeIds);
  const selectedEdgeIds = graphStore((state) => state.selectedEdgeIds);
  const layoutSettings = graphStore((state) => state.layout);
  const searchQuery = graphStore((state) => state.searchQuery);
  const searchResults = graphStore((state) => state.searchResults);
  const searchIndex = graphStore((state) => state.searchIndex);
  const hasClipboard = graphStore((state) => Boolean(state.clipboard));
  const setSelectedNodes = graphStore((state) => state.setSelectedNodes);
  const setSelectedEdges = graphStore((state) => state.setSelectedEdges);
  const updateNodePosition = graphStore((state) => state.updateNodePosition);
  const deleteNodes = graphStore((state) => state.deleteNodes);
  const deleteEdges = graphStore((state) => state.deleteEdges);
  const undo = graphStore((state) => state.undo);
  const redo = graphStore((state) => state.redo);
  const copySelection = graphStore((state) => state.copySelection);
  const pasteClipboard = graphStore((state) => state.pasteClipboard);
  const duplicateSelection = graphStore((state) => state.duplicateSelection);
  const setSearchQuery = graphStore((state) => state.setSearchQuery);
  const setSearchIndex = graphStore((state) => state.setSearchIndex);
  const selectNextSearchResult = graphStore((state) => state.selectNextSearchResult);
  const selectPreviousSearchResult = graphStore((state) => state.selectPreviousSearchResult);
  const styles = useMemo(() => buildStyles(theme), [theme]);
  const selectionRef = useRef<string[]>([]);
  const edgeSelectionRef = useRef<string[]>([]);
  const layoutRunnerRef = useRef<() => void>(() => {});
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const translate = useMemo(
    () =>
      (key: string, fallback: string, replacements?: Record<string, string>) =>
        getTranslation(graph.displayLanguage, key as never, replacements, fallback),
    [graph.displayLanguage]
  );

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    cyRef.current = cytoscape({
      container: containerRef.current,
      elements: buildElements(graph),
      style: styles,
      layout: buildLayoutOptions(layoutSettings),
      wheelSensitivity: 0.15,
      minZoom: 0.2,
      maxZoom: 2,
      autoungrabify: false,
      boxSelectionEnabled: false,
      motionBlur: true
    });

    cyRef.current.on('dragfree', 'node', (event) => {
      const position = event.target.position();
      updateNodePosition(event.target.id(), { x: position.x, y: position.y });
    });

    cyRef.current.on('tap', () => {
      cyRef.current?.nodes().unselect();
    });

    cyRef.current.on('tap', 'edge', (event) => {
      cyRef.current?.edges().removeClass('edge--active');
      event.target.addClass('edge--active');
    });

    cyRef.current.on('mouseover', 'edge', (event) => {
      event.target.addClass('edge--active');
    });

    cyRef.current.on('mouseout', 'edge', (event) => {
      event.target.removeClass('edge--active');
    });

    cyRef.current.on('select', 'node', () => {
      const selected = cyRef.current?.nodes(':selected').map((node) => node.id()) ?? [];
      setSelectedNodes(selected);
    });

    cyRef.current.on('unselect', 'node', () => {
      const selected = cyRef.current?.nodes(':selected').map((node) => node.id()) ?? [];
      setSelectedNodes(selected);
    });

    cyRef.current.on('select', 'edge', () => {
      const selected = cyRef.current?.edges(':selected').map((edge) => edge.id()) ?? [];
      setSelectedEdges(selected);
    });

    cyRef.current.on('unselect', 'edge', () => {
      const selected = cyRef.current?.edges(':selected').map((edge) => edge.id()) ?? [];
      setSelectedEdges(selected);
    });

    cyRef.current.on('cxttap', 'node', (event) => {
      const nodeId = event.target.id();
      if (!selectionRef.current.includes(nodeId)) {
        event.target.select();
      }
      const rect = containerRef.current?.getBoundingClientRect();
      const originalEvent = event.originalEvent as MouseEvent | undefined;
      if (!rect || !originalEvent) {
        return;
      }
      originalEvent.preventDefault();
      setContextMenu({
        x: originalEvent.clientX - rect.left,
        y: originalEvent.clientY - rect.top,
        kind: 'node',
        targetId: nodeId
      });
    });

    cyRef.current.on('cxttap', 'edge', (event) => {
      const edgeId = event.target.id();
      if (!edgeSelectionRef.current.includes(edgeId)) {
        event.target.select();
      }
      const rect = containerRef.current?.getBoundingClientRect();
      const originalEvent = event.originalEvent as MouseEvent | undefined;
      if (!rect || !originalEvent) {
        return;
      }
      originalEvent.preventDefault();
      setContextMenu({
        x: originalEvent.clientX - rect.left,
        y: originalEvent.clientY - rect.top,
        kind: 'edge',
        targetId: edgeId
      });
    });

    cyRef.current.on('cxttap', (event) => {
      if (event.target !== cyRef.current) {
        return;
      }
      const rect = containerRef.current?.getBoundingClientRect();
      const originalEvent = event.originalEvent as MouseEvent | undefined;
      if (!rect || !originalEvent) {
        return;
      }
      originalEvent.preventDefault();
      setContextMenu({
        x: originalEvent.clientX - rect.left,
        y: originalEvent.clientY - rect.top,
        kind: 'canvas'
      });
    });

    return () => {
      cyRef.current?.destroy();
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) {
      return;
    }

    const elements = buildElements(graph);
    cy.elements().remove();
    cy.add(elements);

    cy.nodes().forEach((node) => {
      const source = graph.nodes.find((item) => item.id === node.id());
      if (source?.position) {
        node.position(source.position);
      }
    });

    if (!graph.nodes.every((node) => node.position)) {
      cy.layout(buildLayoutOptions(layoutSettings)).run();
    }
  }, [graph, layoutSettings]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) {
      return;
    }
    cy.style().fromJson(styles).update();
  }, [styles]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) {
      return;
    }
    cy.nodes().unselect();
    selectedNodeIds.forEach((id) => {
      cy.$id(id).select();
    });
    selectionRef.current = [...selectedNodeIds];
  }, [selectedNodeIds]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) {
      return;
    }
    cy.edges().unselect();
    selectedEdgeIds.forEach((id) => {
      cy.$id(id).select();
    });
    edgeSelectionRef.current = [...selectedEdgeIds];
  }, [selectedEdgeIds]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) {
      return;
    }
    cy.nodes().removeClass('search-hit search-dim');
    cy.edges().removeClass('search-hit search-dim');

    if (!searchQuery.trim()) {
      return;
    }

    const hitIds = new Set(searchResults.map((item) => item.id));
    cy.nodes().forEach((node) => {
      if (hitIds.has(node.id())) {
        node.addClass('search-hit');
      } else {
        node.addClass('search-dim');
      }
    });

    cy.edges().forEach((edge) => {
      if (hitIds.has(edge.id())) {
        edge.addClass('search-hit');
      } else {
        edge.addClass('search-dim');
      }
    });
  }, [searchQuery, searchResults]);

  const focusOnElement = (result?: SearchResult): void => {
    const cy = cyRef.current;
    if (!cy || !result) {
      return;
    }
    const element = cy.$id(result.id);
    if (element.empty()) {
      return;
    }
    cy.nodes().unselect();
    cy.edges().unselect();
    element.select();

    cy.animate({
      fit: { eles: element, padding: 80 },
      duration: 280,
      easing: 'ease-in-out'
    });
  };

  useEffect(() => {
    focusOnElement(searchResults[searchIndex]);
  }, [searchIndex, searchResults]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      const selected = selectionRef.current;
      const selectedEdges = edgeSelectionRef.current;
      const isCtrl = event.ctrlKey || event.metaKey;
      const target = event.target as HTMLElement | null;
      const isInput =
        target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;

      if (isInput && !(isCtrl && event.key.toLowerCase() === 'f')) {
        return;
      }

      if (isCtrl && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && (selected.length || selectedEdges.length)) {
        event.preventDefault();
        deleteEdges([...selectedEdges]);
        deleteNodes([...selected]);
        return;
      }

      if (isCtrl && !event.shiftKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undo();
        return;
      }

      if (isCtrl && event.shiftKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        redo();
        return;
      }

      if (isCtrl && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        copySelection();
        return;
      }

      if (isCtrl && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        pasteClipboard();
        return;
      }

      if (isCtrl && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicateSelection();
        return;
      }

      if (isCtrl && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        layoutRunnerRef.current();
        return;
      }

      if (event.key.toLowerCase() === 'c' && selected.length === 2) {
        event.preventDefault();
        onConnectNodes({ sourceId: selected[0], targetId: selected[1] });
        return;
      }

      if (event.key.toLowerCase() === 'a') {
        event.preventDefault();
        const nextIndex = graph.nodes.length + 1;
        onAddNode({ label: `Узел ${nextIndex}`, nodeType: 'Function' });
      }
    };

    element.addEventListener('keydown', handleKeyDown);
    return () => element.removeEventListener('keydown', handleKeyDown);
  }, [graph.nodes.length, onAddNode, onConnectNodes, deleteEdges, deleteNodes, copySelection, pasteClipboard, duplicateSelection, undo, redo]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) {
      return;
    }
    const runLayout = (): void => {
      const layout = cy.layout(buildLayoutOptions(layoutSettings));
      layout.run();
      layout.once('layoutstop', () => {
        const positions: Record<string, { x: number; y: number }> = {};
        cy.nodes().forEach((node) => {
          const pos = node.position();
          positions[node.id()] = { x: pos.x, y: pos.y };
        });
        const currentGraph = graphStore.getState().graph;
        const updatedGraph: GraphState = {
          ...currentGraph,
          nodes: currentGraph.nodes.map((node) => ({
            ...node,
            position: positions[node.id] ?? node.position
          })),
          dirty: true,
          updatedAt: new Date().toISOString()
        };
        graphStore.getState().setGraph(updatedGraph, { origin: 'local' });
      });
    };
    layoutRunnerRef.current = runLayout;
    onLayoutReady?.(runLayout);
  }, [graphStore, layoutSettings, onLayoutReady]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }
    const close = (): void => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  const handleDeleteContext = (): void => {
    if (!contextMenu) {
      return;
    }
    if (contextMenu.kind === 'node' && contextMenu.targetId) {
      deleteNodes([contextMenu.targetId]);
      setContextMenu(null);
      return;
    }
    if (contextMenu.kind === 'edge' && contextMenu.targetId) {
      deleteEdges([contextMenu.targetId]);
      setContextMenu(null);
    }
  };

  const handleCopyContext = (): void => {
    copySelection();
    setContextMenu(null);
  };

  const handleDuplicateContext = (): void => {
    duplicateSelection();
    setContextMenu(null);
  };

  const handlePasteContext = (): void => {
    pasteClipboard();
    setContextMenu(null);
  };

  const renderSearchItem = (item: SearchResult, index: number): React.ReactNode => {
    const isActive = index === searchIndex;
    return (
      <li
        key={`${item.kind}-${item.id}`}
        className={`graph-search__item${isActive ? ' graph-search__item--active' : ''}`}
        onClick={() => setSearchIndex(index)}
        style={{
          padding: '8px 10px',
          borderRadius: 6,
          border: isActive ? `1px solid ${theme.edges.activeGlow}` : `1px solid ${theme.canvas.stroke}`,
          backgroundColor: isActive ? theme.canvas.background : 'transparent',
          cursor: 'pointer',
          display: 'grid',
          gap: 4
        }}
      >
        <div className="graph-search__item-title">{item.label}</div>
        <div className="graph-search__item-meta">
          {translate(item.kind === 'node' ? 'search.type.node' : 'search.type.edge', item.kind)} · {item.meta}
        </div>
      </li>
    );
  };

  const renderSearchPanel = (): React.ReactNode => {
    const hasResults = Boolean(searchResults.length);

    const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (event.shiftKey) {
          selectPreviousSearchResult();
          return;
        }
        selectNextSearchResult();
        return;
      }
      if (event.key === 'Escape') {
        setSearchQuery('');
      }
    };

    const clearSearch = (): void => setSearchQuery('');

    return (
      <div
        className="graph-search"
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 5,
          width: 320,
          padding: 10,
          border: `1px solid ${theme.canvas.stroke}`,
          borderRadius: 10,
          backgroundColor: theme.canvas.surface,
          boxShadow: '0 8px 20px rgba(0, 0, 0, 0.25)',
          color: theme.nodes.textColor
        }}
      >
        <div className="graph-search__controls" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={translate('search.placeholder', 'Поиск по узлам и связям')}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 6,
                border: `1px solid ${theme.canvas.stroke}`,
                backgroundColor: theme.canvas.background,
                color: theme.nodes.textColor
              }}
            />
            <button
              type="button"
              onClick={clearSearch}
              disabled={!searchQuery}
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                border: `1px solid ${theme.canvas.stroke}`,
                backgroundColor: theme.canvas.background,
                color: theme.nodes.textColor,
                cursor: searchQuery ? 'pointer' : 'not-allowed'
              }}
            >
              {translate('search.clear', 'Очистить')}
            </button>
          </div>
          <div
            className="graph-search__nav"
            style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}
          >
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={selectPreviousSearchResult} disabled={!hasResults}>
                {translate('search.prev', 'Назад')}
              </button>
              <button type="button" onClick={selectNextSearchResult} disabled={!hasResults}>
                {translate('search.next', 'Вперёд')}
              </button>
            </div>
            <span className="graph-search__counter" style={{ fontSize: 12, opacity: 0.8 }}>
              {hasResults
                ? `${searchIndex + 1}/${searchResults.length}`
                : translate('search.noResults', 'Нет совпадений')}
            </span>
          </div>
        </div>
        <div className="graph-search__hint" style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
          {translate('search.hint', 'Ctrl+F — фокус на поиске')}
        </div>
        <div className="graph-search__results-title" style={{ marginTop: 10, fontWeight: 600 }}>
          {translate('search.results', 'Совпадения: {count}', { count: String(searchResults.length) })}
        </div>
        <ul
          className="graph-search__results"
          style={{
            listStyle: 'none',
            padding: 0,
            margin: '8px 0 0',
            maxHeight: 220,
            overflowY: 'auto',
            gap: 4,
            display: 'grid'
          }}
        >
          {hasResults ? searchResults.map(renderSearchItem) : null}
        </ul>
      </div>
    );
  };

  const renderContextMenu = (): React.ReactNode => {
    if (!contextMenu) {
      return null;
    }
    const items: Array<{ label: string; action: () => void; hidden?: boolean }> = [
      { label: 'Копировать', action: handleCopyContext, hidden: contextMenu.kind === 'canvas' },
      { label: 'Дублировать', action: handleDuplicateContext, hidden: contextMenu.kind === 'canvas' },
      { label: 'Вставить', action: handlePasteContext, hidden: !hasClipboard },
      { label: 'Удалить', action: handleDeleteContext, hidden: contextMenu.kind === 'canvas' }
    ];
    return (
      <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
        {items
          .filter((item) => !item.hidden)
          .map((item) => (
            <button key={item.label} type="button" onClick={item.action} className="context-menu__item">
              {item.label}
            </button>
          ))}
      </div>
    );
  };

  return (
    <div
      className="graph-canvas"
      ref={containerRef}
      style={{
        backgroundColor: theme.canvas.background,
        backgroundImage: theme.canvas.accents,
        borderColor: theme.canvas.stroke,
        borderStyle: 'solid',
        borderWidth: 1,
        position: 'relative'
      }}
      tabIndex={0}
    >
      {renderSearchPanel()}
      {renderContextMenu()}
    </div>
  );
};
