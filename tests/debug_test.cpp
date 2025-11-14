// Temporary debug test
#include <iostream>

#include "visprog/core/Graph.hpp"
#include "visprog/core/NodeFactory.hpp"

using namespace visprog::core;

int main() {
    Graph graph("test");

    auto start = NodeFactory::create(NodeType::Start);

    std::cout << "Start node created\n";
    std::cout << "Exec outputs: " << start->get_exec_output_ports().size() << "\n";
    std::cout << "Exec inputs: " << start->get_exec_input_ports().size() << "\n";

    if (!start->get_exec_output_ports().empty()) {
        const auto port_id = start->get_exec_output_ports()[0]->get_id();
        std::cout << "Port ID: " << port_id.value << "\n";
    }

    const auto start_id = start->get_id();
    std::cout << "Node ID: " << start_id.value << "\n";

    // Test connection before adding to graph
    auto func = NodeFactory::create(NodeType::Function);
    std::cout << "\nFunction node created\n";
    std::cout << "Exec outputs: " << func->get_exec_output_ports().size() << "\n";
    std::cout << "Exec inputs: " << func->get_exec_input_ports().size() << "\n";

    const auto func_id = func->get_id();
    const auto start_out = start->get_exec_output_ports()[0]->get_id();
    const auto func_in = func->get_exec_input_ports()[0]->get_id();

    [[maybe_unused]] auto add1 = graph.add_node(std::move(start));
    [[maybe_unused]] auto add2 = graph.add_node(std::move(func));

    std::cout << "\nNodes added to graph\n";

    // Test port compatibility directly
    const auto* start_ptr = graph.get_node(start_id);
    const auto* func_ptr = graph.get_node(func_id);

    const auto* start_port = start_ptr->find_port(start_out);
    const auto* func_port = func_ptr->find_port(func_in);

    std::cout << "Start port: id=" << start_port->get_id().value
              << ", name=" << start_port->get_name()
              << ", is_execution=" << start_port->is_execution()
              << ", is_output=" << start_port->is_output()
              << ", is_input=" << start_port->is_input() << "\n";

    std::cout << "Func port: id=" << func_port->get_id().value << ", name=" << func_port->get_name()
              << ", is_execution=" << func_port->is_execution()
              << ", is_output=" << func_port->is_output() << ", is_input=" << func_port->is_input()
              << "\n";

    std::cout << "can_connect_to result: " << start_port->can_connect_to(*func_port) << "\n";

    std::cout << "Trying to connect...\n";

    auto result = graph.connect(start_id, start_out, func_id, func_in);

    if (result.has_value()) {
        std::cout << "✅ Connection successful! ID: " << result.value().value << "\n";
    } else {
        std::cout << "❌ Connection failed!\n";
        std::cout << "Error: " << result.error().message << "\n";
        std::cout << "Code: " << result.error().code << "\n";
    }

    return 0;
}
