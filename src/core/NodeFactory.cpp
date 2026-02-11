// Copyright (c) 2025 МультиКод Team. MIT License.

#include "visprog/core/NodeFactory.hpp"

#include <string>

namespace visprog::core {

auto NodeFactory::create(const NodeType& type, std::string instance_name) -> std::unique_ptr<Node> {
    const auto node_id = generate_node_id();
    if (instance_name.empty()) {
        instance_name = std::string(type.label) + " #" + std::to_string(node_id.value);
    }
    return create_with_id(node_id, type, std::move(instance_name));
}

// clang-format off
auto NodeFactory::create_with_id(NodeId node_id, const NodeType& type, std::string instance_name)
    -> std::unique_ptr<Node> {
    auto node = std::make_unique<Node>(node_id, type, std::move(instance_name));
    configure_ports(*node);
    return node;
}
// clang-format on

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
        node.set_property("value", std::string("Hello, World!"));
    } else if (type.name == NodeTypes::Branch.name) {
        node.add_input_port(DataType::Execution, "in_exec", generate_port_id());
        node.add_input_port(DataType::Bool, "condition", generate_port_id());
        node.add_output_port(DataType::Execution, "true_exec", generate_port_id());
        node.add_output_port(DataType::Execution, "false_exec", generate_port_id());
    } else if (type.name == NodeTypes::Sequence.name) {
        node.add_input_port(DataType::Execution, "in_exec", generate_port_id());
        node.add_output_port(DataType::Execution, "Then 0", generate_port_id());
        node.add_output_port(DataType::Execution, "Then 1", generate_port_id());
    } else if (type.name == NodeTypes::ForLoop.name) {
        node.add_input_port(DataType::Execution, "in_exec", generate_port_id());
        node.add_input_port(DataType::Int32, "first_index", generate_port_id());
        node.add_input_port(DataType::Int32, "last_index", generate_port_id());
        node.add_output_port(DataType::Execution, "loop_body", generate_port_id());
        node.add_output_port(DataType::Int32, "index", generate_port_id());
        node.add_output_port(DataType::Execution, "completed", generate_port_id());
    } else if (type.name == NodeTypes::StringLiteral.name) {
        node.add_output_port(DataType::String, "output", generate_port_id());
        node.set_property("value", std::string("default string"));
    } else if (type.name == NodeTypes::BoolLiteral.name) {
        node.add_output_port(DataType::Bool, "output", generate_port_id());
        node.set_property("value", false);
    } else if (type.name == NodeTypes::IntLiteral.name) {
        node.add_output_port(DataType::Int32, "output", generate_port_id());
        node.set_property("value", 0);
    } else if (type.name == NodeTypes::Add.name) {
        node.add_input_port(DataType::Int32, "a", generate_port_id());
        node.add_input_port(DataType::Int32, "b", generate_port_id());
        node.add_output_port(DataType::Int32, "result", generate_port_id());
    } else if (type.name == NodeTypes::GetVariable.name) {
        node.set_property("variable_name", std::string(""));
        node.add_output_port(DataType::Any, "value", generate_port_id());
    } else if (type.name == NodeTypes::SetVariable.name) {
        node.set_property("variable_name", std::string(""));
        node.add_input_port(DataType::Execution, "in_exec", generate_port_id());
        node.add_input_port(DataType::Any, "value", generate_port_id());
        node.add_output_port(DataType::Execution, "out_exec", generate_port_id());
    }
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

void NodeFactory::force_id_counters(NodeId next_node_id, PortId next_port_id) {
    next_node_id_.store(next_node_id.value, std::memory_order_relaxed);
    next_port_id_.store(next_port_id.value, std::memory_order_relaxed);
}

}  // namespace visprog::core
