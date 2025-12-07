# CODING_GUIDELINES — Правила Кода MultiCode

> **TL;DR:** Modern C++20, RAII, const correctness, Result<T> для ошибок, тесты обязательны.

---

## Принципы

### SOLID
- **S** — Single Responsibility: один класс = одна задача
- **O** — Open/Closed: расширяемость без модификации
- **L** — Liskov Substitution: наследники взаимозаменяемы
- **I** — Interface Segregation: узкие интерфейсы
- **D** — Dependency Inversion: зависимость от абстракций

### RAII (Resource Acquisition Is Initialization)
Все ресурсы управляются через объекты. Никаких ручных `new/delete`.

```cpp
// ✅ ПРАВИЛЬНО
auto node = std::make_unique<Node>();
std::vector<std::unique_ptr<Node>> nodes;

// ❌ НЕПРАВИЛЬНО
Node* node = new Node();  // NO!
```

### Const Correctness
Всё, что может быть `const`, должно быть `const`.

```cpp
[[nodiscard]] auto getName() const noexcept -> std::string_view;
[[nodiscard]] auto getPort(PortId id) const -> std::optional<const Port*>;
```

---

## Стиль Кода

### Именование
```cpp
class NodeFactory {};              // PascalCase для типов
void processNode();                 // camelCase для функций
constexpr auto MAX_CONNECTIONS = 256;  // UPPER_SNAKE для констант
auto node_count = 0;                // snake_case для переменных
namespace visprog::core {}          // snake_case для namespace
```

### Современный C++20
```cpp
// ✅ Используй
std::unique_ptr<T>        // Эксклюзивное владение
std::shared_ptr<T>        // Разделяемое владение (используй редко!)
std::weak_ptr<T>          // Наблюдатель без владения
std::string_view          // Легковесные строки
std::span<T>              // Легковесные диапазоны
std::optional<T>          // Опциональные значения
auto                      // Вывод типов (где очевидно)

// ❌ Избегай
T* (для владения)         // Используй только для не-владеющих указателей
char*                     // Используй std::string_view
new/delete напрямую       // Используй make_unique/make_shared
```

### Концепты (C++20)
```cpp
template<typename T>
concept Serializable = requires(T t) {
    { t.serialize() } -> std::convertible_to<std::string>;
    { T::deserialize(std::string{}) } -> std::same_as<T>;
};

template<Serializable T>
auto save(const T& obj) -> void;
```

---

## Обработка Ошибок

### Result<T, Error> — Основной Механизм
```cpp
// include/visprog/core/Types.hpp
template<typename T>
using Result = std::expected<T, Error>;

// Использование
auto node = factory.createNode(NodeType::Start);
if (!node) {
    spdlog::error("Failed to create node: {}", node.error().message);
    return node;  // Пробрасываем ошибку наверх
}

// Или
return node.value();  // Если уверены, что успех
```

### Исключения — Только для Исключительных Ситуаций
```cpp
// Используй для критических ошибок, которые не могут быть обработаны локально
class GraphException : public std::runtime_error {
    using std::runtime_error::runtime_error;
};

if (critical_failure) {
    throw GraphException("Critical graph corruption detected");
}
```

### noexcept — Где Возможно
```cpp
auto swap(Node& a, Node& b) noexcept -> void;
auto getId() const noexcept -> NodeId;
```

---

## Функции и Классы

### Размер Функций
- **Идеал:** 10–30 строк
- **Максимум:** 60 строк
- **Вложенность:** Не более 3 уровней

Если больше — рефакторь на подфункции.

### Rule of Zero или Rule of Five
```cpp
// Rule of Zero (предпочтительно)
class Graph {
    std::vector<std::unique_ptr<Node>> nodes_;
    // Компилятор сам генерирует корректные деструктор и move-операторы
};

// Rule of Five (если нужен кастомный деструктор)
class CustomResource {
public:
    ~CustomResource();
    CustomResource(const CustomResource&) = delete;
    CustomResource& operator=(const CustomResource&) = delete;
    CustomResource(CustomResource&&) noexcept;
    CustomResource& operator=(CustomResource&&) noexcept;
};
```

### Атрибуты C++
```cpp
[[nodiscard]] auto getNode(NodeId id) const -> std::optional<const Node*>;
[[maybe_unused]] auto debug_info = collectDebugInfo();

if (error) [[unlikely]] {
    handleError();
}
```

---

## Тестирование

### TDD — Test Driven Development
Пиши тесты **первыми** (или сразу после реализации).

```cpp
// tests/core/test_node.cpp
TEST_CASE("Node creation with valid data", "[node]") {
    auto node = NodeFactory::createNode(NodeType::Start, "StartNode");

    REQUIRE(node.has_value());
    CHECK(node->getName() == "StartNode");
    CHECK(node->getType() == NodeType::Start);
}

TEST_CASE("Node creation with invalid type", "[node][error]") {
    auto node = NodeFactory::createNode(static_cast<NodeType>(9999), "Invalid");

    REQUIRE(!node.has_value());
    CHECK(node.error().code == ErrorCode::InvalidNodeType);
}
```

### Покрытие
- Unit тесты для **всех** публичных API
- Edge cases обязательны: null, empty, overflow, invalid input

### Запуск Тестов
```bash
cmake -S . -B build
cmake --build build
ctest --test-dir build --output-on-failure
```

---

## Безопасность

### Defensive Programming
```cpp
auto connect(NodeId from, NodeId to) -> Result<Connection> {
    // 1. Валидация входных данных
    if (!isValidNodeId(from) || !isValidNodeId(to)) {
        return Error{ErrorCode::InvalidNodeId, "Invalid node ID"};
    }

    // 2. Проверка предусловий
    if (from == to) {
        return Error{ErrorCode::SelfConnection, "Cannot connect node to itself"};
    }

    // 3. Основная логика
    auto connection = createConnection(from, to);
    return connection;
}
```

### Валидация на Границах
Валидируй входные данные на границах системы:
- Пользовательский ввод (JSON, команды VS Code)
- Внешние API
- Файловый ввод/вывод

**Не** валидируй внутри доверенных модулей:
```cpp
// ✅ ПРАВИЛЬНО: Валидация на границе
auto Graph::addNode(std::unique_ptr<Node> node) -> Result<NodeId> {
    if (!node) {
        return Error{ErrorCode::NullNode, "Node cannot be null"};
    }
    // ...
}

// ❌ НЕПРАВИЛЬНО: Избыточная валидация внутри
void Graph::internal_processNode(Node* node) {
    // Если node пришёл от доверенного внутреннего кода — не проверяй
    assert(node != nullptr);  // Assertion достаточно для debug
    // ...
}
```

---

## Специфика MultiCode

### Структура Проекта
```
include/visprog/core/  # Публичные заголовки
src/core/              # Реализации
tests/                 # Catch2 тесты
vscode-extension/      # VS Code расширение
```

### Ключевые Типы
```cpp
// Types.hpp
struct NodeId { std::uint64_t value; };
struct PortId { std::uint64_t value; };
struct ConnectionId { std::uint64_t value; };

enum class NodeType { Start, End, If, ForLoop, /* ... */ };
enum class PortType { Exec, Integer, Float, String, Bool };

template<typename T>
using Result = std::expected<T, Error>;
```

### NodeFactory — Единственная Точка Создания
```cpp
auto node = NodeFactory::createNode(NodeType::Start, "MyStart");
// НЕ создавай узлы напрямую через конструктор Node
```

### GraphSerializer — JSON Import/Export
```cpp
auto serializer = GraphSerializer{};
auto json_str = serializer.serialize(graph);
auto graph = serializer.deserialize(json_str);
```

---

## Форматирование и Линтеры

### clang-format
Перед коммитом **обязательно**:
```bash
git ls-files '*.hpp' '*.cpp' | grep -v third_party | xargs clang-format -i
```

Файл `.clang-format` в корне проекта. CI падает на `-Wclang-format-violations`.

### clang-tidy
Статический анализ для поиска багов и антипаттернов:
```bash
clang-tidy src/core/*.cpp -- -Iinclude
```

---

## Документация

### Комментарии
Документируй **намерения** (Why), не реализацию (What).

```cpp
// ✅ ПРАВИЛЬНО
/// Проверяет граф на наличие циклов перед кодогенерацией,
/// чтобы избежать бесконечных циклов в сгенерированном коде.
[[nodiscard]] auto hasCycles() const -> bool;

// ❌ НЕПРАВИЛЬНО
/// Возвращает true, если есть циклы.  // Очевидно из названия!
[[nodiscard]] auto hasCycles() const -> bool;
```

### Doxygen-стиль
```cpp
/// @brief Краткое описание (одна строка)
/// @details Детальное описание функционала
/// @param id Идентификатор узла для поиска
/// @return Указатель на узел или nullptr, если не найден
/// @throws GraphException Если граф повреждён
/// @note Thread-safe для чтения
[[nodiscard]] auto findNode(NodeId id) const -> const Node*;
```

---

## Производительность

### Профилируй Перед Оптимизацией
> "Premature optimization is the root of all evil." — Donald Knuth

1. Пиши читаемый код
2. Измерь производительность
3. Оптимизируй **горячие пути**

### Move-семантика
```cpp
auto createNode(std::string name) -> std::unique_ptr<Node> {
    return std::make_unique<Node>(std::move(name));  // Перемещение, не копирование
}
```

### Reserve для Контейнеров
```cpp
std::vector<Node> nodes;
nodes.reserve(expected_size);  // Избегаем реаллокаций
```

### Perfect Forwarding
```cpp
template<typename... Args>
auto emplaceNode(Args&&... args) -> Node& {
    return nodes.emplace_back(std::forward<Args>(args)...);
}
```

---

## Чек-Лист Перед Коммитом

- [ ] Код компилируется без warnings (`-Wall -Wextra -Wpedantic -Werror`)
- [ ] `ctest --test-dir build` — все тесты зелёные
- [ ] `clang-format -i` применён ко всем изменённым файлам
- [ ] Добавлены тесты для нового функционала
- [ ] Публичные API задокументированы
- [ ] Нет TODO/FIXME (или они оформлены как GitHub Issues)
- [ ] README.md обновлён (если добавлен новый модуль)

---

## Паттерны Проектирования для MultiCode

| Паттерн | Применение |
|---------|-----------|
| **Factory** | `NodeFactory` — создание узлов |
| **Visitor** | Обход графа для кодогенерации |
| **Command** | Undo/Redo (будущее) |
| **Observer** | События изменения графа |
| **Strategy** | Кодогенераторы (C++/Rust/ASM) |

---

## Примеры

### Создание Узла
```cpp
#include "visprog/core/NodeFactory.hpp"

auto factory = NodeFactory{};
auto node = factory.createNode(NodeType::Start, "Entry");

if (!node) {
    spdlog::error("Failed: {}", node.error().message);
    return;
}

spdlog::info("Created node: {}", node->getName());
```

### Добавление Узла в Граф
```cpp
auto graph = Graph{};
auto node = factory.createNode(NodeType::If, "CheckCondition");

if (auto result = graph.addNode(std::move(node.value())); !result) {
    spdlog::error("Failed to add node: {}", result.error().message);
}
```

### Валидация Графа
```cpp
auto graph = Graph{};
// ... добавление узлов и связей ...

if (auto validation = graph.validate(); !validation) {
    spdlog::warn("Graph validation failed: {}", validation.error().message);
}
```

---

## Ссылки

- **AGENTS.md** — описание системы Codex Architect
- **.github/copilot-instructions.md** — детальные правила C++ (для AI-ассистентов)
- **README.md** — обзор проекта и архитектуры
- **ROADMAP.md** — планы развития
- **Документы/** — подробная документация модулей

---

**Версия:** 1.0
**Дата:** 2025-12-07
**Статус:** Актуален для MultiCode v0.2.0+

---

> **Правило Номер Один:** Пиши код для людей, не для компиляторов. Простота > умность.
