# MultiCode — Wireframe v2

Статус: рабочая концепция / review-ready / implementation-aware
Основа: согласованный next round brief + проверка по текущей UI-реализации

## 1. Допущения

1. Экран ориентирован на desktop-first workflow для визуального редактора графа.
2. Основной сценарий: открыть граф → редактировать → проверить → сгенерировать C++ → запустить.
3. Ширина \~1280 считается важным стресс-тестом для shell, поэтому для каждого состояния указан desktop и 1280 behavior.

### 1.1 Важное ограничение v2

v2 не проектируется с нуля. Wireframe может упрощать shell, но не имеет права терять discoverability для уже реализованных функций.

Правило:

- если control или workflow уходит с первого уровня, он должен оставаться доступен максимум через 1 menu / popover / drawer;
- если сценарий уже реализован и используется в коде, он не считается optional только потому, что его нет на красивом макете;
- secondary placement допустим, удаление без replacement — нет.

### 1.2 Уже реализованные UI-возможности, которые дизайнер обязан учитывать

- Режимы редактора: `Visual / Blueprint`, `Classic / Cytoscape`, `Dependency`.
- Файловый workflow: `New`, `Open`, `Save`, active bound file, список `working files`, bind file через список и через file picker.
- Dependency workflow: выбор source-файла зависимости, attach dependency к активному файлу, отдельный dependency mode и dependency sidebar.
- Global graph actions: `Validate`, `Translate`, `Layout`, `Generate`, `Compile and Run`, `Copy Graph ID`.
- Настройки codegen: profile `clean / learn / debug / recovery`, entrypoint mode `auto / executable / library`, фиксированный `C++23`.
- Canvas utilities: node palette, code preview, package manager, undo/redo, fit, auto-layout, minimap, React Flow controls, context menu.
- Структура сущностей: functions, variables, pointers/references, classes, UE macros.
- Variable/function specifics: импорт переменных из Event Graph в function graph, открытие function graph в отдельном modal editor.
- Pointer/reference flow: attach mode с временным banner-state на canvas.
- UE macro flow: создание, редактирование, specifiers/meta, attach/rebind/detach, временный attach-banner.
- Class system: `embedded / sidecar`, class storage diagnostics, open graph/sidecar, reload/repair, фильтры `All / Issues / Changed`, advanced class nodes feature flag.
- Service UX: help panel, hotkeys panel, UI scale.
- Shell status: class storage badge и class nodes mode badge уже присутствуют как часть верхнего статуса.

### 1.3 Слепые зоны текущего документа и макета

Ниже не “дополнительные пожелания”, а реальные blind spots относительно текущей реализации:

1. В wireframe почти нет места для editor mode switch, хотя режим `Dependency` уже существует как отдельный экранный сценарий.
2. Не описан workflow привязки к исходному файлу: `bound file`, `working files`, bind via picker, переключение активного файла.
3. Не описан dependency workflow: выбор source-файла, attach dependency к активному файлу, sidebar/standalone dependency view.
4. Не описаны codegen profile и entrypoint mode, хотя они уже влияют на результат генерации.
5. Не отражены class storage и class nodes status, хотя это важная часть текущего header/summary.
6. Не отражены временные overlay-состояния на canvas: pointer attach, UE macro attach, normalization/info banners.
7. Не отражён modal function graph editor и факт, что function graph может жить как вложенный editing-flow.
8. Не описаны help/hotkeys/UI scale, хотя это уже часть верхнеуровневого shell.
9. `Packages`, `Generated code` и `Dependencies` в документе есть, но не зафиксировано, что это не только просмотр, а ещё и рабочие панели с действиями.

## 2. Общие правила wireframe v2

### 2.1 Header

```text
[Logo] [test.cpp *  ● Не сохранено] [UE] [RU]         [Save] [Validate] [Generate C++] [Run▼]
```

Правила:

- document status живёт только рядом с именем файла;
- `Generate C++` — primary action;
- `Run` — operational secondary;
- `Save` — quiet/secondary;
- `Validate` — quiet, но всегда заметный;
- никаких graph-local controls в header;
- header держит только core path и compact global controls, но не теряет реализованные file/dependency/codegen/service flows.

### 2.1.1 Mapping для уже реализованных global controls

V2 не обязана держать все текущие controls inline, но обязана сохранить доступность.

Рекомендуемое размещение:

- `File / Files` popover: `New`, `Open`, active bound file, `working files`, bind file, file picker, dependency source file, attach dependency.
- `Mode` menu: `Visual`, `Classic`, `Dependency`.
- `Codegen` menu: profile, entrypoint mode, fixed `C++23` badge/note.
- `View / Help` menu: UI scale, hotkeys, help.

Допустимый compact pattern:

```text
[Logo] [test.cpp * ● Не сохранено] [UE] [RU] [Files▼] [Mode▼] [Codegen▼] [Save] [Validate] [Generate C++] [Run▼] [⋯]
```

Важно:

- `Generate C++`, `Run`, file identity и document status не уезжают в overflow первыми;
- `New/Open` могут жить в `Files▼`, но доступ к ним не должен требовать отдельного экрана;
- current bound file и working files workflow должны оставаться discoverable.

### 2.2 Context bar

```text
[Project / Graph / Event Graph]   [Mode: Graph]   [Codegen: C++]   [Problems: 2/1]
```

Правила:

- тонкая поясняющая строка, не toolbar;
- `Problems` — компактный индикатор, без списка;
- допустим compact chip для текущего bound file / dependency context, но без превращения строки в форму с несколькими selects.

### 2.3 Left sidebar

```text
[Поиск по проекту...]

Graphs                  [+]
Functions               [+]
Variables               [+]
Types & Classes         [+]
Pointers & References   [+]
UE Macros               [+]
```

### 2.4 Canvas toolbar

```text
[+ Add node] [Search] [Undo] [Redo] [Fit] [Auto-layout] [Minimap] [View] [- 100% +]
```

Правила:

- первые 2–3 действия text + icon;
- остальное можно icon-only + tooltip;
- toolbar относится только к текущему graph.

### 2.5 Right inspector state model

- nothing selected -> graph inspector
- node selected -> node inspector
- variable selected -> variable inspector
- function selected -> function inspector
- multi-select -> batch inspector

### 2.6 Bottom panel tabs

```text
[Problems] [Generated code] [Console] [Packages] [Dependencies] [Search]
```

Правила:

- collapsed by default;
- auto-open только по явной причине;
- `Generated code` — это не просто текст, а replacement/current home для code preview workflow;
- `Packages` должны сохранять load/unload package actions;
- `Dependencies` должны поддерживать как обзор, так и рабочие действия, а не быть только read-only вкладкой.

### 2.7 Transient canvas states

Wireframe обязан учитывать краткоживущие состояния, которые уже есть в UI и не должны расползаться в permanent shell.

- Pointer attach mode: временный banner над canvas с инструкцией и отменой.
- UE macro attach mode: временный banner/inline state с allowed targets и отменой.
- Function graph editing: graph tabs и/или modal function editor как отдельный focused flow.
- Normalization/info warnings: компактный toast/banner у canvas, не отдельная постоянная карточка в inspector.

## 3. Визуальное различение типов UI-элементов

### 3.1 Action hierarchy

- `Primary action` — filled blue button (`Generate C++`)
- `Operational action` — filled green or green-tinted button (`Run▼`)
- `Secondary action` — outlined / quiet button (`Save`, `Validate`)
- `Status badge` — compact chip near data (`● Не сохранено`, `Problems: 2/1`)
- `Entity color` — цвет только у node headers, entity icons, palette categories

### 3.2 Problems indicator

Рекомендация:

```text
[Problems: 2/1]
```

где `2` = errors, `1` = warnings.

Альтернатива, если нужен сильнее сканируемый вариант:

```text
[Errors 2] [Warnings 1]
```

Для v2 рекомендую первый вариант как более компактный.

## 4. State 1 — Empty graph

### 4.1 Desktop wireframe

```text
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ [Logo] [test.cpp *  ● Не сохранено] [UE] [RU]               [Save] [Validate] [Generate C++] [Run▼] │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ [Project / Graph / Event Graph]    [Mode: Graph]    [Codegen: C++]    [Problems: 0/0]   │
├───────────────────────┬──────────────────────────────────────────────────┬─────────────────┤
│ [Поиск по проекту...] │ [+ Add node] [Search] [Undo] [Redo] [Fit]       │ Graph Inspector │
│                       │ [Auto-layout] [Minimap] [View] [- 100% +]        │                 │
│ Graphs            [+] │                                                  │ Properties      │
│ - Event Graph         │              EMPTY GRAPH STATE                   │ - Graph name    │
│ - Construction Graph  │                                                  │ - Graph type    │
│                       │        [Добавить первый узел]                    │                 │
│ Functions         [+] │        Быстрые действия:                         │ Layout          │
│ - Пока нет функций    │        [Функция] [Переменная] [Импорт]           │ - Direction     │
│   [Создать функцию]   │                                                  │ - Algorithm     │
│                       │        Hotkeys: Tab — добавить узел              │ - Spacing       │
│ Variables         [+] │                 Ctrl/Cmd+K — поиск               │                 │
│ - Пока нет переменных │                                                  │ Translation     │
│   [Создать переменную]│                                                  │ - RU → EN       │
│                       │                                                  │                 │
│ Types & Classes   [+] │                                                  │ Summary         │
│ Pointers & Ref.   [+] │                                                  │ - Nodes: 0      │
│ UE Macros         [+] │                                                  │ - Links: 0      │
├───────────────────────┴──────────────────────────────────────────────────┴─────────────────┤
│ Bottom panel: collapsed                                                                     │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Inspector content

Потому что ничего не выбрано, справа корректно показывать graph-level настройки.

### 4.3 1280 behavior

- right inspector collapsed by default, открывается по toggle;
- left sidebar narrowed до \~260 px;
- bottom panel hidden/collapsed;
- toolbar оставляет text-label только у `Add node`, `Search`, `Fit`; остальное icon-only;
- `Validate` и `Save` остаются видимыми, но могут стать compact;
- advanced controls (`Files`, `Mode`, `Codegen`, `View`) могут сворачиваться в compact menus, но не исчезать.

### 4.4 Acceptance for this state

- Пользователь сразу понимает, как начать работу.
- Нет ощущения пустого провала без CTA.
- Canvas остаётся главным даже без контента.

## 5. State 2 — Node selected

### 5.1 Desktop wireframe

```text
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ [Logo] [test.cpp *  ● Не сохранено] [UE] [RU]               [Save] [Validate] [Generate C++] [Run▼] │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ [Project / Graph / Event Graph]    [Mode: Graph]    [Codegen: C++]    [Problems: 0/0]   │
├───────────────────────┬──────────────────────────────────────────────────┬─────────────────┤
│ [Поиск по проекту...] │ [+ Add node] [Search] [Undo] [Redo] [Fit]       │ Node Inspector  │
│                       │ [Auto-layout] [Minimap] [View] [- 100% +]        │                 │
│ Graphs            [+] │                                                  │ Identity        │
│ - Event Graph         │   [Start] -> [Новая функция 1] -> [Напечатать]   │ - Name          │
│                       │                          ↘                        │ - Category      │
│ Functions         [+] │                       [Получить: Тест]            │ - Scope         │
│ - Новая функция 1     │                                                  │                 │
│ - Init                │             selected node: Напечатать_статус      │ Pins            │
│ - Tick                │                                                  │ - Exec in/out   │
│                       │                                                  │ - message:String│
│ Variables         [+] │                                                  │                 │
│ - Test: String        │                                                  │ Parameters      │
│ - Count: Int          │                                                  │ - message=Test  │
│                       │                                                  │                 │
│ Types & Classes   [+] │                                                  │ Validation      │
│ Pointers & Ref.   [+] │                                                  │ - OK            │
│ UE Macros         [+] │                                                  │                 │
│                       │                                                  │ Actions         │
│                       │                                                  │ [Duplicate]     │
│                       │                                                  │ [Reveal] [Delete]
├───────────────────────┴──────────────────────────────────────────────────┴─────────────────┤
│ Bottom panel: collapsed                                                                     │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Главное правило

При active node selection справа **не должны доминировать** `Translation`, `Layout`, `Summary` как основной контент.

### 5.3 1280 behavior

- right inspector collapsed by default, но при клике по node может auto-open, если пользователь ещё не закрывал его явно;
- bottom panel скрыт;
- toolbar: `Minimap`, `View`, zoom могут стать icon-only;
- если header тесный, `Save` становится icon+tooltip или compact label;
- если открыт function graph modal, nested canvas не должен ломать навигацию и toolbar priority.

### 5.4 Acceptance for this state

- Right panel truly contextual.
- Пользователь видит свойства выбранного node без поиска по экрану.
- Graph-level настройки не мешают текущему действию.

## 6. State 3 — Problems opened

### 6.1 Desktop wireframe

```text
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ [Logo] [test.cpp *  ● Не сохранено] [UE] [RU]               [Save] [Validate] [Generate C++] [Run▼] │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ [Project / Graph / Event Graph]    [Mode: Graph]    [Codegen: C++]    [Problems: 2/1]   │
├───────────────────────┬──────────────────────────────────────────────────┬─────────────────┤
│ [Поиск по проекту...] │ [+ Add node] [Search] [Undo] [Redo] [Fit]       │ Node Inspector  │
│                       │ [Auto-layout] [Minimap] [View] [- 90% +]         │                 │
│ Graphs            [+] │                                                  │ Validation      │
│ Functions         [+] │      graph with highlighted invalid node         │ - 2 errors      │
│ Variables         [+] │      error node outlined in red                  │ - 1 warning     │
│ Types & Classes   [+] │      jump target centered                         │                 │
│ Pointers & Ref.   [+] │                                                  │ Current issue   │
│ UE Macros         [+] │                                                  │ - Missing input │
├───────────────────────┴──────────────────────────────────────────────────┴─────────────────┤
│ [Problems • 3] [Generated code] [Console] [Packages] [Dependencies] [Search]             │
│ ------------------------------------------------------------------------------------------ │
│ Errors (2)                                                                                 │
│ 1. Напечатать_статус: message not connected                         [Перейти] [Исправить] │
│ 2. Новая функция 1: missing return path                             [Перейти]            │
│ Warnings (1)                                                                               │
│ 3. Test: unused variable                                             [Перейти]            │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Поведение

- bottom panel auto-open допустим, потому что есть явная причина;
- по клику `Перейти` canvas фокусируется на проблемном узле;
- допустим единичный auto-zoom/focus при переходе из Problems;
- нельзя удерживать persistent auto-fit после ручного вмешательства пользователя.

### 6.3 1280 behavior

- right inspector collapsed by default;
- bottom panel открывается на меньшую высоту (например 220 px);
- left sidebar narrowed;
- `Dependencies` и `Search` можно увести в overflow tabs, если не помещаются;
- graph всё ещё должен оставаться читаемым по центру;
- если dependency workflow активен, пользователь всё ещё должен понимать active source file и jump-back path.

### 6.4 Acceptance for this state

- Errors быстро находят и ведут к месту ошибки.
- Bottom panel помогает, а не душит canvas.
- Validation status читается компактно, без больших success/error баннеров в shell.

## 7. State 4 — Unsupported codegen / disabled Generate

### 7.1 Desktop wireframe

```text
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ [Logo] [test.cpp *  ● Не сохранено] [UE] [RU]               [Save] [Validate] [Generate C++ disabled] [Run▼] │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ [Project / Graph / Event Graph] [Mode: Graph] [Codegen: Rust] [Problems: 0/0]            │
├───────────────────────┬──────────────────────────────────────────────────┬─────────────────┤
│ [Поиск по проекту...] │ [+ Add node] [Search] [Undo] [Redo] [Fit]       │ Graph Inspector │
│                       │ [Auto-layout] [Minimap] [View] [- 100% +]        │                 │
│ Graphs            [+] │                                                  │ Properties      │
│ Functions         [+] │           graph visible / editable               │ - Graph name    │
│ Variables         [+] │                                                  │                 │
│ Types & Classes   [+] │                                                  │ Codegen         │
│ Pointers & Ref.   [+] │                                                  │ - Selected: Rust│
│ UE Macros         [+] │                                                  │ - Status: unsupported
│                       │                                                  │ - Support: C++, UE C++
│                       │                                                  │                 │
│                       │                                                  │ Reason          │
│                       │                                                  │ Генерация недоступна
│                       │                                                  │ для выбранного codegen.
│                       │                                                  │ Переключитесь на C++.
│                       │                                                  │ [Switch to C++]
├───────────────────────┴──────────────────────────────────────────────────┴─────────────────┤
│ Bottom panel: collapsed                                                                     │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Disabled state rules

- `Generate C++` visible, but disabled;
- reason text доступен в tooltip и в inspector/context area;
- пользователь должен понимать не только что действие недоступно, но и почему;
- рядом желательно дать corrective CTA: `Switch to C++`.

### 7.3 1280 behavior

- disabled primary остаётся видимым в header, не уезжает первым в overflow;
- reason доступен по tooltip и в collapsed inspector drawer;
- если места мало, label может стать `Generate`, но причина недоступности должна остаться discoverable.

### 7.4 Acceptance for this state

- Пользователь понимает, что action существует, но недоступен в текущем режиме.
- Есть явное объяснение и путь исправления.
- Ошибка не выглядит как поломка интерфейса.

## 8. Поведение на ширине \~1280

### 8.1 Recommended shell behavior

- right inspector: collapsed by default;
- left sidebar: pinned but narrowed (\~248–260 px);
- bottom panel: hidden/collapsed by default;
- context bar: сокращённый breadcrumb;
- header: `Save` compact, `Validate` compact, `Generate C++` остаётся видимым, `Run▼` остаётся видимым.

### 8.2 Overflow priority

Порядок схлопывания:

1. сократить подписи у secondary actions;
2. сделать часть toolbar icon-only;
3. перевести advanced global controls в compact menus;
4. схлопнуть inspector;
5. уменьшить sidebar;
6. часть secondary controls увести в overflow.

Нельзя жертвовать:

- file name;
- document status;
- Generate C++;
- базовой читаемостью canvas;
- доступом к active file / working files flow;
- доступом к editor mode switch.

## 9. Edge cases

1. Пользователь вручную закрыл inspector — при следующем node select не открывать его агрессивно каждый раз.
2. Bottom panel была открыта на `Problems`, затем ошибки исчезли — не подменять её резко success-state панелью.
3. Смешанный multi-select из node и variable — показывать только batch actions общего типа.
4. Длинные русские названия графов и функций — использовать ellipsis + full tooltip.
5. Generate disabled + unsaved changes одновременно — status и disabled reason не должны визуально конфликтовать.
6. Нет привязанного файла — shell должен показывать `unbound` state и явный путь к bind action.
7. `Working files` пусты — file workflow не должен превращаться в dead UI.
8. Пользователь меняет editor mode при dirty graph — нужен предсказуемый confirm/preserve flow.
9. `class storage` в состоянии `missing / failed / dirty / conflict` — статус должен быть заметен без постоянного тяжёлого блока.
10. Пользователь вошёл в pointer attach или UE macro attach mode — отмена по `Esc` и явная cancel action должны оставаться видимыми.
11. Открыт function graph modal — вторичные shell-элементы не должны уводить внимание от вложенного графа.
12. Dependency attach запрошен без active file или без source file — нужна явная причина, а не молчаливый disabled-control.

## 10. Критерии приёмки

1. За 10–15 секунд пользователь находит open graph, add function, add variable, validate, generate C++.
2. Right panel truly contextual.
3. Document status читается в одном месте.
4. Canvas visually dominant.
5. Bottom panel не живёт открытой без причины.
6. Цвет объясняет смысл, а не украшает shell.
7. На \~1280 layout деградирует предсказуемо.
8. Реализованные advanced flows остаются доступны максимум через 1 interaction layer:
   - editor mode switch;
   - working files / bind file;
   - dependency attach;
   - codegen profile / entrypoint;
   - help / hotkeys / ui scale.
9. Class storage status и class nodes mode остаются discoverable, даже если их визуальный вес уменьшен.
10. Временные attach/modal states оформлены как transient overlays, а не как постоянные панели shell.

## 11. Следующий шаг

После ревью implementation-aware wireframe v2 можно идти в high-fidelity mockup для двух ключевых состояний:

1. Node selected
2. Problems opened

Но до handoff в разработку нужно обязательно показать ещё 4 microstates:

1. `Files / working files` popover с bound/unbound state
2. `Class storage warning` state (`missing` или `dirty`)
3. `Dependency attach` / active source file state
4. `Function graph modal` или `Attach mode banner` state
