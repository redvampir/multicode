# 🛠️ MSYS2 - Обновление и настройка на Windows

## Краткие инструкции

### Вариант 1: Полностью автоматическая установка (Рекомендуется)

1. **Скачайте MSYS2** с https://www.msys2.org/ 
   - Скачайте **msys2-x86_64-20240114.exe** или новее

2. **Запустите установщик**
   - Путь установки: `C:\msys64` (по умолчанию)
   - Нажмите Далее до конца

3. **Запустите скрипт обновления от администратора:**

   **Вариант A (PowerShell):**
   ```powershell
   # Откройте PowerShell от администратора и выполните:
   Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force
   & 'F:\MultiCode\MultiCode_VS\scripts\install-msys2.ps1'
   ```

   **Вариант B (CMD):**
   ```cmd
   REM Откройте CMD от администратора и выполните:
   F:\MultiCode\MultiCode_VS\scripts\install-msys2.bat
   ```

4. **Перезагрузите VS Code и все терминалы**

5. **Проверьте результат:**
   ```powershell
   where.exe g++      # Должно быть: C:\msys64\ucrt64\bin\g++.exe
   g++ --version      # Проверить версию
   ```

---

## Вариант 2: Ручная установка (если скрипты не помогли)

### Шаг 1: Установить MSYS2

1. Скачайте https://github.com/msys2/msys2-installer/releases/download/2024-01-14/msys2-x86_64-20240114.exe
2. Запустите установщик
3. Выберите путь: `C:\msys64`
4. Завершите установку

### Шаг 2: Обновить пакеты

1. Откройте меню Start → найдите **MSYS2 UCRT64** → запустите
2. В терминале выполните:
   ```bash
   pacman -Syuu --noconfirm
   ```
3. Дождитесь завершения, выберите Restart MSYS if needed
4. После перезагрузки выполните еще раз:
   ```bash
   pacman -Syuu --noconfirm
   ```

### Шаг 3: Установить компиляторы

В MSYS2 UCRT64 терминале:
```bash
pacman -Sy --noconfirm base-devel mingw-w64-ucrt-x86_64-gcc mingw-w64-ucrt-x86_64-gdb mingw-w64-ucrt-x86_64-cmake
```

### Шаг 4: Добавить MSYS2 в PATH (Windows)

1. Откройте **Параметры** → **Система** → **О программе**
2. Нажмите **Дополнительные параметры системы**
3. Нажмите **Переменные среды**
4. В разделе **Переменные среды пользователя** найдите **Path** (или создайте)
5. Нажмите **Изменить** → **Создать** 
6. Добавьте: `C:\msys64\ucrt64\bin`
7. **ВАЖНО:** Переместите эту строку вверх (перед Strawberry, если есть)
8. Нажмите OK на всех диалогах

### Шаг 5: Проверка

Откройте **новый** PowerShell/CMD и выполните:
```powershell
where.exe g++
g++ --version
gcc --version
gdb --version
```

Результаты должны быть из `C:\msys64\ucrt64\bin\`

---

## Проверка установки

### Если всё правильно установлено:

```powershell
PS> where.exe g++
C:\msys64\ucrt64\bin\g++.exe

PS> g++ --version
g++ (GCC) 13.2.0
...

PS> cmake --version
cmake version 3.27.x
...

PS> ninja --version
1.11.x
```

### Если что-то не так:

```powershell
# Обновить PATH в текущем сеансе
$env:PATH = [Environment]::GetEnvironmentVariable("PATH", "Machine")

# Проверить снова
where.exe g++
```

---

## Использование в MultiCode

После установки MSYS2:

1. **Откройте VS Code**
2. **В toolbar редактора выберите стандарт C++** (C++17/20/23)
3. **Нажмите ▶️ Запустить**
4. **Код скомпилируется и запустится с MSYS2 компилятором**

---

## Удаление старого Strawberry (опционально)

Если хотите полностью перейти на MSYS2 и избежать конфликтов:

```powershell
# В системных переменных PATH - удалите:
# - C:\Strawberry\c\bin
# - C:\Strawberry\perl\bin
# - C:\Strawberry\perl\site\bin

# Затем перезагрузите Windows
```

---

## Версии компонентов

**MSYS2 UCRT64** (современный стандарт):
- GCC/G++: **13.2.0+** (вместо 5.x из Strawberry)
- GDB: **14.1+**
- CMake: **3.27+**
- Ninja: **1.11+**

---

## Где найти помощь

📚 **Официальные ресурсы:**
- Сайт: https://www.msys2.org/
- Документация: https://github.com/msys2/msys2/wiki
- Пакеты: https://packages.msys2.org/search

📝 **В MultiCode:**
- `Документы/MSYS2_SETUP.md` - полное описание
- `.vscode/msys2-tasks.json` - VS Code задачи для управления MSYS2

---

## Часто встречаемые ошибки

### Ошибка: "g++: command not found"
**Решение:** Перезагрузите PowerShell/CMD или выполните:
```powershell
$env:PATH = [Environment]::GetEnvironmentVariable("PATH", "Machine")
```

### Ошибка: "Используется старая версия g++ (5.x вместо 13.x)"
**Решение:** Перемещение MSYS2 в PATH **выше** Strawberry:
```powershell
# Проверить порядок
$env:PATH -split ";" | Select-String -Pattern "strawberry|msys64"

# Результат должен быть:
# C:\msys64\ucrt64\bin
# C:\Strawberry\c\bin
# (MSYS2 выше Strawberry)
```

### Ошибка: "CMake не находит компилятор"
**Решение:** Очистить кэш CMake:
```bash
cmake --fresh
```

---

## Автоматические задачи VS Code

После установки в VS Code доступны командами:

```
Ctrl+Shift+P → Tasks: Run Task
```

Доступные задачи:
- 🔄 **Обновить MSYS2** - pacman -Syuu
- 📦 **Установить пакет** - интерактивная установка
- 🔍 **Найти пакет** - поиск в репозитории
- ✅ **Проверить версии** - показать версии компиляторов
- 🛠️ **Запустить MSYS2** - открыть терминал UCRT64

---

## Финализация

После выполнения всех шагов:

1. ✅ Перезагрузите Windows
2. ✅ Закройте VS Code
3. ✅ Откройте VS Code заново
4. ✅ Откройте новый терминал
5. ✅ Проверьте: `where.exe g++`

Готово! 🎉 Теперь MSYS2 компилятор используется по умолчанию вместо Strawberry.

---

**Дата обновления:** 23 февраля 2026
**Версия MSYS2:** 2024-01-14+
**GCC версия:** 13.2.0+
