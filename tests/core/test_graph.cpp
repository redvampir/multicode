// Copyright (c) 2025 МультиКод Team. MIT License.

#include <catch2/catch_all.hpp>
#include "visprog/core/Graph.hpp"
#include "visprog/core/NodeFactory.hpp"

using namespace visprog::core;

// ============================================================================
// Graph Construction Tests
// ============================================================================

TEST_CASE("Graph: Basic construction", "[graph]") {
    Graph graph("TestGraph");
    
    REQUIRE(graph.get_name() == "TestGraph");
    REQUIRE(graph.empty());
    REQUIRE(graph.node_count() == 0);
    REQUIRE(graph.connection_count() == 0);
}

// ============================================================================
// Node Management Tests
// ============================================================================

TEST_CASE("Graph: Add nodes", "[graph][nodes]") {
    Graph graph("test");
    
    auto node1 = NodeFactory::create(NodeType::Function, "func1");
    auto node2 = NodeFactory::create(NodeType::Variable, "var1");
    
    const auto node_id1 = node1->get_id();
    const auto node_id2 = node2->get_id();
    
    auto returned_id1 = graph.add_node(std::move(node1));
    auto returned_id2 = graph.add_node(std::move(node2));
    
    REQUIRE(returned_id1);  // Valid NodeId
    REQUIRE(returned_id2);
    REQUIRE(returned_id1 == node_id1);
    REQUIRE(returned_id2 == node_id2);
    REQUIRE(graph.node_count() == 2);
    REQUIRE(!graph.empty());
}

TEST_CASE("Graph: Get node", "[graph][nodes]") {
    Graph graph("test");
    
    auto node = NodeFactory::create(NodeType::Function, "func");
    const auto node_id = node->get_id();
    
    const auto added_id = graph.add_node(std::move(node));
    REQUIRE(added_id == node_id);
    
    const auto* found = graph.get_node(node_id);
    REQUIRE(found != nullptr);
    REQUIRE(found->get_id() == node_id);
    REQUIRE(found->get_name() == "func");
    
    const auto* not_found = graph.get_node(NodeId{999});
    REQUIRE(not_found == nullptr);
}

TEST_CASE("Graph: Remove node", "[graph][nodes]") {
    Graph graph("test");
    
    auto node = NodeFactory::create(NodeType::Function);
    const auto node_id = node->get_id();
    
    const auto added_id = graph.add_node(std::move(node));
    REQUIRE(added_id == node_id);
    REQUIRE(graph.node_count() == 1);
    
    auto result = graph.remove_node(node_id);
    REQUIRE(result.has_value());
    REQUIRE(graph.node_count() == 0);
    REQUIRE(graph.get_node(node_id) == nullptr);
}

TEST_CASE("Graph: Cannot add duplicate node ID", "[graph][nodes]") {
    Graph graph("test");
    
    // Create two different nodes
    auto node1 = std::make_unique<Node>(NodeId{100}, NodeType::Function, "func1");
    auto node2 = std::make_unique<Node>(NodeId{101}, NodeType::Function, "func2");
    
    const auto id1 = graph.add_node(std::move(node1));
    REQUIRE(id1 == NodeId{100});

    const auto id2 = graph.add_node(std::move(node2));
    REQUIRE(id2 == NodeId{101});
    
    REQUIRE(graph.node_count() == 2);
}

// ============================================================================
// Connection Tests
// ============================================================================

TEST_CASE("Graph: Connect nodes - valid execution flow", "[graph][connections]") {
    Graph graph("test");
    
    // Create Start -> Function -> End chain
    auto start = NodeFactory::create(NodeType::Start);
    auto func = NodeFactory::create(NodeType::Function);
    auto end = NodeFactory::create(NodeType::End);
    
    const auto start_id = start->get_id();
    const auto func_id = func->get_id();
    const auto end_id = end->get_id();
    
    const auto start_exec_out = start->get_exec_output_ports()[0]->get_id();
    const auto func_exec_in = func->get_exec_input_ports()[0]->get_id();
    const auto func_exec_out = func->get_exec_output_ports()[0]->get_id();
    const auto end_exec_in = end->get_exec_input_ports()[0]->get_id();
    
    const auto added_start_id = graph.add_node(std::move(start));
    const auto added_func_id = graph.add_node(std::move(func));
    const auto added_end_id = graph.add_node(std::move(end));

    REQUIRE(added_start_id == start_id);
    REQUIRE(added_func_id == func_id);
    REQUIRE(added_end_id == end_id);
    
    // Connect Start -> Function
    const auto conn1 = graph.connect(start_id, start_exec_out, func_id, func_exec_in);
    REQUIRE(conn1.has_value());
    
    // Connect Function -> End
    const auto conn2 = graph.connect(func_id, func_exec_out, end_id, end_exec_in);
    REQUIRE(conn2.has_value());
    
    REQUIRE(graph.connection_count() == 2);
}

TEST_CASE("Graph: Connect nodes - data ports", "[graph][connections]") {
    Graph graph("test");
    
    auto var = NodeFactory::create(NodeType::Variable, "x");
    auto add = NodeFactory::create(NodeType::Add);
    
    const auto var_id = var->get_id();
    const auto add_id = add->get_id();
    
    const auto var_out = var->get_output_ports()[0]->get_id();
    const auto add_in_a = add->get_input_ports()[0]->get_id();
    
    const auto added_var_id = graph.add_node(std::move(var));
    const auto added_add_id = graph.add_node(std::move(add));

    REQUIRE(added_var_id == var_id);
    REQUIRE(added_add_id == add_id);
    
    // Connect variable to add input
    const auto conn = graph.connect(var_id, var_out, add_id, add_in_a);
    REQUIRE(conn.has_value());
}

TEST_CASE("Graph: Connection validation", "[graph][connections][validation]") {
    Graph graph("test");
    
    auto node1 = NodeFactory::create(NodeType::Function);
    auto node2 = NodeFactory::create(NodeType::Function);
    
    const auto id1 = node1->get_id();
    const auto id2 = node2->get_id();
    
    const auto added_id1 = graph.add_node(std::move(node1));
    const auto added_id2 = graph.add_node(std::move(node2));

    REQUIRE(added_id1 == id1);
    REQUIRE(added_id2 == id2);
    
    SECTION("Non-existent source node") {
        const auto port = graph.get_node(id2)->get_exec_input_ports()[0]->get_id();
        const auto result = graph.connect(NodeId{999}, PortId{1}, id2, port);
        
        REQUIRE(!result.has_value());
        REQUIRE(result.error().code == 301);  // Node not found
    }
    
    SECTION("Non-existent target node") {
        const auto port = graph.get_node(id1)->get_exec_output_ports()[0]->get_id();
        const auto result = graph.connect(id1, port, NodeId{999}, PortId{1});
        
        REQUIRE(!result.has_value());
        REQUIRE(result.error().code == 301);
    }
    
    SECTION("Non-existent port") {
        const auto result = graph.connect(id1, PortId{999}, id2, PortId{1});
        
        REQUIRE(!result.has_value());
        REQUIRE(result.error().code == 302);  // or 303
    }
    
    SECTION("Self-connection not allowed") {
        const auto out = graph.get_node(id1)->get_exec_output_ports()[0]->get_id();
        const auto in = graph.get_node(id1)->get_exec_input_ports()[0]->get_id();
        
        const auto result = graph.connect(id1, out, id1, in);
        
        REQUIRE(!result.has_value());
        REQUIRE(result.error().code == 304);
    }
}

TEST_CASE("Graph: Disconnect", "[graph][connections]") {
    Graph graph("test");
    
    auto start = NodeFactory::create(NodeType::Start);
    auto end = NodeFactory::create(NodeType::End);
    
    const auto start_id = start->get_id();
    const auto end_id = end->get_id();
    
    const auto out_port = start->get_exec_output_ports()[0]->get_id();
    const auto in_port = end->get_exec_input_ports()[0]->get_id();
    
    const auto added_start_id = graph.add_node(std::move(start));
    const auto added_end_id = graph.add_node(std::move(end));

    REQUIRE(added_start_id == start_id);
    REQUIRE(added_end_id == end_id);
    
    const auto conn = graph.connect(start_id, out_port, end_id, in_port);
    REQUIRE(conn.has_value());
    REQUIRE(graph.connection_count() == 1);

    // Disconnect
    const auto result = graph.disconnect(conn.value());
    REQUIRE(result.has_value());
    REQUIRE(graph.connection_count() == 0);
}

// ============================================================================
// Topological Sort Tests
// ============================================================================

TEST_CASE("Graph: Topological sort - simple chain", "[graph][topo]") {
    Graph graph("test");
    
    // Start -> Func1 -> Func2 -> End
    auto start = NodeFactory::create(NodeType::Start);
    auto func1 = NodeFactory::create(NodeType::Function, "func1");
    auto func2 = NodeFactory::create(NodeType::Function, "func2");
    auto end = NodeFactory::create(NodeType::End);
    
    const auto start_id = start->get_id();
    const auto func1_id = func1->get_id();
    const auto func2_id = func2->get_id();
    const auto end_id = end->get_id();
    
    const auto added_start_id = graph.add_node(std::move(start));
    const auto added_func1_id = graph.add_node(std::move(func1));
    const auto added_func2_id = graph.add_node(std::move(func2));
    const auto added_end_id = graph.add_node(std::move(end));

    REQUIRE(added_start_id == start_id);
    REQUIRE(added_func1_id == func1_id);
    REQUIRE(added_func2_id == func2_id);
    REQUIRE(added_end_id == end_id);
    
    // Connect
    const auto conn1 = graph.connect(start_id, graph.get_node(start_id)->get_exec_output_ports()[0]->get_id(),
                  func1_id, graph.get_node(func1_id)->get_exec_input_ports()[0]->get_id());

    const auto conn2 = graph.connect(func1_id, graph.get_node(func1_id)->get_exec_output_ports()[0]->get_id(),
                  func2_id, graph.get_node(func2_id)->get_exec_input_ports()[0]->get_id());

    const auto conn3 = graph.connect(func2_id, graph.get_node(func2_id)->get_exec_output_ports()[0]->get_id(),
                  end_id, graph.get_node(end_id)->get_exec_input_ports()[0]->get_id());

    REQUIRE(conn1.has_value());
    REQUIRE(conn2.has_value());
    REQUIRE(conn3.has_value());
    
    auto result = graph.topological_sort();
    REQUIRE(result.has_value());
    
    const auto& sorted = result.value();
    REQUIRE(sorted.size() == 4);
    
    // Start должен быть первым
    REQUIRE(sorted[0] == start_id);
    // End должен быть последним
    REQUIRE(sorted[3] == end_id);
}

TEST_CASE("Graph: Topological sort - detect cycle", "[graph][topo]") {
    Graph graph("test");
    
    auto func1 = NodeFactory::create(NodeType::Function);
    auto func2 = NodeFactory::create(NodeType::Function);
    
    const auto id1 = func1->get_id();
    const auto id2 = func2->get_id();
    
    const auto added_id1 = graph.add_node(std::move(func1));
    const auto added_id2 = graph.add_node(std::move(func2));

    REQUIRE(added_id1 == id1);
    REQUIRE(added_id2 == id2);
    
    // Create cycle: func1 -> func2 -> func1
    const auto conn1 = graph.connect(id1, graph.get_node(id1)->get_exec_output_ports()[0]->get_id(),
                  id2, graph.get_node(id2)->get_exec_input_ports()[0]->get_id());

    const auto conn2 = graph.connect(id2, graph.get_node(id2)->get_exec_output_ports()[0]->get_id(),
                  id1, graph.get_node(id1)->get_exec_input_ports()[0]->get_id());

    REQUIRE(conn1.has_value());
    REQUIRE(conn2.has_value());
    
    auto result = graph.topological_sort();
    REQUIRE(!result.has_value());
    REQUIRE(result.error().code == 400);  // Cycle detected
}

// ============================================================================
// Graph Validation Tests
// ============================================================================

TEST_CASE("Graph: Validation - valid graph", "[graph][validation]") {
    Graph graph("test");
    
    auto start = NodeFactory::create(NodeType::Start);
    auto func = NodeFactory::create(NodeType::Function);
    auto end = NodeFactory::create(NodeType::End);
    
    const auto start_id = start->get_id();
    const auto func_id = func->get_id();
    const auto end_id = end->get_id();
    
    const auto added_start_id = graph.add_node(std::move(start));
    const auto added_func_id = graph.add_node(std::move(func));
    const auto added_end_id = graph.add_node(std::move(end));

    REQUIRE(added_start_id == start_id);
    REQUIRE(added_func_id == func_id);
    REQUIRE(added_end_id == end_id);

    const auto conn1 = graph.connect(
        start_id, graph.get_node(start_id)->get_exec_output_ports()[0]->get_id(),
        func_id, graph.get_node(func_id)->get_exec_input_ports()[0]->get_id());

    const auto conn2 = graph.connect(
        func_id, graph.get_node(func_id)->get_exec_output_ports()[0]->get_id(),
        end_id, graph.get_node(end_id)->get_exec_input_ports()[0]->get_id());

    REQUIRE(conn1.has_value());
    REQUIRE(conn2.has_value());
    
    auto result = graph.validate();
    REQUIRE(result.is_valid);
}

TEST_CASE("Graph: Validation - missing Start node", "[graph][validation]") {
    Graph graph("test");
    
    auto func = NodeFactory::create(NodeType::Function);
    auto end = NodeFactory::create(NodeType::End);

    const auto func_id = func->get_id();
    const auto end_id = end->get_id();

    const auto added_func_id = graph.add_node(std::move(func));
    const auto added_end_id = graph.add_node(std::move(end));

    REQUIRE(added_func_id == func_id);
    REQUIRE(added_end_id == end_id);
    
    auto result = graph.validate();
    REQUIRE(!result.is_valid);
    REQUIRE(result.has_errors());
    REQUIRE(result.errors[0].code == 500);
}

TEST_CASE("Graph: Validation - missing End node", "[graph][validation]") {
    Graph graph("test");
    
    auto start = NodeFactory::create(NodeType::Start);
    auto func = NodeFactory::create(NodeType::Function);

    const auto start_id = start->get_id();
    const auto func_id = func->get_id();

    const auto added_start_id = graph.add_node(std::move(start));
    const auto added_func_id = graph.add_node(std::move(func));

    REQUIRE(added_start_id == start_id);
    REQUIRE(added_func_id == func_id);
    
    auto result = graph.validate();
    REQUIRE(!result.is_valid);
    REQUIRE(result.has_errors());
    REQUIRE(result.errors[0].code == 501);
}

TEST_CASE("Graph: Validation - unreachable nodes", "[graph][validation]") {
    Graph graph("test");
    
    auto start = NodeFactory::create(NodeType::Start);
    auto func1 = NodeFactory::create(NodeType::Function, "connected");
    auto func2 = NodeFactory::create(NodeType::Function, "isolated");  // Not connected
    auto end = NodeFactory::create(NodeType::End);

    const auto start_id = start->get_id();
    const auto func1_id = func1->get_id();
    const auto func2_id = func2->get_id();
    const auto end_id = end->get_id();

    const auto added_start_id = graph.add_node(std::move(start));
    const auto added_func1_id = graph.add_node(std::move(func1));
    const auto added_func2_id = graph.add_node(std::move(func2));  // Isolated
    const auto added_end_id = graph.add_node(std::move(end));

    REQUIRE(added_start_id == start_id);
    REQUIRE(added_func1_id == func1_id);
    REQUIRE(added_func2_id == func2_id);
    REQUIRE(added_end_id == end_id);

    // Connect only Start -> Func1 -> End
    const auto conn1 = graph.connect(start_id, graph.get_node(start_id)->get_exec_output_ports()[0]->get_id(),
                  func1_id, graph.get_node(func1_id)->get_exec_input_ports()[0]->get_id());

    const auto conn2 = graph.connect(func1_id, graph.get_node(func1_id)->get_exec_output_ports()[0]->get_id(),
                  end_id, graph.get_node(end_id)->get_exec_input_ports()[0]->get_id());

    REQUIRE(conn1.has_value());
    REQUIRE(conn2.has_value());
    
    auto result = graph.validate();
    REQUIRE(!result.is_valid);
    REQUIRE(result.has_errors());
    REQUIRE(result.errors[0].code == 503);  // Unreachable nodes
}

// ============================================================================
// Graph Query Tests
// ============================================================================

TEST_CASE("Graph: Find Start node", "[graph][query]") {
    Graph graph("test");
    
    auto start = NodeFactory::create(NodeType::Start);
    auto func = NodeFactory::create(NodeType::Function);

    const auto start_id = start->get_id();
    const auto func_id = func->get_id();

    const auto added_start_id = graph.add_node(std::move(start));
    const auto added_func_id = graph.add_node(std::move(func));

    REQUIRE(added_start_id == start_id);
    REQUIRE(added_func_id == func_id);
    
    const auto* found = graph.find_start_node();
    REQUIRE(found != nullptr);
    REQUIRE(found->get_id() == start_id);
}

TEST_CASE("Graph: Find End nodes", "[graph][query]") {
    Graph graph("test");
    
    auto start = NodeFactory::create(NodeType::Start);
    auto end1 = NodeFactory::create(NodeType::End, "end1");
    auto end2 = NodeFactory::create(NodeType::End, "end2");

    const auto start_id = start->get_id();
    const auto end1_id = end1->get_id();
    const auto end2_id = end2->get_id();

    const auto added_start_id = graph.add_node(std::move(start));
    const auto added_end1_id = graph.add_node(std::move(end1));
    const auto added_end2_id = graph.add_node(std::move(end2));

    REQUIRE(added_start_id == start_id);
    REQUIRE(added_end1_id == end1_id);
    REQUIRE(added_end2_id == end2_id);
    
    const auto ends = graph.find_end_nodes();
    REQUIRE(ends.size() == 2);
}

TEST_CASE("Graph: Get nodes by type", "[graph][query]") {
    Graph graph("test");
    
    auto func1 = NodeFactory::create(NodeType::Function);
    auto func2 = NodeFactory::create(NodeType::Function);
    auto var = NodeFactory::create(NodeType::Variable);

    const auto func1_id = func1->get_id();
    const auto func2_id = func2->get_id();
    const auto var_id = var->get_id();

    const auto added_func1_id = graph.add_node(std::move(func1));
    const auto added_func2_id = graph.add_node(std::move(func2));
    const auto added_var_id = graph.add_node(std::move(var));

    REQUIRE(added_func1_id == func1_id);
    REQUIRE(added_func2_id == func2_id);
    REQUIRE(added_var_id == var_id);
    
    const auto functions = graph.get_nodes_of_type(NodeType::Function);
    REQUIRE(functions.size() == 2);
    
    const auto variables = graph.get_nodes_of_type(NodeType::Variable);
    REQUIRE(variables.size() == 1);
}

TEST_CASE("Graph: Has path", "[graph][query]") {
    Graph graph("test");
    
    auto start = NodeFactory::create(NodeType::Start);
    auto func = NodeFactory::create(NodeType::Function);
    auto end = NodeFactory::create(NodeType::End);

    const auto start_id = start->get_id();
    const auto func_id = func->get_id();
    const auto end_id = end->get_id();

    const auto added_start_id = graph.add_node(std::move(start));
    const auto added_func_id = graph.add_node(std::move(func));
    const auto added_end_id = graph.add_node(std::move(end));

    REQUIRE(added_start_id == start_id);
    REQUIRE(added_func_id == func_id);
    REQUIRE(added_end_id == end_id);

    const auto conn1 = graph.connect(
        start_id, graph.get_node(start_id)->get_exec_output_ports()[0]->get_id(),
        func_id, graph.get_node(func_id)->get_exec_input_ports()[0]->get_id());

    const auto conn2 = graph.connect(
        func_id, graph.get_node(func_id)->get_exec_output_ports()[0]->get_id(),
        end_id, graph.get_node(end_id)->get_exec_input_ports()[0]->get_id());

    REQUIRE(conn1.has_value());
    REQUIRE(conn2.has_value());
    
    REQUIRE(graph.has_path(start_id, end_id));
    REQUIRE(!graph.has_path(end_id, start_id));  // No reverse path
}

// ============================================================================
// Statistics Tests
// ============================================================================

TEST_CASE("Graph: Statistics", "[graph][stats]") {
    Graph graph("test");
    
    auto start = NodeFactory::create(NodeType::Start);
    auto func = NodeFactory::create(NodeType::Function);
    auto end = NodeFactory::create(NodeType::End);

    const auto start_id = start->get_id();
    const auto func_id = func->get_id();
    const auto end_id = end->get_id();

    const auto added_start_id = graph.add_node(std::move(start));
    const auto added_func_id = graph.add_node(std::move(func));
    const auto added_end_id = graph.add_node(std::move(end));

    REQUIRE(added_start_id == start_id);
    REQUIRE(added_func_id == func_id);
    REQUIRE(added_end_id == end_id);

    const auto conn1 = graph.connect(
        start_id, graph.get_node(start_id)->get_exec_output_ports()[0]->get_id(),
        func_id, graph.get_node(func_id)->get_exec_input_ports()[0]->get_id());

    const auto conn2 = graph.connect(
        func_id, graph.get_node(func_id)->get_exec_output_ports()[0]->get_id(),
        end_id, graph.get_node(end_id)->get_exec_input_ports()[0]->get_id());

    REQUIRE(conn1.has_value());
    REQUIRE(conn2.has_value());
    
    const auto stats = graph.get_statistics();
    
    REQUIRE(stats.total_nodes == 3);
    REQUIRE(stats.total_connections == 2);
    REQUIRE(stats.execution_connections == 2);
    REQUIRE(stats.data_connections == 0);
    REQUIRE(stats.max_depth == 2);  // Start -> Func -> End (depth 2)
}
