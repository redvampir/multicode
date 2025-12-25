/**
 * useClipboard — хук для Copy/Paste узлов графа
 * 
 * Особенности:
 * - Копирование выделенных узлов с сохранением связей между ними
 * - Вставка с автоматическим смещением позиции
 * - Генерация новых ID для избежания конфликтов
 * - Поддержка системного буфера обмена (если доступен)
 */

import { useCallback, useRef } from 'react';
import type { BlueprintNode, BlueprintEdge } from '../../shared/blueprintTypes';

// ============================================
// Типы
// ============================================

export interface ClipboardData {
  /** Скопированные узлы */
  nodes: BlueprintNode[];
  /** Связи между скопированными узлами */
  edges: BlueprintEdge[];
  /** Timestamp копирования */
  timestamp: number;
}

export interface ClipboardActions {
  /** Копировать выделенные узлы */
  copy: (selectedNodeIds: string[], allNodes: BlueprintNode[], allEdges: BlueprintEdge[]) => void;
  /** Вырезать выделенные узлы */
  cut: (selectedNodeIds: string[], allNodes: BlueprintNode[], allEdges: BlueprintEdge[]) => ClipboardData | null;
  /** Вставить узлы из буфера */
  paste: (offset?: { x: number; y: number }) => { nodes: BlueprintNode[]; edges: BlueprintEdge[] } | null;
  /** Проверить наличие данных в буфере */
  hasData: () => boolean;
  /** Очистить буфер */
  clear: () => void;
}

// ============================================
// Константы
// ============================================

const PASTE_OFFSET = { x: 50, y: 50 };

// ============================================
// Утилиты
// ============================================

/**
 * Генерация нового уникального ID
 */
function generateId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Глубокое клонирование
 */
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// ============================================
// Хук
// ============================================

export function useClipboard(): ClipboardActions {
  // Локальный буфер (fallback если системный недоступен)
  const localClipboard = useRef<ClipboardData | null>(null);
  // Счётчик вставок для увеличения смещения
  const pasteCount = useRef(0);

  /**
   * Копировать выделенные узлы
   */
  const copy = useCallback((
    selectedNodeIds: string[],
    allNodes: BlueprintNode[],
    allEdges: BlueprintEdge[]
  ) => {
    if (selectedNodeIds.length === 0) return;

    // Фильтруем выбранные узлы
    const selectedNodes = allNodes.filter(n => selectedNodeIds.includes(n.id));
    
    // Фильтруем связи между выбранными узлами
    const selectedEdges = allEdges.filter(
      e => selectedNodeIds.includes(e.sourceNode) && selectedNodeIds.includes(e.targetNode)
    );

    const data: ClipboardData = {
      nodes: deepClone(selectedNodes),
      edges: deepClone(selectedEdges),
      timestamp: Date.now(),
    };

    // Сохраняем в локальный буфер
    localClipboard.current = data;
    pasteCount.current = 0;

    // Пытаемся сохранить в системный буфер
    try {
      const json = JSON.stringify(data);
      navigator.clipboard.writeText(json).catch(() => {
        // Игнорируем ошибку — используем локальный буфер
      });
    } catch {
      // Системный буфер недоступен
    }
  }, []);

  /**
   * Вырезать выделенные узлы (копировать + вернуть для удаления)
   */
  const cut = useCallback((
    selectedNodeIds: string[],
    allNodes: BlueprintNode[],
    allEdges: BlueprintEdge[]
  ): ClipboardData | null => {
    if (selectedNodeIds.length === 0) return null;

    // Сначала копируем
    copy(selectedNodeIds, allNodes, allEdges);

    // Возвращаем данные для удаления
    return localClipboard.current;
  }, [copy]);

  /**
   * Вставить узлы из буфера
   */
  const paste = useCallback((
    offset: { x: number; y: number } = PASTE_OFFSET
  ): { nodes: BlueprintNode[]; edges: BlueprintEdge[] } | null => {
    const data = localClipboard.current;
    if (!data || data.nodes.length === 0) return null;

    // Увеличиваем смещение с каждой вставкой
    pasteCount.current += 1;
    const actualOffset = {
      x: offset.x * pasteCount.current,
      y: offset.y * pasteCount.current,
    };

    // Создаём маппинг старых ID на новые
    const idMap = new Map<string, string>();
    data.nodes.forEach(node => {
      idMap.set(node.id, generateId());
    });

    // Клонируем узлы с новыми ID и смещёнными позициями
    const newNodes: BlueprintNode[] = data.nodes.map(node => ({
      ...deepClone(node),
      id: idMap.get(node.id)!,
      position: {
        x: node.position.x + actualOffset.x,
        y: node.position.y + actualOffset.y,
      },
    }));

    // Клонируем связи с новыми ID
    const newEdges: BlueprintEdge[] = data.edges.map(edge => ({
      ...deepClone(edge),
      id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      sourceNode: idMap.get(edge.sourceNode) ?? edge.sourceNode,
      targetNode: idMap.get(edge.targetNode) ?? edge.targetNode,
    }));

    return { nodes: newNodes, edges: newEdges };
  }, []);

  /**
   * Проверить наличие данных в буфере
   */
  const hasData = useCallback((): boolean => {
    return localClipboard.current !== null && localClipboard.current.nodes.length > 0;
  }, []);

  /**
   * Очистить буфер
   */
  const clear = useCallback(() => {
    localClipboard.current = null;
    pasteCount.current = 0;
  }, []);

  return {
    copy,
    cut,
    paste,
    hasData,
    clear,
  };
}

export default useClipboard;
