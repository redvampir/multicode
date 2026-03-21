# Установка MultiCode в Cursor

> **MultiCode полностью совместим с Cursor**, так как Cursor построен на базе VS Code и использует тот же API расширений.

---

## Быстрая установка

### Способ 1: Установка из VSIX файла (рекомендуется)

1. **Соберите расширение** (если ещё не собрано):
   ```bash
   cd vscode-extension
   npm install
   npm run compile
   npm run vsix:no-deps
   ```

2. **Установите в Cursor:**
   - Откройте Cursor
   - Нажмите `Ctrl+Shift+X` (или `Cmd+Shift+X` на Mac) для открытия панели расширений
   - Нажмите на `...` (три точки) в правом верхнем углу панели расширений
   - Выберите **"Install from VSIX..."**
   - Укажите путь к файлу `multicode-visual-programming-<version>.vsix` (для текущего релиза: `multicode-visual-programming-0.4.1.vsix`)

3. **Перезапустите Cursor** (если потребуется)

### Способ 2: Установка из исходников (для разработки)

1. **Клонируйте репозиторий:**
   ```bash
   git clone https://github.com/redvampir/multicode.git
   cd multicode/vscode-extension
   ```

2. **Установите зависимости:**
   ```bash
   npm install
   ```

3. **Соберите расширение:**
   ```bash
   npm run compile
   ```

4. **Откройте проект в Cursor:**
   - Откройте папку `vscode-extension` в Cursor
   - Нажмите `F5` для запуска Extension Development Host
   - В новом окне Cursor будет доступно расширение

---

## Проверка установки

После установки проверьте:

1. **Команды доступны:**
   - Нажмите `Ctrl+Shift+P` (или `Cmd+Shift+P` на Mac)
   - Введите "MultiCode" — должны появиться команды:
     - `MultiCode: Open Visual Editor`
     - `MultiCode: Generate Code`
     - `MultiCode: New Graph`
     - и другие

2. **Горячие клавиши работают:**
   - `Ctrl+Shift+V` — открыть визуальный редактор
   - `Ctrl+Shift+G` — сгенерировать код

3. **Откройте редактор:**
   - Создайте или откройте файл `.cpp` или `.rs`
   - Нажмите `Ctrl+Shift+V` или выполните команду `MultiCode: Open Visual Editor`
   - Должен открыться Blueprint-редактор

---

## Совместимость

### ✅ Полностью совместимо

MultiCode использует стандартный VS Code API, который полностью поддерживается в Cursor:

- ✅ **Webview API** — React Flow редактор работает
- ✅ **Commands API** — все команды доступны
- ✅ **File System API** — сохранение/загрузка графов
- ✅ **Configuration API** — настройки расширения
- ✅ **IPC (postMessage)** — коммуникация между extension и webview

### 🔧 Настройки

Все настройки из VS Code работают в Cursor:

- `multicode.language` — целевой язык (`cpp`, `ue`, `rust`, `asm`)
- `multicode.displayLanguage` — язык интерфейса (ru, en)
- `multicode.theme` — тема редактора (dark, light, auto)
- `multicode.translation.engine` — движок перевода (none, marian)

---

## Отладка в Cursor

### Запуск Extension Development Host

1. Откройте папку `vscode-extension` в Cursor
2. Нажмите `F5` или выберите **Run > Start Debugging**
3. Откроется новое окно Cursor с установленным расширением
4. В исходном окне будет доступна консоль отладки

### Просмотр логов

- **Output Channel:** `View > Output` → выберите "MultiCode"
- **Developer Tools:** `Help > Toggle Developer Tools` (для webview)

---

## Известные особенности

### 1. Импорт профиля из VS Code

Если у вас уже установлен MultiCode в VS Code, вы можете импортировать настройки:

1. В Cursor: `Ctrl+Shift+J` → **General > Account** → **VS Code Import**
2. Или вручную скопируйте настройки из VS Code в Cursor

### 2. Расширения работают одинаково

Все функции MultiCode работают в Cursor так же, как в VS Code:
- Blueprint-редактор (React Flow)
- Classic-редактор (Cytoscape)
- Генерация кода
- Локализация RU/EN
- Сохранение/загрузка графов

### 3. AI-функции Cursor

MultiCode не конфликтует с AI-функциями Cursor:
- Можно использовать AI-автодополнение Cursor
- MultiCode работает независимо от AI-функций

---

## Устранение проблем

### Расширение не активируется

1. Проверьте версию Cursor (должна быть >= 1.85.0)
2. Проверьте логи: `View > Output` → "MultiCode"
3. Перезапустите Cursor

### Команды не появляются

1. Убедитесь, что расширение установлено и активировано
2. Проверьте, что открыт файл `.cpp` или `.rs`
3. Попробуйте перезагрузить окно: `Ctrl+R` (или `Cmd+R` на Mac)

### Webview не открывается

1. Проверьте консоль разработчика: `Help > Toggle Developer Tools`
2. Проверьте, что файлы собраны: `npm run compile`
3. Убедитесь, что `dist/webview.js` существует

---

## Поддержка

Если возникли проблемы:

1. Проверьте [README.md](README.md) для общей информации
2. Откройте Issue в репозитории: https://github.com/redvampir/multicode/issues
3. Проверьте логи расширения: `View > Output` → "MultiCode"

---

**Версия:** 1.0  
**Дата:** 2025-12-24  
**Статус:** Полная совместимость с Cursor

