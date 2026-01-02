// Copyright (c) 2025 МультиКод Team. MIT License.

#include <catch2/catch_test_macros.hpp>
#include "visprog/core/Graph.hpp"
#include "visprog/core/NodeFactory.hpp"
#include "visprog/generators/CppCodeGenerator.hpp"

#include <string>

using namespace visprog::core;
using namespace visprog::generators;

TEST_CASE("CppCodeGenerator: Linear Execution", "[generators]") {
    Graph graph;
    NodeFactory factory;
    CppCodeGenerator generator;

    // 1. Create nodes
    auto start_node = factory.create(NodeTypes::Start);
    auto print_node = factory.create(NodeTypes::PrintString);
    auto end_node = factory.create(NodeTypes::End);

    // Set a custom message on the print node
    print_node->set_property("value", std::string("Hello from a generated graph!"));

    const auto* start_node_ptr = graph.add_node(std::move(start_node));
    const auto* print_node_ptr = graph.add_node(std::move(print_node));
    const auto* end_node_ptr = graph.add_node(std::move(end_node));

    // 2. Connect nodes in a linear sequence
    graph.add_connection(
        start_node_ptr->find_first_port_by_type(DataType::Execution, PortDirection::Output)->id,
        print_node_ptr->find_first_port_by_type(DataType::Execution, PortDirection::Input)->id);
    graph.add_connection(
        print_node_ptr->find_first_port_by_type(DataType::Execution, PortDirection::Output)->id,
        end_node_ptr->find_first_port_by_type(DataType::Execution, PortDirection::Input)->id);

    // 3. Generate C++ code
    auto result = generator.generate(graph);

    // 4. Verify the result
    REQUIRE(result.has_value());
    const auto code = result.value();

    // Check for key C++ elements
    CHECK(code.find("#include <iostream>") != std::string::npos);
    CHECK(code.find("int main()") != std::string::npos);
    CHECK(code.find("std::cout << \"Hello from a generated graph!\" << std::endl;") !=
          std::string::npos);
    CHECK(code.find("return 0;") != std::string::npos);
}

TEST_CASE("CppCodeGenerator: No Start Node", "[generators]") {
    Graph graph;
    NodeFactory factory;
    CppCodeGenerator generator;

    // Create a graph without a Start node
    auto print_node = factory.create(NodeTypes::PrintString);
    graph.add_node(std::move(print_node));

    auto result = generator.generate(graph);

    // Verify that an error is returned
    REQUIRE(result.has_error());
    CHECK(result.error().message == "Graph must have a Start node.");
}
