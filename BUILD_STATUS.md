# Build / Infra Status

> **Обновлено:** 2025-12-24

## Статус компонентов

| Компонент | Статус | Детали |
|-----------|--------|---------|
| **C++ Core** | ✅ | `cmake -B build && cmake --build build` — собирает `multicode_core` и тесты |
| **C++ Tests** | ✅ | `ctest --test-dir build` — Catch2 тесты проходят |
| **VS Code Extension** | ✅ | `npm run compile` — Webpack собирает extension.js и webview.js |
| **TypeScript** | ✅ | `npx tsc --noEmit` — без ошибок типизации |
| **ESLint** | ✅ | `npm run lint` — только warnings (react-hooks/exhaustive-deps) |
| **Blueprint Editor** | ✅ | React Flow редактор работает, переключатель в toolbar |
| **Classic Editor** | ✅ | Cytoscape редактор работает (legacy) |
| **Кодировка** | ✅ | UTF-8 защита через `scripts/build-cmake-utf8.ps1` |
| **GitHub Actions** | ⚠️ | `.github/workflows/cpp-build.yml` — не тестирован на CI |
| **clang-format** | ⚠️ | Есть `.clang-format`, но не интегрирован в CI |
| **vcpkg** | ⚠️ | `vcpkg.json` есть, lockfile не синхронизирован |

## Команды сборки

### C++ ядро
```bash
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build
ctest --test-dir build --output-on-failure
```

### VS Code расширение
```bash
cd vscode-extension
npm install
npm run compile    # Webpack build
npm run lint       # ESLint
npm test           # Vitest (pretest: compile + lint)
```

## Размеры артефактов

| Файл | Размер |
|------|--------|
| `dist/extension.js` | ~244 KB |
| `dist/webview.js` | ~4.14 MB |

## Зависимости webview.js

Основной размер webview.js формируют:
- React + React DOM (~1.1 MB)
- @xyflow/react (React Flow) (~700 KB)
- Lodash (используется dagre) (~187 KB)
- Dagre (автолейаут) (~77 KB)
- Zod (валидация) (~146 KB)

## Ближайшие улучшения

1. [ ] Настроить GitHub Actions для VS Code extension
2. [ ] Добавить clang-format проверку в CI
3. [ ] Tree-shaking для уменьшения webview.js
4. [ ] Добавить code coverage для C++ и TS
