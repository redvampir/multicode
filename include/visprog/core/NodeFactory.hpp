// Copyright (c) 2025 МультиКод Team. MIT License.

#pragma once

#include <atomic>
#include <memory>

#include "visprog/core/Node.hpp"

namespace visprog::core {

/// @brief Factory for creating nodes with predefined configurations.
class NodeFactory {
public:
    /// @brief Creates a node of a specified type.
    /// @param type The type of node to create.
    /// @param instance_name Optional name for the node instance.
    /// @return A unique_ptr to the newly created node, or nullptr if type is
    /// unknown.
    // clang-format off
    [[nodiscard]] static auto create(const NodeType& type, std::string instance_name = "")
        -> std::unique_ptr<Node>;
    // clang-format on

    /// @brief Creates a node with a specific ID, used during deserialization.
    [[nodiscard]] static auto create_with_id(NodeId node_id,
                                             const NodeType& type,
                                             std::string instance_name) -> std::unique_ptr<Node>;

    /// @brief Ensures the next generated ID is greater than the given value.
    static auto synchronize_id_counters(NodeId max_node_id, PortId max_port_id) -> void;

    /// @brief Принудительно выставляет счётчики ID (используется при десериализации snapshot).
    static auto force_id_counters(NodeId next_node_id, PortId next_port_id) -> void;

private:
    [[nodiscard]] static auto generate_node_id() -> NodeId;
    [[nodiscard]] static auto generate_port_id() -> PortId;

    /// @brief Configures the default ports for a newly created node.
    static auto configure_ports(Node& node) -> void;

    inline static std::atomic<std::uint64_t> next_node_id_{1};
    inline static std::atomic<std::uint64_t> next_port_id_{1};
};

}  // namespace visprog::core
