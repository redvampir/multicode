// Copyright (c) 2025 МультиКод Team. MIT License.

#pragma once

#include <atomic>
#include <optional>
#include <string>

#include "visprog/core/Types.hpp"

namespace visprog::core {

/// @brief Port represents an input or output connection point on a Node
/// @details Immutable after creation (value semantics)
class Port {
public:
    /// @brief Generate globally unique PortId
    /// @note Thread-safe
    [[nodiscard]] static auto generate_unique_id() noexcept -> PortId;

    /// @brief Сдвинуть счётчик идентификаторов, если внешние данные содержат большие ID
    static auto synchronize_id_counter(PortId max_id) noexcept -> void;

    /// @brief Create a new port
    /// @param id Unique port identifier
    /// @param direction Input or output
    /// @param data_type Type of data this port handles
    /// @param name Port name (e.g., "value", "condition")
    Port(PortId id, PortDirection direction, DataType data_type, std::string name) noexcept;

    // Value semantics (copyable and movable)
    Port(const Port&) = default;
    Port(Port&&) noexcept = default;
    Port& operator=(const Port&) = default;
    Port& operator=(Port&&) noexcept = default;

    ~Port() = default;

    // ========================================================================
    // Accessors (const, noexcept)
    // ========================================================================

    /// @brief Get port unique identifier
    [[nodiscard]] auto get_id() const noexcept -> PortId {
        return id_;
    }

    /// @brief Get port direction (Input/Output/InOut)
    [[nodiscard]] auto get_direction() const noexcept -> PortDirection {
        return direction_;
    }

    /// @brief Get data type flowing through this port
    [[nodiscard]] auto get_data_type() const noexcept -> DataType {
        return data_type_;
    }

    /// @brief Get port name
    [[nodiscard]] auto get_name() const noexcept -> std::string_view {
        return name_;
    }

    /// @brief Get optional type name (for custom types)
    [[nodiscard]] auto get_type_name() const noexcept -> std::string_view {
        return type_name_;
    }

    /// @brief Check if this is an execution port
    [[nodiscard]] auto is_execution() const noexcept -> bool {
        return data_type_ == DataType::Execution;
    }

    /// @brief Check if port is input
    [[nodiscard]] auto is_input() const noexcept -> bool {
        return direction_ == PortDirection::Input;
    }

    /// @brief Check if port is output
    [[nodiscard]] auto is_output() const noexcept -> bool {
        return direction_ == PortDirection::Output;
    }

    // ========================================================================
    // Mutators
    // ========================================================================

    /// @brief Set custom type name for complex categories
    /// @details Разрешено только для типов, которые требуют явного имени
    ///          (указатели, контейнеры, пользовательские, шаблоны). При
    ///          успешной нормализации возвращает `true`. При недопустимом
    ///          вызове (например, для примитивов или с универсальным
    ///          маркером вне разрешённой категории) выбрасывает
    ///          `std::invalid_argument` с диагностикой.
    [[nodiscard]] auto set_type_name(std::string type_name) -> bool;

    // ========================================================================
    // Utility
    // ========================================================================

    /// @brief Check if two ports can be connected
    /// @param other Port to connect to
    /// @return true if connection is valid
    [[nodiscard]] auto can_connect_to(const Port& other) const noexcept -> bool;

    /// @brief Get color for this port type (for UI)
    [[nodiscard]] auto get_color() const noexcept -> std::string_view {
        return get_color_for_type(data_type_);
    }

    /// @brief Equality comparison
    [[nodiscard]] auto operator==(const Port& other) const noexcept -> bool {
        return id_ == other.id_;
    }

private:
    PortId id_;
    PortDirection direction_;
    DataType data_type_;
    std::string name_;
    std::string type_name_;  ///< For custom types (optional)

    static inline std::atomic<std::uint64_t> next_id_{1};  ///< Global PortId counter

    /// @brief Get color for data type
    [[nodiscard]] static auto get_color_for_type(DataType type) noexcept -> std::string_view;
};

}  // namespace visprog::core
