/**
 * Тесты для useUndoRedo — хук управления историей состояний
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUndoRedo } from './useUndoRedo';

describe('useUndoRedo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  
  afterEach(() => {
    vi.useRealTimers();
  });
  
  describe('инициализация', () => {
    it('должен инициализироваться с начальным значением', () => {
      const { result } = renderHook(() => useUndoRedo({ count: 0 }));
      
      expect(result.current[0].current).toEqual({ count: 0 });
      expect(result.current[0].canUndo).toBe(false);
      expect(result.current[0].canRedo).toBe(false);
      expect(result.current[0].undoCount).toBe(0);
      expect(result.current[0].redoCount).toBe(0);
    });
    
    it('должен клонировать начальное значение', () => {
      const initial = { count: 0 };
      const { result } = renderHook(() => useUndoRedo(initial));
      
      // Изменение исходного объекта не должно влиять на состояние
      initial.count = 999;
      expect(result.current[0].current.count).toBe(0);
    });
  });
  
  describe('set', () => {
    it('должен обновлять текущее значение', () => {
      const { result } = renderHook(() => useUndoRedo({ count: 0 }));
      
      act(() => {
        result.current[1].set({ count: 1 });
      });
      
      expect(result.current[0].current).toEqual({ count: 1 });
    });
    
    it('должен поддерживать функциональное обновление', () => {
      const { result } = renderHook(() => useUndoRedo({ count: 0 }));
      
      act(() => {
        result.current[1].set(prev => ({ count: prev.count + 5 }));
      });
      
      expect(result.current[0].current).toEqual({ count: 5 });
    });
    
    it('должен добавлять в историю после debounce', () => {
      const { result } = renderHook(() => 
        useUndoRedo({ count: 0 }, { debounceMs: 100 })
      );
      
      act(() => {
        result.current[1].set({ count: 1 });
      });
      
      // До debounce история пуста
      expect(result.current[0].canUndo).toBe(false);
      
      // После debounce история обновляется
      act(() => {
        vi.advanceTimersByTime(150);
      });
      
      expect(result.current[0].canUndo).toBe(true);
      expect(result.current[0].undoCount).toBe(1);
    });
  });
  
  describe('undo', () => {
    it('должен отменять последнее изменение', async () => {
      const { result } = renderHook(() => 
        useUndoRedo({ count: 0 }, { debounceMs: 10 })
      );
      
      act(() => {
        result.current[1].set({ count: 1 });
      });
      
      act(() => {
        vi.advanceTimersByTime(20);
      });
      
      act(() => {
        result.current[1].set({ count: 2 });
      });
      
      act(() => {
        vi.advanceTimersByTime(20);
      });
      
      expect(result.current[0].current).toEqual({ count: 2 });
      
      act(() => {
        result.current[1].undo();
      });
      
      expect(result.current[0].current).toEqual({ count: 1 });
    });
    
    it('не должен делать ничего если история пуста', () => {
      const { result } = renderHook(() => useUndoRedo({ count: 0 }));
      
      act(() => {
        result.current[1].undo();
      });
      
      expect(result.current[0].current).toEqual({ count: 0 });
    });
    
    it('должен обновлять canRedo после undo', () => {
      const { result } = renderHook(() => 
        useUndoRedo({ count: 0 }, { debounceMs: 10 })
      );
      
      act(() => {
        result.current[1].set({ count: 1 });
      });
      
      act(() => {
        vi.advanceTimersByTime(20);
      });
      
      expect(result.current[0].canRedo).toBe(false);
      
      act(() => {
        result.current[1].undo();
      });
      
      expect(result.current[0].canRedo).toBe(true);
    });
  });
  
  describe('redo', () => {
    it('должен повторять отменённое действие', () => {
      const { result } = renderHook(() => 
        useUndoRedo({ count: 0 }, { debounceMs: 10 })
      );
      
      act(() => {
        result.current[1].set({ count: 1 });
      });
      
      act(() => {
        vi.advanceTimersByTime(20);
      });
      
      act(() => {
        result.current[1].undo();
      });
      
      expect(result.current[0].current).toEqual({ count: 0 });
      
      act(() => {
        result.current[1].redo();
      });
      
      expect(result.current[0].current).toEqual({ count: 1 });
    });
    
    it('не должен делать ничего если redo-стек пуст', () => {
      const { result } = renderHook(() => useUndoRedo({ count: 0 }));
      
      act(() => {
        result.current[1].redo();
      });
      
      expect(result.current[0].current).toEqual({ count: 0 });
    });
    
    it('redo-стек очищается при изменении после undo', () => {
      const { result } = renderHook(() => 
        useUndoRedo({ count: 0 }, { debounceMs: 10 })
      );
      
      // Изменение + debounce
      act(() => {
        result.current[1].set({ count: 1 });
      });
      act(() => {
        vi.advanceTimersByTime(20);
      });
      
      // Undo создаёт redo
      act(() => {
        result.current[1].undo();
      });
      
      expect(result.current[0].canRedo).toBe(true);
      
      // Новое изменение + debounce очищает redo
      act(() => {
        result.current[1].set({ count: 5 });
      });
      act(() => {
        vi.advanceTimersByTime(20);
      });
      
      expect(result.current[0].canRedo).toBe(false);
    });
  });
  
  describe('clearHistory', () => {
    it('должен очищать историю undo и redo', () => {
      const { result } = renderHook(() => 
        useUndoRedo({ count: 0 }, { debounceMs: 10 })
      );
      
      // Два изменения с debounce между ними
      act(() => {
        result.current[1].set({ count: 1 });
      });
      act(() => {
        vi.advanceTimersByTime(20);
      });
      act(() => {
        result.current[1].set({ count: 2 });
      });
      act(() => {
        vi.advanceTimersByTime(20);
      });
      
      // Undo создаёт redo
      act(() => {
        result.current[1].undo();
      });
      
      expect(result.current[0].canUndo).toBe(true);
      expect(result.current[0].canRedo).toBe(true);
      
      // clearHistory очищает оба стека
      act(() => {
        result.current[1].clearHistory();
      });
      
      expect(result.current[0].canUndo).toBe(false);
      expect(result.current[0].canRedo).toBe(false);
    });
  });
  
  describe('checkpoint', () => {
    it('должен принудительно сохранять состояние в историю', () => {
      const { result } = renderHook(() => 
        useUndoRedo({ count: 0 }, { debounceMs: 1000 })
      );
      
      act(() => {
        result.current[1].set({ count: 1 });
      });
      
      // До checkpoint история пуста (debounce не прошёл)
      expect(result.current[0].canUndo).toBe(false);
      
      act(() => {
        result.current[1].checkpoint();
      });
      
      // После checkpoint история есть
      expect(result.current[0].canUndo).toBe(true);
    });
  });
  
  describe('maxHistory', () => {
    it('должен ограничивать размер истории', () => {
      const { result } = renderHook(() => 
        useUndoRedo({ count: 0 }, { maxHistory: 3, debounceMs: 1000 })
      );
      
      // Делаем 5 изменений с checkpoint
      for (let i = 1; i <= 5; i++) {
        act(() => {
          result.current[1].set({ count: i });
          result.current[1].checkpoint();
        });
      }
      
      // История должна быть ограничена до 3
      expect(result.current[0].undoCount).toBeLessThanOrEqual(3);
    });
  });
  
  describe('debounce', () => {
    it('должен объединять быстрые изменения', () => {
      const { result } = renderHook(() => 
        useUndoRedo({ count: 0 }, { debounceMs: 100 })
      );
      
      // Много быстрых изменений
      act(() => {
        result.current[1].set({ count: 1 });
        result.current[1].set({ count: 2 });
        result.current[1].set({ count: 3 });
      });
      
      act(() => {
        vi.advanceTimersByTime(150);
      });
      
      // Должно быть только 1 запись в истории (объединились)
      expect(result.current[0].undoCount).toBe(1);
      expect(result.current[0].current).toEqual({ count: 3 });
    });
  });
});
