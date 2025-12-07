import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GraphEditor } from '../GraphEditor';
import { createGraphStore } from '../store';
import { createDefaultGraphState } from '../../shared/graphState';
import { getThemeTokens } from '../theme';

vi.mock('cytoscape-dagre', () => ({ default: vi.fn() }));
vi.mock('cytoscape-klay', () => ({ default: vi.fn() }));

type MockCollection<T> = {
  items: T[];
  map: <U>(fn: (item: T) => U) => U[];
  forEach: (fn: (item: T) => void) => void;
  filter: (predicate: (item: T) => boolean) => MockCollection<T>;
  unselect: () => MockCollection<T>;
  removeClass: () => MockCollection<T>;
  addClass: () => MockCollection<T>;
  select: () => MockCollection<T>;
  remove: () => MockCollection<T>;
  every: (predicate: (item: T) => boolean) => boolean;
  connectedNodes: () => MockCollection<T>;
  length: number;
};

const createMockCollection = <T,>(items: T[] = []): MockCollection<T> => {
  const collection: MockCollection<T> = {
    items,
    map: (fn) => collection.items.map(fn),
    forEach: (fn) => collection.items.forEach(fn),
    filter: (predicate) => createMockCollection(collection.items.filter(predicate)),
    unselect: () => collection,
    removeClass: () => collection,
    addClass: () => collection,
    select: () => collection,
    remove: () => collection,
    every: (predicate) => collection.items.every(predicate),
    connectedNodes: () => createMockCollection<T>(),
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

type GraphElementData = { id: string; source?: string; target?: string };
type GraphElement = { data: GraphElementData };

const createMockCytoscape = (options?: { elements?: GraphElement[] }) => {
  const nodeElements = options?.elements?.filter((item) => !item.data.source) ?? [];
  const nodes = createMockCollection(nodeElements.map((item) => createMockElement(item.data.id)));
  const edges = createMockCollection<GraphElement>();
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
  type CytoscapeFactory = ((options?: { elements?: GraphElement[] }) => ReturnType<typeof createMockCytoscape>) & {
    use: ReturnType<typeof vi.fn>;
  };
  const mockFactory = ((options?: { elements?: GraphElement[] }) => createMockCytoscape(options)) as CytoscapeFactory;
  mockFactory.use = vi.fn();
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
