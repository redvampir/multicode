#include <catch2/catch_test_macros.hpp>

#include <optional>
#include <string_view>

#include "visprog/core/Graph.hpp"
#include "visprog/core/NodeFactory.hpp"

using namespace visprog::core;

namespace {

auto find_port(const Node& node, std::string_view name, PortDirection direction) -> const Port* {
    const auto ports = direction == PortDirection::Input ? node.get_input_ports() : node.get_output_ports();
    for (const auto* port : ports) {
        if (port->get_name() == name) {
            return port;
        }
    }
    return nullptr;
}

}  // namespace

TEST_CASE("Flow Control Nodes", "[core][flow][legacy]") {
    NodeFactory factory;

    SECTION("Create Branch node") {
        auto node = factory.create(NodeTypes::Branch);
        REQUIRE(node != nullptr);

        const auto* in_exec = find_port(*node, "in_exec", PortDirection::Input);
        const auto* condition = find_port(*node, "condition", PortDirection::Input);
        const auto* true_exec = find_port(*node, "true_exec", PortDirection::Output);
        const auto* false_exec = find_port(*node, "false_exec", PortDirection::Output);

        REQUIRE(in_exec != nullptr);
        REQUIRE(condition != nullptr);
        REQUIRE(true_exec != nullptr);
        REQUIRE(false_exec != nullptr);
        REQUIRE(condition->get_data_type() == DataType::Bool);
    }

    SECTION("Create Sequence node") {
        auto node = factory.create(NodeTypes::Sequence);
        REQUIRE(node != nullptr);

        const auto* in_exec = find_port(*node, "in_exec", PortDirection::Input);
        const auto* then_0 = find_port(*node, "Then 0", PortDirection::Output);
        const auto* then_1 = find_port(*node, "Then 1", PortDirection::Output);

        REQUIRE(in_exec != nullptr);
        REQUIRE(then_0 != nullptr);
        REQUIRE(then_1 != nullptr);
    }
}
