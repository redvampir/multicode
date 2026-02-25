# Build / Infra Status

> **Обновлено:** 2026-02-07

## Статус компонентов

| Компонент | Статус | Факт |
|-----------|--------|------|
| **C++ Core** | ✅ | `cmake` конфигурация и сборка описаны в `CMakeLists.txt` |
| **C++ Tests** | ✅ | тесты в `tests/`, запуск через `ctest --test-dir build` |
| **VS Code Extension** | ✅ | сборка через `npm run compile` |
| **TypeScript** | ✅ | типизация и lint в CI (`vscode-extension-ci.yml`) |
| **Blueprint Editor** | ✅ | `vscode-extension/src/webview/BlueprintEditor.tsx` |
| **Classic Editor** | ✅ | `vscode-extension/src/webview/GraphEditor.tsx` (legacy) |
| **UTF-8 защита Windows** | ✅ | `scripts/build-cmake-utf8.ps1` + задачи VS Code |
| **GitHub Actions (C++)** | ✅ | `.github/workflows/cpp-build.yml` |
| **GitHub Actions (Extension)** | ✅ | `.github/workflows/vscode-extension-ci.yml` |
| **clang-format в CI** | ✅ | `.github/workflows/code-format.yml` |
| **Renovate** | ✅ | `renovate.json` в корне |

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
npm run compile
npm run lint
npm test
```

## Контроль качества

- C++ пайплайн: сборка Windows/Linux, тесты, clang-tidy, coverage.
- Extension пайплайн: lint, type-check, unit tests, сборка.
- Форматирование C++: отдельный workflow `code-format.yml`.

## Ближайшие улучшения

1. [ ] Ускорить CI (кеши npm/vcpkg и CMake)
2. [ ] Добавить проверку документации в CI (`scripts/check-docs.ps1`)
3. [ ] Уменьшить размер `webview.js` (дополнительный tree-shaking)
4. [ ] Вынести единый отчёт по покрытию C++ и TS
