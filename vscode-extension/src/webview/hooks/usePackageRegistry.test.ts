/**
 * Тесты для хука usePackageRegistry
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePackageRegistry } from './usePackageRegistry';
import { globalRegistry } from '../../shared/packageLoader';

// Мок для стандартного пакета
vi.mock('../../../../packages/std/package.json', () => ({
  default: {
    name: '@multicode/std',
    version: '0.5.0',
    displayName: 'Standard Library',
    displayNameRu: 'Стандартная библиотека',
    nodes: [
      {
        type: 'TestNode',
        label: 'Test Node',
        labelRu: 'Тестовый узел',
        category: 'flow',
        inputs: [],
        outputs: [{ id: 'exec-out', name: '', dataType: 'execution' }],
      },
    ],
  },
}));

vi.mock('../../../../packages/ue/package.json', () => ({
  default: {
    name: '@multicode/ue',
    version: '0.1.0',
    displayName: 'Unreal Engine Nodes',
    displayNameRu: 'Узлы Unreal Engine',
    nodes: [
      {
        type: 'SpawnActor',
        label: 'Spawn Actor',
        labelRu: 'Создать Actor',
        category: 'function',
        inputs: [],
        outputs: [],
      },
    ],
  },
}));

describe('usePackageRegistry', () => {
  beforeEach(() => {
    // Очищаем реестр перед каждым тестом
    globalRegistry.clear();
  });

  it('должен загрузить стандартный пакет при монтировании', async () => {
    const { result } = renderHook(() => usePackageRegistry());

    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });

    expect(result.current.errors).toHaveLength(0);
    expect(result.current.packages).toContainEqual(
      expect.objectContaining({ name: '@multicode/std' })
    );
  });

  it('smoke: UE-узел недоступен по умолчанию (деградация без UE-пакета)', async () => {
    const { result } = renderHook(() => usePackageRegistry());

    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });

    expect(result.current.getNode('SpawnActor')).toBeUndefined();
    expect(result.current.packages).not.toContainEqual(
      expect.objectContaining({ name: '@multicode/ue' })
    );
  });

  it('smoke: UE-узел доступен при включённом UE-пакете', async () => {
    const { result } = renderHook(() => usePackageRegistry({ enableUePackage: true }));

    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });

    expect(result.current.getNode('SpawnActor')).toBeDefined();
    expect(result.current.packages).toContainEqual(
      expect.objectContaining({ name: '@multicode/ue' })
    );
  });

  it('должен предоставить nodeDefinitions', async () => {
    const { result } = renderHook(() => usePackageRegistry());

    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });

    // Должны быть и встроенные узлы и из пакета
    expect(result.current.nodeDefinitions).toHaveProperty('Start');
    expect(result.current.nodeDefinitions).toHaveProperty('End');
    expect(result.current.nodeDefinitions).toHaveProperty('TestNode');
  });
});
