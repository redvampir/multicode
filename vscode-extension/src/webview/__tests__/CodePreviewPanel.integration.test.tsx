import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CodePreviewPanel } from '../CodePreviewPanel';
import type { BlueprintGraphState, BlueprintNodeType } from '../../shared/blueprintTypes';
import { createEdge, createNode } from '../../shared/blueprintTypes';
import type { BlueprintNode } from '../../shared/blueprintTypes';
import type { PortDataType } from '../../shared/portTypes';

function createGraphWithCustomNode(): BlueprintGraphState {
  const startNode = createNode('Start', { x: 0, y: 0 }, 'start');
  const customNode: BlueprintNode = {
    id: 'custom-1',
    type: 'PackageLog' as BlueprintNodeType,
    label: 'Custom Log',
    position: { x: 240, y: 0 },
    inputs: [
      { id: 'custom-1-exec-in', name: 'In', dataType: 'execution' as PortDataType, direction: 'input' as const, index: 0 },
      { id: 'custom-1-message', name: 'Message', dataType: 'string' as PortDataType, direction: 'input' as const, index: 1, value: 'Интеграционный тест' },
    ],
    outputs: [
      { id: 'custom-1-exec-out', name: 'Out', dataType: 'execution' as PortDataType, direction: 'output' as const, index: 0 },
    ],
  };

  return {
    id: 'graph-1',
    name: 'Integration Graph',
    language: 'cpp',
    displayLanguage: 'ru',
    nodes: [startNode, customNode],
    edges: [createEdge('start', 'start-exec-out', 'custom-1', 'custom-1-exec-in')],
    updatedAt: new Date().toISOString(),
  };
}

describe('CodePreviewPanel integration', () => {
  it('должен генерировать код пакетного узла из codegen.cpp.template', () => {
    const graph = createGraphWithCustomNode();

    render(
      <CodePreviewPanel
        graph={graph}
        displayLanguage="ru"
        visible={true}
        onClose={() => undefined}
        packageRegistrySnapshot={{
          registryVersion: 7,
          packageNodeTypes: ['PackageLog' as BlueprintNodeType],
          getNodeDefinition: (type: string) => {
            if (type !== 'PackageLog') return undefined;
            return {
              type: 'PackageLog' as BlueprintNodeType,
              label: 'Custom Log',
              category: 'io',
              inputs: [
                { id: 'exec-in', name: 'In', dataType: 'execution' as PortDataType },
                { id: 'message', name: 'Message', dataType: 'string' as PortDataType },
              ],
              outputs: [{ id: 'exec-out', name: 'Out', dataType: 'execution' as PortDataType }],
              _codegen: {
                cpp: {
                  template: 'LOG_INFO({{input.message}});',
                  includes: ['<logging.h>'],
                },
              },
            };
          },
        }}
      />
    );

    expect(screen.getByText(/LOG_INFO/)).toBeInTheDocument();
    expect(screen.getAllByText(/#include/).length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain('logging');
  });

  it('должен показывать предупреждение fallback при недоступном registry и неизвестном узле', () => {
    const graph = createGraphWithCustomNode();

    render(
      <CodePreviewPanel
        graph={graph}
        displayLanguage="ru"
        visible={true}
        onClose={() => undefined}
      />
    );

    expect(document.body.textContent).toContain('Реестр пакетов недоступен');
  });
});
