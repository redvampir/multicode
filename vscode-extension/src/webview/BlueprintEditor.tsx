/**
 * BlueprintEditor — основной компонент редактора графов на React Flow
 * Замена Cytoscape-based GraphEditor
 */

import React, { useCallback, useRef, useState, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  addEdge,
  Edge,
  Node,
  OnConnect,
  OnNodesChange,
  OnEdgesChange,
  MarkerType,
  BackgroundVariant,
  useReactFlow,
  XYPosition,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { blueprintNodeTypes, BlueprintNodeData, BlueprintFlowNode, BlueprintFlowEdge } from './nodes/BlueprintNode';
import { 
  BlueprintGraphState, 
  BlueprintNode as BlueprintNodeType,
  BlueprintEdge,
  createNode,
  BlueprintNodeType as NodeType,
  NodeTypeDefinition,
} from '../shared/blueprintTypes';
import { PORT_TYPE_COLORS, areTypesCompatible } from '../shared/portTypes';
import { CodePreviewPanel } from './CodePreviewPanel';
import { PackageManagerPanel } from './PackageManagerPanel';
import { useUndoRedo, useClipboard, useAutoLayout, usePackageRegistry } from './hooks';
import { 
  ContextMenu, 
  ContextMenuPosition, 
  createCanvasMenuItems, 
  createNodeMenuItems,
} from './ContextMenu';

// ============================================
// Преобразование данных
// ============================================

function blueprintToFlowNodes(
  nodes: BlueprintNodeType[] | undefined | null, 
  displayLanguage: 'ru' | 'en',
  onLabelChange?: (nodeId: string, newLabel: string) => void
): BlueprintFlowNode[] {
  if (!nodes || !Array.isArray(nodes)) {
    console.warn('[BlueprintEditor] nodes is not an array:', nodes);
    return [];
  }
  
  return nodes
    .filter(node => node && typeof node === 'object')
    .map(node => ({
      id: node.id ?? `node-${Math.random().toString(36).slice(2)}`,
      type: 'blueprint' as const,
      position: node.position ?? { x: 0, y: 0 },
      data: { node, displayLanguage, onLabelChange },
      selected: false,
    }));
}

function blueprintToFlowEdges(edges: BlueprintEdge[] | undefined | null): Edge[] {
  if (!edges || !Array.isArray(edges)) {
    console.warn('[BlueprintEditor] edges is not an array:', edges);
    return [];
  }
  
  return edges
    .filter(edge => edge && typeof edge === 'object')
    .map(edge => {
    const isExec = edge.kind === 'execution';
    const color = isExec 
      ? PORT_TYPE_COLORS.execution.main 
      : PORT_TYPE_COLORS[edge.dataType ?? 'any'].main;
    
    return {
      id: edge.id,
      source: edge.sourceNode,
      sourceHandle: edge.sourcePort,
      target: edge.targetNode,
      targetHandle: edge.targetPort,
      type: isExec ? 'smoothstep' : 'default',
      animated: !isExec,
      style: { 
        stroke: color, 
        strokeWidth: isExec ? 3 : 2,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color,
        width: 20,
        height: 20,
      },
    };
  });
}

// ============================================
// Стили
// ============================================

const editorStyles = {
  container: {
    width: '100%',
    height: '100%',
    backgroundColor: '#11111b',
    display: 'flex',
  } as React.CSSProperties,
  graphContainer: {
    flex: 1,
    height: '100%',
    position: 'relative',
  } as React.CSSProperties,
  palette: {
    position: 'absolute',
    top: 60,
    left: 10,
    width: 220,
    maxHeight: 'calc(100% - 80px)',
    backgroundColor: '#1e1e2e',
    borderRadius: 8,
    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 10,
  } as React.CSSProperties,
  paletteHeader: {
    padding: '12px 16px',
    backgroundColor: '#313244',
    color: '#cdd6f4',
    fontWeight: 600,
    fontSize: 14,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  } as React.CSSProperties,
  paletteSearch: {
    padding: '8px 12px',
    borderBottom: '1px solid #313244',
  } as React.CSSProperties,
  searchInput: {
    width: '100%',
    padding: '8px 12px',
    backgroundColor: '#11111b',
    border: '1px solid #313244',
    borderRadius: 4,
    color: '#cdd6f4',
    fontSize: 12,
    outline: 'none',
  } as React.CSSProperties,
  paletteContent: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 0',
  } as React.CSSProperties,
  categoryHeader: {
    padding: '8px 16px 4px',
    color: '#6c7086',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  } as React.CSSProperties,
  nodeItem: {
    padding: '8px 16px',
    cursor: 'grab',
    color: '#cdd6f4',
    fontSize: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    transition: 'background-color 0.15s',
  } as React.CSSProperties,
  nodeItemHover: {
    backgroundColor: '#313244',
  } as React.CSSProperties,
  nodeColorDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  } as React.CSSProperties,
  minimap: {
    backgroundColor: '#1e1e2e',
    border: '1px solid #313244',
    borderRadius: 4,
  } as React.CSSProperties,
};

// ============================================
// Node Palette Component
// ============================================

interface NodePaletteProps {
  visible: boolean;
  displayLanguage: 'ru' | 'en';
  onClose: () => void;
  onAddNode: (type: NodeType, position: XYPosition) => void;
  /** Определения узлов из реестра пакетов */
  nodeDefinitions: Record<string, NodeTypeDefinition>;
  /** Категории из реестра пакетов */
  categories: { id: string; label: string; labelRu: string }[];
}

const NodePalette: React.FC<NodePaletteProps> = ({ 
  visible, 
  displayLanguage, 
  onClose,
  onAddNode,
  nodeDefinitions,
  categories,
}) => {
  const [search, setSearch] = useState('');
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const { screenToFlowPosition } = useReactFlow();
  
  const filteredCategories = useMemo(() => {
    const term = search.toLowerCase();
    return categories.map(cat => ({
      ...cat,
      nodes: Object.values(nodeDefinitions)
        .filter(def => {
          if (def.category !== cat.id) return false;
          if (!term) return true;
          const label = displayLanguage === 'ru' ? def.labelRu : def.label;
          return label.toLowerCase().includes(term);
        }),
    })).filter(cat => cat.nodes.length > 0);
  }, [search, displayLanguage, nodeDefinitions, categories]);
  
  const handleDragStart = useCallback((e: React.DragEvent, type: NodeType) => {
    e.dataTransfer.setData('application/reactflow', type);
    e.dataTransfer.effectAllowed = 'move';
  }, []);
  
  if (!visible) return null;
  
  return (
    <div style={editorStyles.palette}>
      <div style={editorStyles.paletteHeader}>
        <span>{displayLanguage === 'ru' ? 'Добавить узел' : 'Add Node'}</span>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#6c7086',
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          ×
        </button>
      </div>
      
      <div style={editorStyles.paletteSearch}>
        <input
          type="text"
          placeholder={displayLanguage === 'ru' ? 'Поиск...' : 'Search...'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={editorStyles.searchInput}
          autoFocus
        />
      </div>
      
      <div style={editorStyles.paletteContent as React.CSSProperties}>
        {filteredCategories.map(cat => (
          <div key={cat.id}>
            <div style={editorStyles.categoryHeader}>
              {displayLanguage === 'ru' ? cat.labelRu : cat.label}
            </div>
            {cat.nodes.map(def => (
              <div
                key={def.type}
                style={{
                  ...editorStyles.nodeItem,
                  ...(hoveredItem === def.type ? editorStyles.nodeItemHover : {}),
                }}
                draggable
                onDragStart={e => handleDragStart(e, def.type)}
                onMouseEnter={() => setHoveredItem(def.type)}
                onMouseLeave={() => setHoveredItem(null)}
                onClick={() => {
                  // Добавить в центр viewport
                  const position = screenToFlowPosition({ 
                    x: window.innerWidth / 2, 
                    y: window.innerHeight / 2 
                  });
                  onAddNode(def.type, position);
                  onClose();
                }}
              >
                <div
                  style={{
                    ...editorStyles.nodeColorDot,
                    backgroundColor: def.headerColor ?? '#6c7086',
                  }}
                />
                <span>{displayLanguage === 'ru' ? def.labelRu : def.label}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================
// Main Editor Component
// ============================================

export interface BlueprintEditorProps {
  graph: BlueprintGraphState;
  onGraphChange: (graph: BlueprintGraphState) => void;
  displayLanguage: 'ru' | 'en';
}

const BlueprintEditorInner: React.FC<BlueprintEditorProps> = ({
  graph,
  onGraphChange,
  displayLanguage,
}) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();
  
  // Реестр пакетов
  const { 
    nodeDefinitions: packageNodeDefinitions,
    categories: packageCategories,
    getNode,
    packages,
    loadPackage,
    unloadPackage,
  } = usePackageRegistry();
  
  const [nodes, setNodes, onNodesChange] = useNodesState(
    blueprintToFlowNodes(graph.nodes, displayLanguage)
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    blueprintToFlowEdges(graph.edges)
  );
  
  const [paletteVisible, setPaletteVisible] = useState(false);
  const [codePreviewVisible, setCodePreviewVisible] = useState(false);
  const [packageManagerVisible, setPackageManagerVisible] = useState(false);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    position: ContextMenuPosition;
    type: 'canvas' | 'node';
  } | null>(null);
  
  // ============================================
  // Inline Label Editing
  // ============================================
  
  const handleLabelChange = useCallback((nodeId: string, newLabel: string) => {
    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId) return n;
      return {
        ...n,
        data: {
          ...n.data,
          node: {
            ...n.data.node,
            customLabel: newLabel || undefined, // Empty string = reset to default
          },
        },
      };
    }));
  }, [setNodes]);
  
  // Inject onLabelChange into node data (needed because callback defined after state init)
  useEffect(() => {
    setNodes(nds => nds.map(n => ({
      ...n,
      data: { ...n.data, onLabelChange: handleLabelChange },
    })));
  }, [handleLabelChange, setNodes]);
  
  // ============================================
  // Undo/Redo система
  // ============================================
  
  interface GraphSnapshot {
    nodes: BlueprintFlowNode[];
    edges: Edge[];
  }
  
  const [historyState, historyActions] = useUndoRedo<GraphSnapshot>(
    { nodes: blueprintToFlowNodes(graph.nodes, displayLanguage), edges: blueprintToFlowEdges(graph.edges) },
    { maxHistory: 50, debounceMs: 500 }
  );
  
  // Синхронизация с историей при изменении nodes/edges
  const isRestoringHistory = useRef(false);
  
  useEffect(() => {
    if (isRestoringHistory.current) return;
    historyActions.set({ nodes, edges });
  }, [nodes, edges, historyActions]);
  
  // Функции Undo/Redo
  const handleUndo = useCallback(() => {
    if (!historyState.canUndo) return;
    isRestoringHistory.current = true;
    historyActions.undo();
    // Состояние обновится через эффект ниже
  }, [historyState.canUndo, historyActions]);
  
  const handleRedo = useCallback(() => {
    if (!historyState.canRedo) return;
    isRestoringHistory.current = true;
    historyActions.redo();
  }, [historyState.canRedo, historyActions]);
  
  // Восстановление состояния из истории
  useEffect(() => {
    if (!isRestoringHistory.current) return;
    setNodes(historyState.current.nodes);
    setEdges(historyState.current.edges);
    isRestoringHistory.current = false;
  }, [historyState, setNodes, setEdges]);
  
  // ============================================
  // Auto Layout система
  // ============================================
  
  const { applyLayout } = useAutoLayout();
  
  const handleAutoLayout = useCallback(() => {
    applyLayout({ direction: 'TB', nodeSpacingX: 80, nodeSpacingY: 100 });
  }, [applyLayout]);
  
  // ============================================
  // Copy/Paste система
  // ============================================
  
  const clipboard = useClipboard();
  
  const handleCopy = useCallback(() => {
    const selectedNodeIds = nodes.filter(n => n.selected).map(n => n.id);
    if (selectedNodeIds.length === 0) return;
    
    const blueprintNodes = nodes.map(n => n.data.node);
    const blueprintEdges: BlueprintEdge[] = edges.map(e => ({
      id: e.id,
      sourceNode: e.source,
      sourcePort: e.sourceHandle ?? '',
      targetNode: e.target,
      targetPort: e.targetHandle ?? '',
      kind: e.animated ? 'data' as const : 'execution' as const,
      dataType: e.animated ? 'any' as const : 'execution' as const,
    }));
    
    clipboard.copy(selectedNodeIds, blueprintNodes, blueprintEdges);
  }, [nodes, edges, clipboard]);
  
  const handleCut = useCallback(() => {
    const selectedNodeIds = nodes.filter(n => n.selected).map(n => n.id);
    if (selectedNodeIds.length === 0) return;
    
    // Сначала копируем
    handleCopy();
    
    // Затем удаляем
    setNodes(nds => nds.filter(n => !n.selected));
    setEdges(eds => eds.filter(e => {
      const sourceSelected = nodes.find(n => n.id === e.source)?.selected;
      const targetSelected = nodes.find(n => n.id === e.target)?.selected;
      return !sourceSelected && !targetSelected;
    }));
  }, [nodes, handleCopy, setNodes, setEdges]);
  
  const handlePaste = useCallback(() => {
    const result = clipboard.paste();
    if (!result) return;
    
    // Создаём Flow-узлы из Blueprint-узлов
    const newFlowNodes: BlueprintFlowNode[] = result.nodes.map(node => ({
      id: node.id,
      type: 'blueprint' as const,
      position: node.position,
      data: { node, displayLanguage, onLabelChange: handleLabelChange },
      selected: true, // Выделяем вставленные узлы
    }));
    
    // Создаём Flow-рёбра
    const newFlowEdges: Edge[] = result.edges.map(edge => {
      const isExec = edge.kind === 'execution';
      const color = isExec 
        ? PORT_TYPE_COLORS.execution.main 
        : PORT_TYPE_COLORS[edge.dataType ?? 'any'].main;
      
      return {
        id: edge.id,
        source: edge.sourceNode,
        sourceHandle: edge.sourcePort,
        target: edge.targetNode,
        targetHandle: edge.targetPort,
        type: isExec ? 'smoothstep' : 'default',
        animated: !isExec,
        style: { stroke: color, strokeWidth: isExec ? 3 : 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
          width: 20,
          height: 20,
        },
      };
    });
    
    // Снимаем выделение с текущих узлов и добавляем новые
    setNodes(nds => [
      ...nds.map(n => ({ ...n, selected: false })),
      ...newFlowNodes,
    ]);
    setEdges(eds => [...eds, ...newFlowEdges]);
  }, [clipboard, displayLanguage, handleLabelChange, setNodes, setEdges]);
  
  // ============================================
  // Синхронизация с внешним состоянием
  // ============================================
  
  // Sync graph state when external graph changes
  // Flag to prevent sync loops (external update vs internal update)
  const isExternalUpdate = useRef(false);
  const prevGraphRef = useRef<string>(graph.id);
  
  // Sync external graph changes to internal state
  useEffect(() => {
    // Only sync if graph ID changed or this is truly an external update
    const graphChanged = prevGraphRef.current !== graph.id;
    if (graphChanged) {
      console.log('[BlueprintEditor] External graph update detected, syncing...');
      isExternalUpdate.current = true;
      prevGraphRef.current = graph.id;
      setNodes(blueprintToFlowNodes(graph.nodes, displayLanguage));
      setEdges(blueprintToFlowEdges(graph.edges));
      // Reset flag after React processes the state update
      requestAnimationFrame(() => {
        isExternalUpdate.current = false;
      });
    }
  }, [graph.id, displayLanguage, setNodes, setEdges, graph.nodes, graph.edges]);
  
  // Sync changes back to parent (only for internal changes, not external)
  const prevNodesRef = useRef(nodes);
  const prevEdgesRef = useRef(edges);
  
  useEffect(() => {
    // Skip if this is an external update to prevent loops
    if (isExternalUpdate.current) {
      console.log('[BlueprintEditor] Skipping onGraphChange (external update)');
      prevNodesRef.current = nodes;
      prevEdgesRef.current = edges;
      return;
    }
    
    // Check if there are actual changes
    const nodesChanged = nodes !== prevNodesRef.current;
    const edgesChanged = edges !== prevEdgesRef.current;
    
    if (!nodesChanged && !edgesChanged) {
      return;
    }
    
    console.log('[BlueprintEditor] Internal change detected, calling onGraphChange');
    prevNodesRef.current = nodes;
    prevEdgesRef.current = edges;
    
    const updatedGraph: BlueprintGraphState = {
      ...graph,
      nodes: nodes.map(n => ({
        ...n.data.node,
        position: n.position,
      })),
      edges: edges.map(e => ({
        id: e.id,
        sourceNode: e.source,
        sourcePort: e.sourceHandle ?? '',
        targetNode: e.target,
        targetPort: e.targetHandle ?? '',
        kind: e.animated ? 'data' as const : 'execution' as const,
        dataType: e.animated ? 'any' as const : 'execution' as const,
      })),
      updatedAt: new Date().toISOString(),
      dirty: true,
    };
    onGraphChange(updatedGraph);
  }, [nodes, edges, graph, onGraphChange]);
  
  // ============================================
  // Обработчики событий
  // ============================================
  
  // Handle connection (drag-to-connect)
  const onConnect: OnConnect = useCallback((connection) => {
    if (!connection.source || !connection.target) return;
    
    // Найти порты и проверить совместимость
    const sourceNode = nodes.find(n => n.id === connection.source) as BlueprintFlowNode | undefined;
    const targetNode = nodes.find(n => n.id === connection.target) as BlueprintFlowNode | undefined;
    
    if (!sourceNode || !targetNode) return;
    
    const sourcePort = sourceNode.data.node.outputs.find(
      p => p.id === connection.sourceHandle
    );
    const targetPort = targetNode.data.node.inputs.find(
      p => p.id === connection.targetHandle
    );
    
    if (!sourcePort || !targetPort) return;
    
    // Проверка совместимости типов
    if (!areTypesCompatible(sourcePort.dataType, targetPort.dataType)) {
      console.warn('Incompatible port types:', sourcePort.dataType, '->', targetPort.dataType);
      return;
    }
    
    const isExec = sourcePort.dataType === 'execution';
    const color = isExec 
      ? PORT_TYPE_COLORS.execution.main 
      : PORT_TYPE_COLORS[sourcePort.dataType].main;
    
    const newEdge: Edge = {
      id: `edge-${Date.now()}`,
      source: connection.source,
      sourceHandle: connection.sourceHandle,
      target: connection.target,
      targetHandle: connection.targetHandle,
      type: isExec ? 'smoothstep' : 'default',
      animated: !isExec,
      style: { stroke: color, strokeWidth: isExec ? 3 : 2 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color,
        width: 20,
        height: 20,
      },
    };
    
    setEdges(eds => addEdge(newEdge, eds));
  }, [nodes, setEdges]);
  
  // Handle node changes (position, selection)
  const handleNodesChange: OnNodesChange<BlueprintFlowNode> = useCallback((changes) => {
    onNodesChange(changes);
  }, [onNodesChange]);
  
  // Handle edge changes (deletion)
  const handleEdgesChange: OnEdgesChange<BlueprintFlowEdge> = useCallback((changes) => {
    onEdgesChange(changes);
  }, [onEdgesChange]);
  
  // Handle drag & drop from palette
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);
  
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    
    const type = e.dataTransfer.getData('application/reactflow') as NodeType;
    if (!type) return;
    
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const newNode = createNode(type, position);
    
    const flowNode: BlueprintFlowNode = {
      id: newNode.id,
      type: 'blueprint',
      position: newNode.position,
      data: { node: newNode, displayLanguage, onLabelChange: handleLabelChange },
    };
    
    setNodes(nds => [...nds, flowNode]);
  }, [screenToFlowPosition, displayLanguage, setNodes, handleLabelChange]);
  
  // Add node from palette click
  const handleAddNode = useCallback((type: NodeType, position: XYPosition) => {
    const newNode = createNode(type, position);
    const flowNode: BlueprintFlowNode = {
      id: newNode.id,
      type: 'blueprint',
      position: newNode.position,
      data: { node: newNode, displayLanguage, onLabelChange: handleLabelChange },
    };
    setNodes(nds => [...nds, flowNode]);
  }, [displayLanguage, setNodes, handleLabelChange]);
  
  // Delete selected nodes
  const handleDeleteSelected = useCallback(() => {
    const selectedNodeIds = new Set(nodes.filter(n => n.selected).map(n => n.id));
    
    setNodes(nds => nds.filter(n => !n.selected));
    setEdges(eds => eds.filter(e => 
      !e.selected && !selectedNodeIds.has(e.source) && !selectedNodeIds.has(e.target)
    ));
  }, [nodes, setNodes, setEdges]);
  
  // Zoom to fit
  const handleZoomToFit = useCallback(() => {
    fitView({ padding: 0.2, duration: 300 });
  }, [fitView]);
  
  // Select all
  const handleSelectAll = useCallback(() => {
    setNodes(nds => nds.map(n => ({ ...n, selected: true })));
    setEdges(eds => eds.map(e => ({ ...e, selected: true })));
  }, [setNodes, setEdges]);
  
  // ============================================
  // Context Menu
  // ============================================
  
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    
    // Определяем тип меню: если кликнули на узел — меню узла, иначе — меню канваса
    const target = e.target as HTMLElement;
    const nodeElement = target.closest('.react-flow__node');
    
    if (nodeElement) {
      // Клик на узел
      const nodeId = nodeElement.getAttribute('data-id');
      if (nodeId) {
        // Если узел не выделен — выделяем его
        const node = nodes.find(n => n.id === nodeId);
        if (node && !node.selected) {
          setNodes(nds => nds.map(n => ({
            ...n,
            selected: n.id === nodeId,
          })));
        }
      }
      setContextMenu({ position: { x: e.clientX, y: e.clientY }, type: 'node' });
    } else {
      // Клик на канвас
      setContextMenu({ position: { x: e.clientX, y: e.clientY }, type: 'canvas' });
    }
  }, [nodes, setNodes]);
  
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);
  
  const contextMenuItems = useMemo(() => {
    if (!contextMenu) return [];
    
    const hasSelection = nodes.some(n => n.selected);
    
    if (contextMenu.type === 'node') {
      return createNodeMenuItems({
        onCopy: handleCopy,
        onCut: handleCut,
        onDelete: handleDeleteSelected,
        hasSelection,
      });
    } else {
      return createCanvasMenuItems({
        onAddNode: () => setPaletteVisible(true),
        onPaste: handlePaste,
        onUndo: handleUndo,
        onRedo: handleRedo,
        onSelectAll: handleSelectAll,
        onZoomToFit: handleZoomToFit,
        onAutoLayout: handleAutoLayout,
        canUndo: historyState.canUndo,
        canRedo: historyState.canRedo,
        canPaste: clipboard.hasData(),
      });
    }
  }, [
    contextMenu, nodes, handleCopy, handleCut, handleDeleteSelected,
    handlePaste, handleUndo, handleRedo, handleSelectAll, handleZoomToFit,
    handleAutoLayout, historyState.canUndo, historyState.canRedo, clipboard
  ]);
  
  // ============================================
  // Keyboard shortcuts
  // ============================================
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      
      // Ctrl+Z - Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }
      
      // Ctrl+Shift+Z или Ctrl+Y - Redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
        return;
      }
      
      // Ctrl+C - Copy
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !isInputFocused) {
        e.preventDefault();
        handleCopy();
        return;
      }
      
      // Ctrl+X - Cut
      if ((e.ctrlKey || e.metaKey) && e.key === 'x' && !isInputFocused) {
        e.preventDefault();
        handleCut();
        return;
      }
      
      // Ctrl+V - Paste
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && !isInputFocused) {
        e.preventDefault();
        handlePaste();
        return;
      }
      
      // Ctrl+A - Select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !isInputFocused) {
        e.preventDefault();
        handleSelectAll();
        return;
      }
      
      // Если ввод в поле — остальные хоткеи игнорируем
      if (isInputFocused) return;
      
      // 'A' - открыть палитру
      if (e.key === 'a' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setPaletteVisible(v => !v);
      }
      
      // 'C' - открыть/закрыть панель кода (без Ctrl)
      if (e.key === 'c' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setCodePreviewVisible(v => !v);
      }
      
      // 'P' - открыть/закрыть панель пакетов
      if (e.key === 'p' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setPackageManagerVisible(v => !v);
      }
      
      // 'F' - Zoom to fit
      if (e.key === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        handleZoomToFit();
      }
      
      // 'L' - Auto layout
      if (e.key === 'l' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        handleAutoLayout();
      }
      
      // Delete/Backspace - удалить выделенные
      if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDeleteSelected();
      }
      
      // Escape - закрыть панели и контекстное меню
      if (e.key === 'Escape') {
        setPaletteVisible(false);
        setCodePreviewVisible(false);
        setPackageManagerVisible(false);
        setContextMenu(null);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleUndo, handleRedo, handleCopy, handleCut, handlePaste,
    handleDeleteSelected, handleZoomToFit, handleSelectAll, handleAutoLayout
  ]);
  
  // Handle node hover from code panel
  const handleCodeLineHover = useCallback((nodeId: string | null) => {
    setHighlightedNodeId(nodeId);
    // Подсветить узел в графе
    if (nodeId) {
      setNodes(nds => nds.map(n => ({
        ...n,
        style: n.id === nodeId 
          ? { ...n.style, boxShadow: '0 0 20px 5px rgba(137, 180, 250, 0.5)' }
          : { ...n.style, boxShadow: undefined },
      })));
    } else {
      setNodes(nds => nds.map(n => ({
        ...n,
        style: { ...n.style, boxShadow: undefined },
      })));
    }
  }, [setNodes]);
  
  // MiniMap node color
  const minimapNodeColor = useCallback((node: Node) => {
    const data = node.data as BlueprintNodeData;
    if (!data?.node?.type) return '#6c7086';
    const def = getNode(data.node.type);
    return def?.headerColor ?? '#6c7086';
  }, [getNode]);
  
  // ============================================
  // Локализация
  // ============================================
  
  const t = useMemo(() => ({
    add: displayLanguage === 'ru' ? 'Добавить (A)' : 'Add (A)',
    code: displayLanguage === 'ru' ? 'Код (C)' : 'Code (C)',
    packages: displayLanguage === 'ru' ? 'Пакеты (P)' : 'Packages (P)',
    undo: displayLanguage === 'ru' ? 'Отменить' : 'Undo',
    redo: displayLanguage === 'ru' ? 'Повторить' : 'Redo',
    fit: displayLanguage === 'ru' ? 'Вписать (F)' : 'Fit (F)',
    layout: displayLanguage === 'ru' ? 'Автолейаут (L)' : 'Layout (L)',
  }), [displayLanguage]);
  
  return (
    <div ref={reactFlowWrapper} style={editorStyles.container}>
      <div style={editorStyles.graphContainer}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onContextMenu={handleContextMenu}
          nodeTypes={blueprintNodeTypes}
          fitView
          snapToGrid
          snapGrid={[16, 16]}
          defaultEdgeOptions={{
            type: 'smoothstep',
          }}
          connectionLineStyle={{ stroke: '#89b4fa', strokeWidth: 2 }}
          minZoom={0.1}
          maxZoom={2}
          attributionPosition="bottom-left"
        >
          <Background 
            variant={BackgroundVariant.Dots} 
            gap={16} 
            size={1} 
            color="#313244" 
          />
          
          <Controls 
            showInteractive={false}
            style={{ 
              backgroundColor: '#1e1e2e',
              border: '1px solid #313244',
              borderRadius: 4,
            }}
          />
          
          <MiniMap
            nodeColor={minimapNodeColor}
            nodeStrokeWidth={3}
            style={editorStyles.minimap}
            maskColor="rgba(17, 17, 27, 0.7)"
          />
          
          <Panel position="top-left">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {/* Добавить узел */}
              <button
                onClick={() => setPaletteVisible(v => !v)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#45475a',
                  color: '#cdd6f4',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span>+</span>
                <span>{t.add}</span>
              </button>
              
              {/* Код */}
              <button
                onClick={() => setCodePreviewVisible(v => !v)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: codePreviewVisible ? '#89b4fa' : '#45475a',
                  color: codePreviewVisible ? '#1e1e2e' : '#cdd6f4',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span>{'</>'}</span>
                <span>{t.code}</span>
              </button>
              
              {/* Пакеты */}
              <button
                onClick={() => setPackageManagerVisible(v => !v)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: packageManagerVisible ? '#89b4fa' : '#45475a',
                  color: packageManagerVisible ? '#1e1e2e' : '#cdd6f4',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span>📦</span>
                <span>{t.packages}</span>
              </button>
              
              {/* Разделитель */}
              <div style={{ width: 1, backgroundColor: '#45475a', margin: '0 4px' }} />
              
              {/* Undo */}
              <button
                onClick={handleUndo}
                disabled={!historyState.canUndo}
                title={`${t.undo} (Ctrl+Z)`}
                style={{
                  padding: '8px 12px',
                  backgroundColor: historyState.canUndo ? '#45475a' : '#313244',
                  color: historyState.canUndo ? '#cdd6f4' : '#6c7086',
                  border: 'none',
                  borderRadius: 4,
                  cursor: historyState.canUndo ? 'pointer' : 'not-allowed',
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                ↶
              </button>
              
              {/* Redo */}
              <button
                onClick={handleRedo}
                disabled={!historyState.canRedo}
                title={`${t.redo} (Ctrl+Y)`}
                style={{
                  padding: '8px 12px',
                  backgroundColor: historyState.canRedo ? '#45475a' : '#313244',
                  color: historyState.canRedo ? '#cdd6f4' : '#6c7086',
                  border: 'none',
                  borderRadius: 4,
                  cursor: historyState.canRedo ? 'pointer' : 'not-allowed',
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                ↷
              </button>
              
              {/* Zoom to Fit */}
              <button
                onClick={handleZoomToFit}
                title={t.fit}
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#45475a',
                  color: '#cdd6f4',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                ⊡
              </button>
              
              {/* Auto Layout */}
              <button
                onClick={handleAutoLayout}
                title={t.layout}
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#45475a',
                  color: '#cdd6f4',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                ⊞
              </button>
            </div>
          </Panel>
          
          <NodePalette
            visible={paletteVisible}
            displayLanguage={displayLanguage}
            onClose={() => setPaletteVisible(false)}
            onAddNode={handleAddNode}
            nodeDefinitions={packageNodeDefinitions}
            categories={packageCategories}
          />
        </ReactFlow>
      </div>
      
      {/* Панель предпросмотра кода */}
      <CodePreviewPanel
        graph={graph}
        displayLanguage={displayLanguage}
        visible={codePreviewVisible}
        onClose={() => setCodePreviewVisible(false)}
        highlightedNodeId={highlightedNodeId}
        onLineHover={handleCodeLineHover}
      />
      
      {/* Панель управления пакетами */}
      <PackageManagerPanel
        visible={packageManagerVisible}
        displayLanguage={displayLanguage}
        onClose={() => setPackageManagerVisible(false)}
        packages={packages}
        onLoadPackage={loadPackage}
        onUnloadPackage={unloadPackage}
      />
      
      {/* Контекстное меню */}
      <ContextMenu
        position={contextMenu?.position ?? null}
        items={contextMenuItems}
        displayLanguage={displayLanguage}
        onClose={closeContextMenu}
      />
    </div>
  );
};

// Wrapper with ReactFlowProvider
export const BlueprintEditor: React.FC<BlueprintEditorProps> = (props) => {
  return (
    <ReactFlowProvider>
      <BlueprintEditorInner {...props} />
    </ReactFlowProvider>
  );
};

export default BlueprintEditor;
