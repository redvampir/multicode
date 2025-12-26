// Copyright (c) 2025 МультиКод Team. MIT License.

#include "visprog/core/NodeFactory.hpp"

#include <format>

namespace visprog::core {

auto NodeFactory::create(const NodeType& type, std::string instance_name) -> std::unique_ptr<Node> {
    const auto node_id = generate_node_id();
    if (instance_name.empty()) {
        instance_name = std::format("{} #{}", type.label, node_id.value);
    }
    return create_with_id(node_id, type, std::move(instance_name));
}

auto NodeFactory::create_with_id(NodeId node_id, const NodeType& type, std::string instance_name)
    -> std::unique_ptr<Node> {
    auto node = std::make_unique<Node>(node_id, type, std::move(instance_name));
    configure_ports(*node);
    return node;
}

void NodeFactory::configure_ports(Node& node) {
    const auto type = node.get_type();

    if (type.name == NodeTypes::Start.name) {
        node.add_output_port(DataType::Execution, "start", generate_port_id());
    } else if (type.name == NodeTypes::End.name) {
        node.add_input_port(DataType::Execution, "end", generate_port_id());
    } else if (type.name == NodeTypes::PrintString.name) {
        node.add_input_port(DataType::Execution, "in_exec", generate_port_id());
        node.add_output_port(DataType::Execution, "out_exec", generate_port_id());
        node.add_input_port(DataType::StringView, "value", generate_port_id());
        // Set a default value for the string to be printed
        node.set_property("value", std::string("Hello, World!"));
    }
    // Here we will add more `else if` statements for other core nodes.
    // In the future, this will be replaced by a system that reads .nodedef.json files.
}

auto NodeFactory::generate_node_id() -> NodeId {
    return NodeId{next_node_id_.fetch_add(1, std::memory_order_relaxed)};
}

auto NodeFactory::generate_port_id() -> PortId {
    return PortId{next_port_id_.fetch_add(1, std::memory_order_relaxed)};
}

void NodeFactory::synchronize_id_counters(NodeId max_node_id, PortId max_port_id) {
    auto sync_atomic = [](std::atomic<uint64_t>& atomic, uint64_t new_value) {
        auto current = atomic.load(std::memory_order_relaxed);
        while (current < new_value &&
               !atomic.compare_exchange_weak(
                   current, new_value, std::memory_order_relaxed, std::memory_order_relaxed)) {}
    };
    sync_atomic(next_node_id_, max_node_id.value + 1);
    sync_atomic(next_port_id_, max_port_id.value + 1);
}

}  // namespace visprog::core
