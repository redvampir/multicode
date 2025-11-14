# Visual Editor (VS Code Webview)

## Фактическое состояние
- **UI отсутствует.** В `vscode-extension/src` нет ни одного файла.
- **Что есть:** `package.json` с командами/кейбиндингами, список npm-зависимостей (`cytoscape`, `zustand`, `@vscode/webview-ui-toolkit`), скрипты сборки через webpack.

## Минимальный рабочий контур
1. `extension.ts`
   - регистрирует команды `openEditor`, `newGraph`, `saveGraph`.
   - открывает WebviewPanel и передаёт туда состояние (пустой граф).
2. Webview (React/Vanilla)
   - холст на Cytoscape (режим dagre layout).
   - стор на Zustand: список узлов/связей, выделение, свойства.
   - панель узлов (palette) с данными из `NodeFactory`/JSON.
3. IPC
   - сообщения `request-save`, `request-load`, `graph-changed`.
   - сериализация/десериализация через JSON (GraphSerializer).

## UX требования
- Добавление узла: клик по палитре → узел появляется под курсором.
- Соединение: drag&drop между портами, подсветка совместимых портов.
- Инспектор: правая панель с именем узла, типом, списком портов.
- Undo/Redo можно отложить.

## Checklist перед релизом
- [ ] `src/extension.ts` + webpack конфиг.
- [ ] UI bundle с `src/webview/main.tsx`.
- [ ] Тестовая команда `Generate Code` вызывает заглушку и пишет результат в Output.
- [ ] Документация по установке npm-зависимостей (`npm install && npm run watch`).

Пока ничего из вышеперечисленного не реализовано. Этот документ существует как минимальный бриф, чтобы приоритеты были очевидны.
