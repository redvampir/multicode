# Visual Editor (VS Code Webview)

> **Дата обновления:** 2026-02-16
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

Внутри документа и UI линии между узлами именуются как **связи** (техническое поле состояния остаётся `edges` для совместимости API/формата).

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
- **Редактирование связей:** двойной клик по связи создаёт контрольную точку (`Reroute`) для ручной прокладки пути
- **Быстрое удаление связи:** `Alt + двойной клик` по связи
- **Сравнение без лишних конвертеров:** `Greater/Less/...` и `Equal/NotEqual` подстраивают входной тип при первом подключении (для `Equal/NotEqual`: `bool/string/int32/int64/float/double/pointer/class`)
- **Inline-константы в операторах:** для математических и сравнительных входов доступны поля `Константа` без создания отдельных literal-узлов
- **For Loop параметры:** у узла `ForLoop` настраиваются `Шаг`, режим границы (`inclusive/exclusive`) и направление (`up/down/auto`) с inline превью C++ цикла
- **Sequence шаги:** у узла `Sequence` выходы `Then` локализованы (`Затем N`) и новые шаги добавляются кнопкой `+` в заголовке узла

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

## Переменные в Get/Set узлах

**Файлы:** `BlueprintEditor.tsx`, `nodes/BlueprintNode.tsx`, `variableNodeBinding.ts`

Для узлов `GetVariable` и `SetVariable` используется явная привязка к переменной по `properties.variableId`.

Правила:

1. При создании узла в `properties` записываются:
- `variableId`
- `dataType`
- `defaultValue`
- `name`
- `nameRu`
- `color`

2. Заголовок variable-узла формируется как:
- RU: `Получить: <Имя>` / `Установить: <Имя>`
- EN: `Get: <Name>` / `Set: <Name>`

3. Цвет шапки variable-узла берётся по приоритету:
- `variable.color`
- `VARIABLE_TYPE_COLORS[variable.dataType]`
- fallback из `NODE_TYPE_DEFINITIONS`

4. Синхронизация default value для `SetVariable`:
- если `properties.inputValueIsOverride !== true`, узел показывает актуальный `variable.defaultValue`
- если `properties.inputValueIsOverride === true`, используется локальный `properties.inputValue`

5. Поведение `vector<T>`:
- `vector` трактуется как динамический контейнер `std::vector<T>` произвольной длины (не фиксированный `X/Y/Z`)
- значение по умолчанию вводится как JSON-массив (`[1, 2, 3]`, `["a", "b"]`)
- для старых графов поддерживается миграционный fallback CSV (`"1,2,3"` -> `[1, 2, 3]`)

6. Модель коллекций в редакторе переменных:
- источник истины: `arrayRank` (`0` = скаляр, `1` = `T[]`, `2` = `T[][]`, `3` = `T[][][]`)
- legacy-флаг `isArray` сохраняется только для обратной совместимости (`true` трактуется как `arrayRank = 1`)
- для поддерживаемых типов (`bool/int32/int64/float/double/string/vector`) включается контейнерный режим с ранговой вложенностью
- значение по умолчанию вводится JSON-массивом с глубиной, соответствующей `arrayRank`
- в codegen тип оборачивается в `std::vector<...>` по числу уровней `arrayRank`

7. При удалении переменной каскадно удаляются связанные `GetVariable`/`SetVariable` узлы и их связи:
- в основном графе
- во всех `functions[*].graph`

8. Анти-склейка при добавлении узлов кликом:
- используется каскадный offset (`findNonOverlappingPosition`)
- для drag&drop от курсора сдвиг применяется только при полном совпадении позиции

## Указатели и ссылки

**Файлы:** `PointerReferencePanel.tsx`, `BlueprintEditor.tsx`, `variableNodeBinding.ts`, `codegen/pointerCodegen.ts`

В редакторе добавлена отдельная левая секция `Указатели и ссылки` (с собственным collapse и scroll).

Базовые правила:

1. Pointer-переменная хранится как `dataType = "pointer"` + `pointerMeta`:
- `mode`: `shared | unique | weak | raw | reference | const_reference`
- `pointeeDataType`
- `pointeeVectorElementType` (для `vector<T>`)
- `targetVariableId` (если есть привязка)

2. Legacy-совместимость:
- если в старом графе `pointerMeta` отсутствует, применяется lazy-normalization:
  `mode = shared`, `pointeeDataType = double`

3. Для `reference` и `const_reference`:
- `targetVariableId` обязателен
- data-порты `Get/Set` узлов типизируются как `pointeeDataType`

4. Для `weak`:
- `targetVariableId` обязателен
- target должен быть pointer-переменной с `mode = shared`

5. Codegen C++:
- `shared`: `std::shared_ptr<T>`
- `unique`: `std::unique_ptr<T>`
- `weak`: `std::weak_ptr<T>`
- `raw`: `T*`
- `reference`: `T&`
- `const_reference`: `const T&`
- при наличии pointer/reference переменных автоматически добавляется `#include <memory>`

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

## Редактирование связей

- Основной термин в интерфейсе: **связь**.
- Двойной клик по связи: вставить контрольную точку (`Reroute`).
- Контрольную точку можно перемещать, изменяя трассировку связи без изменения логики узлов.
- `Alt + двойной клик` по связи: удалить связь.

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
