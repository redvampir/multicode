import React, { useEffect, useMemo, useRef } from 'react';
import cytoscape, { type Core, type ElementDefinition, type LayoutOptions } from 'cytoscape';
import dagre from 'cytoscape-dagre';
import type { GraphNodeType, GraphState } from '../shared/graphState';
import type { GraphStoreHook } from './store';
import type { ThemeTokens } from './theme';

cytoscape.use(dagre);

type Stylesheet = cytoscape.StylesheetStyle;
type DagreLayoutOptions = LayoutOptions & { rankDir?: 'LR' | 'TB' | 'BT' | 'RL'; padding?: number };

const defaultLayout: DagreLayoutOptions = { name: 'dagre', rankDir: 'LR', padding: 30 };

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
  }
];

export const GraphEditor: React.FC<{
  graphStore: GraphStoreHook;
  theme: ThemeTokens;
  onAddNode: (payload: { label?: string; nodeType?: GraphNodeType }) => void;
  onConnectNodes: (payload: { sourceId?: string; targetId?: string }) => void;
  onDeleteNodes: (nodeIds: string[]) => void;
}> = ({ graphStore, theme, onAddNode, onConnectNodes, onDeleteNodes }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const graph = graphStore((state) => state.graph);
  const selectedNodeIds = graphStore((state) => state.selectedNodeIds);
  const setSelectedNodes = graphStore((state) => state.setSelectedNodes);
  const updateNodePosition = graphStore((state) => state.updateNodePosition);
  const styles = useMemo(() => buildStyles(theme), [theme]);
  const selectionRef = useRef<string[]>([]);

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
      layout: { ...defaultLayout },
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
      cy.layout({ ...defaultLayout }).run();
    }
  }, [graph]);

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
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      const selected = selectionRef.current;
      if ((event.key === 'Delete' || event.key === 'Backspace') && selected.length) {
        event.preventDefault();
        onDeleteNodes([...selected]);
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
  }, [graph.nodes.length, onAddNode, onConnectNodes, onDeleteNodes]);

  return (
    <div
      className="graph-canvas"
      ref={containerRef}
      style={{
        backgroundColor: theme.canvas.background,
        backgroundImage: theme.canvas.accents,
        borderColor: theme.canvas.stroke,
        borderStyle: 'solid',
        borderWidth: 1
      }}
      tabIndex={0}
    />
  );
};
