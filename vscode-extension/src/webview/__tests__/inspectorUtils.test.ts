import { describe, expect, it } from 'vitest';
import { createDefaultGraphState } from '../../shared/graphState';
import type { ValidationIssue, ValidationResult } from '../../shared/validator';
import {
  buildValidationIssues,
  filterValidationIssuesBySelection,
  resolveGraphNodeDisplayName,
} from '../inspectorUtils';

describe('inspectorUtils', () => {
  it('строит issues из legacy errors и warnings', () => {
    const validation: ValidationResult = {
      ok: false,
      errors: ['Ошибка узла'],
      warnings: ['Предупреждение графа'],
      issues: [],
    };

    expect(buildValidationIssues(validation)).toEqual([
      {
        severity: 'error',
        message: 'Ошибка узла',
        nodes: undefined,
        edges: undefined,
      },
      {
        severity: 'warning',
        message: 'Предупреждение графа',
        nodes: undefined,
        edges: undefined,
      },
    ]);
  });

  it('фильтрует issues по выбранным node/edge id', () => {
    const issues: ValidationIssue[] = [
      { severity: 'error', message: 'Node problem', nodes: ['node-a'], edges: undefined },
      { severity: 'warning', message: 'Edge warning', nodes: undefined, edges: ['edge-a'] },
      { severity: 'error', message: 'Graph problem', nodes: undefined, edges: undefined },
    ];

    expect(filterValidationIssuesBySelection(issues, ['node-a'], undefined)).toEqual([issues[0]]);
    expect(filterValidationIssuesBySelection(issues, undefined, ['edge-a'])).toEqual([issues[1]]);
    expect(filterValidationIssuesBySelection(issues, ['node-a'], ['edge-a'])).toEqual([issues[0], issues[1]]);
  });

  it('человекочитаемо показывает variable nodes в RU', () => {
    const graph = createDefaultGraphState();
    graph.displayLanguage = 'ru';
    graph.nodes = [
      {
        id: 'node-var',
        label: '',
        type: 'Variable',
        blueprintNode: {
          type: 'GetVariable',
          properties: {
            nameRu: 'Скорость',
            name: 'Speed',
          },
        },
      },
    ];

    expect(resolveGraphNodeDisplayName(graph, graph.nodes[0])).toBe('Получить: Скорость');
  });
});
