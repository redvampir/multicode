/**
 * Тесты для хука usePackageRegistry
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
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

  it('должен предоставить категории', async () => {
    const { result } = renderHook(() => usePackageRegistry());

    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });

    expect(result.current.categories.length).toBeGreaterThan(0);
    const flowCategory = result.current.categories.find(c => c.id === 'flow');
    expect(flowCategory).toBeDefined();
    expect(flowCategory?.labelRu).toBe('Управление потоком');
  });

  it('должен найти узел через getNode', async () => {
    const { result } = renderHook(() => usePackageRegistry());

    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });

    // Встроенный узел
    const startNode = result.current.getNode('Start');
    expect(startNode).toBeDefined();
    expect(startNode?.labelRu).toBe('Начало');

    // Узел из пакета
    const testNode = result.current.getNode('TestNode');
    expect(testNode).toBeDefined();
    expect(testNode?.labelRu).toBe('Тестовый узел');

    // Несуществующий узел
    const unknownNode = result.current.getNode('UnknownNode');
    expect(unknownNode).toBeUndefined();
  });

  it('должен загружать дополнительные пакеты', async () => {
    const { result } = renderHook(() => usePackageRegistry());

    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });

    const customPackage = {
      name: '@test/custom',
      version: '1.0.0',
      displayName: 'Custom Package',
      displayNameRu: 'Пользовательский пакет',
      nodes: [
        {
          type: 'CustomNode',
          label: 'Custom',
          labelRu: 'Пользовательский',
          category: 'other',
          inputs: [],
          outputs: [],
        },
      ],
    };

    act(() => {
      const loadResult = result.current.loadPackage(customPackage);
      expect(loadResult.success).toBe(true);
    });

    expect(result.current.packages).toContainEqual(
      expect.objectContaining({ name: '@test/custom' })
    );
    expect(result.current.getNode('CustomNode')).toBeDefined();
  });

  it('должен выгружать пакеты', async () => {
    const { result } = renderHook(() => usePackageRegistry());

    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });

    // Загружаем пакет
    const customPackage = {
      name: '@test/removable',
      version: '1.0.0',
      displayName: 'Removable',
      displayNameRu: 'Удаляемый',
      nodes: [
        {
          type: 'RemovableNode',
          label: 'Removable',
          labelRu: 'Удаляемый',
          category: 'other',
          inputs: [],
          outputs: [],
        },
      ],
    };

    act(() => {
      result.current.loadPackage(customPackage);
    });

    expect(result.current.getNode('RemovableNode')).toBeDefined();

    // Выгружаем
    act(() => {
      const unloaded = result.current.unloadPackage('@test/removable');
      expect(unloaded).toBe(true);
    });

    // Узел из пакета больше не доступен
    expect(result.current.getNode('RemovableNode')).toBeUndefined();
    expect(result.current.packages).not.toContainEqual(
      expect.objectContaining({ name: '@test/removable' })
    );
  });

  it('должен группировать узлы по категориям', async () => {
    const { result } = renderHook(() => usePackageRegistry());

    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });

    const flowNodes = result.current.nodesByCategory.get('flow');
    expect(flowNodes).toBeDefined();
    expect(flowNodes!.length).toBeGreaterThan(0);

    // Проверяем что Start есть в flow
    const hasStart = flowNodes!.some(n => n.type === 'Start');
    expect(hasStart).toBe(true);
  });

  it('должен возвращать ошибки при невалидном пакете', async () => {
    const { result } = renderHook(() => usePackageRegistry());

    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });

    const invalidPackage = {
      name: 'invalid',
      // missing required fields
    };

    act(() => {
      const loadResult = result.current.loadPackage(invalidPackage);
      expect(loadResult.success).toBe(false);
      expect(loadResult.errors).toBeDefined();
      expect(loadResult.errors!.length).toBeGreaterThan(0);
    });
  });
});
