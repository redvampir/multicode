# MSYS2 - Установка и Обновление

## Описание

MSYS2 - это environment для разработки на Windows, которая предоставляет:
- **GCC/G++** компилятор (современные версии)
- **GDB** отладчик
- **Make** и другие Unix инструменты
- **CMake**, **Ninja** и т.д.

Это лучше, чем сдавать на Strawberry Perl, так как MSYS2 имеет более свежие версии компиляторов и лучшую поддержку C++20/23.

## Установка

### Автоматическая установка (рекомендуется)

Запустите в PowerShell **от имени администратора**:

```powershell
powershell -Command "Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force; & 'F:\MultiCode\MultiCode_VS\scripts\install-msys2.ps1'"
```

Или через BAT:

```cmd
F:\MultiCode\MultiCode_VS\scripts\install-msys2.bat
```

### Ручная установка

1. **Скачайте MSYS2**
   - Перейдите на https://www.msys2.org/
   - Скачайте **msys2-x86_64-*.exe** (64-bit рекомендуется)

2. **Установите MSYS2**
   - Запустите установщик
   - Выберите путь (по умолчанию: `C:\msys64`)
   - Завершите установку

3. **Обновите пакеты**
   - Запустите **MSYS2 UCRT64** terminal (из меню Start)
   - Выполните:
     ```bash
     pacman -Syuu --noconfirm
     sleep 3
     pacman -Syuu --noconfirm
     ```

4. **Установите компиляторы**
   ```bash
   pacman -Sy --noconfirm base-devel mingw-w64-ucrt-x86_64-gcc mingw-w64-ucrt-x86_64-gdb mingw-w64-ucrt-x86_64-cmake
   ```

5. **Добавьте в PATH**
   - Откройте "Переменные среды" (Environment Variables)
   - В системных переменных PATH, добавьте в начало: `C:\msys64\ucrt64\bin`
   - Перезагрузите Windows

## Что получилось

После установки:

```
Путь установки:     C:\msys64
Компиляторы:        C:\msys64\ucrt64\bin
  - g++.exe
  - gcc.exe
  - gdb.exe
  - cmake.exe
  - ninja.exe
```

## Проверка установки

### В PowerShell

```powershell
where.exe g++      # Должно показать: C:\msys64\ucrt64\bin\g++.exe
g++ --version      # Показать версию
gcc --version
gdb --version
```

### В CMD

```cmd
where g++
g++ --version
```

## Обновление MSYS2

MSYS2 регулярно обновляется. Для обновления:

1. Откройте MSYS2 UCRT64 terminal
2. Выполните:
   ```bash
   pacman -Syuu --noconfirm
   ```
3. При необходимости перезагрузите terminal

## Использование с VS Code

### CMake Configuration

В `.vscode/settings.json`:

```json
{
  "cmake.configureSettings": {
    "CMAKE_CXX_COMPILER": "C:/msys64/ucrt64/bin/g++.exe",
    "CMAKE_C_COMPILER": "C:/msys64/ucrt64/bin/gcc.exe",
    "CMAKE_CXX_STANDARD": "20"
  },
  "cmake.generator": "Ninja Multi-Config"
}
```

### Встроенные терминалы

Добавьте в `settings.json`:

```json
{
  "terminal.integrated.defaultProfile.windows": "PowerShell",
  "terminal.integrated.profiles.windows": {
    "PowerShell": {
      ...
    },
    "MSYS2": {
      "path": "C:\\msys64\\usr\\bin\\bash.exe",
      "args": ["-l", "-i"],
      "env": {}
    }
  }
}
```

## Часто встречаемые проблемы

### 1. `g++: command not found`

**Решение:** MSYS2 не добавлена в PATH или старый terminal кэшировал PATH

```powershell
# Обновить PATH в текущем процессе
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine")
where.exe g++
```

### 2. Старая версия g++ (5.x-7.x вместо 13.x+)

**Решение:** Используется Strawberry Perl, а не MSYS2

```powershell
# Проверить какой g++ используется
(where.exe g++)[0]  # Должна быть C:\msys64...

# Добавить MSYS2 в PATH явно
$env:PATH = "C:\msys64\ucrt64\bin;$env:PATH"
g++ --version     # Проверить версию
```

### 3. CMake не находит компилятор

**Решение:** Очистить CMake cache и переконфигурировать

```bash
cmake --fresh -DCMAKE_CXX_COMPILER=C:/msys64/ucrt64/bin/g++.exe -DCMAKE_C_COMPILER=C:/msys64/ucrt64/bin/gcc.exe
```

### 4. Перемедленная компиляция

**Решение:** Использовать Ninja вместо Make

```json
"cmake.generator": "Ninja Multi-Config"
```

## Переменные окружения

Основные для MSYS2:

| Переменная | Значение |
|-----------|---------|
| `MSYS2_PATH_TYPE` | `inherit` (наследует PATH от Windows) |
| `MSYS2_ARG_CONV_EXCL` | Пути, которые не преобразовывать |
| `CYGWIN` | `winsymlinks:native` (поддержка символических ссылок) |

## Удаление MSYS2

Если нужно удалить MSYS2:

1. **Удалить из PATH:**
   - Переменные среды → PATH → удалить `C:\msys64\ucrt64\bin`

2. **Удалить папку:**
   ```cmd
   rmdir /s /q C:\msys64
   ```

3. **Оставить только Strawberry:**
   ```powershell
   where.exe g++  # Должна быть C:\Strawberry\...
   ```

## Версии компонентов

**MSYS2 UCRT64** (рекомендуется для современной разработки):
- GCC 13.2.0+ 
- GDB 14.1+
- CMake 3.27+
- Ninja 1.11+

**MSYS2 MINGW64** (для старых проектов):
- GCC 12.x
- Хорошая поддержка Windows XP/Vista

## Документация

- Официальный сайт: https://www.msys2.org/
- Wiki: https://github.com/msys2/msys2/wiki
- Packages: https://packages.msys2.org/

## Автоматизация через VS Code Task

Добавьте в `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "🔄 Обновить MSYS2",
      "type": "shell",
      "command": "C:\\msys64\\usr\\bin\\bash.exe",
      "args": ["-lc", "pacman -Syuu --noconfirm"],
      "presentation": {
        "reveal": "always"
      }
    }
  ]
}
```
