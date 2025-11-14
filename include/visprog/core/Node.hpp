// Copyright (c) 2025 МультиКод Team. MIT License.

#pragma once

#include "visprog/core/Types.hpp"
#include "visprog/core/Port.hpp"
#include <string>
#include <vector>
#include <span>
#include <memory>
#include <optional>
#include <unordered_map>

namespace visprog::core {

/// @brief Node represents a single element in the visual programming graph
/// @details 
/// - Immutable ID and type after construction
/// - Movable but non-copyable (unique ownership)
/// - Thread-safe for reading, mutations require external synchronization
class Node {
public:
    // ========================================================================
    // Construction
    // ========================================================================
    
    /// @brief Create a new node
    /// @param id Unique node identifier
    /// @param type Type of node (Function, Variable, etc.)
    /// @param name Node name (e.g., "calculateSum")
    Node(NodeId id, NodeType type, std::string name);
    
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
    
    /// @brief Get unique node identifier
    [[nodiscard]] auto get_id() const noexcept -> NodeId { 
        return id_; 
    }
    
    /// @brief Get node type
    [[nodiscard]] auto get_type() const noexcept -> NodeType { 
        return type_; 
    }
    
    /// @brief Get node name
    [[nodiscard]] auto get_name() const noexcept -> std::string_view { 
        return name_; 
    }
    
    /// @brief Get display name (AI-generated human-readable name)
    [[nodiscard]] auto get_display_name() const noexcept -> std::string_view { 
        return display_name_.empty() ? name_ : display_name_; 
    }
    
    /// @brief Get all ports (immutable view)
    [[nodiscard]] auto get_ports() const noexcept -> std::span<const Port> { 
        return ports_; 
    }
    
    /// @brief Get input ports only
    [[nodiscard]] auto get_input_ports() const -> std::vector<const Port*>;
    
    /// @brief Get output ports only
    [[nodiscard]] auto get_output_ports() const -> std::vector<const Port*>;
    
    /// @brief Get execution input ports
    [[nodiscard]] auto get_exec_input_ports() const -> std::vector<const Port*>;
    
    /// @brief Get execution output ports
    [[nodiscard]] auto get_exec_output_ports() const -> std::vector<const Port*>;
    
    /// @brief Find port by ID
    [[nodiscard]] auto find_port(PortId id) const -> const Port*;
    
    /// @brief Check if node has execution flow (impure function)
    [[nodiscard]] auto has_execution_flow() const noexcept -> bool {
        return has_execution_flow_;
    }
    
    /// @brief Get node description/documentation
    [[nodiscard]] auto get_description() const noexcept -> std::string_view { 
        return description_; 
    }
    
    // ========================================================================
    // Mutators (non-const)
    // ========================================================================
    
    /// @brief Set display name (AI-generated or user-provided)
    auto set_display_name(std::string name) -> void {
        display_name_ = std::move(name);
    }
    
    /// @brief Set node description
    auto set_description(std::string description) -> void {
        description_ = std::move(description);
    }
    
    /// @brief Add an input port
    /// @return PortId of the created port
    auto add_input_port(DataType data_type, std::string name) -> PortId;
    
    /// @brief Add an output port
    /// @return PortId of the created port
    auto add_output_port(DataType data_type, std::string name) -> PortId;
    
    /// @brief Add execution input port (for control flow)
    /// @return PortId of the created port
    auto add_exec_input() -> PortId;
    
    /// @brief Add execution output port (for control flow)
    /// @return PortId of the created port
    auto add_exec_output() -> PortId;
    
    /// @brief Remove a port by ID
    /// @return Result indicating success or error
    auto remove_port(PortId id) -> Result<void>;
    
    // ========================================================================
    // Metadata (for code generation and UI)
    // ========================================================================
    
    /// @brief Set metadata key-value pair
    auto set_metadata(std::string key, std::string value) -> void;
    
    /// @brief Get metadata value
    [[nodiscard]] auto get_metadata(std::string_view key) const -> std::optional<std::string_view>;
    
    /// @brief Get all metadata
    [[nodiscard]] auto get_all_metadata() const noexcept 
        -> const std::unordered_map<std::string, std::string>& {
        return metadata_;
    }
    
    // ========================================================================
    // Validation
    // ========================================================================
    
    /// @brief Validate node configuration
    /// @return Result with error if invalid
    [[nodiscard]] auto validate() const -> Result<void>;
    
    // ========================================================================
    // Utility
    // ========================================================================
    
    /// @brief Equality comparison (by ID)
    [[nodiscard]] auto operator==(const Node& other) const noexcept -> bool {
        return id_ == other.id_;
    }
    
    /// @brief Three-way comparison (by ID)
    [[nodiscard]] auto operator<=>(const Node& other) const noexcept {
        return id_ <=> other.id_;
    }

private:
    // ========================================================================
    // Helper Methods
    // ========================================================================
    
    /// @brief Generate next port ID
    [[nodiscard]] auto generate_port_id() -> PortId;
    
    /// @brief Update execution flow flag
    auto update_execution_flow_flag() -> void;
    
    // ========================================================================
    // Member Variables
    // ========================================================================
    
    // Immutable after construction
    NodeId id_;
    NodeType type_;
    std::string name_;
    
    // Mutable state
    std::string display_name_;      ///< AI-generated or user-provided name
    std::string description_;       ///< Node documentation
    std::vector<Port> ports_;       ///< All ports (inputs and outputs)
    std::unordered_map<std::string, std::string> metadata_;  ///< Extra data
    
    // Cached flags
    bool has_execution_flow_{false};  ///< Does this node have exec ports?
};

}  // namespace visprog::core
