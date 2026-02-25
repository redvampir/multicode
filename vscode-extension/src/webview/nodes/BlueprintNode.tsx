/**
 * BlueprintNode — кастомный компонент узла для React Flow
 * Визуальный стиль в стиле flow-based программирования
 */

import React, { memo, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Handle, Position, type Node, type Edge } from '@xyflow/react';
import { 
  BlueprintNode as BlueprintNodeType, 
  NodePort,
  NODE_TYPE_DEFINITIONS,
  BlueprintNodeType as NodeTypeEnum,
  VARIABLE_TYPE_COLORS,
  normalizePointerMeta,
  type VectorElementType,
} from '../../shared/blueprintTypes';
import { PORT_TYPE_COLORS, type PortDataType } from '../../shared/portTypes';
import { getIconForCategory } from '../../shared/iconMap';
import {
  formatVectorInput,
  parseArrayInput,
  parseVectorInput,
  supportsArrayDataType,
} from '../../shared/vectorValue';
import {
  type AvailableVariableBinding,
  formatVariableValueForDisplay,
  getEffectiveSetInputValue,
  getVariableNodeTitle,
  resolveVariableForNode,
} from '../variableNodeBinding';
import type { ResolvedVariableValues } from '../variableValueResolver';

/** CSS стили для узла (inline для webview совместимости) */
const styles = {
  node: {
    minWidth: 180,
    backgroundColor: '#1e1e2e',
    borderRadius: 6,
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: 12,
    overflow: 'visible',
    position: 'relative',
    border: '1px solid #313244',
  } as React.CSSProperties,
  nodeSelected: {
    border: '2px solid #89b4fa',
    boxShadow: '0 0 20px rgba(137, 180, 250, 0.3)',
  } as React.CSSProperties,
  header: {
    padding: '8px 12px',
    color: '#cdd6f4',
    fontWeight: 600,
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    position: 'relative',
    minHeight: 38,
  } as React.CSSProperties,
  content: {
    padding: '4px 0',
  } as React.CSSProperties,
  // 🎨 НАСТРОЙКА: Контейнер строки с портом
  portRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 12px',        // 🎨 НАСТРОЙКА: Вертикальные/горизонтальные отступы вокруг порта
    position: 'relative',
    minHeight: 48,               // 🎨 НАСТРОЙКА: Минимальная высота строки (расстояние между портами)
  } as React.CSSProperties,
  // 🎨 НАСТРОЙКА: Стиль текста названия порта
  portLabel: {
    color: '#a6adc8',            // 🎨 НАСТРОЙКА: Цвет текста названия порта
    fontSize: 11,                 // 🎨 НАСТРОЙКА: Размер шрифта названия порта
    flex: 1,
  } as React.CSSProperties,
  portLabelLeft: {
    textAlign: 'left',
    marginLeft: 12,              // 🎨 НАСТРОЙКА: Расстояние от порта до текста (входные порты)
  } as React.CSSProperties,
  portLabelRight: {
    textAlign: 'right',
    marginRight: 12,             // 🎨 НАСТРОЙКА: Расстояние от порта до текста (выходные порты)
  } as React.CSSProperties,
  // 🎨 НАСТРОЙКА: Стиль EXEC портов (ромбики для потока выполнения)
  execHandle: {
    width: 12,                   // 🎨 НАСТРОЙКА: Ширина exec порта (ромбика)
    height: 12,                  // 🎨 НАСТРОЙКА: Высота exec порта (ромбика)
    background: '#e0e0e0',
    border: '2px solid #666666', // 🎨 НАСТРОЙКА: Толщина рамки exec порта
    borderRadius: 2,             // 🎨 НАСТРОЙКА: Скругление углов exec порта
    transform: 'rotate(45deg)',  // Поворот на 45° для создания ромба (не трогать)
  } as React.CSSProperties,
  // 🎨 НАСТРОЙКА: Стиль DATA портов (кружки для данных)
  dataHandle: {
    width: 10,                   // 🎨 НАСТРОЙКА: Ширина data порта (кружка)
    height: 10,                  // 🎨 НАСТРОЙКА: Высота data порта (кружка)
    borderRadius: '50%',         // 🎨 НАСТРОЙКА: Форма порта ('50%' = круг, '0' = квадрат, '4px' = скруглённый)
    border: '2px solid',         // 🎨 НАСТРОЙКА: Толщина рамки data порта
  } as React.CSSProperties,
  inputSection: {
    borderTop: '1px solid #313244',
  } as React.CSSProperties,
  outputSection: {
    borderTop: '1px solid #313244',
  } as React.CSSProperties,
};

/** Компонент порта (Handle) */
const PortHandle: React.FC<{
  port: NodePort;
  isInput: boolean;
  displayLanguage: 'ru' | 'en';
}> = memo(({ port, isInput, displayLanguage }) => {
  const isExec = port.dataType === 'execution';
  const isPointer = port.dataType === 'pointer'; // 🔗 Проверяем, является ли порт указателем
  const color = PORT_TYPE_COLORS[port.dataType];
  const localizedPortName = displayLanguage === 'ru'
    ? (port.nameRu ?? port.name)
    : (port.name ?? port.nameRu ?? '');
  const handleClassName = [
    'bp-handle',
    isExec ? 'bp-handle-exec' : 'bp-handle-data',
    isInput ? 'bp-handle-input' : 'bp-handle-output',
    isExec
      ? `bp-handle-exec-${isInput ? 'in' : 'out'}`
      : `bp-handle-data-${isInput ? 'in' : 'out'}`,
  ].join(' ');
  
  const handleStyle: React.CSSProperties = isExec
    ? {
        ...styles.execHandle,
        background: port.connected ? color.main : 'transparent',
        borderColor: color.main,
      }
    : {
        ...styles.dataHandle,
        background: port.connected ? color.main : 'transparent',
        borderColor: color.main,
        // 🔗 Пунктирная рамка для указателей
        ...(isPointer ? { borderStyle: 'dashed', borderWidth: 2 } : {}),
      };

  return (
    <div style={styles.portRow}>
      <Handle
        type={isInput ? 'target' : 'source'}
        position={isInput ? Position.Left : Position.Right}
        id={port.id}
        className={handleClassName}
        style={{
          ...handleStyle,
          // 🎨 НАСТРОЙКА: Позиция порта относительно края узла (отрицательное = торчит наружу)
          [isInput ? 'left' : 'right']: -6,
          top: '50%',
          transform: isExec ? 'translateY(-50%) rotate(45deg)' : 'translateY(-50%)',
        }}
        isConnectable={true}
      />
      {localizedPortName && (
        <span
          style={{
            ...styles.portLabel,
            ...(isInput ? styles.portLabelLeft : styles.portLabelRight),
            color: color.main,
          }}
        >
          {/* 🔗 Иконка указателя */}
          {isPointer && isInput && (
            <span style={{ marginRight: 4, fontWeight: 700 }}>→</span>
          )}
          {localizedPortName}
          {isPointer && !isInput && (
            <span style={{ marginLeft: 4, fontWeight: 700 }}>→</span>
          )}
        </span>
      )}
    </div>
  );
});

PortHandle.displayName = 'PortHandle';

/** Разделить порты на exec и data */
function splitPorts(ports: NodePort[]): { exec: NodePort[]; data: NodePort[] } {
  const exec: NodePort[] = [];
  const data: NodePort[] = [];
  
  for (const port of ports) {
    if (port.dataType === 'execution') {
      exec.push(port);
    } else {
      data.push(port);
    }
  }
  
  return { exec, data };
}

/** Основной компонент узла — данные хранятся в node.data */
export interface BlueprintNodeData extends Record<string, unknown> {
  node: BlueprintNodeType;
  displayLanguage: 'ru' | 'en';
  onLabelChange?: (nodeId: string, newLabel: string) => void;
  onPropertyChange?: (nodeId: string, property: string, value: unknown) => void;
  onPortValueChange?: (nodeId: string, portId: string, value: string | number | boolean) => void;
  availableVariables?: AvailableVariableBinding[]; // Для селектора указателей и синхронизации variable-узлов
  resolvedVariableValues?: ResolvedVariableValues;
}

const VECTOR_ELEMENT_TYPES: VectorElementType[] = [
  'int32',
  'int64',
  'float',
  'double',
  'bool',
  'string',
];

const isVectorElementType = (value: unknown): value is VectorElementType =>
  typeof value === 'string' && VECTOR_ELEMENT_TYPES.includes(value as VectorElementType);

const PORT_DATA_TYPES: PortDataType[] = [
  'execution',
  'bool',
  'int32',
  'int64',
  'float',
  'double',
  'string',
  'vector',
  'pointer',
  'class',
  'array',
  'any',
];

const isPortDataTypeValue = (value: unknown): value is PortDataType =>
  typeof value === 'string' && PORT_DATA_TYPES.includes(value as PortDataType);

interface PrintEscapeHelpItem {
  token: string;
  descriptionRu: string;
  descriptionEn: string;
}

const PRINT_ESCAPE_HELP_ITEMS: ReadonlyArray<PrintEscapeHelpItem> = [
  { token: '\\n', descriptionRu: 'Новая строка', descriptionEn: 'New line' },
  { token: '\\t', descriptionRu: 'Табуляция', descriptionEn: 'Tab' },
  { token: '\\r', descriptionRu: 'Возврат каретки', descriptionEn: 'Carriage return' },
  { token: '\\\\', descriptionRu: 'Обратный слэш', descriptionEn: 'Backslash' },
  { token: '\\"', descriptionRu: 'Двойная кавычка', descriptionEn: 'Double quote' },
  { token: "\\'", descriptionRu: 'Одинарная кавычка', descriptionEn: 'Single quote' },
  { token: '\\0', descriptionRu: 'Нулевой символ', descriptionEn: 'Null character' },
  { token: '\\b', descriptionRu: 'Шаг назад (backspace)', descriptionEn: 'Backspace' },
  { token: '\\f', descriptionRu: 'Перевод страницы (form feed)', descriptionEn: 'Form feed' },
  { token: '\\v', descriptionRu: 'Вертикальная табуляция', descriptionEn: 'Vertical tab' },
  { token: '\\a', descriptionRu: 'Сигнал (bell)', descriptionEn: 'Bell' },
  { token: '\\xNN', descriptionRu: 'Байт в hex (например \\x41)', descriptionEn: 'Hex byte (for example \\x41)' },
  { token: '\\uNNNN', descriptionRu: 'Unicode (16-bit)', descriptionEn: 'Unicode escape (16-bit)' },
  { token: '\\UNNNNNNNN', descriptionRu: 'Unicode (32-bit)', descriptionEn: 'Unicode escape (32-bit)' },
];

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

const VARIADIC_ARITHMETIC_NODE_TYPES = new Set<NodeTypeEnum>([
  'Add',
  'Subtract',
  'Multiply',
  'Divide',
  'Modulo',
]);

const normalizeArrayRank = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (value === true) {
    return 1;
  }
  return 0;
};

const resolveArrayRank = (
  dataType: PortDataType | undefined,
  rank: unknown,
  isArray: unknown
): number => {
  if (!dataType || !supportsArrayDataType(dataType)) {
    return 0;
  }
  const normalized = normalizeArrayRank(rank);
  if (normalized > 0) {
    return normalized;
  }
  return isArray === true ? 1 : 0;
};

/** Тип узла для React Flow */
export type BlueprintFlowNode = Node<BlueprintNodeData, 'blueprint'>;

/** Данные ребра */
export interface BlueprintEdgeData extends Record<string, unknown> {
  sourcePortType?: string;
  targetPortType?: string;
}

/** Тип ребра для React Flow */
export type BlueprintFlowEdge = Edge<BlueprintEdgeData>;

/** Props для кастомного узла */
interface BlueprintNodeComponentProps {
  data: BlueprintNodeData;
  selected?: boolean;
}

const BlueprintNodeComponent: React.FC<BlueprintNodeComponentProps> = ({ 
  data, 
  selected,
}) => {
  const { node, displayLanguage, onLabelChange, onPropertyChange, onPortValueChange } = data;
  const definition = NODE_TYPE_DEFINITIONS[node.type as NodeTypeEnum];
  
  // Inline editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [vectorInputDraft, setVectorInputDraft] = useState('[]');
  const [vectorInputError, setVectorInputError] = useState<string | null>(null);
  const [isPrintHelpVisible, setIsPrintHelpVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const printTextAreaRef = useRef<HTMLTextAreaElement>(null);
  
  // Определяем, является ли узел переменным
  const isVariableNode = node.type === 'Variable' || node.type === 'SetVariable' || node.type === 'GetVariable';
  const isSetVariable = node.type === 'SetVariable';
  const isGetVariable = node.type === 'GetVariable';
  const isBranchNode = node.type === 'Branch';
  const isSwitchNode = node.type === 'Switch';
  const isPrintNode = node.type === 'Print';
  const isConstNumberNode = node.type === 'ConstNumber';
  const isConstStringNode = node.type === 'ConstString';
  const isConstBoolNode = node.type === 'ConstBool';
  const isVariadicArithmeticNode = VARIADIC_ARITHMETIC_NODE_TYPES.has(node.type as NodeTypeEnum);
  const isArithmeticNode = isVariadicArithmeticNode;
  const literalProperties = (typeof node.properties === 'object' && node.properties !== null)
    ? (node.properties as Record<string, unknown>)
    : undefined;
  const literalNumberValue = typeof literalProperties?.value === 'number'
    ? literalProperties.value
    : typeof node.outputs[0]?.defaultValue === 'number'
      ? node.outputs[0].defaultValue
      : 0;
  const literalStringValue = typeof literalProperties?.value === 'string'
    ? literalProperties.value
    : typeof node.outputs[0]?.defaultValue === 'string'
      ? node.outputs[0].defaultValue
      : '';
  const literalBoolValue = typeof literalProperties?.value === 'boolean'
    ? literalProperties.value
    : typeof node.outputs[0]?.defaultValue === 'boolean'
      ? node.outputs[0].defaultValue
      : false;
  const resolvedVariable = resolveVariableForNode(node, data.availableVariables);
  const resolvedVariableValue = resolvedVariable
    ? data.resolvedVariableValues?.[resolvedVariable.id]
    : undefined;
  const variableDataType = resolvedVariable?.dataType
    ?? (isPortDataTypeValue(node.properties?.dataType)
      ? node.properties.dataType
      : undefined);
  const pointerMeta = variableDataType === 'pointer'
    ? normalizePointerMeta(resolvedVariable?.pointerMeta ?? node.properties?.pointerMeta)
    : undefined;
  const isReferenceMode = pointerMeta?.mode === 'reference' || pointerMeta?.mode === 'const_reference';
  const shouldTreatPointerAsPointee =
    Boolean(pointerMeta) &&
    pointerMeta?.mode !== 'weak' &&
    pointerMeta?.pointeeDataType !== 'class' &&
    pointerMeta?.pointeeDataType !== 'array' &&
    (isReferenceMode || Boolean(pointerMeta?.targetVariableId));
  const effectiveVariableDataType = shouldTreatPointerAsPointee
    ? pointerMeta?.pointeeDataType
    : variableDataType;
  const variableArrayRank = resolveArrayRank(
    effectiveVariableDataType,
    resolvedVariable?.arrayRank ?? node.properties?.arrayRank,
    resolvedVariable?.isArray ?? node.properties?.isArray
  );
  const isArrayVariable = variableArrayRank > 0;
  const vectorElementType: VectorElementType = isVectorElementType(resolvedVariable?.vectorElementType)
    ? resolvedVariable.vectorElementType
    : isVectorElementType(node.properties?.vectorElementType)
      ? node.properties.vectorElementType
      : 'double';
  const variableName = resolvedVariable
    ? (displayLanguage === 'ru'
      ? (resolvedVariable.nameRu || resolvedVariable.name)
      : (resolvedVariable.name || resolvedVariable.nameRu))
    : undefined;
  const pointerTarget = pointerMeta?.targetVariableId
    ? data.availableVariables?.find((candidate) => candidate.id === pointerMeta.targetVariableId)
    : undefined;
  const pointerTargetName = pointerTarget
    ? (displayLanguage === 'ru'
      ? (pointerTarget.nameRu || pointerTarget.name)
      : (pointerTarget.name || pointerTarget.nameRu))
    : undefined;
  const pointerModeLabel = pointerMeta
    ? (() => {
        switch (pointerMeta.mode) {
          case 'shared':
            return displayLanguage === 'ru' ? 'общий' : 'shared';
          case 'unique':
            return displayLanguage === 'ru' ? 'уникальный' : 'unique';
          case 'weak':
            return displayLanguage === 'ru' ? 'слабый' : 'weak';
          case 'raw':
            return displayLanguage === 'ru' ? 'сырой' : 'raw';
          case 'reference':
            return displayLanguage === 'ru' ? 'ссылка' : 'reference';
          case 'const_reference':
            return displayLanguage === 'ru' ? 'const ссылка' : 'const reference';
          default:
            return pointerMeta.mode;
        }
      })()
    : '';
  
  // Определяем тип переменной для выбора редактора
  const isNumericType = ['int32', 'int64', 'float', 'double'].includes(effectiveVariableDataType ?? '');
  const isFloatType = ['float', 'double'].includes(effectiveVariableDataType ?? '');
  
  // Проверяем, подключён ли входной порт данных (value-in)
  const valueInputPort = node.inputs.find((port) => port.id === 'value-in' || port.id.endsWith('-value-in'));
  const isValueInputConnected = valueInputPort?.connected ?? false;
  const effectiveSetInputValue = getEffectiveSetInputValue(node, resolvedVariable?.defaultValue);
  const printValueInputPort = isPrintNode
    ? node.inputs.find((port) => port.id === 'string' || port.id.endsWith('-string'))
    : undefined;
  const isPrintValueConnected = printValueInputPort?.connected ?? false;
  const printLiteralValue = (() => {
    if (!printValueInputPort) {
      return '';
    }
    if (typeof printValueInputPort.value === 'string') {
      return printValueInputPort.value;
    }
    if (typeof printValueInputPort.defaultValue === 'string') {
      return printValueInputPort.defaultValue;
    }
    return '';
  })();
  
  const defaultLabel = displayLanguage === 'ru' 
    ? (definition?.labelRu ?? node.label)
    : (definition?.label ?? node.label);
  const nodeTitle = isVariableNode
    ? getVariableNodeTitle(node.type, variableName, defaultLabel)
    : defaultLabel;
  
  // Use custom label if set, otherwise use default
  const displayLabel = node.customLabel ?? nodeTitle;

  const attachedPointers = useMemo(() => {
    if (!resolvedVariable || resolvedVariable.dataType === 'pointer') {
      return [];
    }

    const variableId = resolvedVariable.id;
    const available = data.availableVariables ?? [];

    return available
      .filter((candidate) => {
        if (candidate.dataType !== 'pointer') {
          return false;
        }
        const meta = normalizePointerMeta(candidate.pointerMeta);
        return meta.targetVariableId === variableId;
      })
      .map((candidate) => {
        const meta = normalizePointerMeta(candidate.pointerMeta);
        const name = displayLanguage === 'ru'
          ? (candidate.nameRu || candidate.name || candidate.codeName || candidate.id)
          : (candidate.name || candidate.nameRu || candidate.codeName || candidate.id);
        const modeLabel = displayLanguage === 'ru'
          ? (() => {
              switch (meta.mode) {
                case 'shared':
                  return 'общий';
                case 'unique':
                  return 'уникальный';
                case 'weak':
                  return 'слабый';
                case 'raw':
                  return 'сырой';
                case 'reference':
                  return 'ссылка';
                case 'const_reference':
                  return 'const ссылка';
                default:
                  return meta.mode;
              }
            })()
          : meta.mode;

        return {
          id: candidate.id,
          name,
          modeLabel,
        };
      });
  }, [data.availableVariables, displayLanguage, resolvedVariable]);
  
  // 🎨 Динамический цвет шапки: для переменных используем цвет типа данных
  const variableHeaderColor = resolvedVariable?.color
    ?? (effectiveVariableDataType
      ? VARIABLE_TYPE_COLORS[isArrayVariable ? 'array' : effectiveVariableDataType]
      : undefined);
  const headerColor = isVariableNode
    ? (variableHeaderColor ?? definition?.headerColor ?? '#6c7086')
    : (definition?.headerColor ?? '#6c7086');
    
  const iconSrc = getIconForCategory(definition?.category ?? 'other');
  
  const inputPorts = splitPorts(node.inputs);
  const outputPorts = splitPorts(node.outputs);
  const switchCasePorts = isSwitchNode
    ? node.outputs
        .filter(isSwitchCaseOutputPort)
        .map((port) => ({
          port,
          caseValue: getSwitchCaseValue(port),
        }))
        .sort((a, b) => a.caseValue - b.caseValue)
    : [];
  const switchSelectionInputPort = isSwitchNode
    ? node.inputs.find((port) => port.id === 'selection' || port.id.endsWith('-selection'))
    : undefined;
  const isSwitchSelectionConnected = switchSelectionInputPort?.connected ?? false;
  const switchInitEnabled = literalProperties?.switchInitEnabled === true;
  const switchInitValue = typeof literalProperties?.switchInit === 'string'
    ? literalProperties.switchInit
    : '';
  
  // Exec порты отображаются в заголовке
  const hasExecIn = inputPorts.exec.length > 0;
  const hasExecOut = outputPorts.exec.length > 0;
  
  // Start editing on double click
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(node.customLabel ?? '');
    setIsEditing(true);
  }, [node.customLabel]);
  
  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);
  
  // Handle input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEditValue(e.target.value);
  }, []);
  
  // Commit edit
  const commitEdit = useCallback(() => {
    const trimmed = editValue.trim();
    if (onLabelChange) {
      // Empty string means reset to default
      onLabelChange(node.id, trimmed);
    }
    setIsEditing(false);
  }, [editValue, node.id, onLabelChange]);
  
  // Cancel edit
  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditValue('');
  }, []);
  
  // Handle keyboard
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
    e.stopPropagation();
  }, [commitEdit, cancelEdit]);
  
  // Handle blur
  const handleBlur = useCallback(() => {
    commitEdit();
  }, [commitEdit]);

  const setSetNodeInputValue = useCallback((nextValue: unknown): void => {
    if (!onPropertyChange) {
      return;
    }
    onPropertyChange(node.id, 'inputValue', nextValue);
    onPropertyChange(node.id, 'inputValueIsOverride', true);
  }, [node.id, onPropertyChange]);

  const setLiteralNodeValue = useCallback((nextValue: unknown): void => {
    if (!onPropertyChange) {
      return;
    }
    onPropertyChange(node.id, 'value', nextValue);
  }, [node.id, onPropertyChange]);

  const handleAddMathOperand = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!onPropertyChange) {
      return;
    }
    onPropertyChange(node.id, '__addMathOperand', true);
  }, [node.id, onPropertyChange]);

  const handleAppendElseIfBranch = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!onPropertyChange) {
      return;
    }
    onPropertyChange(node.id, '__appendElseIfBranch', true);
  }, [node.id, onPropertyChange]);

  const handleAddSwitchCase = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!onPropertyChange) {
      return;
    }
    onPropertyChange(node.id, '__addSwitchCase', true);
  }, [node.id, onPropertyChange]);

  const resizePrintTextArea = useCallback(() => {
    const textArea = printTextAreaRef.current;
    if (!textArea) {
      return;
    }
    textArea.style.height = 'auto';
    const clampedHeight = Math.min(220, Math.max(52, textArea.scrollHeight));
    textArea.style.height = `${clampedHeight}px`;
    textArea.style.overflowY = textArea.scrollHeight > 220 ? 'auto' : 'hidden';
  }, []);

  const updatePrintLiteral = useCallback((nextValue: string) => {
    if (!onPortValueChange || !printValueInputPort) {
      return;
    }
    onPortValueChange(node.id, printValueInputPort.id, nextValue);
  }, [node.id, onPortValueChange, printValueInputPort]);

  const insertPrintSnippet = useCallback((snippet: string) => {
    if (!printValueInputPort) {
      return;
    }
    const textArea = printTextAreaRef.current;
    if (!textArea) {
      updatePrintLiteral(`${printLiteralValue}${snippet}`);
      return;
    }

    const selectionStart = textArea.selectionStart ?? printLiteralValue.length;
    const selectionEnd = textArea.selectionEnd ?? selectionStart;
    const nextValue = `${printLiteralValue.slice(0, selectionStart)}${snippet}${printLiteralValue.slice(selectionEnd)}`;
    updatePrintLiteral(nextValue);

    const nextCaret = selectionStart + snippet.length;
    requestAnimationFrame(() => {
      const activeTextArea = printTextAreaRef.current;
      if (!activeTextArea) {
        return;
      }
      activeTextArea.focus();
      activeTextArea.setSelectionRange(nextCaret, nextCaret);
      resizePrintTextArea();
    });
  }, [printLiteralValue, printValueInputPort, resizePrintTextArea, updatePrintLiteral]);

  useEffect(() => {
    if (!isPrintNode || isPrintValueConnected) {
      setIsPrintHelpVisible(false);
      return;
    }
    resizePrintTextArea();
  }, [isPrintNode, isPrintValueConnected, printLiteralValue, resizePrintTextArea]);

  const renderArithmeticPortEditor = useCallback((port: NodePort): React.ReactNode => {
    if (!isArithmeticNode || port.connected || !onPortValueChange) {
      return null;
    }

    if (port.dataType === 'bool') {
      const boolValue = typeof port.value === 'boolean'
        ? port.value
        : Boolean(port.defaultValue);

      return (
        <div
          key={`${port.id}-editor`}
          style={{
            padding: '0 12px 6px 34px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span style={{ color: '#a6adc8', fontSize: 10 }}>
            {displayLanguage === 'ru' ? 'Константа' : 'Const'}
          </span>
          <input
            type="checkbox"
            checked={boolValue}
            onChange={(event) => onPortValueChange(node.id, port.id, event.target.checked)}
            onClick={(event) => event.stopPropagation()}
            style={{ accentColor: '#a6e3a1', cursor: 'pointer' }}
          />
        </div>
      );
    }

    if (port.dataType === 'string') {
      const stringValue = typeof port.value === 'string'
        ? port.value
        : typeof port.defaultValue === 'string'
          ? port.defaultValue
          : '';
      return (
        <div
          key={`${port.id}-editor`}
          style={{
            padding: '0 12px 6px 34px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span style={{ color: '#a6adc8', fontSize: 10 }}>
            {displayLanguage === 'ru' ? 'Константа' : 'Const'}
          </span>
          <input
            type="text"
            value={stringValue}
            onChange={(event) => onPortValueChange(node.id, port.id, event.target.value)}
            onClick={(event) => event.stopPropagation()}
            style={{
              flex: 1,
              minWidth: 60,
              padding: '2px 6px',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid #45475a',
              borderRadius: 4,
              color: '#cdd6f4',
              fontSize: 11,
            }}
          />
        </div>
      );
    }

    const numericValue = typeof port.value === 'number'
      ? port.value
      : typeof port.defaultValue === 'number'
        ? port.defaultValue
        : 0;
    const isIntegerType = port.dataType === 'int32' || port.dataType === 'int64';

    return (
      <div
        key={`${port.id}-editor`}
        style={{
          padding: '0 12px 6px 34px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ color: '#a6adc8', fontSize: 10 }}>
          {displayLanguage === 'ru' ? 'Константа' : 'Const'}
        </span>
        <input
          type="number"
          step={isIntegerType ? 1 : 0.1}
          value={numericValue}
          onChange={(event) => {
            const parsed = isIntegerType
              ? parseInt(event.target.value, 10)
              : parseFloat(event.target.value);
            onPortValueChange(node.id, port.id, Number.isFinite(parsed) ? parsed : 0);
          }}
          onClick={(event) => event.stopPropagation()}
          style={{
            width: 88,
            padding: '2px 6px',
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid #45475a',
            borderRadius: 4,
            color: '#cdd6f4',
            fontSize: 11,
            textAlign: 'right',
          }}
        />
      </div>
    );
  }, [displayLanguage, isArithmeticNode, node.id, onPortValueChange]);

  const getNodeDefaultValueDisplay = isGetVariable
    ? (() => {
        if (
          resolvedVariable?.dataType === 'pointer' &&
          pointerMeta &&
          pointerMeta.mode !== 'weak' &&
          pointerMeta.targetVariableId &&
          pointerTarget &&
          pointerTarget.dataType !== 'pointer'
        ) {
          return formatVariableValueForDisplay(pointerTarget.defaultValue, displayLanguage);
        }

        return formatVariableValueForDisplay(resolvedVariable?.defaultValue, displayLanguage);
      })()
    : '';
  const currentValueDisplay = resolvedVariableValue
    ? (resolvedVariableValue.status === 'ambiguous'
      ? '~'
      : resolvedVariableValue.status === 'unknown'
        ? '?'
        : formatVariableValueForDisplay(resolvedVariableValue.currentValue, displayLanguage))
    : '';

  useEffect(() => {
    if (!(isSetVariable && !isValueInputConnected)) {
      setVectorInputError(null);
      return;
    }

    if (isArrayVariable && effectiveVariableDataType) {
      const parsedArray = parseArrayInput(effectiveSetInputValue, effectiveVariableDataType, {
        vectorElementType,
        arrayRank: variableArrayRank,
        allowLegacyCsv: true,
      });
      if (!parsedArray.ok) {
        setVectorInputDraft('[]');
        setVectorInputError(
          displayLanguage === 'ru'
            ? 'Некорректное значение массива в формате JSON'
            : 'Invalid array JSON value'
        );
        return;
      }

      setVectorInputDraft(formatVectorInput(parsedArray.value));
      setVectorInputError(null);
      return;
    }

    if (effectiveVariableDataType !== 'vector') {
      setVectorInputError(null);
      return;
    }

    const parsed = parseVectorInput(effectiveSetInputValue, vectorElementType, { allowLegacyCsv: true });
    if (!parsed.ok) {
      setVectorInputDraft('[]');
      setVectorInputError(
        displayLanguage === 'ru'
          ? 'Некорректное значение vector<T> в формате JSON-массива'
          : 'Invalid vector<T> JSON array value'
      );
      return;
    }

    setVectorInputDraft(formatVectorInput(parsed.value));
    setVectorInputError(null);
  }, [
    displayLanguage,
    effectiveSetInputValue,
    isSetVariable,
    isValueInputConnected,
    isArrayVariable,
    variableArrayRank,
    effectiveVariableDataType,
    vectorElementType,
  ]);
  
  return (
    <div
      className={`bp-node-root ${isVariableNode ? 'bp-node-variable' : ''} ${isSetVariable ? 'bp-node-set-variable' : ''} ${isGetVariable ? 'bp-node-get-variable' : ''}`}
      style={{
        ...styles.node,
        ...(selected ? styles.nodeSelected : {}),
      }}
    >
      {attachedPointers.length > 0 && (
        <div className="bp-pointer-attachments">
          {attachedPointers.map((pointer) => (
            <div
              key={pointer.id}
              className="bp-pointer-attachment"
              title={`${pointer.name} (${pointer.modeLabel})`}
            >
              <button
                type="button"
                className="bp-pointer-attachment-detach"
                title={displayLanguage === 'ru' ? 'Открепить указатель' : 'Detach pointer'}
                aria-label={displayLanguage === 'ru' ? 'Открепить указатель' : 'Detach pointer'}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(
                      new CustomEvent('multicode:pointer-detach', {
                        detail: { pointerVariableId: pointer.id },
                      })
                    );
                  }
                }}
              >
                ×
              </button>
              <div className="bp-pointer-attachment-name">🔗 {pointer.name}</div>
              <div className="bp-pointer-attachment-mode">{pointer.modeLabel}</div>
            </div>
          ))}
        </div>
      )}
      {/* Заголовок узла с exec портами */}
      <div
        className={`bp-node-header ${isVariableNode ? 'bp-node-header-variable' : ''}`}
        style={{
          ...styles.header,
          background: `linear-gradient(135deg, ${headerColor} 0%, ${headerColor}dd 100%)`,
        }}
        onDoubleClick={handleDoubleClick}
      >
        {/* Exec Input */}
        {hasExecIn && (
          <Handle
            type="target"
            position={Position.Left}
            id={inputPorts.exec[0].id}
            className="bp-handle bp-handle-exec bp-handle-input bp-handle-exec-in"
            style={{
              ...styles.execHandle,
              left: -6,
              top: isVariableNode ? '42%' : '50%',
              transform: 'translateY(-50%) rotate(45deg)',
              background: inputPorts.exec[0].connected ? '#fff' : 'transparent',
            }}
            isConnectable={true}
          />
        )}
        
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder={defaultLabel}
            style={{
              flex: 1,
              textAlign: 'center',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 3,
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              padding: '2px 4px',
              outline: 'none',
              minWidth: 60,
            }}
          />
        ) : (
          <>
            {iconSrc && (
              <img src={iconSrc} alt="icon" style={{ width: 18, height: 18, marginRight: 8 }} />
            )}
            <span 
              style={{ 
                flex: 1, 
                textAlign: 'center',
                cursor: 'text',
                userSelect: 'none',
              }}
              title={displayLanguage === 'ru' 
                ? 'Двойной клик для редактирования' 
                : 'Double-click to edit'
              }
            >
              {displayLabel}
            </span>
            {(isVariadicArithmeticNode || isBranchNode || isSwitchNode) && (
              <button
                type="button"
                onClick={isBranchNode
                  ? handleAppendElseIfBranch
                  : isSwitchNode
                    ? handleAddSwitchCase
                    : handleAddMathOperand}
                title={isBranchNode
                  ? (displayLanguage === 'ru' ? 'Добавить else-if' : 'Add else-if')
                  : isSwitchNode
                    ? (displayLanguage === 'ru' ? 'Добавить случай' : 'Add case')
                    : (displayLanguage === 'ru' ? 'Добавить операнд' : 'Add operand')}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  border: '1px solid rgba(255,255,255,0.35)',
                  background: 'rgba(0,0,0,0.25)',
                  color: '#ffffff',
                  fontSize: 14,
                  lineHeight: 1,
                  cursor: 'pointer',
                  marginLeft: 6,
                }}
              >
                +
              </button>
            )}
          </>
        )}
        
        {/* Exec Output */}
        {hasExecOut && (
          <Handle
            type="source"
            position={Position.Right}
            id={outputPorts.exec[0].id}
            className="bp-handle bp-handle-exec bp-handle-output bp-handle-exec-out"
            style={{
              ...styles.execHandle,
              right: -6,
              top: isVariableNode ? '42%' : '50%',
              transform: 'translateY(-50%) rotate(45deg)',
              background: outputPorts.exec[0].connected ? '#fff' : 'transparent',
            }}
            isConnectable={true}
          />
        )}
      </div>
      
      {/* Data порты */}
      {(inputPorts.data.length > 0 || outputPorts.data.length > 0) && (
        <div
          className={`bp-node-content ${isVariableNode ? 'bp-node-content-variable' : ''}`}
          style={{
            ...styles.content,
            ...(isVariableNode ? { paddingTop: 8 } : undefined),
          }}
        >
          {/* Inputs слева */}
          {inputPorts.data.map((port) => (
            <React.Fragment key={port.id}>
              <PortHandle
                port={port}
                isInput={true}
                displayLanguage={displayLanguage}
              />
              {renderArithmeticPortEditor(port)}
            </React.Fragment>
          ))}
          
          {/* Outputs справа */}
          {outputPorts.data.map((port) => (
            <PortHandle
              key={port.id}
              port={port}
              isInput={false}
              displayLanguage={displayLanguage}
            />
          ))}
        </div>
      )}

      {isSwitchNode && switchCasePorts.length > 0 && onPropertyChange && (
        <div style={{
          padding: '8px 12px',
          borderTop: '1px solid #313244',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          <span style={{ color: '#a6adc8', fontSize: 11 }}>
            {displayLanguage === 'ru' ? 'Случаи:' : 'Cases:'}
          </span>
          {switchCasePorts.map(({ port, caseValue }) => {
            const caseLabel = displayLanguage === 'ru'
              ? (port.nameRu ?? port.name ?? '')
              : (port.name ?? port.nameRu ?? '');
            return (
              <div
                key={`${port.id}-meta`}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <input
                  type="number"
                  min={0}
                  value={caseValue}
                  onChange={(event) => {
                    const parsed = Number.parseInt(event.target.value, 10);
                    if (!Number.isFinite(parsed)) {
                      return;
                    }
                    onPropertyChange(node.id, '__updateSwitchCaseMeta', {
                      portId: port.id,
                      caseValue: parsed,
                    });
                  }}
                  onClick={(event) => event.stopPropagation()}
                  style={{
                    width: 58,
                    padding: '2px 6px',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid #45475a',
                    borderRadius: 4,
                    color: '#cdd6f4',
                    fontSize: 11,
                    textAlign: 'right',
                  }}
                />
                <input
                  type="text"
                  value={caseLabel}
                  onChange={(event) => onPropertyChange(node.id, '__updateSwitchCaseMeta', {
                    portId: port.id,
                    caseName: event.target.value,
                  })}
                  onClick={(event) => event.stopPropagation()}
                  style={{
                    flex: 1,
                    minWidth: 80,
                    padding: '2px 6px',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid #45475a',
                    borderRadius: 4,
                    color: '#cdd6f4',
                    fontSize: 11,
                  }}
                />
              </div>
            );
          })}
        </div>
      )}

      {isSwitchNode && onPropertyChange && (
        <div style={{
          padding: '8px 12px',
          borderTop: '1px solid #313244',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: '#a6adc8',
            fontSize: 11,
            cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={switchInitEnabled}
              onChange={(event) => onPropertyChange(node.id, 'switchInitEnabled', event.target.checked)}
              onClick={(event) => event.stopPropagation()}
              style={{ accentColor: '#89b4fa', cursor: 'pointer' }}
            />
            {displayLanguage === 'ru' ? 'Инициализация switch (C++17)' : 'Switch initializer (C++17)'}
          </label>
          {switchInitEnabled && (
            <>
              <input
                type="text"
                value={switchInitValue}
                onChange={(event) => onPropertyChange(node.id, 'switchInit', event.target.value)}
                onClick={(event) => event.stopPropagation()}
                placeholder={displayLanguage === 'ru' ? 'Например: int k{2}' : 'Example: int k{2}'}
                style={{
                  width: '100%',
                  padding: '4px 8px',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid #45475a',
                  borderRadius: 4,
                  color: '#cdd6f4',
                  fontSize: 11,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                }}
              />
              {isSwitchSelectionConnected && (
                <span style={{ color: '#89b4fa', fontSize: 10, lineHeight: 1.25 }}>
                  {displayLanguage === 'ru'
                    ? 'init создаёт локальные переменные, а выбор case выполняется по входу "Значение".'
                    : 'init creates local variables, while case selection uses the "Selection" input.'}
                </span>
              )}
            </>
          )}
        </div>
      )}

      {isPrintNode && printValueInputPort && !isPrintValueConnected && onPortValueChange && (
        <div style={{
          padding: '8px 12px',
          borderTop: '1px solid #313244',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          position: 'relative',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ color: '#a6adc8', fontSize: 11, whiteSpace: 'nowrap' }}>
              {displayLanguage === 'ru' ? 'Текст:' : 'Text:'}
            </span>
            <button
              type="button"
              className="nodrag nopan"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsPrintHelpVisible((prev) => !prev);
              }}
              title={displayLanguage === 'ru' ? 'Подсказка по спецсимволам' : 'Escape sequence help'}
              aria-label={displayLanguage === 'ru' ? 'Подсказка по спецсимволам' : 'Escape sequence help'}
              style={{
                minWidth: 22,
                height: 22,
                padding: 0,
                borderRadius: '50%',
                border: '1px solid #45475a',
                background: 'rgba(0,0,0,0.25)',
                color: '#cdd6f4',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                lineHeight: 1,
              }}
            >
              ?
            </button>
          </div>
          {isPrintHelpVisible && (
            <div
              className="nodrag nopan"
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              style={{
                border: '1px solid #45475a',
                borderRadius: 6,
                background: 'rgba(17,17,27,0.95)',
                padding: '8px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <span style={{ color: '#89b4fa', fontSize: 11, fontWeight: 600 }}>
                {displayLanguage === 'ru' ? 'Спецсимволы для строки' : 'String escape sequences'}
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 8px' }}>
                {PRINT_ESCAPE_HELP_ITEMS.map((item) => (
                  <React.Fragment key={item.token}>
                    <code
                      style={{
                        color: '#f9e2af',
                        fontSize: 11,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                      }}
                    >
                      {item.token}
                    </code>
                    <span style={{ color: '#a6adc8', fontSize: 11 }}>
                      {displayLanguage === 'ru' ? item.descriptionRu : item.descriptionEn}
                    </span>
                  </React.Fragment>
                ))}
              </div>
              <span style={{ color: '#bac2de', fontSize: 10, lineHeight: 1.3 }}>
                {displayLanguage === 'ru'
                  ? 'Для переноса строки вводите \\n. Чтобы вывести символы "\\" и "n" буквально, вводите \\\\n.'
                  : 'Use \\n for a line break. To print literal "\\" and "n", type \\\\n.'}
              </span>
            </div>
          )}
          <textarea
            ref={printTextAreaRef}
            className="nodrag nopan"
            value={printLiteralValue}
            onChange={(event) => updatePrintLiteral(event.target.value)}
            onInput={resizePrintTextArea}
            placeholder={displayLanguage === 'ru' ? 'Введите текст...' : 'Enter text...'}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            style={{
              width: '100%',
              minHeight: 52,
              padding: '4px 8px',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid #45475a',
              borderRadius: 4,
              color: '#cdd6f4',
              fontSize: 12,
              lineHeight: 1.4,
              resize: 'none',
              whiteSpace: 'pre-wrap',
              userSelect: 'text',
              cursor: 'text',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button
              type="button"
              className="nodrag nopan"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                insertPrintSnippet('\n');
              }}
              title={displayLanguage === 'ru' ? 'Новая строка' : 'New line'}
              style={{
                minWidth: 26,
                padding: '2px 6px',
                background: 'rgba(0,0,0,0.25)',
                border: '1px solid #45475a',
                borderRadius: 4,
                color: '#cdd6f4',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              ↵
            </button>
            <button
              type="button"
              className="nodrag nopan"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                insertPrintSnippet('\t');
              }}
              title={displayLanguage === 'ru' ? 'Табуляция' : 'Tab'}
              style={{
                minWidth: 26,
                padding: '2px 6px',
                background: 'rgba(0,0,0,0.25)',
                border: '1px solid #45475a',
                borderRadius: 4,
                color: '#cdd6f4',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              ⇥
            </button>
            <button
              type="button"
              className="nodrag nopan"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                insertPrintSnippet('"');
              }}
              title={displayLanguage === 'ru' ? 'Двойная кавычка' : 'Double quote'}
              style={{
                minWidth: 26,
                padding: '2px 6px',
                background: 'rgba(0,0,0,0.25)',
                border: '1px solid #45475a',
                borderRadius: 4,
                color: '#cdd6f4',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              "
            </button>
            <button
              type="button"
              className="nodrag nopan"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                insertPrintSnippet('\\');
              }}
              title={displayLanguage === 'ru' ? 'Обратный слэш' : 'Backslash'}
              style={{
                minWidth: 26,
                padding: '2px 6px',
                background: 'rgba(0,0,0,0.25)',
                border: '1px solid #45475a',
                borderRadius: 4,
                color: '#cdd6f4',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              \
            </button>
          </div>
        </div>
      )}

      {isVariableNode && pointerMeta && (
        <div
          style={{
            padding: '6px 12px 0',
            color: '#bac2de',
            fontSize: 10,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span>{displayLanguage === 'ru' ? 'Режим' : 'Mode'}: {pointerModeLabel}</span>
          {pointerTargetName && (
            <span title={pointerMeta.targetVariableId}>
              {(pointerMeta.mode === 'shared' || pointerMeta.mode === 'unique')
                ? (displayLanguage === 'ru' ? 'Источник' : 'Source')
                : (displayLanguage === 'ru' ? 'Цель' : 'Target')}: {pointerTargetName}
            </span>
          )}
        </div>
      )}
      
      {/* debug UI removed */}

      {isConstNumberNode && (
        <div style={{
          padding: '8px 12px',
          borderTop: '1px solid #313244',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}>
          <span style={{ color: '#a6adc8', fontSize: 11, whiteSpace: 'nowrap' }}>
            {displayLanguage === 'ru' ? 'Значение:' : 'Value:'}
          </span>
          <input
            type="number"
            value={literalNumberValue}
            step={0.1}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              setLiteralNodeValue(Number.isFinite(parsed) ? parsed : 0);
            }}
            style={{
              flex: 1,
              minWidth: 70,
              maxWidth: 120,
              padding: '4px 8px',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid #45475a',
              borderRadius: 4,
              color: '#cdd6f4',
              fontSize: 12,
              textAlign: 'right',
            }}
          />
        </div>
      )}

      {isConstStringNode && (
        <div style={{
          padding: '8px 12px',
          borderTop: '1px solid #313244',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}>
          <span style={{ color: '#a6adc8', fontSize: 11, whiteSpace: 'nowrap' }}>
            {displayLanguage === 'ru' ? 'Значение:' : 'Value:'}
          </span>
          <input
            type="text"
            value={literalStringValue}
            onChange={(event) => setLiteralNodeValue(event.target.value)}
            placeholder={displayLanguage === 'ru' ? 'Текст...' : 'Text...'}
            style={{
              flex: 1,
              minWidth: 80,
              maxWidth: 150,
              padding: '4px 8px',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid #45475a',
              borderRadius: 4,
              color: '#cdd6f4',
              fontSize: 12,
            }}
          />
        </div>
      )}

      {isConstBoolNode && (
        <div style={{
          padding: '8px 12px',
          borderTop: '1px solid #313244',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ color: '#a6adc8', fontSize: 11 }}>
            {displayLanguage === 'ru' ? 'Значение:' : 'Value:'}
          </span>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={literalBoolValue}
              onChange={(event) => setLiteralNodeValue(event.target.checked)}
              style={{
                width: 16,
                height: 16,
                cursor: 'pointer',
                accentColor: '#a6e3a1',
              }}
            />
            <span style={{
              color: literalBoolValue ? '#a6e3a1' : '#f38ba8',
              fontWeight: 500,
              fontSize: 12,
            }}>
              {literalBoolValue
                ? (displayLanguage === 'ru' ? 'Истина' : 'True')
                : (displayLanguage === 'ru' ? 'Ложь' : 'False')
              }
            </span>
          </label>
        </div>
      )}

      {/* Редактор значения для массивов */}
      {isSetVariable && isArrayVariable && effectiveVariableDataType && !isValueInputConnected && (
        <div style={{ 
          padding: '8px 12px', 
          borderTop: '1px solid #313244',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          <span style={{ color: '#a6adc8', fontSize: 11, marginBottom: 4 }}>
            {displayLanguage === 'ru' ? 'По умолч.:' : 'Default:'}
          </span>
          <textarea
            value={vectorInputDraft}
            onChange={(event) => {
              setVectorInputDraft(event.target.value);
              if (vectorInputError) {
                setVectorInputError(null);
              }
            }}
            onBlur={() => {
              const parsed = parseArrayInput(vectorInputDraft, effectiveVariableDataType, {
                vectorElementType,
                arrayRank: variableArrayRank,
                allowLegacyCsv: true,
              });
              if (!parsed.ok) {
                setVectorInputError(
                  displayLanguage === 'ru'
                    ? `Некорректный JSON-массив (${parsed.error})`
                    : `Invalid JSON array (${parsed.error})`
                );
                return;
              }
              setSetNodeInputValue(parsed.value);
              setVectorInputDraft(formatVectorInput(parsed.value));
              setVectorInputError(null);
            }}
            placeholder={
              effectiveVariableDataType === 'vector'
                ? variableArrayRank >= 3
                  ? vectorElementType === 'string'
                    ? '[[[["red"]]]]'
                    : vectorElementType === 'bool'
                      ? '[[[[true]]]]'
                      : vectorElementType === 'int32' || vectorElementType === 'int64'
                        ? '[[[[1]]]]'
                        : '[[[[1.25]]]]'
                  : variableArrayRank === 2
                    ? vectorElementType === 'string'
                      ? '[[["red"], ["green"]], [["blue"]]]'
                      : vectorElementType === 'bool'
                        ? '[[[true], [false]], [[true]]]'
                        : vectorElementType === 'int32' || vectorElementType === 'int64'
                          ? '[[[1], [2]], [[3], [4]]]'
                          : '[[[1.25], [2.5]], [[3.75]]]'
                    : vectorElementType === 'string'
                      ? '[["red", "green"], ["blue"]]'
                      : vectorElementType === 'bool'
                        ? '[[true, false], [false]]'
                        : vectorElementType === 'int32' || vectorElementType === 'int64'
                          ? '[[1, 2], [3, 4]]'
                          : '[[1.25, 2.5], [3.75]]'
                : effectiveVariableDataType === 'string'
                  ? variableArrayRank >= 3
                    ? '[[["alpha"], ["beta"]], [["gamma"]]]'
                    : variableArrayRank === 2
                      ? '[["alpha", "beta"], ["gamma"]]'
                      : '["alpha", "beta", "gamma"]'
                  : effectiveVariableDataType === 'bool'
                    ? variableArrayRank >= 3
                      ? '[[[true], [false]], [[true]]]'
                      : variableArrayRank === 2
                        ? '[[true, false], [false, true]]'
                        : '[true, false, true]'
                    : effectiveVariableDataType === 'int32' || effectiveVariableDataType === 'int64'
                      ? variableArrayRank >= 3
                        ? '[[[1], [2]], [[3], [4]]]'
                        : variableArrayRank === 2
                          ? '[[1, 2], [3, 4]]'
                          : '[1, 2, 3]'
                      : variableArrayRank >= 3
                        ? '[[[1.25], [2.5]], [[3.75]]]'
                        : variableArrayRank === 2
                          ? '[[1.25, 2.5], [3.75]]'
                          : '[1.25, 2.5, 3.75]'
            }
            style={{
              width: '100%',
              minHeight: 52,
              padding: '6px 8px',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid #45475a',
              borderRadius: 4,
              color: '#cdd6f4',
              fontSize: 11,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              resize: 'vertical',
            }}
          />
          {vectorInputError && (
            <span style={{ color: '#f38ba8', fontSize: 11 }}>
              {vectorInputError}
            </span>
          )}
        </div>
      )}

      {/* Индикатор подключённого значения для массивов */}
      {isSetVariable && isArrayVariable && isValueInputConnected && (
        <div style={{ 
          padding: '8px 12px', 
          borderTop: '1px solid #313244',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}>
          <span style={{ color: '#89b4fa', fontSize: 11, fontStyle: 'italic' }}>
            {displayLanguage === 'ru' ? '← из подключения' : '← from connection'}
          </span>
        </div>
      )}
      
      {/* Редактор значения для SetVariable (показываем только если порт value-in не подключён) */}
      {isSetVariable && !isArrayVariable && effectiveVariableDataType === 'bool' && !isValueInputConnected && (
        <div style={{ 
          padding: '8px 12px', 
          borderTop: '1px solid #313244',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ color: '#a6adc8', fontSize: 11 }}>
            {displayLanguage === 'ru' ? 'По умолч.:' : 'Default:'}
          </span>
          <label style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 8,
            cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={Boolean(effectiveSetInputValue)}
              onChange={(e) => {
                setSetNodeInputValue(e.target.checked);
              }}
              style={{ 
                width: 16, 
                height: 16,
                cursor: 'pointer',
                accentColor: '#a6e3a1',
              }}
            />
            <span style={{ 
              color: effectiveSetInputValue ? '#a6e3a1' : '#f38ba8',
              fontWeight: 500,
              fontSize: 12,
            }}>
              {effectiveSetInputValue 
                ? (displayLanguage === 'ru' ? 'Истина' : 'True')
                : (displayLanguage === 'ru' ? 'Ложь' : 'False')
              }
            </span>
          </label>
        </div>
      )}
      
      {/* Индикатор подключённого значения для bool */}
      {isSetVariable && !isArrayVariable && effectiveVariableDataType === 'bool' && isValueInputConnected && (
        <div style={{ 
          padding: '8px 12px', 
          borderTop: '1px solid #313244',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}>
          <span style={{ color: '#89b4fa', fontSize: 11, fontStyle: 'italic' }}>
            {displayLanguage === 'ru' ? '← из подключения' : '← from connection'}
          </span>
        </div>
      )}
      
      {/* Редактор значения для числовых типов (int32, int64, float, double) */}
      {isSetVariable && !isArrayVariable && isNumericType && !isValueInputConnected && (
        <div style={{ 
          padding: '8px 12px', 
          borderTop: '1px solid #313244',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}>
          <span style={{ color: '#a6adc8', fontSize: 11, whiteSpace: 'nowrap' }}>
            {displayLanguage === 'ru' ? 'По умолч.:' : 'Default:'}
          </span>
          <input
            type="number"
            value={typeof effectiveSetInputValue === 'number' ? effectiveSetInputValue : 0}
            step={isFloatType ? 0.1 : 1}
            onChange={(e) => {
              const value = isFloatType ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
              setSetNodeInputValue(Number.isNaN(value) ? 0 : value);
            }}
            style={{ 
              flex: 1,
              minWidth: 60,
              maxWidth: 100,
              padding: '4px 8px',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid #45475a',
              borderRadius: 4,
              color: '#cdd6f4',
              fontSize: 12,
              textAlign: 'right',
            }}
          />
        </div>
      )}
      
      {/* Индикатор подключённого значения для числовых типов */}
      {isSetVariable && !isArrayVariable && isNumericType && isValueInputConnected && (
        <div style={{ 
          padding: '8px 12px', 
          borderTop: '1px solid #313244',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}>
          <span style={{ color: '#89b4fa', fontSize: 11, fontStyle: 'italic' }}>
            {displayLanguage === 'ru' ? '← из подключения' : '← from connection'}
          </span>
        </div>
      )}
      
      {/* Редактор значения для строкового типа */}
      {isSetVariable && !isArrayVariable && effectiveVariableDataType === 'string' && !isValueInputConnected && (
        <div style={{ 
          padding: '8px 12px', 
          borderTop: '1px solid #313244',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}>
          <span style={{ color: '#a6adc8', fontSize: 11, whiteSpace: 'nowrap' }}>
            {displayLanguage === 'ru' ? 'По умолч.:' : 'Default:'}
          </span>
          <input
            type="text"
            value={typeof effectiveSetInputValue === 'string' ? effectiveSetInputValue : ''}
            placeholder={displayLanguage === 'ru' ? 'Текст...' : 'Text...'}
            onChange={(e) => {
              setSetNodeInputValue(e.target.value);
            }}
            style={{ 
              flex: 1,
              minWidth: 80,
              maxWidth: 150,
              padding: '4px 8px',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid #45475a',
              borderRadius: 4,
              color: '#cdd6f4',
              fontSize: 12,
            }}
          />
        </div>
      )}
      
      {/* Индикатор подключённого значения для строкового типа */}
      {isSetVariable && !isArrayVariable && effectiveVariableDataType === 'string' && isValueInputConnected && (
        <div style={{ 
          padding: '8px 12px', 
          borderTop: '1px solid #313244',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}>
          <span style={{ color: '#89b4fa', fontSize: 11, fontStyle: 'italic' }}>
            {displayLanguage === 'ru' ? '← из подключения' : '← from connection'}
          </span>
        </div>
      )}
      
      {/* Редактор для pointer/class - выбор из списка переменных */}
      {isSetVariable && !isArrayVariable && variableDataType === 'pointer' && !shouldTreatPointerAsPointee && !isValueInputConnected && (
        <div style={{ padding: '8px 12px', borderTop: '1px solid #313244' }}>
          <div style={{ color: '#a6adc8', fontSize: 11, lineHeight: 1.3 }}>
            {displayLanguage === 'ru'
              ? 'Привязка указателя настраивается в панели «Указатели и ссылки» (📌 прикрепить на графе).'
              : 'Pointer binding is configured in “Pointers & References” panel (📌 attach on graph).'}
          </div>
        </div>
      )}

      {isSetVariable && !isArrayVariable && variableDataType === 'pointer' && !shouldTreatPointerAsPointee && isValueInputConnected && (
        <div style={{ 
          padding: '8px 12px', 
          borderTop: '1px solid #313244',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}>
          <span style={{ color: '#89b4fa', fontSize: 11, fontStyle: 'italic' }}>
            {displayLanguage === 'ru' ? '← из подключения' : '← from connection'}
          </span>
        </div>
      )}
      
      {/* Редактор значения для vector<T> */}
      {isSetVariable && !isArrayVariable && effectiveVariableDataType === 'vector' && !isValueInputConnected && (
        <div style={{ 
          padding: '8px 12px', 
          borderTop: '1px solid #313244',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          <span style={{ color: '#a6adc8', fontSize: 11, marginBottom: 4 }}>
            {displayLanguage === 'ru' ? 'По умолч.:' : 'Default:'}
          </span>
          <textarea
            value={vectorInputDraft}
            onChange={(event) => {
              setVectorInputDraft(event.target.value);
              if (vectorInputError) {
                setVectorInputError(null);
              }
            }}
            onBlur={() => {
              const parsed = parseVectorInput(vectorInputDraft, vectorElementType, { allowLegacyCsv: true });
              if (!parsed.ok) {
                setVectorInputError(
                  displayLanguage === 'ru'
                    ? `Некорректный JSON-массив (${parsed.error})`
                    : `Invalid JSON array (${parsed.error})`
                );
                return;
              }
              setSetNodeInputValue(parsed.value);
              setVectorInputDraft(formatVectorInput(parsed.value));
              setVectorInputError(null);
            }}
            placeholder={
              vectorElementType === 'string'
                ? '["red", "green"]'
                : vectorElementType === 'bool'
                  ? '[true, false]'
                  : vectorElementType === 'int32' || vectorElementType === 'int64'
                    ? '[1, 2, 3]'
                    : '[1.25, 2.5, 3.75]'
            }
            style={{
              width: '100%',
              minHeight: 52,
              padding: '6px 8px',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid #45475a',
              borderRadius: 4,
              color: '#cdd6f4',
              fontSize: 11,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              resize: 'vertical',
            }}
          />
          {vectorInputError && (
            <span style={{ color: '#f38ba8', fontSize: 11 }}>
              {vectorInputError}
            </span>
          )}
        </div>
      )}
      
      {/* Индикатор подключённого значения для вектора */}
      {isSetVariable && !isArrayVariable && effectiveVariableDataType === 'vector' && isValueInputConnected && (
        <div style={{ 
          padding: '8px 12px', 
          borderTop: '1px solid #313244',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}>
          <span style={{ color: '#89b4fa', fontSize: 11, fontStyle: 'italic' }}>
            {displayLanguage === 'ru' ? '← из подключения' : '← from connection'}
          </span>
        </div>
      )}

      {/* Read-only значение по умолчанию для GetVariable */}
      {isGetVariable && (
        <div style={{ 
          padding: '8px 12px', 
          borderTop: '1px solid #313244',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}>
          <span style={{ color: '#a6adc8', fontSize: 11, whiteSpace: 'nowrap' }}>
            {displayLanguage === 'ru' ? 'По умолч.:' : 'Default:'}
          </span>
          <span
            style={{
              color: '#cdd6f4',
              fontSize: 11,
              fontStyle: 'italic',
              textAlign: 'right',
            }}
            title={getNodeDefaultValueDisplay}
          >
            {getNodeDefaultValueDisplay}
          </span>
        </div>
      )}

      {/* Read-only текущее вычисленное значение для переменных */}
      {isVariableNode && resolvedVariableValue && (
        <div style={{ 
          padding: '8px 12px',
          borderTop: '1px solid #313244',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}>
          <span style={{ color: '#89b4fa', fontSize: 11, whiteSpace: 'nowrap' }}>
            {displayLanguage === 'ru' ? 'Текущее:' : 'Current:'}
          </span>
          <span
            style={{
              color: resolvedVariableValue.status === 'resolved' ? '#cdd6f4' : '#f9e2af',
              fontSize: 11,
              fontStyle: resolvedVariableValue.status === 'resolved' ? 'normal' : 'italic',
              textAlign: 'right',
            }}
            title={currentValueDisplay}
          >
            {currentValueDisplay}
          </span>
        </div>
      )}
      
      {/* Дополнительные exec порты (Branch: True/False) */}
      {outputPorts.exec.length > 1 && (
        <div style={{ ...styles.content, ...styles.outputSection }}>
          {outputPorts.exec.slice(1).map((port) => (
            <PortHandle
              key={port.id}
              port={port}
              isInput={false}
              displayLanguage={displayLanguage}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const BlueprintNode = memo(BlueprintNodeComponent);
BlueprintNode.displayName = 'BlueprintNode';

/** Типы узлов для регистрации в React Flow */
export const blueprintNodeTypes = {
  blueprint: BlueprintNode,
};
