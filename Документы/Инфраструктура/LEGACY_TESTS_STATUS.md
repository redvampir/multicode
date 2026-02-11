# Статус legacy C++ тестов

> **Обновлено:** 2026-02-11

## Контекст

В проекте были отключены два тестовых файла:

- `tests/core/test_flow_control_nodes.cpp`
- `tests/generators/test_cpp_code_generator.cpp`

Причина отключения в основном target `multicode_tests`:

1. `test_flow_control_nodes` зависел от старого API фабрики узлов и не покрывал актуальные сценарии новой ветки графа.
2. `test_cpp_code_generator` требовал прямой сборки `CppCodeGenerator.cpp`, который был временно убран из `multicode_core` на время рефакторинга.

## Принятое решение

Вместо возврата в основной набор в текущем состоянии тесты вынесены в отдельный target:

- **Target (flow control):** `multicode_legacy_tests`
- **Target (codegen, вне CI):** `multicode_codegen_legacy_tests`
- **Флаг CMake:** `-DMULTICODE_ENABLE_LEGACY_TESTS=ON`
- **Отдельный CI-job:** `Linux Legacy Tests (label: legacy)`
- **Маркер в CI-логах:** `legacy`

Это позволяет:

- не терять историческое покрытие по сценариям flow-control и codegen;
- не блокировать основной pipeline нестабильным/переходным тестовым набором;
- явно видеть динамику по числу запускаемых legacy-тестов в CI и по числу подготовленных legacy-target.

## Критерии “восстановлен в основной набор”

Legacy-тест считается восстановленным, когда выполнены все условия:

- [ ] тест проходит без специальных флагов (`MULTICODE_ENABLE_LEGACY_TESTS=OFF`);
- [ ] тест не требует отдельной линковки генератора вне `multicode_core`;
- [ ] тест покрывает текущий публичный API (без адаптеров для устаревших портов/имён);
- [ ] тест стабильно зелёный на Linux + Windows в основном workflow;
- [ ] после переноса обновлена эта страница статуса.

## Как запускать

```bash
cmake -B build -S . -DMULTICODE_ENABLE_LEGACY_TESTS=ON
cmake --build build --target multicode_legacy_tests
ctest --test-dir build -R multicode_legacy_tests --output-on-failure --verbose

# Отдельная сборка codegen legacy-набора (пока вне CI)
cmake --build build --target multicode_codegen_legacy_tests
```
