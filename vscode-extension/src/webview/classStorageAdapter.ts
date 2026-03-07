import type { BlueprintClass, BlueprintGraphState } from '../shared/blueprintTypes';

export type ClassStorageMode = 'embedded' | 'sidecar';

export interface ClassStorageAdapter {
  readonly mode: ClassStorageMode;
  readClasses(graph: BlueprintGraphState): BlueprintClass[];
  writeClasses(graph: BlueprintGraphState, classes: BlueprintClass[]): BlueprintGraphState;
}

export const embeddedClassStorageAdapter: ClassStorageAdapter = {
  mode: 'embedded',
  readClasses(graph) {
    return Array.isArray(graph.classes) ? graph.classes : [];
  },
  writeClasses(graph, classes) {
    return {
      ...graph,
      classes,
    };
  },
};

export const createClassStorageAdapter = (mode: ClassStorageMode = 'embedded'): ClassStorageAdapter => {
  if (mode === 'sidecar') {
    // sidecar mode будет добавлен в итерации B;
    // на текущем цикле работаем через embedded без изменения UI-контракта.
    return embeddedClassStorageAdapter;
  }
  return embeddedClassStorageAdapter;
};
