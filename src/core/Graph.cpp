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

// ... (existing Graph implementation)

// ============================================================================
// Variable Management
// ============================================================================

auto Graph::add_variable(std::string name, DataType type) -> Result<void> {
    if (name.empty()) {
        return Result<void>(Error{.message = "Variable name cannot be empty."});
    }

    auto it =
        std::ranges::find_if(variables_, [&name](const auto& var) { return var.name == name; });

    if (it != variables_.end()) {
        return Result<void>(Error{.message = format("Variable '", name, "' already exists.")});
    }

    variables_.push_back(Variable{std::move(name), type});
    return Result<void>();
}

auto Graph::get_variable(std::string_view name) const -> const Variable* {
    auto it =
        std::ranges::find_if(variables_, [name](const auto& var) { return var.name == name; });

    if (it != variables_.end()) {
        return &(*it);
    }

    return nullptr;
}

auto Graph::get_variables() const noexcept -> std::span<const Variable> {
    return variables_;
}

// ... (rest of Graph implementation)
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

auto Graph::node_count() const noexcept -> std::size_t {
    return nodes_.size();
}

auto Graph::has_node(NodeId id) const noexcept -> bool {
    return node_lookup_.contains(id);
}
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
auto Graph::validate() const -> ValidationResult {
    return ValidationResult{};
}

auto Graph::get_id() const noexcept -> GraphId {
    return id_;
}

void Graph::set_name(std::string name) {
    name_ = std::move(name);
}

auto Graph::get_name() const noexcept -> std::string_view {
    return name_;
}

auto Graph::clear() -> void {
    next_connection_id_ = ConnectionId{1};
}

auto Graph::empty() const noexcept -> bool {
    return nodes_.empty();
}

auto Graph::validate_node_exists(NodeId id) const -> Result<void> {
    if (!has_node(id)) {
        return Result<void>(Error{"Node does not exist", 404});
    }
    return Result<void>();
}

auto Graph::validate_connection(NodeId from_node, PortId from_port, NodeId to_node,
                                PortId to_port) const -> Result<void> {
    // Validate nodes exist
    if (auto result = validate_node_exists(from_node); !result) {
        return result;
    }
    if (auto result = validate_node_exists(to_node); !result) {
        return result;
    }

    // Validate ports exist
    const auto* from_node_ptr = get_node(from_node);
    const auto* to_node_ptr = get_node(to_node);

    if (!from_node_ptr->find_port(from_port)) {
        return Result<void>(Error{"Source port does not exist", 404});
    }
    if (!to_node_ptr->find_port(to_port)) {
        return Result<void>(Error{"Target port does not exist", 404});
    }

    return Result<void>();
}

auto Graph::generate_connection_id() -> ConnectionId {
    return ConnectionId{next_connection_id_.value++};
}
auto Graph::remove_node_connections(NodeId /*node*/) -> void {
    // TODO: Implement node connection removal
}

}  // namespace visprog::core
