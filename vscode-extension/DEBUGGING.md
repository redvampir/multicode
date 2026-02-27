# 🔍 Система отладки и мониторинга MultiCode

## Обзор

В MultiCode встроена **система отладочного логирования в реальном времени**, которая отслеживает все действия пользователя и автоматически записывает их в VS Code Output Channel.

## Как использовать

### 1. Откройте Output Channel "MultiCode"

**В VS Code:**
1. `View` → `Output` (или `Ctrl+Shift+U` / `Cmd+Shift+U`)
2. В выпадающем списке выберите **"MultiCode"**

Теперь вы увидите все логи в реальном времени:
- ℹ️ **INFO** — общая информация
- ▶️ **ACTION** — действия пользователя (создание узлов, переменных, etc.)
- ⚠️ **WARN** — предупреждения
- ❌ **ERROR** — ошибки
- 🔍 **DEBUG** — детальная отладочная информация

### 2. Developer Tools для Webview

**Для глубокой отладки UI:**
1. Откройте MultiCode редактор
2. Нажмите `Ctrl+Shift+I` (Windows/Linux) или `Cmd+Option+I` (Mac)
3. Откроется Chrome DevTools с консолью браузера
4. Все логи также дублируются в консоль с цветовой разметкой

## Что отслеживается

### Webview
- `webview:init` — инициализация webview
- `webview:ipc` — IPC сообщения между webview и extension
- `webview:error` — глобальные ошибки в webview

### Граф
- `graph:change` — изменения графа
- `graph:load` — загрузка графа из файла
- `graph:save` — сохранение графа в файл
- `graph:validate` — валидация графа

### Узлы
- `node:create` — создание узла
- `node:delete` — удаление узла
- `node:update` — обновление узла
- `node:connect` — соединение узлов

### Переменные (✨ NEW)
- `variable:create` — создание переменной
- `variable:update` — изменение переменной
- `variable:delete` — удаление переменной
- `variable:get-node` — создание GetVariable узла
- `variable:set-node` — создание SetVariable узла

### Функции
- `function:create` — создание функции
- `function:update` — изменение функции
- `function:delete` — удаление функции
- `function:switch` — переключение между функциями

### Кодогенерация
- `codegen:start` — начало генерации кода
- `codegen:success` — успешная генерация
- `codegen:error` — ошибка генерации

### Extension
- `extension:activate` — активация расширения
- `extension:command` — выполнение команды
- `extension:error` — ошибка в extension

## Примеры логов

### Создание переменной
```
[2026-01-03T15:30:45.123Z] [ACTION] [variable:create] Variable created: myCounter | {"id":"var-1735911045123","dataType":"int32","defaultValue":0,"category":"default"}
```

### Обновление переменной
```
[2026-01-03T15:31:12.456Z] [ACTION] [variable:update] Variable updated: myCounter | {"id":"var-1735911045123","changes":{"dataType":"int32","defaultValue":10}}
```

### Ошибка
```
[2026-01-03T15:32:00.789Z] [ERROR] [webview:error] Global error: Cannot read property 'id' of undefined | {"filename":"webview.js","lineno":1234,"colno":56}
```

## Экспорт логов

Все логи автоматически накапливаются в памяти (последние 1000 записей).

**Чтобы экспортировать логи:**

1. Откройте Developer Tools (`Ctrl+Shift+I`)
2. В консоли выполните:

```javascript
// Получить все логи в виде JSON
logger.exportLogs()

// Получить логи в текстовом формате
logger.exportLogsAsText()

// Получить только ошибки
logger.getLogsByLevel('error')

// Получить логи по категории
logger.getLogsByCategory('variable:create')

// Очистить логи
logger.clear()
```

3. Скопируйте вывод и отправьте разработчикам для анализа

## Отключение логирования

**Если логи замедляют работу:**

```javascript
// В Developer Tools консоли
logger.disable()  // Отключить логирование
logger.enable()   // Включить обратно
```

## Автоматический перехват ошибок

Система автоматически перехватывает:
- ✅ Глобальные JavaScript ошибки (`window.onerror`)
- ✅ Необработанные promise rejection (`unhandledrejection`)
- ✅ React ErrorBoundary ошибки
- ✅ IPC валидация ошибки (Zod)

Все ошибки автоматически отправляются в Output Channel и отображаются с полным stack trace.

## Горячие клавиши

| Действие | Windows/Linux | Mac |
|----------|---------------|-----|
| Output Panel | `Ctrl+Shift+U` | `Cmd+Shift+U` |
| Developer Tools | `Ctrl+Shift+I` | `Cmd+Option+I` |
| Command Palette | `Ctrl+Shift+P` | `Cmd+Shift+P` |

## Сообщить об ошибке

Если вы нашли баг:

1. **Воспроизведите проблему** с открытым Output Channel
2. **Скопируйте логи** из Output Channel или DevTools
3. **Экспортируйте полные логи** через `logger.exportLogsAsText()`
4. **Создайте issue** на GitHub с:
   - Описанием проблемы
   - Шагами воспроизведения
   - Скопированными логами
   - Скриншотами (если есть)

## Продвинутое использование

### Добавить свои логи (для разработчиков)

```typescript
import { logger, LOG_CATEGORIES } from '../shared/debugLogger';

// Info лог
logger.info('my-category', 'Something happened');

// Action лог с данными
logger.action(LOG_CATEGORIES.NODE_CREATE, 'Node created', { 
  nodeId: 'node-123', 
  type: 'Branch' 
});

// Ошибка с данными
logger.error('my-category', 'Failed to load', { 
  error: err.message 
});
```

### Слушать логи программно

```typescript
// Добавить listener
const unsubscribe = logger.addListener((entry) => {
  if (entry.level === 'error') {
    console.error('Error occurred:', entry);
    // Отправить в аналитику, показать уведомление, etc.
  }
});

// Отписаться
unsubscribe();
```

## FAQ

**Q: Логи замедляют работу?**  
A: Нет, логирование асинхронное и не блокирует UI. Если чувствуете замедление — отключите через `logger.disable()`.

**Q: Где хранятся логи?**  
A: В памяти (последние 1000 записей) и в Output Channel. Файловое логирование не используется.

**Q: Можно ли фильтровать логи?**  
A: Да, используйте `logger.getLogsByCategory('variable:create')` или `logger.getLogsByLevel('error')`.

**Q: Логи отправляются на сервер?**  
A: **Нет!** Все логи остаются локально на вашей машине.

---

**Версия**: 1.0  
**Дата**: 2026-01-03  
**Добавлено в**: MultiCode v0.4.0
