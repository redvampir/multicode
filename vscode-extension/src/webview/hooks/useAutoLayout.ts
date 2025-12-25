/**
 * useAutoLayout — хук для автоматической раскладки графа с использованием dagre
 * 
 * Поддерживает:
 * - Вертикальную (TB) и горизонтальную (LR) раскладку
 * - Настраиваемые отступы между узлами
 * - Анимированное перемещение узлов
 */

import { useCallback } from 'react';
import dagre from 'dagre';
import { Node, useReactFlow } from '@xyflow/react';

// ============================================
// Типы
// ============================================

export type LayoutDirection = 'TB' | 'LR'; // Top-Bottom или Left-Right

export interface AutoLayoutOptions {
  /** Направление раскладки */
  direction?: LayoutDirection;
  /** Горизонтальный отступ между узлами */
  nodeSpacingX?: number;
  /** Вертикальный отступ между узлами */
  nodeSpacingY?: number;
  /** Ширина узла по умолчанию (если не измерена) */
  defaultNodeWidth?: number;
  /** Высота узла по умолчанию (если не измерена) */
  defaultNodeHeight?: number;
}

const DEFAULT_OPTIONS: Required<AutoLayoutOptions> = {
  direction: 'TB',
  nodeSpacingX: 100,
  nodeSpacingY: 80,
  defaultNodeWidth: 220,
  defaultNodeHeight: 120,
};

// ============================================
// Хук
// ============================================

export interface UseAutoLayoutReturn {
  /** Применить автолейаут к текущему графу */
  applyLayout: (options?: AutoLayoutOptions) => void;
}

export function useAutoLayout(): UseAutoLayoutReturn {
  const { getNodes, getEdges, setNodes, fitView } = useReactFlow();

  const applyLayout = useCallback((options?: AutoLayoutOptions) => {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const nodes = getNodes();
    const edges = getEdges();

    if (nodes.length === 0) return;

    // Создаём dagre граф
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    
    // Настройки графа
    dagreGraph.setGraph({
      rankdir: opts.direction,
      nodesep: opts.nodeSpacingX,
      ranksep: opts.nodeSpacingY,
      marginx: 50,
      marginy: 50,
    });

    // Добавляем узлы
    nodes.forEach((node) => {
      // Пробуем получить реальные размеры из DOM
      const nodeElement = document.querySelector(`[data-id="${node.id}"]`);
      const width = nodeElement?.clientWidth ?? opts.defaultNodeWidth;
      const height = nodeElement?.clientHeight ?? opts.defaultNodeHeight;
      
      dagreGraph.setNode(node.id, { width, height });
    });

    // Добавляем рёбра
    edges.forEach((edge) => {
      dagreGraph.setEdge(edge.source, edge.target);
    });

    // Вычисляем раскладку
    dagre.layout(dagreGraph);

    // Применяем новые позиции к узлам
    const layoutedNodes: Node[] = nodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      
      // dagre возвращает центр узла, а React Flow использует верхний левый угол
      const nodeElement = document.querySelector(`[data-id="${node.id}"]`);
      const width = nodeElement?.clientWidth ?? opts.defaultNodeWidth;
      const height = nodeElement?.clientHeight ?? opts.defaultNodeHeight;
      
      return {
        ...node,
        position: {
          x: nodeWithPosition.x - width / 2,
          y: nodeWithPosition.y - height / 2,
        },
      };
    });

    setNodes(layoutedNodes);
    
    // Подождать обновления DOM и вписать граф
    setTimeout(() => {
      fitView({ padding: 0.2, duration: 300 });
    }, 50);
  }, [getNodes, getEdges, setNodes, fitView]);

  return { applyLayout };
}

export default useAutoLayout;
