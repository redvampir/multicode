import { describe, expect, it, vi, afterEach } from 'vitest';
import { createDefaultGraphState } from '../../shared/graphState';
import { createGraphStore } from '../store';
import { addNode, applyLayout, connect, deleteItems } from '../storeActions';

const createStore = () => createGraphStore(createDefaultGraphState());

afterEach(() => {
  vi.useRealTimers();
});

describe('storeActions', () => {
  it('добавляет узел с дефолтными полями и метками времени', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T12:00:00Z'));
    const store = createStore();

    const node = addNode(store, { label: 'Новый узел', nodeType: 'Custom' });
    const { graph, selectedNodeIds } = store.getState();

    expect(graph.nodes.find((item) => item.id === node.id)?.label).toBe('Новый узел');
    expect(graph.updatedAt).toBe('2024-01-01T12:00:00.000Z');
    expect(graph.dirty).toBe(true);
    expect(selectedNodeIds).toEqual([node.id]);
  });

  it('создаёт связь между существующими узлами', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-02-02T00:00:00Z'));
    const store = createStore();

    const success = connect(store, { sourceId: 'node-start', targetId: 'node-end', label: 'custom' });
    const { graph, selectedEdgeIds } = store.getState();

    expect(success).toBe(true);
    expect(graph.edges.some((edge) => edge.source === 'node-start' && edge.target === 'node-end')).toBe(
      true
    );
    expect(graph.updatedAt).toBe('2024-02-02T00:00:00.000Z');
    expect(selectedEdgeIds.length).toBe(1);
  });

  it('не создаёт дубликат связи', () => {
    const store = createStore();

    const first = connect(store, { sourceId: 'node-start', targetId: 'node-func' });
    const duplicate = connect(store, { sourceId: 'node-start', targetId: 'node-func' });

    expect(first).toBe(false);
    expect(duplicate).toBe(false);
  });

  it('удаляет узлы и связанные с ними рёбра', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-03T00:00:00Z'));
    const store = createStore();

    deleteItems(store, { nodeIds: ['node-func'] });
    const { graph, selectedNodeIds, selectedEdgeIds } = store.getState();

    expect(graph.nodes.some((node) => node.id === 'node-func')).toBe(false);
    expect(graph.edges.length).toBe(0);
    expect(graph.updatedAt).toBe('2024-03-03T00:00:00.000Z');
    expect(selectedNodeIds).toEqual([]);
    expect(selectedEdgeIds).toEqual([]);
  });

  it('применяет вычисленный лэйаут', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-04-04T10:00:00Z'));
    const store = createStore();

    applyLayout(store, {
      'node-start': { x: 10, y: 20 },
      'node-func': { x: 30, y: 40 }
    });

    const { graph } = store.getState();
    const positions = Object.fromEntries(
      graph.nodes.map((node) => [node.id, node.position ?? { x: 0, y: 0 }])
    );

    expect(positions['node-start']).toEqual({ x: 10, y: 20 });
    expect(positions['node-func']).toEqual({ x: 30, y: 40 });
    expect(graph.updatedAt).toBe('2024-04-04T10:00:00.000Z');
    expect(graph.dirty).toBe(true);
  });
});
