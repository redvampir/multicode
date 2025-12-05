# MultiCode - визуальные графы для низкоуровневых языков

> TL;DR: C++-ядро (Nodes/Ports/Graph, фабрика узлов, строгие типы и валидация) работает и покрыто тестами на Catch2. VS Code-расширение уже поднимает webview на React+Cytoscape с загрузкой/сохранением графа и обменом сообщениями с extension.

## Что уже работает
- Строгие ID для узлов/портов/соединений (`include/visprog/core/Types.hpp`) с явными ошибками и цветами типов для UI.
- `Node`, `Port`, `Graph` и `NodeFactory` с полноценным управлением портами, метаданными и связями (`src/core/*.cpp`).
- Проверки графа: поиск Start/End, топологическая сортировка, обнаружение циклов/разрывов, расчёт статистики.
- Набор готовых узлов (Start/End/If/Loops/арифметика/логика/IO) сразу получает правильные порты при создании.
- `GraphSerializer` для импорта/экспорта графов в JSON с версионированием схемы.
- CMake + vcpkg зависимости (nlohmann-json, spdlog, Catch2) и тестовый бинарь `multicode_tests`.

## Архитектура в текущей ревизии
### Core library (`include/visprog/core`, `src/core`)
- `Types`: все enum/ID + `Result<T>` с человекочитаемыми ошибками и кодами.
- `Port`: value-type объект, умеет проверять совместимость направлений и типов, генерирует глобальные ID.
- `Node`: уникальные сущности, thread-safe на чтение. Добавление/поиск портов, метаданные, компактная валидация (разные правила для Start/End/PureFunction и т.д.).
- `Graph`: владеет узлами, хранит связи, поддерживает быстрый lookup по ID, adjacency lists, статистику и подробную валидацию.
- `NodeFactory`: единственная точка создания узлов, чтобы не дублировать конфигурацию портов и генерировать имена.

### Тесты (`tests/core`)
- `test_node.cpp`, `test_port.cpp`, `test_graph.cpp` закрывают конструкторы, фабрику, валидацию и основные сценарии (циклы, пересечения, статистику, reachability).
- `tests/debug_test.cpp` - песочница, линкуется отдельным бинарём `debug_test`.

### Инструменты и сборка
- `CMakeLists.txt` содержит только library+tests, без сторонних сценариев.
- `cmake -S . -B build && cmake --build build` - собрать ядро.
- `ctest --test-dir build` - прогнать тесты.
- Быстрый прогон lint + сборки + VS Code тестов: `scripts/vscode-test-i-sborka.sh` (используйте флаги `--skip-lint`/`--skip-tests`, если нужно ускорить).
- Никаких скриптов автоформатирования/генерации - clang-format конфиг лежит в корне.

### VS Code extension (`vscode-extension`)
- Реализован webview на React + Cytoscape: отображение узлов/рёбер, тёмная тема, стилизованные порты, обмен сообщениями через `postMessage` и Zustand-хранилище.
- `GraphPanel` поднимает панель, прокидывает стартовый JSON графа, обрабатывает команды сохранения/загрузки/генерации/валидации.
- Сборка webview через webpack настроена в `webpack.config.js` (см. README в `vscode-extension/`).

## Структура репозитория
- `include/visprog/core` - публичные заголовки ядра.
- `src/core` - реализации.
- `tests` - Catch2 тесты и отладочный стенд.
- `vscode-extension` - расширение VS Code с React/Cytoscape webview и GraphPanel.
- `.github/workflows` - готовые CI для форматирования и сборки (проверено, но пока не подключено к реальному CI).
- `Документы/**` - актуализированные описания архитектуры, статуса, roadmap и т.д.

## Ближайшие задачи (которые действительно нужны)
1. **Улучшение VS Code UI**: доработать GraphEditor (валидация схемы сообщений, авто-лейауты, горячие клавиши, тесты на Zustand/store) — подробный список см. `Документы/WebviewImprovementPlan.md`.
2. **Генератор C++**: обход графа в топологическом порядке, сопоставление узлов шаблонам кода, базовая поддержка переменных и ветвлений.
3. **Интеграция clang-tidy/clang-format в CI**: чтобы ловить регрессии раньше.
## Как участвовать
- Pull Request должен компилироваться и проходить `ctest`.
- Новая функциональность => новые тесты в `tests/core`.
- Перед коммитом прогоняйте `clang-format` по своим `*.hpp`/`*.cpp`, но не трогайте `third_party`: `git ls-files '*.hpp' '*.cpp' | grep -v third_party | xargs /usr/bin/clang-format -i`.
- Отдельно проверяйте `include/visprog/core/Port.hpp`, `include/visprog/core/Node.hpp`, `include/visprog/core/NodeFactory.hpp`, `src/core/Node.cpp`, `src/core/Port.cpp`, `src/core/Types.cpp`, `src/core/Graph.cpp`, сигнатуры соединений в `Graph.hpp`, а также `src/core/GraphSerializer.cpp` с `include/visprog/core/GraphSerializer.hpp`: CI жёстко валится на `-Wclang-format-violations`, если руками поправить отступы или перенести аргументы без `clang-format`.
- Документация уже очищена; держим её в том же духе: только факты, только проверенные концепции или чётко помеченные TODO.
