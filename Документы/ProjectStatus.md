# Project Status

> **Обновлено:** 2025-12-25

## Сводка

| Компонент | Статус | Прогресс |
|-----------|--------|----------|
| C++ Core | ✅ Готово | 100% |
| Сериализация | ✅ Готово | 100% |
| VS Code Extension | ✅ Работает | 100% |
| Blueprint Editor | ✅ Готово | 100% |
| Classic Editor | ✅ Готово | 100% |
| Кодогенерация | ⚠️ Частично | 55% |
| Пакеты узлов | ✅ Готово | 100% |
| Пользовательские функции | ✅ Готово | 100% |
| CI/CD | ⚠️ Частично | 50% |

## Что работает

### C++ ядро
- `Node`, `Port`, `Graph`, `NodeFactory` — полностью реализованы
- `GraphSerializer` — JSON импорт/экспорт с версионированием схемы
- Catch2 тесты — все проходят
- Строгие типы: `NodeId`, `PortId`, `ConnectionId`, `Result<T>`

### VS Code расширение
- **Blueprint Editor** (React Flow):
  - Кастомные узлы с визуальными портами
  - Цветовая схема типов данных
  - Drag-to-connect с валидацией типов
  - Палитра узлов с категориями и поиском
  - MiniMap, Controls, Background
- **Classic Editor** (Cytoscape):
  - Базовый редактор (legacy)
  - Автолейаут через dagre
- **Общее**:
  - Переключатель режимов в toolbar
  - Сохранение/загрузка графа
  - Локализация RU/EN
  - Поддержка светлой/тёмной темы
  - Zod валидация IPC сообщений

### Кодогенерация (v0.3)
- [x] Интерфейс `ICodeGenerator`
- [x] Реализация `CppCodeGenerator`:
  - Start/End, Sequence, Branch, ForLoop, переменные
  - `StringLiteral`, `BoolLiteral`, `IntLiteral`, `Add`, `PrintString`
- [ ] Расширенные узлы (`WhileLoop`, `DoWhile`, `ForEach`, `Switch`, `Break`, `Continue`)
- [ ] Расширенная математика/сравнение/логика (кроме `Add`)
- [ ] Полноценный `Input`, source map и статистика генерации
- [x] Плагинная архитектура генераторов
- [x] Предпросмотр кода в панели
- [x] Базовые C++ тесты генератора в обязательном пайплайне

### UX (v0.4)
- [x] Undo/Redo
- [x] Copy/Paste
- [x] Keyboard shortcuts
- [x] Контекстное меню
- [x] Автолейаут

### Пакеты узлов (v0.5)
- [x] JSON Schema для пакетов
- [x] PackageLoader + PackageRegistry
- [x] TemplateNodeGenerator
- [x] UI панель PackageManagerPanel
- [x] 74 теста

### Пользовательские функции (v0.6)
- [x] FunctionListPanel (UI)
- [x] Типы BlueprintFunction, FunctionParameter
- [x] Кодогенерация: FunctionEntry, FunctionReturn, CallUserFunction
- [x] Генерация сигнатуры с типами C++
- [x] Транслитерация русских имён
- [x] 48 тестов

## Технические метрики

| Метрика | Значение |
|---------|----------|
| C++ строк кода | ~2500 |
| TypeScript строк | ~12000 |
| Тестов C++ | 15+ |
| Тестов TS | 480+ |
| Тестовых файлов | 21 |

## Текущая версия

**v0.6** — Пользовательские функции (завершён)

## Следующие шаги (v1.0)

- [ ] Стабильный API
- [ ] 80%+ code coverage
- [ ] Документация для пользователей
- [ ] Marketplace публикация
- [ ] CI/CD pipeline

## Ссылки

- [ROADMAP.md](../ROADMAP.md) — план версий
- [BUILD_STATUS.md](../BUILD_STATUS.md) — статус сборки
- [AI_AGENTS_GUIDE.md](../AI_AGENTS_GUIDE.md) — руководство для ИИ
