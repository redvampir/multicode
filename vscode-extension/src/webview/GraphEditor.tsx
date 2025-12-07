import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import cytoscape, { type Core, type ElementDefinition, type LayoutOptions } from 'cytoscape';
import dagre from 'cytoscape-dagre';
import klay from 'cytoscape-klay';
import type { GraphNodeType, GraphState } from '../shared/graphState';
import type { ValidationIssue, ValidationResult } from '../shared/validator';
import { getTranslation, type TranslationKey } from '../shared/translations';
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

type MiniMapState = {
  src: string;
  bbox: cytoscape.BoundingBox12 | null;
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
  },
  {
    selector: 'node.validation-error',
    style: {
      'border-color': tokens.ui.toastError,
      'background-color': tokens.ui.toastError,
      'background-opacity': 0.22,
      'box-shadow': `0 0 18px ${tokens.ui.toastError}`
    } as cytoscape.Css.Node
  },
  {
    selector: 'node.validation-warning',
    style: {
      'border-color': tokens.ui.toastWarning,
      'background-color': tokens.ui.toastWarning,
      'background-opacity': 0.15,
      'box-shadow': `0 0 14px ${tokens.ui.toastWarning}`
    } as cytoscape.Css.Node
  },
  {
    selector: 'edge.validation-error',
    style: {
      'line-color': tokens.ui.toastError,
      'target-arrow-color': tokens.ui.toastError,
      width: tokens.edges.width * tokens.geometry.arrowThickness + 1.5
    } as cytoscape.Css.Edge
  },
  {
    selector: 'edge.validation-warning',
    style: {
      'line-color': tokens.ui.toastWarning,
      'target-arrow-color': tokens.ui.toastWarning,
      width: tokens.edges.width * tokens.geometry.arrowThickness + 1
    } as cytoscape.Css.Edge
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
  validation?: ValidationResult;
  onAddNode: (payload: { label?: string; nodeType?: GraphNodeType }) => void;
  onConnectNodes: (payload: { sourceId?: string; targetId?: string }) => void;
  onLayoutReady?: (runner: () => void) => void;
}> = ({ graphStore, theme, validation, onAddNode, onConnectNodes, onLayoutReady }) => {
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
  const setSelection = graphStore((state) => state.setSelection);
  const updateNodePosition = graphStore((state) => state.updateNodePosition);
  const deleteNodes = graphStore((state) => state.deleteNodes);
  const deleteEdges = graphStore((state) => state.deleteEdges);
  const undo = graphStore((state) => state.undo);
  const redo = graphStore((state) => state.redo);
  const copySelection = graphStore((state) => state.copySelection);
  const pasteClipboard = graphStore((state) => state.pasteClipboard);
  const duplicateSelection = graphStore((state) => state.duplicateSelection);
  const applyLayout = graphStore((state) => state.applyLayout);
  const setSearchQuery = graphStore((state) => state.setSearchQuery);
  const setSearchIndex = graphStore((state) => state.setSearchIndex);
  const selectNextSearchResult = graphStore((state) => state.selectNextSearchResult);
  const selectPreviousSearchResult = graphStore((state) => state.selectPreviousSearchResult);
  const styles = useMemo(() => buildStyles(theme), [theme]);
  const selectionRef = useRef<string[]>([]);
  const edgeSelectionRef = useRef<string[]>([]);
  const layoutRunnerRef = useRef<() => void>(() => {});
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [paletteAnchor, setPaletteAnchor] = useState<{ x: number; y: number } | null>(null);
  const [selectionBox, setSelectionBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [miniMap, setMiniMap] = useState<MiniMapState>({ src: '', bbox: null });
  const miniMapRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const translate = useMemo(
    () =>
      (key: string, fallback: string, replacements?: Record<string, string>) =>
        getTranslation(graph.displayLanguage, key as never, replacements, fallback),
    [graph.displayLanguage]
  );

  const resetSelection = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) {
      return;
    }
    cy.elements().unselect();
    cy.edges().removeClass('edge--active');
    setSelection({ nodeIds: [], edgeIds: [] });
    selectionRef.current = [];
    edgeSelectionRef.current = [];
  }, [setSelection]);

  const closePalette = (): void => setPaletteAnchor(null);
  const openPaletteAt = (point?: { x: number; y: number }): void => {
    const fallbackPoint = { x: (containerRef.current?.clientWidth ?? 400) / 2, y: 120 };
    setPaletteAnchor(point ?? fallbackPoint);
    setContextMenu(null);
  };

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    let rightPanStart: { x: number; y: number } | null = null;
    let rightPanOffset: { x: number; y: number } | null = null;
    const cy = cytoscape({
      container: containerRef.current,
      elements: buildElements(graph),
      style: styles,
      layout: buildLayoutOptions(layoutSettings),
      wheelSensitivity: 0.15,
      minZoom: 0.2,
      maxZoom: 2,
      autoungrabify: false,
      boxSelectionEnabled: false,
      motionBlur: true,
      panningEnabled: true,
      userPanningEnabled: true
    });

    cyRef.current = cy;

    const toLocalPoint = (clientX: number, clientY: number): { x: number; y: number } | null => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        return null;
      }
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const commitSelection = (): void => {
      const nodeSelection = cy.nodes(':selected').map((node) => node.id());
      const edgeSelection = cy.edges(':selected').map((edge) => edge.id());
      setSelection({ nodeIds: nodeSelection, edgeIds: edgeSelection });
      selectionRef.current = nodeSelection;
      edgeSelectionRef.current = edgeSelection;
    };

    const clearSelection = (): void => {
      cy.batch(() => {
        cy.elements().unselect();
        cy.edges().removeClass('edge--active');
      });
      commitSelection();
    };

    cy.on('dragfree', 'node', (event) => {
      const position = event.target.position();
      updateNodePosition(event.target.id(), { x: position.x, y: position.y });
    });

    cy.on('tap', 'node', (event) => {
      const originalEvent = event.originalEvent as MouseEvent | undefined;
      const isShift = Boolean(originalEvent?.shiftKey);
      const wasSelected = event.target.selected();
      cy.batch(() => {
        if (isShift) {
          if (wasSelected) {
            event.target.unselect();
          } else {
            event.target.select();
          }
        } else {
          cy.elements().unselect();
          event.target.select();
        }
      });
      cy.edges().removeClass('edge--active');
      cy.edges(':selected').addClass('edge--active');
      commitSelection();
    });

    cy.on('tap', 'edge', (event) => {
      const originalEvent = event.originalEvent as MouseEvent | undefined;
      const isShift = Boolean(originalEvent?.shiftKey);
      const wasSelected = event.target.selected();
      cy.batch(() => {
        if (isShift) {
          if (wasSelected) {
            event.target.unselect();
          } else {
            event.target.select();
          }
        } else {
          cy.elements().unselect();
          event.target.select();
        }
      });
      cy.edges().removeClass('edge--active');
      cy.edges(':selected').addClass('edge--active');
      commitSelection();
    });

    cy.on('tap', (event) => {
      const originalEvent = event.originalEvent as MouseEvent | undefined;
      const isShift = Boolean(originalEvent?.shiftKey);
      if (event.target === cy && !isShift) {
        clearSelection();
        if (originalEvent && originalEvent.detail >= 2) {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            openPaletteAt({ x: originalEvent.clientX - rect.left, y: originalEvent.clientY - rect.top });
          }
        }
      }
    });

    cy.on('mouseover', 'edge', (event) => {
      event.target.addClass('edge--active');
    });

    cy.on('mouseout', 'edge', (event) => {
      if (!event.target.selected()) {
        event.target.removeClass('edge--active');
      }
    });

    cy.on('tapstart', (event) => {
      const originalEvent = event.originalEvent as MouseEvent | undefined;
      if (event.target !== cy || !originalEvent?.shiftKey) {
        return;
      }
      const start = toLocalPoint(originalEvent.clientX, originalEvent.clientY);
      if (!start) {
        return;
      }
      dragStartRef.current = start;
      setSelectionBox({ x: start.x, y: start.y, width: 0, height: 0 });
    });

    cy.on('tapdrag', (event) => {
      if (!dragStartRef.current) {
        return;
      }
      const originalEvent = event.originalEvent as MouseEvent | undefined;
      if (!originalEvent) {
        return;
      }
      const current = toLocalPoint(originalEvent.clientX, originalEvent.clientY);
      if (!current) {
        return;
      }
      const start = dragStartRef.current;
      const x = Math.min(start.x, current.x);
      const y = Math.min(start.y, current.y);
      setSelectionBox({ x, y, width: Math.abs(current.x - start.x), height: Math.abs(current.y - start.y) });
    });

    cy.on('tapend', (event) => {
      if (!dragStartRef.current) {
        return;
      }
      const originalEvent = event.originalEvent as MouseEvent | undefined;
      if (!originalEvent) {
        dragStartRef.current = null;
        setSelectionBox(null);
        return;
      }
      const endPoint = toLocalPoint(originalEvent.clientX, originalEvent.clientY);
      const start = dragStartRef.current;
      dragStartRef.current = null;
      setSelectionBox(null);
      if (!endPoint) {
        return;
      }
      const box = {
        x1: Math.min(start.x, endPoint.x),
        x2: Math.max(start.x, endPoint.x),
        y1: Math.min(start.y, endPoint.y),
        y2: Math.max(start.y, endPoint.y)
      };
      cy.batch(() => {
        const nodesInBox = cy.nodes().filter((node) => {
          const bounds = node.renderedBoundingBox({ includeLabels: true, includeOverlays: false });
          return bounds.x2 >= box.x1 && bounds.x1 <= box.x2 && bounds.y2 >= box.y1 && bounds.y1 <= box.y2;
        });
        const shouldReset = !originalEvent.shiftKey;
        if (shouldReset) {
          cy.elements().unselect();
        }
        nodesInBox.select();
        const edgesToSelect = cy.edges().filter((edge) =>
          edge
            .connectedNodes()
            .every((node) => (node as cytoscape.SingularElementReturnValue).selected())
        );
        edgesToSelect.select();
        cy.edges().removeClass('edge--active');
        cy.edges(':selected').addClass('edge--active');
      });
      commitSelection();
    });

    const openContextMenu = (x: number, y: number, kind: ContextMenuKind, targetId?: string): void => {
      setContextMenu({ x, y, kind, targetId });
    };

    cy.on('cxttap', 'node', (event) => {
      const originalEvent = event.originalEvent as MouseEvent | undefined;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!originalEvent || !rect) {
        return;
      }
      const nodeId = event.target.id();
      cy.batch(() => {
        if (!selectionRef.current.includes(nodeId)) {
          cy.elements().unselect();
          event.target.select();
          cy.edges().removeClass('edge--active');
          cy.edges(':selected').addClass('edge--active');
        }
      });
      commitSelection();
      originalEvent.preventDefault();
      openContextMenu(originalEvent.clientX - rect.left, originalEvent.clientY - rect.top, 'node', nodeId);
    });

    cy.on('cxttap', 'edge', (event) => {
      const originalEvent = event.originalEvent as MouseEvent | undefined;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!originalEvent || !rect) {
        return;
      }
      const edgeId = event.target.id();
      cy.batch(() => {
        if (!edgeSelectionRef.current.includes(edgeId)) {
          cy.elements().unselect();
          event.target.select();
        }
      });
      cy.edges().removeClass('edge--active');
      cy.edges(':selected').addClass('edge--active');
      commitSelection();
      originalEvent.preventDefault();
      openContextMenu(originalEvent.clientX - rect.left, originalEvent.clientY - rect.top, 'edge', edgeId);
    });

    cy.on('cxttap', (event) => {
      if (event.target !== cy) {
        return;
      }
      const originalEvent = event.originalEvent as MouseEvent | undefined;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!originalEvent || !rect) {
        return;
      }
      originalEvent.preventDefault();
      openContextMenu(originalEvent.clientX - rect.left, originalEvent.clientY - rect.top, 'canvas');
    });

    cy.on('mousedown', (event) => {
      const mouse = event.originalEvent as MouseEvent | undefined;
      if (event.target === cy && mouse?.button === 2) {
        rightPanStart = { x: mouse.clientX, y: mouse.clientY };
        rightPanOffset = cy.pan();
        mouse.preventDefault();
      }
    });

    cy.on('mouseup', (event) => {
      const mouse = event.originalEvent as MouseEvent | undefined;
      if (mouse?.button === 2) {
        rightPanStart = null;
        rightPanOffset = null;
      }
    });

    cy.on('mousemove', (event) => {
      if (!rightPanStart || !rightPanOffset) {
        return;
      }
      const mouse = event.originalEvent as MouseEvent | undefined;
      if (!mouse) {
        return;
      }
      const dx = mouse.clientX - rightPanStart.x;
      const dy = mouse.clientY - rightPanStart.y;
      cy.pan({ x: rightPanOffset.x + dx, y: rightPanOffset.y + dy });
    });

    const updateMiniMap = (): void => {
      const bbox = cy.elements().boundingBox();
      const snapshot = cy.png({ scale: 0.15, full: true, bg: theme.canvas.background });
      setMiniMap({ src: snapshot, bbox });
    };

    updateMiniMap();
    cy.on('render zoom pan add remove position', updateMiniMap);

    return () => {
      cy.off('render zoom pan add remove position', updateMiniMap);
      cy.destroy();
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
    cy.edges().removeClass('edge--active');
    cy.edges(':selected').addClass('edge--active');
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

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) {
      return;
    }

    cy.nodes().removeClass('validation-error validation-warning');
    cy.edges().removeClass('validation-error validation-warning');

    const issues: ValidationIssue[] = validation
      ? validation.issues ?? [
          ...validation.errors.map((message) => ({
            severity: 'error' as const,
            message,
            nodes: undefined,
            edges: undefined
          })),
          ...validation.warnings.map((message) => ({
            severity: 'warning' as const,
            message,
            nodes: undefined,
            edges: undefined
          }))
        ]
      : [];
    if (!issues.length) {
      return;
    }

    issues.forEach((issue) => {
      const className = issue.severity === 'error' ? 'validation-error' : 'validation-warning';
      issue.nodes?.forEach((nodeId: string) => {
        const node = cy.$id(nodeId);
        if (node) {
          node.addClass(className);
        }
      });
      issue.edges?.forEach((edgeId: string) => {
        const edge = cy.$id(edgeId);
        if (edge) {
          edge.addClass(className);
        }
      });
    });
  }, [validation]);

  const focusOnElement = useCallback(
    (result?: SearchResult): void => {
      const cy = cyRef.current;
      if (!cy || !result) {
        return;
      }
      const element = cy.$id(result.id).first();
      if (!element || element.empty()) {
        return;
      }
      cy.nodes().unselect();
      cy.edges().unselect();
      element.select();
      if (element.isNode()) {
        setSelection({ nodeIds: [element.id()], edgeIds: [] });
        selectionRef.current = [element.id()];
        edgeSelectionRef.current = [];
      } else {
        setSelection({ nodeIds: [], edgeIds: [element.id()] });
        selectionRef.current = [];
        edgeSelectionRef.current = [element.id()];
      }

      cy.animate({
        fit: { eles: element, padding: 80 },
        duration: 280,
        easing: 'ease-in-out'
      });
    },
    [setSelection]
  );

  useEffect(() => {
    focusOnElement(searchResults[searchIndex]);
  }, [focusOnElement, searchIndex, searchResults]);

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

      if (event.key === 'Escape') {
        event.preventDefault();
        // Закрываем модальные окна сначала
        if (paletteAnchor) {
          closePalette();
          return;
        }
        if (contextMenu) {
          setContextMenu(null);
          return;
        }
        // Затем сбрасываем выделение
        resetSelection();
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
        openPaletteAt();
      }
    };

    element.addEventListener('keydown', handleKeyDown);
    return () => element.removeEventListener('keydown', handleKeyDown);
  }, [
    graph.nodes.length,
    onAddNode,
    onConnectNodes,
    deleteEdges,
    deleteNodes,
    copySelection,
    pasteClipboard,
    duplicateSelection,
    undo,
    redo,
    resetSelection
  ]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) {
      return;
    }
    const runLayout = (): void => {
      const layout = cy.layout(buildLayoutOptions(layoutSettings));
      layout.run();
      layout.one('layoutstop', () => {
        const positions: Record<string, { x: number; y: number }> = {};
        cy.nodes().forEach((node) => {
          const pos = node.position();
          positions[node.id()] = { x: pos.x, y: pos.y };
        });
        graphStore.getState().applyLayout(positions);
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

  useEffect(() => {
    if (!paletteAnchor) {
      return;
    }
    const close = (): void => setPaletteAnchor(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [paletteAnchor]);

  const applyPositions = useCallback(
    (positions: Record<string, { x: number; y: number }>) => {
      applyLayout(positions);
    },
    [applyLayout]
  );

  const handleAlignToGrid = (): void => {
    const cy = cyRef.current;
    if (!cy) {
      return;
    }
    const grid = 20;
    const positions: Record<string, { x: number; y: number }> = {};
    selectionRef.current.forEach((id) => {
      const node = cy.$id(id);
      if (!node.isNode()) {
        return;
      }
      const position = node.position();
      positions[id] = {
        x: Math.round(position.x / grid) * grid,
        y: Math.round(position.y / grid) * grid
      };
    });
    if (!Object.keys(positions).length) {
      return;
    }
    applyPositions(positions);
  };

  const handleGroupSelection = (): void => {
    const cy = cyRef.current;
    if (!cy) {
      return;
    }
    const nodes = selectionRef.current
      .map((id) => cy.$id(id))
      .filter((node) => node.isNode());
    if (nodes.length < 2) {
      return;
    }
    const center = nodes.reduce(
      (acc, node) => {
        const pos = node.position();
        return { x: acc.x + pos.x, y: acc.y + pos.y };
      },
      { x: 0, y: 0 }
    );
    const centerX = center.x / nodes.length;
    const centerY = center.y / nodes.length;
    const columns = Math.ceil(Math.sqrt(nodes.length));
    const rows = Math.ceil(nodes.length / columns);
    const spacing = 140;
    const positions: Record<string, { x: number; y: number }> = {};
    nodes.forEach((node, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const offsetX = (col - (columns - 1) / 2) * spacing;
      const offsetY = (row - (rows - 1) / 2) * spacing;
      positions[node.id()] = { x: centerX + offsetX, y: centerY + offsetY };
    });
    applyPositions(positions);
  };

  const handleDeleteContext = (): void => {
    if (!contextMenu) {
      return;
    }
    if (contextMenu.kind === 'node' && contextMenu.targetId) {
      const selection = selectionRef.current.includes(contextMenu.targetId)
        ? selectionRef.current
        : [contextMenu.targetId];
      deleteEdges([...edgeSelectionRef.current]);
      deleteNodes([...selection]);
      setContextMenu(null);
      return;
    }
    if (contextMenu.kind === 'edge' && contextMenu.targetId) {
      const edgeIds = edgeSelectionRef.current.includes(contextMenu.targetId)
        ? edgeSelectionRef.current
        : [contextMenu.targetId];
      deleteEdges([...edgeIds]);
      setContextMenu(null);
      return;
    }
    if (contextMenu.kind === 'canvas') {
      deleteEdges([...edgeSelectionRef.current]);
      deleteNodes([...selectionRef.current]);
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
        role="search"
        aria-label={translate('search.label', 'Поиск по графу')}
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 5,
          width: 320,
          padding: 10,
          border: `1px solid ${theme.canvas.stroke}`,
          borderRadius: 10,
          backgroundColor: theme.ui.surface,
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
              aria-label={translate('search.input', 'Введите запрос')}
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
              aria-label={translate('search.clear', 'Очистить')}
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
              <button
                type="button"
                onClick={selectPreviousSearchResult}
                disabled={!hasResults}
                aria-label={translate('search.prev', 'Назад')}
              >
                {translate('search.prev', 'Назад')}
              </button>
              <button
                type="button"
                onClick={selectNextSearchResult}
                disabled={!hasResults}
                aria-label={translate('search.next', 'Вперёд')}
              >
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

  const renderPalette = (): React.ReactNode => {
    if (!paletteAnchor) {
      return null;
    }
    const items: Array<{ key: string; translationKey: TranslationKey; type: GraphNodeType }> = [
      { key: 'function', translationKey: 'palette.node.function', type: 'Function' },
      { key: 'branch', translationKey: 'palette.node.branch', type: 'Custom' },
      { key: 'switch', translationKey: 'palette.node.switch', type: 'Custom' },
      { key: 'sequence', translationKey: 'palette.node.sequence', type: 'Custom' },
      { key: 'variable', translationKey: 'palette.node.variable', type: 'Variable' },
      { key: 'comment', translationKey: 'palette.node.comment', type: 'Custom' }
    ];

    const handlePick = (entry: (typeof items)[number]): void => {
      const label = translate(entry.translationKey, '');
      onAddNode({ label, nodeType: entry.type });
      closePalette();
    };

    const handlePaletteKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
      const target = event.target as HTMLElement;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        const next = target.nextElementSibling as HTMLButtonElement | null;
        next?.focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        const prev = target.previousElementSibling as HTMLButtonElement | null;
        prev?.focus();
      }
    };

    return (
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label={translate('palette.title', 'Быстрое добавление')}
        onKeyDown={handlePaletteKeyDown}
        style={{
          position: 'absolute',
          left: paletteAnchor.x,
          top: paletteAnchor.y,
          transform: 'translate(-10px, 10px)',
          backgroundColor: theme.ui.surface,
          border: `1px solid ${theme.canvas.stroke}`,
          boxShadow: theme.ui.shadow,
          padding: 8,
          borderRadius: 10,
          display: 'grid',
          gap: 6,
          zIndex: 6,
          minWidth: 220
        }}
      >
        <div style={{ fontWeight: 700, color: theme.ui.panelTitle }}>
          {translate('palette.title', 'Быстрое добавление')} {translate('palette.hint', '(A / двойной клик)')}
        </div>
        {items.map((item, index) => (
          <button
            key={item.key}
            type="button"
            className="palette__item"
            onClick={() => handlePick(item)}
            autoFocus={index === 0}
            style={{
              textAlign: 'left',
              padding: '8px 10px',
              borderRadius: 8,
              border: `1px solid ${theme.canvas.stroke}`,
              background: theme.canvas.background,
              color: theme.nodes.textColor
            }}
          >
            {translate(item.translationKey, '')}
          </button>
        ))}
        <button
          type="button"
          onClick={closePalette}
          style={{
            padding: '6px 10px',
            borderRadius: 8,
            border: `1px solid ${theme.canvas.stroke}`,
            background: theme.ui.surfaceStrong ?? theme.ui.surface,
            color: theme.nodes.textColor
          }}
        >
          {translate('palette.close', 'Закрыть')}
        </button>
      </div>
    );
  };

  const renderContextMenu = (): React.ReactNode => {
    if (!contextMenu) {
      return null;
    }
    const selectionSize = selectedNodeIds.length + selectedEdgeIds.length;
    const hasSelection = selectionSize > 0;
    const hasGroupSelection = selectionSize > 1;
    const items: Array<{
      key: string;
      label: string;
      action: () => void;
      hidden?: boolean;
      disabled?: boolean;
    }> = [
      {
        key: 'copy',
        label: translate('context.copy', 'Копировать'),
        action: handleCopyContext,
        hidden: !hasSelection
      },
      {
        key: 'duplicate',
        label: translate('context.duplicate', 'Дублировать'),
        action: handleDuplicateContext,
        hidden: !hasSelection
      },
      {
        key: 'paste',
        label: translate('context.paste', 'Вставить'),
        action: handlePasteContext,
        hidden: !hasClipboard,
        disabled: !hasClipboard
      },
      {
        key: 'group',
        label: translate('context.group', 'Сгруппировать'),
        action: handleGroupSelection,
        hidden: !hasGroupSelection,
        disabled: !hasGroupSelection
      },
      {
        key: 'align',
        label: translate('context.alignGrid', 'Выровнять по сетке'),
        action: handleAlignToGrid,
        hidden: !hasSelection,
        disabled: !hasSelection
      },
      {
        key: 'delete',
        label: translate('context.delete', 'Удалить'),
        action: handleDeleteContext,
        hidden: contextMenu.kind === 'canvas' && !hasSelection,
        disabled: contextMenu.kind === 'canvas' && !hasSelection
      }
    ];

    const handleContextMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
      const target = event.target as HTMLElement;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        const next = target.nextElementSibling as HTMLButtonElement | null;
        next?.focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        const prev = target.previousElementSibling as HTMLButtonElement | null;
        prev?.focus();
      }
    };

    return (
      <div
        className="context-menu"
        role="menu"
        aria-label={translate('context.menu', 'Контекстное меню')}
        onKeyDown={handleContextMenuKeyDown}
        style={{ left: contextMenu.x, top: contextMenu.y }}
      >
        {items
          .filter((item) => !item.hidden)
          .map((item, index) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              onClick={item.action}
              className="context-menu__item"
              disabled={item.disabled}
              aria-label={item.label}
              autoFocus={index === 0}
            >
              {item.label}
            </button>
          ))}
      </div>
    );
  };

  const renderMiniMap = (): React.ReactNode => {
    if (!miniMap.src) {
      return null;
    }
    return (
      <div
        ref={miniMapRef}
        className="minimap"
        style={{
          position: 'absolute',
          right: 12,
          top: 12,
          width: 180,
          height: 120,
          border: `1px solid ${theme.canvas.stroke}`,
          borderRadius: 8,
          overflow: 'hidden',
          background: theme.ui.surface,
          boxShadow: theme.ui.shadow,
          zIndex: 3,
          cursor: 'pointer'
        }}
        onClick={(event) => {
          const cy = cyRef.current;
          if (!cy || !miniMap.bbox || !miniMapRef.current) {
            return;
          }
          const rect = miniMapRef.current.getBoundingClientRect();
          const relX = (event.clientX - rect.left) / rect.width;
          const relY = (event.clientY - rect.top) / rect.height;
          const bbox = miniMap.bbox;
          const targetX = bbox.x1 + relX * (bbox.x2 - bbox.x1 || 1);
          const targetY = bbox.y1 + relY * (bbox.y2 - bbox.y1 || 1);
          const zoom = cy.zoom();
          const container = cy.container();
          if (!container) {
            return;
          }
          cy.pan({
            x: -targetX * zoom + container.clientWidth / 2,
            y: -targetY * zoom + container.clientHeight / 2
          });
        }}
      >
        <img src={miniMap.src} alt={translate('minimap.alt', 'Миникарта')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  };

  return (
    <div
      className="graph-shell"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 520,
        pointerEvents: 'none'
      }}
      tabIndex={0}
    >
      <div
        className="graph-canvas"
        ref={containerRef}
        role="application"
        aria-label={translate('canvas.label', 'Редактор графов')}
        style={{
          backgroundColor: theme.canvas.background,
          backgroundImage: theme.canvas.accents,
          borderColor: theme.canvas.stroke,
          borderStyle: 'solid',
          borderWidth: 1,
          width: '100%',
          height: '100%',
          pointerEvents: 'auto'
        }}
      />
      {selectionBox ? (
        <div
          className="graph-canvas__selection"
          style={{
            position: 'absolute',
            left: selectionBox.x,
            top: selectionBox.y,
            width: selectionBox.width,
            height: selectionBox.height,
            border: `1px dashed ${theme.edges.activeGlow}`,
            backgroundColor: `${theme.canvas.stroke}33`,
            pointerEvents: 'none',
            zIndex: 4
          }}
        />
      ) : null}
      {renderMiniMap()}
      {renderPalette()}
      {renderSearchPanel()}
      {renderContextMenu()}
    </div>
  );
};
