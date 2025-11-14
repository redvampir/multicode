// Copyright (c) 2025 МультиКод Team. MIT License.

#pragma once

#include <cstdint>
#include <compare>
#include <string>
#include <string_view>
#include <stdexcept>
#include <variant>
#include <optional>

/// @brief Main namespace for Visual Programming Core
namespace visprog::core {

// ============================================================================
// Strong Type IDs (Type Safety)
// ============================================================================

/// @brief Strongly-typed Node identifier
struct NodeId {
    std::uint64_t value{0};
    
    [[nodiscard]] auto operator<=>(const NodeId&) const noexcept = default;
    [[nodiscard]] explicit operator bool() const noexcept { return value != 0; }
};

/// @brief Strongly-typed Port identifier
struct PortId {
    std::uint64_t value{0};
    
    [[nodiscard]] auto operator<=>(const PortId&) const noexcept = default;
    [[nodiscard]] explicit operator bool() const noexcept { return value != 0; }
};

/// @brief Strongly-typed Connection identifier
struct ConnectionId {
    std::uint64_t value{0};
    
    [[nodiscard]] auto operator<=>(const ConnectionId&) const noexcept = default;
    [[nodiscard]] explicit operator bool() const noexcept { return value != 0; }
};

/// @brief Strongly-typed Graph identifier
struct GraphId {
    std::uint64_t value{0};
    
    [[nodiscard]] auto operator<=>(const GraphId&) const noexcept = default;
    [[nodiscard]] explicit operator bool() const noexcept { return value != 0; }
};

// ============================================================================
// Enumerations
// ============================================================================

/// @brief Type of node in the visual graph
enum class NodeType : std::uint8_t {
    // Control Flow
    Start,              ///< Entry point of program
    End,                ///< Exit point of program
    
    // Functions
    Function,           ///< Function call (impure)
    PureFunction,       ///< Pure function (no side effects)
    Constructor,        ///< Constructor call
    Destructor,         ///< Destructor call
    
    // Variables
    Variable,           ///< Variable declaration
    Constant,           ///< Constant value
    GetVariable,        ///< Get variable value
    SetVariable,        ///< Set variable value
    
    // Control Flow
    If,                 ///< If statement
    Else,               ///< Else branch
    ElseIf,             ///< Else-if branch
    Switch,             ///< Switch statement
    Case,               ///< Case branch
    
    // Loops
    ForLoop,            ///< For loop
    WhileLoop,          ///< While loop
    DoWhileLoop,        ///< Do-while loop
    RangeFor,           ///< Range-based for loop (C++)
    
    // Operators
    Add,                ///< Addition (+)
    Subtract,           ///< Subtraction (-)
    Multiply,           ///< Multiplication (*)
    Divide,             ///< Division (/)
    Modulo,             ///< Modulo (%)
    
    // Comparison
    Equal,              ///< Equality (==)
    NotEqual,           ///< Inequality (!=)
    Less,               ///< Less than (<)
    LessEqual,          ///< Less or equal (<=)
    Greater,            ///< Greater than (>)
    GreaterEqual,       ///< Greater or equal (>=)
    
    // Logical
    And,                ///< Logical AND (&&)
    Or,                 ///< Logical OR (||)
    Not,                ///< Logical NOT (!)
    
    // Bitwise
    BitwiseAnd,         ///< Bitwise AND (&)
    BitwiseOr,          ///< Bitwise OR (|)
    BitwiseXor,         ///< Bitwise XOR (^)
    BitwiseNot,         ///< Bitwise NOT (~)
    ShiftLeft,          ///< Left shift (<<)
    ShiftRight,         ///< Right shift (>>)
    
    // Data Structures
    Array,              ///< Array
    Vector,             ///< Vector/Dynamic array
    Map,                ///< Map/Dictionary
    Set,                ///< Set
    
    // I/O
    Print,              ///< Print to console
    Read,               ///< Read from console
    FileRead,           ///< Read from file
    FileWrite,          ///< Write to file
    
    // Low-Level (Special for our project!)
    PointerDereference, ///< Pointer dereference (*)
    AddressOf,          ///< Address-of operator (&)
    MemoryCopy,         ///< memcpy
    MemoryAlloc,        ///< malloc/new
    MemoryFree,         ///< free/delete
    Assembly,           ///< Inline assembly block
    
    // OOP
    Class,              ///< Class definition
    Struct,             ///< Struct definition
    Method,             ///< Class method
    Field,              ///< Class field
    
    // Events
    Event,              ///< Event trigger
    EventHandler,       ///< Event handler
    
    // Comments & Debug
    Comment,            ///< Comment block
    DebugPrint,         ///< Debug output
    Breakpoint,         ///< Breakpoint marker
    
    // Custom
    Custom,             ///< User-defined node
};

/// @brief Type of connection between nodes
enum class ConnectionType : std::uint8_t {
    Execution,          ///< Control flow (white arrow)
    Data,               ///< Data flow (colored by type)
};

/// @brief Port direction
enum class PortDirection : std::uint8_t {
    Input,              ///< Input port
    Output,             ///< Output port
    InOut,              ///< Bidirectional port
};

/// @brief Data type for ports
enum class DataType : std::uint8_t {
    // Primitives
    Void,
    Bool,
    Int8,
    Int16,
    Int32,
    Int64,
    UInt8,
    UInt16,
    UInt32,
    UInt64,
    Float,
    Double,
    Char,
    
    // Strings
    String,
    StringView,
    
    // Pointers
    Pointer,
    Reference,
    
    // Containers
    Array,
    Vector,
    Map,
    Set,
    
    // User-defined
    Struct,
    Class,
    Enum,
    
    // Special
    Auto,               ///< Type inference
    Template,           ///< Template type
    Execution,          ///< Execution flow (special)
    Any,                ///< Any type (for custom nodes)
};

/// @brief Programming language target
enum class Language : std::uint8_t {
    Cpp,                ///< C++20/23
    Rust,               ///< Rust
    Assembly,           ///< x86-64 Assembly
};

// ============================================================================
// Result Type (C++23 std::expected-like)
// ============================================================================

/// @brief Error information
struct Error {
    std::string message;
    int code{0};
    
    [[nodiscard]] auto what() const noexcept -> std::string_view {
        return message;
    }
};

/// @brief Result type for operations that can fail
/// @tparam T Success value type
template<typename T>
class [[nodiscard]] Result {
public:
    /// @brief Success constructor
    explicit Result(T value) noexcept(std::is_nothrow_move_constructible_v<T>)
        : data_(std::move(value)) {}
    
    /// @brief Error constructor
    explicit Result(Error error) noexcept(std::is_nothrow_move_constructible_v<Error>)
        : data_(std::move(error)) {}
    
    // Movable only (safe ownership)
    Result(Result&&) noexcept = default;
    Result& operator=(Result&&) noexcept = default;
    
    // Non-copyable (ownership semantics)
    Result(const Result&) = delete;
    Result& operator=(const Result&) = delete;
    
    /// @brief Check if result contains a value
    [[nodiscard]] auto has_value() const noexcept -> bool { 
        return std::holds_alternative<T>(data_);
    }
    
    /// @brief Check if result contains an error
    [[nodiscard]] auto has_error() const noexcept -> bool { 
        return std::holds_alternative<Error>(data_);
    }
    
    /// @brief Get value (throws if error)
    [[nodiscard]] auto value() & -> T& {
        if (!has_value()) {
            throw std::runtime_error(std::get<Error>(data_).message);
        }
        return std::get<T>(data_);
    }
    
    [[nodiscard]] auto value() const& -> const T& {
        if (!has_value()) {
            throw std::runtime_error(std::get<Error>(data_).message);
        }
        return std::get<T>(data_);
    }
    
    [[nodiscard]] auto value() && -> T&& {
        if (!has_value()) {
            throw std::runtime_error(std::get<Error>(data_).message);
        }
        return std::move(std::get<T>(data_));
    }
    
    /// @brief Get error (undefined if has value)
    [[nodiscard]] auto error() const& -> const Error& {
        return std::get<Error>(data_);
    }
    
    /// @brief Boolean conversion (has value?)
    [[nodiscard]] explicit operator bool() const noexcept { 
        return has_value(); 
    }
    
    /// @brief Value or default
    [[nodiscard]] auto value_or(T default_value) && -> T {
        return has_value() ? std::move(std::get<T>(data_)) : std::move(default_value);
    }

private:
    std::variant<T, Error> data_;
};

/// @brief Result<void> specialization
template<>
class [[nodiscard]] Result<void> {
public:
    /// @brief Success constructor
    Result() noexcept : has_value_(true) {}
    
    /// @brief Error constructor
    explicit Result(Error error) noexcept
        : error_(std::move(error)), has_value_(false) {}
    
    [[nodiscard]] auto has_value() const noexcept -> bool { 
        return has_value_; 
    }
    
    [[nodiscard]] auto has_error() const noexcept -> bool { 
        return !has_value_; 
    }
    
    [[nodiscard]] auto error() const& -> const Error& {
        return error_;
    }
    
    [[nodiscard]] explicit operator bool() const noexcept { 
        return has_value_; 
    }

private:
    Error error_{};
    bool has_value_;
};

// ============================================================================
// Helper Functions
// ============================================================================

/// @brief Convert NodeType to string
[[nodiscard]] auto to_string(NodeType type) -> std::string_view;

/// @brief Convert DataType to string
[[nodiscard]] auto to_string(DataType type) -> std::string_view;

/// @brief Convert Language to string
[[nodiscard]] auto to_string(Language lang) -> std::string_view;

/// @brief Get color for DataType (for UI)
[[nodiscard]] auto get_color_for_type(DataType type) -> std::string_view;

}  // namespace visprog::core

// ============================================================================
// Hash Support (for unordered_map/unordered_set)
// ============================================================================

namespace std {

template<>
struct hash<visprog::core::NodeId> {
    auto operator()(const visprog::core::NodeId& id) const noexcept -> size_t {
        return hash<uint64_t>{}(id.value);
    }
};

template<>
struct hash<visprog::core::PortId> {
    auto operator()(const visprog::core::PortId& id) const noexcept -> size_t {
        return hash<uint64_t>{}(id.value);
    }
};

template<>
struct hash<visprog::core::ConnectionId> {
    auto operator()(const visprog::core::ConnectionId& id) const noexcept -> size_t {
        return hash<uint64_t>{}(id.value);
    }
};

template<>
struct hash<visprog::core::GraphId> {
    auto operator()(const visprog::core::GraphId& id) const noexcept -> size_t {
        return hash<uint64_t>{}(id.value);
    }
};

}  // namespace std
