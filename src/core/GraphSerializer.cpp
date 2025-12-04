// Copyright (c) 2025 МультиКод Team. MIT License.

#include "visprog/core/GraphSerializer.hpp"

#include <algorithm>
#include <cstdint>
#include <format>
#include <limits>
#include <optional>
#include <stdexcept>
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
using visprog::core::NodeType;
using visprog::core::Port;
using visprog::core::PortDirection;
using visprog::core::PortId;
using visprog::core::Result;

constexpr int kErrorInvalidDocument = 600;
constexpr int kErrorMissingField = 601;
constexpr int kErrorInvalidEnum = 602;
constexpr int kErrorMetadataValue = 603;
constexpr int kErrorTypeName = 604;
constexpr int kErrorConnection = 605;
constexpr int kErrorSchemaVersion = 606;

constexpr std::string_view kCoreVersion = "0.1.0-alpha";

[[nodiscard]] constexpr auto port_direction_to_string(PortDirection direction) noexcept
    -> std::string_view {
    switch (direction) {
        case PortDirection::Input:
            return "Input";
        case PortDirection::Output:
            return "Output";
        case PortDirection::InOut:
            return "InOut";
    }
    return "Unknown";
}

[[nodiscard]] constexpr auto connection_type_to_string(ConnectionType type) noexcept
    -> std::string_view {
    switch (type) {
        case ConnectionType::Execution:
            return "Execution";
        case ConnectionType::Data:
            return "Data";
    }
    return "Unknown";
}

[[nodiscard]] auto parse_port_direction(std::string_view value) -> std::optional<PortDirection> {
    if (value == "Input") {
        return PortDirection::Input;
    }
    if (value == "Output") {
        return PortDirection::Output;
    }
    if (value == "InOut") {
        return PortDirection::InOut;
    }
    return std::nullopt;
}

[[nodiscard]] auto parse_connection_type(std::string_view value) -> std::optional<ConnectionType> {
    if (value == "Execution") {
        return ConnectionType::Execution;
    }
    if (value == "Data") {
        return ConnectionType::Data;
    }
    return std::nullopt;
}

[[nodiscard]] auto build_node_type_lookup() -> std::unordered_map<std::string_view, NodeType> {
    std::unordered_map<std::string_view, NodeType> lookup;
    lookup.reserve(64);

    for (std::uint16_t raw = 0; raw <= std::numeric_limits<std::uint8_t>::max(); ++raw) {
        const auto type = static_cast<NodeType>(raw);
        const auto label = visprog::core::to_string(type);
        if (label != "Unknown") {
            lookup.emplace(label, type);
        }
    }

    return lookup;
}

[[nodiscard]] auto build_data_type_lookup() -> std::unordered_map<std::string_view, DataType> {
    std::unordered_map<std::string_view, DataType> lookup;
    lookup.reserve(32);

    for (std::uint16_t raw = 0; raw <= std::numeric_limits<std::uint8_t>::max(); ++raw) {
        const auto type = static_cast<DataType>(raw);
        const auto label = visprog::core::to_string(type);
        if (label != "unknown") {
            lookup.emplace(label, type);
        }
    }

    return lookup;
}

[[nodiscard]] auto get_node_type_lookup() -> const std::unordered_map<std::string_view, NodeType>& {
    static const auto lookup = build_node_type_lookup();
    return lookup;
}

[[nodiscard]] auto get_data_type_lookup() -> const std::unordered_map<std::string_view, DataType>& {
    static const auto lookup = build_data_type_lookup();
    return lookup;
}

[[nodiscard]] auto parse_node_type(std::string_view value) -> std::optional<NodeType> {
    const auto& lookup = get_node_type_lookup();
    if (auto it = lookup.find(value); it != lookup.end()) {
        return it->second;
    }
    return std::nullopt;
}

[[nodiscard]] auto parse_data_type(std::string_view value) -> std::optional<DataType> {
    const auto& lookup = get_data_type_lookup();
    if (auto it = lookup.find(value); it != lookup.end()) {
        return it->second;
    }
    return std::nullopt;
}

[[nodiscard]] auto require_string(const nlohmann::json& object,
                                  std::string_view key,
                                  std::string_view context,
                                  int error_code) -> Result<std::string> {
    if (auto it = object.find(std::string(key)); it != object.end() && it->is_string()) {
        return Result<std::string>(it->get<std::string>());
    }

    return Result<std::string>(Error{
        .message = std::string(context) + ": поле '" + std::string(key) + "' должно быть строкой",
        .code = error_code});
}

[[nodiscard]] auto require_uint64(const nlohmann::json& object,
                                  std::string_view key,
                                  std::string_view context,
                                  int error_code) -> Result<std::uint64_t> {
    if (auto it = object.find(std::string(key)); it != object.end() && it->is_number_unsigned()) {
        return Result<std::uint64_t>(it->get<std::uint64_t>());
    }

    return Result<std::uint64_t>(Error{
        .message = std::string(context) + ": поле '" + std::string(key) + "' должно быть uint64",
        .code = error_code});
}

[[nodiscard]] auto parse_metadata(const nlohmann::json& object,
                                  std::string_view context,
                                  visprog::core::Graph& graph) -> Result<void> {
    if (!object.is_object()) {
        return Result<void>(
            Error{.message = std::string(context) + ": metadata должно быть объектом",
                  .code = kErrorInvalidDocument});
    }

    for (const auto& [key, value] : object.items()) {
        if (!value.is_string()) {
            return Result<void>(Error{.message = std::string(context) + ": значение metadata '" +
                                                 key + "' должно быть строкой",
                                      .code = kErrorMetadataValue});
        }
        graph.set_metadata(key, value.get<std::string>());
    }

    return Result<void>();
}

[[nodiscard]] auto validate_schema(const nlohmann::json& document) -> Result<void> {
    const auto schema_it = document.find("schema");
    if (schema_it == document.end() || !schema_it->is_object()) {
        return Result<void>(
            Error{.message = "Отсутствует объект 'schema'", .code = kErrorSchemaVersion});
    }

    const auto version = require_string(*schema_it, "version", "schema", kErrorSchemaVersion);
    if (!version) {
        return Result<void>(version.error());
    }
    if (version.value() != GraphSerializer::kSchemaVersion) {
        return Result<void>(
            Error{.message = std::format("Несовместимая версия схемы '{}', поддерживается '{}'",
                                         version.value(),
                                         GraphSerializer::kSchemaVersion),
                  .code = kErrorSchemaVersion});
    }

    const auto core_min = require_string(*schema_it, "coreMin", "schema", kErrorSchemaVersion);
    if (!core_min) {
        return Result<void>(core_min.error());
    }

    const auto core_max = require_string(*schema_it, "coreMax", "schema", kErrorSchemaVersion);
    if (!core_max) {
        return Result<void>(core_max.error());
    }

    if (core_min.value() != GraphSerializer::kSchemaCoreMin ||
        core_max.value() != GraphSerializer::kSchemaCoreMax) {
        return Result<void>(Error{
            .message = std::format(
                "Несовместимое окно версий ядра [{} - {}]", core_min.value(), core_max.value()),
            .code = kErrorSchemaVersion});
    }

    if (kCoreVersion < GraphSerializer::kSchemaCoreMin ||
        kCoreVersion > GraphSerializer::kSchemaCoreMax) {
        return Result<void>(
            Error{.message = std::format("Текущая версия ядра '{}' не входит в окно [{} - {}]",
                                         kCoreVersion,
                                         GraphSerializer::kSchemaCoreMin,
                                         GraphSerializer::kSchemaCoreMax),
                  .code = kErrorSchemaVersion});
    }

    return Result<void>();
}

[[nodiscard]] auto parse_node_metadata(const nlohmann::json& object,
                                       std::string_view context,
                                       Node& node) -> Result<void> {
    if (!object.is_object()) {
        return Result<void>(
            Error{.message = std::string(context) + ": metadata должно быть объектом",
                  .code = kErrorInvalidDocument});
    }

    for (const auto& [key, value] : object.items()) {
        if (!value.is_string()) {
            return Result<void>(Error{.message = std::string(context) + ": значение metadata '" +
                                                 key + "' должно быть строкой",
                                      .code = kErrorMetadataValue});
        }
        node.set_metadata(key, value.get<std::string>());
    }

    return Result<void>();
}

}  // namespace

namespace visprog::core {

auto GraphSerializer::to_json(const Graph& graph) -> nlohmann::json {
    nlohmann::json document;

    document["schema"] = {{"version", GraphSerializer::kSchemaVersion},
                          {"coreMin", GraphSerializer::kSchemaCoreMin},
                          {"coreMax", GraphSerializer::kSchemaCoreMax}};

    nlohmann::json graph_json;
    graph_json["id"] = graph.get_id().value;
    graph_json["name"] = graph.get_name();

    nlohmann::json metadata_json = nlohmann::json::object();
    for (const auto& [key, value] : graph.get_all_metadata()) {
        metadata_json[key] = value;
    }
    graph_json["metadata"] = std::move(metadata_json);
    document["graph"] = std::move(graph_json);

    nlohmann::json nodes_json = nlohmann::json::array();
    for (const auto& node_ptr : graph.get_nodes()) {
        const auto& node = *node_ptr;
        nlohmann::json node_json;
        node_json["id"] = node.get_id().value;
        node_json["type"] = std::string(to_string(node.get_type()));
        node_json["name"] = node.get_name();

        if (!node.get_display_name().empty()) {
            node_json["displayName"] = node.get_display_name();
        }

        if (!node.get_description().empty()) {
            node_json["description"] = node.get_description();
        }

        nlohmann::json node_metadata = nlohmann::json::object();
        for (const auto& [key, value] : node.get_all_metadata()) {
            node_metadata[key] = value;
        }
        node_json["metadata"] = std::move(node_metadata);

        nlohmann::json ports_json = nlohmann::json::array();
        for (const auto& port : node.get_ports()) {
            nlohmann::json port_json;
            port_json["id"] = port.get_id().value;
            port_json["name"] = port.get_name();
            port_json["direction"] = std::string(port_direction_to_string(port.get_direction()));
            port_json["dataType"] = std::string(to_string(port.get_data_type()));
            if (!port.get_type_name().empty()) {
                port_json["typeName"] = port.get_type_name();
            }
            ports_json.push_back(std::move(port_json));
        }
        node_json["ports"] = std::move(ports_json);

        nodes_json.push_back(std::move(node_json));
    }
    document["nodes"] = std::move(nodes_json);

    nlohmann::json connections_json = nlohmann::json::array();
    for (const auto& connection : graph.get_connections()) {
        nlohmann::json connection_json;
        connection_json["id"] = connection.id.value;
        connection_json["type"] = std::string(connection_type_to_string(connection.type));
        connection_json["from"] = {{"nodeId", connection.from_node.value},
                                   {"portId", connection.from_port.value}};
        connection_json["to"] = {{"nodeId", connection.to_node.value},
                                 {"portId", connection.to_port.value}};
        connections_json.push_back(std::move(connection_json));
    }
    document["connections"] = std::move(connections_json);

    return document;
}

auto GraphSerializer::from_json(const nlohmann::json& document) -> Result<Graph> {
    if (!document.is_object()) {
        return Result<Graph>(
            Error{.message = "Root JSON должен быть объектом", .code = kErrorInvalidDocument});
    }

    if (auto schema_result = validate_schema(document); !schema_result) {
        return Result<Graph>(schema_result.error());
    }

    const auto graph_it = document.find("graph");
    if (graph_it == document.end() || !graph_it->is_object()) {
        return Result<Graph>(
            Error{.message = "Отсутствует объект 'graph'", .code = kErrorMissingField});
    }

    const auto graph_id_result = require_uint64(*graph_it, "id", "graph", kErrorMissingField);
    if (!graph_id_result) {
        return Result<Graph>(graph_id_result.error());
    }

    Graph graph(GraphId{graph_id_result.value()});

    const auto graph_name_result = require_string(*graph_it, "name", "graph", kErrorMissingField);
    if (graph_name_result) {
        graph.set_name(graph_name_result.value());
    }

    if (auto meta_it = graph_it->find("metadata"); meta_it != graph_it->end()) {
        if (auto meta_result = parse_metadata(*meta_it, "graph", graph); !meta_result) {
            return Result<Graph>(meta_result.error());
        }
    }

    const auto nodes_it = document.find("nodes");
    if (nodes_it == document.end() || !nodes_it->is_array()) {
        return Result<Graph>(
            Error{.message = "Ожидается массив 'nodes'", .code = kErrorMissingField});
    }

    std::uint64_t max_node_id = 0;
    std::uint64_t max_port_id = 0;

    for (std::size_t index = 0; index < nodes_it->size(); ++index) {
        const auto& node_json = nodes_it->at(index);
        if (!node_json.is_object()) {
            return Result<Graph>(
                Error{.message = std::format("nodes[{}] должен быть объектом", index),
                      .code = kErrorInvalidDocument});
        }

        const auto node_id_result =
            require_uint64(node_json, "id", std::format("nodes[{}]", index), kErrorMissingField);
        if (!node_id_result) {
            return Result<Graph>(node_id_result.error());
        }
        const NodeId node_id{node_id_result.value()};

        const auto type_result =
            require_string(node_json, "type", std::format("nodes[{}]", index), kErrorMissingField);
        if (!type_result) {
            return Result<Graph>(type_result.error());
        }

        const auto node_type = parse_node_type(type_result.value());
        if (!node_type.has_value()) {
            return Result<Graph>(Error{
                .message =
                    std::format("nodes[{}]: неизвестный тип узла '{}'", index, type_result.value()),
                .code = kErrorInvalidEnum});
        }

        const auto name_result =
            require_string(node_json, "name", std::format("nodes[{}]", index), kErrorMissingField);
        if (!name_result) {
            return Result<Graph>(name_result.error());
        }

        auto node = std::make_unique<Node>(node_id, node_type.value(), name_result.value());

        if (auto display_it = node_json.find("displayName");
            display_it != node_json.end() && display_it->is_string()) {
            node->set_display_name(display_it->get<std::string>());
        }

        if (auto desc_it = node_json.find("description");
            desc_it != node_json.end() && desc_it->is_string()) {
            node->set_description(desc_it->get<std::string>());
        }

        if (auto metadata_it = node_json.find("metadata"); metadata_it != node_json.end()) {
            if (auto meta_result =
                    parse_node_metadata(*metadata_it, std::format("nodes[{}]", index), *node);
                !meta_result) {
                return Result<Graph>(meta_result.error());
            }
        }

        const auto ports_it = node_json.find("ports");
        if (ports_it == node_json.end() || !ports_it->is_array()) {
            return Result<Graph>(
                Error{.message = std::format("nodes[{}]: отсутствует массив 'ports'", index),
                      .code = kErrorMissingField});
        }

        for (std::size_t port_index = 0; port_index < ports_it->size(); ++port_index) {
            const auto& port_json = ports_it->at(port_index);
            if (!port_json.is_object()) {
                return Result<Graph>(Error{
                    .message =
                        std::format("nodes[{}].ports[{}] должен быть объектом", index, port_index),
                    .code = kErrorInvalidDocument});
            }

            const auto port_id_result =
                require_uint64(port_json,
                               "id",
                               std::format("nodes[{}].ports[{}]", index, port_index),
                               kErrorMissingField);
            if (!port_id_result) {
                return Result<Graph>(port_id_result.error());
            }

            const auto dir_result =
                require_string(port_json,
                               "direction",
                               std::format("nodes[{}].ports[{}]", index, port_index),
                               kErrorMissingField);
            if (!dir_result) {
                return Result<Graph>(dir_result.error());
            }
            const auto direction = parse_port_direction(dir_result.value());
            if (!direction.has_value()) {
                return Result<Graph>(Error{
                    .message = std::format("nodes[{}].ports[{}]: неизвестное направление '{}'",
                                           index,
                                           port_index,
                                           dir_result.value()),
                    .code = kErrorInvalidEnum});
            }

            const auto data_type_result =
                require_string(port_json,
                               "dataType",
                               std::format("nodes[{}].ports[{}]", index, port_index),
                               kErrorMissingField);
            if (!data_type_result) {
                return Result<Graph>(data_type_result.error());
            }
            const auto data_type = parse_data_type(data_type_result.value());
            if (!data_type.has_value()) {
                return Result<Graph>(
                    Error{.message = std::format("nodes[{}].ports[{}]: неизвестный тип данных '{}'",
                                                 index,
                                                 port_index,
                                                 data_type_result.value()),
                          .code = kErrorInvalidEnum});
            }

            const auto port_name_result =
                require_string(port_json,
                               "name",
                               std::format("nodes[{}].ports[{}]", index, port_index),
                               kErrorMissingField);
            if (!port_name_result) {
                return Result<Graph>(port_name_result.error());
            }

            Port port(PortId{port_id_result.value()},
                      direction.value(),
                      data_type.value(),
                      port_name_result.value());
            if (auto type_name_it = port_json.find("typeName"); type_name_it != port_json.end()) {
                if (!type_name_it->is_string()) {
                    return Result<Graph>(
                        Error{.message =
                                  std::format("nodes[{}].ports[{}]: 'typeName' должен быть строкой",
                                              index,
                                              port_index),
                              .code = kErrorMetadataValue});
                }

                const auto type_name_value = type_name_it->get<std::string>();
                if (!type_name_value.empty()) {
                    try {
                        [[maybe_unused]] const bool assigned = port.set_type_name(type_name_value);
                    } catch (const std::invalid_argument& error) {
                        return Result<Graph>(
                            Error{.message = std::format(
                                      "nodes[{}].ports[{}]: {}", index, port_index, error.what()),
                                  .code = kErrorTypeName});
                    }
                }
            }

            node->append_port(std::move(port));
            max_port_id = std::max(max_port_id, port_id_result.value());
        }

        const auto added_id = graph.add_node(std::move(node));
        if (!added_id || added_id != node_id) {
            return Result<Graph>(
                Error{.message = std::format("Не удалось добавить узел nodes[{}]", index),
                      .code = kErrorInvalidDocument});
        }

        max_node_id = std::max(max_node_id, node_id.value);
    }

    const auto connections_it = document.find("connections");
    if (connections_it != document.end()) {
        if (!connections_it->is_array()) {
            return Result<Graph>(Error{.message = "'connections' должен быть массивом",
                                       .code = kErrorInvalidDocument});
        }

        std::uint64_t max_connection_id = 0;
        for (std::size_t index = 0; index < connections_it->size(); ++index) {
            const auto& conn_json = connections_it->at(index);
            if (!conn_json.is_object()) {
                return Result<Graph>(
                    Error{.message = std::format("connections[{}] должен быть объектом", index),
                          .code = kErrorInvalidDocument});
            }

            const auto conn_id_result = require_uint64(
                conn_json, "id", std::format("connections[{}]", index), kErrorMissingField);
            if (!conn_id_result) {
                return Result<Graph>(conn_id_result.error());
            }

            const auto type_result = require_string(
                conn_json, "type", std::format("connections[{}]", index), kErrorMissingField);
            if (!type_result) {
                return Result<Graph>(type_result.error());
            }
            const auto conn_type = parse_connection_type(type_result.value());
            if (!conn_type.has_value()) {
                return Result<Graph>(
                    Error{.message = std::format(
                              "connections[{}]: неизвестный тип '{}'", index, type_result.value()),
                          .code = kErrorInvalidEnum});
            }

            const auto from_it = conn_json.find("from");
            const auto to_it = conn_json.find("to");
            if (from_it == conn_json.end() || to_it == conn_json.end() || !from_it->is_object() ||
                !to_it->is_object()) {
                return Result<Graph>(
                    Error{.message =
                              std::format("connections[{}]: поля 'from' и 'to' обязательны", index),
                          .code = kErrorMissingField});
            }

            const auto from_node_result = require_uint64(
                *from_it, "nodeId", std::format("connections[{}].from", index), kErrorMissingField);
            if (!from_node_result) {
                return Result<Graph>(from_node_result.error());
            }
            const auto from_port_result = require_uint64(
                *from_it, "portId", std::format("connections[{}].from", index), kErrorMissingField);
            if (!from_port_result) {
                return Result<Graph>(from_port_result.error());
            }

            const auto to_node_result = require_uint64(
                *to_it, "nodeId", std::format("connections[{}].to", index), kErrorMissingField);
            if (!to_node_result) {
                return Result<Graph>(to_node_result.error());
            }
            const auto to_port_result = require_uint64(
                *to_it, "portId", std::format("connections[{}].to", index), kErrorMissingField);
            if (!to_port_result) {
                return Result<Graph>(to_port_result.error());
            }

            Connection connection{.id = ConnectionId{conn_id_result.value()},
                                  .from_node = NodeId{from_node_result.value()},
                                  .from_port = PortId{from_port_result.value()},
                                  .to_node = NodeId{to_node_result.value()},
                                  .to_port = PortId{to_port_result.value()},
                                  .type = conn_type.value()};

            if (auto append_result = graph.append_connection(connection); !append_result) {
                return Result<Graph>(append_result.error());
            }

            max_connection_id = std::max(max_connection_id, conn_id_result.value());
        }

        graph.seed_connection_counter(ConnectionId{max_connection_id + 1});
    }

    NodeFactory::synchronize_id_counter(NodeId{max_node_id});
    Port::synchronize_id_counter(PortId{max_port_id});

    return Result<Graph>(std::move(graph));
}

}  // namespace visprog::core
