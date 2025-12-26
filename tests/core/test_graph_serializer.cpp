// Copyright (c) 2025 МультиКод Team. MIT License.

#include <catch2/catch_all.hpp>
#include <nlohmann/json.hpp>

#include "visprog/core/GraphSerializer.hpp"
#include "visprog/core/NodeFactory.hpp"

using namespace visprog::core;

// Error codes matching those in GraphSerializer.cpp
constexpr int kTestErrorInvalidEnum = 602;

TEST_CASE("GraphSerializer: Round-trip with New Property System", "[graph][serialization]") {
    // 1. Create a graph and add a node with a modified property
    Graph original_graph("PropertyGraph");
    auto node = NodeFactory::create(NodeTypes::PrintString, "MyPrinter");
    REQUIRE(node != nullptr);

    // Modify the default property
    node->set_property("value", std::string("Custom Message"));
    node->set_property("speed", static_cast<int64_t>(100));

    const auto node_id = node->get_id();
    const auto added_node_id = original_graph.add_node(std::move(node));
    REQUIRE(added_node_id == node_id);

    // 2. Serialize the graph to JSON
    const nlohmann::json json_doc = GraphSerializer::to_json(original_graph);

    // Optional: Print JSON for debugging
    // std::cout << json_doc.dump(2) << std::endl;

    // 3. Verify the serialized JSON structure
    REQUIRE(json_doc["schema"]["version"].get<std::string>() == "1.1.0");
    REQUIRE(json_doc["nodes"][0]["type"].get<std::string>() ==
            std::string(NodeTypes::PrintString.name));
    REQUIRE(json_doc["nodes"][0]["instanceName"].get<std::string>() == "MyPrinter");
    REQUIRE(json_doc["nodes"][0]["properties"]["value"].get<std::string>() == "Custom Message");
    REQUIRE(json_doc["nodes"][0]["properties"]["speed"].get<int64_t>() == 100);

    // 4. Deserialize the JSON back into a new graph
    auto restored_result = GraphSerializer::from_json(json_doc);
    REQUIRE(restored_result.has_value());
    Graph restored_graph = std::move(restored_result).value();

    // 5. Verify the restored graph and node properties
    REQUIRE(restored_graph.get_name() == "PropertyGraph");
    REQUIRE(restored_graph.node_count() == 1);

    const auto* restored_node = restored_graph.get_node(node_id);
    REQUIRE(restored_node != nullptr);
    REQUIRE(restored_node->get_type().name == NodeTypes::PrintString.name);
    REQUIRE(restored_node->get_instance_name() == "MyPrinter");

    auto str_prop = restored_node->get_property<std::string>("value");
    REQUIRE(str_prop.has_value());
    REQUIRE(str_prop.value() == "Custom Message");

    auto int_prop = restored_node->get_property<int64_t>("speed");
    REQUIRE(int_prop.has_value());
    REQUIRE(int_prop.value() == 100);
}

TEST_CASE("GraphSerializer: Invalid or Unknown Node Type", "[graph][serialization][negative]") {
    const nlohmann::json invalid_json = {
        {"schema", {{"version", "1.1.0"}, {"coreMin", "1.1.0"}, {"coreMax", "1.1.x"}}},
        {"graph", {{"id", 1}, {"name", "TestGraph"}}},
        {"nodes",
         {{{"id", 101},
           {"type", "core.unknown.node"},  // This type does not exist
           {"instanceName", "InvalidNode"}}}}};

    auto result = GraphSerializer::from_json(invalid_json);
    REQUIRE(!result.has_value());
    REQUIRE(result.error().code == kTestErrorInvalidEnum);
}

TEST_CASE("GraphSerializer: Connect two nodes and serialize", "[graph][serialization]") {
    Graph graph("ConnectedGraph");
    auto start_node = NodeFactory::create(NodeTypes::Start);
    auto print_node = NodeFactory::create(NodeTypes::PrintString);

    const auto start_id = start_node->get_id();
    const auto print_id = print_node->get_id();

    const auto* start_exec_port = start_node->get_exec_output_ports()[0];
    const auto* print_exec_port = print_node->get_exec_input_ports()[0];

    const auto inserted_start_id = graph.add_node(std::move(start_node));
    const auto inserted_print_id = graph.add_node(std::move(print_node));
    REQUIRE(inserted_start_id == start_id);
    REQUIRE(inserted_print_id == print_id);

    auto conn_res =
        graph.connect(start_id, start_exec_port->get_id(), print_id, print_exec_port->get_id());
    REQUIRE(conn_res.has_value());

    const nlohmann::json json_doc = GraphSerializer::to_json(graph);

    // Verify connection is serialized
    REQUIRE(json_doc.contains("connections"));
    REQUIRE(json_doc["connections"].is_array());
    REQUIRE(json_doc["connections"].size() == 1);
    const auto& conn_json = json_doc["connections"][0];
    REQUIRE(conn_json["from"]["nodeId"] == start_id.value);
    REQUIRE(conn_json["from"]["portId"] == start_exec_port->get_id().value);
    REQUIRE(conn_json["to"]["nodeId"] == print_id.value);
    REQUIRE(conn_json["to"]["portId"] == print_exec_port->get_id().value);

    auto restored_result = GraphSerializer::from_json(json_doc);
    REQUIRE(restored_result.has_value());
    // Connection parsing is not fully implemented in the from_json mock,
    // so we only check if the deserialization succeeds without error.
}
