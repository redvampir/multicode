// Copyright (c) 2025 МультиКод Team. MIT License.

#include <catch2/catch_all.hpp>
#include "visprog/core/Node.hpp"
#include "visprog/core/NodeFactory.hpp"

using namespace visprog::core;

// ============================================================================
// Node Construction Tests
// ============================================================================

TEST_CASE("Node: Basic construction", "[node]") {
    const auto node_id = NodeId{42};
    const auto node_type = NodeType::Function;
    const std::string name = "testNode";
    
    Node node(node_id, node_type, name);
    
    REQUIRE(node.get_id() == node_id);
    REQUIRE(node.get_type() == node_type);
    REQUIRE(node.get_name() == name);
}

TEST_CASE("Node: Display name", "[node]") {
    Node node(NodeId{1}, NodeType::Function, "calculateSum");
    
    SECTION("Default display name equals name") {
        REQUIRE(node.get_display_name() == "calculateSum");
    }
    
    SECTION("Custom display name") {
        node.set_display_name("Вычисление суммы");
        REQUIRE(node.get_display_name() == "Вычисление суммы");
        REQUIRE(node.get_name() == "calculateSum");  // Original unchanged
    }
}

// ============================================================================
// Port Management Tests
// ============================================================================

TEST_CASE("Node: Add input ports", "[node][ports]") {
    Node node(NodeId{1}, NodeType::Function, "test");
    
    const auto port1 = node.add_input_port(DataType::Int32, "a");
    const auto port2 = node.add_input_port(DataType::Int32, "b");
    
    REQUIRE(port1.value != 0);
    REQUIRE(port2.value != 0);
    REQUIRE(port1 != port2);
    
    const auto inputs = node.get_input_ports();
    REQUIRE(inputs.size() == 2);
}

TEST_CASE("Node: Add output ports", "[node][ports]") {
    Node node(NodeId{1}, NodeType::Function, "test");
    
    const auto port = node.add_output_port(DataType::Int32, "result");
    
    REQUIRE(port.value != 0);
    
    const auto outputs = node.get_output_ports();
    REQUIRE(outputs.size() == 1);
}

TEST_CASE("Node: Execution ports", "[node][ports]") {
    Node node(NodeId{1}, NodeType::Function, "test");
    
    REQUIRE(!node.has_execution_flow());
    
    const auto exec_in = node.add_exec_input();
    REQUIRE(exec_in.value != 0);
    REQUIRE(node.has_execution_flow());

    const auto exec_out = node.add_exec_output();
    REQUIRE(exec_out.value != 0);

    const auto exec_inputs = node.get_exec_input_ports();
    const auto exec_outputs = node.get_exec_output_ports();

    REQUIRE(exec_inputs.size() == 1);
    REQUIRE(exec_outputs.size() == 1);
}

TEST_CASE("Node: Find port by ID", "[node][ports]") {
    Node node(NodeId{1}, NodeType::Function, "test");
    
    const auto port_id = node.add_input_port(DataType::Int32, "x");
    
    const auto* found = node.find_port(port_id);
    REQUIRE(found != nullptr);
    REQUIRE(found->get_id() == port_id);
    REQUIRE(found->get_name() == "x");
    
    const auto* not_found = node.find_port(PortId{999});
    REQUIRE(not_found == nullptr);
}

TEST_CASE("Node: Remove port", "[node][ports]") {
    Node node(NodeId{1}, NodeType::Function, "test");
    
    const auto port_id = node.add_input_port(DataType::Int32, "x");
    REQUIRE(node.get_input_ports().size() == 1);
    
    const auto result = node.remove_port(port_id);
    REQUIRE(result.has_value());
    REQUIRE(node.get_input_ports().size() == 0);
}

// ============================================================================
// Metadata Tests
// ============================================================================

TEST_CASE("Node: Metadata", "[node][metadata]") {
    Node node(NodeId{1}, NodeType::Function, "test");
    
    SECTION("Set and get metadata") {
        node.set_metadata("key1", "value1");
        node.set_metadata("key2", "value2");
        
        const auto val1 = node.get_metadata("key1");
        REQUIRE(val1.has_value());
        REQUIRE(val1.value() == "value1");
        
        const auto val2 = node.get_metadata("key2");
        REQUIRE(val2.has_value());
        REQUIRE(val2.value() == "value2");
    }
    
    SECTION("Non-existent key") {
        const auto val = node.get_metadata("nonexistent");
        REQUIRE(!val.has_value());
    }
    
    SECTION("Update metadata") {
        node.set_metadata("key", "value1");
        node.set_metadata("key", "value2");  // Overwrite
        
        const auto val = node.get_metadata("key");
        REQUIRE(val.value() == "value2");
    }
}

// ============================================================================
// Validation Tests
// ============================================================================

TEST_CASE("Node: Validation - valid node", "[node][validation]") {
    Node node(NodeId{1}, NodeType::Function, "test");
    node.add_exec_input();
    node.add_exec_output();
    node.add_input_port(DataType::Int32, "a");
    node.add_output_port(DataType::Int32, "result");
    
    const auto result = node.validate();
    REQUIRE(result.has_value());
}

TEST_CASE("Node: Validation - empty name", "[node][validation]") {
    Node node(NodeId{1}, NodeType::Function, "");
    
    const auto result = node.validate();
    REQUIRE(!result.has_value());
    REQUIRE(result.error().code == 100);
}

TEST_CASE("Node: Validation - Start node", "[node][validation]") {
    Node start(NodeId{1}, NodeType::Start, "start");
    
    SECTION("Valid Start node") {
        start.add_exec_output();
        
        const auto result = start.validate();
        REQUIRE(result.has_value());
    }
    
    SECTION("Start node with exec input - invalid") {
        start.add_exec_input();
        start.add_exec_output();
        
        const auto result = start.validate();
        REQUIRE(!result.has_value());
        REQUIRE(result.error().code == 103);
    }
    
    SECTION("Start node without exec output - invalid") {
        const auto result = start.validate();
        REQUIRE(!result.has_value());
        REQUIRE(result.error().code == 104);
    }
}

TEST_CASE("Node: Validation - End node", "[node][validation]") {
    Node end(NodeId{1}, NodeType::End, "end");
    
    SECTION("Valid End node") {
        end.add_exec_input();
        
        const auto result = end.validate();
        REQUIRE(result.has_value());
    }
    
    SECTION("End node with exec output - invalid") {
        end.add_exec_input();
        end.add_exec_output();
        
        const auto result = end.validate();
        REQUIRE(!result.has_value());
        REQUIRE(result.error().code == 105);
    }
}

TEST_CASE("Node: Validation - Pure function", "[node][validation]") {
    Node pure(NodeId{1}, NodeType::PureFunction, "sqrt");
    
    SECTION("Valid pure function") {
        pure.add_input_port(DataType::Float, "x");
        pure.add_output_port(DataType::Float, "result");
        
        const auto result = pure.validate();
        REQUIRE(result.has_value());
    }
    
    SECTION("Pure function with exec flow - invalid") {
        pure.add_exec_input();
        pure.add_input_port(DataType::Float, "x");
        
        const auto result = pure.validate();
        REQUIRE(!result.has_value());
        REQUIRE(result.error().code == 107);
    }
}

// ============================================================================
// NodeFactory Tests
// ============================================================================

TEST_CASE("NodeFactory: Create nodes", "[factory]") {
    SECTION("Create Function node") {
        auto node = NodeFactory::create(NodeType::Function, "myFunc");
        
        REQUIRE(node != nullptr);
        REQUIRE(node->get_type() == NodeType::Function);
        REQUIRE(node->get_name() == "myFunc");
        REQUIRE(node->has_execution_flow());
    }
    
    SECTION("Create Start node") {
        auto node = NodeFactory::create(NodeType::Start);
        
        REQUIRE(node != nullptr);
        REQUIRE(node->get_type() == NodeType::Start);
        REQUIRE(node->get_exec_output_ports().size() == 1);
    }
    
    SECTION("Create Variable node") {
        auto node = NodeFactory::create(NodeType::Variable, "counter");
        
        REQUIRE(node != nullptr);
        REQUIRE(node->get_type() == NodeType::Variable);
        REQUIRE(node->get_output_ports().size() == 1);
    }
    
    SECTION("Create If node") {
        auto node = NodeFactory::create(NodeType::If);
        
        REQUIRE(node != nullptr);
        REQUIRE(node->has_execution_flow());
        REQUIRE(node->get_exec_output_ports().size() == 2);  // true/false
    }
    
    SECTION("Unique IDs") {
        auto node1 = NodeFactory::create(NodeType::Function);
        auto node2 = NodeFactory::create(NodeType::Function);
        
        REQUIRE(node1->get_id() != node2->get_id());
    }
}

TEST_CASE("NodeFactory: Operators", "[factory]") {
    SECTION("Binary operators") {
        auto add = NodeFactory::create(NodeType::Add);
        
        REQUIRE(!add->has_execution_flow());  // Pure
        REQUIRE(add->get_input_ports().size() == 2);  // a, b
        REQUIRE(add->get_output_ports().size() == 1);  // result
    }
    
    SECTION("Comparison operators") {
        auto eq = NodeFactory::create(NodeType::Equal);
        
        REQUIRE(eq->get_input_ports().size() == 2);
        REQUIRE(eq->get_output_ports().size() == 1);
        
        const auto* result_port = eq->get_output_ports()[0];
        REQUIRE(result_port->get_data_type() == DataType::Bool);
    }
}
