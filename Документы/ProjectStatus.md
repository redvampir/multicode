# Project Status

> **Обновлено:** 2026-02-07

## Сводка

| Направление | Статус | Комментарий |
|------------|--------|-------------|
| C++ Core | ✅ Стабильно | Базовые API и сериализация реализованы |
| VS Code Extension | ✅ Стабильно | Blueprint + Classic режимы в рабочем состоянии |
| Кодогенерация C++ | ✅ Работает | Поддержка основных узлов, пакетов и функций |
| Пакеты узлов | ✅ Работает | Loader/Registry/UI есть, покрыты тестами |
| Пользовательские функции | ✅ Работает | От UI до генерации кода |
| CI/CD | ✅ Работает | C++, extension, форматирование и coverage workflows присутствуют |
| Документация | 🟡 Перестройка | Идёт синхронизация активных и архивных документов |

## Версия и этап

- **Релизная версия расширения:** `0.4.0` (по `vscode-extension/package.json`)
- **Внутренний этап разработки:** реализованы вехи roadmap до `v0.6`
- **Текущий фокус:** подготовка к `v1.0` (стабилизация, качество, публикация)

## Что подтверждено по репозиторию

### C++ ядро
- Публичные заголовки: `include/visprog/core/`
- Реализации: `src/core/`
- Тесты: `tests/`

### Webview/Extension
- Основной редактор: `vscode-extension/src/webview/BlueprintEditor.tsx`
- Legacy-редактор: `vscode-extension/src/webview/GraphEditor.tsx`
- IPC с Zod: `vscode-extension/src/shared/messages.ts`
- Локализация RU/EN: `vscode-extension/src/shared/translations.ts`

### Инфраструктура качества
- C++ CI: `.github/workflows/cpp-build.yml`
- Extension CI: `.github/workflows/vscode-extension-ci.yml`
- Проверка форматирования C++: `.github/workflows/code-format.yml`

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
