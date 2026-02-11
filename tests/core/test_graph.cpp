// Copyright (c) 2025 МультиКод Team. MIT License.

#include <algorithm>
#include <catch2/catch_all.hpp>

#define private public
#include "visprog/core/ErrorCodes.hpp"
#include "visprog/core/Graph.hpp"
#undef private

#include "visprog/core/NodeFactory.hpp"

using namespace visprog::core;

namespace {

[[nodiscard]] auto first_exec_in(const Node& node) -> PortId {
    return node.get_exec_input_ports().front()->get_id();
}

[[nodiscard]] auto first_exec_out(const Node& node) -> PortId {
    return node.get_exec_output_ports().front()->get_id();
}

[[nodiscard]] auto first_data_out(const Node& node) -> PortId {
    const auto outputs = node.get_output_ports();
    const auto it =
        std::ranges::find_if(outputs, [](const Port* port) { return !port->is_execution(); });
    REQUIRE(it != outputs.end());
    return (*it)->get_id();
}

[[nodiscard]] auto first_data_in(const Node& node) -> PortId {
    const auto inputs = node.get_input_ports();
    const auto it =
        std::ranges::find_if(inputs, [](const Port* port) { return !port->is_execution(); });
    REQUIRE(it != inputs.end());
    return (*it)->get_id();
}

}  // namespace

TEST_CASE("Graph: remove_node удаляет все входящие и исходящие связи", "[graph][remove_node]") {
    Graph graph("test-remove-node-connections");

    auto start = NodeFactory::create(NodeTypes::Start);
    auto print = NodeFactory::create(NodeTypes::PrintString);
    auto literal = NodeFactory::create(NodeTypes::StringLiteral);
    auto end = NodeFactory::create(NodeTypes::End);

    const auto start_id = graph.add_node(std::move(start));
    const auto print_id = graph.add_node(std::move(print));
    const auto literal_id = graph.add_node(std::move(literal));
    const auto end_id = graph.add_node(std::move(end));

    const auto start_to_print = graph.connect(start_id,
                                              first_exec_out(*graph.get_node(start_id)),
                                              print_id,
                                              first_exec_in(*graph.get_node(print_id)));
    const auto literal_to_print = graph.connect(literal_id,
                                                first_data_out(*graph.get_node(literal_id)),
                                                print_id,
                                                first_data_in(*graph.get_node(print_id)));
    const auto print_to_end = graph.connect(print_id,
                                            first_exec_out(*graph.get_node(print_id)),
                                            end_id,
                                            first_exec_in(*graph.get_node(end_id)));

    REQUIRE(start_to_print.has_value());
    REQUIRE(literal_to_print.has_value());
    REQUIRE(print_to_end.has_value());
    REQUIRE(graph.connection_count() == 3);

    const auto remove_result = graph.remove_node(print_id);
    REQUIRE(remove_result.has_value());

    REQUIRE(graph.get_node(print_id) == nullptr);
    REQUIRE(graph.connection_count() == 0);

    REQUIRE_FALSE(graph.has_connection(start_to_print.value()));
    REQUIRE_FALSE(graph.has_connection(literal_to_print.value()));
    REQUIRE_FALSE(graph.has_connection(print_to_end.value()));

    REQUIRE(graph.get_connections_from(start_id).empty());
    REQUIRE(graph.get_connections_from(literal_id).empty());
    REQUIRE(graph.get_connections_to(end_id).empty());
}

TEST_CASE("Graph: adjacency остаётся консистентной после удаления узла", "[graph][adjacency]") {
    Graph graph("test-adjacency-after-remove");

    auto start = NodeFactory::create(NodeTypes::Start);
    auto first = NodeFactory::create(NodeTypes::PrintString);
    auto second = NodeFactory::create(NodeTypes::PrintString);
    auto end = NodeFactory::create(NodeTypes::End);

    const auto start_id = graph.add_node(std::move(start));
    const auto first_id = graph.add_node(std::move(first));
    const auto second_id = graph.add_node(std::move(second));
    const auto end_id = graph.add_node(std::move(end));

    const auto c1 = graph.connect(start_id,
                                  first_exec_out(*graph.get_node(start_id)),
                                  first_id,
                                  first_exec_in(*graph.get_node(first_id)));
    const auto c2 = graph.connect(first_id,
                                  first_exec_out(*graph.get_node(first_id)),
                                  second_id,
                                  first_exec_in(*graph.get_node(second_id)));
    const auto c3 = graph.connect(second_id,
                                  first_exec_out(*graph.get_node(second_id)),
                                  end_id,
                                  first_exec_in(*graph.get_node(end_id)));

    REQUIRE(c1.has_value());
    REQUIRE(c2.has_value());
    REQUIRE(c3.has_value());

    REQUIRE(graph.remove_node(first_id).has_value());

    REQUIRE(graph.connection_count() == 1);
    REQUIRE(graph.has_connection(c3.value()));
    REQUIRE_FALSE(graph.has_connection(c1.value()));
    REQUIRE_FALSE(graph.has_connection(c2.value()));

    REQUIRE(graph.get_connections_from(start_id).empty());
    REQUIRE(graph.get_connections_to(second_id).empty());
    REQUIRE(graph.get_connections_from(second_id) == std::vector<ConnectionId>{c3.value()});
    REQUIRE(graph.get_connections_to(end_id) == std::vector<ConnectionId>{c3.value()});

    const auto validation = graph.validate();
    REQUIRE(validation.is_valid);
}

TEST_CASE("Graph: validate ловит повреждённые связи и индексы", "[graph][validate]") {
    Graph graph("test-graph-validate-negative");

    auto int_literal = NodeFactory::create(NodeTypes::IntLiteral);
    auto set_var = NodeFactory::create(NodeTypes::SetVariable);
    auto end = NodeFactory::create(NodeTypes::End);

    const auto int_id = graph.add_node(std::move(int_literal));
    const auto set_id = graph.add_node(std::move(set_var));
    const auto end_id = graph.add_node(std::move(end));

    const auto int_to_value = graph.connect(int_id,
                                            first_data_out(*graph.get_node(int_id)),
                                            set_id,
                                            first_data_in(*graph.get_node(set_id)));
    const auto set_to_end = graph.connect(set_id,
                                          first_exec_out(*graph.get_node(set_id)),
                                          end_id,
                                          first_exec_in(*graph.get_node(end_id)));

    REQUIRE(int_to_value.has_value());
    REQUIRE(set_to_end.has_value());

    SECTION("битая ссылка connection -> node") {
        graph.connections_[0].to_node = NodeId{999999};

        const auto result = graph.validate();
        REQUIRE_FALSE(result.is_valid);
        REQUIRE(std::ranges::any_of(result.errors, [](const Error& error) {
            return error.code == error_codes::graph_validation::BrokenNodeReference;
        }));
    }

    SECTION("несоответствие типов портов") {
        graph.connections_[0].to_port = first_exec_in(*graph.get_node(set_id));

        const auto result = graph.validate();
        REQUIRE_FALSE(result.is_valid);
        REQUIRE(std::ranges::any_of(result.errors, [](const Error& error) {
            return error.code == error_codes::graph_validation::TypeMismatch;
        }));
    }

    SECTION("несогласованность lookup-индекса") {
        graph.connection_lookup_[int_to_value.value()] = 999U;

        const auto result = graph.validate();
        REQUIRE_FALSE(result.is_valid);
        REQUIRE(std::ranges::any_of(result.errors, [](const Error& error) {
            return error.code == error_codes::graph_validation::LookupMismatch;
        }));
    }
}
