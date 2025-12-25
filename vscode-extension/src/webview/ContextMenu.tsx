/**
 * ContextMenu — контекстное меню для Blueprint редактора
 * 
 * Показывается по правому клику на:
 * - Пустое пространство (добавление узлов)
 * - Узел (редактирование, копирование, удаление)
 * - Ребро (удаление)
 */

import React, { useCallback, useEffect, useRef } from 'react';

// ============================================
// Типы
// ============================================

export interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface ContextMenuItem {
  id: string;
  label: string;
  labelRu: string;
  icon?: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  onClick?: () => void;
}

export interface ContextMenuProps {
  position: ContextMenuPosition | null;
  items: ContextMenuItem[];
  displayLanguage: 'ru' | 'en';
  onClose: () => void;
}

// ============================================
// Стили
// ============================================

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  } as React.CSSProperties,
  
  menu: {
    position: 'fixed',
    backgroundColor: '#1e1e2e',
    border: '1px solid #313244',
    borderRadius: 6,
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    minWidth: 180,
    padding: '4px 0',
    zIndex: 1001,
  } as React.CSSProperties,
  
  item: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 12px',
    cursor: 'pointer',
    color: '#cdd6f4',
    fontSize: 12,
    gap: 8,
    transition: 'background-color 0.1s',
  } as React.CSSProperties,
  
  itemHover: {
    backgroundColor: '#313244',
  } as React.CSSProperties,
  
  itemDisabled: {
    color: '#6c7086',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  
  itemDanger: {
    color: '#f38ba8',
  } as React.CSSProperties,
  
  itemIcon: {
    width: 16,
    textAlign: 'center',
    fontSize: 14,
  } as React.CSSProperties,
  
  itemLabel: {
    flex: 1,
  } as React.CSSProperties,
  
  itemShortcut: {
    color: '#6c7086',
    fontSize: 11,
    marginLeft: 16,
  } as React.CSSProperties,
  
  separator: {
    height: 1,
    backgroundColor: '#313244',
    margin: '4px 8px',
  } as React.CSSProperties,
};

// ============================================
// Компонент
// ============================================

export const ContextMenu: React.FC<ContextMenuProps> = ({
  position,
  items,
  displayLanguage,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);
  
  // Закрытие по Escape или клику вне
  useEffect(() => {
    if (!position) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [position, onClose]);
  
  // Корректировка позиции чтобы не выходить за границы экрана
  const adjustedPosition = useCallback(() => {
    if (!position || !menuRef.current) return position;
    
    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    let x = position.x;
    let y = position.y;
    
    if (x + rect.width > windowWidth) {
      x = windowWidth - rect.width - 8;
    }
    if (y + rect.height > windowHeight) {
      y = windowHeight - rect.height - 8;
    }
    
    return { x: Math.max(8, x), y: Math.max(8, y) };
  }, [position]);
  
  const handleItemClick = useCallback((item: ContextMenuItem) => {
    if (item.disabled || item.separator) return;
    item.onClick?.();
    onClose();
  }, [onClose]);
  
  if (!position) return null;
  
  const pos = adjustedPosition() ?? position;
  
  return (
    <>
      {/* Overlay для закрытия по клику вне */}
      <div style={styles.overlay} onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      
      {/* Меню */}
      <div
        ref={menuRef}
        style={{
          ...styles.menu,
          left: pos.x,
          top: pos.y,
        }}
      >
        {items.map((item, index) => {
          if (item.separator) {
            return <div key={`sep-${index}`} style={styles.separator} />;
          }
          
          const label = displayLanguage === 'ru' ? item.labelRu : item.label;
          const isHovered = hoveredId === item.id;
          
          return (
            <div
              key={item.id}
              style={{
                ...styles.item,
                ...(isHovered && !item.disabled ? styles.itemHover : {}),
                ...(item.disabled ? styles.itemDisabled : {}),
                ...(item.danger && !item.disabled ? styles.itemDanger : {}),
              }}
              onClick={() => handleItemClick(item)}
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {item.icon && <span style={styles.itemIcon}>{item.icon}</span>}
              <span style={styles.itemLabel}>{label}</span>
              {item.shortcut && <span style={styles.itemShortcut}>{item.shortcut}</span>}
            </div>
          );
        })}
      </div>
    </>
  );
};

// ============================================
// Хелперы для создания стандартных меню
// ============================================

export interface ContextMenuActions {
  onCopy?: () => void;
  onCut?: () => void;
  onPaste?: () => void;
  onDelete?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onSelectAll?: () => void;
  onAddNode?: () => void;
  onZoomToFit?: () => void;
  onAutoLayout?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  canPaste?: boolean;
  hasSelection?: boolean;
}

export function createCanvasMenuItems(actions: ContextMenuActions): ContextMenuItem[] {
  return [
    {
      id: 'add-node',
      label: 'Add Node',
      labelRu: 'Добавить узел',
      icon: '+',
      shortcut: 'A',
      onClick: actions.onAddNode,
    },
    { id: 'sep1', label: '', labelRu: '', separator: true },
    {
      id: 'paste',
      label: 'Paste',
      labelRu: 'Вставить',
      icon: '📋',
      shortcut: 'Ctrl+V',
      disabled: !actions.canPaste,
      onClick: actions.onPaste,
    },
    { id: 'sep2', label: '', labelRu: '', separator: true },
    {
      id: 'undo',
      label: 'Undo',
      labelRu: 'Отменить',
      icon: '↶',
      shortcut: 'Ctrl+Z',
      disabled: !actions.canUndo,
      onClick: actions.onUndo,
    },
    {
      id: 'redo',
      label: 'Redo',
      labelRu: 'Повторить',
      icon: '↷',
      shortcut: 'Ctrl+Y',
      disabled: !actions.canRedo,
      onClick: actions.onRedo,
    },
    { id: 'sep3', label: '', labelRu: '', separator: true },
    {
      id: 'select-all',
      label: 'Select All',
      labelRu: 'Выделить всё',
      icon: '⬚',
      shortcut: 'Ctrl+A',
      onClick: actions.onSelectAll,
    },
    {
      id: 'zoom-fit',
      label: 'Zoom to Fit',
      labelRu: 'Вписать',
      icon: '⊡',
      shortcut: 'F',
      onClick: actions.onZoomToFit,
    },
    {
      id: 'auto-layout',
      label: 'Auto Layout',
      labelRu: 'Автолейаут',
      icon: '⊞',
      shortcut: 'L',
      onClick: actions.onAutoLayout,
    },
  ];
}

export function createNodeMenuItems(actions: ContextMenuActions): ContextMenuItem[] {
  return [
    {
      id: 'copy',
      label: 'Copy',
      labelRu: 'Копировать',
      icon: '📄',
      shortcut: 'Ctrl+C',
      onClick: actions.onCopy,
    },
    {
      id: 'cut',
      label: 'Cut',
      labelRu: 'Вырезать',
      icon: '✂',
      shortcut: 'Ctrl+X',
      onClick: actions.onCut,
    },
    { id: 'sep1', label: '', labelRu: '', separator: true },
    {
      id: 'delete',
      label: 'Delete',
      labelRu: 'Удалить',
      icon: '🗑',
      shortcut: 'Del',
      danger: true,
      onClick: actions.onDelete,
    },
  ];
}

export function createEdgeMenuItems(actions: ContextMenuActions): ContextMenuItem[] {
  return [
    {
      id: 'delete',
      label: 'Delete Connection',
      labelRu: 'Удалить связь',
      icon: '🗑',
      shortcut: 'Del',
      danger: true,
      onClick: actions.onDelete,
    },
  ];
}

export default ContextMenu;
