// Copyright (c) 2025 МультиКод Team. MIT License.

#include <catch2/catch_all.hpp>
#include <nlohmann/json.hpp>

#include "visprog/core/GraphSerializer.hpp"
#include "visprog/core/NodeFactory.hpp"
#include "visprog/core/Port.hpp"

using namespace visprog::core;

namespace {

constexpr const char* kSnapshotGraph = R"JSON({
  "schema": {
    "version": "1.0.0",
    "coreMin": "0.1.0-alpha",
    "coreMax": "0.1.x"
  },
  "graph": {
    "id": 7,
    "name": "DemoGraph",
    "metadata": {
      "author": "team",
      "version": "1"
    }
  },
  "nodes": [
    {
      "id": 101,
      "type": "Start",
      "name": "Entry",
      "displayName": "Вход",
      "description": "Начало сценария",
      "metadata": {
        "category": "control"
      },
      "ports": [
        {
          "id": 5001,
          "name": "exec_out",
          "direction": "Output",
          "dataType": "exec"
        }
      ]
    },
    {
      "id": 205,
      "type": "Function",
      "name": "Process",
      "displayName": "Обработка",
      "metadata": {},
      "ports": [
        {
          "id": 5002,
          "name": "exec_in",
          "direction": "Input",
          "dataType": "exec"
        },
        {
          "id": 5003,
          "name": "exec_out",
          "direction": "Output",
          "dataType": "exec"
        },
        {
          "id": 6001,
          "name": "payload",
          "direction": "Input",
          "dataType": "std::vector<T>",
          "typeName": "game.item"
        },
        {
          "id": 6002,
          "name": "result",
          "direction": "Output",
          "dataType": "int32_t"
        }
      ]
    }
  ],
  "connections": [
    {
      "id": 8001,
      "type": "Execution",
      "from": {
        "nodeId": 101,
        "portId": 5001
      },
      "to": {
        "nodeId": 205,
        "portId": 5002
      }
    }
  ]
})JSON";

constexpr std::uint64_t kSnapshotMaxNodeId = 205;
constexpr std::uint64_t kSnapshotMaxPortId = 6002;
constexpr std::uint64_t kSnapshotMaxConnectionId = 8001;

}  // namespace

TEST_CASE("GraphSerializer: snapshot JSON round-trip", "[graph][serialization]") {
    const auto snapshot = nlohmann::json::parse(kSnapshotGraph);
    auto graph_result = GraphSerializer::from_json(snapshot);
    REQUIRE(graph_result.has_value());

    auto graph = std::move(graph_result).value();
    REQUIRE(graph.get_name() == "DemoGraph");
    REQUIRE(graph.node_count() == 2);
    REQUIRE(graph.connection_count() == 1);

    const auto* process = graph.get_node(NodeId{205});
    REQUIRE(process != nullptr);
    REQUIRE(process->get_ports().size() == 4);
    const auto* payload_port = process->find_port(PortId{6001});
    REQUIRE(payload_port != nullptr);
    REQUIRE(payload_port->get_type_name() == "game.item");

    const auto serialized = GraphSerializer::to_json(graph);
    REQUIRE(serialized == snapshot);

    auto new_node = NodeFactory::create(NodeType::Variable, "tmp");
    REQUIRE(new_node->get_id().value >= kSnapshotMaxNodeId + 1);

    const auto new_port_id = Port::generate_unique_id();
    REQUIRE(new_port_id.value >= kSnapshotMaxPortId + 1);

    const auto serialized_connection = graph.get_connections()[0];
    REQUIRE(serialized_connection.id.value == kSnapshotMaxConnectionId);
}

TEST_CASE("GraphSerializer: round-trip preserves metadata", "[graph][serialization]") {
    Graph graph("RoundTrip");
    graph.set_metadata("version", "dev");

    auto start = NodeFactory::create(NodeType::Start, "StartNode");
    auto op = NodeFactory::create(NodeType::Function, "AddNode");
    auto start_id = graph.add_node(std::move(start));
    auto op_id = graph.add_node(std::move(op));
    REQUIRE(start_id);
    REQUIRE(op_id);

    auto* op_node = graph.get_node_mut(op_id);
    REQUIRE(op_node != nullptr);
    auto value_port = op_node->add_input_port(DataType::Pointer, "buffer");
    auto* port_ptr = op_node->find_port(value_port);
    REQUIRE(port_ptr != nullptr);

    const auto start_exec_out = graph.get_node(start_id)->get_exec_output_ports()[0]->get_id();
    const auto op_exec_in = graph.get_node(op_id)->get_exec_input_ports()[0]->get_id();
    auto connection_result = graph.connect(start_id, start_exec_out, op_id, op_exec_in);
    REQUIRE(connection_result.has_value());

    const auto json = GraphSerializer::to_json(graph);
    auto restored_result = GraphSerializer::from_json(json);
    REQUIRE(restored_result.has_value());
    auto restored = std::move(restored_result).value();

    REQUIRE(restored.get_name() == graph.get_name());
    REQUIRE(restored.get_metadata("version").value() == "dev");
    REQUIRE(restored.node_count() == graph.node_count());
    REQUIRE(restored.connection_count() == 1);

    const auto* restored_op = restored.get_node(op_id);
    REQUIRE(restored_op != nullptr);
    const auto* restored_port = restored_op->find_port(value_port);
    REQUIRE(restored_port != nullptr);
    REQUIRE(restored_port->get_name() == "buffer");
}

TEST_CASE("GraphSerializer: invalid enums are rejected", "[graph][serialization][negative]") {
    nlohmann::json invalid = nlohmann::json::parse(R"JSON({
        "schema": {
            "version": "1.0.0",
            "coreMin": "0.1.0-alpha",
            "coreMax": "0.1.x"
        },
        "graph": {
            "id": 1,
            "name": "Broken",
            "metadata": {}
        },
        "nodes": [
            {
                "id": 10,
                "type": "UnknownType",
                "name": "X",
                "metadata": {},
                "ports": []
            }
        ]
    })JSON");

    auto result = GraphSerializer::from_json(invalid);
    REQUIRE_FALSE(result.has_value());
    REQUIRE(result.error().code == 602);
}

TEST_CASE("GraphSerializer: schema guard rejects incompatible payloads", "[graph][serialization][negative]") {
    const auto base = nlohmann::json::parse(kSnapshotGraph);

    SECTION("missing schema block") {
        auto broken = base;
        broken.erase("schema");
        auto result = GraphSerializer::from_json(broken);
        REQUIRE_FALSE(result.has_value());
        REQUIRE(result.error().code == 606);
    }

    SECTION("version mismatch") {
        auto broken = base;
        broken["schema"]["version"] = "0.9.0";
        auto result = GraphSerializer::from_json(broken);
        REQUIRE_FALSE(result.has_value());
        REQUIRE(result.error().code == 606);
    }

    SECTION("core window mismatch") {
        auto broken = base;
        broken["schema"]["coreMin"] = "0.2.0";
        broken["schema"]["coreMax"] = "0.3.x";
        auto result = GraphSerializer::from_json(broken);
        REQUIRE_FALSE(result.has_value());
        REQUIRE(result.error().code == 606);
    }
}
