# Growth Areas (0.1.0-alpha)

## Оглавление
- [Core / Graph API](#core--graph-api)
- [Serialization](#serialization)
- [Code Generation / Bindings](#code-generation--bindings)
- [VS Code Extension](#vs-code-extension)
- [CI / Tooling](#ci--tooling)
- [Testing](#testing)

## Core / Graph API
- Вынести конфигурацию узлов из `NodeFactory` в описатели (`NodeDescriptor`) плюс реестр. Фабрика должна читать объявление из пакета, а не держать гигантский `switch` по enum.
- Перестать возвращать `NodeId{0}` как признак ошибки. Пусть методы добавления/удаления отдают `Result<T>` с кодами 30x - тогда UI сможет показать причину, а не гадать.
- Свести к минимуму утечки сырых указателей. Наружу отдаём `std::shared_ptr<const Node>` или `std::span<const Node*>`, а не `Node*`, чтобы не ловить висячие ссылки.
- Ввести `GraphController` со `std::shared_mutex`: сейчас любая параллельная запись убивает состояние. Контроллер должен брать read/write lock вокруг публичных операций.
- Подключить `spdlog` там, где формируются `Error` - пусть валидация пишет в лог код и конкретный порт/узел для нормальной диагностики.

## Serialization
- Расширить версионирование: schema v1.0.0 уже внедрена (см. [`Документы/Архитектура/README.md`](./Архитектура/README.md#сериализация-graphserializer)), теперь нужна стратегия миграций и тул `graph migrate`.
- Подготовить CLI/инструмент `multicode graph --import/--export`, который вызывает `GraphSerializer` без участия VS Code.
- Настроить интеграционные тесты: загрузка JSON → валидация графа → проверка, что новые ID не конфликтуют (property-based checks).

## Code Generation / Bindings
- Ввести `ICodeGenerator` + `CppCodeGenerator`. Даже заглушка, которая выводит последовательность узлов, уже оживит команду "Generate Code".
- Сопоставление `NodeType -> Template`: таблица шаблонов и резолвер значений портов, а не каскад `if`.
- Реализовать `CodeBindingRepository`: хранение пути и маркеров begin/end, проверка файлов перед записью. Базовый протокол уже описан в `Архитектура/CodeBinding.md`.

## VS Code Extension
- Добавить реальные исходники: `src/extension.ts` (регистрация команд, webview) и `src/webview/main.tsx` (Cytoscape + Zustand). Каталог сейчас пуст.
- Настроить IPC `graphChanged` / `saveGraph` / `generateCode`. Webview отправляет JSON, расширение валидирует через `GraphSerializer` и отвечает статусом.
- Палитра узлов должна читаться из реестра (или промежуточного JSON), чтобы не дублировать типы между C++ и TypeScript.

## CI / Tooling
- Поднять `.github/workflows/cpp-build.yml` и `code-format.yml` в реальном CI и добавить badge в README.
- Добавить шаги `clang-format` и `clang-tidy`: конфиг лежит, но не применяется.
- После появления UI нужен отдельный npm workflow (`npm ci && npm run lint`).

## Testing
- Поверх unit-тестов (`tests/core`) нужны property-based проверки соединений и негативные сценарии для `Graph::connect` (дубли, несовместимые порты).
- Snapshot-тесты для сериализации плюс golden-файлы для будущего генератора кода (простые графы -> ожидаемый C++).
- Интеграционный скрипт, который грузит JSON, валидирует и прогоняет `CppCodeGenerator`, чтобы ловить регрессии без ручного кликанья.
