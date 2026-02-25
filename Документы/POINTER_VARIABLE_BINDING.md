# Привязка Указателей к Переменным - Руководство

## 📝 Обзор

Добавлен функционал выбора переменных для привязки узлов `SetVariable` типов **pointer** и **class** через выпадающий список.

## ✨ Что Реализовано

### 1. Dropdown Selector для Pointer/Class

Узлы `SetVariable` с типами `pointer` или `class` теперь показывают выпадающий список для выбора целевой переменной:

```tsx
// Вместо ручного подключения портов:
Переменная → [Set Pointer] → ...

// Теперь можно выбрать из списка:
[Set Pointer]
  ┌─────────────────────┐
  │ Привязка к:         │
  │ ┌─────────────────┐ │
  │ │ ▼ myVar (int32) │ │
  │ │   player (class)│ │
  │ │   data (pointer)│ │
  │ └─────────────────┘ │
  └─────────────────────┘
```

### 2. Динамическое Обновление Списка

- Список переменных обновляется при добавлении/удалении переменных в графе
- Показывает название переменной и тип данных
- Локализация RU/EN для всех строк интерфейса

### 3. Визуализация Pointer Портов

**Сохранена** визуальная дифференциация pointer портов:
- Пунктирная граница (dashed border)
- Стрелки → перед/после имени порта
- Уникальный цвет (#2196F3 - синий)

## 🧪 Как Протестировать

### Шаг 1: Создание Переменных

1. Открой Visual Programming редактор:
   ```
   Ctrl+Shift+P → "MultiCode: Open Visual Graph Editor"
   ```

2. Создай несколько переменных разных типов:
   - В панели **Variables** (справа) нажми **"+ Создать переменную"**
   - Создай:
     - `myPointer` (тип: **pointer**)
     - `myClass` (тип: **class**)
     - `counter` (тип: **int32**)

### Шаг 2: Создание SetVariable Узлов

3. Перетащи переменную `myPointer` на граф, выбери **Set**:
   - Появится узел `Set: myPointer`
   - Внизу узла должен быть dropdown с текстом **"Привязка к:"**

4. Кликни на dropdown:
   - Должен показать список всех переменных:
     ```
     — Не выбрано —
     myPointer (pointer)
     myClass (class)
     counter (int32)
     ```

5. Выбери переменную из списка:
   - Значение должно сохраниться в узле

### Шаг 3: Проверка Локализации

6. Переключи язык на English:
   - В toolbar нажми кнопку **"RU"** → должна смениться на **"EN"**

7. Проверь dropdown:
   - Метка должна измениться на **"Bind to:"**
   - "— Не выбрано —" → **"— None —"**

### Шаг 4: Проверка Обновления Списка

8. Создай новую переменную `newVar` (любой тип)

9. Вернись к dropdown в существующем узле `Set`:
   - Список должен обновиться и включать `newVar`

10. Удали переменную `counter`
    - Список в dropdown должен обновиться (без `counter`)

### Шаг 5: Проверка Сохранения/Загрузки

11. Выбери переменную в dropdown, сохрани граф:
    ```
    Ctrl+S
    ```

12. Перезагрузи расширение:
    ```
    Ctrl+R (Reload Window)
    ```

13. Открой граф снова:
    - Выбранная переменная должна остаться в dropdown

### Шаг 6: Проверка Портов

14. Проверь visualization портов:
    - **Pointer порты** должны иметь:
      - Пунктирную границу (dashed)
      - Стрелки → в имени
      - Синий цвет (#2196F3)
    - **Class порты** должны иметь:
      - Обычную границу
      - Квадратный значок ■
      - Индиго цвет (#3F51B5)

## 🔧 Технические Детали

### Структура Данных

**BlueprintNodeData** (интерфейс узла):
```typescript
interface BlueprintNodeData {
  node: BlueprintNode;
  displayLanguage: 'ru' | 'en';
  onLabelChange?: (nodeId: string, newLabel: string) => void;
  onPropertyChange?: (nodeId: string, property: string, value: unknown) => void;
  availableVariables?: Array<{  // ← Новое поле
    id: string;
    name: string;
    nameRu: string;
    dataType: string;
  }>;
}
```

**Сохранение выбранной переменной:**
```typescript
node.properties.inputValue = selectedVariableId  // ID переменной
```

### Обновление Списка Переменных

Список передаётся через `availableVariables` и обновляется:
1. При создании узла (drag & drop, кнопка в панели)
2. При добавлении/удалении переменных (через `useEffect`)
3. При загрузке графа

### Локализация

**Ключи переводов:**
```typescript
'Привязка к:' → 'Bind to:'
'— Не выбрано —' → '— None —'
```

## 🐛 Known Issues

1. **Production Build OOM** — При сборке production версии (`npm run package`) возникает Out of Memory
   - **Workaround**: Используй dev build (`npm run compile`) для тестирования
   - **Status**: Investigating webpack memory usage

## 📋 Checklist для Code Review

- [x] Dropdown появляется только для pointer/class типов
- [x] Dropdown скрыт когда inputValue порт подключён
- [x] Список переменных обновляется динамически
- [x] Локализация RU/EN работает
- [x] Сохранение/загрузка выбранного значения
- [x] Визуализация pointer портов сохранена
- [x] TypeScript типы полные и корректные
- [x] Нет ошибок компиляции

## 🚀 Следующие Шаги

### 1. Visual Snapping/Magnetizing (Future)
Визуальная "магнетическая привязка" Set узлов к переменным:
- Узел Set "прилипает" визуально сверху к переменной
- Показывает связь линией/индикатором
- Помогает понять структуру графа

### 2. Array Type Editor
Редактор для массивов (динамический список значений)

### 3. Class Type Editor
Специализированный редактор для class типа:
- Поле `typeName` (название класса C++)
- Валидация имени класса

## 📚 Связанные Файлы

### Изменённые Файлы

| Файл | Изменения |
|------|-----------|
| [BlueprintNode.tsx](../vscode-extension/src/webview/nodes/BlueprintNode.tsx) | Dropdown компонент (узел React Flow) |
| [BlueprintEditor.tsx](../vscode-extension/src/webview/BlueprintEditor.tsx) | `getAvailableVariables()`, обновление всех точек создания узлов |
| [blueprintTypes.ts](../vscode-extension/src/shared/blueprintTypes.ts) | `BlueprintNodeData.availableVariables` |

### Связанные Документы

- [AI_AGENTS_GUIDE.md](../AI_AGENTS_GUIDE.md) — Полная архитектура проекта
- [CODING_GUIDELINES.md](../CODING_GUIDELINES.md) — Правила кодирования
- [LOCALIZATION_AUDIT.md](./Архив/Отчёты/LOCALIZATION_AUDIT.md) — Архивный аудит локализации

---

**Версия**: 1.0  
**Дата**: 2025-01-16  
**Статус**: ✅ Реализовано и протестировано  
**Автор**: Codex (Autonomous Architect)
