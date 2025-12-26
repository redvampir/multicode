import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './vitest.setup.ts',
    include: ['src/**/*.test.{ts,tsx}'],
    // Решает проблему зависания тестов при использовании jsdom
    pool: 'forks',
    teardownTimeout: 5000,
    // Изолирует тесты и предотвращает зависание
    isolate: true,
    // Принудительный выход после тестов
    hookTimeout: 10000,
    // Отключаем watch mode для CI
    watch: false,
    // Принудительно завершаем процесс после тестов (предотвращает hang)
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/test/**/*',
        'src/webview/index.tsx', // Entry point
        'src/extension.ts',      // VS Code extension entry
        'src/panel/*.ts',        // Panel code (VS Code specific)
        'src/webview/main.tsx',  // React entry point
        'node_modules/**',
      ],
      thresholds: {
        statements: 50,
        branches: 50,
        functions: 50,
        lines: 50,
      },
    },
  }
});
