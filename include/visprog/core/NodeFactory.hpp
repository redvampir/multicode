// Copyright (c) 2025 МультиКод Team. MIT License.

#pragma once

#include "visprog/core/Node.hpp"
#include <atomic>
#include <memory>

namespace visprog::core {

/// @brief Factory for creating nodes with predefined configurations
/// @details 
/// - Implements Factory Pattern
/// - Each node type has specific port configuration
/// - Ensures consistency across the application
class NodeFactory {
public:
    /// @brief Create a node of specified type
    /// @param type Type of node to create
    /// @param name Node name (optional, will be generated if empty)
    /// @return Unique pointer to newly created node
    [[nodiscard]] static auto create(
        NodeType type,
        std::string name = ""
    ) -> std::unique_ptr<Node>;
    
    /// @brief Create a node with custom ID (for deserialization)
    /// @param id Node ID
    /// @param type Type of node
    /// @param name Node name
    /// @return Unique pointer to newly created node
    [[nodiscard]] static auto create_with_id(
        NodeId id,
        NodeType type,
        std::string name
    ) -> std::unique_ptr<Node>;

    /// @brief Ensure следующая выдача ID больше переданного значения
    static auto synchronize_id_counter(NodeId max_id) -> void;

private:
    /// @brief Generate next node ID
    [[nodiscard]] static auto generate_node_id() -> NodeId;
    
    /// @brief Configure ports for specific node type
    static auto configure_node(Node& node, NodeType type) -> void;
    
    /// @brief Generate default name for node type
    [[nodiscard]] static auto generate_default_name(NodeType type) -> std::string;
    
    // Thread-safe ID counter
    inline static std::atomic<std::uint64_t> next_id_{1};
};

}  // namespace visprog::core
