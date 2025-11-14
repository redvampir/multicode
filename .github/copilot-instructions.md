# Правила Агента для Visual Programming Plugin (C++ Prototype)

## 🎯 Миссия Проекта
Разработка плагина для VS Code, реализующего визуальное программирование (аналог Blueprint в Unreal Engine) для низкоуровневых языков: C++, Rust, Assembly. Код должен быть на уровне божественного мастерства программирования.

---

## 📐 Архитектурные Принципы

### 1. SOLID Принципы - Святые Законы
- **S** - Single Responsibility: Каждый класс/модуль решает ОДНУ задачу
- **O** - Open/Closed: Открыт для расширения, закрыт для модификации
- **L** - Liskov Substitution: Наследники должны быть взаимозаменяемы
- **I** - Interface Segregation: Много узких интерфейсов > один широкий
- **D** - Dependency Inversion: Зависимость от абстракций, не от конкретики

### 2. Паттерны Проектирования
- **Factory/Abstract Factory** - для создания узлов графа
- **Command** - для undo/redo операций
- **Observer/Event System** - для реактивности графа
- **Visitor** - для обхода и трансформации графа
- **Strategy** - для различных кодогенераторов (C++/Rust/ASM)
- **Composite** - для иерархии узлов
- **Memento** - для сохранения состояния

### 3. Модульная Архитектура
```
visual-programming-plugin/
├── core/              # Ядро - граф, узлы, связи
├── codegen/           # Генераторы кода для разных языков
├── vscode-extension/  # Интеграция с VS Code
├── ui/                # Визуальный редактор
├── parser/            # Парсеры языков
├── optimizer/         # Оптимизация графа
└── runtime/           # Runtime-компоненты
```

---

## 💎 C++ Best Practices - Божественный Уровень

### 1. Modern C++ (C++20/23)
```cpp
// ✅ ПРАВИЛЬНО: Используй современный C++
auto node = std::make_unique<Node>();
std::vector<std::unique_ptr<Node>> nodes;
std::string_view name = "NodeName";
std::span<const int> data = getData();

// ❌ НЕПРАВИЛЬНО: Избегай устаревшего стиля
Node* node = new Node();  // NO!
char* name = "NodeName";  // NO!
```

### 2. RAII и Управление Ресурсами
```cpp
// ✅ Всегда RAII
class NodeGraph {
    std::unique_ptr<GraphData> data_;  // Автоматическая очистка
    std::vector<Connection> connections_;
    
public:
    // Rule of Zero или Rule of Five
    NodeGraph() = default;
    ~NodeGraph() = default;
    NodeGraph(const NodeGraph&) = delete;
    NodeGraph& operator=(const NodeGraph&) = delete;
    NodeGraph(NodeGraph&&) noexcept = default;
    NodeGraph& operator=(NodeGraph&&) noexcept = default;
};
```

### 3. Константность и Неизменяемость
```cpp
// ✅ const everywhere
class Node {
public:
    [[nodiscard]] auto getName() const noexcept -> std::string_view;
    [[nodiscard]] auto getConnections() const noexcept -> std::span<const Connection>;
    
    void setName(std::string_view name);  // Только необходимые мутации
};

// ✅ constexpr для compile-time вычислений
constexpr auto MAX_CONNECTIONS = 256;
constexpr auto isValidNodeType(NodeType type) -> bool;
```

### 4. Умные Указатели - Только Правильно
```cpp
// ✅ Владение и время жизни
std::unique_ptr<Node> - эксклюзивное владение
std::shared_ptr<Node> - разделяемое владение (используй редко!)
std::weak_ptr<Node> - наблюдатель без владения
Node* - не владеющая ссылка (параметры функций)
const Node& - передача по константной ссылке

// ❌ НИКОГДА не используй raw new/delete напрямую
```

### 5. Обработка Ошибок
```cpp
// ✅ std::expected (C++23) или Result<T, Error>
auto parseNode(std::string_view json) -> std::expected<Node, ParseError>;

// ✅ Исключения только для исключительных ситуаций
class NodeException : public std::runtime_error {
    using std::runtime_error::runtime_error;
};

// ✅ noexcept где возможно
auto swap(Node& a, Node& b) noexcept -> void;
```

### 6. Шаблоны и Концепты (C++20)
```cpp
// ✅ Концепты вместо SFINAE
template<typename T>
concept Serializable = requires(T t) {
    { t.serialize() } -> std::convertible_to<std::string>;
    { T::deserialize(std::string{}) } -> std::same_as<T>;
};

template<Serializable T>
auto save(const T& obj) -> void;
```

### 7. Оптимизация и Производительность
```cpp
// ✅ Move семантика
auto createNode(std::string name) -> std::unique_ptr<Node> {
    return std::make_unique<Node>(std::move(name));
}

// ✅ Reserve для контейнеров
std::vector<Node> nodes;
nodes.reserve(expectedSize);

// ✅ Perfect forwarding
template<typename... Args>
auto emplaceNode(Args&&... args) -> Node& {
    return nodes.emplace_back(std::forward<Args>(args)...);
}

// ✅ [[likely]] / [[unlikely]] для branch prediction
if (error) [[unlikely]] {
    handleError();
}
```

### 8. Безопасность Типов
```cpp
// ✅ Strong types вместо примитивов
struct NodeId {
    std::uint64_t value;
    auto operator<=>(const NodeId&) const = default;
};

struct ConnectionId {
    std::uint64_t value;
    auto operator<=>(const ConnectionId&) const = default;
};

// Теперь невозможно перепутать ID узла и ID связи
```

---

## 🏗️ Структура Кода

### 1. Заголовочные Файлы
```cpp
// node.hpp
#pragma once

#include <concepts>
#include <memory>
#include <string_view>
#include <vector>

namespace visprog::core {

/// @brief Represents a single node in the visual programming graph
/// @details Thread-safe for reading, mutations require external synchronization
class Node {
public:
    // Public interface first
    
    [[nodiscard]] auto getId() const noexcept -> NodeId;
    [[nodiscard]] auto getType() const noexcept -> NodeType;
    
private:
    // Implementation details last
    
    NodeId id_;
    NodeType type_;
};

} // namespace visprog::core
```

### 2. Именование
```cpp
// ✅ ПРАВИЛЬНО
class NodeFactory {};           // PascalCase для типов
void processNode();             // camelCase для функций
constexpr auto MAX_SIZE = 100;  // UPPER_SNAKE для констант
auto node_count = 0;            // snake_case для переменных

namespace visprog::core {}      // snake_case для namespace
```

### 3. Комментарии и Документация
```cpp
/// @brief Краткое описание (одна строка)
/// @details Детальное описание функционала
/// @param node Узел для обработки
/// @return Результат обработки
/// @throws NodeException Если узел невалиден
/// @note Thread-safety информация
/// @example
///   auto result = process(myNode);
[[nodiscard]] auto process(const Node& node) -> Result<ProcessedData>;
```

---

## 🧪 Тестирование

### 1. TDD - Test Driven Development
```cpp
// Пиши тесты ПЕРВЫМИ
TEST_CASE("Node creation with valid data", "[node]") {
    auto node = Node::create("TestNode", NodeType::Function);
    
    REQUIRE(node.has_value());
    CHECK(node->getName() == "TestNode");
    CHECK(node->getType() == NodeType::Function);
}
```

### 2. Покрытие
- Unit тесты для всех публичных API
- Integration тесты для модулей
- Performance тесты для критических путей
- Fuzzing для парсеров

---

## 🔒 Безопасность и Надежность

### 1. Defensive Programming
```cpp
auto connect(NodeId from, NodeId to) -> std::expected<Connection, Error> {
    // Валидация входных данных
    if (!isValidNodeId(from) || !isValidNodeId(to)) {
        return std::unexpected(Error::InvalidNodeId);
    }
    
    // Проверка предусловий
    if (from == to) {
        return std::unexpected(Error::SelfConnection);
    }
    
    // Основная логика
    // ...
}
```

### 2. Static Analysis
- clang-tidy со всеми проверками
- cppcheck для дополнительных проверок
- AddressSanitizer, UndefinedBehaviorSanitizer
- ThreadSanitizer для многопоточного кода

---

## 📊 Производительность

### 1. Профилирование
- Измеряй ПЕРЕД оптимизацией
- Оптимизируй горячие пути
- Benchmark критичные операции

### 2. Memory Layout
```cpp
// ✅ Cache-friendly структуры
struct Node {
    NodeId id;              // 8 bytes
    NodeType type;          // 4 bytes
    uint32_t padding;       // 4 bytes (выравнивание)
    std::vector<Connection> connections;  // Храним отдельно
};

static_assert(sizeof(Node) % 16 == 0);  // Выравнивание
```

---

## 🔧 Инструментарий

### 1. Обязательные Инструменты
- **CMake** (≥3.25) - сборка проекта
- **clang-format** - форматирование
- **clang-tidy** - статический анализ
- **Catch2/GoogleTest** - тестирование
- **vcpkg/Conan** - управление зависимостями

### 2. Флаги Компиляции
```cmake
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_compile_options(
    -Wall -Wextra -Wpedantic -Werror
    -Wconversion -Wsign-conversion
    -Wnon-virtual-dtor -Woverloaded-virtual
    -Wold-style-cast -Wcast-align
)
```

---

## 🌟 Код-Ревью Чеклист

### Перед Коммитом Проверь:
- [ ] Код компилируется без warnings
- [ ] Все тесты проходят
- [ ] Static analysis чист
- [ ] Документация обновлена
- [ ] API review пройден
- [ ] Performance regression тесты пройдены
- [ ] Memory leaks отсутствуют (valgrind/ASAN)
- [ ] Code coverage > 80%

---

## 🚀 Итоговые Заповеди

1. **Пиши код для людей, не для компиляторов**
2. **Простота > Умность**
3. **Измеряй, не гадай**
4. **Fail fast, fail loud**
5. **Zero-cost abstractions - святой грааль**
6. **const correctness - не просто слова**
7. **RAII - твой лучший друг**
8. **Тесты - не опционально**
9. **Документируй намерения, не реализацию**
10. **Code review - обязателен для всего**

---

## 📚 Обязательное Чтение

- "Effective Modern C++" - Scott Meyers
- "C++ Core Guidelines" - Bjarne Stroustrup, Herb Sutter
- "API Design for C++" - Martin Reddy
- "Software Architecture in Practice" - Len Bass
- "Clean Architecture" - Robert Martin

---

## 🎨 Особенности Visual Programming Plugin

### 1. Граф - Главная Структура
```cpp
class VisualGraph {
    // Efficient node storage
    std::unordered_map<NodeId, std::unique_ptr<Node>> nodes_;
    
    // Connection adjacency list
    std::unordered_map<NodeId, std::vector<ConnectionId>> adjacency_;
    
    // Топологическая сортировка для кодогенерации
    [[nodiscard]] auto topologicalSort() const -> std::vector<NodeId>;
};
```

### 2. Кодогенерация - Visitor Pattern
```cpp
class CodeGenerator {
public:
    virtual ~CodeGenerator() = default;
    virtual auto generate(const VisualGraph& graph) -> std::string = 0;
};

class CppCodeGenerator : public CodeGenerator {
    auto generate(const VisualGraph& graph) -> std::string override;
};
```

### 3. Undo/Redo - Command Pattern
```cpp
class GraphCommand {
public:
    virtual ~GraphCommand() = default;
    virtual auto execute() -> void = 0;
    virtual auto undo() -> void = 0;
};
```

---

**Версия**: 1.0  
**Дата**: 2025-11-06  
**Статус**: Прототип для C++  
**Следующие этапы**: Rust, Assembly поддержка
