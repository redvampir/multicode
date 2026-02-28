import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ClassPanel } from '../ClassPanel';
import type { BlueprintGraphState } from '../../shared/blueprintTypes';

const createGraphState = (): BlueprintGraphState => ({
  id: 'graph-id',
  name: 'Graph',
  language: 'cpp',
  displayLanguage: 'ru',
  nodes: [],
  edges: [],
  functions: [],
  variables: [],
  classes: [],
  updatedAt: new Date().toISOString(),
});

describe('ClassPanel', () => {
  it('smoke: рендерит панель', () => {
    render(
      <ClassPanel
        graphState={createGraphState()}
        onClassesChange={vi.fn()}
        displayLanguage="ru"
      />,
    );

    expect(screen.getByTestId('class-panel')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Классы' })).toBeInTheDocument();
  });

  it('создаёт новый класс', () => {
    const onClassesChange = vi.fn();

    render(
      <ClassPanel
        graphState={createGraphState()}
        onClassesChange={onClassesChange}
        displayLanguage="ru"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Класс/i }));

    expect(onClassesChange).toHaveBeenCalledTimes(1);
    const classes = onClassesChange.mock.calls[0][0] as Array<{ name: string }>;
    expect(classes).toHaveLength(1);
    expect(classes[0].name).toBe('NewClass1');
  });
});
