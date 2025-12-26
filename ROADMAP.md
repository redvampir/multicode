# Roadmap MultiCode

> **Обновлено:** 2025-12-25

## v0.1 — «Граф можно создать и сохранить» ✅ ЗАВЕРШЁН

- [x] `GraphSerializer` (JSON) + snapshot тесты
- [x] VS Code webview: React + Cytoscape редактор
- [x] Добавление/удаление узлов через UI
- [x] Соединение узлов (drag-to-connect)
- [x] Сохранение/загрузка графа в JSON
- [x] Zod валидация IPC сообщений
- [x] Поддержка тем (светлая/тёмная)
- [x] Локализация RU/EN

## v0.2 — «Blueprint-style редактор» ✅ ЗАВЕРШЁН

- [x] Миграция на React Flow
- [x] Кастомные узлы с портами (BlueprintNode)
- [x] Визуальные порты: exec (квадратные), data (круглые)
- [x] Цветовая схема типов данных (как в Unreal)
- [x] Палитра узлов с категориями и поиском
- [x] Drag-to-connect с валидацией типов
- [x] Переключатель Blueprint/Classic режимов
- [x] MiniMap и Controls

## v0.3 — «Генерируем C++» ✅ ЗАВЕРШЁН

- [x] `ICodeGenerator` интерфейс
- [x] `CppCodeGenerator` реализация:
  - [x] Start/End узлы
  - [x] Последовательность вызовов (execution flow)
  - [x] Переменные (`Variable`, `SetVariable`, `GetVariable`)
  - [x] Условия (`Branch` → if/else)
  - [x] Циклы (`ForLoop`, `WhileLoop`, `DoWhile`, `ForEach`)
  - [x] Управление потоком (`Break`, `Continue`, `Switch`, `Sequence`)
  - [x] Математика (`Add`, `Subtract`, `Multiply`, `Divide`, `Modulo`)
  - [x] Сравнение (`Equal`, `NotEqual`, `Greater`, `Less`, `GreaterEqual`, `LessEqual`)
  - [x] Логика (`And`, `Or`, `Not`)
  - [x] Ввод/вывод (`Print`, `Input`)
  - [x] Русские комментарии с названиями узлов
  - [x] Транслитерация русских переменных
  - [x] Source map (маппинг узлов на строки кода)
  - [x] Статистика генерации (время, количество узлов/строк)
- [x] Плагинная архитектура генераторов (`generators/`)
- [x] Предпросмотр кода в панели (split view с синхронной подсветкой)
- [x] Binding к исходникам: маркеры `// multicode:begin` / `// multicode:end`
- [x] 19 unit-тестов для кодогенератора

## v0.4 — «Удобно использовать» ✅ ЗАВЕРШЁН

- [x] Undo/Redo в редакторе (хук useUndoRedo с паттерном Memento)
- [x] Copy/Paste узлов (хук useClipboard с сохранением связей)
- [x] Inline редактирование label узлов (двойной клик)
- [x] Keyboard shortcuts:
  - `Ctrl+Z` — Undo
  - `Ctrl+Y` / `Ctrl+Shift+Z` — Redo
  - `Ctrl+C` — Copy
  - `Ctrl+X` — Cut
  - `Ctrl+V` — Paste
  - `Ctrl+A` — Select All
  - `Delete/Backspace` — Delete
  - `A` — Node palette
  - `C` — Code preview
  - `F` — Zoom to fit
  - `L` — Auto layout
  - `Escape` — Close panels
- [x] Контекстное меню (правый клик) с локализацией RU/EN
- [x] Автолейаут графа (dagre library)
- [x] Zoom to fit (кнопка + хоткей)

## v0.5 — «Пакеты узлов» ✅ ЗАВЕРШЁН

- [x] JSON Schema для пакетов (`schemas/multicode-package.schema.json`)
- [x] Формат пакета: `package.json` с определениями узлов
- [x] `PackageLoader` — загрузка и валидация пакетов (Zod схемы)
- [x] `PackageRegistry` — реестр узлов с подпиской на изменения
- [x] `usePackageRegistry` — React хук для webview
- [x] Интеграция с `BlueprintEditor` (NodePalette из реестра)
- [x] `TemplateNodeGenerator` — кодогенерация из шаблонов пакетов
- [x] `CppCodeGenerator.withPackages()` — поддержка пакетных генераторов
- [x] Сбор `includes` из шаблонов пакетов
- [x] Стандартный пакет `@multicode/std` (Print, базовые узлы)
- [x] UI панель для управления пакетами (`PackageManagerPanel`)
  - [x] Просмотр загруженных пакетов (имя, версия, кол-во узлов)
  - [x] Выгрузка пакетов (защита @multicode/std от выгрузки)
  - [x] Загрузка пакетов из JSON (textarea или файл)
  - [x] Хоткей `P` для открытия панели
  - [x] Локализация RU/EN
- [x] 74 теста для системы пакетов (PackageLoader: 30, usePackageRegistry: 8, TemplateNodeGenerator: 21, PackageManagerPanel: 23, интеграция: 3)
- [ ] Загрузка пакетов из npm (отложено)

## v0.6 — «Пользовательские функции» ✅ ЗАВЕРШЁН

- [x] UI панель для управления функциями (`FunctionListPanel`)
  - [x] Создание/редактирование/удаление функций
  - [x] Добавление входных и выходных параметров
  - [x] Переключение между EventGraph и графом функции
  - [x] Локализация RU/EN
- [x] Типы для функций в `blueprintTypes.ts`:
  - [x] `BlueprintFunction` — описание функции с параметрами и графом
  - [x] `FunctionParameter` — параметр функции (input/output)
  - [x] `FunctionEntry`, `FunctionReturn`, `CallUserFunction` — типы узлов
- [x] Фабричные функции (`createUserFunction`, `addFunctionInputParameter`, etc.)
- [x] Кодогенерация пользовательских функций:
  - [x] `FunctionEntryNodeGenerator` — точка входа в функцию
  - [x] `FunctionReturnNodeGenerator` — возврат из функции
  - [x] `CallUserFunctionNodeGenerator` — вызов функции
  - [x] Генерация сигнатуры функции с типами C++
  - [x] Поддержка множественных выходных параметров (через `std::tuple`)
  - [x] Транслитерация русских имён функций и параметров
  - [x] Русские комментарии с названием функции
- [x] Расширенный `CodeGenContext` с `currentFunction` и `functions`
- [x] `CppCodeGenerator.generateUserFunction()` — полная генерация тела функции
- [x] 48 тестов для функций (generators/functions.test.ts: 38, интеграционные: 10)

## v1.0 — «Production Ready»

- [ ] Стабильный API
- [ ] 80%+ code coverage
- [ ] Документация для пользователей
- [ ] Marketplace публикация
- [x] CI/CD pipeline:
  - [x] C++ Build & Test (Windows MSVC, Linux GCC)
  - [x] Code Format Check (clang-format)
  - [x] C++ Code Coverage (lcov + Codecov)
  - [x] VS Code Extension CI (TypeScript, lint, tests, build)
  - [x] VSIX packaging на main branch

---

## Out of Scope (после v1.0)

- Совместная работа в реальном времени
- Live-дебаг графов
- Экспорт в другие IDE (не VS Code)
- Генерация Rust/ASM (только C++ в v1.0)
- AI-assisted node naming

---

**Принцип:** каждый пункт помечается `[x]` только когда есть рабочий код и тесты в репозитории.
