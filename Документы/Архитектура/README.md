# Архитектура MultiCode (актуально для 0.4.1)

> **Обновлено:** 2026-03-20

## Оглавление
- [Слои системы](#слои-системы)
- [Ядро и C++ runtime](#ядро-и-c-runtime)
  - [Основные объекты](#основные-объекты)
  - [Алгоритмы](#алгоритмы)
- [Сериализация и форматы](#сериализация-и-форматы)
- [Кодогенерация](#кодогенерация)
- [VS Code Extension и Webview](#vs-code-extension-и-webview)
- [Взаимодействие модулей](#взаимодействие-модулей)
- [Ответственности](#ответственности)
- [Правила соединения портов](#правила-соединения-портов)
- [Ограничения `Port::set_type_name`](#ограничения-portset_type_name)
- [План внедрения C++ классов в Blueprint](CppClassesInBlueprint.md)
- [Матрица target-ов кодогенерации](TargetMatrix.md)

## Слои системы
1. **C++ core model** — `include/visprog/core`, `src/core`. Реализация узлов, портов, графа, типовой системы, сериализации и базовых алгоритмов.
2. **C++ generators + tests** — `include/visprog/generators`, `src/generators`, `tests/core`, `tests/generators`. Catch2 проверяет core API, сериализацию и C++ reference-codegen.
3. **Extension backend (TypeScript)** — `vscode-extension/src/extension.ts`, `commands/`, `panel/`, `compilation/`. Отвечает за команды VS Code, IPC, файловые операции, compile/run и orchestration.
4. **Shared contracts + production codegen (TypeScript)** — `vscode-extension/src/shared/`, `vscode-extension/src/codegen/`. Здесь живут схемы, сериализация `.multicode`, валидатор, target factories и рабочий pipeline генерации `cpp`/`ue`.
5. **Webview UI** — `vscode-extension/src/webview/`. React Flow Blueprint editor, legacy GraphEditor, панели функций, пакетов, классов, зависимостей, предпросмотра кода.

### Model layer для codegen (TS extension)

- Для классов используется единая внутренняя модель `Class/Field/Method` (single-source-model) для всех C++-подобных target-ов.
- `ue` target не дублирует модель, а добавляет extension-метаданные (`extensions.ue`) композиционно.
- Архитектурно это фиксирует один источник истины для `graph -> model` и оставляет target-специфику на уровне strategy/render.

## Ядро и C++ runtime
### Основные объекты
- `NodeId`, `PortId`, `ConnectionId`, `GraphId` (`Types.hpp`) — строгие типы поверх `uint64_t` + сравнение и хеши.
- `Port` (`Port.hpp/.cpp`) — value-type, хранит направление, тип данных, имя. Метод `can_connect_to` проверяет совместимость (см. раздел «Правила соединения портов»).
- `Node` (`Node.hpp/.cpp`) — владеет портами, метаданными и описанием. ID и тип неизменяемые, остальное меняется под внешней синхронизацией. `Node::validate` проверяет ограничения для Start, End, PureFunction и т.д.
- `NodeFactory` (`NodeFactory.*`) — единственная точка создания узлов, добавляет стартовые порты и генерирует имена.
- `Graph` (`Graph.*`) — владеет `std::unique_ptr<Node>`, хранит связи, adjacency-списки и метаданные. Предоставляет быстрый доступ по ID, валидацию, топологическую сортировку и статистику.
- `GraphSerializer` (`GraphSerializer.*`) — преобразует core graph в JSON и обратно.
- `ICodeGenerator` и `visprog::generators::CppCodeGenerator` — C++ reference path для генерации кода и тестового контура ядра.

### Алгоритмы
- **Добавление узла**: проверка уникальности ID, инициализация adjacency.
- **Создание соединения** (`Graph::connect`): проверка существования узлов/портов, направления, типов данных и отсутствия дубликатов.
- **Валидация графа** (`Graph::validate`):
  - Один Start и минимум один End.
  - Все узлы достижимы из Start.
  - Нет незамкнутых execution-циклов.
  - Каждый узел проходит собственную валидацию.
- **Статистика** (`Graph::get_statistics`): количество узлов/связей, разбивка по типам, глубина (максимальная длина execution-цепочки).
- **Утилиты**: поиск Start/End, выборка узлов по типу/имени, проверка наличия пути.

## Сериализация и форматы

В репозитории сейчас **два разных формата**, и это нужно учитывать при любой правке:

1. **C++ `GraphSerializer`**  
   Путь: `include/visprog/core/GraphSerializer.hpp`, `src/core/GraphSerializer.cpp`.  
   Назначение: JSON-представление core graph для snapshot-тестов, интеграции и C++ runtime-сценариев.

2. **TypeScript `serializer.ts`**  
   Путь: `vscode-extension/src/shared/serializer.ts`.  
   Назначение: сохранение и загрузка `.multicode`-состояния редактора, включая webview-специфичные поля, graph metadata, classes, bindings и legacy envelopes.

### C++ GraphSerializer
- `GraphSerializer::to_json(const Graph&)` — детерминированный JSON `graph / nodes / connections`.
- `GraphSerializer::from_json(const nlohmann::json&) -> Result<Graph>` — строго валидирует документ и восстанавливает `Graph`.
- Фактический runtime-формат, который сейчас эмитит `src/core/GraphSerializer.cpp` и проверяют тесты, использует:
  - `schema.version = "1.1.0"`
  - `schema.coreMin = "1.1.0"`
  - `schema.coreMax = "1.1.x"`
- Тесты: `tests/core/test_graph_serializer.cpp`.

### TypeScript serializer (`.multicode`)
- Современный документ хранит `schemaVersion`, `version`, `savedAt`, `data`.
- Текущая версия схемы редактора живёт в `vscode-extension/src/shared/serializer.ts` (`GRAPH_SCHEMA_VERSION = 3`).
- Сериализатор умеет читать legacy envelopes и нормализовать graph state перед сохранением/загрузкой.

## Кодогенерация

### Production path (TypeScript)
- Путь: `vscode-extension/src/codegen/`.
- Генераторы: `CppCodeGenerator.ts`, `UeCodeGenerator.ts`.
- Выбор target-а: `factory.ts`, `languageSupport.ts`.
- Поддерживаемые target-ы:
  - `cpp` — готов
  - `ue` — готов
  - `rust`, `asm` — явно помечены как неподдержанные
- Пайплайн используется в `GraphPanel.ts`, preview-панелях и webview code preview.
- Пакетные узлы подключаются через registry/template path, а предупреждения (`warnings`) идут вместе с результатом генерации.

### C++ reference path
- Путь: `include/visprog/generators/CppCodeGenerator.hpp`, `src/generators/CppCodeGenerator.cpp`.
- Тесты: `tests/generators/test_cpp_code_generator.cpp`.
- Этот слой полезен как reference/runtime path для core и как дополнительная точка проверки контрактов генерации.

## VS Code Extension и Webview
- `vscode-extension/src/extension.ts` — регистрация команд, lifecycle расширения.
- `vscode-extension/src/commands/` — внешние команды и file-oriented workflows.
- `vscode-extension/src/panel/GraphPanel.ts` — orchestration между VS Code API, webview, codegen, binding, compile/run.
- `vscode-extension/src/compilation/` — компиляция и запуск C++ кода, работа с toolchains.
- `vscode-extension/src/shared/` — Zod-схемы, графовые типы, сериализация, локализация, правила совместимости портов.
- `vscode-extension/src/webview/` — основной UX:
  - `BlueprintEditor.tsx` — основной React Flow редактор
  - `GraphEditor.tsx` — legacy Cytoscape редактор
  - `FunctionListPanel.tsx`, `PackageManagerPanel.tsx`, `DependencyView.tsx`, `ClassPanel.tsx`, `UeMacroPanel.tsx`
  - `CodePreviewPanel.tsx`, `EnhancedCodePreviewPanel.tsx`

## Взаимодействие модулей
1. Webview хранит `GraphState`, редактирует его через React/Zustand и отправляет сообщения в extension через IPC.
2. `GraphPanel` валидирует вход через Zod-схемы, управляет сохранением, привязкой к файлам, предпросмотром, генерацией и compile/run.
3. Для editor persistence используется `vscode-extension/src/shared/serializer.ts`; для core JSON и C++ тестового контура — `GraphSerializer`.
4. Кодогенератор выбирается по `graph.language` и возвращает код + warnings; результат показывается в preview, пишется в файл или передаётся в compile/run pipeline.
5. C++ core и C++ generators остаются отдельным слоем модели/валидации/тестов и не завязаны на VS Code UI.

## Ответственности
- **C++ core** — графовая модель, строгая типизация, базовая сериализация и reference runtime path.
- **TS shared/contracts** — единый контракт между extension и webview: типы, схемы, сериализация, валидация, локализация.
- **Codegen layer** — target-specific преобразование `GraphState -> code`, предупреждения и preview metadata.
- **Extension backend** — файловые операции, VS Code API, командная оркестрация, binding, compile/run.
- **Webview UI** — пользовательский UX редактора, панелей и preview без знания о файловой системе и VS Code internals.

### Правила соединения портов

| Категория | Правило | Пояснение |
|-----------|---------|-----------|
| Направление | `Output → Input`, `InOut ↔ *` | Соединения возможны только при противоположном направлении. |
| Execution | Только `Execution ↔ Execution` | Потоки управления не смешиваются с данными. |
| Void | `Void` соединяется только с `Void` | Исключает передачу значения и напоминает о явном завершении. |
| Any/Auto | `Any` и `Auto` принимают любые типы | Упрощают создание универсальных узлов и прототипов. |
| Template | Требует совпадения `type_name` или универсального имени (`*`, `void`, `auto`, `any`) | Позволяет согласовывать шаблонные пины. |
| Пользовательские типы | `Struct/Class/Enum` → совпадение `type_name` | Гарантирует точное совпадение пользовательских идентификаторов. |
| Указатели и ссылки | `Pointer/Reference` совместимы при совпадении `type_name` (или универсальном имени) | Поддерживает `T* ↔ T&` и «void*» как универсальный тип. |
| Контейнеры | Совпадение контейнера (`Array/Vector/Map/Set`) и их `type_name` | Предотвращает смешивание коллекций с разными элементами. |
| Числа | Разрешены целочисленные расширения, `int → float/double`, `float → double`, `float ↔ double` | Воспроизводит безопасные неявные преобразования C++. |
| Строки | `String ↔ StringView`, любой тип → `String/StringView` | Ноды приводят данные к строке для логирования и UI. |
| Логические | Любое числовое значение → `Bool` | Соответствует стандартному приведению к булеву. |

**Дополнительно:**

- Пустой `type_name` интерпретируется как универсальный идентификатор внутри своей категории (`Vector`, `Pointer`, шаблоны и т.д.).
- Перед сравнением `type_name` пропускается через нормализующий парсер: он обрезает пробелы, приводит идентификаторы к нижнему регистру, раскладывает шаблонные аргументы и сортирует именованные пары (`key=value`, `value=...`). Благодаря этому `Key=std::string, Value=Vector<int>` и `value=vector< int >, key=STD::STRING` считаются эквивалентными.
- Парсер рекурсивно обрабатывает вложенные контейнеры, поэтому `Vector<Map<std::string, Vector<Game.Item>>>` совместим с `map < std::string , vector<game.item> >` при сопоставлении портов `Vector`.
- Используйте именованные пары для `Map` (например, `key=std::string, value=Vector<int>`) или позиционные аргументы (`std::string, Vector<int>`). Порядок именованных пар значения не имеет, а позиционные аргументы должны идти в фиксированном порядке (сначала ключ, потом значение).
- Поддержка задокументирована и проверяется тестами [`tests/core/test_port.cpp`](../../tests/core/test_port.cpp), обновляйте их при изменении правил.
- Любые архитектурные инициативы по расширению типовой системы фиксируйте в `ROADMAP.md`, чтобы синхронизировать команду.

### Ограничения `Port::set_type_name`

- Метод доступен только для типов, требующих уточнения (`Pointer`, `Reference`, контейнеры, пользовательские, `Template`). Для примитивов и прочих категорий вызов завершится `std::invalid_argument` с указанием проблемного типа.
- Универсальные маркеры (`*`, `void`, `auto`, `any`) допускаются исключительно для указателей/ссылок и шаблонных параметров. Контейнеры и пользовательские типы требуют осмысленных обозначений элементов.
- Все сценарии валидации зафиксированы в тестах раздела «set_type_name validation» (`[tests/core/test_port.cpp](../../tests/core/test_port.cpp)`), обновляйте их синхронно с изменениями логики.
