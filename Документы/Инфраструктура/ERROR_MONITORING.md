# Error Monitoring System

**Версия:** 1.0  
**Дата:** 16 декабря 2025  
**Статус:** ✅ Активен

---

## 🎯 Назначение

Автоматическая система мониторинга ошибок для MultiCode:
- Отслеживание ошибок компиляции (MSVC)
- Проверка результатов тестов (CTest)
- Анализ предупреждений CMake
- Сканирование исходников на TODO/FIXME

---

## 📁 Компоненты

### 1. Скрипт мониторинга
**Файл:** [`scripts/monitor-errors.ps1`](../../scripts/monitor-errors.ps1)

**Режимы работы:**
```powershell
# Одноразовая проверка
.\scripts\monitor-errors.ps1

# Подробный вывод
.\scripts\monitor-errors.ps1 -Verbose

# Непрерывный мониторинг (каждые 10 секунд)
.\scripts\monitor-errors.ps1 -Watch -Interval 10
```

### 2. VS Code Tasks

#### 🔍 Мониторинг ошибок
**Горячая клавиша:** Настраивается в User/Workspace settings  
**Функция:** Одноразовый запуск с подробным выводом

#### 👁️ Непрерывный мониторинг
**Функция:** Фоновый процесс, обновление каждые 10 секунд  
**Остановка:** Ctrl+C в терминале

---

## 🔍 Что Отслеживается

### 1. **Ошибки Компиляции (MSVC)**
- Сканирование `build/**/*.log`
- Поиск паттерна: `error C####:`
- Отображение файла, строки и описания

**Пример вывода:**
```
[06:14:19] COMPILER ERRORS: 3
  src/core/Node.cpp(42): error C2065: undeclared identifier 'InvalidNode'
  include/visprog/core/Types.hpp(18): error C2146: syntax error
```

### 2. **Предупреждения Компиляции**
- Паттерн: `warning C####:`
- Первые 10 предупреждений + счётчик остальных

**Пример:**
```
[06:14:19] COMPILER WARNINGS: 15
  ... показано первых 10 ...
  ... and 5 more
```

### 3. **Провалы Тестов**
- Анализ `build/Testing/Temporary/LastTest.log`
- Поиск: `FAILED`, `REQUIRE ... failed`, `CHECK ... failed`

**Пример:**
```
[06:14:19] TEST FAILURES: 2
  test_graph.cpp:156: REQUIRE( graph.validate() ) failed
  test_node.cpp:89: CHECK( node.getName() == "Expected" ) failed
```

### 4. **Предупреждения CMake**
- Проверка `build/CMakeCache.txt`
- Сканирование `build/CMakeFiles/CMakeOutput.log`
- Поиск: `Warning`, `deprecated`

### 5. **Код-маркеры (TODO/FIXME)**
- Рекурсивное сканирование `src/` и `include/`
- Подсчёт на файл

**Пример:**
```
[06:14:19] TODOs/FIXMEs: 5 files
  Node.cpp: 3 TODOs/FIXMEs
  Graph.hpp: 2 TODOs/FIXMEs
```

---

## 🎨 Цветовая Схема

| Тип | Цвет | Значение |
|-----|------|----------|
| 🔴 Error | Red | Критические ошибки (компиляция, тесты) |
| 🟡 Warning | Yellow | Предупреждения (CMake, MSVC) |
| 🔵 Info | Cyan | Информация (TODO, статистика) |
| 🟢 Success | Green | Успешные проверки |
| ⚫ Dim | DarkGray | Метаинформация (временные метки) |

---

## 📊 Примеры Использования

### Сценарий 1: После Сборки
```powershell
# Собрать проект
.\scripts\build-cmake-utf8.ps1

# Проверить ошибки
.\scripts\monitor-errors.ps1 -Verbose
```

### Сценарий 2: Непрерывная Разработка
```powershell
# Запустить мониторинг в фоне
.\scripts\monitor-errors.ps1 -Watch -Interval 5

# Работать над кодом
# Система автоматически обновляет статус каждые 5 секунд
```

### Сценарий 3: VS Code Integration
1. Открыть Command Palette (`Ctrl+Shift+P`)
2. Выбрать `Tasks: Run Task`
3. Выбрать `🔍 Мониторинг ошибок`

---

## 🛠️ Техническая Информация

### Зависимости
- **PowerShell 5.1+** (встроен в Windows)
- **CMake** (для build логов)
- **CTest** (для test логов)

### Производительность
- **Одноразовая проверка:** ~1-2 секунды
- **Непрерывный режим:** Минимальное влияние (только чтение логов)
- **Память:** < 50 MB

### Расширяемость
Скрипт легко расширяется для проверки:
- Утечек памяти (valgrind/ASAN логи)
- Code coverage отчётов
- Static analysis результатов (clang-tidy)
- Git hook violations

---

## 🔧 Конфигурация

### Параметры Скрипта

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `-Watch` | Switch | false | Непрерывный мониторинг |
| `-Interval` | int | 5 | Интервал обновления (секунды) |
| `-Verbose` | Switch | false | Подробный вывод |

### Настройка Tasks

Для изменения интервала мониторинга отредактируйте [`.vscode/tasks.json`](../../.vscode/tasks.json):

```json
{
  "label": "👁️ Непрерывный мониторинг",
  "args": [
    "-Watch",
    "-Interval",
    "10"  // <-- Изменить здесь
  ]
}
```

---

## 🚀 Будущие Улучшения

- [ ] Интеграция с VS Code Problems API
- [ ] Экспорт отчётов в JSON/HTML
- [ ] Уведомления при критических ошибках
- [ ] Интеграция с clang-tidy
- [ ] Поддержка Linux/macOS
- [ ] Web-dashboard для CI/CD
- [ ] Slack/Teams уведомления

---

## 📚 См. Также

- [BUILD_STATUS.md](../../BUILD_STATUS.md) - Статус инфраструктуры
- [ENCODING_ISSUE.md](ENCODING_ISSUE.md) - Проблемы с кодировкой
- [README.md](../../README.md) - Главная документация

---

**Автор:** Клауд (Codex)  
**Дата создания:** 16 декабря 2025  
**Последнее обновление:** 16 декабря 2025
