// Copyright (c) 2025 МультиКод Team. MIT License.

#include "visprog/core/Graph.hpp"

#include <algorithm>
#include <queue>
#include <ranges>
#include <stack>
#include <unordered_set>

#include "visprog/core/FormatCompat.hpp"
#include "visprog/core/NodeFactory.hpp"

namespace visprog::core {

using compat::format;

namespace {

constexpr int kErrorConnectionNotFound = 200;
constexpr int kErrorConnectionNodeNotFound = 301;
constexpr int kErrorConnectionSourcePortNotFound = 302;
constexpr int kErrorConnectionTargetPortNotFound = 303;
constexpr int kErrorConnectionSelfReference = 304;
constexpr int kErrorConnectionTypeMismatch = 305;
constexpr int kErrorConnectionDuplicate = 306;

constexpr int kErrorValidationBrokenNodeRef = 510;
constexpr int kErrorValidationBrokenPortRef = 511;
constexpr int kErrorValidationLookupMismatch = 512;
constexpr int kErrorValidationTypeMismatch = 513;
constexpr int kErrorValidationAdjacencyMismatch = 514;

}  // namespace

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
        return NodeId{0};
    }

    const auto node_id = node->get_id();

    if (node_lookup_.contains(node_id)) {
        return NodeId{0};
    }

    node_lookup_[node_id] = node.get();
    nodes_.push_back(std::move(node));

    adjacency_out_[node_id] = {};
    adjacency_in_[node_id] = {};

    return node_id;
}

auto Graph::remove_node(NodeId id) -> Result<void> {
    if (auto result = validate_node_exists(id); !result) {
        return result;
    }

    remove_node_connections(id);
    node_lookup_.erase(id);
    adjacency_out_.erase(id);
    adjacency_in_.erase(id);

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
    if (auto result = validate_connection(from_node, from_port, to_node, to_port); !result) {
        return Result<ConnectionId>(result.error());
    }

    const auto* from_node_ptr = get_node(from_node);
    const auto* from_port_ptr = from_node_ptr->find_port(from_port);

    const auto conn_type =
        from_port_ptr->is_execution() ? ConnectionType::Execution : ConnectionType::Data;

    const auto conn_id = generate_connection_id();

    Connection conn{.id = conn_id,
                    .from_node = from_node,
                    .from_port = from_port,
                    .to_node = to_node,
                    .to_port = to_port,
                    .type = conn_type};

    const auto index = connections_.size();
    connections_.push_back(conn);
    connection_lookup_[conn_id] = index;

    adjacency_out_[from_node].push_back(conn_id);
    adjacency_in_[to_node].push_back(conn_id);

    return Result<ConnectionId>(conn_id);
}

auto Graph::disconnect(ConnectionId id) -> Result<void> {
    auto it = connection_lookup_.find(id);
    if (it == connection_lookup_.end()) {
        return Result<void>(
            Error{.message = "Connection not found", .code = kErrorConnectionNotFound});
    }

    const auto index = it->second;
    const auto conn = connections_[index];

    auto& out_list = adjacency_out_[conn.from_node];
    std::erase(out_list, id);

    auto& in_list = adjacency_in_[conn.to_node];
    std::erase(in_list, id);

    connection_lookup_.erase(it);

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

auto Graph::connection_count() const noexcept -> std::size_t {
    return connections_.size();
}

auto Graph::validate() const -> ValidationResult {
    ValidationResult result{};

    const auto add_error = [&result](std::string message, int code) {
        result.is_valid = false;
        result.errors.push_back(Error{.message = std::move(message), .code = code});
    };

    std::unordered_set<ConnectionId> seen_connection_ids;
    for (std::size_t index = 0; index < connections_.size(); ++index) {
        const auto& conn = connections_[index];

        if (!seen_connection_ids.insert(conn.id).second) {
            add_error(format("Duplicate connection id in storage: ", conn.id.value),
                      kErrorValidationLookupMismatch);
        }

        if (auto lookup_it = connection_lookup_.find(conn.id);
            lookup_it == connection_lookup_.end()) {
            add_error(format("Missing lookup entry for connection ", conn.id.value),
                      kErrorValidationLookupMismatch);
        } else if (lookup_it->second != index) {
            add_error(format("Lookup index mismatch for connection ", conn.id.value),
                      kErrorValidationLookupMismatch);
        }

        const auto* from_node = get_node(conn.from_node);
        const auto* to_node = get_node(conn.to_node);

        if (from_node == nullptr || to_node == nullptr) {
            add_error(format("Connection ", conn.id.value, " references missing node"),
                      kErrorValidationBrokenNodeRef);
            continue;
        }

        const auto* from_port = from_node->find_port(conn.from_port);
        const auto* to_port = to_node->find_port(conn.to_port);

        if (from_port == nullptr || to_port == nullptr) {
            add_error(format("Connection ", conn.id.value, " references missing port"),
                      kErrorValidationBrokenPortRef);
            continue;
        }

        const bool connection_type_matches =
            (conn.type == ConnectionType::Execution && from_port->is_execution() &&
             to_port->is_execution()) ||
            (conn.type == ConnectionType::Data && !from_port->is_execution() &&
             !to_port->is_execution());

        if (!connection_type_matches || !from_port->can_connect_to(*to_port)) {
            add_error(format("Connection ", conn.id.value, " has incompatible port types"),
                      kErrorValidationTypeMismatch);
        }

        const auto out_it = adjacency_out_.find(conn.from_node);
        if (out_it == adjacency_out_.end() ||
            std::count(out_it->second.begin(), out_it->second.end(), conn.id) != 1) {
            add_error(format("Outgoing adjacency mismatch for connection ", conn.id.value),
                      kErrorValidationAdjacencyMismatch);
        }

        const auto in_it = adjacency_in_.find(conn.to_node);
        if (in_it == adjacency_in_.end() ||
            std::count(in_it->second.begin(), in_it->second.end(), conn.id) != 1) {
            add_error(format("Incoming adjacency mismatch for connection ", conn.id.value),
                      kErrorValidationAdjacencyMismatch);
        }
    }

    for (const auto& [conn_id, index] : connection_lookup_) {
        if (index >= connections_.size()) {
            add_error(format("Lookup points outside connection storage for id ", conn_id.value),
                      kErrorValidationLookupMismatch);
            continue;
        }

        if (connections_[index].id != conn_id) {
            add_error(format("Lookup points to wrong connection id for ", conn_id.value),
                      kErrorValidationLookupMismatch);
        }
    }

    const auto validate_adjacency =
        [&](const auto& adjacency, bool outgoing, const char* direction) {
            for (const auto& [node_id, connection_ids] : adjacency) {
                if (!has_node(node_id)) {
                    add_error(
                        format("Adjacency ", direction, " references missing node ", node_id.value),
                        kErrorValidationBrokenNodeRef);
                }

                for (const auto conn_id : connection_ids) {
                    const auto lookup_it = connection_lookup_.find(conn_id);
                    if (lookup_it == connection_lookup_.end()) {
                        add_error(format("Adjacency ",
                                         direction,
                                         " references missing connection ",
                                         conn_id.value),
                                  kErrorValidationAdjacencyMismatch);
                        continue;
                    }

                    const auto& conn = connections_[lookup_it->second];
                    const auto expected_node = outgoing ? conn.from_node : conn.to_node;
                    if (expected_node != node_id) {
                        add_error(format("Adjacency ",
                                         direction,
                                         " references connection with wrong endpoint ",
                                         conn_id.value),
                                  kErrorValidationAdjacencyMismatch);
                    }
                }
            }
        };

    validate_adjacency(adjacency_out_, true, "out");
    validate_adjacency(adjacency_in_, false, "in");

    return result;
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
        return Result<void>(Error{"Node does not exist", kErrorConnectionNodeNotFound});
    }
    return Result<void>();
}

auto Graph::validate_connection(NodeId from_node,
                                PortId from_port,
                                NodeId to_node,
                                PortId to_port) const -> Result<void> {
    if (!has_node(from_node) || !has_node(to_node)) {
        return Result<void>(Error{"Node does not exist", kErrorConnectionNodeNotFound});
    }

    if (from_node == to_node) {
        return Result<void>(Error{"Self-connection is not allowed", kErrorConnectionSelfReference});
    }

    const auto* from_node_ptr = get_node(from_node);
    const auto* to_node_ptr = get_node(to_node);

    const auto* source_port = from_node_ptr->find_port(from_port);
    if (source_port == nullptr) {
        return Result<void>(
            Error{"Source port does not exist", kErrorConnectionSourcePortNotFound});
    }

    const auto* target_port = to_node_ptr->find_port(to_port);
    if (target_port == nullptr) {
        return Result<void>(
            Error{"Target port does not exist", kErrorConnectionTargetPortNotFound});
    }

    if (!source_port->can_connect_to(*target_port)) {
        return Result<void>(Error{"Incompatible port types", kErrorConnectionTypeMismatch});
    }

    const bool duplicate_connection =
        std::ranges::any_of(connections_, [=](const Connection& conn) {
            return conn.from_node == from_node && conn.from_port == from_port &&
                   conn.to_node == to_node && conn.to_port == to_port;
        });

    if (duplicate_connection) {
        return Result<void>(Error{"Duplicate connection", kErrorConnectionDuplicate});
    }

    return Result<void>();
}

auto Graph::generate_connection_id() -> ConnectionId {
    return ConnectionId{next_connection_id_.value++};
}

auto Graph::remove_node_connections(NodeId node) -> void {
    std::unordered_set<ConnectionId> to_remove;

    if (const auto out_it = adjacency_out_.find(node); out_it != adjacency_out_.end()) {
        to_remove.insert(out_it->second.begin(), out_it->second.end());
    }

    if (const auto in_it = adjacency_in_.find(node); in_it != adjacency_in_.end()) {
        to_remove.insert(in_it->second.begin(), in_it->second.end());
    }

    for (const auto connection_id : to_remove) {
        [[maybe_unused]] auto result = disconnect(connection_id);
    }
}

}  // namespace visprog::core
