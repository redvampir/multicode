# Правила для MultiCode — Visual Programming Plugin

## Проект

VS Code расширение для визуального программирования (Blueprint-стиль) с генерацией кода на C++, Rust, Assembly. Два языка реализации: C++20 (ядро) и TypeScript (расширение + UI).

---

## Архитектурные Принципы

### SOLID
- **S** — Single Responsibility: каждый класс/модуль решает одну задачу
- **O** — Open/Closed: открыт для расширения, закрыт для модификации
- **L** — Liskov Substitution: наследники взаимозаменяемы
- **I** — Interface Segregation: много узких интерфейсов лучше одного широкого
- **D** — Dependency Inversion: зависимость от абстракций, не от конкретики

### Паттерны проекта
- **Factory** — создание узлов графа (`NodeFactory`)
- **Command** — undo/redo операции (`GraphCommand`)
- **Observer** — реактивность графа (Zustand store)
- **Visitor** — обход и трансформация графа, кодогенерация
- **Strategy** — различные кодогенераторы (C++/Rust/ASM)
- **Composite** — иерархия узлов

---

## C++ (C++20)

### Управление ресурсами
```cpp
// RAII — единственный способ управления ресурсами
auto node = std::make_unique<Node>();
std::vector<std::unique_ptr<Node>> nodes;

// Raw new/delete запрещены
// unique_ptr — эксклюзивное владение
// shared_ptr — разделяемое (использовать редко)
// weak_ptr — наблюдатель без владения
// const Node& или Node* — не владеющие ссылки в параметрах
```

### Типы и константность
```cpp
// const everywhere, trailing return type
class Node {
public:
    [[nodiscard]] auto getName() const noexcept -> std::string_view;
    [[nodiscard]] auto getConnections() const noexcept -> std::span<const Connection>;
    void setName(std::string_view name);
};

// Strong types вместо примитивов
struct NodeId {
    std::uint64_t value;
    auto operator<=>(const NodeId&) const = default;
};

// constexpr для compile-time
constexpr auto MAX_CONNECTIONS = 256;
```

### Обработка ошибок
```cpp
// std::expected для ожидаемых ошибок
auto parseNode(std::string_view json) -> std::expected<Node, ParseError>;

// Исключения — только для исключительных ситуаций
// noexcept — где гарантировано безопасно
```

### Концепты (вместо SFINAE)
```cpp
template<typename T>
concept Serializable = requires(T t) {
    { t.serialize() } -> std::convertible_to<std::string>;
    { T::deserialize(std::string{}) } -> std::same_as<T>;
};

template<Serializable T>
auto save(const T& obj) -> void;
```

### Производительность
```cpp
// Move семантика, perfect forwarding
auto createNode(std::string name) -> std::unique_ptr<Node> {
    return std::make_unique<Node>(std::move(name));
}

// Reserve для контейнеров
nodes.reserve(expectedSize);

// [[likely]] / [[unlikely]] для branch prediction
if (error) [[unlikely]] { handleError(); }
```

### Именование
```cpp
class NodeFactory {};           // PascalCase — типы
void processNode();             // camelCase — функции/методы
constexpr auto MAX_SIZE = 100;  // UPPER_SNAKE — константы
NodeId node_id_;                // snake_case — переменные/поля (поля с суффиксом _)
namespace visprog::core {}      // snake_case — namespaces
```

### Заголовочные файлы
```cpp
#pragma once

#include <memory>
#include <string_view>

namespace visprog::core {

/// @brief Краткое описание (одна строка)
/// @param node Узел для обработки
/// @return Результат обработки
class Node {
public:
    [[nodiscard]] auto getId() const noexcept -> NodeId;
private:
    NodeId id_;
};

} // namespace visprog::core
```

### Граф — главная структура
```cpp
class VisualGraph {
    std::unordered_map<NodeId, std::unique_ptr<Node>> nodes_;
    std::unordered_map<NodeId, std::vector<ConnectionId>> adjacency_;

    [[nodiscard]] auto topologicalSort() const -> std::vector<NodeId>;
};
```

---

## TypeScript

### Типизация
- `strict: true`, запрет `any`
- Zod-схемы для IPC-сообщений и внешних данных
- Интерфейсы для контрактов, типы для union/intersection

### React
- Функциональные компоненты, хуки
- `React.memo` для тяжёлых компонентов
- Zustand для стейта (`store.ts`)
- React Flow (`@xyflow/react`) для Blueprint-редактора

### Именование
- `PascalCase` — компоненты, типы, интерфейсы
- `camelCase` — функции, переменные, хуки
- `UPPER_SNAKE` — константы

---

## Тестирование

### C++
```cpp
TEST_CASE("Node creation with valid data", "[node]") {
    auto node = Node::create("TestNode", NodeType::Function);
    REQUIRE(node.has_value());
    CHECK(node->getName() == "TestNode");
}
```

### TypeScript
- Vitest для unit-тестов
- Mocha для интеграционных тестов VS Code

### Покрытие
- Unit-тесты для всех публичных API
- Integration-тесты для модулей
- Граничные случаи (null, empty, network fail)

---

## Безопасность

- Defensive programming: валидация на границах системы
- IPC-сообщения проходят Zod-парсинг
- Экранирование пользовательского ввода
- Проверка предусловий: `std::expected` вместо UB
- Static analysis: clang-tidy, AddressSanitizer, UBSan

---

## Инструментарий

### Сборка
- **CMake** (>=3.25) + vcpkg — C++ ядро
- **Webpack** — VS Code расширение
- **clang-format** — форматирование C++
- **ESLint** — линтинг TypeScript

### Флаги компиляции
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

## Чек-лист перед коммитом

- [ ] Код компилируется без warnings (C++ и TypeScript)
- [ ] Все тесты проходят
- [ ] Static analysis / линтер чист
- [ ] Документация обновлена при изменении API
- [ ] Локализация добавлена для новых строк (RU/EN)
- [ ] IPC валидируется через Zod
- [ ] Memory leaks отсутствуют (ASAN)

---

## Ключевые правила

1. Простота важнее хитроумности
2. Измеряй, не гадай (профилирование перед оптимизацией)
3. Fail fast, fail loud
4. RAII для всех ресурсов
5. const correctness — не опционально
6. Тесты — не опционально
7. Документируй намерения, не реализацию
8. Код для людей, не для компилятора
