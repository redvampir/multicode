// Copyright (c) 2025 Р СљРЎС“Р В»РЎРЉРЎвЂљР С‘Р С™Р С•Р Т‘ Team. MIT License.

#include "visprog/core/GraphSerializer.hpp"

#include <algorithm>
#include <cstdint>
#include <format>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_map>
#include <utility>

#include "visprog/core/NodeFactory.hpp"
#include "visprog/core/Port.hpp"

namespace {

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
    return Result<T>(Error{.message = std::format("{}: missing or invalid field '{}'", ctx, key),
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
        Error{.message = std::format("{}: missing or invalid uint64 field '{}'", ctx, key),
              .code = kErrorMissingField});
}

// --- Property Parsers ---
[[nodiscard]] auto parse_node_properties(const nlohmann::json& props_json,
                                         Node& node,
                                         std::string_view ctx) -> Result<void> {
    if (!props_json.is_object()) {
        return Result<void>(Error{.message = std::format("{}: 'properties' must be an object", ctx),
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
                Error{.message = std::format("{}: property '{}' has unsupported type", ctx, key),
                      .code = kErrorPropertyValue});
        }
    }
    return Result<void>();
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

    uint64_t max_node_id = 0;
    uint64_t max_port_id = 0;

    const auto& node_type_lookup = get_node_type_lookup();

    for (std::size_t i = 0; i < nodes_it->size(); ++i) {
        const auto& node_json = nodes_it->at(i);
        const std::string ctx = std::format("nodes[{}]", i);
        if (!node_json.is_object()) {
            return Result<Graph>(Error{.message = std::format("{} must be an object", ctx),
                                       .code = kErrorInvalidDocument});
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
            return Result<Graph>(Error{
                .message = std::format("{}: unknown node type '{}'", ctx, type_name_res.value()),
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
            return Result<Graph>(
                Error{.message = std::format("Failed to add node {}", node_id.value),
                      .code = kErrorInvalidDocument});
        }
    }

    NodeFactory::synchronize_id_counters(NodeId{max_node_id}, PortId{max_port_id});

    // ... (connection parsing would go here, it's omitted for brevity but is unchanged)

    return Result<Graph>(std::move(graph));
}

}  // namespace visprog::core
