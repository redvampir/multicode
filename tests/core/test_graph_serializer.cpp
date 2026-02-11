// Copyright (c) 2025 МультиКод Team. MIT License.

#include <algorithm>
#include <array>
#include <catch2/catch_all.hpp>
#include <nlohmann/json.hpp>
#include <random>

#include "visprog/core/ErrorCodes.hpp"
#include "visprog/core/GraphSerializer.hpp"
#include "visprog/core/NodeFactory.hpp"

using namespace visprog::core;

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
    REQUIRE(result.error().code == error_codes::serializer::InvalidEnum);
}

TEST_CASE("GraphSerializer: Round-trip с несколькими связями", "[graph][serialization]") {
    Graph graph("ConnectedGraph");

    auto start_node = NodeFactory::create(NodeTypes::Start, "Старт");
    auto print_first_node = NodeFactory::create(NodeTypes::PrintString, "Вывод1");
    auto print_second_node = NodeFactory::create(NodeTypes::PrintString, "Вывод2");

    REQUIRE(start_node != nullptr);
    REQUIRE(print_first_node != nullptr);
    REQUIRE(print_second_node != nullptr);

    const auto start_id = start_node->get_id();
    const auto print_first_id = print_first_node->get_id();
    const auto print_second_id = print_second_node->get_id();

    const auto* start_exec_out = start_node->get_exec_output_ports().at(0);
    const auto* print_first_exec_in = print_first_node->get_exec_input_ports().at(0);
    const auto* print_first_exec_out = print_first_node->get_exec_output_ports().at(0);
    const auto* print_second_exec_in = print_second_node->get_exec_input_ports().at(0);

    const auto inserted_start_id = graph.add_node(std::move(start_node));
    const auto inserted_print_first_id = graph.add_node(std::move(print_first_node));
    const auto inserted_print_second_id = graph.add_node(std::move(print_second_node));
    REQUIRE(inserted_start_id == start_id);
    REQUIRE(inserted_print_first_id == print_first_id);
    REQUIRE(inserted_print_second_id == print_second_id);

    auto conn_start_to_first = graph.connect(
        start_id, start_exec_out->get_id(), print_first_id, print_first_exec_in->get_id());
    REQUIRE(conn_start_to_first.has_value());

    auto conn_first_to_second = graph.connect(print_first_id,
                                              print_first_exec_out->get_id(),
                                              print_second_id,
                                              print_second_exec_in->get_id());
    REQUIRE(conn_first_to_second.has_value());

    const nlohmann::json json_doc = GraphSerializer::to_json(graph);
    REQUIRE(json_doc.contains("connections"));
    REQUIRE(json_doc["connections"].is_array());
    REQUIRE(json_doc["connections"].size() == 2);

    auto restored_result = GraphSerializer::from_json(json_doc);
    REQUIRE(restored_result.has_value());
    Graph restored_graph = std::move(restored_result).value();

    REQUIRE(restored_graph.connection_count() == graph.connection_count());
    REQUIRE(restored_graph.connection_count() == 2);

    std::array<std::pair<uint64_t, uint64_t>, 2> expected_edges = {
        std::pair{start_id.value, print_first_id.value},
        std::pair{print_first_id.value, print_second_id.value},
    };
    std::sort(expected_edges.begin(), expected_edges.end());

    std::array<std::pair<uint64_t, uint64_t>, 2> restored_edges = {
        std::pair{0ULL, 0ULL},
        std::pair{0ULL, 0ULL},
    };

    std::size_t index = 0;
    for (const auto& connection : restored_graph.get_connections()) {
        REQUIRE(index < restored_edges.size());
        restored_edges[index] = {connection.from_node.value, connection.to_node.value};
        ++index;
    }

    std::sort(restored_edges.begin(), restored_edges.end());
    REQUIRE(restored_edges == expected_edges);
}

TEST_CASE("GraphSerializer: Ошибка если connection с битым nodeId",
          "[graph][serialization][negative]") {
    Graph graph("ConnectedGraph");

    auto start_node = NodeFactory::create(NodeTypes::Start);
    auto print_node = NodeFactory::create(NodeTypes::PrintString);

    REQUIRE(start_node != nullptr);
    REQUIRE(print_node != nullptr);

    const auto start_id = start_node->get_id();
    const auto print_id = print_node->get_id();

    const auto* start_exec_out = start_node->get_exec_output_ports().at(0);
    const auto* print_exec_in = print_node->get_exec_input_ports().at(0);

    REQUIRE(graph.add_node(std::move(start_node)) == start_id);
    REQUIRE(graph.add_node(std::move(print_node)) == print_id);
    REQUIRE(graph.connect(start_id, start_exec_out->get_id(), print_id, print_exec_in->get_id()));

    nlohmann::json json_doc = GraphSerializer::to_json(graph);
    json_doc["connections"][0]["from"]["nodeId"] = 999999;

    auto restored_result = GraphSerializer::from_json(json_doc);
    REQUIRE(!restored_result.has_value());
    REQUIRE(restored_result.error().code == error_codes::serializer::InvalidConnection);
}

TEST_CASE("GraphSerializer: Ошибка если connection с отсутствующим портом",
          "[graph][serialization][negative]") {
    Graph graph("ConnectedGraph");

    auto start_node = NodeFactory::create(NodeTypes::Start);
    auto print_node = NodeFactory::create(NodeTypes::PrintString);

    REQUIRE(start_node != nullptr);
    REQUIRE(print_node != nullptr);

    const auto start_id = start_node->get_id();
    const auto print_id = print_node->get_id();

    const auto* start_exec_out = start_node->get_exec_output_ports().at(0);
    const auto* print_exec_in = print_node->get_exec_input_ports().at(0);

    REQUIRE(graph.add_node(std::move(start_node)) == start_id);
    REQUIRE(graph.add_node(std::move(print_node)) == print_id);
    REQUIRE(graph.connect(start_id, start_exec_out->get_id(), print_id, print_exec_in->get_id()));

    nlohmann::json json_doc = GraphSerializer::to_json(graph);
    json_doc["connections"][0]["to"]["portId"] = 123456;

    auto restored_result = GraphSerializer::from_json(json_doc);
    REQUIRE(!restored_result.has_value());
    REQUIRE(restored_result.error().code == error_codes::serializer::InvalidConnection);
}

TEST_CASE("GraphSerializer: Ошибка если connection без id", "[graph][serialization][negative]") {
    Graph graph("ConnectedGraph");

    auto start_node = NodeFactory::create(NodeTypes::Start);
    auto print_node = NodeFactory::create(NodeTypes::PrintString);

    REQUIRE(start_node != nullptr);
    REQUIRE(print_node != nullptr);

    const auto start_id = start_node->get_id();
    const auto print_id = print_node->get_id();

    const auto* start_exec_out = start_node->get_exec_output_ports().at(0);
    const auto* print_exec_in = print_node->get_exec_input_ports().at(0);

    REQUIRE(graph.add_node(std::move(start_node)) == start_id);
    REQUIRE(graph.add_node(std::move(print_node)) == print_id);
    REQUIRE(graph.connect(start_id, start_exec_out->get_id(), print_id, print_exec_in->get_id()));

    nlohmann::json json_doc = GraphSerializer::to_json(graph);
    json_doc["connections"][0].erase("id");

    auto restored_result = GraphSerializer::from_json(json_doc);
    REQUIRE(!restored_result.has_value());
    REQUIRE(restored_result.error().code == error_codes::serializer::InvalidConnection);
}

TEST_CASE("GraphSerializer: Ошибка если connection с дублирующимся id",
          "[graph][serialization][negative]") {
    Graph graph("ConnectedGraph");

    auto start_node = NodeFactory::create(NodeTypes::Start);
    auto print_first_node = NodeFactory::create(NodeTypes::PrintString);
    auto print_second_node = NodeFactory::create(NodeTypes::PrintString);

    REQUIRE(start_node != nullptr);
    REQUIRE(print_first_node != nullptr);
    REQUIRE(print_second_node != nullptr);

    const auto start_id = start_node->get_id();
    const auto print_first_id = print_first_node->get_id();
    const auto print_second_id = print_second_node->get_id();

    const auto* start_exec_out = start_node->get_exec_output_ports().at(0);
    const auto* print_first_exec_in = print_first_node->get_exec_input_ports().at(0);
    const auto* print_first_exec_out = print_first_node->get_exec_output_ports().at(0);
    const auto* print_second_exec_in = print_second_node->get_exec_input_ports().at(0);

    REQUIRE(graph.add_node(std::move(start_node)) == start_id);
    REQUIRE(graph.add_node(std::move(print_first_node)) == print_first_id);
    REQUIRE(graph.add_node(std::move(print_second_node)) == print_second_id);

    REQUIRE(graph.connect(
        start_id, start_exec_out->get_id(), print_first_id, print_first_exec_in->get_id()));
    REQUIRE(graph.connect(print_first_id,
                          print_first_exec_out->get_id(),
                          print_second_id,
                          print_second_exec_in->get_id()));

    nlohmann::json json_doc = GraphSerializer::to_json(graph);
    REQUIRE(json_doc["connections"].size() == 2);
    json_doc["connections"][1]["id"] = json_doc["connections"][0]["id"];

    auto restored_result = GraphSerializer::from_json(json_doc);
    REQUIRE(!restored_result.has_value());
    REQUIRE(restored_result.error().code == error_codes::serializer::InvalidConnection);
}

TEST_CASE("GraphSerializer: Ошибка если connection Output->Output",
          "[graph][serialization][negative]") {
    Graph graph("DirectionMismatchGraph");

    auto start_node = NodeFactory::create(NodeTypes::Start);
    auto print_node = NodeFactory::create(NodeTypes::PrintString);

    REQUIRE(start_node != nullptr);
    REQUIRE(print_node != nullptr);

    const auto start_id = start_node->get_id();
    const auto print_id = print_node->get_id();

    const auto* start_exec_out = start_node->get_exec_output_ports().at(0);
    const auto* print_exec_out = print_node->get_exec_output_ports().at(0);

    REQUIRE(graph.add_node(std::move(start_node)) == start_id);
    REQUIRE(graph.add_node(std::move(print_node)) == print_id);

    nlohmann::json json_doc = GraphSerializer::to_json(graph);
    json_doc["connections"] = nlohmann::json::array({
        {
            {"id", 1},
            {"from", {{"nodeId", start_id.value}, {"portId", start_exec_out->get_id().value}}},
            {"to", {{"nodeId", print_id.value}, {"portId", print_exec_out->get_id().value}}},
        },
    });

    auto restored_result = GraphSerializer::from_json(json_doc);
    REQUIRE(!restored_result.has_value());
    REQUIRE(restored_result.error().code == error_codes::serializer::InvalidConnection);
}

TEST_CASE("GraphSerializer: Ошибка если connection Execution->StringView",
          "[graph][serialization][negative]") {
    Graph graph("TypeMismatchGraph");

    auto start_node = NodeFactory::create(NodeTypes::Start);
    auto print_node = NodeFactory::create(NodeTypes::PrintString);

    REQUIRE(start_node != nullptr);
    REQUIRE(print_node != nullptr);

    const auto start_id = start_node->get_id();
    const auto print_id = print_node->get_id();

    const auto* start_exec_out = start_node->get_exec_output_ports().at(0);
    const auto* print_value_input = print_node->get_input_ports().at(1);

    REQUIRE(graph.add_node(std::move(start_node)) == start_id);
    REQUIRE(graph.add_node(std::move(print_node)) == print_id);

    nlohmann::json json_doc = GraphSerializer::to_json(graph);
    json_doc["connections"] = nlohmann::json::array({
        {
            {"id", 1},
            {"from", {{"nodeId", start_id.value}, {"portId", start_exec_out->get_id().value}}},
            {"to", {{"nodeId", print_id.value}, {"portId", print_value_input->get_id().value}}},
        },
    });

    auto restored_result = GraphSerializer::from_json(json_doc);
    REQUIRE(!restored_result.has_value());
    REQUIRE(restored_result.error().code == error_codes::serializer::InvalidConnection);
}

TEST_CASE("GraphSerializer: Агрегирует ошибки нескольких битых connections",
          "[graph][serialization][negative]") {
    Graph graph("AggregateErrorsGraph");

    auto start_node = NodeFactory::create(NodeTypes::Start);
    auto print_node = NodeFactory::create(NodeTypes::PrintString);

    REQUIRE(start_node != nullptr);
    REQUIRE(print_node != nullptr);

    const auto start_id = start_node->get_id();
    const auto print_id = print_node->get_id();

    const auto* start_exec_out = start_node->get_exec_output_ports().at(0);
    const auto* print_exec_out = print_node->get_exec_output_ports().at(0);

    REQUIRE(graph.add_node(std::move(start_node)) == start_id);
    REQUIRE(graph.add_node(std::move(print_node)) == print_id);

    nlohmann::json json_doc = GraphSerializer::to_json(graph);
    json_doc["connections"] = nlohmann::json::array({
        {
            {"id", 1},
            {"from", {{"nodeId", 999999}, {"portId", start_exec_out->get_id().value}}},
            {"to", {{"nodeId", print_id.value}, {"portId", print_exec_out->get_id().value}}},
        },
        {
            {"id", 2},
            {"from", {{"nodeId", start_id.value}, {"portId", start_exec_out->get_id().value}}},
            {"to", {{"nodeId", print_id.value}, {"portId", print_exec_out->get_id().value}}},
        },
    });

    const auto restored_result = GraphSerializer::from_json(json_doc);
    REQUIRE(!restored_result.has_value());
    REQUIRE(restored_result.error().code == error_codes::serializer::InvalidConnection);
    REQUIRE(restored_result.error().message.find("connections[0]") != std::string::npos);
    REQUIRE(restored_result.error().message.find("connections[1]") != std::string::npos);
}

TEST_CASE("GraphSerializer: Fuzz-десериализация connections не падает",
          "[graph][serialization][fuzz]") {
    Graph base_graph("FuzzGraph");

    auto start_node = NodeFactory::create(NodeTypes::Start);
    auto print_node = NodeFactory::create(NodeTypes::PrintString);

    REQUIRE(start_node != nullptr);
    REQUIRE(print_node != nullptr);

    const auto start_id = start_node->get_id();
    const auto print_id = print_node->get_id();

    const auto* start_exec_out = start_node->get_exec_output_ports().at(0);
    const auto* print_exec_in = print_node->get_exec_input_ports().at(0);

    REQUIRE(base_graph.add_node(std::move(start_node)) == start_id);
    REQUIRE(base_graph.add_node(std::move(print_node)) == print_id);
    REQUIRE(
        base_graph.connect(start_id, start_exec_out->get_id(), print_id, print_exec_in->get_id())
            .has_value());

    const nlohmann::json seed_json = GraphSerializer::to_json(base_graph);

    std::mt19937_64 rng(0xC0FFEEULL);
    std::uniform_int_distribution<int> mutation_dist(0, 6);
    std::uniform_int_distribution<int> bad_id_dist(0, 3);

    for (int iteration = 0; iteration < 200; ++iteration) {
        nlohmann::json mutated = seed_json;

        switch (mutation_dist(rng)) {
            case 0:
                mutated["connections"][0].erase("id");
                break;
            case 1:
                mutated["connections"][0]["from"]["nodeId"] = bad_id_dist(rng) == 0 ? -1 : 999999;
                break;
            case 2:
                mutated["connections"][0]["to"]["portId"] = bad_id_dist(rng) == 0 ? -1 : 999999;
                break;
            case 3:
                mutated["connections"][0]["from"]["portId"] = "not-a-number";
                break;
            case 4: {
                const auto connection_copy = mutated["connections"][0];
                mutated["connections"] = nlohmann::json::array({connection_copy, connection_copy});
                mutated["connections"][1]["id"] = connection_copy.value("id", 1);
                break;
            }
            case 5:
                mutated["connections"][0]["to"] = nlohmann::json::object();
                break;
            case 6:
                mutated["connections"][0]["from"]["nodeId"] = print_id.value;
                mutated["connections"][0]["to"]["nodeId"] = start_id.value;
                mutated["connections"][0]["to"]["portId"] = start_exec_out->get_id().value;
                break;
            default:
                FAIL("Недостижимая ветка fuzz мутации");
        }

        bool threw_exception = false;
        auto res = Result<Graph>(Error{.message = "", .code = 0});
        try {
            res = GraphSerializer::from_json(mutated);
        } catch (...) {
            threw_exception = true;
        }

        REQUIRE(!threw_exception);
        if (res.has_error()) {
            REQUIRE((res.error().code == error_codes::serializer::InvalidConnection ||
                     res.error().code == error_codes::serializer::MissingField ||
                     res.error().code == error_codes::serializer::InvalidDocument));
        }
    }
}
