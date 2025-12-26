// Copyright (c) 2025 МультиКод Team. MIT License.

#include "visprog/core/Graph.hpp"

#include <algorithm>
#include <queue>
#include <ranges>
#include <stack>

#include "visprog/core/FormatCompat.hpp"
#include "visprog/core/NodeFactory.hpp"

namespace visprog::core {

using compat::format;

// ============================================================================
// Construction
// ============================================================================

Graph::Graph()
    : id_{GraphId{1}},
      name_("Untitled Graph"),
      nodes_(),
      node_lookup_(),
      connections_(),
      connection_lookup_(),
      adjacency_out_(),
      adjacency_in_(),
      metadata_(),
      next_connection_id_{1} {}

Graph::Graph(std::string name)
    : id_{GraphId{1}},
      name_(std::move(name)),
      nodes_(),
      node_lookup_(),
      connections_(),
      connection_lookup_(),
      adjacency_out_(),
      adjacency_in_(),
      metadata_(),
      next_connection_id_{1} {}

Graph::Graph(GraphId id)
    : id_(id),
      name_("Untitled Graph"),
      nodes_(),
      node_lookup_(),
      connections_(),
      connection_lookup_(),
      adjacency_out_(),
      adjacency_in_(),
      metadata_(),
      next_connection_id_{1} {}

// ============================================================================
// Node Management
// ============================================================================

auto Graph::add_node(NodeType type, std::string name) -> NodeId {
    auto node = NodeFactory::create(type, std::move(name));
    return add_node(std::move(node));
}

auto Graph::add_node(std::unique_ptr<Node> node) -> NodeId {
    if (!node) {
        return NodeId{0};  // Invalid
    }

    const auto node_id = node->get_id();

    // Check for duplicate ID
    if (node_lookup_.contains(node_id)) {
        return NodeId{0};  // Already exists
    }

    // Add to lookup first (pointer will remain valid)
    node_lookup_[node_id] = node.get();

    // Add to storage
    nodes_.push_back(std::move(node));

    // Initialize adjacency lists
    adjacency_out_[node_id] = {};
    adjacency_in_[node_id] = {};

    return node_id;
}

auto Graph::remove_node(NodeId id) -> Result<void> {
    // Validate node exists
    if (auto result = validate_node_exists(id); !result) {
        return result;
    }

    // Remove all connections involving this node
    remove_node_connections(id);

    // Remove from lookup
    node_lookup_.erase(id);

    // Remove from adjacency lists
    adjacency_out_.erase(id);
    adjacency_in_.erase(id);

    // Remove from storage (expensive, but maintains order)
    auto it = std::ranges::find_if(nodes_, [id](const auto& node) { return node->get_id() == id; });

    if (it != nodes_.end()) {
        nodes_.erase(it);
    }

    return Result<void>();
}

auto Graph::get_node(NodeId id) const -> const Node* {
    if (auto it = node_lookup_.find(id); it != node_lookup_.end()) {
        return it->second;
    }
    return nullptr;
}

auto Graph::get_node_mut(NodeId id) -> Node* {
    if (auto it = node_lookup_.find(id); it != node_lookup_.end()) {
        return it->second;
    }
    return nullptr;
}

auto Graph::get_nodes() const noexcept -> std::span<const std::unique_ptr<Node>> {
    return nodes_;
}

auto Graph::has_node(NodeId id) const noexcept -> bool {
    return node_lookup_.contains(id);
}

// ============================================================================
// Connection Management
// ============================================================================

// clang-format off
auto Graph::connect(NodeId from_node, PortId from_port, NodeId to_node, PortId to_port)
    -> Result<ConnectionId> {
    // Validate connection
    if (auto result = validate_connection(from_node, from_port, to_node, to_port); !result) {
        return Result<ConnectionId>(result.error());
    }

    // Get ports to determine connection type
    const auto* from_node_ptr = get_node(from_node);
    const auto* to_node_ptr = get_node(to_node);

    const auto* from_port_ptr = from_node_ptr->find_port(from_port);
    [[maybe_unused]] const auto* to_port_ptr = to_node_ptr->find_port(to_port);

    const auto conn_type =
        from_port_ptr->is_execution() ? ConnectionType::Execution : ConnectionType::Data;

    // Create connection
    const auto conn_id = generate_connection_id();

    Connection conn{.id = conn_id,
                    .from_node = from_node,
                    .from_port = from_port,
                    .to_node = to_node,
                    .to_port = to_port,
                    .type = conn_type};

    // Add to storage
    const auto index = connections_.size();
    connections_.push_back(conn);
    connection_lookup_[conn_id] = index;

    // Update adjacency lists
    adjacency_out_[from_node].push_back(conn_id);
    adjacency_in_[to_node].push_back(conn_id);

    return Result<ConnectionId>(conn_id);
}
// clang-format on

auto Graph::disconnect(ConnectionId id) -> Result<void> {
    // Find connection
    auto it = connection_lookup_.find(id);
    if (it == connection_lookup_.end()) {
        return Result<void>(Error{.message = "Connection not found", .code = 200});
    }

    const auto index = it->second;
    const auto& conn = connections_[index];

    // Remove from adjacency lists
    auto& out_list = adjacency_out_[conn.from_node];
    std::erase(out_list, id);

    auto& in_list = adjacency_in_[conn.to_node];
    std::erase(in_list, id);

    // Remove from lookup
    connection_lookup_.erase(it);

    // Remove from storage (swap with last and pop)
    if (index < connections_.size() - 1) {
        connections_[index] = std::move(connections_.back());
        connection_lookup_[connections_[index].id] = index;
    }
    connections_.pop_back();

    return Result<void>();
}

auto Graph::get_connection(ConnectionId id) const -> const Connection* {
    if (auto it = connection_lookup_.find(id); it != connection_lookup_.end()) {
        return &connections_[it->second];
    }
    return nullptr;
}

auto Graph::get_connections() const noexcept -> std::span<const Connection> {
    return connections_;
}

auto Graph::get_connections_from(NodeId node) const -> std::vector<ConnectionId> {
    if (auto it = adjacency_out_.find(node); it != adjacency_out_.end()) {
        return it->second;
    }
    return {};
}

auto Graph::get_connections_to(NodeId node) const -> std::vector<ConnectionId> {
    if (auto it = adjacency_in_.find(node); it != adjacency_in_.end()) {
        return it->second;
    }
    return {};
}

auto Graph::has_connection(ConnectionId id) const noexcept -> bool {
    return connection_lookup_.contains(id);
}

// ============================================================================
// Graph Algorithms
// ============================================================================

auto Graph::topological_sort() const -> Result<std::vector<NodeId>> {
    std::vector<NodeId> result;
    result.reserve(nodes_.size());

    std::unordered_set<NodeId> visited;
    std::unordered_set<NodeId> in_stack;

    // Start from all nodes (to handle disconnected components)
    for (const auto& node : nodes_) {
        const auto node_id = node->get_id();

        if (!visited.contains(node_id)) {
            const bool has_cycle = topological_sort_dfs(node_id, visited, in_stack, result);

            if (has_cycle) {
                return Result<std::vector<NodeId>>(Error{
                    .message = "Graph contains cycles - cannot perform topological sort",
                    .code = 400  // Cycle error
                });
            }
        }
    }

    // Reverse to get correct order
    std::ranges::reverse(result);

    return Result<std::vector<NodeId>>(std::move(result));
}

auto Graph::topological_sort_dfs(NodeId node,
                                 std::unordered_set<NodeId>& visited,
                                 std::unordered_set<NodeId>& in_stack,
                                 std::vector<NodeId>& result) const -> bool {
    visited.insert(node);
    in_stack.insert(node);

    // Visit all neighbors (follow execution flow connections)
    const auto outgoing = get_connections_from(node);

    for (const auto conn_id : outgoing) {
        const auto* conn = get_connection(conn_id);
        if (conn == nullptr) {
            // The adjacency list references a connection that no longer exists.
            // Skip gracefully to preserve the algorithm's safety guarantees.
            continue;
        }

        // Only follow execution connections for topological sort
        if (conn->type != ConnectionType::Execution) {
            continue;
        }

        const auto next_node = conn->to_node;

        if (in_stack.contains(next_node)) {
            // Cycle detected!
            return true;
        }

        if (!visited.contains(next_node)) {
            if (topological_sort_dfs(next_node, visited, in_stack, result)) {
                return true;
            }
        }
    }

    in_stack.erase(node);
    result.push_back(node);

    return false;
}

auto Graph::find_reachable_nodes(NodeId start) const -> std::unordered_set<NodeId> {
    std::unordered_set<NodeId> visited;
    dfs_reachable(start, visited);
    return visited;
}

auto Graph::dfs_reachable(NodeId current, std::unordered_set<NodeId>& visited) const -> void {
    visited.insert(current);

    const auto outgoing = get_connections_from(current);

    for (const auto conn_id : outgoing) {
        const auto* conn = get_connection(conn_id);
        if (conn == nullptr) {
            continue;
        }
        const auto next_node = conn->to_node;

        if (!visited.contains(next_node)) {
            dfs_reachable(next_node, visited);
        }
    }
}

auto Graph::has_path(NodeId from, NodeId to) const -> bool {
    if (from == to) {
        return true;
    }

    const auto reachable = find_reachable_nodes(from);
    return reachable.contains(to);
}

auto Graph::has_cycles() const -> bool {
    std::unordered_set<NodeId> visited;
    std::unordered_set<NodeId> in_stack;

    for (const auto& node : nodes_) {
        const auto node_id = node->get_id();

        if (!visited.contains(node_id)) {
            std::vector<NodeId> dummy_result;
            if (topological_sort_dfs(node_id, visited, in_stack, dummy_result)) {
                return true;
            }
        }
    }

    return false;
}

auto Graph::find_strongly_connected_components() const -> std::vector<std::unordered_set<NodeId>> {
    // Tarjan's algorithm for finding SCCs
    // TODO: Implement if needed for advanced features
    return {};
}

// ============================================================================
// Validation
// ============================================================================

auto Graph::validate() const -> ValidationResult {
    ValidationResult result;

    // Check 1: Must have at least one Start node
    const auto* start = find_start_node();
    if (!start) {
        result.errors.push_back(Error{
            .message = "Graph must have exactly one Start node",
            .code = 500  // Missing Start node
        });
        result.is_valid = false;
    }

    // Check 2: Must have at least one End node
    const auto ends = find_end_nodes();
    if (ends.empty()) {
        result.warnings.push_back(Error{
            .message = "Graph should have at least one End node",
            .code = 501  // Missing End node
        });
    }

    // Check 3: Validate each node
    for (const auto& node : nodes_) {
        if (auto node_result = node->validate(); !node_result) {
            result.errors.push_back(node_result.error());
            result.is_valid = false;
        }
    }

    // Check 4: No cycles in execution flow
    if (has_cycles()) {
        result.errors.push_back(Error{
            .message = "Graph contains cycles in execution flow",
            .code = 400  // Cycle detected
        });
        result.is_valid = false;
    }

    // Check 5: Graph must have execution connections (if multiple nodes)
    if (start && connections_.empty() && nodes_.size() > 1) {
        result.errors.push_back(Error{
            .message = "Graph has no execution flow connections",
            .code = 501  // Missing execution flow
        });
        result.is_valid = false;
    }

    // Check 6: All nodes reachable from Start
    if (start && !connections_.empty()) {
        const auto reachable = find_reachable_nodes(start->get_id());

        for (const auto& node : nodes_) {
            if (!reachable.contains(node->get_id()) && node->get_type() != NodeTypes::Start) {
                result.errors.push_back(Error{
                    .message = format("Node '", node->get_instance_name(),
                                      "' is not reachable from Start"),
                    .code = 503  // Unreachable nodes
                });
                result.is_valid = false;
            }
        }
    }

    // Check 7: Validate all connections
    for (const auto& conn : connections_) {
        if (auto conn_result =
                validate_connection(conn.from_node, conn.from_port, conn.to_node, conn.to_port);
            !conn_result) {
            result.errors.push_back(conn_result.error());
            result.is_valid = false;
        }
    }

    return result;
}

auto Graph::validate_connection(NodeId from_node,
                                PortId from_port,
                                NodeId to_node,
                                PortId to_port) const -> Result<void> {
    // Validate nodes exist
    if (auto result = validate_node_exists(from_node); !result) {
        return result;
    }

    if (auto result = validate_node_exists(to_node); !result) {
        return result;
    }

    // Validate ports exist
    if (auto result = validate_port_exists(from_node, from_port); !result) {
        return result;
    }

    if (auto result = validate_port_exists(to_node, to_port); !result) {
        return result;
    }

    // Get ports
    const auto* from_node_ptr = get_node(from_node);
    const auto* to_node_ptr = get_node(to_node);

    const auto* from_port_ptr = from_node_ptr->find_port(from_port);
    const auto* to_port_ptr = to_node_ptr->find_port(to_port);

    // Check port compatibility
    if (!from_port_ptr->can_connect_to(*to_port_ptr)) {
        return Result<void>(Error{
            .message = format("Ports are not compatible: ",
                             from_node_ptr->get_instance_name(), " (",
                             from_port_ptr->get_name(), ") -> ",
                             to_node_ptr->get_instance_name(), " (",
                             to_port_ptr->get_name(), ")"),
            .code = 300  // Port incompatibility
        });
    }

    // Check: No self-loops
    if (from_node == to_node) {
        return Result<void>(Error{
            .message = "Self-loops are not allowed",
            .code = 304  // Self-loop error
        });
    }

    return Result<void>();
}

// ============================================================================
// Query
// ============================================================================

auto Graph::find_start_node() const -> const Node* {
    for (const auto& node : nodes_) {
        if (node->get_type() == NodeTypes::Start) {
            return node.get();
        }
    }
    return nullptr;
}

auto Graph::find_end_nodes() const -> std::vector<const Node*> {
    std::vector<const Node*> result;

    for (const auto& node : nodes_) {
        if (node->get_type() == NodeTypes::End) {
            result.push_back(node.get());
        }
    }

    return result;
}

auto Graph::get_nodes_of_type(NodeType type) const -> std::vector<const Node*> {
    std::vector<const Node*> result;

    for (const auto& node : nodes_) {
        if (node->get_type() == type) {
            result.push_back(node.get());
        }
    }

    return result;
}

auto Graph::find_nodes_by_name(std::string_view pattern) const -> std::vector<const Node*> {
    std::vector<const Node*> result;

    for (const auto& node : nodes_) {
        if (node->get_instance_name().find(pattern) != std::string_view::npos) {
            result.push_back(node.get());
        }
    }

    return result;
}

// ============================================================================
// Metadata
// ============================================================================

auto Graph::set_metadata(std::string key, std::string value) -> void {
    metadata_[std::move(key)] = std::move(value);
}

auto Graph::get_metadata(std::string_view key) const -> std::optional<std::string_view> {
    if (auto it = metadata_.find(std::string(key)); it != metadata_.end()) {
        return it->second;
    }
    return std::nullopt;
}

// ============================================================================
// Statistics
// ============================================================================

auto Graph::get_statistics() const -> Statistics {
    Statistics stats;

    stats.total_nodes = nodes_.size();
    stats.total_connections = connections_.size();

    // Count connection types
    for (const auto& conn : connections_) {
        if (conn.type == ConnectionType::Execution) {
            ++stats.execution_connections;
        } else {
            ++stats.data_connections;
        }
    }

    // Count nodes by type (using type name as key)
    // Note: nodes_by_type map uses string names instead of integer indices
    // This is because NodeType is now a struct with a string name
    for ([[maybe_unused]] const auto& node : nodes_) {
        // For now, we just count all nodes as "other" type
        // A proper implementation would use a string-keyed map
        ++stats.nodes_by_type[0];  // Simplified: count all as type 0
    }

    // Calculate max depth (longest path from Start)
    const auto* start = find_start_node();
    if (start) {
        // BFS to find max depth
        std::unordered_map<NodeId, std::size_t> depths;
        std::queue<NodeId> queue;

        depths[start->get_id()] = 0;
        queue.push(start->get_id());

        while (!queue.empty()) {
            const auto current = queue.front();
            queue.pop();

            const auto current_depth = depths[current];
            stats.max_depth = std::max(stats.max_depth, current_depth);

            const auto outgoing = get_connections_from(current);
            for (const auto conn_id : outgoing) {
                const auto* conn = get_connection(conn_id);
                if (conn == nullptr) {
                    continue;
                }
                if (conn->type == ConnectionType::Execution) {
                    const auto next = conn->to_node;
                    if (!depths.contains(next)) {
                        depths[next] = current_depth + 1;
                        queue.push(next);
                    }
                }
            }
        }
    }

    return stats;
}

// ============================================================================
// Utility
// ============================================================================

auto Graph::clear() -> void {
    nodes_.clear();
    node_lookup_.clear();
    connections_.clear();
    connection_lookup_.clear();
    adjacency_out_.clear();
    adjacency_in_.clear();
    metadata_.clear();
    next_connection_id_ = ConnectionId{1};
}

// ============================================================================
// Helper Methods
// ============================================================================

auto Graph::generate_connection_id() -> ConnectionId {
    return ConnectionId{next_connection_id_.value++};
}

auto Graph::remove_node_connections(NodeId node) -> void {
    // Get all connections involving this node
    auto outgoing = get_connections_from(node);
    auto incoming = get_connections_to(node);

    // Combine both lists
    std::vector<ConnectionId> to_remove;
    to_remove.reserve(outgoing.size() + incoming.size());
    to_remove.insert(to_remove.end(), outgoing.begin(), outgoing.end());
    to_remove.insert(to_remove.end(), incoming.begin(), incoming.end());

    // Remove duplicates
    std::ranges::sort(to_remove, [](ConnectionId a, ConnectionId b) { return a.value < b.value; });
    auto [first, last] = std::ranges::unique(to_remove);
    to_remove.erase(first, last);

    // Remove all connections
    for (const auto conn_id : to_remove) {
        [[maybe_unused]] auto _ = disconnect(conn_id);
    }
}

auto Graph::validate_node_exists(NodeId node) const -> Result<void> {
    if (!has_node(node)) {
        return Result<void>(Error{
            .message = format("Node ", node.value, " does not exist"),
            .code = 301  // Node not found
        });
    }
    return Result<void>();
}

auto Graph::validate_port_exists(NodeId node, PortId port) const -> Result<void> {
    const auto* node_ptr = get_node(node);
    if (!node_ptr) {
        return Result<void>(Error{
            .message = format("Node ", node.value, " does not exist"),
            .code = 301  // Node not found
        });
    }

    const auto* port_ptr = node_ptr->find_port(port);
    if (!port_ptr) {
        return Result<void>(Error{
            .message = format("Port ", port.value, " does not exist on node ", node.value),
            .code = 302  // Port not found
        });
    }

    return Result<void>();
}

auto Graph::append_connection(Connection connection) -> Result<void> {
    if (!connection.id) {
        return Result<void>(Error{.message = "Connection ID must be non-zero", .code = 305});
    }

    if (connection_lookup_.contains(connection.id)) {
        return Result<void>(
            Error{.message = format("Connection ", connection.id.value, " already exists"),
                  .code = 306});
    }

    if (auto result = validate_connection(
            connection.from_node, connection.from_port, connection.to_node, connection.to_port);
        !result) {
        return result;
    }

    const auto* from_node_ptr = get_node(connection.from_node);
    const auto* from_port_ptr =
        from_node_ptr != nullptr ? from_node_ptr->find_port(connection.from_port) : nullptr;

    if (from_port_ptr == nullptr) {
        return Result<void>(
            Error{.message = "Source port missing during connection append", .code = 307});
    }

    const auto expected_type =
        from_port_ptr->is_execution() ? ConnectionType::Execution : ConnectionType::Data;

    if (expected_type != connection.type) {
        return Result<void>(Error{
            .message = format("Connection ", connection.id.value, " type mismatch: expected ",
                             (expected_type == ConnectionType::Execution ? "Execution" : "Data"),
                             " but got ",
                             (connection.type == ConnectionType::Execution ? "Execution" : "Data")),
            .code = 308});
    }

    const auto index = connections_.size();
    connections_.push_back(connection);
    connection_lookup_[connection.id] = index;
    adjacency_out_[connection.from_node].push_back(connection.id);
    adjacency_in_[connection.to_node].push_back(connection.id);

    seed_connection_counter(ConnectionId{connection.id.value + 1});

    return Result<void>();
}

auto Graph::seed_connection_counter(ConnectionId next) -> void {
    if (next_connection_id_.value < next.value) {
        next_connection_id_ = next;
    }
}

}  // namespace visprog::core
