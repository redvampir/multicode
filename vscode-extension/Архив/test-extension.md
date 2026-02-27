# 🔍 Инструкция по проверке расширения MultiCode

## ✅ Расширение установлено

Версия: **multicode-visual-programming-0.1.0**  
С логированием: **ДА**

---

## 📋 Как проверить

### 1. Перезагрузи VS Code

**Важно!** Расширение загружается при старте VS Code.

```
Ctrl+Shift+P → "Developer: Reload Window"
```

### 2. Открой Developer Tools

```
Ctrl+Shift+P → "Developer: Toggle Developer Tools"
```

Или:

```
Help → Toggle Developer Tools
```

### 3. Проверь логи активации

В консоли Developer Tools должны появиться логи:

```
[MultiCode] ========================================
[MultiCode] Extension ACTIVATION started
[MultiCode] extensionPath: C:\Users\...\.vscode\extensions\multicode-team.multicode-visual-programming-0.1.0
[MultiCode] ========================================
[MultiCode] Registering command: multicode.openEditor
[MultiCode] Registering command: multicode.newGraph
[MultiCode] Registering command: multicode.saveGraph
[MultiCode] Registering command: multicode.loadGraph
[MultiCode] Registering command: multicode.generateCode
[MultiCode] Registering command: multicode.translateGraph
[MultiCode] All commands registered successfully!
```

---

## 🎯 Проверь команду

### Вариант 1: Через Command Palette

1. **Ctrl+Shift+P**
2. Набери: **"МультиКод"** или **"multicode"**
3. Выбери: **"МультиКод: Open Visual Editor"**

### Вариант 2: Проверь список команд

В Developer Tools Console:

```javascript
vscode.commands.getCommands(true).then(cmds => {
  const multicodeCmds = cmds.filter(c => c.startsWith('multicode.'));
  console.log('MultiCode commands:', multicodeCmds);
});
```

---

## 🐛 Если не работает

### Проверь что расширение активировано

1. **Ctrl+Shift+P** → `Developer: Show Running Extensions`
2. Найди **МультиКод - Visual Programming**
3. Статус должен быть: **Activated**

### Проверь Output Channel

1. **View → Output** (Ctrl+Shift+U)
2. В выпадающем списке выбери: **MultiCode**
3. Должны быть логи:

```
[MultiCode] Extension activated!
[MultiCode] Timestamp: 2025-12-14T...
[MultiCode] Extension activation complete!
```

---

## 📊 Диагностика

### Если activate() не вызывается

Проверь [package.json](file:///f:/MultiCode/МультиКод/vscode-extension/package.json):

- `"main": "./dist/extension.js"` ✅
- `activationEvents` содержит `"onCommand:multicode.openEditor"` ✅

### Если dist/extension.js повреждён

```powershell
# Проверь размер
(Get-Item "f:\MultiCode\МультиКод\vscode-extension\dist\extension.js").Length
# Должно быть ~97-98 KB

# Проверь что exports есть
$content = Get-Content "f:\MultiCode\МультиКод\vscode-extension\dist\extension.js" -Raw
$content -match 'module\.exports'
# Должно вернуть True
```

---

## 🚀 Команды для быстрого теста

```powershell
# 1. Reload VS Code window
# Ctrl+Shift+P → "Developer: Reload Window"

# 2. Открой Developer Tools
# Ctrl+Shift+P → "Developer: Toggle Developer Tools"

# 3. В консоли выполни:
# vscode.commands.executeCommand('multicode.openEditor')

# 4. Проверь Output
# View → Output → MultiCode
```

---

## 📝 Ожидаемый результат

После выполнения команды `multicode.openEditor`:

1. **В консоли:**
   ```
   [MultiCode] Command multicode.openEditor executed!
   ```

2. **В Output (MultiCode channel):**
   ```
   [MultiCode] Opening visual editor...
   ```

3. **В UI:**
   - Откроется новая панель **"MultiCode Graph"**
   - С визуальным редактором графов

---

## ⚠️ Известные проблемы

### PowerShell и кириллица

CLI команда `code --install-extension` ломает пути с кириллицей.  
**Решение:** Используй переменную PowerShell `$vsix.FullName` как в скрипте выше.

### Webpack minification

Extension.js уменьшился с 850KB до 97KB — возможна агрессивная tree-shake.  
Если activate() не вызывается — попробуй отключить минификацию:

```javascript
// webpack.config.js
optimization: {
  minimize: false
}
```

---

**Создано:** 14 декабря 2025  
**Автор:** Codex (Автономный Архитектор)
