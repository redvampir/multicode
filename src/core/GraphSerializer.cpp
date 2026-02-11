// Copyright (c) 2025 МультиКод Team. MIT License.

#include "visprog/core/GraphSerializer.hpp"

#include <algorithm>
#include <cstdint>
#include <limits>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_map>
#include <utility>

#include "visprog/core/FormatCompat.hpp"
#include "visprog/core/NodeFactory.hpp"
#include "visprog/core/Port.hpp"

namespace {

using visprog::core::compat::format;

using visprog::core::Connection;
using visprog::core::ConnectionId;
using visprog::core::ConnectionType;
using visprog::core::DataType;
using visprog::core::Error;
using visprog::core::Graph;
using visprog::core::GraphId;
using visprog::core::GraphSerializer;
using visprog::core::Node;
using visprog::core::NodeFactory;
using visprog::core::NodeId;
using visprog::core::NodeProperty;
using visprog::core::NodeType;
using visprog::core::Port;
using visprog::core::PortDirection;
using visprog::core::PortId;
using visprog::core::Result;

// Access NodeTypes namespace directly
namespace NodeTypes = visprog::core::NodeTypes;

// --- Error Codes ---
constexpr int kErrorInvalidDocument = 600;
constexpr int kErrorMissingField = 601;
constexpr int kErrorInvalidEnum = 602;
constexpr int kErrorPropertyValue = 603;
constexpr int kErrorTypeName = 604;
constexpr int kErrorConnection = 605;
constexpr int kErrorSchemaVersion = 606;

// --- String Conversion Utilities ---

[[nodiscard]] constexpr auto port_direction_to_string(PortDirection dir) noexcept
    -> std::string_view {
    return dir == PortDirection::Input ? "Input" : "Output";
}

[[maybe_unused]] [[nodiscard]] auto parse_port_direction(std::string_view val)
    -> std::optional<PortDirection> {
    if (val == "Input")
        return PortDirection::Input;
    if (val == "Output")
        return PortDirection::Output;
    return std::nullopt;
}

[[nodiscard]] auto build_data_type_lookup() -> std::unordered_map<std::string_view, DataType> {
    return {
        {"void", DataType::Void},
        {"bool", DataType::Bool},
        {"int32", DataType::Int32},
        {"int64", DataType::Int64},
        {"float", DataType::Float},
        {"double", DataType::Double},
        {"string", DataType::String},
        {"string_view", DataType::StringView},
        {"Execution", DataType::Execution},
        {"any", DataType::Any},
    };
}

[[nodiscard]] auto get_data_type_lookup() -> const std::unordered_map<std::string_view, DataType>& {
    static const auto lookup = build_data_type_lookup();
    return lookup;
}

[[maybe_unused]] [[nodiscard]] auto parse_data_type(std::string_view value)
    -> std::optional<DataType> {
    if (auto it = get_data_type_lookup().find(value); it != get_data_type_lookup().end()) {
        return it->second;
    }
    return std::nullopt;
}

[[nodiscard]] auto build_node_type_lookup()
    -> std::unordered_map<std::string_view, const NodeType*> {
    return {
        {NodeTypes::Start.name, &NodeTypes::Start},
        {NodeTypes::End.name, &NodeTypes::End},
        {NodeTypes::PrintString.name, &NodeTypes::PrintString},
    };
}

[[nodiscard]] auto get_node_type_lookup()
    -> const std::unordered_map<std::string_view, const NodeType*>& {
    static const auto lookup = build_node_type_lookup();
    return lookup;
}

// --- JSON Parsing Helpers ---

template <typename T>
[[nodiscard]] auto require_field(const nlohmann::json& obj,
                                 std::string_view key,
                                 std::string_view ctx) -> Result<T> {
    if (auto it = obj.find(key); it != obj.end() && it->is_string()) {
        return Result<T>(it->get<T>());
    }
    return Result<T>(Error{.message = format(ctx, ": missing or invalid field '", key, "'"),
                           .code = kErrorMissingField});
}

[[nodiscard]] auto require_uint64(const nlohmann::json& obj,
                                  std::string_view key,
                                  std::string_view ctx) -> Result<uint64_t> {
    if (auto it = obj.find(key); it != obj.end() && it->is_number_integer()) {
        // Accept both signed and unsigned integers, as JSON doesn't distinguish them
        auto value = it->get<int64_t>();
        if (value >= 0) {
            return Result<uint64_t>(static_cast<uint64_t>(value));
        }
    }
    return Result<uint64_t>(
        Error{.message = format(ctx, ": missing or invalid uint64 field '", key, "'"),
              .code = kErrorMissingField});
}

// --- Property Parsers ---
[[nodiscard]] auto parse_node_properties(const nlohmann::json& props_json,
                                         Node& node,
                                         std::string_view ctx) -> Result<void> {
    if (!props_json.is_object()) {
        return Result<void>(Error{.message = format(ctx, ": 'properties' must be an object"),
                                  .code = kErrorInvalidDocument});
    }

    for (const auto& [key, value] : props_json.items()) {
        if (value.is_string()) {
            node.set_property(key, value.get<std::string>());
        } else if (value.is_number_float()) {
            node.set_property(key, value.get<double>());
        } else if (value.is_number_integer()) {
            node.set_property(key, value.get<std::int64_t>());
        } else if (value.is_boolean()) {
            node.set_property(key, value.get<bool>());
        } else {
            return Result<void>(
                Error{.message = format(ctx, ": property '", key, "' has unsupported type"),
                      .code = kErrorPropertyValue});
        }
    }
    return Result<void>();
}

struct ParsedEndpoint {
    NodeId node_id;
    PortId port_id;
};

[[nodiscard]] auto parse_connection_endpoint(const nlohmann::json& conn_json,
                                             std::string_view field_name,
                                             std::string_view ctx) -> Result<ParsedEndpoint> {
    const auto endpoint_it = conn_json.find(field_name);
    if (endpoint_it == conn_json.end() || !endpoint_it->is_object()) {
        return Result<ParsedEndpoint>(
            Error{.message = format(ctx, ": missing or invalid object '", field_name, "'"),
                  .code = kErrorConnection});
    }

    const auto endpoint_ctx = format(ctx, ".", field_name);
    const auto node_id_res = require_uint64(*endpoint_it, "nodeId", endpoint_ctx);
    if (!node_id_res) {
        return Result<ParsedEndpoint>(
            Error{.message = node_id_res.error().message, .code = kErrorConnection});
    }

    const auto port_id_res = require_uint64(*endpoint_it, "portId", endpoint_ctx);
    if (!port_id_res) {
        return Result<ParsedEndpoint>(
            Error{.message = port_id_res.error().message, .code = kErrorConnection});
    }

    return Result<ParsedEndpoint>(ParsedEndpoint{.node_id = NodeId{node_id_res.value()},
                                                 .port_id = PortId{port_id_res.value()}});
}

}  // namespace

namespace visprog::core {

auto GraphSerializer::to_json(const Graph& graph) -> nlohmann::json {
    nlohmann::json doc;
    doc["schema"] = {{"version", "1.1.0"}, {"coreMin", "1.1.0"}, {"coreMax", "1.1.x"}};
    doc["graph"] = {{"id", graph.get_id().value}, {"name", graph.get_name()}};

    nlohmann::json nodes_json = nlohmann::json::array();
    for (const auto& node_ptr : graph.get_nodes()) {
        const auto& node = *node_ptr;
        nlohmann::json node_json;
        node_json["id"] = node.get_id().value;
        node_json["type"] = node.get_type().name;
        node_json["instanceName"] = node.get_instance_name();

        // Serialize properties
        nlohmann::json props_json = nlohmann::json::object();
        for (const auto& [key, prop] : node.get_all_properties()) {
            std::visit([&](const auto& value) { props_json[key] = value; }, prop);
        }
        if (!props_json.empty()) {
            node_json["properties"] = std::move(props_json);
        }

        nodes_json.push_back(std::move(node_json));
    }
    doc["nodes"] = std::move(nodes_json);

    // Connections (unchanged, but shown for completeness)
    nlohmann::json conns_json = nlohmann::json::array();
    for (const auto& conn : graph.get_connections()) {
        nlohmann::json conn_json;
        conn_json["id"] = conn.id.value;
        conn_json["from"] = {{"nodeId", conn.from_node.value}, {"portId", conn.from_port.value}};
        conn_json["to"] = {{"nodeId", conn.to_node.value}, {"portId", conn.to_port.value}};
        conns_json.push_back(std::move(conn_json));
    }
    doc["connections"] = std::move(conns_json);

    return doc;
}

auto GraphSerializer::from_json(const nlohmann::json& doc) -> Result<Graph> {
    if (!doc.is_object()) {
        return Result<Graph>(
            Error{.message = "Root JSON must be an object", .code = kErrorInvalidDocument});
    }

    const auto graph_it = doc.find("graph");
    if (graph_it == doc.end() || !graph_it->is_object()) {
        return Result<Graph>(
            Error{.message = "Missing 'graph' object", .code = kErrorMissingField});
    }

    const auto graph_id_res = require_uint64(*graph_it, "id", "graph");
    if (!graph_id_res)
        return Result<Graph>(graph_id_res.error());

    Graph graph(GraphId{graph_id_res.value()});
    if (auto name_res = require_field<std::string>(*graph_it, "name", "graph"); name_res) {
        graph.set_name(name_res.value());
    }

    const auto nodes_it = doc.find("nodes");
    if (nodes_it == doc.end() || !nodes_it->is_array()) {
        return Result<Graph>(Error{.message = "Missing 'nodes' array", .code = kErrorMissingField});
    }

    const auto connections_it = doc.find("connections");
    uint64_t restored_port_counter = 1;
    if (connections_it != doc.end()) {
        if (!connections_it->is_array()) {
            return Result<Graph>(
                Error{.message = "'connections' must be an array", .code = kErrorConnection});
        }

        uint64_t min_port_id = std::numeric_limits<uint64_t>::max();
        for (std::size_t i = 0; i < connections_it->size(); ++i) {
            const auto& conn_json = connections_it->at(i);
            const std::string ctx = format("connections[", i, "]");
            if (!conn_json.is_object()) {
                return Result<Graph>(
                    Error{.message = format(ctx, " must be an object"), .code = kErrorConnection});
            }

            const auto from_res = parse_connection_endpoint(conn_json, "from", ctx);
            if (!from_res) {
                return Result<Graph>(from_res.error());
            }

            const auto to_res = parse_connection_endpoint(conn_json, "to", ctx);
            if (!to_res) {
                return Result<Graph>(to_res.error());
            }

            min_port_id = std::min(min_port_id, from_res.value().port_id.value);
            min_port_id = std::min(min_port_id, to_res.value().port_id.value);
        }

        if (min_port_id != std::numeric_limits<uint64_t>::max()) {
            restored_port_counter = min_port_id;
        }
    }

    NodeFactory::force_id_counters(NodeId{1}, PortId{restored_port_counter});

    uint64_t max_node_id = 0;
    uint64_t max_port_id = 0;

    const auto& node_type_lookup = get_node_type_lookup();

    for (std::size_t i = 0; i < nodes_it->size(); ++i) {
        const auto& node_json = nodes_it->at(i);
        const std::string ctx = format("nodes[", i, "]");
        if (!node_json.is_object()) {
            return Result<Graph>(
                Error{.message = format(ctx, " must be an object"), .code = kErrorInvalidDocument});
        }

        const auto node_id_res = require_uint64(node_json, "id", ctx);
        if (!node_id_res)
            return Result<Graph>(node_id_res.error());
        const NodeId node_id{node_id_res.value()};
        max_node_id = std::max(max_node_id, node_id.value);

        const auto type_name_res = require_field<std::string>(node_json, "type", ctx);
        if (!type_name_res)
            return Result<Graph>(type_name_res.error());

        auto it = node_type_lookup.find(type_name_res.value());
        if (it == node_type_lookup.end()) {
            return Result<Graph>(
                Error{.message = format(ctx, ": unknown node type '", type_name_res.value(), "'"),
                      .code = kErrorInvalidEnum});
        }
        const NodeType* node_type = it->second;

        const auto name_res = require_field<std::string>(node_json, "instanceName", ctx);
        if (!name_res)
            return Result<Graph>(name_res.error());

        auto node = NodeFactory::create_with_id(node_id, *node_type, name_res.value());

        if (auto props_it = node_json.find("properties"); props_it != node_json.end()) {
            if (auto res = parse_node_properties(*props_it, *node, ctx); !res) {
                return Result<Graph>(res.error());
            }
        }

        for (const auto& port : node->get_ports()) {
            max_port_id = std::max(max_port_id, port.get_id().value);
        }

        if (!graph.add_node(std::move(node))) {
            return Result<Graph>(Error{.message = format("Failed to add node ", node_id.value),
                                       .code = kErrorInvalidDocument});
        }
    }

    NodeFactory::synchronize_id_counters(NodeId{max_node_id}, PortId{max_port_id});

    uint64_t max_connection_id = 0;
    if (connections_it != doc.end()) {
        for (std::size_t i = 0; i < connections_it->size(); ++i) {
            const auto& conn_json = connections_it->at(i);
            const std::string ctx = format("connections[", i, "]");
            if (!conn_json.is_object()) {
                return Result<Graph>(
                    Error{.message = format(ctx, " must be an object"), .code = kErrorConnection});
            }

            if (const auto id_it = conn_json.find("id"); id_it != conn_json.end()) {
                const auto conn_id_res = require_uint64(conn_json, "id", ctx);
                if (!conn_id_res) {
                    return Result<Graph>(
                        Error{.message = conn_id_res.error().message, .code = kErrorConnection});
                }
                max_connection_id = std::max(max_connection_id, conn_id_res.value());
            }

            const auto from_res = parse_connection_endpoint(conn_json, "from", ctx);
            if (!from_res) {
                return Result<Graph>(from_res.error());
            }
            const auto to_res = parse_connection_endpoint(conn_json, "to", ctx);
            if (!to_res) {
                return Result<Graph>(to_res.error());
            }

            const auto from = from_res.value();
            const auto to = to_res.value();

            const auto* from_node = graph.get_node(from.node_id);
            if (!from_node) {
                return Result<Graph>(Error{
                    .message =
                        format(ctx, ": source nodeId ", from.node_id.value, " does not exist"),
                    .code = kErrorConnection});
            }
            if (!from_node->find_port(from.port_id)) {
                return Result<Graph>(Error{.message = format(ctx,
                                                             ": source portId ",
                                                             from.port_id.value,
                                                             " does not exist on node ",
                                                             from.node_id.value),
                                           .code = kErrorConnection});
            }

            const auto* to_node = graph.get_node(to.node_id);
            if (!to_node) {
                return Result<Graph>(Error{
                    .message = format(ctx, ": target nodeId ", to.node_id.value, " does not exist"),
                    .code = kErrorConnection});
            }
            if (!to_node->find_port(to.port_id)) {
                return Result<Graph>(Error{.message = format(ctx,
                                                             ": target portId ",
                                                             to.port_id.value,
                                                             " does not exist on node ",
                                                             to.node_id.value),
                                           .code = kErrorConnection});
            }

            auto connect_result = graph.connect(from.node_id, from.port_id, to.node_id, to.port_id);
            if (!connect_result) {
                return Result<Graph>(Error{.message = format(ctx,
                                                             ": failed to connect nodes ",
                                                             from.node_id.value,
                                                             ":",
                                                             from.port_id.value,
                                                             " -> ",
                                                             to.node_id.value,
                                                             ":",
                                                             to.port_id.value,
                                                             " (",
                                                             connect_result.error().message,
                                                             ")"),
                                           .code = kErrorConnection});
            }
        }
    }

    graph.next_connection_id_.value =
        std::max(graph.next_connection_id_.value, max_connection_id + 1);

    return Result<Graph>(std::move(graph));
}

}  // namespace visprog::core
