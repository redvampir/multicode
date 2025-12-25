# Dependencies

> **Обновлено:** 2025-12-24

## C++ Core

| Библиотека | Версия | Использование | Установка |
|------------|--------|---------------|-----------|
| `nlohmann-json` | >= 3.11 | Сериализация графа в JSON | `vcpkg install nlohmann-json` или header-only |
| `spdlog` | >= 1.12 | Логирование | `vcpkg install spdlog` |
| `Catch2` | >= 3.4 | Unit-тесты | `vcpkg install catch2` |

**Установка через vcpkg:**
```bash
vcpkg install nlohmann-json spdlog catch2
```

`vcpkg.json` в корне описывает зависимости, `CMakeLists.txt` подключает их автоматически.

## VS Code Extension

### Production Dependencies

| Пакет | Версия | Назначение |
|-------|--------|------------|
| `@xyflow/react` | ^12.x | React Flow — визуальный редактор графов |
| `react` | ^18.x | UI фреймворк |
| `react-dom` | ^18.x | React DOM renderer |
| `zustand` | ^4.x | State management |
| `zod` | ^3.x | Валидация данных и IPC сообщений |
| `cytoscape` | ^3.x | Классический редактор (legacy) |
| `cytoscape-dagre` | ^2.x | Автолейаут для Cytoscape |
| `dagre` | ^0.8.x | Алгоритм лейаута графов |

### Dev Dependencies

| Пакет | Версия | Назначение |
|-------|--------|------------|
| `typescript` | ^5.x | Компилятор TypeScript |
| `webpack` | ^5.x | Бандлер |
| `webpack-cli` | ^5.x | CLI для webpack |
| `ts-loader` | ^9.x | TypeScript loader для webpack |
| `css-loader` | ^7.x | CSS loader для webpack |
| `style-loader` | ^4.x | Style loader для webpack |
| `eslint` | ^8.x | Линтер |
| `@typescript-eslint/*` | ^7.x | TypeScript ESLint плагины |
| `vitest` | ^1.x | Test runner |
| `@types/react` | ^18.x | TypeScript типы для React |
| `@types/vscode` | ^1.x | TypeScript типы для VS Code API |

### Установка

```bash
cd vscode-extension
npm install
```

### Сборка

```bash
npm run compile    # Webpack build
npm run lint       # ESLint check
npm test           # Vitest tests
```

## Требования к окружению

| Инструмент | Минимальная версия |
|------------|-------------------|
| Node.js | >= 18.x |
| npm | >= 9.x |
| C++ компилятор | MSVC 19.3x / Clang 16+ / GCC 13+ |
| CMake | >= 3.25 |
| VS Code | >= 1.85.0 |

## Архитектура зависимостей

```
┌─────────────────────────────────────────────────┐
│                 VS Code Extension                │
│  ┌───────────┐  ┌───────────┐  ┌─────────────┐  │
│  │  React 18 │  │  Zustand  │  │    Zod      │  │
│  └─────┬─────┘  └─────┬─────┘  └──────┬──────┘  │
│        │              │               │         │
│  ┌─────▼──────────────▼───────────────▼──────┐  │
│  │              Webview Bundle               │  │
│  │  ┌─────────────┐  ┌─────────────────────┐ │  │
│  │  │ React Flow  │  │ Cytoscape (legacy)  │ │  │
│  │  │ (Blueprint) │  │    + dagre          │ │  │
│  │  └─────────────┘  └─────────────────────┘ │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│                   C++ Core                       │
│  ┌─────────────┐  ┌─────────┐  ┌─────────────┐  │
│  │nlohmann-json│  │  spdlog │  │   Catch2    │  │
│  │(serialize)  │  │  (log)  │  │  (tests)    │  │
│  └─────────────┘  └─────────┘  └─────────────┘  │
└─────────────────────────────────────────────────┘
```

## Обновление зависимостей

Проект использует **Renovate** для автоматического обновления:
- npm пакеты: еженедельно (вторник)
- vcpkg: вручную

См. `renovate.json` для конфигурации.
