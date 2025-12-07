import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GraphEditor } from '../GraphEditor';
import { createGraphStore } from '../store';
import { createDefaultGraphState } from '../../shared/graphState';
import { getThemeTokens } from '../theme';

vi.mock('cytoscape-dagre', () => ({ default: vi.fn() }));
vi.mock('cytoscape-klay', () => ({ default: vi.fn() }));

const createMockCollection = (items: any[] = []) => {
  const collection = {
    items,
    map: (fn: (item: any) => any) => collection.items.map(fn),
    forEach: (fn: (item: any) => void) => collection.items.forEach(fn),
    filter: (predicate: (item: any) => boolean) =>
      createMockCollection(collection.items.filter(predicate)),
    unselect: () => collection,
    removeClass: () => collection,
    addClass: () => collection,
    select: () => collection,
    remove: () => collection,
    every: (predicate: (item: any) => boolean) => collection.items.every(predicate),
    connectedNodes: () => createMockCollection(),
    length: items.length
  };
  return collection;
};

const createMockElement = (id: string) => ({
  id: () => id,
  position: () => ({ x: 0, y: 0 }),
  selected: () => false,
  select: () => ({
    select: () => undefined
  }),
  unselect: () => undefined,
  isNode: () => true,
  isEdge: () => false,
  connectedNodes: () => createMockCollection()
});

const createMockCytoscape = (options?: { elements?: Array<{ data: { id: string } }> }) => {
  const nodeElements = options?.elements?.filter((item) => !('source' in (item.data as any))) ?? [];
  const nodes = createMockCollection(nodeElements.map((item) => createMockElement(item.data.id)));
  const edges = createMockCollection();
  const elements = createMockCollection(options?.elements ?? []);

  return {
    elements: () => elements,
    nodes: () => nodes,
    edges: () => edges,
    layout: () => ({
      run: vi.fn(),
      once: (_event: string, handler: () => void) => handler()
    }),
    style: () => ({ fromJson: () => ({ update: vi.fn() }) }),
    on: vi.fn(),
    off: vi.fn(),
    batch: (fn: () => void) => fn(),
    destroy: vi.fn(),
    add: vi.fn(),
    animate: vi.fn(),
    center: vi.fn(),
    fit: vi.fn(),
    zoom: vi.fn(),
    pan: vi.fn(),
    $id: (id: string) => createMockElement(id)
  };
};

vi.mock('cytoscape', () => {
  const mockFactory = (options?: { elements?: Array<{ data: { id: string } }> }) => createMockCytoscape(options);
  (mockFactory as any).use = vi.fn();
  return { default: mockFactory };
});

describe('GraphEditor', () => {
  it('рендерит базовый граф без ошибок', () => {
    const store = createGraphStore(createDefaultGraphState());
    const theme = getThemeTokens('light');

    render(
      <GraphEditor
        graphStore={store}
        theme={theme}
        onAddNode={vi.fn()}
        onConnectNodes={vi.fn()}
      />
    );

    expect(screen.getByPlaceholderText('Поиск по узлам и связям')).toBeInTheDocument();
  });
});
