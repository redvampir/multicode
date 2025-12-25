# Visual Editor (VS Code Webview)

> **Дата обновления:** 2025-12-24
> **Статус:** Реализовано (v0.2)

---

## Главное

**Редактор создан для русскоязычных разработчиков.**

Ключевые возможности:
- **Русские названия узлов**: "Начало", "Ветвление", "Цикл For", "Вывод"
- **Локализация UI**: полный перевод интерфейса на русский
- **Переключение RU/EN**: мгновенная смена языка в toolbar

Пользователь может создавать графы полностью на русском языке, и это первоклассная поддержка, а не перевод.

---

## Обзор

Visual Editor — React-приложение внутри VS Code Webview, предоставляющее Blueprint-style редактор визуальных графов. Поддерживает два режима работы: **Blueprint** (основной, на React Flow) и **Classic** (legacy, на Cytoscape).

## Архитектура

```
vscode-extension/
├── src/
│   ├── extension.ts           # VS Code extension entry point
│   ├── panel/
│   │   └── GraphPanel.ts      # WebviewPanel управление + IPC
│   ├── webview/
│   │   ├── main.tsx           # React App + режимы редактора
│   │   ├── BlueprintEditor.tsx # React Flow редактор (основной)
│   │   ├── GraphEditor.tsx    # Cytoscape редактор (legacy)
│   │   └── nodes/
│   │       └── BlueprintNode.tsx # Кастомный узел Blueprint
│   └── shared/
│       ├── blueprintTypes.ts  # Типы Blueprint графа
│       ├── portTypes.ts       # Типы портов + цветовая схема
│       ├── graphState.ts      # Zustand store + типы
│       ├── messages.ts        # IPC сообщения (zod schemas)
│       └── translations.ts    # RU/EN локализация
```

## Режимы редактора

### Blueprint Editor (React Flow)

**Файл:** `BlueprintEditor.tsx`

Основной редактор в стиле Unreal Engine Blueprints:

- **Библиотека:** [React Flow](https://reactflow.dev/) v11
- **Кастомные узлы:** `BlueprintNode.tsx` — узлы с exec/data портами
- **Палитра узлов:** категоризированная, с поиском (клавиша `A`)
- **Drag-to-connect:** валидация совместимости типов портов

**Ключевые компоненты:**

```typescript
// Кастомный узел
const nodeTypes = {
  blueprint: BlueprintNode,
};

// Состояние графа
interface BlueprintGraphState {
  nodes: BlueprintNode[];
  edges: BlueprintEdge[];
  viewport: Viewport;
}
```

### Classic Editor (Cytoscape) — Legacy

**Файл:** `GraphEditor.tsx`

Legacy редактор на Cytoscape.js:

- Сохранён для обратной совместимости
- Используется при переключении в режим "Классический"
- Будет удалён в v1.0

## Типы портов

**Файл:** `portTypes.ts`

Порты делятся на две категории:

### Execution Ports (Поток выполнения)
- **Визуализация:** Квадратные, белые
- **Тип:** `execution`
- **Семантика:** Определяют порядок выполнения узлов

### Data Ports (Данные)
- **Визуализация:** Круглые, цветные
- **Типы и цвета:**

| Тип | Цвет | HEX |
|-----|------|-----|
| `bool` | Красный | `#ff0000` |
| `int` | Бирюзовый | `#00ffff` |
| `float` | Зелёный | `#00ff00` |
| `string` | Пурпурный | `#ff00ff` |
| `vector` | Золотой | `#ffd700` |
| `object` | Синий | `#4169e1` |
| `any` | Серый | `#888888` |

## Типы узлов

**Файл:** `blueprintTypes.ts`

```typescript
// Определения типов узлов
const NODE_TYPE_DEFINITIONS: Record<string, NodeTypeDefinition> = {
  // Control Flow
  'event_begin_play': { category: 'events', inputs: [], outputs: [exec] },
  'branch': { category: 'control', inputs: [exec, bool], outputs: [exec_true, exec_false] },
  'for_loop': { category: 'control', inputs: [exec, int, int], outputs: [exec_body, exec_done, int] },
  'sequence': { category: 'control', inputs: [exec], outputs: [exec, exec, exec] },
  
  // Functions
  'print_string': { category: 'utility', inputs: [exec, string], outputs: [exec] },
  'make_literal_string': { category: 'utility', inputs: [], outputs: [string] },
  
  // Math
  'add': { category: 'math', inputs: [float, float], outputs: [float] },
  'multiply': { category: 'math', inputs: [float, float], outputs: [float] },
};
```

## IPC Протокол

**Файл:** `messages.ts`

Коммуникация между Extension и Webview через `postMessage`:

### Webview → Extension

```typescript
// Сохранение графа
{ type: 'requestSaveGraph', payload: { nodes, edges, viewport } }

// Загрузка графа
{ type: 'requestLoadGraph' }

// Генерация кода
{ type: 'requestGenerateCode' }

// Валидация графа
{ type: 'requestValidateGraph' }
```

### Extension → Webview

```typescript
// Граф загружен
{ type: 'graphLoaded', payload: { nodes, edges, viewport } }

// Результат валидации
{ type: 'validationResult', payload: { isValid, errors } }

// Код сгенерирован
{ type: 'codeGenerated', payload: { code, language } }
```

**Валидация:** Все сообщения валидируются через Zod schemas.

## Локализация

**Файл:** `translations.ts`

Поддержка RU/EN:

```typescript
const getTranslation = (locale: Locale, key: TranslationKey): string => {
  return translations[locale][key] ?? translations['en'][key] ?? key;
};

// Использование
translate('toolbar.newGraph') // "Новый граф" | "New Graph"
```

Переключение языка: селектор в Toolbar, сохраняется в localStorage.

## Конвертация форматов

При переключении между редакторами данные конвертируются:

```typescript
// Cytoscape → React Flow
migrateToBlueprintFormat(cytoscapeState): BlueprintGraphState

// React Flow → Cytoscape
migrateFromBlueprintFormat(blueprintState): GraphState
```

## Зависимости

| Пакет | Версия | Назначение |
|-------|--------|------------|
| `reactflow` | `^11.11.4` | Blueprint редактор |
| `cytoscape` | `^3.28.1` | Legacy редактор |
| `cytoscape-dagre` | `^2.5.0` | Автолейаут для Cytoscape |
| `zustand` | `^4.4.7` | State management |
| `zod` | `^3.24.1` | Валидация IPC |
| `@vscode/webview-ui-toolkit` | `^1.4.0` | VS Code UI компоненты |

## Горячие клавиши

| Клавиша | Действие |
|---------|----------|
| `A` | Открыть палитру узлов |
| `Delete` | Удалить выбранные элементы |
| `Ctrl+C` | Копировать |
| `Ctrl+V` | Вставить |
| `Ctrl+D` | Дублировать |
| `Ctrl+Z` | Отменить |
| `Ctrl+Shift+Z` | Повторить |
| `Ctrl+F` | Поиск |
| `Escape` | Сбросить выделение |

## Сборка и разработка

```bash
cd vscode-extension

# Установка зависимостей
npm install

# Разработка (watch mode)
npm run watch

# Сборка
npm run compile

# Lint
npm run lint

# Тесты
npm test
```

## Архитектурные решения

### Почему React Flow вместо Cytoscape?

1. **Blueprint-style UX:** Нативная поддержка кастомных узлов с JSX
2. **Типизация портов:** Встроенная валидация соединений
3. **Производительность:** Виртуализация для больших графов
4. **React интеграция:** Естественная работа с React экосистемой

### Почему Zustand?

1. **Простота:** Минимальный boilerplate
2. **TypeScript:** Отличная типизация
3. **DevTools:** Поддержка Redux DevTools
4. **Размер:** ~2KB gzipped

### Почему Zod для IPC?

1. **Runtime валидация:** Защита от некорректных сообщений
2. **Type inference:** Автоматическая генерация TypeScript типов
3. **Понятные ошибки:** Детальные сообщения при невалидных данных

## Будущие улучшения

- [ ] Undo/Redo в Blueprint редакторе (Command pattern)
- [ ] Copy/Paste узлов между вкладками
- [ ] Подграфы (узлы-контейнеры)
- [ ] Предпросмотр сгенерированного кода
- [ ] Breakpoints для отладки

---

**См. также:**
- [AI_AGENTS_GUIDE.md](../../AI_AGENTS_GUIDE.md) — руководство для ИИ-агентов
- [blueprintTypes.ts](../../vscode-extension/src/shared/blueprintTypes.ts) — типы Blueprint
- [portTypes.ts](../../vscode-extension/src/shared/portTypes.ts) — типы портов
