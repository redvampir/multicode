/**
 * BlueprintEditor — основной компонент редактора графов на React Flow
 * Визуальный редактор узлов в стиле flow-based программирования
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
import './blueprint.css';

import { blueprintNodeTypes, BlueprintNodeData, BlueprintFlowNode, BlueprintFlowEdge } from './nodes/BlueprintNode';
import { 
  BlueprintGraphState, 
  BlueprintNode as BlueprintNodeType,
  BlueprintEdge,
  BlueprintVariable,
  NodePort,
  createNode,
  createNodeFromDefinition,
  createCallUserFunctionNode,
  updateCallNodesForFunction,
  BlueprintNodeType as NodeType,
  NodeTypeDefinition,
  VARIABLE_TYPE_COLORS,
  normalizePointerMeta,
} from '../shared/blueprintTypes';
import { PORT_TYPE_COLORS, type PortDataType } from '../shared/portTypes';
import {
  canDirectlyConnectDataPorts,
  findTypeConversionRule,
  formatIncompatibleTypeMessage,
  formatTypeConversionLabel,
} from '../shared/typeConversions';
import { CodePreviewPanel } from './CodePreviewPanel';
import { PackageManagerPanel } from './PackageManagerPanel';
import { useUndoRedo, useClipboard, useAutoLayout, usePackageRegistry } from './hooks';
import { 
  ContextMenu, 
  ContextMenuPosition, 
  createCanvasMenuItems, 
  createNodeMenuItems,
} from './ContextMenu';
import { FunctionListPanel } from './FunctionListPanel';
import { VariableListPanel } from './VariableListPanel';
import { PointerReferencePanel } from './PointerReferencePanel';
import type { BlueprintFunction } from '../shared/blueprintTypes';
import {
  type AvailableVariableBinding,
  bindVariableToNode,
  findNonOverlappingPosition,
  removeNodesByDeletedVariables,
  resolveVariableForNode,
} from './variableNodeBinding';
import {
  resolveVariableValuesPreview,
  type ResolvedVariableValues,
} from './variableValueResolver';

const EDGE_INTERACTION_WIDTH = 24;
const BLOCK_SHORTCUTS_WHEN_DIALOG_OPEN_SELECTOR = '.variable-dialog-overlay, .pointer-dialog-overlay, .function-editor-overlay';

const isTextInputContext = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName;
  if (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    target.isContentEditable
  ) {
    return true;
  }

  return target.closest('.variable-dialog') !== null || target.closest('.function-editor') !== null;
};

const isAnyDialogOpen = (): boolean => {
  if (typeof document === 'undefined') {
    return false;
  }
  return document.querySelector(BLOCK_SHORTCUTS_WHEN_DIALOG_OPEN_SELECTOR) !== null;
};

// ============================================
// Преобразование данных
// ============================================

function blueprintToFlowNodes(
  nodes: BlueprintNodeType[] | undefined | null, 
  displayLanguage: 'ru' | 'en',
  onLabelChange?: (nodeId: string, newLabel: string) => void,
  onPropertyChange?: (nodeId: string, property: string, value: unknown) => void,
  availableVariables?: AvailableVariableBinding[],
  resolvedVariableValues?: ResolvedVariableValues,
  onPortValueChange?: (nodeId: string, portId: string, value: string | number | boolean) => void,
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
      data: { 
        node, 
        displayLanguage, 
        onLabelChange,
        onPropertyChange,
        onPortValueChange,
        availableVariables,
        resolvedVariableValues,
      },
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
      interactionWidth: EDGE_INTERACTION_WIDTH,
      data: {
        kind: edge.kind,
        dataType: edge.dataType,
      },
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
// Helper: Получить узлы/рёбра активного графа
// ============================================

interface ActiveGraphData {
  nodes: BlueprintNodeType[];
  edges: BlueprintEdge[];
  isFunction: boolean;
  functionName?: string;
}

function getActiveGraphData(
  graph: BlueprintGraphState,
  activeFunctionId: string | null
): ActiveGraphData {
  if (activeFunctionId && graph.functions) {
    const func = graph.functions.find(f => f.id === activeFunctionId);
    if (func) {
      return {
        nodes: func.graph.nodes,
        edges: func.graph.edges,
        isFunction: true,
        functionName: func.nameRu || func.name,
      };
    }
  }
  return {
    nodes: graph.nodes,
    edges: graph.edges,
    isFunction: false,
  };
}

interface ReconciledGraphData {
  nodes: BlueprintNodeType[];
  edges: BlueprintEdge[];
}

interface EdgeNormalizationResult {
  edges: BlueprintEdge[];
  changed: boolean;
  duplicateCount: number;
  invalidCount: number;
}

const isPortDataTypeValue = (value: unknown): value is PortDataType =>
  value === 'execution' ||
  value === 'bool' ||
  value === 'int32' ||
  value === 'int64' ||
  value === 'float' ||
  value === 'double' ||
  value === 'string' ||
  value === 'vector' ||
  value === 'pointer' ||
  value === 'class' ||
  value === 'array' ||
  value === 'any';

const toEdgeKind = (value: unknown): BlueprintEdge['kind'] =>
  value === 'data' ? 'data' : 'execution';

const getPortsForDirection = (
  node: BlueprintNodeType,
  direction: 'input' | 'output'
): NodePort[] => (direction === 'input' ? node.inputs : node.outputs);

const pickPortIdByKind = (
  node: BlueprintNodeType | undefined,
  direction: 'input' | 'output',
  kind: BlueprintEdge['kind']
): string | null => {
  if (!node) {
    return null;
  }

  const ports = getPortsForDirection(node, direction);
  if (!ports.length) {
    return null;
  }

  if (kind === 'execution') {
    return ports.find((port) => port.dataType === 'execution')?.id ?? ports[0].id;
  }

  return ports.find((port) => port.dataType !== 'execution')?.id ?? ports[0].id;
};

const normalizePortId = (
  rawPortId: string,
  node: BlueprintNodeType | undefined,
  direction: 'input' | 'output',
  kind: BlueprintEdge['kind']
): string | null => {
  if (!node) {
    return null;
  }

  const ports = getPortsForDirection(node, direction);
  if (!ports.length) {
    return null;
  }

  if (ports.some((port) => port.id === rawPortId)) {
    return rawPortId;
  }

  const directSuffix = `${node.id}-`;
  if (rawPortId.startsWith(directSuffix)) {
    const maybePortId = rawPortId.slice(directSuffix.length);
    if (ports.some((port) => port.id === maybePortId)) {
      return maybePortId;
    }
  }

  const pairSuffix = rawPortId.split('-').slice(-2).join('-');
  if (ports.some((port) => port.id === pairSuffix)) {
    return pairSuffix;
  }

  return pickPortIdByKind(node, direction, kind);
};

const getPortDataType = (
  node: BlueprintNodeType | undefined,
  direction: 'input' | 'output',
  portId: string
): PortDataType | null => {
  if (!node) {
    return null;
  }
  const ports = getPortsForDirection(node, direction);
  return ports.find((port) => port.id === portId)?.dataType ?? null;
};

const getEdgeSignature = (edge: BlueprintEdge): string =>
  [
    edge.sourceNode,
    edge.sourcePort,
    edge.targetNode,
    edge.targetPort,
    edge.kind,
    edge.dataType ?? '',
  ].join('|');

const normalizeBlueprintEdges = (
  nodes: BlueprintNodeType[],
  edges: BlueprintEdge[]
): EdgeNormalizationResult => {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const safeEdges = Array.isArray(edges) ? edges : [];
  const nodeById = new Map(safeNodes.map((node) => [node.id, node]));
  const uniqueSignatures = new Set<string>();
  const normalizedEdges: BlueprintEdge[] = [];

  let changed = false;
  let duplicateCount = 0;
  let invalidCount = 0;

  for (const edge of safeEdges) {
    const sourceNode = nodeById.get(edge.sourceNode);
    const targetNode = nodeById.get(edge.targetNode);
    if (!sourceNode || !targetNode) {
      changed = true;
      invalidCount += 1;
      continue;
    }

    const kind = toEdgeKind(edge.kind);
    const sourcePort = normalizePortId(edge.sourcePort, sourceNode, 'output', kind);
    const targetPort = normalizePortId(edge.targetPort, targetNode, 'input', kind);

    if (!sourcePort || !targetPort) {
      changed = true;
      invalidCount += 1;
      continue;
    }

    const sourcePortType = getPortDataType(sourceNode, 'output', sourcePort);
    const targetPortType = getPortDataType(targetNode, 'input', targetPort);
    let dataType = edge.dataType;

    if (kind === 'data') {
      if (!isPortDataTypeValue(dataType) || dataType === 'execution') {
        const fallbackDataType = sourcePortType && sourcePortType !== 'execution'
          ? sourcePortType
          : targetPortType && targetPortType !== 'execution'
            ? targetPortType
            : 'any';
        dataType = fallbackDataType;
      }
    } else {
      dataType = undefined;
    }

    const normalizedEdge: BlueprintEdge = {
      ...edge,
      kind,
      sourcePort,
      targetPort,
      dataType,
    };

    if (
      edge.kind !== normalizedEdge.kind ||
      edge.sourcePort !== normalizedEdge.sourcePort ||
      edge.targetPort !== normalizedEdge.targetPort ||
      edge.dataType !== normalizedEdge.dataType
    ) {
      changed = true;
    }

    const signature = getEdgeSignature(normalizedEdge);
    if (uniqueSignatures.has(signature)) {
      changed = true;
      duplicateCount += 1;
      continue;
    }

    uniqueSignatures.add(signature);
    normalizedEdges.push(normalizedEdge);
  }

  if (normalizedEdges.length !== safeEdges.length) {
    changed = true;
  }

  return {
    edges: normalizedEdges,
    changed,
    duplicateCount,
    invalidCount,
  };
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;

const flowEdgeToBlueprintEdge = (edge: Edge): BlueprintEdge => {
  const rawData = asRecord(edge.data);
  const dataKind = rawData?.kind;
  const edgeKind = toEdgeKind(dataKind ?? (edge.animated ? 'data' : 'execution'));
  const rawDataType = rawData?.dataType;
  const dataType = isPortDataTypeValue(rawDataType) ? rawDataType : undefined;

  return {
    id: edge.id,
    sourceNode: edge.source,
    sourcePort: edge.sourceHandle ?? '',
    targetNode: edge.target,
    targetPort: edge.targetHandle ?? '',
    kind: edgeKind,
    dataType: edgeKind === 'data' ? dataType ?? 'any' : undefined,
  };
};

const getFlowEdgeKind = (edge: Edge): BlueprintEdge['kind'] => {
  const rawData = asRecord(edge.data);
  return toEdgeKind(rawData?.kind ?? (edge.animated ? 'data' : 'execution'));
};

const hasSameFlowConnection = (
  edges: Edge[],
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string,
  kind: BlueprintEdge['kind']
): boolean =>
  edges.some((edge) =>
    edge.source === sourceNodeId &&
    edge.sourceHandle === sourcePortId &&
    edge.target === targetNodeId &&
    edge.targetHandle === targetPortId &&
    getFlowEdgeKind(edge) === kind
  );

const createFlowEdgeId = (): string =>
  `edge-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const createStyledFlowEdge = (
  kind: BlueprintEdge['kind'],
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string,
  dataType?: PortDataType
): Edge => {
  const effectiveDataType = kind === 'data' ? (dataType ?? 'any') : undefined;
  const color = kind === 'execution'
    ? PORT_TYPE_COLORS.execution.main
    : PORT_TYPE_COLORS[effectiveDataType ?? 'any'].main;

  return {
    id: createFlowEdgeId(),
    source: sourceNodeId,
    sourceHandle: sourcePortId,
    target: targetNodeId,
    targetHandle: targetPortId,
    type: kind === 'execution' ? 'smoothstep' : 'default',
    animated: kind === 'data',
    interactionWidth: EDGE_INTERACTION_WIDTH,
    data: {
      kind,
      dataType: effectiveDataType,
    },
    style: {
      stroke: color,
      strokeWidth: kind === 'execution' ? 3 : 2,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color,
      width: 20,
      height: 20,
    },
  };
};

const matchesPortSuffix = (portId: string, suffix: string): boolean => {
  const normalizedPortId = portId.toLowerCase();
  const normalizedSuffix = suffix.toLowerCase();
  return (
    normalizedPortId === normalizedSuffix ||
    normalizedPortId.endsWith(`-${normalizedSuffix}`) ||
    normalizedPortId.endsWith(`_${normalizedSuffix}`)
  );
};

const findPortIdBySuffix = (
  ports: NodePort[],
  suffix: string,
  dataType?: PortDataType
): string | null => {
  const typedPorts = dataType
    ? ports.filter((port) => port.dataType === dataType)
    : ports;
  if (typedPorts.length === 0) {
    return null;
  }

  return typedPorts.find((port) => matchesPortSuffix(port.id, suffix))?.id ?? typedPorts[0]?.id ?? null;
};

const toAvailableVariableBinding = (variable: BlueprintVariable): AvailableVariableBinding => ({
  id: variable.id,
  name: variable.name ?? '',
  nameRu: variable.nameRu ?? variable.name ?? '',
  codeName: variable.codeName,
  dataType: variable.dataType,
  isArray: variable.isArray === true,
  arrayRank:
    typeof variable.arrayRank === 'number' && Number.isFinite(variable.arrayRank)
      ? Math.max(0, Math.trunc(variable.arrayRank))
      : variable.isArray === true
        ? 1
        : 0,
  vectorElementType: variable.vectorElementType,
  defaultValue: variable.defaultValue,
  color: variable.color ?? VARIABLE_TYPE_COLORS[variable.dataType],
  pointerMeta: variable.pointerMeta,
});

const isDataInputPort = (port: NodePort): boolean =>
  port.direction === 'input' && port.dataType !== 'execution';

const VARIADIC_ARITHMETIC_NODE_TYPES: ReadonlySet<NodeType> = new Set<NodeType>([
  'Add',
  'Subtract',
  'Multiply',
  'Divide',
  'Modulo',
]);

const getOperandLabel = (index: number): string =>
  index < 26 ? String.fromCharCode(65 + index) : `N${index + 1}`;

const getOperandSuffix = (index: number): string =>
  index < 26 ? String.fromCharCode(97 + index) : `arg-${index + 1}`;

const extractSwitchCaseIndexFromPortId = (portId: string): number | null => {
  const match = portId.match(/case-(\d+)(?:$|[-_])/i);
  if (!match) {
    return null;
  }
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const isSwitchCaseOutputPort = (port: NodePort): boolean =>
  port.direction === 'output' &&
  port.dataType === 'execution' &&
  extractSwitchCaseIndexFromPortId(port.id) !== null;

const getSwitchCaseValue = (port: NodePort): number => {
  if (typeof port.defaultValue === 'number' && Number.isFinite(port.defaultValue)) {
    return Math.max(0, Math.trunc(port.defaultValue));
  }
  return extractSwitchCaseIndexFromPortId(port.id) ?? 0;
};

const buildSwitchCasePortName = (caseValue: number): { name: string; nameRu: string } => ({
  name: `Case ${caseValue}`,
  nameRu: `Случай ${caseValue}`,
});

const addSwitchCaseOutputToNode = (node: BlueprintNodeType): BlueprintNodeType => {
  if (node.type !== 'Switch') {
    return node;
  }

  const caseOutputPorts = node.outputs.filter(isSwitchCaseOutputPort);
  const existingValues = new Set(caseOutputPorts.map((port) => getSwitchCaseValue(port)));
  const existingIndices = new Set(
    caseOutputPorts
      .map((port) => extractSwitchCaseIndexFromPortId(port.id))
      .filter((value): value is number => value !== null)
  );

  let nextCaseValue = 0;
  while (existingValues.has(nextCaseValue)) {
    nextCaseValue += 1;
  }

  let nextPortIndex = 0;
  while (existingIndices.has(nextPortIndex)) {
    nextPortIndex += 1;
  }

  const { name, nameRu } = buildSwitchCasePortName(nextCaseValue);
  const nextPort: NodePort = {
    id: `${node.id}-case-${nextPortIndex}`,
    name,
    nameRu,
    dataType: 'execution',
    direction: 'output',
    defaultValue: nextCaseValue,
    index: node.outputs.length,
    connected: false,
  };

  const defaultPort = node.outputs.find((port) => matchesPortSuffix(port.id, 'default'));
  const outputsWithoutDefault = node.outputs.filter((port) => !matchesPortSuffix(port.id, 'default'));
  const nextOutputsUnindexed = defaultPort
    ? [...outputsWithoutDefault, nextPort, defaultPort]
    : [...node.outputs, nextPort];
  const nextOutputs = nextOutputsUnindexed.map((port, index) => ({ ...port, index }));

  return {
    ...node,
    outputs: nextOutputs,
  };
};

const updateSwitchCaseOutputMeta = (
  node: BlueprintNodeType,
  payload: unknown
): { node: BlueprintNodeType; changed: boolean; duplicateValue: number | null } => {
  if (node.type !== 'Switch' || typeof payload !== 'object' || payload === null) {
    return { node, changed: false, duplicateValue: null };
  }

  const rawPayload = payload as Record<string, unknown>;
  const portId = typeof rawPayload.portId === 'string' ? rawPayload.portId : '';
  if (!portId) {
    return { node, changed: false, duplicateValue: null };
  }

  const caseOutputPorts = node.outputs.filter(isSwitchCaseOutputPort);
  if (!caseOutputPorts.some((port) => port.id === portId)) {
    return { node, changed: false, duplicateValue: null };
  }

  const requestedCaseValue = (() => {
    const value = rawPayload.caseValue;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, Math.trunc(value));
    }
    return null;
  })();

  if (requestedCaseValue !== null) {
    const duplicate = caseOutputPorts.some(
      (port) => port.id !== portId && getSwitchCaseValue(port) === requestedCaseValue
    );
    if (duplicate) {
      return { node, changed: false, duplicateValue: requestedCaseValue };
    }
  }

  const requestedCaseName = (() => {
    const value = rawPayload.caseName;
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  })();

  let changed = false;
  const nextOutputs = node.outputs.map((port) => {
    if (port.id !== portId) {
      return port;
    }

    const nextPort: NodePort = { ...port };
    if (requestedCaseValue !== null && getSwitchCaseValue(port) !== requestedCaseValue) {
      nextPort.defaultValue = requestedCaseValue;
      if (!requestedCaseName) {
        const names = buildSwitchCasePortName(requestedCaseValue);
        nextPort.name = names.name;
        nextPort.nameRu = names.nameRu;
      }
      changed = true;
    }

    if (requestedCaseName !== null) {
      nextPort.name = requestedCaseName;
      nextPort.nameRu = requestedCaseName;
      changed = true;
    }

    return nextPort;
  });

  if (!changed) {
    return { node, changed: false, duplicateValue: null };
  }

  return {
    node: {
      ...node,
      outputs: nextOutputs.map((port, index) => ({ ...port, index })),
    },
    changed: true,
    duplicateValue: null,
  };
};

const addOperandPortToVariadicArithmeticNode = (node: BlueprintNodeType): BlueprintNodeType => {
  if (!VARIADIC_ARITHMETIC_NODE_TYPES.has(node.type as NodeType)) {
    return node;
  }

  const operandCount = node.inputs.filter(isDataInputPort).length;
  const operandIndex = operandCount;
  const baseSuffix = getOperandSuffix(operandIndex);
  let candidateSuffix = baseSuffix;
  let attempt = 1;
  while (node.inputs.some((port) => port.id === `${node.id}-${candidateSuffix}` || port.id === candidateSuffix)) {
    candidateSuffix = `${baseSuffix}-${attempt}`;
    attempt += 1;
  }

  const nextPort: NodePort = {
    id: `${node.id}-${candidateSuffix}`,
    name: getOperandLabel(operandIndex),
    nameRu: getOperandLabel(operandIndex),
    dataType: node.type === 'Modulo' ? 'int32' : 'float',
    direction: 'input',
    defaultValue: node.type === 'Divide' || node.type === 'Modulo' ? 1 : 0,
    index: node.inputs.length,
    connected: false,
  };

  const normalizedInputs = node.inputs.map((port, index) => ({ ...port, index }));
  return {
    ...node,
    inputs: [...normalizedInputs, nextPort],
  };
};

const bindVariableNodeIfNeeded = (
  node: BlueprintNodeType,
  variables: AvailableVariableBinding[],
  displayLanguage: 'ru' | 'en'
): BlueprintNodeType | null => {
  if (node.type !== 'Variable' && node.type !== 'GetVariable' && node.type !== 'SetVariable') {
    return node;
  }

  const variable = resolveVariableForNode(node, variables);
  if (!variable) {
    return null;
  }

  return bindVariableToNode(node, variable, displayLanguage);
};

const reconcileVariableNodesAndEdges = (
  nodes: BlueprintNodeType[],
  edges: BlueprintEdge[],
  removedVariableIds: Set<string>,
  variables: AvailableVariableBinding[],
  displayLanguage: 'ru' | 'en'
): ReconciledGraphData => {
  const removedByIdResult = removeNodesByDeletedVariables(nodes, edges, removedVariableIds);

  const boundNodes: BlueprintNodeType[] = [];
  for (const node of removedByIdResult.nodes) {
    const boundNode = bindVariableNodeIfNeeded(node, variables, displayLanguage);
    if (boundNode) {
      boundNodes.push(boundNode);
    }
  }

  const validNodeIds = new Set(boundNodes.map((node) => node.id));
  const boundEdges = removedByIdResult.edges.filter(
    (edge) => validNodeIds.has(edge.sourceNode) && validNodeIds.has(edge.targetNode)
  );

  return {
    nodes: boundNodes,
    edges: boundEdges,
  };
};

// ============================================
// Node Palette Component
// ============================================

interface NodePaletteProps {
  visible: boolean;
  displayLanguage: 'ru' | 'en';
  onClose: () => void;
  onAddNode: (type: NodeType, position: XYPosition) => void;
  /** Добавить узел вызова пользовательской функции */
  onAddCallFunction?: (functionId: string, position: XYPosition) => void;
  /** Определения узлов из реестра пакетов */
  nodeDefinitions: Record<string, NodeTypeDefinition>;
  /** Категории из реестра пакетов */
  categories: { id: string; label: string; labelRu: string }[];
  /** Пользовательские функции для отображения в палитре */
  userFunctions?: BlueprintFunction[];
}

const NodePalette: React.FC<NodePaletteProps> = ({ 
  visible, 
  displayLanguage, 
  onClose,
  onAddNode,
  onAddCallFunction,
  nodeDefinitions,
  categories,
  userFunctions = [],
}) => {
  const [search, setSearch] = useState('');
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const { screenToFlowPosition } = useReactFlow();
  
  const filteredCategories = useMemo(() => {
    const term = search.toLowerCase();
    
    // Базовые категории из nodeDefinitions
    const baseCats = categories.map(cat => ({
      ...cat,
      nodes: Object.values(nodeDefinitions)
        .filter(def => {
          if (def.category !== cat.id) return false;
          // Legacy/variable-binding nodes stay supported in graph/runtime, but are created via the Variables panel.
          if (def.type === 'Variable') return false;
          if (def.type === 'GetVariable') return false;
          if (def.type === 'SetVariable') return false;
          if (!term) return true;
          const label = displayLanguage === 'ru' ? def.labelRu : def.label;
          return label.toLowerCase().includes(term);
        }),
      userFunctions: [] as BlueprintFunction[],
    }));
    
    // Добавляем пользовательские функции в категорию function
    const functionCat = baseCats.find(c => c.id === 'function');
    if (functionCat && userFunctions.length > 0) {
      functionCat.userFunctions = userFunctions.filter(f => {
        if (!term) return true;
        const label = displayLanguage === 'ru' ? f.nameRu : f.name;
        return label.toLowerCase().includes(term);
      });
    }
    
    return baseCats.filter(cat => cat.nodes.length > 0 || cat.userFunctions.length > 0);
  }, [search, displayLanguage, nodeDefinitions, categories, userFunctions]);
  
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
            
            {/* Пользовательские функции */}
            {cat.userFunctions && cat.userFunctions.length > 0 && (
              <>
                <div style={{ 
                  ...editorStyles.categoryHeader, 
                  marginTop: 8,
                  color: '#9C27B0',
                  fontSize: 10 
                }}>
                  {displayLanguage === 'ru' ? 'Мои функции' : 'My Functions'}
                </div>
                {cat.userFunctions.map(func => (
                  <div
                    key={func.id}
                    style={{
                      ...editorStyles.nodeItem,
                      ...(hoveredItem === `func-${func.id}` ? editorStyles.nodeItemHover : {}),
                    }}
                    onMouseEnter={() => setHoveredItem(`func-${func.id}`)}
                    onMouseLeave={() => setHoveredItem(null)}
                    onClick={() => {
                      if (onAddCallFunction) {
                        const position = screenToFlowPosition({ 
                          x: window.innerWidth / 2, 
                          y: window.innerHeight / 2 
                        });
                        onAddCallFunction(func.id, position);
                        onClose();
                      }
                    }}
                  >
                    <div
                      style={{
                        ...editorStyles.nodeColorDot,
                        backgroundColor: '#9C27B0',
                      }}
                    />
                    <span style={{ color: '#cba6f7' }}>
                      ƒ {displayLanguage === 'ru' ? func.nameRu : func.name}
                    </span>
                  </div>
                ))}
              </>
            )}
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
  /**
   * Если задано, редактор "прикалывается" к конкретной функции и редактирует её граф.
   * Используется для модального редактора функции поверх EventGraph.
   */
  forcedActiveFunctionId?: string | null;
  /**
   * Режим UI:
   * - `default` — обычный редактор EventGraph с панелями.
   * - `function-modal` — редактор графа функции (скрывает панель функций и вкладки графа).
   */
  uiMode?: 'default' | 'function-modal';
}

const BlueprintEditorInner: React.FC<BlueprintEditorProps> = ({
  graph,
  onGraphChange,
  displayLanguage,
  forcedActiveFunctionId,
  uiMode = 'default',
}) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const isFunctionModal = uiMode === 'function-modal';
  const lastEmittedUpdatedAtRef = useRef<string | null>(null);
  
  // Реестр пакетов
  const { 
    nodeDefinitions: packageNodeDefinitions,
    categories: packageCategories,
    getNode,
    packages,
    loadPackage,
    unloadPackage,
  } = usePackageRegistry();

  const createNodeByType = useCallback((
    type: NodeType,
    position: { x: number; y: number },
    id?: string
  ): BlueprintNodeType => {
    const definition = getNode(type);
    if (definition) {
      return createNodeFromDefinition(definition, position, id);
    }
    return createNode(type, position, id);
  }, [getNode]);
  
  // ============================================
  // Состояние для функций (UE Blueprint-style)
  // ============================================
  
  // ID активной редактируемой функции (null = основной EventGraph).
  // В режиме `default` всегда держим EventGraph на экране, а функции открываем в модальном окне.
  const [activeFunctionId, setActiveFunctionId] = useState<string | null>(null);
  const effectiveActiveFunctionId = forcedActiveFunctionId ?? activeFunctionId;
  const [functionGraphDialogFunctionId, setFunctionGraphDialogFunctionId] = useState<string | null>(null);
  
  // Получить данные активного графа (основного или функции)
  const activeGraphData = useMemo(() => 
    getActiveGraphData(graph, effectiveActiveFunctionId),
    [graph, effectiveActiveFunctionId]
  );
  const normalizedActiveEdges = useMemo(
    () => normalizeBlueprintEdges(activeGraphData.nodes, activeGraphData.edges),
    [activeGraphData.nodes, activeGraphData.edges]
  );
  const normalizedActiveGraphData = useMemo<ActiveGraphData>(() => ({
    ...activeGraphData,
    edges: normalizedActiveEdges.edges,
  }), [activeGraphData, normalizedActiveEdges.edges]);
  const [normalizationToast, setNormalizationToast] = useState<string | null>(null);

  const resolvedVariableValues = useMemo<ResolvedVariableValues>(() =>
    resolveVariableValuesPreview({
      nodes: normalizedActiveGraphData.nodes,
      edges: normalizedActiveGraphData.edges,
      variables: graph.variables ?? [],
    }),
    [normalizedActiveGraphData.nodes, normalizedActiveGraphData.edges, graph.variables]
  );
  
  const [nodes, setNodes, onNodesChange] = useNodesState(
    blueprintToFlowNodes(normalizedActiveGraphData.nodes, displayLanguage, undefined, undefined, undefined, resolvedVariableValues)
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    blueprintToFlowEdges(normalizedActiveGraphData.edges)
  );
  const edgesRef = useRef(edges);
  const notifyGraphChangeRef = useRef<(newNodes: BlueprintFlowNode[], newEdges: Edge[]) => void>(
    () => undefined
  );
  
  const [paletteVisible, setPaletteVisible] = useState(false);
  const [codePreviewVisible, setCodePreviewVisible] = useState(false);
  const [packageManagerVisible, setPackageManagerVisible] = useState(false);
  const [functionPanelVisible, setFunctionPanelVisible] = useState(!isFunctionModal); // В модальном редакторе функции панель функций скрыта
  const [variablePanelVisible, setVariablePanelVisible] = useState(true); // Панель переменных видна по умолчанию
  const [pointerPanelVisible, setPointerPanelVisible] = useState(true); // Панель указателей/ссылок видна по умолчанию
  const [isFunctionsSectionCollapsed, setIsFunctionsSectionCollapsed] = useState(false);
  const [isVariablesSectionCollapsed, setIsVariablesSectionCollapsed] = useState(false);
  const [isPointersSectionCollapsed, setIsPointersSectionCollapsed] = useState(false);
  const [pointerAttachPointerId, setPointerAttachPointerId] = useState<string | null>(null);
  const [pointerAttachError, setPointerAttachError] = useState<string | null>(null);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    position: ContextMenuPosition;
    type: 'canvas' | 'node';
  } | null>(null);
  const lastNormalizationSignatureRef = useRef<string | null>(null);
  const autoConversionNoticeSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    if (!normalizationToast) {
      return;
    }
    const timeout = setTimeout(() => setNormalizationToast(null), 4000);
    return () => clearTimeout(timeout);
  }, [normalizationToast]);

  useEffect(() => {
    const autoInsertedConversionIds = (graph.nodes ?? [])
      .filter((node) => {
        if (node.type !== 'TypeConversion') {
          return false;
        }
        const properties = asRecord(node.properties);
        return properties?.autoInserted === true;
      })
      .map((node) => node.id)
      .sort();

    if (autoInsertedConversionIds.length === 0) {
      autoConversionNoticeSignatureRef.current = null;
      return;
    }

    const signature = `${graph.id}:${displayLanguage}:${autoInsertedConversionIds.join('|')}`;
    if (autoConversionNoticeSignatureRef.current === signature) {
      return;
    }
    autoConversionNoticeSignatureRef.current = signature;

    const message = displayLanguage === 'ru'
      ? `Граф автоматически нормализован: добавлены узлы преобразования типов (${autoInsertedConversionIds.length}). Проверьте и сохраните изменения.`
      : `Graph was auto-normalized: inserted type conversion nodes (${autoInsertedConversionIds.length}). Review and save changes.`;
    setNormalizationToast(message);
  }, [displayLanguage, graph.id, graph.nodes]);

  useEffect(() => {
    if (!normalizedActiveEdges.changed) {
      lastNormalizationSignatureRef.current = null;
      return;
    }

    const normalizationSignature = JSON.stringify({
      graphId: graph.id,
      activeFunctionId: effectiveActiveFunctionId,
      edges: normalizedActiveEdges.edges.map((edge) => ({
        id: edge.id,
        sourceNode: edge.sourceNode,
        sourcePort: edge.sourcePort,
        targetNode: edge.targetNode,
        targetPort: edge.targetPort,
        kind: edge.kind,
        dataType: edge.dataType,
      })),
    });
    if (lastNormalizationSignatureRef.current === normalizationSignature) {
      return;
    }
    lastNormalizationSignatureRef.current = normalizationSignature;

    const localizedMessage = displayLanguage === 'ru'
      ? `Граф нормализован: удалено дублей ${normalizedActiveEdges.duplicateCount}, исправлено/удалено некорректных связей ${normalizedActiveEdges.invalidCount}. Сохраните изменения.`
      : `Graph was normalized: removed duplicates ${normalizedActiveEdges.duplicateCount}, fixed/removed invalid links ${normalizedActiveEdges.invalidCount}. Save changes.`;
    setNormalizationToast(localizedMessage);

    const normalizedGraph: BlueprintGraphState = effectiveActiveFunctionId && graph.functions
      ? {
          ...graph,
          functions: graph.functions.map((func) =>
            func.id === effectiveActiveFunctionId
              ? {
                  ...func,
                  graph: {
                    nodes: activeGraphData.nodes,
                    edges: normalizedActiveEdges.edges,
                  },
                  updatedAt: new Date().toISOString(),
                }
              : func
          ),
          activeFunctionId: effectiveActiveFunctionId,
          dirty: true,
          updatedAt: new Date().toISOString(),
        }
      : {
          ...graph,
          nodes: activeGraphData.nodes,
          edges: normalizedActiveEdges.edges,
          activeFunctionId: null,
          dirty: true,
          updatedAt: new Date().toISOString(),
        };

    lastEmittedUpdatedAtRef.current = normalizedGraph.updatedAt;
    onGraphChange(normalizedGraph);
  }, [
    activeGraphData.edges,
    activeGraphData.nodes,
    displayLanguage,
    effectiveActiveFunctionId,
    graph,
    normalizedActiveEdges.changed,
    normalizedActiveEdges.duplicateCount,
    normalizedActiveEdges.edges,
    normalizedActiveEdges.invalidCount,
    onGraphChange,
  ]);

  const pointerAttachPointer = useMemo(() => {
    if (!pointerAttachPointerId) {
      return null;
    }
    return (graph.variables ?? []).find((variable) => variable.id === pointerAttachPointerId) ?? null;
  }, [graph.variables, pointerAttachPointerId]);

  const pointerAttachPointerName = useMemo(() => {
    if (!pointerAttachPointer) {
      return null;
    }
    return displayLanguage === 'ru'
      ? (pointerAttachPointer.nameRu || pointerAttachPointer.name)
      : (pointerAttachPointer.name || pointerAttachPointer.nameRu);
  }, [displayLanguage, pointerAttachPointer]);

  const handleRequestAttachPointer = useCallback((pointerVariableId: string) => {
    setPointerAttachError(null);
    setPointerAttachPointerId((prev) => (prev === pointerVariableId ? null : pointerVariableId));
  }, []);

  const cancelPointerAttach = useCallback(() => {
    setPointerAttachPointerId(null);
    setPointerAttachError(null);
  }, []);
  
  // ============================================
  // Inline Label Editing & Property Changes
  // ============================================
  
  const handleLabelChange = useCallback((nodeId: string, newLabel: string) => {
    setNodes((nds) => {
      const updatedNodes = nds.map((n) => {
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
      });
      notifyGraphChangeRef.current(updatedNodes, edgesRef.current);
      return updatedNodes;
    });
  }, [setNodes]);
  
  // Обработчик изменения свойств узла (например, выбор переменной из dropdown)
  const handlePropertyChange = useCallback((nodeId: string, property: string, value: unknown) => {
    setNodes((nds) => {
      if (property === '__appendElseIfBranch') {
        const sourceFlowNode = nds.find((candidate) => candidate.id === nodeId);
        if (!sourceFlowNode || sourceFlowNode.data.node.type !== 'Branch') {
          return nds;
        }

        const falseOutputPortId = findPortIdBySuffix(sourceFlowNode.data.node.outputs, 'false', 'execution');
        if (!falseOutputPortId) {
          const message = displayLanguage === 'ru'
            ? 'Не удалось найти выход "Ложь" у выбранного узла ветвления.'
            : 'Failed to find the "False" output on the selected Branch node.';
          setNormalizationToast(message);
          return nds;
        }

        const basePosition: XYPosition = {
          x: sourceFlowNode.position.x + 260,
          y: sourceFlowNode.position.y + 140,
        };
        const nonOverlappingPosition = findNonOverlappingPosition(
          basePosition,
          nds.map((node) => ({ id: node.id, position: node.position })),
          { collisionDistance: 20 }
        );

        const appendedBranchNode = createNode('Branch', nonOverlappingPosition);
        const appendedExecInPortId = findPortIdBySuffix(appendedBranchNode.inputs, 'exec-in', 'execution');
        const appendedFalseOutputPortId = findPortIdBySuffix(appendedBranchNode.outputs, 'false', 'execution');
        if (!appendedExecInPortId || !appendedFalseOutputPortId) {
          const message = displayLanguage === 'ru'
            ? 'Не удалось подготовить новую ноду ветвления для else-if цепочки.'
            : 'Failed to prepare a new Branch node for else-if chain.';
          setNormalizationToast(message);
          return nds;
        }

        const appendedFlowNode: BlueprintFlowNode = {
          id: appendedBranchNode.id,
          type: 'blueprint',
          position: appendedBranchNode.position,
          data: {
            ...sourceFlowNode.data,
            node: appendedBranchNode,
          },
          selected: true,
        };

        const nextNodes = [
          ...nds.map((node) => ({ ...node, selected: false })),
          appendedFlowNode,
        ];

        setEdges((currentEdges) => {
          const carriedFalseEdges = currentEdges.filter((edge) =>
            edge.source === nodeId &&
            edge.sourceHandle === falseOutputPortId &&
            getFlowEdgeKind(edge) === 'execution'
          );

          const remainingEdges = currentEdges.filter((edge) =>
            !(
              edge.source === nodeId &&
              edge.sourceHandle === falseOutputPortId &&
              getFlowEdgeKind(edge) === 'execution'
            )
          );

          const nextEdges: Edge[] = [
            ...remainingEdges,
            createStyledFlowEdge(
              'execution',
              nodeId,
              falseOutputPortId,
              appendedBranchNode.id,
              appendedExecInPortId
            ),
          ];

          for (const carriedEdge of carriedFalseEdges) {
            const targetFlowNode = nds.find((candidate) => candidate.id === carriedEdge.target);
            const fallbackTargetPort = targetFlowNode
              ? findPortIdBySuffix(targetFlowNode.data.node.inputs, 'exec-in', 'execution')
              : null;
            const targetPortId = carriedEdge.targetHandle ?? fallbackTargetPort;
            if (!targetPortId) {
              continue;
            }
            nextEdges.push(
              createStyledFlowEdge(
                'execution',
                appendedBranchNode.id,
                appendedFalseOutputPortId,
                carriedEdge.target,
                targetPortId
              )
            );
          }

          setTimeout(() => notifyGraphChangeRef.current(nextNodes, nextEdges), 0);
          return nextEdges;
        });

        return nextNodes;
      }

      const updatedNodes = nds.map((n) => {
        if (n.id !== nodeId) return n;

        if (property === '__addMathOperand' && VARIADIC_ARITHMETIC_NODE_TYPES.has(n.data.node.type as NodeType)) {
          return {
            ...n,
            data: {
              ...n.data,
              node: addOperandPortToVariadicArithmeticNode(n.data.node),
            },
          };
        }

        if (property === '__addSwitchCase' && n.data.node.type === 'Switch') {
          return {
            ...n,
            data: {
              ...n.data,
              node: addSwitchCaseOutputToNode(n.data.node),
            },
          };
        }

        if (property === '__updateSwitchCaseMeta' && n.data.node.type === 'Switch') {
          const updated = updateSwitchCaseOutputMeta(n.data.node, value);
          if (updated.duplicateValue !== null) {
            const message = displayLanguage === 'ru'
              ? `Случай ${updated.duplicateValue} уже существует. Значения case должны быть уникальными.`
              : `Case ${updated.duplicateValue} already exists. Case values must be unique.`;
            setNormalizationToast(message);
          }
          if (!updated.changed) {
            return n;
          }
          return {
            ...n,
            data: {
              ...n.data,
              node: updated.node,
            },
          };
        }

        return {
          ...n,
          data: {
            ...n.data,
            node: {
              ...n.data.node,
              properties: {
                ...n.data.node.properties,
                [property]: value,
              },
            },
          },
        };
      });
      notifyGraphChangeRef.current(updatedNodes, edgesRef.current);
      return updatedNodes;
    });
  }, [displayLanguage, setEdges, setNodes]);

  const handlePortValueChange = useCallback((
    nodeId: string,
    portId: string,
    value: string | number | boolean,
  ) => {
    setNodes((nds) => {
      const updatedNodes = nds.map((n) => {
        if (n.id !== nodeId) {
          return n;
        }

        const updatedInputs = n.data.node.inputs.map((inputPort) =>
          inputPort.id === portId ? { ...inputPort, value } : inputPort
        );

        return {
          ...n,
          data: {
            ...n.data,
            node: {
              ...n.data.node,
              inputs: updatedInputs,
            },
          },
        };
      });

      notifyGraphChangeRef.current(updatedNodes, edgesRef.current);
      return updatedNodes;
    });
  }, [setNodes]);
  
  // Мемоизация списка доступных переменных
  const availableVariables = useMemo<AvailableVariableBinding[]>(() => {
    if (!graph.variables || !Array.isArray(graph.variables)) {
      return [];
    }
    return graph.variables.map((variable) => toAvailableVariableBinding(variable));
  }, [graph.variables]);
  
  // Inject callbacks into node data (needed because callbacks defined after state init)
  useEffect(() => {
    setNodes(nds => nds.map(n => ({
      ...n,
      data: { 
        ...n.data, 
        onLabelChange: handleLabelChange,
        onPropertyChange: handlePropertyChange,
        onPortValueChange: handlePortValueChange,
        availableVariables,
        resolvedVariableValues,
      },
    })));
  }, [handleLabelChange, handlePortValueChange, handlePropertyChange, availableVariables, resolvedVariableValues, setNodes]);

  const buildFlowNode = useCallback((node: BlueprintNodeType): BlueprintFlowNode => ({
    id: node.id,
    type: 'blueprint',
    position: node.position,
    data: {
      node,
      displayLanguage,
      onLabelChange: handleLabelChange,
      onPropertyChange: handlePropertyChange,
      onPortValueChange: handlePortValueChange,
      availableVariables,
      resolvedVariableValues,
    },
  }), [availableVariables, displayLanguage, handleLabelChange, handlePortValueChange, handlePropertyChange, resolvedVariableValues]);

  const computeNodePosition = useCallback((
    basePosition: XYPosition,
    currentNodes: BlueprintFlowNode[],
    collisionDistance: number
  ): XYPosition => findNonOverlappingPosition(
    basePosition,
    currentNodes.map((node) => ({ id: node.id, position: node.position })),
    { collisionDistance }
  ), []);
  
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
  const pushHistoryState = historyActions.set;
  const undoHistory = historyActions.undo;
  const redoHistory = historyActions.redo;
  
  // Синхронизация с историей при изменении nodes/edges
  const isRestoringHistory = useRef(false);
  
  useEffect(() => {
    if (isRestoringHistory.current) return;
    pushHistoryState({ nodes, edges });
  }, [nodes, edges, pushHistoryState]);
  
  // Функции Undo/Redo
  const handleUndo = useCallback(() => {
    if (!historyState.canUndo) return;
    isRestoringHistory.current = true;
    undoHistory();
    // Состояние обновится через эффект ниже
  }, [historyState.canUndo, undoHistory]);
  
  const handleRedo = useCallback(() => {
    if (!historyState.canRedo) return;
    isRestoringHistory.current = true;
    redoHistory();
  }, [historyState.canRedo, redoHistory]);
  
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
  // Синхронизация с внешним состоянием
  // ============================================
  
  // Функция для уведомления родителя об изменениях
  // Вызывается ЯВНО из обработчиков действий, НЕ из useEffect (чтобы избежать циклов)
  const notifyGraphChange = useCallback((newNodes: BlueprintFlowNode[], newEdges: Edge[]) => {
    const blueprintNodes = newNodes.map(n => ({
      ...n.data.node,
      position: n.position,
    }));
    const edgeNormalization = normalizeBlueprintEdges(
      blueprintNodes,
      newEdges.map(flowEdgeToBlueprintEdge)
    );
    const blueprintEdges = edgeNormalization.edges;
    
    let updatedGraph: BlueprintGraphState;
    
    if (effectiveActiveFunctionId && graph.functions) {
      // Обновляем граф внутри функции
      const updatedFunctions = graph.functions.map(f => {
        if (f.id === effectiveActiveFunctionId) {
          return {
            ...f,
            graph: { nodes: blueprintNodes, edges: blueprintEdges },
            updatedAt: new Date().toISOString(),
          };
        }
        return f;
      });
      updatedGraph = {
        ...graph,
        functions: updatedFunctions,
        activeFunctionId: effectiveActiveFunctionId,
        updatedAt: new Date().toISOString(),
        dirty: true,
      };
    } else {
      // Обновляем основной граф
      updatedGraph = {
        ...graph,
        nodes: blueprintNodes,
        edges: blueprintEdges,
        activeFunctionId: null,
        updatedAt: new Date().toISOString(),
        dirty: true,
      };
    }
    
    if (edgeNormalization.changed && (edgeNormalization.duplicateCount > 0 || edgeNormalization.invalidCount > 0)) {
      const localizedMessage = displayLanguage === 'ru'
        ? `Связи автоматически нормализованы (дубли: ${edgeNormalization.duplicateCount}, некорректные: ${edgeNormalization.invalidCount}).`
        : `Edges were auto-normalized (duplicates: ${edgeNormalization.duplicateCount}, invalid: ${edgeNormalization.invalidCount}).`;
      setNormalizationToast(localizedMessage);
    }

    lastEmittedUpdatedAtRef.current = updatedGraph.updatedAt;
    onGraphChange(updatedGraph);
  }, [displayLanguage, effectiveActiveFunctionId, graph, onGraphChange]);

  useEffect(() => {
    notifyGraphChangeRef.current = notifyGraphChange;
  }, [notifyGraphChange]);
  
  // ============================================
  // Обработчики для функций
  // ============================================
  
  // Обновление списка функций
  const handleFunctionsChange = useCallback((functions: BlueprintFunction[]) => {
    let updatedGraph: BlueprintGraphState = {
      ...graph,
      functions,
      updatedAt: new Date().toISOString(),
      dirty: true,
    };

    // При изменении сигнатуры функции обновляем CallUserFunction ноды в EventGraph,
    // чтобы входы/выходы на ноде вызова соответствовали параметрам.
    for (const func of functions) {
      updatedGraph = updateCallNodesForFunction(updatedGraph, func);
    }

    lastEmittedUpdatedAtRef.current = updatedGraph.updatedAt;
    onGraphChange(updatedGraph);
  }, [graph, onGraphChange]);
  
  // Открыть граф функции в модальном окне (в стиле UE Blueprints).
  // Основной canvas остаётся на EventGraph.
  const handleSelectFunction = useCallback((functionId: string | null) => {
    if (isFunctionModal || forcedActiveFunctionId !== undefined) {
      return;
    }

    // EventGraph: закрыть окно функции (если было открыто).
    if (!functionId) {
      setFunctionGraphDialogFunctionId(null);
      setActiveFunctionId(null);
      return;
    }

    setFunctionGraphDialogFunctionId(functionId);
    setActiveFunctionId(null);
  }, [forcedActiveFunctionId, isFunctionModal]);
  
  // ============================================
  // Copy/Paste система
  // ============================================
  
  const clipboard = useClipboard();
  
  const handleCopy = useCallback(() => {
    const selectedNodeIds = nodes.filter(n => n.selected).map(n => n.id);
    if (selectedNodeIds.length === 0) return;
    
    const blueprintNodes = nodes.map(n => n.data.node);
    const blueprintEdges: BlueprintEdge[] = edges.map(flowEdgeToBlueprintEdge);
    
    clipboard.copy(selectedNodeIds, blueprintNodes, blueprintEdges);
  }, [nodes, edges, clipboard]);
  
  const handleCut = useCallback(() => {
    const selectedNodeIds = nodes.filter(n => n.selected).map(n => n.id);
    if (selectedNodeIds.length === 0) return;
    
    // Сначала копируем
    handleCopy();
    
    // Затем удаляем
    const newNodes = nodes.filter(n => !n.selected);
    const newEdges = edges.filter(e => {
      const sourceSelected = nodes.find(n => n.id === e.source)?.selected;
      const targetSelected = nodes.find(n => n.id === e.target)?.selected;
      return !sourceSelected && !targetSelected;
    });
    
    setNodes(newNodes);
    setEdges(newEdges);
    setTimeout(() => notifyGraphChange(newNodes, newEdges), 0);
  }, [nodes, edges, handleCopy, setNodes, setEdges, notifyGraphChange]);
  
  const handlePaste = useCallback(() => {
    const result = clipboard.paste();
    if (!result) return;
    
    // Создаём Flow-узлы из Blueprint-узлов
    const newFlowNodes: BlueprintFlowNode[] = result.nodes.map(node => ({
      id: node.id,
      type: 'blueprint' as const,
      position: node.position,
      data: {
        node,
        displayLanguage,
        onLabelChange: handleLabelChange,
        onPropertyChange: handlePropertyChange,
        onPortValueChange: handlePortValueChange,
      },
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
        interactionWidth: EDGE_INTERACTION_WIDTH,
        data: {
          kind: edge.kind,
          dataType: edge.dataType,
        },
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
    const allNewNodes = [
      ...nodes.map(n => ({ ...n, selected: false })),
      ...newFlowNodes,
    ];
    const allNewEdges = [...edges, ...newFlowEdges];
    
    setNodes(allNewNodes);
    setEdges(allNewEdges);
    setTimeout(() => notifyGraphChange(allNewNodes, allNewEdges), 0);
  }, [
    clipboard,
    displayLanguage,
    handleLabelChange,
    handlePortValueChange,
    handlePropertyChange,
    setNodes,
    setEdges,
    nodes,
    edges,
    notifyGraphChange,
  ]);
  
  // Sync FROM parent:
  // - when a new graph is loaded
  // - when the editor switches between EventGraph/function graph (forced or local)
  // - when graph changes come from another editor instance (например, модальный редактор функции)
  const initializedGraphId = useRef(graph.id);
  const initializedFunctionId = useRef(effectiveActiveFunctionId);
  const initializedUpdatedAt = useRef(graph.updatedAt);
  
  useEffect(() => {
    const graphIdChanged = initializedGraphId.current !== graph.id;
    const functionIdChanged = initializedFunctionId.current !== effectiveActiveFunctionId;
    const updatedAtChanged = initializedUpdatedAt.current !== graph.updatedAt;
    const isOwnEmission = lastEmittedUpdatedAtRef.current === graph.updatedAt;
    const externalUpdate = updatedAtChanged && !isOwnEmission;
    const shouldSyncFromParent = graphIdChanged || functionIdChanged || externalUpdate;
    
    if (graphIdChanged) {
      console.log('[BlueprintEditor] New graph loaded, syncing from parent');
    } else if (functionIdChanged) {
      console.log('[BlueprintEditor] Function changed, syncing from parent');
    } else if (externalUpdate) {
      console.log('[BlueprintEditor] Graph updated externally, syncing from parent');
    }

    if (shouldSyncFromParent) {
      initializedGraphId.current = graph.id;
      initializedFunctionId.current = effectiveActiveFunctionId;
      initializedUpdatedAt.current = graph.updatedAt;

      const graphData = getActiveGraphData(graph, effectiveActiveFunctionId);
      const edgeNormalization = normalizeBlueprintEdges(graphData.nodes, graphData.edges);
      const syncedGraphData: ActiveGraphData = {
        ...graphData,
        edges: edgeNormalization.edges,
      };
      const resolvedValuesForGraph = resolveVariableValuesPreview({
        nodes: syncedGraphData.nodes,
        edges: syncedGraphData.edges,
        variables: graph.variables ?? [],
      });
      setNodes(blueprintToFlowNodes(
        syncedGraphData.nodes,
        displayLanguage,
        handleLabelChange,
        handlePropertyChange,
        availableVariables,
        resolvedValuesForGraph,
        handlePortValueChange,
      ));
      setEdges(blueprintToFlowEdges(syncedGraphData.edges));
    } else if (updatedAtChanged) {
      // Обновление от этого же редактора: просто синхронизируем маркер, без перезагрузки nodes/edges.
      initializedUpdatedAt.current = graph.updatedAt;
    }
  }, [
    graph,
    displayLanguage,
    effectiveActiveFunctionId,
    handleLabelChange,
    handlePortValueChange,
    handlePropertyChange,
    availableVariables,
    setNodes,
    setEdges,
  ]);
  
  // ============================================
  // Обработчики событий
  // ============================================
  
  // Handle connection (drag-to-connect)
  const onConnect: OnConnect = useCallback((connection) => {
    const sourceNodeId = connection.source;
    const targetNodeId = connection.target;
    const sourceHandleId = connection.sourceHandle;
    const targetHandleId = connection.targetHandle;

    if (!sourceNodeId || !targetNodeId || !sourceHandleId || !targetHandleId) {
      return;
    }

    const sourceNode = nodes.find((node) => node.id === sourceNodeId);
    const targetNode = nodes.find((node) => node.id === targetNodeId);
    if (!sourceNode || !targetNode) {
      return;
    }

    const sourcePort = sourceNode.data.node.outputs.find((port) => port.id === sourceHandleId);
    const targetPort = targetNode.data.node.inputs.find((port) => port.id === targetHandleId);
    if (!sourcePort || !targetPort) {
      return;
    }

    const createFlowEdge = (
      kind: BlueprintEdge['kind'],
      edgeSourceNodeId: string,
      edgeSourceHandleId: string,
      edgeTargetNodeId: string,
      edgeTargetHandleId: string,
      dataType?: PortDataType
    ): Edge => {
      const effectiveDataType = kind === 'data' ? (dataType ?? 'any') : undefined;
      const color = kind === 'execution'
        ? PORT_TYPE_COLORS.execution.main
        : PORT_TYPE_COLORS[effectiveDataType ?? 'any'].main;

      return {
        id: createFlowEdgeId(),
        source: edgeSourceNodeId,
        sourceHandle: edgeSourceHandleId,
        target: edgeTargetNodeId,
        targetHandle: edgeTargetHandleId,
        type: kind === 'execution' ? 'smoothstep' : 'default',
        animated: kind === 'data',
        interactionWidth: EDGE_INTERACTION_WIDTH,
        data: {
          kind,
          dataType: effectiveDataType,
        },
        style: {
          stroke: color,
          strokeWidth: kind === 'execution' ? 3 : 2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
          width: 20,
          height: 20,
        },
      };
    };

    if (sourcePort.dataType === 'execution' || targetPort.dataType === 'execution') {
      if (sourcePort.dataType !== 'execution' || targetPort.dataType !== 'execution') {
        const message = formatIncompatibleTypeMessage(sourcePort.dataType, targetPort.dataType, displayLanguage);
        setNormalizationToast(message);
        return;
      }

      if (
        hasSameFlowConnection(
          edges,
          sourceNodeId,
          sourceHandleId,
          targetNodeId,
          targetHandleId,
          'execution'
        )
      ) {
        return;
      }

      const executionEdge = createFlowEdge(
        'execution',
        sourceNodeId,
        sourceHandleId,
        targetNodeId,
        targetHandleId
      );
      const nextEdges = addEdge(executionEdge, edges);
      setEdges(nextEdges);
      setTimeout(() => notifyGraphChange(nodes, nextEdges), 0);
      return;
    }

    if (canDirectlyConnectDataPorts(sourcePort.dataType, targetPort.dataType)) {
      if (
        hasSameFlowConnection(
          edges,
          sourceNodeId,
          sourceHandleId,
          targetNodeId,
          targetHandleId,
          'data'
        )
      ) {
        return;
      }

      const directDataType: PortDataType =
        sourcePort.dataType === 'any' ? targetPort.dataType : sourcePort.dataType;
      const dataEdge = createFlowEdge(
        'data',
        sourceNodeId,
        sourceHandleId,
        targetNodeId,
        targetHandleId,
        directDataType
      );
      const nextEdges = addEdge(dataEdge, edges);
      setEdges(nextEdges);
      setTimeout(() => notifyGraphChange(nodes, nextEdges), 0);
      return;
    }

    const conversionRule = findTypeConversionRule(sourcePort.dataType, targetPort.dataType);
    if (!conversionRule) {
      const message = formatIncompatibleTypeMessage(sourcePort.dataType, targetPort.dataType, displayLanguage);
      setNormalizationToast(message);
      return;
    }

    const hasExistingConversionChain = edges.some((incomingEdge) => {
      if (
        incomingEdge.source !== sourceNodeId ||
        incomingEdge.sourceHandle !== sourceHandleId ||
        getFlowEdgeKind(incomingEdge) !== 'data'
      ) {
        return false;
      }

      const conversionFlowNode = nodes.find((node) => node.id === incomingEdge.target);
      if (!conversionFlowNode || conversionFlowNode.data.node.type !== 'TypeConversion') {
        return false;
      }

      const properties = asRecord(conversionFlowNode.data.node.properties);
      const fromType = properties?.fromType;
      const toType = properties?.toType;
      const conversionId = properties?.conversionId;
      const matchesRule =
        conversionId === conversionRule.id ||
        (fromType === conversionRule.sourceType && toType === conversionRule.targetType);
      if (!matchesRule) {
        return false;
      }

      return edges.some((outgoingEdge) =>
        outgoingEdge.source === conversionFlowNode.id &&
        outgoingEdge.target === targetNodeId &&
        outgoingEdge.targetHandle === targetHandleId &&
        getFlowEdgeKind(outgoingEdge) === 'data'
      );
    });
    if (hasExistingConversionChain) {
      return;
    }

    const baseConversionPosition: XYPosition = {
      x: (sourceNode.position.x + targetNode.position.x) / 2,
      y: (sourceNode.position.y + targetNode.position.y) / 2 - 40,
    };
    const conversionPosition = computeNodePosition(baseConversionPosition, nodes, 1);
    const conversionNode = createNodeByType(
      'TypeConversion',
      conversionPosition,
      `node-conversion-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    );
    conversionNode.position = conversionPosition;
    conversionNode.customLabel = formatTypeConversionLabel(conversionRule, displayLanguage);
    conversionNode.properties = {
      conversionId: conversionRule.id,
      fromType: conversionRule.sourceType,
      toType: conversionRule.targetType,
      autoInserted: true,
      meta: {},
      name: conversionRule.labelEn,
      nameRu: conversionRule.labelRu,
    };

    let conversionInputPortId = conversionNode.inputs[0]?.id ?? '';
    conversionNode.inputs = conversionNode.inputs.map((port) => {
      if (!port.id.endsWith('value-in')) {
        return port;
      }
      conversionInputPortId = port.id;
      return {
        ...port,
        name: displayLanguage === 'ru' ? 'Вход' : 'In',
        nameRu: 'Вход',
        dataType: conversionRule.sourceType,
      };
    });

    let conversionOutputPortId = conversionNode.outputs[0]?.id ?? '';
    conversionNode.outputs = conversionNode.outputs.map((port) => {
      if (!port.id.endsWith('value-out')) {
        return port;
      }
      conversionOutputPortId = port.id;
      return {
        ...port,
        name: displayLanguage === 'ru' ? 'Выход' : 'Out',
        nameRu: 'Выход',
        dataType: conversionRule.targetType,
      };
    });

    if (!conversionInputPortId || !conversionOutputPortId) {
      const message = formatIncompatibleTypeMessage(sourcePort.dataType, targetPort.dataType, displayLanguage);
      setNormalizationToast(message);
      return;
    }

    const edgeToConversion = createFlowEdge(
      'data',
      sourceNodeId,
      sourceHandleId,
      conversionNode.id,
      conversionInputPortId,
      conversionRule.sourceType
    );
    const edgeFromConversion = createFlowEdge(
      'data',
      conversionNode.id,
      conversionOutputPortId,
      targetNodeId,
      targetHandleId,
      conversionRule.targetType
    );

    const nextNodes = [...nodes, buildFlowNode(conversionNode)];
    const nextEdges = [...edges, edgeToConversion, edgeFromConversion];
    setNodes(nextNodes);
    setEdges(nextEdges);
    setTimeout(() => notifyGraphChange(nextNodes, nextEdges), 0);
  }, [
    buildFlowNode,
    computeNodePosition,
    createNodeByType,
    displayLanguage,
    edges,
    nodes,
    notifyGraphChange,
    setEdges,
    setNodes,
  ]);
  
  // Handle node changes (position, selection)
  // Track if we need to notify parent (e.g., after drag end)
  const handleNodesChange: OnNodesChange<BlueprintFlowNode> = useCallback((changes) => {
    onNodesChange(changes);
    
    // Check if any node position changed (drag end)
    const positionChanges = changes.filter(c => c.type === 'position' && c.dragging === false);
    if (positionChanges.length > 0) {
      // Defer notification to avoid setState during render
      setTimeout(() => {
        // Get updated nodes after React processes the change
        setNodes(currentNodes => {
          notifyGraphChange(currentNodes, edges);
          return currentNodes;
        });
      }, 0);
    }
  }, [onNodesChange, setNodes, edges, notifyGraphChange]);
  
  // Handle edge changes (deletion)
  const handleEdgesChange: OnEdgesChange<BlueprintFlowEdge> = useCallback((changes) => {
    onEdgesChange(changes);
    
    // Check if any edge was removed
    const removeChanges = changes.filter(c => c.type === 'remove');
    if (removeChanges.length > 0) {
      setTimeout(() => {
        setEdges(currentEdges => {
          notifyGraphChange(nodes, currentEdges);
          return currentEdges;
        });
      }, 0);
    }
  }, [onEdgesChange, setEdges, nodes, notifyGraphChange]);

  const handleEdgeDoubleClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    event.stopPropagation();

    setEdges((currentEdges) => {
      const nextEdges = currentEdges.filter((currentEdge) => currentEdge.id !== edge.id);
      if (nextEdges.length === currentEdges.length) {
        return currentEdges;
      }
      setTimeout(() => notifyGraphChange(nodes, nextEdges), 0);
      return nextEdges;
    });
  }, [nodes, notifyGraphChange, setEdges]);
  
  // Handle drag & drop from palette
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);
  
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    
    const dropPosition = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    
    // Проверяем, что дропнули - узел из палитры или переменную
    const nodeType = e.dataTransfer.getData('application/reactflow') as NodeType;
    const variableData = e.dataTransfer.getData('application/variable');
    
    if (variableData) {
      // Drag & Drop переменной из VariableListPanel
      try {
        const parsed = JSON.parse(variableData) as {
          variable?: BlueprintVariable;
          nodeType?: 'get' | 'set';
        };

        if (!parsed.variable || typeof parsed.variable.id !== 'string') {
          return;
        }

        const sourceVariable =
          graph.variables?.find((variable) => variable.id === parsed.variable?.id) ?? parsed.variable;
        const availableVariable = toAvailableVariableBinding(sourceVariable);
        const variableNodeType = parsed.nodeType === 'set' ? 'SetVariable' : 'GetVariable';

        setNodes((currentNodes) => {
          const nonOverlappingPosition = computeNodePosition(dropPosition, currentNodes, 1);
          const createdNode = createNodeByType(variableNodeType, nonOverlappingPosition);
          const boundNode = bindVariableToNode(createdNode, availableVariable, displayLanguage);
          const flowNode = buildFlowNode(boundNode);
          const newNodes = [...currentNodes, flowNode];
          setTimeout(() => notifyGraphChange(newNodes, edgesRef.current), 0);
          return newNodes;
        });
      } catch (err) {
        console.error('[BlueprintEditor] Failed to parse variable data:', err);
      }
      return;
    }
    
    if (nodeType) {
      // Drag & Drop узла из палитры
      setNodes((currentNodes) => {
        const nonOverlappingPosition = computeNodePosition(dropPosition, currentNodes, 1);
        const newNode = createNodeByType(nodeType, nonOverlappingPosition);
        const flowNode = buildFlowNode(newNode);
        const newNodes = [...currentNodes, flowNode];
        setTimeout(() => notifyGraphChange(newNodes, edgesRef.current), 0);
        return newNodes;
      });
    }
  }, [
    screenToFlowPosition,
    graph.variables,
    displayLanguage,
    setNodes,
    computeNodePosition,
    buildFlowNode,
    createNodeByType,
    notifyGraphChange,
  ]);
  
  // Add node from palette click
  const handleAddNode = useCallback((type: NodeType, position: XYPosition) => {
    setNodes((currentNodes) => {
      const nonOverlappingPosition = computeNodePosition(position, currentNodes, 20);
      const newNode = createNodeByType(type, nonOverlappingPosition);
      const flowNode = buildFlowNode(newNode);
      const newNodes = [...currentNodes, flowNode];
      setTimeout(() => notifyGraphChange(newNodes, edgesRef.current), 0);
      return newNodes;
    });
  }, [setNodes, computeNodePosition, buildFlowNode, createNodeByType, notifyGraphChange]);
  
  // Add CallUserFunction node from palette
  const handleAddCallFunction = useCallback((functionId: string, position: XYPosition) => {
    const func = graph.functions?.find(f => f.id === functionId);
    if (!func) return;
    
    // Используем функцию из blueprintTypes для создания узла вызова
    setNodes((currentNodes) => {
      const nonOverlappingPosition = computeNodePosition(position, currentNodes, 20);
      const newNode = createCallUserFunctionNode(func, nonOverlappingPosition);
      const flowNode = buildFlowNode(newNode);
      const newNodes = [...currentNodes, flowNode];
      setTimeout(() => notifyGraphChange(newNodes, edgesRef.current), 0);
      return newNodes;
    });
  }, [graph.functions, setNodes, computeNodePosition, buildFlowNode, notifyGraphChange]);
  
  // Create GetVariable node from VariableListPanel
  const handleCreateGetVariable = useCallback((variable: BlueprintVariable) => {
    const basePosition: XYPosition = { x: 100, y: 100 }; // Default position
    const availableVariable = toAvailableVariableBinding(variable);

    setNodes((currentNodes) => {
      const nonOverlappingPosition = computeNodePosition(basePosition, currentNodes, 20);
      const createdNode = createNodeByType('GetVariable', nonOverlappingPosition);
      const boundNode = bindVariableToNode(createdNode, availableVariable, displayLanguage);
      const flowNode = buildFlowNode(boundNode);
      const newNodes = [...currentNodes, flowNode];
      setTimeout(() => notifyGraphChange(newNodes, edgesRef.current), 0);
      return newNodes;
    });
  }, [displayLanguage, setNodes, computeNodePosition, buildFlowNode, createNodeByType, notifyGraphChange]);
  
  // Create SetVariable node from VariableListPanel
  const handleCreateSetVariable = useCallback((variable: BlueprintVariable) => {
    const basePosition: XYPosition = { x: 100, y: 200 }; // Default position
    const availableVariable = toAvailableVariableBinding(variable);

    setNodes((currentNodes) => {
      const nonOverlappingPosition = computeNodePosition(basePosition, currentNodes, 20);
      const createdNode = createNodeByType('SetVariable', nonOverlappingPosition);
      const boundNode = bindVariableToNode(createdNode, availableVariable, displayLanguage);
      const flowNode = buildFlowNode(boundNode);
      const newNodes = [...currentNodes, flowNode];
      setTimeout(() => notifyGraphChange(newNodes, edgesRef.current), 0);
      return newNodes;
    });
  }, [displayLanguage, setNodes, computeNodePosition, buildFlowNode, createNodeByType, notifyGraphChange]);
  
  // Handle variables change from VariableListPanel
  const handleVariablesChange = useCallback((variables: BlueprintVariable[]) => {
    const availableBindings = variables.map((variable) => toAvailableVariableBinding(variable));
    const previousVariableIds = new Set((graph.variables ?? []).map((variable) => variable.id));
    const nextVariableIds = new Set(variables.map((variable) => variable.id));
    const removedVariableIds = new Set(
      Array.from(previousVariableIds).filter((id) => !nextVariableIds.has(id))
    );

    const reconciledMainGraph = reconcileVariableNodesAndEdges(
      graph.nodes,
      graph.edges,
      removedVariableIds,
      availableBindings,
      displayLanguage
    );

    const reconciledFunctions = graph.functions?.map((func) => {
      const reconciledFunctionGraph = reconcileVariableNodesAndEdges(
        func.graph.nodes,
        func.graph.edges,
        removedVariableIds,
        availableBindings,
        displayLanguage
      );

      return {
        ...func,
        graph: {
          nodes: reconciledFunctionGraph.nodes,
          edges: reconciledFunctionGraph.edges,
        },
        updatedAt: new Date().toISOString(),
      };
    });

    const updatedGraph: BlueprintGraphState = {
      ...graph,
      variables,
      nodes: reconciledMainGraph.nodes,
      edges: reconciledMainGraph.edges,
      functions: reconciledFunctions,
      updatedAt: new Date().toISOString(),
      dirty: true,
    };

    const currentGraphData = getActiveGraphData(updatedGraph, effectiveActiveFunctionId);
    const resolvedValuesForGraph = resolveVariableValuesPreview({
      nodes: currentGraphData.nodes,
      edges: currentGraphData.edges,
      variables,
    });
    setNodes(
      blueprintToFlowNodes(
        currentGraphData.nodes,
        displayLanguage,
        handleLabelChange,
        handlePropertyChange,
        availableBindings,
        resolvedValuesForGraph,
        handlePortValueChange,
      )
    );
    setEdges(blueprintToFlowEdges(currentGraphData.edges));

    lastEmittedUpdatedAtRef.current = updatedGraph.updatedAt;
    onGraphChange(updatedGraph);
  }, [
    graph,
    displayLanguage,
    effectiveActiveFunctionId,
    handleLabelChange,
    handlePortValueChange,
    handlePropertyChange,
    onGraphChange,
    setEdges,
    setNodes,
  ]);

  const handleNodeClick = useCallback(
    (event: React.MouseEvent, flowNode: Node) => {
      if (!pointerAttachPointerId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const payload = flowNode.data as Partial<BlueprintNodeData> | undefined;
      const blueprintNode = payload?.node;

      if (!blueprintNode || (blueprintNode.type !== 'GetVariable' && blueprintNode.type !== 'SetVariable')) {
        setPointerAttachError(
          displayLanguage === 'ru'
            ? 'Выберите ноду переменной (Get/Set), чтобы прикрепить указатель.'
            : 'Select a variable node (Get/Set) to attach the pointer.'
        );
        return;
      }

      const properties =
        typeof blueprintNode.properties === 'object' && blueprintNode.properties !== null
          ? (blueprintNode.properties as Record<string, unknown>)
          : {};
      const targetVariableId = typeof properties.variableId === 'string' ? properties.variableId.trim() : '';

      if (!targetVariableId) {
        setPointerAttachError(
          displayLanguage === 'ru'
            ? 'Нода переменной не содержит variableId. Попробуйте другую ноду.'
            : 'Variable node has no variableId. Try another node.'
        );
        return;
      }

      if (targetVariableId === pointerAttachPointerId) {
        setPointerAttachError(
          displayLanguage === 'ru'
            ? 'Нельзя прикрепить указатель к самому себе.'
            : 'Cannot attach pointer to itself.'
        );
        return;
      }

      const variables = graph.variables ?? [];
      const pointerVariable = variables.find((variable) => variable.id === pointerAttachPointerId);
      if (!pointerVariable || pointerVariable.dataType !== 'pointer') {
        setPointerAttachError(
          displayLanguage === 'ru'
            ? 'Указатель не найден в списке переменных.'
            : 'Pointer variable was not found.'
        );
        cancelPointerAttach();
        return;
      }

      const targetVariable = variables.find((variable) => variable.id === targetVariableId);
      if (!targetVariable) {
        setPointerAttachError(displayLanguage === 'ru' ? 'Целевая переменная не найдена.' : 'Target variable was not found.');
        return;
      }

      const pointerMeta = normalizePointerMeta(pointerVariable.pointerMeta);

      const requiresTarget =
        pointerMeta.mode === 'weak' ||
        pointerMeta.mode === 'reference' ||
        pointerMeta.mode === 'const_reference';
      if (!requiresTarget && pointerMeta.targetVariableId === targetVariableId) {
        const detachedPointerMeta = normalizePointerMeta({
          ...pointerMeta,
          targetVariableId: undefined,
        });

        const nextVariables = variables.map((variable) => {
          if (variable.id !== pointerAttachPointerId) {
            return variable;
          }

          return {
            ...variable,
            dataType: 'pointer' as const,
            pointerMeta: detachedPointerMeta,
          };
        });

        setPointerAttachError(null);
        setPointerAttachPointerId(null);
        handleVariablesChange(nextVariables);
        return;
      }

      const resolveTargetShape = () => {
        if (targetVariable.dataType === 'pointer') {
          const targetPointerMeta = normalizePointerMeta(targetVariable.pointerMeta);
          return {
            isPointer: true as const,
            pointerMode: targetPointerMeta.mode,
            dataType: targetPointerMeta.pointeeDataType,
            vectorElementType: targetPointerMeta.pointeeVectorElementType,
          };
        }

        if (targetVariable.dataType === 'execution' || targetVariable.dataType === 'any') {
          return {
            isPointer: false as const,
            dataType: null,
          };
        }

        return {
          isPointer: false as const,
          dataType: targetVariable.dataType,
          vectorElementType:
            targetVariable.dataType === 'vector' ? (targetVariable.vectorElementType ?? 'double') : undefined,
        };
      };

      const targetShape = resolveTargetShape();
      if (!targetShape.dataType) {
        setPointerAttachError(
          displayLanguage === 'ru'
            ? 'Нельзя прикрепить указатель к переменной данного типа.'
            : 'Cannot attach pointer to this variable type.'
        );
        return;
      }

      if (pointerMeta.mode === 'weak') {
        if (!targetShape.isPointer || targetShape.pointerMode !== 'shared') {
          setPointerAttachError(
            displayLanguage === 'ru'
              ? 'Weak указатель можно прикреплять только к shared указателям.'
              : 'Weak pointers can only attach to shared pointers.'
          );
          return;
        }
      } else if (targetShape.isPointer) {
        setPointerAttachError(
          displayLanguage === 'ru'
            ? 'Эта привязка ожидает обычную переменную (не указатель).'
            : 'This binding expects a non-pointer variable.'
        );
        return;
      }

      const alignedPointerMeta = normalizePointerMeta({
        ...pointerMeta,
        pointeeDataType: targetShape.dataType,
        pointeeVectorElementType:
          targetShape.dataType === 'vector' ? (targetShape.vectorElementType ?? 'double') : undefined,
        targetVariableId,
      });

      const nextVariables = variables.map((variable) => {
        if (variable.id !== pointerAttachPointerId) {
          return variable;
        }

        return {
          ...variable,
          dataType: 'pointer' as const,
          pointerMeta: alignedPointerMeta,
          defaultValue: null,
        };
      });

      setPointerAttachError(null);
      setPointerAttachPointerId(null);
      handleVariablesChange(nextVariables);
    },
    [
      cancelPointerAttach,
      displayLanguage,
      graph.variables,
      handleVariablesChange,
      pointerAttachPointerId,
    ]
  );

  // Позволяет "снять" привязку указателя кликом по кресту на чипе прикрепления.
  // Узел диспатчит CustomEvent из BlueprintNode (без прокидывания callback-ов через node.data).
  useEffect(() => {
    const handler = (event: Event): void => {
      const customEvent = event as CustomEvent<unknown>;
      const detail = customEvent.detail;
      if (typeof detail !== 'object' || detail === null) {
        return;
      }
      const pointerVariableId = (detail as Record<string, unknown>).pointerVariableId;
      if (typeof pointerVariableId !== 'string' || pointerVariableId.trim().length === 0) {
        return;
      }

      const variables = graph.variables ?? [];
      const pointerVariable = variables.find((variable) => variable.id === pointerVariableId);
      if (!pointerVariable || pointerVariable.dataType !== 'pointer') {
        return;
      }

      const pointerMeta = normalizePointerMeta(pointerVariable.pointerMeta);
      const requiresTarget =
        pointerMeta.mode === 'weak' ||
        pointerMeta.mode === 'reference' ||
        pointerMeta.mode === 'const_reference';
      if (requiresTarget) {
        return;
      }

      if (!pointerMeta.targetVariableId) {
        return;
      }

      const nextVariables = variables.map((variable) => {
        if (variable.id !== pointerVariableId) {
          return variable;
        }

        return {
          ...variable,
          dataType: 'pointer' as const,
          pointerMeta: normalizePointerMeta({
            ...pointerMeta,
            targetVariableId: undefined,
          }),
        };
      });

      if (pointerAttachPointerId === pointerVariableId) {
        cancelPointerAttach();
      }

      handleVariablesChange(nextVariables);
    };

    window.addEventListener('multicode:pointer-detach', handler as EventListener);
    return () => window.removeEventListener('multicode:pointer-detach', handler as EventListener);
  }, [
    cancelPointerAttach,
    graph.variables,
    handleVariablesChange,
    pointerAttachPointerId,
  ]);
  
  // Delete selected nodes
  const handleDeleteSelected = useCallback(() => {
    const selectedNodeIds = new Set(nodes.filter(n => n.selected).map(n => n.id));
    
    const newNodes = nodes.filter(n => !n.selected);
    const newEdges = edges.filter(e => 
      !e.selected && !selectedNodeIds.has(e.source) && !selectedNodeIds.has(e.target)
    );
    
    setNodes(newNodes);
    setEdges(newEdges);
    setTimeout(() => notifyGraphChange(newNodes, newEdges), 0);
  }, [nodes, edges, setNodes, setEdges, notifyGraphChange]);
  
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
      const isInputFocused = isTextInputContext(e.target);
      const dialogOpen = isAnyDialogOpen();

      // Когда открыт модальный редактор графа функции (вариант 2, UE-style),
      // фоновые хоткеи основного EventGraph должны быть полностью заблокированы.
      // Исключение: Esc закрывает модалку.
      if (uiMode === 'default' && functionGraphDialogFunctionId) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setFunctionGraphDialogFunctionId(null);
        }
        return;
      }

      if (e.key === 'Escape' && pointerAttachPointerId) {
        e.preventDefault();
        cancelPointerAttach();
        return;
      }
      // Когда открыт модальный диалог (переменные/функции), графовые хоткеи выключаем.
      // Это предотвращает конфликт Ctrl+V/C/Z между полями формы и canvas.
      if (dialogOpen && !isInputFocused) {
        return;
      }
      
      // Ctrl+Z - Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey && !isInputFocused) {
        e.preventDefault();
        handleUndo();
        return;
      }
      
      // Ctrl+Shift+Z или Ctrl+Y - Redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey)) && !isInputFocused) {
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
    handleDeleteSelected, handleZoomToFit, handleSelectAll, handleAutoLayout,
    cancelPointerAttach, pointerAttachPointerId, functionGraphDialogFunctionId, uiMode
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
    functions: displayLanguage === 'ru' ? 'Функции' : 'Functions',
    pointers: displayLanguage === 'ru' ? 'Указатели' : 'Pointers',
    undo: displayLanguage === 'ru' ? 'Отменить' : 'Undo',
    redo: displayLanguage === 'ru' ? 'Повторить' : 'Redo',
    fit: displayLanguage === 'ru' ? 'Вписать (F)' : 'Fit (F)',
    layout: displayLanguage === 'ru' ? 'Автолейаут (L)' : 'Layout (L)',
    eventGraph: 'EventGraph',
  }), [displayLanguage]);
  
  // Заголовок текущего графа
  const currentGraphTitle = useMemo(() => {
    if (effectiveActiveFunctionId && graph.functions) {
      const func = graph.functions.find(f => f.id === effectiveActiveFunctionId);
      if (func) {
        return displayLanguage === 'ru' ? func.nameRu : func.name;
      }
    }
    return t.eventGraph;
  }, [effectiveActiveFunctionId, graph.functions, displayLanguage, t.eventGraph]);

  const functionGraphDialogTitle = useMemo(() => {
    if (!functionGraphDialogFunctionId) {
      return '';
    }
    const func = graph.functions?.find((f) => f.id === functionGraphDialogFunctionId);
    if (!func) {
      return displayLanguage === 'ru' ? 'Функция' : 'Function';
    }
    return displayLanguage === 'ru' ? (func.nameRu || func.name) : func.name;
  }, [displayLanguage, functionGraphDialogFunctionId, graph.functions]);

  const previewGraph = useMemo(() => ({
    ...graph,
    nodes: Array.isArray(graph.nodes) ? graph.nodes : [],
    edges: Array.isArray(graph.edges) ? graph.edges : [],
  }), [graph]);

  const hasLeftSidebar = functionPanelVisible || variablePanelVisible || pointerPanelVisible;
  const expandedSidebarSections =
    (functionPanelVisible && !isFunctionsSectionCollapsed ? 1 : 0) +
    (variablePanelVisible && !isVariablesSectionCollapsed ? 1 : 0) +
    (pointerPanelVisible && !isPointersSectionCollapsed ? 1 : 0);
  const shouldBalanceExpandedSections = expandedSidebarSections > 1;

  useEffect(() => {
    const detail = {
      category: 'blueprint:sidebar',
      message: 'sidebar-state-changed',
      data: {
        graphId: graph.id,
        activeFunctionId: effectiveActiveFunctionId,
        functionPanelVisible,
        variablePanelVisible,
        pointerPanelVisible,
        isFunctionsSectionCollapsed,
        isVariablesSectionCollapsed,
        isPointersSectionCollapsed,
        variablesCount: Array.isArray(graph.variables) ? graph.variables.length : 0,
      },
    };
    window.dispatchEvent(new CustomEvent('multicode:ui-trace', { detail }));
  }, [
    effectiveActiveFunctionId,
    functionPanelVisible,
    graph.id,
    graph.variables,
    isFunctionsSectionCollapsed,
    isPointersSectionCollapsed,
    isVariablesSectionCollapsed,
    pointerPanelVisible,
    variablePanelVisible,
  ]);
  
  return (
    <div ref={reactFlowWrapper} style={editorStyles.container}>
      {hasLeftSidebar && (
        <div className="left-sidebar-stack">
          {functionPanelVisible && (
            <div
              className={`left-sidebar-section ${isFunctionsSectionCollapsed ? 'collapsed' : ''} ${shouldBalanceExpandedSections && !isFunctionsSectionCollapsed ? 'balanced' : ''}`}
            >
              <FunctionListPanel
                graphState={graph}
                onFunctionsChange={handleFunctionsChange}
                onSelectFunction={handleSelectFunction}
                activeFunctionId={effectiveActiveFunctionId}
                displayLanguage={displayLanguage}
                collapsed={isFunctionsSectionCollapsed}
                onToggleCollapsed={() => setIsFunctionsSectionCollapsed(value => !value)}
              />
            </div>
          )}

          {functionPanelVisible && (variablePanelVisible || pointerPanelVisible) && (
            <div className="left-sidebar-divider" />
          )}

          {variablePanelVisible && (
            <div
              className={`left-sidebar-section ${isVariablesSectionCollapsed ? 'collapsed' : ''} ${shouldBalanceExpandedSections && !isVariablesSectionCollapsed ? 'balanced' : ''}`}
            >
              <VariableListPanel
                graphState={graph}
                onVariablesChange={handleVariablesChange}
                onCreateGetVariable={handleCreateGetVariable}
                onCreateSetVariable={handleCreateSetVariable}
                displayLanguage={displayLanguage}
                resolvedVariableValues={resolvedVariableValues}
                collapsed={isVariablesSectionCollapsed}
                onToggleCollapsed={() => setIsVariablesSectionCollapsed(value => !value)}
              />
            </div>
          )}

          {variablePanelVisible && pointerPanelVisible && (
            <div className="left-sidebar-divider" />
          )}

          {pointerPanelVisible && (
            <div
              className={`left-sidebar-section ${isPointersSectionCollapsed ? 'collapsed' : ''} ${shouldBalanceExpandedSections && !isPointersSectionCollapsed ? 'balanced' : ''}`}
            >
              <PointerReferencePanel
                graphState={graph}
                onVariablesChange={handleVariablesChange}
                onCreateGetVariable={handleCreateGetVariable}
                onCreateSetVariable={handleCreateSetVariable}
                onRequestAttachToNode={handleRequestAttachPointer}
                attachModePointerId={pointerAttachPointerId}
                displayLanguage={displayLanguage}
                collapsed={isPointersSectionCollapsed}
                onToggleCollapsed={() => setIsPointersSectionCollapsed(value => !value)}
              />
            </div>
          )}
        </div>
      )}
      
      <div style={editorStyles.graphContainer}>
        {pointerAttachPointerId && (
          <div
            style={{
              position: 'absolute',
              top: 52,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 35,
              maxWidth: 520,
              padding: '10px 12px',
              borderRadius: 6,
              backgroundColor: '#313244',
              borderLeft: '4px solid #89b4fa',
              color: '#cdd6f4',
              fontSize: 12,
              lineHeight: 1.4,
              boxShadow: '0 6px 20px rgba(0, 0, 0, 0.35)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
            data-testid="pointer-attach-banner"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div>
                <strong>
                  {displayLanguage === 'ru' ? 'Режим привязки' : 'Attach mode'}
                </strong>
                <div>
                  {displayLanguage === 'ru'
                    ? `Кликните по ноде переменной, чтобы прикрепить указатель${pointerAttachPointerName ? ` «${pointerAttachPointerName}»` : ''}.`
                    : `Click a variable node to attach${pointerAttachPointerName ? ` “${pointerAttachPointerName}”` : ''}.`}
                  {' '}
                  <span style={{ color: '#a6adc8' }}>
                    {displayLanguage === 'ru' ? 'Esc — отмена.' : 'Esc to cancel.'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={cancelPointerAttach}
                style={{
                  border: '1px solid #45475a',
                  background: 'rgba(0,0,0,0.25)',
                  color: '#cdd6f4',
                  borderRadius: 6,
                  padding: '6px 10px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {displayLanguage === 'ru' ? 'Отмена' : 'Cancel'}
              </button>
            </div>
            {pointerAttachError && (
              <div style={{ color: '#f38ba8' }}>
                {pointerAttachError}
              </div>
            )}
          </div>
        )}
        {/* Табы: показывать текущий граф (в модальном редакторе функции скрываем) */}
        {!isFunctionModal && (
          <div className="graph-tabs">
            <button
              className={`graph-tab ${effectiveActiveFunctionId === null ? 'active' : ''}`}
              onClick={() => handleSelectFunction(null)}
            >
              <span className="graph-tab-icon">📊</span>
              {t.eventGraph}
            </button>
            {effectiveActiveFunctionId && (
              <button
                className="graph-tab active"
                // Активная вкладка не реагирует на клик (стандартное UI поведение)
                // Для переключения используй FunctionListPanel или вкладку EventGraph
              >
                <span className="graph-tab-icon">ƒ</span>
                {currentGraphTitle}
              </button>
            )}
          </div>
        )}

        {normalizationToast && (
          <div
            style={{
              position: 'absolute',
              top: 52,
              right: 12,
              zIndex: 30,
              maxWidth: 420,
              padding: '10px 12px',
              borderRadius: 6,
              backgroundColor: '#313244',
              borderLeft: '4px solid #f9e2af',
              color: '#cdd6f4',
              fontSize: 12,
              lineHeight: 1.4,
              boxShadow: '0 6px 20px rgba(0, 0, 0, 0.35)',
            }}
          >
            {normalizationToast}
          </div>
        )}
        
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onNodeClick={handleNodeClick}
          onEdgeDoubleClick={handleEdgeDoubleClick}
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
            <div className="editor-toolbar">
              {/* Добавить узел */}
              <button
                onClick={() => setPaletteVisible(v => !v)}
                className={`panel-btn ${paletteVisible ? 'active' : ''}`}
              >
                <span>+</span>
                <span>{t.add}</span>
              </button>
              
              {/* Код */}
              <button
                onClick={() => setCodePreviewVisible(v => !v)}
                className={`panel-btn ${codePreviewVisible ? 'active' : ''}`}
              >
                <span>{'</>'}</span>
                <span>{t.code}</span>
              </button>
              
              {/* Пакеты */}
              <button
                onClick={() => setPackageManagerVisible(v => !v)}
                className={`panel-btn ${packageManagerVisible ? 'active' : ''}`}
              >
                <span>📦</span>
                <span>{t.packages}</span>
              </button>
              
              {/* Функции (скрываем в модальном редакторе функции) */}
              {!isFunctionModal && (
                <button
                  onClick={() => setFunctionPanelVisible(v => !v)}
                  className={`panel-btn ${functionPanelVisible ? 'active-purple' : ''}`}
                >
                  <span>ƒ</span>
                  <span>{t.functions}</span>
                </button>
              )}
              
              {/* Переменные */}
              <button
                onClick={() => setVariablePanelVisible(v => !v)}
                className={`panel-btn ${variablePanelVisible ? 'active-green' : ''}`}
              >
                <span>📊</span>
                <span>{displayLanguage === 'ru' ? 'Переменные' : 'Variables'}</span>
              </button>

              <button
                onClick={() => setPointerPanelVisible(v => !v)}
                className={`panel-btn ${pointerPanelVisible ? 'active-green' : ''}`}
              >
                <span>🔗</span>
                <span>{t.pointers}</span>
              </button>
              
              {/* Разделитель */}
              <div className="panel-divider" />
              
              {/* Undo */}
              <button
                onClick={handleUndo}
                disabled={!historyState.canUndo}
                title={`${t.undo} (Ctrl+Z)`}
                className="panel-btn panel-btn-icon"
              >
                ↶
              </button>
              
              {/* Redo */}
              <button
                onClick={handleRedo}
                disabled={!historyState.canRedo}
                title={`${t.redo} (Ctrl+Y)`}
                className="panel-btn panel-btn-icon"
              >
                ↷
              </button>
              
              {/* Zoom to Fit */}
              <button
                onClick={handleZoomToFit}
                title={t.fit}
                className="panel-btn panel-btn-icon"
              >
                ⊡
              </button>
              
              {/* Auto Layout */}
              <button
                onClick={handleAutoLayout}
                title={t.layout}
                className="panel-btn panel-btn-icon"
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
            onAddCallFunction={handleAddCallFunction}
            nodeDefinitions={packageNodeDefinitions}
            categories={packageCategories}
            userFunctions={graph.functions ?? []}
          />
        </ReactFlow>
      </div>
      
      {/* Панель предпросмотра кода */}
      <CodePreviewPanel
        graph={previewGraph}
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

      {/* Модальный редактор графа функции (вариант 2, UE Blueprints-style) */}
      {uiMode === 'default' && functionGraphDialogFunctionId && (
        <div
          className="function-graph-dialog-overlay"
          data-testid="function-graph-dialog-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setFunctionGraphDialogFunctionId(null);
            }
          }}
        >
          <div
            className="function-graph-dialog"
            data-testid="function-graph-dialog"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="function-graph-dialog-header">
              <div className="function-graph-dialog-title">
                <span className="function-graph-dialog-icon">ƒ</span>
                <span>{functionGraphDialogTitle}</span>
              </div>
              <button
                type="button"
                className="function-graph-dialog-close"
                onClick={() => setFunctionGraphDialogFunctionId(null)}
                title={displayLanguage === 'ru' ? 'Закрыть' : 'Close'}
                aria-label={displayLanguage === 'ru' ? 'Закрыть' : 'Close'}
              >
                ×
              </button>
            </div>
            <div className="function-graph-dialog-body">
              <BlueprintEditor
                graph={graph}
                onGraphChange={onGraphChange}
                displayLanguage={displayLanguage}
                forcedActiveFunctionId={functionGraphDialogFunctionId}
                uiMode="function-modal"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Wrapper with ReactFlowProvider
export function BlueprintEditor(props: BlueprintEditorProps) {
  return (
    <ReactFlowProvider>
      <BlueprintEditorInner {...props} />
    </ReactFlowProvider>
  );
}

export default BlueprintEditor;

