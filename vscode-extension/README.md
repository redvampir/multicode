# MultiCode Visual Programming для VS Code и Cursor

> **Визуальное программирование на русском языке** — создавайте графы исполнения и генерируйте C++ код прямо в VS Code или Cursor!

> **📌 Поддержка Cursor:** MultiCode полностью совместим с Cursor. См. [инструкцию по установке в Cursor](CURSOR_INSTALLATION.md).

## ✨ Возможности

- 🎨 **Blueprint-редактор** — React Flow с поддержкой Undo/Redo, Copy/Paste
- 🔄 **Генерация C++ кода** — из визуального графа с русскими комментариями
- 🌐 **Локализация RU/EN** — мгновенное переключение языка интерфейса
- 📦 **Система пакетов** — загрузка узлов из JSON-пакетов
- 💻 **Кроссплатформенность** — Windows и Linux (Ubuntu 22.04+)

## Текущее состояние (релиз 0.4.1)

> Источник версии: `vscode-extension/package.json`.

| Компонент | Статус | Комментарий |
|-----------|--------|-------------|
| package.json | ✅ | Конфигурация расширения, схемы и npm-скрипты |
| npm-зависимости | ✅ | TypeScript, Webpack, React, React Flow |
| Исходный код | ✅ | Панели, команды, IPC-сообщения |
| Webview UI | ✅ | Blueprint-редактор на React Flow + Classic на Cytoscape |
| Генерация кода | ✅ | CppCodeGenerator — генерация C++ из графа |
| Локализация | ✅ | Полная поддержка RU/EN с мгновенным переключением |
| Linux поддержка | ✅ | Ubuntu 22.04+, Debian 12+ |
| Внутренние вехи v0.5/v0.6 | 🚧 | v0.5 (пакеты) завершён; v0.6 (пользовательские функции) в работе: UI/модель есть, генерация C++ функций пока не готова |

## Ключевые возможности

- **Blueprint-редактор** — визуальный канвас на React Flow с узлами в стиле Unreal Engine
- **Classic-редактор** — альтернативный режим на Cytoscape для простых графов
- **Генерация C++ кода** — преобразование графа в исполняемый код с русскими комментариями
- **Сохранение/загрузка** — работа с файлами `*.multicode.json`
- **Undo/Redo** — отмена и повтор действий (`Ctrl+Z` / `Ctrl+Y`)
- **Copy/Paste** — копирование узлов с сохранением связей

### Команды

| ID команды | Название | Горячая клавиша | Назначение |
|------------|----------|-----------------|------------|
| `multicode.openEditor` | MultiCode: Open Visual Editor | `Ctrl+Shift+V` | Открыть графический редактор |
| `multicode.newGraph` | MultiCode: New Graph | — | Создать новый граф |
| `multicode.saveGraph` | MultiCode: Save Graph | — | Сохранить граф в JSON |
| `multicode.loadGraph` | MultiCode: Load Graph | — | Загрузить граф из JSON |
| `multicode.translateGraph` | MultiCode: Translate Graph (Marian) | — | Запустить офлайн-перевод подписей графа |
| `multicode.generateCode` | MultiCode: Generate Code | `Ctrl+Shift+G` | Генерация кода из графа |

### Настройки

- `multicode.language` — язык по умолчанию (`cpp`, `rust`, `asm`)
- `multicode.displayLanguage` — язык интерфейса (`ru`, `en`)
- `multicode.theme` — тема редактора (`dark`, `light`, `auto`)
- `multicode.translation.engine` — движок перевода (`none`, `marian`)
- `multicode.translation.model.ruEn` / `multicode.translation.model.enRu` — модели MarianMT для RU→EN и EN→RU
- `multicode.translation.cacheLimit` — размер кэша переводов
- `multicode.aiNaming.enabled` — AI-именование узлов (экспериментальная функция)
- `multicode.codegen.autoGenerate` — автоматическая генерация при изменении графа

### Формат файлов графа

Файлы `*.multicode.json` будут содержать описание графа в формате GraphSerializer. Минимальный пример:

```json
{
  "schema": {
    "version": "1.0.0",
    "coreMin": "0.1.0-alpha",
    "coreMax": "0.1.x"
  },
  "graph": {
    "id": 1,
    "name": "Example Graph",
    "metadata": {}
  },
  "nodes": [
    {
      "id": 1,
      "type": "Start",
      "name": "Start",
      "ports": []
    }
  ],
  "connections": []
}
```

## Разработка

### Установка зависимостей

```bash
cd vscode-extension
npm install
```

### Структура проекта

```
vscode-extension/
├── src/
│   ├── extension.ts        # Точка входа расширения
│   ├── panel/GraphPanel.ts # Создание webview, IPC и команды
│   ├── shared/             # Общие типы/валидация/сериализация
│   └── webview/
│       ├── main.tsx               # React App с переключателем редакторов
│       ├── BlueprintEditor.tsx    # Основной редактор (React Flow)
│       ├── GraphEditor.tsx        # Legacy редактор (Cytoscape)
│       └── hooks/                 # Логика webview
├── package.json
├── КАК_ПРОВЕРИТЬ_РАСШИРЕНИЕ.md    # Диагностика и ручная проверка
└── webpack.config.js
```

### Сборка

```bash
npm run watch              # Инкрементальная сборка
npm run compile            # Однократная сборка
npm run vscode:prepublish  # Подготовка релиза
```

### Быстрая проверка и сборка через скрипт

В корне репозитория доступен скрипт `scripts/vscode-test-i-sborka.sh`, который устанавливает зависимости (если их ещё нет), прогоняет lint, собирает вебвью и запускает VS Code тесты.

```bash
cd ..                      # перейти в корень репозитория, если читаете README из vscode-extension/
scripts/vscode-test-i-sborka.sh
```

Опциональные флаги:

- `--skip-lint` — пропустить проверку ESLint;
- `--skip-tests` — пропустить запуск VS Code тестов, оставив только сборку.

Выходные артефакты после успешного прогона скрипта: бандлы webview складываются в `vscode-extension/dist/`, а собранное расширение и транспилированные тесты лежат в `vscode-extension/out/`.

### Отладка

1. Откройте проект в VS Code
2. Нажмите `F5` для запуска Extension Development Host
3. В новом окне VS Code будет доступно расширение с webview-редактором

## Следующие шаги (этап v1.0)

1. **Стабилизация API и IPC-контрактов**:
   - закрепление обратной совместимости сообщений
   - регламенты миграции форматов графа

2. **Качество и тестируемость**:
   - рост покрытия критичных сценариев
   - стандартизация regression-тестов для webview

3. **Релизная готовность**:
   - финальная пользовательская документация
   - подготовка Marketplace-публикации

## MarianMT-перевод

- Команда `multicode.translateGraph` запускает перевод всех подписей графа (имя, узлы, связи) через MarianMT с кэшированием в сессии.
- В настройках `multicode.translation.*` можно включить движок (`marian`) и переопределить модели для направлений RU→EN и EN→RU.
- По умолчанию команда выключена (`engine = none`), чтобы не тянуть модели без запроса пользователя.
- В боковой панели webview есть выбор направления и кнопка «Перевести», позволяющие запускать Marian без перехода к палитре команд.

## Зависимости

Основные npm-пакеты уже установлены:

| Пакет | Назначение | Статус |
|-------|------------|--------|
| `typescript`, `webpack`, `ts-loader` | Сборка расширения | ✅ Установлены |
| `@vscode/webview-ui-toolkit` | UI-компоненты | ✅ Установлены |
| `cytoscape`, `cytoscape-dagre` | Отрисовка графа | ✅ Установлены |
| `react`, `react-dom` | Webview через React 18 | ✅ Установлены |
| `zustand` | Управление состоянием | ✅ Установлены |

## Связь с C++ ядром

Расширение использует:
- **GraphSerializer** (`src/core/GraphSerializer.cpp`) для форматов графа
- **NodeFactory** для согласованности типов узлов
- **Graph** для валидации структуры
- **CppCodeGenerator** для генерации C++ кода

## Полезные ссылки

- [Документация по архитектуре](../Документы/Архитектура/README.md)
- [План разработки](../ROADMAP.md)
- [Статус проекта](../Документы/ProjectStatus.md)
- [Диагностика расширения](КАК_ПРОВЕРИТЬ_РАСШИРЕНИЕ.md)
- [Система отладки](DEBUGGING.md)
- [VS Code Extension API](https://code.visualstudio.com/api)

## Переустановка расширения

Если в VS Code застряла старая версия, соберите VSIX так:

```bash
cd vscode-extension
npm install
npm run compile && npm run package
npx vsce package --no-dependencies
```

Затем: **Extensions > ... > Install from VSIX** и выберите файл `.vsix`.

Если версия не обновляется — сначала **Remove/Uninstall**, потом **Install from VSIX**.

