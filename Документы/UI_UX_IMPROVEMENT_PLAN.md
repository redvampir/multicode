# План Улучшения UI/UX — MultiCode Visual Editor

> **Дата обновления:** 2025-12-24
> **Статус:** Активный
> **Редактор:** React Flow (Blueprint) + Cytoscape (Legacy)

---

## Главное

**MultiCode создаётся для русскоязычной аудитории.**

UI/UX приоритеты:
- **Русские названия узлов как первый класс**: "Начало", "Ветвление", "Цикл For" — не перевод, а основной режим
- **Полная локализация**: все элементы интерфейса на русском
- **Мгновенное переключение RU/EN**: без перезагрузки
- **Русские комментарии**: в генерируемом коде сохраняются русские названия

---

## Текущее состояние

### Реализовано (v0.2)

| Функционал | Blueprint (React Flow) | Classic (Cytoscape) |
|------------|------------------------|---------------------|
| Базовый редактор | ✅ | ✅ |
| Кастомные узлы | ✅ | ⚠️ Ограничено |
| Типизированные порты | ✅ | ❌ |
| Палитра узлов | ✅ С категориями и поиском | ⚠️ Без категорий |
| Drag-to-connect | ✅ С валидацией | ✅ |
| Локализация RU/EN | ✅ | ✅ |
| Автолейаут | ❌ | ✅ (dagre) |
| Миникарта | ❌ | ✅ |
| Undo/Redo | ❌ | ⚠️ Частично |

---

## Приоритет 1: Критические улучшения

### 1.1. Undo/Redo для Blueprint редактора

**Проблема:** В Blueprint редакторе нет отмены действий.

**Решение:** Реализовать Command pattern:

```typescript
// commands/types.ts
interface Command {
  execute(): void;
  undo(): void;
  description: string;
}

// commands/AddNodeCommand.ts
class AddNodeCommand implements Command {
  constructor(private store: BlueprintStore, private node: BlueprintNode) {}
  
  execute() { this.store.addNode(this.node); }
  undo() { this.store.removeNode(this.node.id); }
  description = `Add node: ${this.node.data.label}`;
}

// hooks/useHistory.ts
const useHistory = create<HistoryStore>((set, get) => ({
  past: [],
  future: [],
  execute: (command) => {
    command.execute();
    set({ past: [...get().past, command], future: [] });
  },
  undo: () => {
    const command = get().past.pop();
    if (command) {
      command.undo();
      set({ future: [command, ...get().future] });
    }
  },
  redo: () => {
    const command = get().future.shift();
    if (command) {
      command.execute();
      set({ past: [...get().past, command] });
    }
  }
}));
```

**Трудозатраты:** 4 часа

---

### 1.2. Автолейаут для Blueprint редактора

**Проблема:** Узлы нужно расставлять вручную.

**Решение:** Интегрировать dagre с React Flow:

```typescript
import dagre from 'dagre';

const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 100, ranksep: 150 });
  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((node) => {
    g.setNode(node.id, { width: 200, height: 100 });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    return { ...node, position: { x: pos.x - 100, y: pos.y - 50 } };
  });
};
```

**Трудозатраты:** 2 часа

---

### 1.3. Copy/Paste узлов

**Проблема:** Нельзя копировать узлы.

**Решение:**

```typescript
// В BlueprintEditor.tsx
const [clipboard, setClipboard] = useState<ClipboardData | null>(null);

const handleCopy = useCallback(() => {
  const selectedNodes = nodes.filter((n) => n.selected);
  const selectedEdges = edges.filter((e) => 
    selectedNodes.some((n) => n.id === e.source) &&
    selectedNodes.some((n) => n.id === e.target)
  );
  setClipboard({ nodes: selectedNodes, edges: selectedEdges });
}, [nodes, edges]);

const handlePaste = useCallback(() => {
  if (!clipboard) return;
  
  const offset = { x: 50, y: 50 };
  const idMap = new Map<string, string>();
  
  const newNodes = clipboard.nodes.map((node) => {
    const newId = generateId();
    idMap.set(node.id, newId);
    return {
      ...node,
      id: newId,
      position: { x: node.position.x + offset.x, y: node.position.y + offset.y },
      selected: true,
    };
  });
  
  const newEdges = clipboard.edges.map((edge) => ({
    ...edge,
    id: generateId(),
    source: idMap.get(edge.source)!,
    target: idMap.get(edge.target)!,
  }));
  
  setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...newNodes]);
  setEdges((eds) => [...eds, ...newEdges]);
}, [clipboard]);
```

**Трудозатраты:** 2 часа

---

## Приоритет 2: UX улучшения

### 2.1. Inline редактирование label узла

**Проблема:** Для изменения имени узла нужно открывать форму.

**Решение:** Двойной клик → inline input:

```typescript
// В BlueprintNode.tsx
const [isEditing, setIsEditing] = useState(false);
const [editValue, setEditValue] = useState(data.label);

const handleDoubleClick = () => setIsEditing(true);

const handleBlur = () => {
  setIsEditing(false);
  if (editValue !== data.label) {
    onLabelChange(id, editValue);
  }
};

return (
  <div className="node-header" onDoubleClick={handleDoubleClick}>
    {isEditing ? (
      <input
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => e.key === 'Enter' && handleBlur()}
        autoFocus
      />
    ) : (
      <span>{data.label}</span>
    )}
  </div>
);
```

**Трудозатраты:** 1.5 часа

---

### 2.2. Миникарта для Blueprint редактора

**Проблема:** Сложно навигировать по большим графам.

**Решение:** React Flow имеет встроенный `<MiniMap />`:

```typescript
import { MiniMap } from 'reactflow';

<ReactFlow ...>
  <MiniMap
    nodeColor={(node) => {
      switch (node.data.category) {
        case 'events': return '#ff6b6b';
        case 'control': return '#4ecdc4';
        case 'math': return '#45b7d1';
        default: return '#95a5a6';
      }
    }}
    maskColor="rgba(0, 0, 0, 0.2)"
  />
</ReactFlow>
```

**Трудозатраты:** 0.5 часа

---

### 2.3. Улучшение палитры узлов

**Текущее состояние:** Базовая палитра с категориями и поиском.

**Улучшения:**
- [ ] Иконки для типов узлов
- [ ] Favorites (часто используемые)
- [ ] Recent (недавно добавленные)
- [ ] Drag из палитры на canvas

```typescript
const PaletteItem: React.FC<{ node: NodeTypeDefinition }> = ({ node }) => (
  <div
    className="palette-item"
    draggable
    onDragStart={(e) => {
      e.dataTransfer.setData('application/reactflow', node.type);
      e.dataTransfer.effectAllowed = 'move';
    }}
  >
    <span className="palette-icon">{node.icon}</span>
    <span className="palette-label">{node.label}</span>
  </div>
);
```

**Трудозатраты:** 3 часа

---

### 2.4. Tooltips и документация в UI

**Проблема:** Горячие клавиши не документированы.

**Решение:**

1. **Tooltips на кнопках:**
```typescript
<button
  title={translate('tooltip.newGraph', 'Создать новый граф (Ctrl+N)')}
>
  {translate('toolbar.newGraph', 'Новый граф')}
</button>
```

2. **Панель горячих клавиш (по `?`):**
```typescript
const HotkeysPanel: React.FC = () => (
  <div className="hotkeys-panel">
    <h3>{translate('hotkeys.title', 'Горячие клавиши')}</h3>
    <table>
      <tr><td><kbd>A</kbd></td><td>Открыть палитру</td></tr>
      <tr><td><kbd>Del</kbd></td><td>Удалить</td></tr>
      <tr><td><kbd>Ctrl+Z</kbd></td><td>Отменить</td></tr>
      // ...
    </table>
  </div>
);
```

**Трудозатраты:** 2 часа

---

## Приоритет 3: Стабильность и производительность

### 3.1. Оптимизация больших графов

**Проблема:** При 200+ узлах возможны лаги.

**Решения:**
- React Flow имеет встроенную виртуализацию (включена по умолчанию)
- Отключить анимации при `nodes.length > 100`
- Использовать `nodesDraggable={false}` при перемещении viewport

```typescript
const performanceSettings = useMemo(() => ({
  nodesDraggable: nodes.length < 200,
  nodesConnectable: nodes.length < 500,
  elementsSelectable: true,
}), [nodes.length]);
```

**Трудозатраты:** 1 час

---

### 3.2. Восстановление состояния после перезагрузки

**Проблема:** При перезагрузке VS Code состояние теряется.

**Решение:**

```typescript
// В GraphPanel.ts
private async restoreState() {
  const state = this._panel.webview.state;
  if (state?.graph) {
    this.sendMessage({ type: 'graphLoaded', payload: state.graph });
  }
}

// В webview
useEffect(() => {
  // Сохраняем состояние в webview state
  vscode.setState({ graph: { nodes, edges, viewport } });
}, [nodes, edges, viewport]);
```

**Трудозатраты:** 1 час

---

### 3.3. Обработка ошибок

**Проблема:** Ошибки валидации не отображаются наглядно.

**Решение:**

```typescript
// Подсветка проблемных узлов
const getNodeClassName = (node: BlueprintNode) => {
  if (validationErrors.has(node.id)) {
    return 'node-error';
  }
  return '';
};

// CSS
.node-error {
  border: 2px solid #ff4444;
  animation: pulse-error 1s infinite;
}

@keyframes pulse-error {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 68, 68, 0.4); }
  50% { box-shadow: 0 0 0 8px rgba(255, 68, 68, 0); }
}
```

**Трудозатраты:** 1.5 часа

---

## Приоритет 4: Accessibility (A11y)

### 4.1. ARIA labels

```typescript
<ReactFlow
  aria-label={translate('editor.canvas', 'Редактор графа')}
  role="application"
>
  ...
</ReactFlow>

<button aria-label={translate('toolbar.save', 'Сохранить граф')}>
  💾
</button>
```

### 4.2. Keyboard navigation

- [ ] Tab между узлами
- [ ] Enter для редактирования
- [ ] Arrow keys для перемещения выбранного узла
- [ ] Escape для отмены выделения

### 4.3. Контрастность WCAG AAA

Проверить все цвета через WebAIM Contrast Checker.

**Трудозатраты:** 3 часа

---

## Оценка трудозатрат

| Задача | Часы | Приоритет |
|--------|------|-----------|
| Undo/Redo | 4 | 🔴 Критично |
| Автолейаут | 2 | 🔴 Критично |
| Copy/Paste | 2 | 🔴 Критично |
| Inline редактирование | 1.5 | 🟠 Высокий |
| Миникарта | 0.5 | 🟠 Высокий |
| Улучшение палитры | 3 | 🟡 Средний |
| Tooltips/документация | 2 | 🟡 Средний |
| Оптимизация | 1 | 🟡 Средний |
| Восстановление состояния | 1 | 🟡 Средний |
| Обработка ошибок | 1.5 | 🟡 Средний |
| Accessibility | 3 | 🟢 Низкий |
| **ИТОГО** | **21.5** | - |

---

## Порядок выполнения

### Sprint 1: Core Features (8 часов)
1. Undo/Redo (4ч)
2. Автолейаут (2ч)
3. Copy/Paste (2ч)

**Результат:** Редактор функционально полноценен.

### Sprint 2: UX Polish (7 часов)
4. Миникарта (0.5ч)
5. Inline редактирование (1.5ч)
6. Улучшение палитры (3ч)
7. Tooltips (2ч)

**Результат:** UX на уровне production.

### Sprint 3: Stability (6.5 часов)
8. Оптимизация (1ч)
9. Восстановление состояния (1ч)
10. Обработка ошибок (1.5ч)
11. Accessibility (3ч)

**Результат:** Готов к релизу v1.0.

---

## Устаревшие файлы (для удаления)

После завершения миграции на React Flow:
- `WebviewImprovementPlan.md` — объединён в этот файл
- `GraphEditor.tsx` — заменён на `BlueprintEditor.tsx` (v1.0)

---

## Чек-лист перед коммитом

- [ ] Код компилируется (`npm run compile`)
- [ ] Линтер чист (`npm run lint`)
- [ ] Тесты проходят (`npm test`)
- [ ] Ручное тестирование в VS Code
- [ ] Проверка RU/EN локализации
- [ ] Проверка светлой/тёмной темы
- [ ] Нет console.error в DevTools

---

**Конец плана.**
