# Dependencies

## C++ Core
| Библиотека | Использование | Установка |
| --- | --- | --- |
| `nlohmann-json >= 3.11` | будущая сериализация графа | через vcpkg (`vcpkg install nlohmann-json`) или header-only |
| `spdlog >= 1.12` | логирование (пока не задействовано, но добавлено для будущего) | `vcpkg install spdlog` |
| `Catch2 >= 3.4` | unit-тесты | `vcpkg install catch2` |

`vcpkg.json` в корне описывает зависимости, `CMakeLists.txt` подключает их условно (если найдены).

## VS Code Extension
| Пакет | Назначение | Статус |
| --- | --- | --- |
| `typescript`, `webpack`, `ts-loader` | сборка расширения | установлены в `package.json`, исходников нет |
| `@vscode/webview-ui-toolkit` | UI-компоненты | не используется (нет UI) |
| `cytoscape`, `cytoscape-dagre` | граф | не используется |
| `zustand` | state management | не используется |

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
