# Dependencies

## C++ Core

| Библиотека | Использование | Установка |
|------------|---------------|-----------|
| `nlohmann-json >= 3.11` | Сериализация графа | через vcpkg (`vcpkg install nlohmann-json`) или header-only |
| `spdlog >= 1.12` | Логирование (пока не задействовано, но добавлено для будущего) | `vcpkg install spdlog` |
| `Catch2 >= 3.4` | Unit-тесты | `vcpkg install catch2` |

`vcpkg.json` в корне описывает зависимости, `CMakeLists.txt` подключает их условно (если найдены).

## VS Code Extension

| Пакет | Назначение | Статус |
|-------|------------|--------|
| `typescript`, `webpack`, `ts-loader` | Сборка расширения | Установлены в `package.json`, исходников нет |
| `@vscode/webview-ui-toolkit` | UI-компоненты | Не используется (нет UI) |
| `cytoscape`, `cytoscape-dagre` | Отрисовка графа | Не используется |
| `zustand` | State management | Не используется |

Установка:
```bash
cd vscode-extension
npm install
```
(команды `npm run compile/watch` пока нечего компилировать, но оставляем скрипты для будущего).

## Прочее
- C++20 компилятор (MSVC 19.3x, Clang 16+, GCC 13+).
- CMake >= 3.25.
- Git LFS не используется.
