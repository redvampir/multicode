import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Автоматический cleanup после каждого теста
afterEach(() => {
  cleanup();
});
