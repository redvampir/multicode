// Copyright (c) 2025 МультиКод Team. MIT License.

#pragma once

#include <memory>
#include <optional>
#include <span>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#include "visprog/core/Connection.hpp"
#include "visprog/core/Node.hpp"
#include "visprog/core/Types.hpp"

namespace visprog::core {

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
/// @details
/// - Manages nodes and connections
/// - Validates graph integrity
/// - Performs topological sort for code generation
/// - Thread-safe for reading, mutations require external synchronization
/// - Implements SOLID principles (SRP, OCP, LSP, ISP, DIP)
class Graph {
public:
    // ========================================================================
    // Construction
    // ========================================================================

    /// @brief Create an empty graph
    Graph();

    /// @brief Create graph with name
    explicit Graph(std::string name);

    /// @brief Create graph with ID
    explicit Graph(GraphId id);

    // Movable (ownership transfer)
    Graph(Graph&&) noexcept = default;
    Graph& operator=(Graph&&) noexcept = default;

    // Non-copyable (unique ownership)
    Graph(const Graph&) = delete;
    Graph& operator=(const Graph&) = delete;

    ~Graph() = default;

    // ========================================================================
    // Node Management
    // ========================================================================

    /// @brief Add a new node to the graph
    /// @param type Node type to create
    /// @param name Node name (optional)
    /// @return NodeId of the created node
    [[nodiscard]] auto add_node(NodeType type, std::string name = "") -> NodeId;

    /// @brief Add an existing node to the graph
    /// @param node Unique pointer to node (transfers ownership)
    /// @return NodeId of the added node
    [[nodiscard]] auto add_node(std::unique_ptr<Node> node) -> NodeId;

    /// @brief Remove a node from the graph
    /// @param id Node to remove
    /// @return Result indicating success or error
    auto remove_node(NodeId id) -> Result<void>;

    /// @brief Get node by ID (immutable)
    [[nodiscard]] auto get_node(NodeId id) const -> const Node*;

    /// @brief Get node by ID (mutable)
    [[nodiscard]] auto get_node_mut(NodeId id) -> Node*;

    /// @brief Get all nodes (immutable view)
    [[nodiscard]] auto get_nodes() const noexcept -> std::span<const std::unique_ptr<Node>>;

    /// @brief Check if node exists
    [[nodiscard]] auto has_node(NodeId id) const noexcept -> bool;

    /// @brief Get number of nodes
    [[nodiscard]] auto node_count() const noexcept -> std::size_t {
        return nodes_.size();
    }

    // ========================================================================
    // Connection Management
    // ========================================================================

    /// @brief Create a connection between two ports
    /// @param from_node Source node
    /// @param from_port Source port
    /// @param to_node Target node
    /// @param to_port Target port
    /// @return Result with ConnectionId or Error
    [[nodiscard]] auto connect(NodeId from_node,
                               PortId from_port,
                               NodeId to_node,
                               PortId to_port) -> Result<ConnectionId>;

    /// @brief Remove a connection
    /// @param id Connection to remove
    /// @return Result indicating success or error
    auto disconnect(ConnectionId id) -> Result<void>;

    /// @brief Get connection by ID
    [[nodiscard]] auto get_connection(ConnectionId id) const -> const Connection*;

    /// @brief Get all connections
    [[nodiscard]] auto get_connections() const noexcept -> std::span<const Connection>;

    /// @brief Get connections from a node
    [[nodiscard]] auto get_connections_from(NodeId node) const -> std::vector<ConnectionId>;

    /// @brief Get connections to a node
    [[nodiscard]] auto get_connections_to(NodeId node) const -> std::vector<ConnectionId>;

    /// @brief Check if connection exists
    [[nodiscard]] auto has_connection(ConnectionId id) const noexcept -> bool;

    /// @brief Get number of connections
    [[nodiscard]] auto connection_count() const noexcept -> std::size_t {
        return connections_.size();
    }

    // ========================================================================
    // Graph Algorithms
    // ========================================================================

    /// @brief Perform topological sort on the graph
    /// @return Sorted list of NodeIds (execution order) or Error if cycle detected
    [[nodiscard]] auto topological_sort() const -> Result<std::vector<NodeId>>;

    /// @brief Find all nodes reachable from given node
    /// @param start Starting node
    /// @return Set of reachable nodes
    [[nodiscard]] auto find_reachable_nodes(NodeId start) const -> std::unordered_set<NodeId>;

    /// @brief Check if there's a path from one node to another
    /// @param from Source node
    /// @param to Target node
    /// @return true if path exists
    [[nodiscard]] auto has_path(NodeId from, NodeId to) const -> bool;

    /// @brief Detect cycles in the graph
    /// @return true if graph contains cycles
    [[nodiscard]] auto has_cycles() const -> bool;

    /// @brief Find strongly connected components
    /// @return Vector of components (each component is a set of nodes)
    [[nodiscard]] auto find_strongly_connected_components() const
        -> std::vector<std::unordered_set<NodeId>>;

    // ========================================================================
    // Validation
    // ========================================================================

    /// @brief Validate entire graph
    /// @return ValidationResult with errors and warnings
    [[nodiscard]] auto validate() const -> ValidationResult;

    /// @brief Validate a specific connection
    [[nodiscard]] auto validate_connection(NodeId from_node,
                                           PortId from_port,
                                           NodeId to_node,
                                           PortId to_port) const -> Result<void>;

    // ========================================================================
    // Query
    // ========================================================================

    /// @brief Find Start node
    [[nodiscard]] auto find_start_node() const -> const Node*;

    /// @brief Find all End nodes
    [[nodiscard]] auto find_end_nodes() const -> std::vector<const Node*>;

    /// @brief Get all nodes of specific type
    [[nodiscard]] auto get_nodes_of_type(NodeType type) const -> std::vector<const Node*>;

    /// @brief Find nodes by name pattern
    [[nodiscard]] auto find_nodes_by_name(std::string_view pattern) const
        -> std::vector<const Node*>;

    // ========================================================================
    // Metadata
    // ========================================================================

    /// @brief Get graph ID
    [[nodiscard]] auto get_id() const noexcept -> GraphId {
        return id_;
    }

    /// @brief Set graph name
    auto set_name(std::string name) -> void {
        name_ = std::move(name);
    }

    /// @brief Get graph name
    [[nodiscard]] auto get_name() const noexcept -> std::string_view {
        return name_;
    }

    /// @brief Set metadata
    auto set_metadata(std::string key, std::string value) -> void;

    /// @brief Get metadata
    [[nodiscard]] auto get_metadata(std::string_view key) const -> std::optional<std::string_view>;

    /// @brief Access all metadata entries (for serialization/UI)
    [[nodiscard]] auto get_all_metadata() const noexcept
        -> const std::unordered_map<std::string, std::string>& {
        return metadata_;
    }

    // ========================================================================
    // Statistics
    // ========================================================================

    /// @brief Get graph statistics
    struct Statistics {
        std::size_t total_nodes{0};
        std::size_t total_connections{0};
        std::size_t execution_connections{0};
        std::size_t data_connections{0};
        std::size_t nodes_by_type[128]{};  // Count per NodeType
        std::size_t max_depth{0};          // Longest path
    };

    [[nodiscard]] auto get_statistics() const -> Statistics;

    // ========================================================================
    // Utility
    // ========================================================================

    /// @brief Clear all nodes and connections
    auto clear() -> void;

    /// @brief Check if graph is empty
    [[nodiscard]] auto empty() const noexcept -> bool {
        return nodes_.empty();
    }

private:
    friend class GraphSerializer;

    // ========================================================================
    // Helper Methods
    // ========================================================================

    /// @brief Generate next connection ID
    [[nodiscard]] auto generate_connection_id() -> ConnectionId;

    /// @brief Depth-first search helper for topological sort
    auto topological_sort_dfs(NodeId node,
                              std::unordered_set<NodeId>& visited,
                              std::unordered_set<NodeId>& in_stack,
                              std::vector<NodeId>& result) const -> bool;

    /// @brief DFS helper for reachability
    auto dfs_reachable(NodeId current, std::unordered_set<NodeId>& visited) const -> void;

    /// @brief Remove all connections associated with a node
    auto remove_node_connections(NodeId node) -> void;

    /// @brief Validate node exists
    [[nodiscard]] auto validate_node_exists(NodeId node) const -> Result<void>;

    /// @brief Validate port exists on node
    [[nodiscard]] auto validate_port_exists(NodeId node, PortId port) const -> Result<void>;

    /// @brief Append an existing connection (used during deserialization)
    auto append_connection(Connection connection) -> Result<void>;

    /// @brief Ensure connection ID counter is not behind highest ID
    auto seed_connection_counter(ConnectionId next) -> void;

    // ========================================================================
    // Member Variables
    // ========================================================================

    GraphId id_;
    std::string name_;

    // Node storage (ordered for stable iteration)
    std::vector<std::unique_ptr<Node>> nodes_;

    // Fast node lookup by ID
    std::unordered_map<NodeId, Node*> node_lookup_;

    // Connection storage
    std::vector<Connection> connections_;

    // Fast connection lookup by ID
    std::unordered_map<ConnectionId, std::size_t> connection_lookup_;

    // Adjacency list for graph algorithms (NodeId -> [ConnectionIds])
    std::unordered_map<NodeId, std::vector<ConnectionId>> adjacency_out_;
    std::unordered_map<NodeId, std::vector<ConnectionId>> adjacency_in_;

    // Metadata storage
    std::unordered_map<std::string, std::string> metadata_;

    // Connection ID counter
    ConnectionId next_connection_id_{1};
};

}  // namespace visprog::core
