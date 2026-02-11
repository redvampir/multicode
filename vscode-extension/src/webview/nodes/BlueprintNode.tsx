/**
 * BlueprintNode — кастомный компонент узла для React Flow
 * Визуальный стиль в стиле flow-based программирования
 */

import React, { memo, useState, useCallback, useRef, useEffect } from 'react';
import { Handle, Position, type Node, type Edge } from '@xyflow/react';
import { 
  BlueprintNode as BlueprintNodeType, 
  NodePort,
  NODE_TYPE_DEFINITIONS,
  BlueprintNodeType as NodeTypeEnum,
  VARIABLE_TYPE_COLORS
} from '../../shared/blueprintTypes';
import { PORT_TYPE_COLORS, type PortDataType } from '../../shared/portTypes';
import { getIconForCategory } from '../../shared/iconMap';
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
    overflow: 'hidden',
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
}> = memo(({ port, isInput }) => {
  const isExec = port.dataType === 'execution';
  const isPointer = port.dataType === 'pointer'; // 🔗 Проверяем, является ли порт указателем
  const color = PORT_TYPE_COLORS[port.dataType];
  
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
        style={{
          ...handleStyle,
          // 🎨 НАСТРОЙКА: Позиция порта относительно края узла (отрицательное = торчит наружу)
          [isInput ? 'left' : 'right']: -6,
          top: '50%',
          transform: isExec ? 'translateY(-50%) rotate(45deg)' : 'translateY(-50%)',
        }}
        isConnectable={true}
      />
      {port.name && (
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
          {port.name}
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
  availableVariables?: AvailableVariableBinding[]; // Для селектора указателей и синхронизации variable-узлов
  resolvedVariableValues?: ResolvedVariableValues;
}

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
  const { node, displayLanguage, onLabelChange, onPropertyChange } = data;
  const definition = NODE_TYPE_DEFINITIONS[node.type as NodeTypeEnum];
  
  // Inline editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Определяем, является ли узел SetVariable или GetVariable
  const isVariableNode = node.type === 'SetVariable' || node.type === 'GetVariable';
  const isSetVariable = node.type === 'SetVariable';
  const isGetVariable = node.type === 'GetVariable';
  const resolvedVariable = resolveVariableForNode(node, data.availableVariables);
  const resolvedVariableValue = resolvedVariable
    ? data.resolvedVariableValues?.[resolvedVariable.id]
    : undefined;
  const variableDataType = resolvedVariable?.dataType
    ?? (typeof node.properties?.dataType === 'string'
      ? (node.properties.dataType as PortDataType)
      : undefined);
  const variableName = resolvedVariable
    ? (displayLanguage === 'ru'
      ? (resolvedVariable.nameRu || resolvedVariable.name)
      : (resolvedVariable.name || resolvedVariable.nameRu))
    : undefined;
  
  // Определяем тип переменной для выбора редактора
  const isNumericType = ['int32', 'int64', 'float', 'double'].includes(variableDataType ?? '');
  const isFloatType = ['float', 'double'].includes(variableDataType ?? '');
  
  // Проверяем, подключён ли входной порт данных (value-in)
  const valueInputPort = node.inputs.find((port) => port.id === 'value-in' || port.id.endsWith('-value-in'));
  const isValueInputConnected = valueInputPort?.connected ?? false;
  const effectiveSetInputValue = getEffectiveSetInputValue(node, resolvedVariable?.defaultValue);
  
  const defaultLabel = displayLanguage === 'ru' 
    ? (definition?.labelRu ?? node.label)
    : (definition?.label ?? node.label);
  const nodeTitle = isVariableNode
    ? getVariableNodeTitle(node.type, variableName, defaultLabel)
    : defaultLabel;
  
  // Use custom label if set, otherwise use default
  const displayLabel = node.customLabel ?? nodeTitle;
  
  // 🎨 Динамический цвет шапки: для переменных используем цвет типа данных
  const variableHeaderColor = resolvedVariable?.color
    ?? (variableDataType ? VARIABLE_TYPE_COLORS[variableDataType] : undefined);
  const headerColor = isVariableNode
    ? (variableHeaderColor ?? definition?.headerColor ?? '#6c7086')
    : (definition?.headerColor ?? '#6c7086');
    
  const iconSrc = getIconForCategory(definition?.category ?? 'other');
  
  const inputPorts = splitPorts(node.inputs);
  const outputPorts = splitPorts(node.outputs);
  
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

  const getNodeDefaultValueDisplay = isGetVariable
    ? formatVariableValueForDisplay(resolvedVariable?.defaultValue, displayLanguage)
    : '';
  const currentValueDisplay = resolvedVariableValue
    ? (resolvedVariableValue.status === 'ambiguous'
      ? '~'
      : resolvedVariableValue.status === 'unknown'
        ? '?'
        : formatVariableValueForDisplay(resolvedVariableValue.currentValue, displayLanguage))
    : '';
  
  return (
    <div
      style={{
        ...styles.node,
        ...(selected ? styles.nodeSelected : {}),
      }}
    >
      {/* Заголовок узла с exec портами */}
      <div
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
            style={{
              ...styles.execHandle,
              left: -6,
              top: '50%',
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
          </>
        )}
        
        {/* Exec Output */}
        {hasExecOut && (
          <Handle
            type="source"
            position={Position.Right}
            id={outputPorts.exec[0].id}
            style={{
              ...styles.execHandle,
              right: -6,
              top: '50%',
              transform: 'translateY(-50%) rotate(45deg)',
              background: outputPorts.exec[0].connected ? '#fff' : 'transparent',
            }}
            isConnectable={true}
          />
        )}
      </div>
      
      {/* Data порты */}
      {(inputPorts.data.length > 0 || outputPorts.data.length > 0) && (
        <div style={styles.content}>
          {/* Inputs слева */}
          {inputPorts.data.map((port) => (
            <PortHandle
              key={port.id}
              port={port}
              isInput={true}
            />
          ))}
          
          {/* Outputs справа */}
          {outputPorts.data.map((port) => (
            <PortHandle
              key={port.id}
              port={port}
              isInput={false}
            />
          ))}
        </div>
      )}
      
      {/* debug UI removed */}
      
      {/* Редактор значения для SetVariable (показываем только если порт value-in не подключён) */}
      {isSetVariable && variableDataType === 'bool' && !isValueInputConnected && (
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
      {isSetVariable && variableDataType === 'bool' && isValueInputConnected && (
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
      {isSetVariable && isNumericType && !isValueInputConnected && (
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
      {isSetVariable && isNumericType && isValueInputConnected && (
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
      {isSetVariable && variableDataType === 'string' && !isValueInputConnected && (
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
      {isSetVariable && variableDataType === 'string' && isValueInputConnected && (
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
      {isSetVariable && (variableDataType === 'pointer' || variableDataType === 'class') && !isValueInputConnected && (
        <div style={{ padding: '8px 12px', borderTop: '1px solid #313244' }}>
          <span style={{ color: '#a6adc8', fontSize: 11, marginBottom: 4, display: 'block' }}>
            {displayLanguage === 'ru' ? 'Привязка к:' : 'Bind to:'}
          </span>
          <select
            value={typeof effectiveSetInputValue === 'string' ? effectiveSetInputValue : ''}
            onChange={(e) => {
              setSetNodeInputValue(e.target.value);
            }}
            style={{
              width: '100%',
              padding: '4px 8px',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid #45475a',
              borderRadius: 4,
              color: '#cdd6f4',
              fontSize: 11,
            }}
          >
            <option value="">{displayLanguage === 'ru' ? '— Не выбрано —' : '— None —'}</option>
            {data.availableVariables?.map(v => (
              <option key={v.id} value={v.id}>
                {displayLanguage === 'ru' ? v.nameRu : v.name} ({v.dataType})
              </option>
            ))}
          </select>
        </div>
      )}
      
      {/* Индикатор подключённого значения для pointer/class */}
      {isSetVariable && (variableDataType === 'pointer' || variableDataType === 'class') && isValueInputConnected && (
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
      
      {/* Редактор значения для вектора (X, Y, Z) */}
      {isSetVariable && variableDataType === 'vector' && !isValueInputConnected && (
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
          {['X', 'Y', 'Z'].map((axis, idx) => {
            // Значение вектора всегда массив [X, Y, Z]
            const vectorValue = Array.isArray(effectiveSetInputValue) 
              ? effectiveSetInputValue 
              : [0, 0, 0];
            
            return (
              <div key={axis} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#ffc107', fontSize: 11, fontWeight: 600, minWidth: 16 }}>
                  {axis}:
                </span>
                <input
                  type="number"
                  value={vectorValue[idx] ?? 0}
                  step={0.1}
                  onChange={(e) => {
                    const newVector = [...vectorValue];
                    newVector[idx] = parseFloat(e.target.value) || 0;
                    setSetNodeInputValue(newVector);
                  }}
                  style={{ 
                    flex: 1,
                    padding: '3px 6px',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid #45475a',
                    borderRadius: 3,
                    color: '#cdd6f4',
                    fontSize: 11,
                    textAlign: 'right',
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
      
      {/* Индикатор подключённого значения для вектора */}
      {isSetVariable && variableDataType === 'vector' && isValueInputConnected && (
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
