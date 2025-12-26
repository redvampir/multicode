// Copyright (c) 2025 МультиКод Team. MIT License.

#include <catch2/catch_all.hpp>

#include "visprog/core/Node.hpp"
#include "visprog/core/NodeFactory.hpp"

using namespace visprog::core;

// ============================================================================
// Node Construction and Properties
// ============================================================================

TEST_CASE("Node: Basic Construction via Factory", "[node][factory]") {
    auto node = NodeFactory::create(NodeTypes::PrintString, "MyPrintNode");

    REQUIRE(node != nullptr);
    REQUIRE(node->get_type().name == NodeTypes::PrintString.name);
    REQUIRE(node->get_type().label == NodeTypes::PrintString.label);
    REQUIRE(node->get_instance_name() == "MyPrintNode");
}

TEST_CASE("Node: Default Instance Name", "[node][factory]") {
    auto node = NodeFactory::create(NodeTypes::Start);

    REQUIRE(node != nullptr);
    // Check if the default name is in the format "Label #ID"
    REQUIRE(node->get_instance_name().starts_with(NodeTypes::Start.label));
    REQUIRE(node->get_instance_name().find(std::to_string(node->get_id().value)) !=
            std::string::npos);
}

// ============================================================================
// Node Properties (New system, replaces Metadata)
// ============================================================================

TEST_CASE("Node: Properties", "[node][properties]") {
    auto node = NodeFactory::create(NodeTypes::PrintString);
    REQUIRE(node != nullptr);

    SECTION("Get default property") {
        auto default_val = node->get_property<std::string>("value");
        REQUIRE(default_val.has_value());
        REQUIRE(default_val.value() == "Hello, World!");
    }

    SECTION("Set and get string property") {
        node->set_property("value", std::string("New message"));
        auto new_val = node->get_property<std::string>("value");
        REQUIRE(new_val.has_value());
        REQUIRE(new_val.value() == "New message");
    }

    SECTION("Set and get other property types") {
        node->set_property("my_number", 123.45);
        node->set_property("my_integer", (int64_t)99);
        node->set_property("my_bool", true);

        auto num_val = node->get_property<double>("my_number");
        auto int_val = node->get_property<int64_t>("my_integer");
        auto bool_val = node->get_property<bool>("my_bool");

        REQUIRE(num_val.has_value());
        REQUIRE(num_val.value() == 123.45);
        REQUIRE(int_val.has_value());
        REQUIRE(int_val.value() == 99);
        REQUIRE(bool_val.has_value());
        REQUIRE(bool_val.value() == true);
    }

    SECTION("Get non-existent property") {
        auto val = node->get_property<std::string>("non_existent_key");
        REQUIRE(!val.has_value());
    }

    SECTION("Type mismatch") {
        auto val = node->get_property<int64_t>("value");  // "value" is a string
        REQUIRE(!val.has_value());
    }
}

// ============================================================================
// NodeFactory Tests (Adapted for new architecture)
// ============================================================================

TEST_CASE("NodeFactory: Create Core Nodes", "[factory]") {
    SECTION("Create Start node") {
        auto node = NodeFactory::create(NodeTypes::Start);
        REQUIRE(node != nullptr);
        REQUIRE(node->get_type().name == NodeTypes::Start.name);
        REQUIRE(node->get_input_ports().empty());
        REQUIRE(node->get_output_ports().size() == 1);
        REQUIRE(node->get_output_ports()[0]->is_execution());
    }

    SECTION("Create End node") {
        auto node = NodeFactory::create(NodeTypes::End);
        REQUIRE(node != nullptr);
        REQUIRE(node->get_type().name == NodeTypes::End.name);
        REQUIRE(node->get_output_ports().empty());
        REQUIRE(node->get_input_ports().size() == 1);
        REQUIRE(node->get_input_ports()[0]->is_execution());
    }

    SECTION("Create PrintString node") {
        auto node = NodeFactory::create(NodeTypes::PrintString);
        REQUIRE(node != nullptr);
        REQUIRE(node->get_type().name == NodeTypes::PrintString.name);
        REQUIRE(node->get_exec_input_ports().size() == 1);
        REQUIRE(node->get_exec_output_ports().size() == 1);
        REQUIRE(node->get_input_ports().size() == 2);  // exec + data
        auto data_ports = node->get_input_ports();
        auto it =
            std::ranges::find_if(data_ports, [](const Port* p) { return !p->is_execution(); });
        REQUIRE(it != data_ports.end());
        REQUIRE((*it)->get_name() == "value");
        REQUIRE((*it)->get_data_type() == DataType::StringView);
    }

    SECTION("Unique IDs") {
        auto node1 = NodeFactory::create(NodeTypes::Start);
        auto node2 = NodeFactory::create(NodeTypes::Start);
        REQUIRE(node1->get_id() != node2->get_id());
    }
}

// ============================================================================
// Validation Tests (Adapted)
// ============================================================================

TEST_CASE("Node: Validation", "[node][validation]") {
    SECTION("Valid Start node") {
        auto node = NodeFactory::create(NodeTypes::Start);
        auto result = node->validate();
        REQUIRE(result.has_value());
    }

    SECTION("Valid End node") {
        auto node = NodeFactory::create(NodeTypes::End);
        auto result = node->validate();
        REQUIRE(result.has_value());
    }

    SECTION("Node with empty instance name - auto-generated") {
        // NodeFactory::create auto-generates a name if empty string is passed.
        // This is the expected behavior since commit 2e2bb9e.
        auto node = NodeFactory::create(NodeTypes::PrintString, "");

        // Name should be auto-generated, not empty
        REQUIRE(!node->get_instance_name().empty());
        REQUIRE(node->get_instance_name().find("Print String") != std::string::npos);

        // Validation should pass because name was auto-generated
        auto result = node->validate();
        REQUIRE(result.has_value());
    }
}
