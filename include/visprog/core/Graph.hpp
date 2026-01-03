// Copyright (c) 2025 МультиКод Team. MIT License.

#pragma once

#include <memory>
#include <optional>
#include <span>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#include "visprog/core/Connection.hpp"
#include "visprog/core/Node.hpp"
#include "visprog/core/Types.hpp"

namespace visprog::core {

/// @brief Describes a variable within the graph's scope
struct Variable {
    std::string name;
    DataType type{DataType::Unknown};
};

/// @brief Validation result with detailed error information
struct ValidationResult {
    bool is_valid{true};
    std::vector<Error> errors;
    std::vector<Error> warnings;

    [[nodiscard]] auto has_errors() const noexcept -> bool {
        return !errors.empty();
    }

    [[nodiscard]] auto has_warnings() const noexcept -> bool {
        return !warnings.empty();
    }

    [[nodiscard]] explicit operator bool() const noexcept {
        return is_valid;
    }
};

/// @brief Graph represents the entire visual programming graph
class Graph {
public:
    // ... (existing construction methods)
    Graph();
    explicit Graph(std::string name);
    explicit Graph(GraphId id);
    Graph(Graph&&) noexcept = default;
    Graph& operator=(Graph&&) noexcept = default;
    Graph(const Graph&) = delete;
    Graph& operator=(const Graph&) = delete;
    ~Graph() = default;

    // ... (existing node management)
    [[nodiscard]] auto add_node(NodeType type, std::string name) -> NodeId;
    [[nodiscard]] auto add_node(std::unique_ptr<Node> node) -> NodeId;
    auto remove_node(NodeId id) -> Result<void>;
    [[nodiscard]] auto get_node(NodeId id) const -> const Node*;
    [[nodiscard]] auto get_node_mut(NodeId id) -> Node*;
    [[nodiscard]] auto get_nodes() const noexcept -> std::span<const std::unique_ptr<Node>>;
    [[nodiscard]] auto has_node(NodeId id) const noexcept -> bool;
    [[nodiscard]] auto node_count() const noexcept -> std::size_t;

    // ... (existing connection management)
    [[nodiscard]] auto connect(NodeId from_node,
                               PortId from_port,
                               NodeId to_node,
                               PortId to_port) -> Result<ConnectionId>;
    auto disconnect(ConnectionId id) -> Result<void>;
    [[nodiscard]] auto get_connection(ConnectionId id) const -> const Connection*;
    [[nodiscard]] auto get_connections() const noexcept -> std::span<const Connection>;
    [[nodiscard]] auto get_connections_from(NodeId node) const -> std::vector<ConnectionId>;
    [[nodiscard]] auto get_connections_to(NodeId node) const -> std::vector<ConnectionId>;
    [[nodiscard]] auto has_connection(ConnectionId id) const noexcept -> bool;
    [[nodiscard]] auto connection_count() const noexcept -> std::size_t;

    // ========================================================================
    // Variable Management
    // ========================================================================

    /// @brief Adds a new variable to the graph's scope
    auto add_variable(std::string name, DataType type) -> Result<void>;

    /// @brief Gets a variable by its name
    [[nodiscard]] auto get_variable(std::string_view name) const -> const Variable*;

    /// @brief Gets all variables defined in the graph
    [[nodiscard]] auto get_variables() const noexcept -> std::span<const Variable>;

    // ... (existing graph algorithms, validation, query, metadata, etc.)
    [[nodiscard]] auto validate() const -> ValidationResult;
    [[nodiscard]] auto get_id() const noexcept -> GraphId;
    void set_name(std::string name);
    [[nodiscard]] auto get_name() const noexcept -> std::string_view;
    auto clear() -> void;
    [[nodiscard]] auto empty() const noexcept -> bool;

private:
    friend class GraphSerializer;

    // ... (existing private members)
    GraphId id_;
    std::string name_;
    std::vector<std::unique_ptr<Node>> nodes_;
    std::unordered_map<NodeId, Node*> node_lookup_;
    std::vector<Connection> connections_;
    std::unordered_map<ConnectionId, std::size_t> connection_lookup_;
    std::unordered_map<NodeId, std::vector<ConnectionId>> adjacency_out_;
    std::unordered_map<NodeId, std::vector<ConnectionId>> adjacency_in_;
    std::unordered_map<std::string, std::string> metadata_;
    ConnectionId next_connection_id_{1};

    // Graph-level variables
    std::vector<Variable> variables_;

    // Helper methods for node/connection management
    [[nodiscard]] auto generate_connection_id() -> ConnectionId;
    auto remove_node_connections(NodeId node) -> void;
    [[nodiscard]] auto validate_node_exists(NodeId id) const -> Result<void>;
    [[nodiscard]] auto validate_connection(NodeId from_node,
                                           PortId from_port,
                                           NodeId to_node,
                                           PortId to_port) const -> Result<void>;
};

}  // namespace visprog::core
