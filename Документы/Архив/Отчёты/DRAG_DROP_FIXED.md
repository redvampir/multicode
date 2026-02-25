# ✅ Drag & Drop Переменных Исправлен

## Проблема
Узлы Get/Set Variable не перетаскивались из панели переменных на граф.

## Корневая причина
Обработчик `onDrop` в BlueprintEditor проверял только `application/reactflow` (узлы из палитры), а VariableListPanel отправляла данные через `application/variable`.

## Решение (коммит 6322550)

### До (не работало):
```tsx
const onDrop = useCallback((e: React.DragEvent) => {
  const type = e.dataTransfer.getData('application/reactflow');
  if (!type) return;  // ❌ Переменные игнорировались
  // Создание узла...
}, [dependencies]);
```

### После (работает):
```tsx
const onDrop = useCallback((e: React.DragEvent) => {
  e.preventDefault();
  const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
  
  // 1️⃣ Сначала проверяем переменную
  const variableData = e.dataTransfer.getData('application/variable');
  if (variableData) {
    const { variable, nodeType } = JSON.parse(variableData);
    const type = nodeType === 'get' ? 'GetVariable' : 'SetVariable';
    const newNode = createNode(type, position);
    newNode.properties = { variableId: variable.id };  // Привязка к переменной
    // Добавляем узел на граф...
    return;
  }
  
  // 2️⃣ Если не переменная - проверяем узел из палитры
  const nodeType = e.dataTransfer.getData('application/reactflow');
  if (nodeType) {
    // Создание узла из палитры...
  }
}, [dependencies]);
```

## Теперь работает:

✅ **Drag & Drop из палитры** — узлы перетаскиваются как раньше  
✅ **Drag & Drop Get Variable** — кнопка 📤 на переменной  
✅ **Drag & Drop Set Variable** — кнопка 📥 на переменной  
✅ **Клик на кнопки** — Get/Set создаются в дефолтной позиции  
✅ **Dropdown для pointer/class** — работает без черного экрана  

## Как проверить:

1. Открой панель "Переменные" (📊)
2. Создай переменную типа `pointer` или `class`
3. Нажми на кнопку 📤 или 📥 и **перетащи** на граф
4. Узел должен появиться в месте, где отпустил мышь
5. В узле должна быть привязка к переменной через `variableId`

---

**Версия:** 0.4.0  
**Ветка:** feature/pointer-dropdown-selector  
**Коммиты:** 883cc93, 3e1e658, 6322550  

> **Циничный комментарий разработчика:** Теперь всё ДЕЙСТВИТЕЛЬНО восстановлено. Не "вроде бы", а полностью. Drag работает, dropdown работает, панель на месте, черного экрана нет. Промышленный код — это когда ты проверяешь все edge cases, а не надеешься на авось.
