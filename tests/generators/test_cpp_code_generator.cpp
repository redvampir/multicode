// Copyright (c) 2025 МультиКод Team. MIT License.

#include <catch2/catch_test_macros.hpp>

#include "visprog/core/Graph.hpp"
#include "visprog/core/NodeFactory.hpp"
#include "visprog/generators/CppCodeGenerator.hpp"

#include <string>
#include <algorithm>

using namespace visprog::core;
using namespace visprog::generators;

// Helper to remove all whitespace for robust comparison
std::string remove_whitespace(std::string str) {
    str.erase(std::remove_if(str.begin(), str.end(), ::isspace), str.end());
    return str;
}

TEST_CASE("CppCodeGenerator: Sequence Node", "[generators]") {
    Graph graph;
    NodeFactory factory;
    CppCodeGenerator generator;

    auto start_id = graph.add_node(factory.create(NodeTypes::Start));
    auto sequence_id = graph.add_node(factory.create(NodeTypes::Sequence));
    auto literal1_id = graph.add_node(factory.create(NodeTypes::StringLiteral));
    auto print1_id = graph.add_node(factory.create(NodeTypes::PrintString));
    auto literal2_id = graph.add_node(factory.create(NodeTypes::StringLiteral));
    auto print2_id = graph.add_node(factory.create(NodeTypes::PrintString));
    auto end_id = graph.add_node(factory.create(NodeTypes::End));

    graph.get_node_mut(literal1_id)->set_property("value", std::string("First"));
    graph.get_node_mut(literal2_id)->set_property("value", std::string("Second"));

    // Execution flow
    graph.connect(start_id, "start", sequence_id, "in_exec");
    graph.connect(sequence_id, "Then 0", print1_id, "in_exec");
    graph.connect(sequence_id, "Then 1", print2_id, "in_exec");
    graph.connect(print1_id, "out_exec", end_id, "end");
    graph.connect(print2_id, "out_exec", end_id, "end"); // An input port can have multiple connections

    // Data flow
    graph.connect(literal1_id, "output", print1_id, "message");
    graph.connect(literal2_id, "output", print2_id, "message");

    auto result = generator.generate(graph);
    REQUIRE(result.has_value());
    const auto code = result.value();

    const std::string var1 = "var_" + std::to_string(literal1_id.value);
    const std::string var2 = "var_" + std::to_string(literal2_id.value);
    const std::string print1_stmt = "std::cout << " + var1 + " << std::endl;";
    const std::string print2_stmt = "std::cout << " + var2 + " << std::endl;";

    auto pos1 = code.find(print1_stmt);
    auto pos2 = code.find(print2_stmt);

    REQUIRE(pos1 != std::string::npos);
    REQUIRE(pos2 != std::string::npos);
    CHECK(pos1 < pos2);
}

TEST_CASE("CppCodeGenerator: Variables with For Loop", "[generators]") {
    Graph graph;
    NodeFactory factory;
    CppCodeGenerator generator;

    // 1. Declare a variable in the graph
    REQUIRE(graph.add_variable("counter", DataType::Int32));

    // 2. Create nodes
    auto start_id = graph.add_node(factory.create(NodeTypes::Start));
    auto for_loop_id = graph.add_node(factory.create(NodeTypes::ForLoop));
    auto get_var_id = graph.add_node(factory.create(NodeTypes::GetVariable));
    auto set_var_id = graph.add_node(factory.create(NodeTypes::SetVariable));
    auto add_id = graph.add_node(factory.create(NodeTypes::Add));
    auto literal_one_id = graph.add_node(factory.create(NodeTypes::IntLiteral));
    auto print_result_id = graph.add_node(factory.create(NodeTypes::PrintString));
    auto get_final_var_id = graph.add_node(factory.create(NodeTypes::GetVariable));
    auto end_id = graph.add_node(factory.create(NodeTypes::End));

    // 3. Configure nodes
    graph.get_node_mut(get_var_id)->set_property("variable_name", std::string("counter"));
    graph.get_node_mut(set_var_id)->set_property("variable_name", std::string("counter"));
    graph.get_node_mut(get_final_var_id)->set_property("variable_name", std::string("counter"));
    graph.get_node_mut(literal_one_id)->set_property("value", 1);
    // Loop from 0 to 10
    auto loop_start_id = graph.add_node(factory.create(NodeTypes::IntLiteral));
    graph.get_node_mut(loop_start_id)->set_property("value", 0);
    auto loop_end_id = graph.add_node(factory.create(NodeTypes::IntLiteral));
    graph.get_node_mut(loop_end_id)->set_property("value", 10);

    // 4. Connect nodes
    // Execution flow
    graph.connect(start_id, "start", for_loop_id, "in_exec");
    graph.connect(for_loop_id, "loop_body", set_var_id, "in_exec");
    graph.connect(for_loop_id, "completed", print_result_id, "in_exec");
    graph.connect(print_result_id, "out_exec", end_id, "end");

    // Data flow for loop limits
    graph.connect(loop_start_id, "output", for_loop_id, "first_index");
    graph.connect(loop_end_id, "output", for_loop_id, "last_index");

    // Data flow for counter increment
    graph.connect(get_var_id, "value", add_id, "a");
    graph.connect(literal_one_id, "output", add_id, "b");
    graph.connect(add_id, "result", set_var_id, "value");

    // Data flow for final print
    graph.connect(get_final_var_id, "value", print_result_id, "message");

    // 5. Generate and verify code
    auto result = generator.generate(graph);
    REQUIRE(result.has_value());
    const auto code = remove_whitespace(result.value());

    CHECK(code.find("intcounter;") != std::string::npos);
    CHECK(code.find("for(inti_" + std::to_string(for_loop_id.value)) != std::string::npos);
    CHECK(code.find("counter=(counter+var_" + std::to_string(literal_one_id.value) + ");") != std::string::npos);
    CHECK(code.find("std::cout<<counter<<std::endl;") != std::string::npos);
}

TEST_CASE("CppCodeGenerator: Data Flow with StringLiteral", "[generators]") {
    Graph graph;
    NodeFactory factory;
    CppCodeGenerator generator;

    auto start_id = graph.add_node(factory.create(NodeTypes::Start));
    auto literal_id = graph.add_node(factory.create(NodeTypes::StringLiteral));
    auto print_id = graph.add_node(factory.create(NodeTypes::PrintString));
    auto end_id = graph.add_node(factory.create(NodeTypes::End));

    graph.get_node_mut(literal_id)->set_property("value", std::string("Data flow works!"));

    graph.connect(start_id, "start", print_id, "in_exec");
    graph.connect(print_id, "out_exec", end_id, "end");
    graph.connect(literal_id, "output", print_id, "message");

    auto result = generator.generate(graph);
    REQUIRE(result.has_value());
    const auto code = result.value();
    
    const std::string expected_decl = "const std::string var_" + std::to_string(literal_id.value) + "=\"Data flow works!\";";
    const std::string expected_usage = "std::cout<<var_" + std::to_string(literal_id.value) + "<<std::endl;";

    CHECK(remove_whitespace(code).find(remove_whitespace(expected_decl)) != std::string::npos);
    CHECK(remove_whitespace(code).find(remove_whitespace(expected_usage)) != std::string::npos);
}

TEST_CASE("CppCodeGenerator: Data-Driven Branching Logic", "[generators]") {
    Graph graph;
    NodeFactory factory;
    CppCodeGenerator generator;

    auto start_id = graph.add_node(factory.create(NodeTypes::Start));
    auto bool_literal_id = graph.add_node(factory.create(NodeTypes::BoolLiteral));
    auto branch_id = graph.add_node(factory.create(NodeTypes::Branch));
    auto true_str_id = graph.add_node(factory.create(NodeTypes::StringLiteral));
    auto false_str_id = graph.add_node(factory.create(NodeTypes::StringLiteral));
    auto true_print_id = graph.add_node(factory.create(NodeTypes::PrintString));
    auto false_print_id = graph.add_node(factory.create(NodeTypes::PrintString));
    auto end_id = graph.add_node(factory.create(NodeTypes::End));

    graph.get_node_mut(bool_literal_id)->set_property("value", true);
    graph.get_node_mut(true_str_id)->set_property("value", std::string("True branch"));
    graph.get_node_mut(false_str_id)->set_property("value", std::string("False branch"));

    graph.connect(start_id, "start", branch_id, "in_exec");
    graph.connect(branch_id, "true_exec", true_print_id, "in_exec");
    graph.connect(branch_id, "false_exec", false_print_id, "in_exec");
    graph.connect(true_print_id, "out_exec", end_id, "end");
    graph.connect(false_print_id, "out_exec", end_id, "end");

    graph.connect(bool_literal_id, "output", branch_id, "condition");
    graph.connect(true_str_id, "output", true_print_id, "message");
    graph.connect(false_str_id, "output", false_print_id, "message");

    auto result = generator.generate(graph);
    REQUIRE(result.has_value());
    const auto code = result.value();

    const std::string bool_var = "var_" + std::to_string(bool_literal_id.value);
    const std::string true_str_var = "var_" + std::to_string(true_str_id.value);

    const std::string expected_bool_decl = "constbool" + bool_var + "=true;";
    const std::string expected_if = "if(" + bool_var + ")";
    const std::string expected_true_print = "std::cout<<" + true_str_var + "<<std::endl;";
    
    CHECK(remove_whitespace(code).find(expected_bool_decl) != std::string::npos);
    CHECK(remove_whitespace(code).find(expected_if) != std::string::npos);
    CHECK(remove_whitespace(code).find(expected_true_print) != std::string::npos);
}

TEST_CASE("CppCodeGenerator: Arithmetic with Add Node", "[generators]") {
    Graph graph;
    NodeFactory factory;
    CppCodeGenerator generator;

    auto start_id = graph.add_node(factory.create(NodeTypes::Start));
    auto literal_a_id = graph.add_node(factory.create(NodeTypes::IntLiteral));
    auto literal_b_id = graph.add_node(factory.create(NodeTypes::IntLiteral));
    auto add_id = graph.add_node(factory.create(NodeTypes::Add));
    auto print_id = graph.add_node(factory.create(NodeTypes::PrintString));
    auto end_id = graph.add_node(factory.create(NodeTypes::End));

    graph.get_node_mut(literal_a_id)->set_property("value", 40);
    graph.get_node_mut(literal_b_id)->set_property("value", 2);

    graph.connect(start_id, "start", print_id, "in_exec");
    graph.connect(print_id, "out_exec", end_id, "end");

    graph.connect(literal_a_id, "output", add_id, "a");
    graph.connect(literal_b_id, "output", add_id, "b");
    graph.connect(add_id, "result", print_id, "message");

    auto result = generator.generate(graph);
    REQUIRE(result.has_value());
    const auto code = result.value();

    const std::string var_a = "var_" + std::to_string(literal_a_id.value);
    const std::string var_b = "var_" + std::to_string(literal_b_id.value);
    const std::string expected_a_decl = "constint" + var_a + "=40;";
    const std::string expected_b_decl = "constint" + var_b + "=2;";
    const std::string expected_print = "std::cout<<((" + var_a + "+" + var_b + "))<<std::endl;";

    CHECK(remove_whitespace(code).find(expected_a_decl) != std::string::npos);
    CHECK(remove_whitespace(code).find(expected_b_decl) != std::string::npos);
    CHECK(remove_whitespace(code).find(expected_print) != std::string::npos);
}

TEST_CASE("CppCodeGenerator: For Loop", "[generators]") {
    Graph graph;
    NodeFactory factory;
    CppCodeGenerator generator;

    auto start_id = graph.add_node(factory.create(NodeTypes::Start));
    auto first_idx_id = graph.add_node(factory.create(NodeTypes::IntLiteral));
    auto last_idx_id = graph.add_node(factory.create(NodeTypes::IntLiteral));
    auto for_loop_id = graph.add_node(factory.create(NodeTypes::ForLoop));
    auto print_index_id = graph.add_node(factory.create(NodeTypes::PrintString));
    auto print_completed_id = graph.add_node(factory.create(NodeTypes::StringLiteral));
    auto print_completed_node_id = graph.add_node(factory.create(NodeTypes::PrintString));
    auto end_id = graph.add_node(factory.create(NodeTypes::End));

    graph.get_node_mut(first_idx_id)->set_property("value", 0);
    graph.get_node_mut(last_idx_id)->set_property("value", 5);
    graph.get_node_mut(print_completed_id)->set_property("value", std::string("Completed"));

    // Execution Flow
    graph.connect(start_id, "start", for_loop_id, "in_exec");
    graph.connect(for_loop_id, "loop_body", print_index_id, "in_exec");
    graph.connect(for_loop_id, "completed", print_completed_node_id, "in_exec");
    graph.connect(print_completed_node_id, "out_exec", end_id, "end");

    // Data Flow
    graph.connect(first_idx_id, "output", for_loop_id, "first_index");
    graph.connect(last_idx_id, "output", for_loop_id, "last_index");
    graph.connect(for_loop_id, "index", print_index_id, "message");
    graph.connect(print_completed_id, "output", print_completed_node_id, "message");

    auto result = generator.generate(graph);
    REQUIRE(result.has_value());
    const auto code = result.value();

    std::string loop_var = "i_" + std::to_string(for_loop_id.value);
    std::string first_idx_var = "var_" + std::to_string(first_idx_id.value);
    std::string last_idx_var = "var_" + std::to_string(last_idx_id.value);

    const std::string expected_for = "for(int" + loop_var + "=" + first_idx_var + ";" + loop_var + "<" + last_idx_var + ";++" + loop_var + "){";
    const std::string expected_loop_print = "std::cout<<" + loop_var + "<<std::endl;";
    const std::string expected_completed_print = "std::cout<<var_" + std::to_string(print_completed_id.value) + "<<std::endl;";

    CHECK(remove_whitespace(code).find(expected_for) != std::string::npos);
    CHECK(remove_whitespace(code).find(expected_loop_print) != std::string::npos);
    CHECK(remove_whitespace(code).find(expected_completed_print) != std::string::npos);
}

TEST_CASE("CppCodeGenerator: No Start Node", "[generators]") {
    Graph graph;
    NodeFactory factory;
    CppCodeGenerator generator;

    graph.add_node(factory.create(NodeTypes::PrintString));

    auto result = generator.generate(graph);

    REQUIRE(result.has_error());
    CHECK(result.error().message == "Graph must have a Start node.");
}
