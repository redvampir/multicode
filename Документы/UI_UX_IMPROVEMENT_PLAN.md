# План Улучшения UI/UX — MultiCode Visual Editor

> **Дата создания:** 2025-12-07
> **Статус:** Активный
> **Приоритет:** Критический

---

## 🔍 Диагностика Текущих Проблем

### Критические Проблемы (Блокируют использование)
1. **Русская локализация частично НЕ работает** ❌
   - Палитра узлов (Palette) имеет захардкоженные русские названия без системы переводов
   - Типы узлов (NodeType) в форме не переведены (Start, Function, End, Variable, Custom)
   - Панель перевода (TranslationActions) полностью на русском без локализации
   - Кнопки "Закрыть", "Быстрое добавление" захардкожены

2. **Отсутствует визуальная обратная связь**
   - Нет индикации загрузки при длительных операциях
   - Нет подтверждения действий (кроме toast-уведомлений)
   - Нет анимаций переходов

3. **Недостаточная доступность (Accessibility)**
   - Нет ARIA-labels на критичных элементах
   - Недостаточная контрастность в светлой теме
   - Keyboard navigation частично не работает

### Значительные Проблемы (Снижают UX)
4. **Отсутствует документация в UI**
   - Нет tooltips на кнопках
   - Горячие клавиши не документированы в интерфейсе
   - Нет help/подсказок для новых пользователей

5. **Palette (Quick Add) UX проблемы**
   - Hardcoded названия узлов
   - Нет категоризации узлов (Control Flow, Variables, Functions, etc.)
   - Нет поиска по узлам
   - Нет иконок для типов узлов

6. **Контекстное меню**
   - Нет иконок
   - Не все пункты переведены
   - Нет разделителей между группами действий

### Мелкие Проблемы (Полировка)
7. **Тема и стилизация**
   - Недостаточный контраст в светлой теме
   - Нет плавных анимаций
   - Миникарта не интерактивна (код есть, но UX неочевиден)

8. **Формы**
   - Нет валидации на клиенте
   - Нет автофокуса после создания узла
   - Placeholders могут быть более информативными

---

## 📋 План Работы (Приоритизирован)

### **Фаза 0: Подготовка и Анализ** ⏱ 1 час

#### 0.1. Аудит текущей локализации
- [ ] Пройтись по всем компонентам и собрать список hardcoded строк
- [ ] Создать чек-лист недостающих TranslationKey в `translations.ts`
- [ ] Документировать, где локализация НЕ применяется

**Критерий приемки:** Полный список hardcoded строк с указанием файла и строки

---

### **Фаза 1: Исправление Локализации** 🔥 КРИТИЧНО ⏱ 4 часа

#### 1.1. Расширение словаря переводов
**Файл:** `vscode-extension/src/shared/translations.ts`

Добавить недостающие ключи:
```typescript
// Типы узлов
'nodeType.Start': 'Начало' / 'Start'
'nodeType.End': 'Конец' / 'End'
'nodeType.Function': 'Функция' / 'Function'
'nodeType.Variable': 'Переменная' / 'Variable'
'nodeType.Custom': 'Пользовательский' / 'Custom'

// Палитра узлов
'palette.title': 'Быстрое добавление' / 'Quick Add'
'palette.hint': '(A / двойной клик)' / '(A / double-click)'
'palette.close': 'Закрыть' / 'Close'
'palette.node.function': 'Функция' / 'Function'
'palette.node.branch': 'Ветвление' / 'Branch'
'palette.node.switch': 'Переключатель' / 'Switch'
'palette.node.sequence': 'Последовательность' / 'Sequence'
'palette.node.variable': 'Переменная' / 'Variable'
'palette.node.comment': 'Комментарий' / 'Comment'

// Панель перевода
'translation.title': 'Перевод графа' / 'Graph Translation'
'translation.direction': 'Направление' / 'Direction'
'translation.translate': 'Перевести' / 'Translate'
'translation.translating': 'Перевод...' / 'Translating...'

// Миникарта
'minimap.alt': 'Миникарта' / 'Minimap'

// Tooltips (новые)
'tooltip.newGraph': 'Создать новый граф' / 'Create new graph'
'tooltip.loadGraph': 'Загрузить граф из файла' / 'Load graph from file'
'tooltip.saveGraph': 'Сохранить граф в файл' / 'Save graph to file'
'tooltip.validateGraph': 'Проверить граф на ошибки' / 'Validate graph'
'tooltip.generateCode': 'Сгенерировать код из графа' / 'Generate code from graph'
'tooltip.calculateLayout': 'Пересчитать расположение узлов' / 'Recalculate node layout'
```

**Критерий приемки:**
- [ ] Все строки добавлены в translations.ts
- [ ] Проверено: en и ru варианты присутствуют

---

#### 1.2. Исправление Palette (GraphEditor.tsx:1202-1273)
**Файл:** `vscode-extension/src/webview/GraphEditor.tsx`

**Было (строки 1206-1212):**
```typescript
const items = [
  { key: 'function', label: 'Функция', type: 'Function', presetLabel: 'Функция' },
  { key: 'branch', label: 'Ветвление', type: 'Custom', presetLabel: 'Branch / Ветвление' },
  ...
];
```

**Станет:**
```typescript
const items: Array<{ key: string; translationKey: TranslationKey; type: GraphNodeType; presetLabel: string }> = [
  { key: 'function', translationKey: 'palette.node.function', type: 'Function', presetLabel: translate('palette.node.function', 'Функция') },
  { key: 'branch', translationKey: 'palette.node.branch', type: 'Custom', presetLabel: translate('palette.node.branch', 'Ветвление') },
  { key: 'switch', translationKey: 'palette.node.switch', type: 'Custom', presetLabel: translate('palette.node.switch', 'Переключатель') },
  { key: 'sequence', translationKey: 'palette.node.sequence', type: 'Custom', presetLabel: translate('palette.node.sequence', 'Последовательность') },
  { key: 'variable', translationKey: 'palette.node.variable', type: 'Variable', presetLabel: translate('palette.node.variable', 'Переменная') },
  { key: 'comment', translationKey: 'palette.node.comment', type: 'Custom', presetLabel: translate('palette.node.comment', 'Комментарий') }
];

// Рендер
{items.map((item) => (
  <button key={item.key} ...>
    {translate(item.translationKey, item.presetLabel)}
  </button>
))}
```

**Изменения:**
- Строка 1239: `{translate('palette.title', 'Быстрое добавление')} {translate('palette.hint', '(A / двойной клик)')}`
- Строка 1255: `{translate(item.translationKey, item.presetLabel)}`
- Строка 1269: `{translate('palette.close', 'Закрыть')}`

**Критерий приемки:**
- [ ] Palette полностью переведена
- [ ] При смене языка (RU ↔ EN) названия узлов меняются мгновенно
- [ ] Нет захардкоженных строк

---

#### 1.3. Исправление NodeType селектора (main.tsx:297, 396-401)
**Файл:** `vscode-extension/src/webview/main.tsx`

**Было:**
```typescript
const nodeTypeOptions: GraphNodeType[] = ['Start', 'Function', 'End', 'Variable', 'Custom'];

// Рендер:
<select value={type} onChange={...}>
  {nodeTypeOptions.map((option) => (
    <option key={option} value={option}>{option}</option>
  ))}
</select>
```

**Станет:**
```typescript
// Переместить в компонент NodeActions, чтобы иметь доступ к translate
const getNodeTypeLabel = (type: GraphNodeType, locale: Locale): string => {
  return getTranslation(locale, `nodeType.${type}` as TranslationKey, {}, type);
};

// Рендер:
<select value={type} onChange={...}>
  {nodeTypeOptions.map((option) => (
    <option key={option} value={option}>
      {getNodeTypeLabel(option, locale)}
    </option>
  ))}
</select>
```

**Критерий приемки:**
- [ ] Типы узлов переведены
- [ ] При смене языка select обновляется
- [ ] Value остается английским (Start, Function, etc.) для совместимости

---

#### 1.4. Исправление TranslationActions (main.tsx:447-474)
**Файл:** `vscode-extension/src/webview/main.tsx`

**Было:**
```typescript
<div className="panel-title">Перевод графа</div>
<div className="panel-label">Направление</div>
<button ...>{pending ? 'Перевод...' : 'Перевести'}</button>
```

**Станет:**
```typescript
const TranslationActions: React.FC<TranslationActionsProps & {
  translate: (key: TranslationKey, fallback: string) => string;
}> = ({ direction, pending, onDirectionChange, onTranslate, translate }) => (
  <div className="panel">
    <div className="panel-title">{translate('translation.title', 'Перевод графа')}</div>
    <div className="panel-grid">
      <label>
        <div className="panel-label">{translate('translation.direction', 'Направление')}</div>
        ...
      </label>
      <button type="button" className="panel-action" onClick={onTranslate} disabled={pending}>
        {pending
          ? translate('translation.translating', 'Перевод...')
          : translate('translation.translate', 'Перевести')
        }
      </button>
    </div>
  </div>
);
```

**Критерий приемки:**
- [ ] TranslationActions полностью локализована
- [ ] Передан prop `translate` из родительского компонента

---

### **Фаза 2: Tooltips и Документация в UI** ⏱ 3 часа

#### 2.1. Добавление Tooltips на кнопки Toolbar
**Файл:** `vscode-extension/src/webview/main.tsx` (Toolbar component)

**Реализация:**
```typescript
// Добавить CSS для tooltip
// vscode-extension/webview/styles.css
.tooltip-wrapper {
  position: relative;
  display: inline-block;
}

.tooltip-wrapper:hover::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: var(--mc-surface-strong);
  color: var(--mc-body-text);
  padding: 6px 10px;
  border-radius: 6px;
  white-space: nowrap;
  font-size: 12px;
  pointer-events: none;
  box-shadow: var(--mc-shadow);
  z-index: 10;
}

// В Toolbar:
<button
  onClick={() => send('requestNewGraph')}
  disabled={pending}
  title={translate('tooltip.newGraph', 'Создать новый граф')}
  data-tooltip={translate('tooltip.newGraph', 'Создать новый граф')}
  className="tooltip-wrapper"
>
  {translate('toolbar.newGraph', 'Новый граф')}
</button>
```

**Критерий приемки:**
- [ ] Все кнопки Toolbar имеют tooltips
- [ ] Tooltips переведены (RU/EN)
- [ ] Показываются при hover (desktop)
- [ ] Не мешают на touch-устройствах

---

#### 2.2. Документация горячих клавиш в UI
**Новый компонент:** `HotkeysHelp.tsx`

```typescript
const HotkeysHelp: React.FC<{ isOpen: boolean; onClose: () => void; translate: ... }> = ({
  isOpen,
  onClose,
  translate
}) => {
  if (!isOpen) return null;

  const hotkeys = [
    { key: 'Ctrl+F', action: 'search.placeholder' },
    { key: 'Ctrl+Z', action: 'Отменить' },
    { key: 'Ctrl+Shift+Z', action: 'Повторить' },
    { key: 'Ctrl+C', action: 'context.copy' },
    { key: 'Ctrl+V', action: 'context.paste' },
    { key: 'Ctrl+D', action: 'context.duplicate' },
    { key: 'Delete', action: 'context.delete' },
    { key: 'A', action: 'Открыть палитру' },
    { key: 'C (2 узла)', action: 'Соединить узлы' },
    { key: 'Ctrl+L', action: 'Пересчитать layout' }
  ];

  return (
    <div className="hotkeys-overlay" onClick={onClose}>
      <div className="hotkeys-panel" onClick={(e) => e.stopPropagation()}>
        <h3>Горячие клавиши</h3>
        <table>
          {hotkeys.map((hk) => (
            <tr key={hk.key}>
              <td><kbd>{hk.key}</kbd></td>
              <td>{hk.action}</td>
            </tr>
          ))}
        </table>
        <button onClick={onClose}>Закрыть</button>
      </div>
    </div>
  );
};
```

**Критерий приемки:**
- [ ] Панель горячих клавиш доступна через `?` или кнопку в Toolbar
- [ ] Все горячие клавиши задокументированы
- [ ] Локализовано

---

### **Фаза 3: Улучшение Palette** ⏱ 4 часа

#### 3.1. Категоризация узлов
**Файл:** `vscode-extension/src/webview/GraphEditor.tsx`

**Структура:**
```typescript
type PaletteCategory = 'control' | 'data' | 'function' | 'comment';

const paletteItems: Record<PaletteCategory, Array<{
  key: string;
  translationKey: TranslationKey;
  type: GraphNodeType;
  icon?: string; // Опционально
}>> = {
  control: [
    { key: 'start', translationKey: 'palette.node.start', type: 'Start' },
    { key: 'end', translationKey: 'palette.node.end', type: 'End' },
    { key: 'branch', translationKey: 'palette.node.branch', type: 'Custom' },
    { key: 'switch', translationKey: 'palette.node.switch', type: 'Custom' }
  ],
  data: [
    { key: 'variable', translationKey: 'palette.node.variable', type: 'Variable' }
  ],
  function: [
    { key: 'function', translationKey: 'palette.node.function', type: 'Function' },
    { key: 'sequence', translationKey: 'palette.node.sequence', type: 'Custom' }
  ],
  comment: [
    { key: 'comment', translationKey: 'palette.node.comment', type: 'Custom' }
  ]
};

// Рендер с категориями:
<div className="palette-categories">
  {Object.entries(paletteItems).map(([category, items]) => (
    <div key={category} className="palette-category">
      <div className="palette-category-title">
        {translate(`palette.category.${category}`, category)}
      </div>
      {items.map((item) => (
        <button key={item.key} ...>
          {translate(item.translationKey, item.key)}
        </button>
      ))}
    </div>
  ))}
</div>
```

**Новые TranslationKeys:**
```typescript
'palette.category.control': 'Управление потоком' / 'Control Flow'
'palette.category.data': 'Данные' / 'Data'
'palette.category.function': 'Функции' / 'Functions'
'palette.category.comment': 'Комментарии' / 'Comments'
```

**Критерий приемки:**
- [ ] Узлы разбиты на категории
- [ ] Категории переведены
- [ ] Визуально разделены (группы)

---

#### 3.2. Поиск по палитре
**Новое состояние в GraphEditor:**
```typescript
const [paletteSearchQuery, setPaletteSearchQuery] = useState('');

// В renderPalette():
<input
  type="text"
  value={paletteSearchQuery}
  onChange={(e) => setPaletteSearchQuery(e.target.value)}
  placeholder={translate('palette.search', 'Поиск узлов...')}
  className="palette-search"
/>

// Фильтрация:
const filteredItems = items.filter((item) =>
  translate(item.translationKey, '').toLowerCase().includes(paletteSearchQuery.toLowerCase())
);
```

**Критерий приемки:**
- [ ] Поле поиска в палитре
- [ ] Фильтрация работает в реальном времени
- [ ] Поиск работает по переведенным названиям

---

### **Фаза 4: Визуальная Обратная Связь** ⏱ 3 часа

#### 4.1. Индикация загрузки
**Файл:** `vscode-extension/src/webview/main.tsx`

**Глобальный спиннер:**
```typescript
const [isLoading, setIsLoading] = useState(false);

// При запросах:
const send = (type: ...) => {
  setIsLoading(true);
  setPending(true);
  sendToExtension({ type });
  setTimeout(() => {
    setPending(false);
    setIsLoading(false);
  }, 200);
};

// Рендер:
{isLoading && (
  <div className="loading-overlay">
    <div className="spinner"></div>
  </div>
)}
```

**CSS:**
```css
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--mc-surface-border);
  border-top-color: var(--mc-panel-title);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

**Критерий приемки:**
- [ ] Спиннер показывается при длительных операциях
- [ ] Не блокирует весь UI (можно отменить)
- [ ] Плавная анимация

---

#### 4.2. Анимации переходов
**CSS transitions:**
```css
.panel, .toolbar, .toast {
  transition: all 0.2s ease-out;
}

.palette {
  animation: fadeInScale 0.15s ease-out;
}

@keyframes fadeInScale {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.context-menu {
  animation: fadeIn 0.12s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

**Критерий приемки:**
- [ ] Плавные переходы при открытии palette
- [ ] Плавное появление context menu
- [ ] Анимации не замедляют UI

---

### **Фаза 5: Accessibility (A11y)** ⏱ 3 часа

#### 5.1. ARIA labels и roles
**Файл:** Все компоненты

**Изменения:**
```typescript
// Toolbar
<button
  onClick={...}
  aria-label={translate('tooltip.newGraph', 'Создать новый граф')}
  role="button"
>
  {translate('toolbar.newGraph', 'Новый граф')}
</button>

// GraphEditor (canvas)
<div
  className="graph-canvas"
  ref={containerRef}
  role="application"
  aria-label={translate('graph.canvas', 'Редактор графа')}
  tabIndex={0}
/>

// Context menu
<div className="context-menu" role="menu" aria-label={translate('context.menu', 'Контекстное меню')}>
  <button role="menuitem" ...>...</button>
</div>

// Palette
<div className="palette" role="dialog" aria-label={translate('palette.title', 'Быстрое добавление узлов')}>
  ...
</div>
```

**Критерий приемки:**
- [ ] Все интерактивные элементы имеют aria-label
- [ ] role указан корректно
- [ ] Screen reader тестирование пройдено (NVDA/JAWS)

---

#### 5.2. Контрастность
**Файл:** `vscode-extension/src/webview/theme.ts`

**Проверка через WCAG 2.1 AAA:**
- Минимальный контраст 7:1 для обычного текста
- Минимальный контраст 4.5:1 для крупного текста

**Исправление lightTokens:**
```typescript
// Было:
nodes: {
  textColor: '#0f172a',
  textOutline: '#f8fafc',
  ...
},

// Проверить контраст:
// Фон: #e2e8f0, Текст: #0f172a -> Контраст: ~10:1 ✅
// Если недостаточно, затемнить textColor

// Edges:
edges: {
  labelColor: '#0f172a', // Проверить на фоне labelBackground
  ...
}
```

**Критерий приемки:**
- [ ] Все комбинации цвет/фон проходят WCAG AAA (7:1)
- [ ] Проверено через WebAIM Contrast Checker
- [ ] Тестирование с Color Blindness Simulator

---

#### 5.3. Keyboard Navigation
**Файл:** `vscode-extension/src/webview/GraphEditor.tsx`

**Улучшения:**
```typescript
// Добавить Tab navigation для palette
const handlePaletteKeyDown = (event: React.KeyboardEvent): void => {
  if (event.key === 'Tab') {
    // Управление фокусом внутри palette
  }
  if (event.key === 'Escape') {
    closePalette();
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    // Навигация по пунктам
  }
};

// В palette:
<div
  className="palette"
  onKeyDown={handlePaletteKeyDown}
  tabIndex={0}
  role="dialog"
  aria-modal="true"
>
  ...
</div>
```

**Критерий приемки:**
- [ ] Tab навигация работает во всех панелях
- [ ] Escape закрывает модальные окна
- [ ] Стрелки перемещают фокус в списках
- [ ] Все действия доступны с клавиатуры

---

### **Фаза 6: Полировка и Рефакторинг** ⏱ 2 часа

#### 6.1. Контекстное меню — иконки и разделители
**Файл:** `vscode-extension/src/webview/GraphEditor.tsx`

```typescript
const items: Array<{
  key: string;
  label: string;
  action: () => void;
  icon?: string; // Unicode или emoji
  hidden?: boolean;
  disabled?: boolean;
  separator?: boolean; // Разделитель после пункта
}> = [
  {
    key: 'copy',
    label: translate('context.copy', 'Копировать'),
    icon: '📋',
    action: handleCopyContext,
    hidden: !hasSelection
  },
  {
    key: 'duplicate',
    label: translate('context.duplicate', 'Дублировать'),
    icon: '📑',
    action: handleDuplicateContext,
    hidden: !hasSelection,
    separator: true // После дублирования - разделитель
  },
  {
    key: 'paste',
    label: translate('context.paste', 'Вставить'),
    icon: '📄',
    action: handlePasteContext,
    hidden: !hasClipboard,
    disabled: !hasClipboard
  },
  ...
];

// Рендер:
{items.filter((item) => !item.hidden).map((item, index) => (
  <React.Fragment key={item.key}>
    <button
      type="button"
      onClick={item.action}
      className="context-menu__item"
      disabled={item.disabled}
      aria-label={item.label}
    >
      {item.icon && <span className="context-menu__icon">{item.icon}</span>}
      <span>{item.label}</span>
    </button>
    {item.separator && <div className="context-menu__separator" />}
  </React.Fragment>
))}
```

**Критерий приемки:**
- [ ] Иконки на пунктах меню
- [ ] Разделители между группами
- [ ] Визуально лучше организовано

---

#### 6.2. Улучшение Minimap UX
**Файл:** `vscode-extension/src/webview/GraphEditor.tsx` (строки 1349-1396)

**Изменения:**
```typescript
// Добавить видимый viewport indicator
const renderMiniMap = (): React.ReactNode => {
  if (!miniMap.src) {
    return null;
  }

  const cy = cyRef.current;
  const viewport = cy ? cy.extent() : null;

  return (
    <div
      ref={miniMapRef}
      className="minimap"
      style={{ ... }}
      onClick={...}
      role="img"
      aria-label={translate('minimap.alt', 'Миникарта')}
    >
      <img src={miniMap.src} alt={translate('minimap.alt', 'Миникарта')} ... />
      {viewport && (
        <div
          className="minimap-viewport"
          style={{
            position: 'absolute',
            border: '2px solid var(--mc-panel-title)',
            borderRadius: 4,
            pointerEvents: 'none',
            // Рассчитать положение viewport относительно bbox
            ...calculateViewportRect(viewport, miniMap.bbox)
          }}
        />
      )}
    </div>
  );
};
```

**Критерий приемки:**
- [ ] Миникарта показывает текущий viewport (голубая рамка)
- [ ] Клик по миникарте переносит viewport (уже работает)
- [ ] Есть aria-label

---

#### 6.3. Валидация форм на клиенте
**Файл:** `vscode-extension/src/webview/main.tsx` (NodeActions)

```typescript
const [errors, setErrors] = useState<Record<string, string>>({});

const validateLabel = (value: string): string | null => {
  if (!value.trim()) {
    return 'Имя узла не может быть пустым';
  }
  if (value.length > 50) {
    return 'Максимум 50 символов';
  }
  return null;
};

const handleAddNode = (event: React.FormEvent): void => {
  event.preventDefault();

  const labelError = validateLabel(label);
  if (labelError) {
    setErrors({ label: labelError });
    return;
  }

  setErrors({});
  onAddNode({ label, nodeType: type });
};

// Рендер:
<input
  type="text"
  value={label}
  onChange={(e) => {
    setLabel(e.target.value);
    setErrors({ ...errors, label: '' }); // Сброс ошибки при вводе
  }}
  className={errors.label ? 'input-error' : ''}
  aria-invalid={!!errors.label}
  aria-describedby={errors.label ? 'label-error' : undefined}
/>
{errors.label && (
  <div id="label-error" className="field-error" role="alert">
    {errors.label}
  </div>
)}
```

**Критерий приемки:**
- [ ] Валидация полей на клиенте
- [ ] Сообщения об ошибках локализованы
- [ ] Нет submit при невалидных данных

---

### **Фаза 7: Тестирование и Документация** ⏱ 2 часа

#### 7.1. Ручное тестирование
**Чек-лист:**
- [ ] Переключение RU ↔ EN: все элементы меняют язык
- [ ] Tooltips показываются при hover
- [ ] Горячие клавиши работают
- [ ] Palette категоризирована, поиск работает
- [ ] Контекстное меню переведено, есть иконки
- [ ] Загрузка индицируется спиннером
- [ ] Анимации плавные, не тормозят
- [ ] Миникарта интерактивна
- [ ] Валидация форм работает
- [ ] Keyboard navigation доступна
- [ ] Screen reader тестирование (NVDA)
- [ ] Контрастность WCAG AAA
- [ ] Работает в светлой и темной темах

---

#### 7.2. Обновление документации
**Файл:** `vscode-extension/README.md`

Добавить секцию:
```markdown
## UI/UX Особенности

### Локализация
Расширение поддерживает два языка:
- Русский (RU) — по умолчанию
- Английский (EN)

Переключение: Toolbar → Селектор "Язык интерфейса"

### Горячие клавиши
| Клавиша | Действие |
|---------|----------|
| `Ctrl+F` | Поиск по графу |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Отменить / Повторить |
| `Ctrl+C` / `Ctrl+V` / `Ctrl+D` | Копировать / Вставить / Дублировать |
| `Delete` / `Backspace` | Удалить выбранные узлы/связи |
| `A` | Открыть палитру быстрого добавления |
| `C` (при выделении 2 узлов) | Соединить узлы |
| `Ctrl+L` | Пересчитать layout |
| `Esc` | Сбросить выделение / Закрыть палитру |
| `?` | Показать справку по горячим клавишам |

### Accessibility
- Полная поддержка keyboard navigation
- ARIA labels для screen readers
- WCAG 2.1 AAA контрастность
- Tooltips на всех кнопках
```

**Критерий приемки:**
- [ ] README.md обновлён
- [ ] Документированы все горячие клавиши
- [ ] Описаны accessibility features

---

## 🎯 Критерии Приемки Всего Плана

### Must Have (Обязательно)
- [ ] **Локализация работает на 100%**: все строки переведены, нет hardcoded текста
- [ ] **Переключение RU ↔ EN мгновенное**: все элементы UI обновляются
- [ ] **Tooltips на всех кнопках**
- [ ] **Горячие клавиши задокументированы** (в UI или по `?`)
- [ ] **Индикация загрузки** при длительных операциях
- [ ] **Accessibility базовый**: ARIA labels, keyboard navigation, контрастность

### Should Have (Желательно)
- [ ] **Palette категоризирована** и имеет поиск
- [ ] **Context menu с иконками** и разделителями
- [ ] **Анимации переходов** (плавные, не тормозят)
- [ ] **Minimap с viewport indicator**
- [ ] **Валидация форм на клиенте**

### Nice to Have (Бонус)
- [ ] **Иконки для типов узлов** в Palette
- [ ] **Drag & drop визуальные подсказки**
- [ ] **Onboarding для новых пользователей** (welcome screen)

---

## 📊 Оценка Трудозатрат

| Фаза | Часы | Приоритет |
|------|------|-----------|
| Фаза 0: Аудит | 1 | 🔴 Критично |
| Фаза 1: Локализация | 4 | 🔴 Критично |
| Фаза 2: Tooltips | 3 | 🟠 Высокий |
| Фаза 3: Palette | 4 | 🟡 Средний |
| Фаза 4: Обратная связь | 3 | 🟠 Высокий |
| Фаза 5: Accessibility | 3 | 🟠 Высокий |
| Фаза 6: Полировка | 2 | 🟡 Средний |
| Фаза 7: Тестирование | 2 | 🔴 Критично |
| **ИТОГО** | **22 часа** | - |

---

## 🚀 Порядок Выполнения

### Sprint 1 (Критичные проблемы) — 8 часов
1. Фаза 0: Аудит (1ч)
2. Фаза 1: Локализация (4ч)
3. Фаза 2: Tooltips (3ч)

**Результат:** Локализация работает, все кнопки понятны

### Sprint 2 (UX улучшения) — 10 часов
4. Фаза 4: Обратная связь (3ч)
5. Фаза 5: Accessibility (3ч)
6. Фаза 3: Palette (4ч)

**Результат:** UI отзывчивый, доступный, palette удобная

### Sprint 3 (Полировка) — 4 часа
7. Фаза 6: Полировка (2ч)
8. Фаза 7: Тестирование (2ч)

**Результат:** Production-ready UI/UX

---

## 📝 Дополнительные Замечания

### Технический долг
- **WebviewImprovementPlan.md уже существует** — объединить планы после завершения
- **translations.ts** станет большим файлом — возможно, разбить на модули (`translations/toolbar.ts`, `translations/palette.ts`, etc.)
- **CSS** нужно организовать: сейчас inline styles + глобальные стили — рассмотреть CSS Modules или styled-components

### Риски
1. **Увеличение бандла:** Добавление анимаций/иконок может увеличить размер webview
   - **Митигация:** Lazy load для HotkeysHelp, минификация CSS
2. **Регрессии:** Изменения в GraphEditor.tsx могут сломать существующий функционал
   - **Митигация:** Тесты (Vitest) обязательны после Фазы 1
3. **Производительность:** Анимации могут тормозить на больших графах
   - **Митигация:** Тестировать на графах 100+ узлов, отключать анимации при количестве узлов > 200

---

## ✅ Чек-Лист Перед Коммитом

После каждой фазы:
- [ ] Код компилируется (`npm run compile`)
- [ ] Линтер чист (`npm run lint`)
- [ ] Webview собирается (`npm run package`)
- [ ] Ручное тестирование в VS Code
- [ ] Проверка RU/EN переключения
- [ ] Проверка светлой/темной темы
- [ ] Нет console.error в DevTools
- [ ] README.md обновлён (если нужно)

---

**Конец плана. Время начать работу.**
