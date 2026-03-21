# Project Status

> **Обновлено:** 2026-03-20

## Сводка

| Направление | Статус | Комментарий |
|------------|--------|-------------|
| C++ Core | ✅ Стабильно | Базовые API и сериализация реализованы |
| VS Code Extension | ✅ Стабильно | Blueprint + Classic режимы в рабочем состоянии |
| Кодогенерация `cpp`/`ue` | ✅ Работает | Поддержка основных узлов, пакетов, функций и UE-target |
| Пакеты узлов | ✅ Работает | Loader/Registry/UI есть, покрыты тестами |
| Пользовательские функции | ✅ Работает | От UI до генерации кода |
| Dependency View / Class System v2 | 🟡 Стабилизация | Функциональность есть, продолжается UX-полировка |
| CI/CD | ✅ Работает | C++, extension, форматирование и coverage workflows присутствуют |
| Документация | 🟡 Частично синхронизирована | Активные документы актуализированы под `0.4.1`, архив хранит историю |

## Версия и этап

- **Релизная версия расширения:** `0.4.1` (по `vscode-extension/package.json`)
- **Внутренний этап разработки:** вехи roadmap до `v0.6` реализованы; идёт стабилизация UX и контрактов
- **Текущий фокус:** подготовка к `v1.0` (стабилизация API, качество, документация, публикация)

## Что подтверждено по репозиторию

### C++ ядро
- Публичные заголовки: `include/visprog/core/`
- Реализации: `src/core/`
- Тесты: `tests/`

### Webview/Extension
- Основной редактор: `vscode-extension/src/webview/BlueprintEditor.tsx`
- Legacy-редактор: `vscode-extension/src/webview/GraphEditor.tsx`
- Кодогенераторы: `vscode-extension/src/codegen/CppCodeGenerator.ts`, `vscode-extension/src/codegen/UeCodeGenerator.ts`
- IPC с Zod: `vscode-extension/src/shared/messages.ts`
- Локализация RU/EN: `vscode-extension/src/shared/translations.ts`
- Сериализация `.multicode`: `vscode-extension/src/shared/serializer.ts`

### Инфраструктура качества
- C++ CI: `.github/workflows/cpp-build.yml`
- Extension CI: `.github/workflows/vscode-extension-ci.yml`
- Проверка форматирования C++: `.github/workflows/code-format.yml`
- Golden/unit тесты кодогенерации: `vscode-extension/src/codegen/**/*.test.ts`, `tests/generators/`

## Цели до v1.0

- [ ] Стабильный публичный API
- [ ] Прозрачные метрики покрытия
- [ ] Консистентная пользовательская документация
- [ ] Публикация в VS Code Marketplace

## Ссылки

- [ROADMAP.md](../ROADMAP.md) — вехи и этапы
- [BUILD_STATUS.md](../BUILD_STATUS.md) — состояние сборки и CI
- [AI_AGENTS_GUIDE.md](../AI_AGENTS_GUIDE.md) — практическое руководство для ИИ
- [README.md](../README.md) — продуктовый обзор
