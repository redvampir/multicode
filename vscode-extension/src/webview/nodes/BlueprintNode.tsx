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
  BlueprintNodeType as NodeTypeEnum
} from '../../shared/blueprintTypes';
import { PORT_TYPE_COLORS } from '../../shared/portTypes';
import { getIconForCategory } from '../../shared/iconMap';

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
  portRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '4px 12px',
    position: 'relative',
    minHeight: 24,
  } as React.CSSProperties,
  portLabel: {
    color: '#a6adc8',
    fontSize: 11,
    flex: 1,
  } as React.CSSProperties,
  portLabelLeft: {
    textAlign: 'left',
    marginLeft: 12,
  } as React.CSSProperties,
  portLabelRight: {
    textAlign: 'right',
    marginRight: 12,
  } as React.CSSProperties,
  execHandle: {
    width: 12,
    height: 12,
    background: '#e0e0e0',
    border: '2px solid #666666',
    borderRadius: 2,
    transform: 'rotate(45deg)',
  } as React.CSSProperties,
  dataHandle: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    border: '2px solid',
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
      };

  return (
    <div style={styles.portRow}>
      <Handle
        type={isInput ? 'target' : 'source'}
        position={isInput ? Position.Left : Position.Right}
        id={port.id}
        style={{
          ...handleStyle,
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
          {port.name}
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
  const { node, displayLanguage, onLabelChange } = data;
  const definition = NODE_TYPE_DEFINITIONS[node.type as NodeTypeEnum];
  
  // Inline editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  
  const defaultLabel = displayLanguage === 'ru' 
    ? (definition?.labelRu ?? node.label)
    : (definition?.label ?? node.label);
  
  // Use custom label if set, otherwise use default
  const displayLabel = node.customLabel ?? defaultLabel;
  
  const headerColor = definition?.headerColor ?? '#6c7086';
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
