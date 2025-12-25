// Copyright (c) 2025 МультиКод Team. MIT License.

#pragma once

#include <compare>
#include <cstdint>
#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>
#include <variant>
#include <vector>

/// @brief Main namespace for Visual Programming Core
namespace visprog::core {

// ============================================================================
// Strong Type IDs (Type Safety)
// ============================================================================

/// @brief Strongly-typed Node identifier
struct NodeId {
    std::uint64_t value{0};

    [[nodiscard]] auto operator<=>(const NodeId&) const noexcept = default;
    [[nodiscard]] explicit operator bool() const noexcept {
        return value != 0;
    }
};

/// @brief Strongly-typed Port identifier
struct PortId {
    std::uint64_t value{0};

    [[nodiscard]] auto operator<=>(const PortId&) const noexcept = default;
    [[nodiscard]] explicit operator bool() const noexcept {
        return value != 0;
    }
};

/// @brief Strongly-typed Connection identifier
struct ConnectionId {
    std::uint64_t value{0};

    [[nodiscard]] auto operator<=>(const ConnectionId&) const noexcept = default;
    [[nodiscard]] explicit operator bool() const noexcept {
        return value != 0;
    }
};

/// @brief Strongly-typed Graph identifier
struct GraphId {
    std::uint64_t value{0};

    [[nodiscard]] auto operator<=>(const GraphId&) const noexcept = default;
    [[nodiscard]] explicit operator bool() const noexcept {
        return value != 0;
    }
};

// ============================================================================
// Node & Port Definitions
// ============================================================================

/// @brief Defines a type of node in the visual graph.
/// This is now a struct to allow for dynamic, string-based node definitions.
struct NodeType {
    std::string_view name;  // Unique identifier, e.g., "core.flow.start"
    std::string_view label; // Human-readable label, e.g., "Start"

    [[nodiscard]] auto operator<=>(const NodeType&) const noexcept = default;
};

/// @brief Predefined core node types.
/// Custom nodes will be loaded dynamically, but core nodes are defined here.
namespace NodeTypes {
    // Core Flow
    inline constexpr NodeType Start{.name = "core.flow.start", .label = "Start"};
    inline constexpr NodeType End{.name = "core.flow.end", .label = "End"};

    // I/O (New node for our prototype)
    inline constexpr NodeType PrintString{.name = "core.io.print_string", .label = "Print String"};
    
    // ... other core nodes like If, ForLoop, etc. will be added here
}

/// @brief Type of connection between nodes
enum class ConnectionType : std::uint8_t {
    Execution,  ///< Control flow (white arrow)
    Data,       ///< Data flow (colored by type)
};

/// @brief Port direction
enum class PortDirection : std::uint8_t {
    Input,   ///< Input port
    Output,  ///< Output port
    InOut,   ///< Bidirectional port
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
    
    // Strings
    String,
    StringView,
    Char,
    WChar,

    // Pointers and References
    Pointer,      ///< Pointer type (requires type_name)
    Reference,    ///< Reference type (requires type_name)
    
    // Containers
    Array,        ///< Fixed-size array (requires type_name)
    Vector,       ///< Dynamic array (requires type_name)
    Map,          ///< Key-value map (requires type_name)
    Set,          ///< Unique set (requires type_name)
    
    // User-defined types
    Struct,       ///< Struct type (requires type_name)
    Class,        ///< Class type (requires type_name)
    Enum,         ///< Enum type (requires type_name)
    Template,     ///< Template type (requires type_name)
    Object,       ///< Generic object

    // Special
    Execution,    ///< Execution flow (special type)
    Any,          ///< Any type (for generic nodes)
    Auto,         ///< Auto-deduced type
    Unknown,      ///< Unknown type
};

/// @brief Programming language target
enum class Language : std::uint8_t {
    Cpp,       ///< C++20/23
    Rust,      ///< Rust
    Assembly,  ///< x86-64 Assembly
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
template <typename T>
class [[nodiscard]] Result {
public:
    /// @brief Success constructor
    explicit Result(T value) noexcept(std::is_nothrow_move_constructible_v<T>)
        : data_(std::move(value)) {}

    /// @brief Error constructor
    explicit Result(Error error) noexcept(std::is_nothrow_move_constructible_v<Error>)
        : data_(std::move(error)) {}

    // Movable only
    Result(Result&&) noexcept = default;
    Result& operator=(Result&&) noexcept = default;

    // Non-copyable
    Result(const Result&) = delete;
    Result& operator=(const Result&) = delete;

    [[nodiscard]] auto has_value() const noexcept -> bool {
        return std::holds_alternative<T>(data_);
    }

    [[nodiscard]] auto has_error() const noexcept -> bool {
        return std::holds_alternative<Error>(data_);
    }

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

    [[nodiscard]] auto error() const& -> const Error& {
        return std::get<Error>(data_);
    }

    [[nodiscard]] explicit operator bool() const noexcept {
        return has_value();
    }

    [[nodiscard]] auto value_or(T default_value) && -> T {
        return has_value() ? std::move(std::get<T>(data_)) : std::move(default_value);
    }

private:
    std::variant<T, Error> data_;
};

/// @brief Result<void> specialization
template <>
class [[nodiscard]] Result<void> {
public:
    Result() noexcept : has_value_(true) {}
    explicit Result(Error error) noexcept : error_(std::move(error)), has_value_(false) {}

    [[nodiscard]] auto has_value() const noexcept -> bool { return has_value_; }
    [[nodiscard]] auto has_error() const noexcept -> bool { return !has_value_; }
    [[nodiscard]] auto error() const& -> const Error& { return error_; }
    [[nodiscard]] explicit operator bool() const noexcept { return has_value_; }

private:
    Error error_{};
    bool has_value_;
};

// ============================================================================
// Helper Functions
// ============================================================================

/// @brief Convert DataType to string
[[nodiscard]] auto to_string(DataType type) -> std::string_view;

/// @brief Convert Language to string
[[nodiscard]] auto to_string(Language lang) -> std::string_view;

/// @brief Get color for DataType (for UI)
[[nodiscard]] auto get_color_for_type(DataType type) -> std::string_view;

}  // namespace visprog::core

// ============================================================================
// Hash Support
// ============================================================================

namespace std {

template <>
struct hash<visprog::core::NodeId> {
    auto operator()(const visprog::core::NodeId& id) const noexcept -> size_t {
        return hash<uint64_t>{}(id.value);
    }
};

template <>
struct hash<visprog::core::PortId> {
    auto operator()(const visprog::core::PortId& id) const noexcept -> size_t {
        return hash<uint64_t>{}(id.value);
    }
};

template <>
struct hash<visprog::core::ConnectionId> {
    auto operator()(const visprog::core::ConnectionId& id) const noexcept -> size_t {
        return hash<uint64_t>{}(id.value);
    }
};

template <>
struct hash<visprog::core::GraphId> {
    auto operator()(const visprog::core::GraphId& id) const noexcept -> size_t {
        return hash<uint64_t>{}(id.value);
    }
};

template <>
struct hash<visprog::core::NodeType> {
    auto operator()(const visprog::core::NodeType& type) const noexcept -> size_t {
        return hash<string_view>{}(type.name);
    }
};

}  // namespace std
