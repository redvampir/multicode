// Copyright (c) 2025 МультиКод Team. MIT License.

#pragma once

#include <memory>
#include <optional>
#include <span>
#include <string>
#include <unordered_map>
#include <variant>
#include <vector>

#include "visprog/core/Port.hpp"
#include "visprog/core/Types.hpp"

namespace visprog::core {

class GraphSerializer;

/// @brief A variant type for node-specific properties.
/// @details This allows nodes to store typed data (e.g., a default string, a number)
/// that is not connected to a data port. It's essential for custom node templates.
using NodeProperty = std::variant<std::string, double, std::int64_t, bool>;

/// @brief Represents a single element in the visual programming graph.
class Node {
public:
    // ========================================================================
    // Construction
    // ========================================================================

    /// @brief Create a new node.
    /// @param id Unique node identifier.
    /// @param type The type of node (contains name and label).
    /// @param instance_name An optional, user-defined name for this specific node instance.
    Node(NodeId id, NodeType type, std::string instance_name);

    // Movable (ownership transfer)
    Node(Node&&) noexcept = default;
    Node& operator=(Node&&) noexcept = default;

    // Non-copyable (unique ownership semantics)
    Node(const Node&) = delete;
    Node& operator=(const Node&) = delete;

    ~Node() = default;

    // ========================================================================
    // Immutable Properties (const, noexcept)
    // ========================================================================

    [[nodiscard]] auto get_id() const noexcept -> NodeId {
        return id_;
    }
    [[nodiscard]] auto get_type() const noexcept -> NodeType {
        return type_;
    }
    [[nodiscard]] auto get_instance_name() const noexcept -> std::string_view {
        return instance_name_;
    }
    [[nodiscard]] auto get_display_name() const noexcept -> std::string_view {
        return display_name_.empty() ? instance_name_ : display_name_;
    }
    [[nodiscard]] auto get_ports() const noexcept -> std::span<const Port> {
        return ports_;
    }
    [[nodiscard]] auto find_port(PortId id) const -> const Port*;
    [[nodiscard]] auto has_execution_flow() const noexcept -> bool {
        return has_execution_flow_;
    }
    [[nodiscard]] auto get_description() const noexcept -> std::string_view {
        return description_;
    }

    // ========================================================================
    // Computed Port Views
    // ========================================================================

    [[nodiscard]] auto get_input_ports() const -> std::vector<const Port*>;
    [[nodiscard]] auto get_output_ports() const -> std::vector<const Port*>;
    [[nodiscard]] auto get_exec_input_ports() const -> std::vector<const Port*>;
    [[nodiscard]] auto get_exec_output_ports() const -> std::vector<const Port*>;

    // ========================================================================
    // Mutators
    // ========================================================================

    auto set_display_name(std::string name) -> void {
        display_name_ = std::move(name);
    }
    auto set_description(std::string description) -> void {
        description_ = std::move(description);
    }
    auto add_input_port(DataType data_type, std::string name, PortId id) -> Port&;
    auto add_output_port(DataType data_type, std::string name, PortId id) -> Port&;
    auto remove_port(PortId id) -> Result<void>;

    // ========================================================================
    // Properties (Successor to Metadata)
    // ========================================================================

    /// @brief Set a node-specific property (e.g., a default value for a port).
    template <typename T>
    auto set_property(const std::string& key, T value) -> void {
        properties_[key] = std::move(value);
    }

    /// @brief Get a node-specific property.
    template <typename T>
    [[nodiscard]] auto get_property(std::string_view key) const -> std::optional<T> {
        if (auto it = properties_.find(std::string(key)); it != properties_.end()) {
            if (auto* val = std::get_if<T>(&it->second)) {
                return *val;
            }
        }
        return std::nullopt;
    }

    /// @brief Get all properties.
    [[nodiscard]] auto get_all_properties() const noexcept
        -> const std::unordered_map<std::string, NodeProperty>& {
        return properties_;
    }

    // ========================================================================
    // Validation & Utility
    // ========================================================================

    [[nodiscard]] auto validate() const -> Result<void>;
    [[nodiscard]] auto operator==(const Node& other) const noexcept -> bool {
        return id_ == other.id_;
    }
    [[nodiscard]] auto operator<=>(const Node& other) const noexcept {
        return id_ <=> other.id_;
    }

private:
    friend class GraphSerializer;
    friend class NodeFactory;

    auto append_port(Port port) -> void;
    auto update_execution_flow_flag() -> void;

    // Core immutable state
    NodeId id_;
    NodeType type_;
    std::string instance_name_;  // User-defined name for this instance

    // Mutable state
    std::string display_name_;  // AI-generated or user-set pretty name
    std::string description_;
    std::vector<Port> ports_;
    std::unordered_map<std::string, NodeProperty> properties_;  // Typed key-value data

    // Cached flags
    bool has_execution_flow_{false};
};

}  // namespace visprog::core
