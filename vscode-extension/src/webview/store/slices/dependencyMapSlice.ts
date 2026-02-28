import type { StateCreator } from 'zustand';
import type { DependencyMapSliceState, DependencyMapState } from './indexerTypes';

export interface DependencyMapSlice extends DependencyMapSliceState {
  setDependencyMap: (map: DependencyMapState) => void;
  getReachableDependencyIds: (rootDependencyId?: string) => Set<string>;
}

const emptyDependencyMap: DependencyMapState = {
  nodes: [],
  edges: []
};

export const createDependencyMapSlice: StateCreator<
  DependencyMapSlice,
  [],
  [],
  DependencyMapSlice
> =
  (set, get) => ({
    dependencyMap: emptyDependencyMap,
    setDependencyMap: (map) => set({ dependencyMap: map }),
    getReachableDependencyIds: (rootDependencyId) => {
      const { dependencyMap } = get();
      if (!rootDependencyId) {
        return new Set(dependencyMap.nodes.map((node) => node.id));
      }

      const adjacency = new Map<string, string[]>();
      for (const edge of dependencyMap.edges) {
        const targets = adjacency.get(edge.from) ?? [];
        targets.push(edge.to);
        adjacency.set(edge.from, targets);
      }

      const visited = new Set<string>();
      const queue: string[] = [rootDependencyId];

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current || visited.has(current)) {
          continue;
        }
        visited.add(current);
        const next = adjacency.get(current) ?? [];
        for (const item of next) {
          if (!visited.has(item)) {
            queue.push(item);
          }
        }
      }

      return visited;
    }
  });
