import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ClassEditor } from '../ClassEditor';
import type { BlueprintClass } from '../../shared/blueprintTypes';

const createClass = (): BlueprintClass => ({
  id: 'class-1',
  name: 'Player',
  nameRu: 'Игрок',
  namespace: 'Gameplay',
  members: [
    {
      id: 'member-health',
      name: 'health',
      nameRu: 'Здоровье',
      dataType: 'int32',
      access: 'private',
    },
  ],
  methods: [
    {
      id: 'method-jump',
      name: 'Jump',
      nameRu: 'Прыжок',
      returnType: 'bool',
      params: [],
      access: 'public',
      isStatic: false,
      isConst: false,
      isVirtual: false,
      isOverride: false,
    },
  ],
});

describe('ClassEditor', () => {
  it('saves updated class fields', () => {
    const onSave = vi.fn();
    render(
      <ClassEditor
        classItem={createClass()}
        displayLanguage="ru"
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    const codeNameInput = screen.getByDisplayValue('Player');
    fireEvent.change(codeNameInput, { target: { value: 'PlayerPawn' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const savedClass = onSave.mock.calls[0][0] as BlueprintClass;
    expect(savedClass.name).toBe('PlayerPawn');
    expect(savedClass.nameRu).toBe('Игрок');
  });

  it('normalizes empty names on save', () => {
    const onSave = vi.fn();
    render(
      <ClassEditor
        classItem={createClass()}
        displayLanguage="ru"
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByDisplayValue('Player'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    const savedClass = onSave.mock.calls[0][0] as BlueprintClass;
    expect(savedClass.name).toBe('NewClass');
    expect(savedClass.nameRu).toBe('Игрок');
  });

  it('calls delete callback', () => {
    const onDelete = vi.fn();
    render(
      <ClassEditor
        classItem={createClass()}
        displayLanguage="ru"
        onSave={vi.fn()}
        onClose={vi.fn()}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Удалить класс' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
