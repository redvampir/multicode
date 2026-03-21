# AI Agents Guide — Руководство для ИИ-агентов

> **Версия:** 2.2  
> **Дата:** 2026-03-20  
> **Проект:** MultiCode — Визуальное программирование для VS Code

> **Релизная версия расширения:** `0.4.1` (источник истины — `vscode-extension/package.json`)

---

## Главное

### Разделение ответственности документов

- [AGENTS.md](AGENTS.md) — нормативные правила и ограничения.
- [AI_AGENTS_GUIDE.md](AI_AGENTS_GUIDE.md) — практическая эксплуатация: где менять, как проверять, какие файлы связаны.
- [CODING_GUIDELINES.md](CODING_GUIDELINES.md) — стандарты качества кода.

**MultiCode создаётся для русскоязычной аудитории.**

Ключевая цель — возможность работать с визуальными графами на русском языке:
- **Русские названия узлов**: "Начало", "Ветвление", "Цикл For", "Вывод"
- **Русские комментарии** в генерируемом коде
- **Полная локализация UI** (RU/EN с мгновенным переключением)
- **Документация на русском**

При разработке **всегда учитывай русскоязычного пользователя** как основную аудиторию.

---

## Быстрый старт

### Что это за проект?

**MultiCode** — VS Code расширение для визуального программирования в стиле Unreal Engine Blueprints.

```
┌─────────────────────────────────────────────────────────────┐
│                      VS Code Extension                       │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐  │
│  │  Extension  │◄──►│   Webview   │◄──►│   C++ Core      │  │
│  │   (TS)      │    │ React Flow  │    │  (Node/Graph)   │  │
│  └─────────────┘    └─────────────┘    └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Ключевые компоненты

| Компонент | Путь | Технологии | Статус |
|-----------|------|------------|--------|
| C++ ядро | `include/visprog/core/`, `src/core/` | C++20, nlohmann-json | Работает |
| VS Code расширение | `vscode-extension/src/` | TypeScript, React 18 | Работает |
| Blueprint редактор | `vscode-extension/src/webview/` | React Flow, Zustand | Работает |
| Кодогенерация | `vscode-extension/src/codegen/` | TypeScript, target-based generators | Работает |
| Тесты C++ | `tests/` | Catch2 | Работает |
| Тесты TS | `vscode-extension/src/test/` | Vitest | Работает |

---

## Архитектура проекта

### Структура репозитория

```
MultiCode/
├── include/visprog/core/     # C++ заголовки (публичный API)
│   ├── Types.hpp             # NodeId, PortId, Result<T>, ErrorCode
│   ├── Node.hpp              # Узел графа
│   ├── Port.hpp              # Порты узлов (input/output)
│   ├── Graph.hpp             # Контейнер узлов и связей
│   ├── NodeFactory.hpp       # Фабрика создания узлов
│   └── GraphSerializer.hpp   # JSON сериализация
├── include/visprog/generators/ # C++ генераторы
├── src/core/                 # C++ реализации
├── src/generators/           # C++ кодогенераторы
├── tests/                    # Catch2 тесты
├── vscode-extension/
│   ├── src/
│   │   ├── extension.ts      # Точка входа расширения
│   │   ├── commands/         # VS Code команды и интеграции
│   │   ├── compilation/      # Компиляция/запуск C++ и toolchains
│   │   ├── codegen/          # TS кодогенераторы (cpp/ue)
│   │   ├── panel/            # GraphPanel, IPC с webview
│   │   ├── webview/          # React компоненты
│   │   │   ├── main.tsx      # Главный App и orchestration webview
│   │   │   ├── BlueprintEditor.tsx    # Новый React Flow редактор
│   │   │   ├── GraphEditor.tsx        # Старый Cytoscape редактор
│   │   │   ├── DependencyView.tsx     # Окно зависимостей и symbols UX
│   │   │   ├── ClassPanel.tsx         # Class System v2
│   │   │   └── nodes/BlueprintNode.tsx # Кастомные узлы
│   │   ├── shared/           # Общие типы, схемы и утилиты
│   │   │   ├── blueprintTypes.ts      # Типы Blueprint графа
│   │   │   ├── portTypeContract.ts    # Источник истины для dataType/category
│   │   │   ├── serializer.ts          # .multicode сериализация graph state
│   │   │   └── messages.ts            # IPC сообщения (zod)
│   │   └── test/             # Integration / extension tests
│   └── dist/                 # Скомпилированные файлы
├── Документы/                # Документация на русском
└── schemas/                  # JSON schemas
```

### Слои системы

```
┌────────────────────────────────────────────────────────┐
│ Layer 5: Webview UI (React / React Flow / Cytoscape)   │
│   main.tsx → BlueprintEditor / GraphEditor / panels    │
├────────────────────────────────────────────────────────┤
│ Layer 4: Extension Backend (TypeScript)                │
│   extension.ts → commands → GraphPanel → file I/O      │
├────────────────────────────────────────────────────────┤
│ Layer 3: Shared Contracts + Codegen (TypeScript)       │
│   messages / serializer / CppCodeGenerator / UeCodeGenerator │
├────────────────────────────────────────────────────────┤
│ Layer 2: Core + Serialization (C++20)                  │
│   Types → Port → Node → Graph → NodeFactory → GraphSerializer │
├────────────────────────────────────────────────────────┤
│ Layer 1: Tests and Fixtures                            │
│   Catch2 / Vitest / golden tests / graph fixtures      │
└────────────────────────────────────────────────────────┘
```

---

## Правила разработки

### C++ код

```cpp
// ✅ ПРАВИЛЬНО: Modern C++20
auto node = std::make_unique<Node>();
[[nodiscard]] auto getName() const noexcept -> std::string_view;

// Используй Result<T> для обработки ошибок
auto result = parseNode(json);
if (!result) {
    spdlog::error("Parse failed: {}", result.error().message);
    return result;
}

// ❌ НЕПРАВИЛЬНО
Node* node = new Node();  // Сырые указатели запрещены
char* name = "NodeName";  // Используй string_view
```

**Обязательно:**
- `std::unique_ptr` / `std::shared_ptr` вместо сырых указателей
- `Result<T>` вместо исключений для ожидаемых ошибок
- `const` везде где возможно
- `[[nodiscard]]` для функций возвращающих значения
- RAII для управления ресурсами

### TypeScript/React код

```typescript
// ✅ ПРАВИЛЬНО
interface Props {
  graph: BlueprintGraphState;
  onGraphChange: (graph: BlueprintGraphState) => void;
}

const Component: React.FC<Props> = ({ graph, onGraphChange }) => {
  // Zod валидация для IPC сообщений
  const parsed = messageSchema.safeParse(data);
  if (!parsed.success) {
    console.error('Invalid message:', parsed.error);
    return;
  }
};

// ❌ НЕПРАВИЛЬНО
function Component(props: any) {  // Избегай any
  const data = JSON.parse(raw);   // Валидируй через zod
}
```

**Обязательно:**
- Строгая типизация, избегать `any`
- Zod для валидации IPC сообщений
- Функциональные компоненты с хуками
- `useCallback` / `useMemo` для оптимизации

### Запрещено

- `TODO`, `FIXME`, заглушки в финальном коде
- Сырые указатели для управляемых объектов
- `any` в TypeScript без крайней необходимости
- Коммиты без тестов для нового функционала
- Изменение публичного API без обновления документации

---

## Типы узлов и портов

Ниже приведён сокращённый обзор. Источник истины для типов портов и узлов:
- `vscode-extension/src/shared/portTypeContract.ts`
- `vscode-extension/src/shared/blueprintTypes.ts`

### Типы портов (PortDataType)

```typescript
type PortDataType =
  | 'execution'  // Белый, управление потоком
  | 'bool'       // Красный
  | 'int32'      // Бирюзовый
  | 'float'      // Зелёный
  | 'string'     // Розовый
  | 'vector'     // Жёлтый
  | 'object'     // Синий
  | 'array'      // Оранжевый
  | 'any';       // Серый, совместим со всеми
```

### Типы узлов (BlueprintNodeType)

| Категория | Типы |
|-----------|------|
| Control Flow | `Start`, `End`, `Branch`, `ForLoop`, `WhileLoop`, `Sequence`, `Return` |
| Functions | `Function`, `FunctionCall`, `Event` |
| Variables | `Variable`, `GetVariable`, `SetVariable` |
| Math | `Add`, `Subtract`, `Multiply`, `Divide`, `Modulo` |
| Comparison | `Equal`, `NotEqual`, `Greater`, `Less`, `GreaterEqual`, `LessEqual` |
| Logic | `And`, `Or`, `Not` |
| I/O | `Print`, `Input` |
| Other | `Comment`, `Reroute`, `Custom` |

---

## Команды сборки

### C++ ядро

```bash
# Сборка
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build

# Тесты
ctest --test-dir build --output-on-failure

# Форматирование
git ls-files '*.hpp' '*.cpp' | grep -v third_party | xargs clang-format -i
```

### VS Code расширение

```bash
cd vscode-extension

# Установка зависимостей
npm install

# Компиляция
npm run compile

# Lint
npm run lint

# Тесты
npm test

# Запуск в режиме разработки (F5 в VS Code)
```

---

## IPC протокол (Extension ↔ Webview)

### Сообщения Extension → Webview

```typescript
type ExtensionMessage =
  | { type: 'setState'; payload: GraphState }
  | { type: 'toast'; payload: { kind: ToastKind; message: string } }
  | { type: 'validationResult'; payload: ValidationResult }
  | { type: 'themeChanged'; payload: ThemeMessage }
  | { type: 'nodeAdded' }
  | { type: 'nodesConnected' }
  | { type: 'translationStarted'; payload: { direction: TranslationDirection } }
  | { type: 'translationFinished' };
```

### Сообщения Webview → Extension

```typescript
type WebviewMessage =
  | { type: 'ready' }
  | { type: 'graphChanged'; payload: Partial<GraphState> }
  | { type: 'addNode'; payload: { label?: string; nodeType?: GraphNodeType } }
  | { type: 'connectNodes'; payload: { sourceId?: string; targetId?: string } }
  | { type: 'requestNewGraph' }
  | { type: 'requestSave' }
  | { type: 'requestLoad' }
  | { type: 'requestValidate' }
  | { type: 'requestGenerate' }
  | { type: 'requestTranslate'; payload: { direction: TranslationDirection } };
```

---

## Частые задачи

### Добавить новый тип узла

1. Добавить тип в `BlueprintNodeType` (`blueprintTypes.ts`)
2. Добавить определение в `NODE_TYPE_DEFINITIONS`
3. Указать категорию, порты, цвет заголовка
4. Обновить C++ enum `NodeType` если нужно

```typescript
// blueprintTypes.ts
MyNewNode: {
  type: 'MyNewNode',
  label: 'My New Node',
  labelRu: 'Мой новый узел',
  category: 'function',
  headerColor: '#2196F3',
  inputs: [
    { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' },
    { id: 'value', name: 'Value', dataType: 'float', direction: 'input' }
  ],
  outputs: [
    { id: 'exec-out', name: '', dataType: 'execution', direction: 'output' },
    { id: 'result', name: 'Result', dataType: 'float', direction: 'output' }
  ],
},
```

### Добавить IPC сообщение

1. Добавить тип в `messages.ts` (zod schema)
2. Обработать в `GraphPanel.ts` (extension side)
3. Обработать в `main.tsx` (webview side)

### Исправить баг в редакторе

1. Проверить консоль VS Code (Developer Tools)
2. Найти компонент: `BlueprintEditor.tsx` или `GraphEditor.tsx`
3. Проверить IPC: `messages.ts`, `GraphPanel.ts`
4. Написать тест воспроизводящий баг
5. Исправить и проверить `npm run compile && npm run lint`

---

## Чек-лист перед коммитом

- [ ] Код компилируется без ошибок и warnings
- [ ] C++ тесты проходят: `ctest --test-dir build`
- [ ] TS/lint проходит: `npm run lint` (в vscode-extension/)
- [ ] Webpack собирается: `npm run compile`
- [ ] clang-format применён для C++ файлов
- [ ] Добавлены тесты для нового функционала
- [ ] Документация обновлена при изменении API
- [ ] Нет `TODO`, `FIXME`, заглушек

---

## Ссылки на документацию

| Документ | Описание |
|----------|----------|
| [README.md](README.md) | Обзор проекта |
| [Документы/README.md](Документы/README.md) | Индекс активной и архивной документации |
| [CODING_GUIDELINES.md](CODING_GUIDELINES.md) | Детальные правила кодирования |
| [ROADMAP.md](ROADMAP.md) | План версий |
| [Документы/Архитектура/README.md](Документы/Архитектура/README.md) | Описание Core API |
| [Документы/GrowthAreas.md](Документы/GrowthAreas.md) | Точки роста и задачи |

---

## Контекст для агента

При работе с проектом учитывай:

1. **Два редактора**: Blueprint (React Flow, новый) и Classic (Cytoscape, старый)
2. **Переключатель в toolbar**: пользователь выбирает режим
3. **Конвертеры форматов**: `migrateToBlueprintFormat()` / `migrateFromBlueprintFormat()`
4. **Zod валидация**: все IPC сообщения валидируются через zod schemas
5. **Локализация**: RU/EN, используй `getTranslation()` и `TranslationKey`
6. **Темы**: поддержка светлой/тёмной темы VS Code

### Текущие приоритеты

1. Стабилизация `v0.6`-функциональности: функции, class sidecars, dependency UX
2. Консистентность сериализации, документации и публичных контрактов
3. Рост покрытия тестами для codegen, webview и extension-side
4. Подготовка к `v1.0` и публикации в VS Code Marketplace

---

**Конец AI_AGENTS_GUIDE.md**
