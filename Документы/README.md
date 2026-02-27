# Документация MultiCode

> Единый каталог активных и архивных документов проекта.

## Актуальные документы

| Файл | Назначение |
| --- | --- |
| [`README.md`](../README.md) | Продуктовый обзор и быстрый старт. |
| [`ProjectStatus.md`](ProjectStatus.md) | Фактический статус модулей и ближайшие цели. |
| [`ProjectReview.md`](ProjectReview.md) | Контекст проектных решений и приоритетов. |
| [`GrowthAreas.md`](GrowthAreas.md) | Точки роста и стратегические задачи. |
| [`CriticalThinking.md`](CriticalThinking.md) | Чек-лист качества формулировок и решений. |
| [`Архитектура/README.md`](Архитектура/README.md) | Карта архитектуры и модулей. |
| [`Архитектура/VisualEditor.md`](Архитектура/VisualEditor.md) | Архитектура webview-редактора. |
| [`Архитектура/PackageSystem.md`](Архитектура/PackageSystem.md) | Пакетная система узлов и её ограничения. |
| [`Архитектура/CodeBinding.md`](Архитектура/CodeBinding.md) | Связь графа с исходным кодом. |
| [`Архитектура/Multithreading.md`](Архитектура/Multithreading.md) | Модель потоков и ограничения. |
| [`Архитектура/AdvancedFeatures.md`](Архитектура/AdvancedFeatures.md) | Перспективные фичи с пометкой статуса. |
| [`Инфраструктура/README.md`](Инфраструктура/README.md) | Политика Renovate и поддержка зависимостей. |
| [`Инфраструктура/ENCODING_ISSUE.md`](Инфраструктура/ENCODING_ISSUE.md) | Рекомендации по UTF-8 в Windows-сборке. |
| [`Инфраструктура/ERROR_MONITORING.md`](Инфраструктура/ERROR_MONITORING.md) | Мониторинг ошибок и интеграция с tasks. |

## Архив

### Архивированные отчёты

| Файл | Причина архивации |
| --- | --- |
| [`Архив/Отчёты/CodeAudit.md`](Архив/Отчёты/CodeAudit.md) | Разовый аудит состояния на дату. |
| [`Архив/Отчёты/COLOR_PALETTE_RESTORED.md`](Архив/Отчёты/COLOR_PALETTE_RESTORED.md) | Отчёт о закрытом UI-инциденте. |
| [`Архив/Отчёты/DRAG_DROP_FIXED.md`](Архив/Отчёты/DRAG_DROP_FIXED.md) | Отчёт о локальном исправлении. |
| [`Архив/Отчёты/DROPDOWN_IMPLEMENTATION_REPORT.md`](Архив/Отчёты/DROPDOWN_IMPLEMENTATION_REPORT.md) | Отчёт внедрения конкретной функции. |
| [`Архив/Отчёты/LOCALIZATION_AUDIT.md`](Архив/Отчёты/LOCALIZATION_AUDIT.md) | Разовая проверка локализации. |
| [`Архив/Отчёты/QUICK_TEST_POINTER_BINDING.md`](Архив/Отчёты/QUICK_TEST_POINTER_BINDING.md) | Быстрый тестовый чек-лист. |
| [`Архив/Отчёты/VARIABLE_PANEL_RESTORED.md`](Архив/Отчёты/VARIABLE_PANEL_RESTORED.md) | Отчёт об исправлении панели. |

### Архивированные документы из корня

| Файл | Причина архивации |
| --- | --- |
| [`Архив/Корень/ANNOUNCEMENT.md`](Архив/Корень/ANNOUNCEMENT.md) | Временный анонс. |
| [`Архив/Корень/BLUEPRINT_EDITOR_BUTTONS_TEST.md`](Архив/Корень/BLUEPRINT_EDITOR_BUTTONS_TEST.md) | Разовый протокол тестирования. |
| [`Архив/Корень/TASK_COMPLETION_REPORT.md`](Архив/Корень/TASK_COMPLETION_REPORT.md) | Отчёт по конкретной задаче. |
| [`Архив/Корень/test-dropdown.md`](Архив/Корень/test-dropdown.md) | Локальный тестовый документ. |

## Снято с поддержки / заменено

| Старый документ | Замена |
| --- | --- |
| [`vscode-extension/test-extension.md`](../vscode-extension/Архив/test-extension.md) | [`vscode-extension/КАК_ПРОВЕРИТЬ_РАСШИРЕНИЕ.md`](../vscode-extension/КАК_ПРОВЕРИТЬ_РАСШИРЕНИЕ.md) |
| [`vscode-extension/src/codegen/generators/complex-generation-test.md`](../vscode-extension/Архив/src/codegen/generators/complex-generation-test.md) | Интеграционные тесты в `vscode-extension/src/codegen/generators/*.test.ts` |

## Правила актуализации

1. **Факты важнее планов:** версии и статусы сверяются с репозиторием.
2. **Единый источник версии:** `vscode-extension/package.json`.
3. **Архив без удаления истории:** завершённые отчёты переносим, а не удаляем.
