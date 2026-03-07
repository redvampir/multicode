# Roadmap MultiCode

> **Обновлено:** 2026-02-21

## Политика версий

- **Релизная версия продукта:** определяется полем `version` в `vscode-extension/package.json` (сейчас `0.4.1`).
- **Вехи roadmap (`v0.5`, `v0.6`, ...):** внутренние этапы разработки и поставки функциональности.
- **Правило синхронизации:** README и статусные документы опираются на релизную версию, roadmap — на этапы.

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

## v0.3 — «Генерируем C++» 🚧 В РАБОТЕ

- [x] `ICodeGenerator` интерфейс
- [x] `CppCodeGenerator` реализация:
  - [x] Start/End узлы
  - [x] Последовательность вызовов (execution flow)
  - [x] Переменные (`Variable`, `SetVariable`, `GetVariable`)
  - [x] Условия (`Branch` → if/else)
  - [x] Циклы (`WhileLoop`, `DoWhile`, `ForEach`)
  - [x] Управление потоком (`Break`, `Continue`, `Switch`)
  - [x] Математика (`Subtract`, `Multiply`, `Divide`, `Modulo`)
  - [x] Сравнение (`Equal`, `NotEqual`, `Greater`, `Less`, `GreaterEqual`, `LessEqual`)
  - [x] Логика (`And`, `Or`, `Not`)
  - [x] Ввод (`Input`)
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

## v0.6 — «Пользовательские функции» 🚧 В РАБОТЕ

> Текущее состояние (релиз `0.4.1`): UI/модель и кодогенерация пользовательских функций работают end-to-end; в фокусе — стабилизация и UX.

- [x] UI панель для управления функциями (`FunctionListPanel`)
  - [x] Создание/редактирование/удаление функций
  - [x] Добавление входных и выходных параметров
  - [x] Переключение между EventGraph и графом функции
  - [x] Локализация RU/EN
- [x] Типы для функций в `blueprintTypes.ts`
  - [x] `BlueprintFunction`, `FunctionParameter`
  - [x] `FunctionEntry`, `FunctionReturn`, `CallUserFunction`
- [x] Кодогенерация пользовательских функций (интеграция end-to-end)
  - [x] `FunctionEntryNodeGenerator`
  - [x] `FunctionReturnNodeGenerator`
  - [x] `CallUserFunctionNodeGenerator`
  - [x] Генерация сигнатуры с C++ типами
  - [x] Поддержка множественных выходных параметров (`std::tuple`)
  - [x] Транслитерация русских имён
  - [x] Русские комментарии
- [x] Расширенный `CodeGenContext` с `currentFunction` и `functions`
- [x] `CppCodeGenerator.generateUserFunction()` в основном пайплайне генерации
- [x] Тесты end-to-end: функция создаётся в UI, вызывается из EventGraph, и генерируется корректный C++ (unit + интеграционные)
- [ ] Dependency View v2 (переработка окна зависимостей)
  - [x] Этап 1: UI-скелет
    - [x] Блок "Прикреплено к активному файлу"
    - [x] Группировка символов по типам (function/method/class/struct/enum/variable)
    - [x] Скроллируемые области для больших списков
    - [x] Инспектор символа: namespace, сигнатура, источник
  - [x] Этап 2: Перенос символов в граф
    - [x] Клик-добавление узла по symbol (function/method)
    - [x] Drag&Drop символа на Blueprint canvas
    - [x] Поддержка двух режимов UI: отдельный dependency-режим + боковая панель в Blueprint
  - [x] Этап 3: Дерево зависимостей
    - [x] Мини-дерево: active file -> integration -> attached files
    - [x] Фильтры и счетчики по типам символов
    - [x] Отображение параметров/сигнатур (включая шаблонные и сложные случаи)
  - [x] Этап 4: Масштабирование и UX для больших фреймворков
    - [x] Виртуализация списков символов
    - [x] Оптимизация селекторов и рендеринга
    - [x] Стресс-проверка на больших C++/UE заголовках
- [ ] Class System v2
  - [x] Итерация A: embedded + modal + nodes
    - [x] Разделение codeName (`name`) и UI-оверлея (`nameRu`) для класса/полей/методов/параметров
    - [x] Mini ClassPanel в едином стиле sidebar (добавить узел / открыть редактор / удалить)
    - [x] Полноразмерный modal ClassEditor
    - [x] Фабрика готовых class-node (`ctor`, `method`, `static`, `get`, `set`)
    - [x] Ребиндинг class-node при изменении сигнатуры класса
  - [x] Итерация B: sidecar class files
    - [x] ClassStorageAdapter (`embedded`/`sidecar`)
    - [x] `.multicode/classes/<classId>.multicode` + binding-маркер
    - [x] Мягкая миграция без ломки текущих графов
  - [ ] Class Sidecar UX + новые class-узлы
    - [x] Заход 1: Диагностика sidecar + центр файлов классов
      - [x] Расширенный `classStorageStatusChanged` (источник/причина/путь/exists/lastChecked)
      - [x] Секция "Файлы классов" с действиями `Открыть / Перечитать / Починить`
      - [x] Статусы и mode-бейджи в Header/Сводке/ClassPanel
    - [x] Заход 2: Вертикальный UX + DnD из ClassPanel
      - [x] Фильтры `Все / Проблемные / Изменённые`
      - [x] Drag&Drop метода/поля из ClassPanel на canvas
      - [x] Устранение горизонтального overflow в ClassPanel
    - [x] Заход 3: Core class-узлы
      - [x] `StaticGetMember`
      - [x] `StaticSetMember`
      - [x] `ConstructorOverloadCall`
    - [x] Заход 4: Advanced class-узлы (feature-flag `multicode.classNodes.advanced`)
      - [x] `CallBaseMethod`
      - [x] `CastStatic`
      - [x] `CastDynamic`
      - [x] `CastConst`
      - [x] `IsType`
      - [x] `MakeUnique`
      - [x] `MakeShared`
      - [x] `DeleteObject`
      - [x] `AddressOfMember`
      - [x] `InitListCtor`
    - [x] Заход 5: финальная полировка UX/документации
      - [x] Badge `Class Nodes: CORE/ADVANCED` в toolbar/summary
      - [x] Advanced actions в ClassPanel без горизонтального overflow
      - [x] README обновлён под sidecar + advanced class nodes

## v0.7 — «Проектная работа» 🚧 ПЛАНИРУЕТСЯ

- [ ] Сохранение/загрузка проектов (.multicode файлы)
  - [ ] Формат файла с метаданными графа
  - [ ] Автосохранение с интервалом
  - [ ] История изменений (ревизии)
  - [ ] Импорт/экспорт проектов
- [ ] Файловая интеграция VS Code
  - [ ] Workspace explorer интеграция
  - [ ] Контекстное меню для .multicode файлов
  - [ ] Автоматическое обнаружение изменений
- [ ] Улучшение производительности для больших графов
  - [ ] Виртуализация узлов (React.memo + useMemo)
  - [ ] Ленивая загрузка пакетов при необходимости
  - [ ] Оптимизация рендеринга связей
  - [ ] Профилирование и замеры производительности

## v0.8 — «Образовательная платформа» 📚 ПЛАНИРУЕТСЯ

- [ ] Встроенные уроки и туториалы
  - [ ] Интерактивное введение в визуальное программирование
  - [ ] Примеры программ: "Hello World", калькулятор, обработка данных
  - [ ] Пошаговые руководства с превью
- [ ] Помощник для начинающих
  - [ ] Всплывающие подсказки при первом использовании
  - [ ] Предложения по оптимизации графа
  - [ ] Объяснение ошибок валидации на русском
- [ ] Шаблоны проектов
  - [ ] Готовые решения для типовых задач
  - [ ] Образовательные пакеты узлов
  - [ ] Конструктор уроков

## v0.9 — «Экосистема и сообщество» 🌍 ПЛАНИРУЕТСЯ

- [ ] Онлайн репозиторий пакетов
  - [ ] Web-интерфейс для просмотра пакетов
  - [ ] Поиск по категориям и тегам
  - [ ] Рейтинги, отзывы, скачивания
  - [ ] Версионирование и совместимость
- [ ] Инструменты для разработчиков
  - [ ] Документация по созданию пакетов (на русском)
  - [ ] Локальный тестировщик пакетов
  - [ ] Валидатор схем пакетов
  - [ ] Генератор шаблонов пакетов
- [ ] Сообщество
  - [ ] GitHub Discussions интеграция
  - [ ] Баг-репорты через UI
  - [ ] Запрос фичей и голосование
  - [ ] Поделиться графиками

## v1.0 — «Production Ready»
- [ ] Стабильный API
- [ ] 80%+ code coverage  
- [ ] Полная документация (на русском)
- [ ] VS Code Marketplace публикация
- [ ] Сравнение с аналогами (README)
- [x] Базовый CI/CD pipeline:
  - [x] C++ Build & Test (Windows MSVC, Linux GCC)
  - [x] Code Format Check (clang-format)
  - [x] C++ Code Coverage (lcov + Codecov)
  - [x] VS Code Extension CI (TypeScript, lint, tests, build)
  - [x] VSIX packaging на main branch

## Будущее (v1.1+) 🔮

- [ ] Импорт кода в граф (поэтапно)
  - [ ] `v1.1` — восстановление графа из кода, сгенерированного MultiCode (стабильные маркеры `@multicode:*`, fallback при потере `.multicode`)
  - [ ] `v1.2` — ограниченный импорт C++ через `tree-sitter` (переменные, присваивания, вызовы, `if/else`, циклы; сложные случаи в `Raw C++` узлы)
  - [ ] `v2.0+` — полноценный импорт произвольного C++ через Clang (`compile_commands.json`, AST/CFG, точная типизация)
- [ ] AI ассистент для создания узлов
- [ ] Автоматическое тестирование кодогенерации
- [ ] Расширенная отладка с брейкпоинтами
- [ ] Поддержка других языков (Rust, Python)
- [ ] Веб-версия редактора (браузерная)
- [ ] Мобильная версия для просмотра графов

## Out of Scope (после v1.0)

- Совместная работа в реальном времени
- Live-дебаг графов
- Экспорт в другие IDE (не VS Code)
- Генерация Rust/ASM (только C++ в v1.0)
- AI-assisted node naming

---

**Принцип:** каждый пункт помечается `[x]` только когда есть рабочий код и тесты в репозитории.
