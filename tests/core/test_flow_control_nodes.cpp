#include <catch2/catch_test_macros.hpp>
#include "visprog/core/NodeFactory.hpp"
#include "visprog/core/Graph.hpp"

using namespace visprog::core;

TEST_CASE("Flow Control Nodes", "[core][flow]") {
    NodeFactory factory;
    Graph graph;

    SECTION("Create Branch node") {
        auto node = factory.create(NodeTypes::Branch);
        REQUIRE(node != nullptr);

        // Verify ports
        REQUIRE(node->get_input_port("in_exec"));
        REQUIRE(node->get_input_port("condition"));
        REQUIRE(node->get_output_port("true_exec"));
        REQUIRE(node->get_output_port("false_exec"));

        auto condition_port = node->get_input_port("condition");
        REQUIRE(condition_port->get_data_type() == DataType::Bool);
    }

    SECTION("Create Sequence node") {
        auto node = factory.create(NodeTypes::Sequence);
        REQUIRE(node != nullptr);

        // Verify ports
        REQUIRE(node->get_input_port("in_exec"));
        REQUIRE(node->get_output_port("Then 0"));
        REQUIRE(node->get_output_port("Then 1"));
    }
}
