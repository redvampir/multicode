import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, afterAll, vi } from 'vitest';

// Автоматический cleanup после каждого теста
afterEach(() => {
  cleanup();
  // Очищаем все моки и таймеры
  vi.clearAllMocks();
  vi.clearAllTimers();
});

// Завершаем все pending операции после всех тестов
afterAll(() => {
  vi.restoreAllMocks();
  // Очищаем глобальные таймеры jsdom
  vi.useRealTimers();
});
