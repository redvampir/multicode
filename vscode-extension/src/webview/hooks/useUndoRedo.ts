/**
 * useUndoRedo — хук для управления историей состояний (Undo/Redo)
 * 
 * Реализация на основе паттерна Memento:
 * - Хранит стек прошлых и будущих состояний
 * - Поддерживает настраиваемый лимит истории
 * - Автоматически сжимает быстрые последовательные изменения (debounce)
 */

import { useCallback, useRef, useState } from 'react';

// ============================================
// Типы
// ============================================

export interface UndoRedoState<T> {
  /** Текущее состояние */
  current: T;
  /** Можно ли отменить действие */
  canUndo: boolean;
  /** Можно ли повторить действие */
  canRedo: boolean;
  /** Количество шагов в истории отмены */
  undoCount: number;
  /** Количество шагов в истории повтора */
  redoCount: number;
}

export interface UndoRedoActions<T> {
  /** Установить новое состояние (добавляется в историю) */
  set: (value: T | ((prev: T) => T)) => void;
  /** Отменить последнее действие */
  undo: () => void;
  /** Повторить отменённое действие */
  redo: () => void;
  /** Очистить историю */
  clearHistory: () => void;
  /** Принудительно сохранить текущее состояние в историю (для группировки изменений) */
  checkpoint: () => void;
}

export interface UseUndoRedoOptions {
  /** Максимальное количество шагов в истории (по умолчанию 50) */
  maxHistory?: number;
  /** Задержка перед созданием нового снапшота в мс (debounce, по умолчанию 300) */
  debounceMs?: number;
}

// ============================================
// Утилиты
// ============================================

/**
 * Глубокое клонирование объекта через JSON
 * Быстро и надёжно для сериализуемых структур
 */
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Сравнение двух объектов на равенство (по JSON)
 */
function isEqual<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ============================================
// Хук
// ============================================

export function useUndoRedo<T>(
  initialValue: T,
  options: UseUndoRedoOptions = {}
): [UndoRedoState<T>, UndoRedoActions<T>] {
  const { maxHistory = 50, debounceMs = 300 } = options;

  // Текущее состояние
  const [current, setCurrent] = useState<T>(() => deepClone(initialValue));

  // Стеки истории (хранятся в ref для избежания лишних ререндеров)
  const undoStack = useRef<T[]>([]);
  const redoStack = useRef<T[]>([]);

  // Таймер для debounce
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Последнее сохранённое состояние (для сравнения)
  const lastSaved = useRef<T>(deepClone(initialValue));

  // Флаг: находимся ли в процессе undo/redo
  const isUndoRedoing = useRef(false);

  // Счётчики для реактивного обновления UI
  const [, forceUpdate] = useState(0);
  const triggerUpdate = useCallback(() => forceUpdate(x => x + 1), []);

  /**
   * Сохранить текущее состояние в undo-стек
   */
  const pushToUndoStack = useCallback((state: T) => {
    // Не сохраняем если состояние не изменилось
    if (isEqual(state, lastSaved.current)) return;

    undoStack.current.push(deepClone(lastSaved.current));
    
    // Ограничиваем размер стека
    if (undoStack.current.length > maxHistory) {
      undoStack.current.shift();
    }
    
    // Очищаем redo стек при новом изменении
    redoStack.current = [];
    
    lastSaved.current = deepClone(state);
    triggerUpdate();
  }, [maxHistory, triggerUpdate]);

  /**
   * Установить новое состояние
   */
  const set = useCallback((value: T | ((prev: T) => T)) => {
    setCurrent(prev => {
      const newValue = typeof value === 'function' 
        ? (value as (prev: T) => T)(prev)
        : value;

      // Если это undo/redo операция, не добавляем в историю
      if (isUndoRedoing.current) {
        return newValue;
      }

      // Debounce: откладываем сохранение в историю
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      debounceTimer.current = setTimeout(() => {
        pushToUndoStack(newValue);
        debounceTimer.current = null;
      }, debounceMs);

      return newValue;
    });
  }, [debounceMs, pushToUndoStack]);

  /**
   * Отменить последнее действие
   */
  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;

    // Сохраняем текущее состояние в redo
    redoStack.current.push(deepClone(lastSaved.current));

    // Восстанавливаем предыдущее состояние
    const previousState = undoStack.current.pop()!;
    lastSaved.current = deepClone(previousState);

    // Устанавливаем состояние без добавления в историю
    isUndoRedoing.current = true;
    setCurrent(previousState);
    isUndoRedoing.current = false;

    // Отменяем pending debounce
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }

    triggerUpdate();
  }, [triggerUpdate]);

  /**
   * Повторить отменённое действие
   */
  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;

    // Сохраняем текущее состояние в undo
    undoStack.current.push(deepClone(lastSaved.current));

    // Восстанавливаем следующее состояние
    const nextState = redoStack.current.pop()!;
    lastSaved.current = deepClone(nextState);

    // Устанавливаем состояние без добавления в историю
    isUndoRedoing.current = true;
    setCurrent(nextState);
    isUndoRedoing.current = false;

    // Отменяем pending debounce
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }

    triggerUpdate();
  }, [triggerUpdate]);

  /**
   * Очистить всю историю
   */
  const clearHistory = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    lastSaved.current = deepClone(current);
    
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    
    triggerUpdate();
  }, [current, triggerUpdate]);

  /**
   * Принудительно сохранить текущее состояние (checkpoint)
   * Полезно для группировки мелких изменений
   */
  const checkpoint = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    pushToUndoStack(current);
  }, [current, pushToUndoStack]);

  // Формируем состояние
  const state: UndoRedoState<T> = {
    current,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    undoCount: undoStack.current.length,
    redoCount: redoStack.current.length,
  };

  // Формируем действия
  const actions: UndoRedoActions<T> = {
    set,
    undo,
    redo,
    clearHistory,
    checkpoint,
  };

  return [state, actions];
}

export default useUndoRedo;
