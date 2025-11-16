// Copyright (c) 2025 МультиКод Team. MIT License.

#include "visprog/core/NodeFactory.hpp"
#include <format>

namespace visprog::core {

auto NodeFactory::create(NodeType type, std::string name) -> std::unique_ptr<Node> {
    if (name.empty()) {
        name = generate_default_name(type);
    }
    
    const auto id = generate_node_id();
    auto node = std::make_unique<Node>(id, type, std::move(name));
    
    configure_node(*node, type);
    
    return node;
}

auto NodeFactory::create_with_id(NodeId id, NodeType type, std::string name) 
    -> std::unique_ptr<Node> {
    auto node = std::make_unique<Node>(id, type, std::move(name));
    configure_node(*node, type);
    return node;
}

auto NodeFactory::generate_node_id() -> NodeId {
    return NodeId{next_id_.fetch_add(1, std::memory_order_relaxed)};
}

auto NodeFactory::configure_node(Node& node, NodeType type) -> void {
    switch (type) {
        case NodeType::Start:
            node.add_exec_output();
            break;
        
        case NodeType::End:
            node.add_exec_input();
            break;
        
        case NodeType::Function:
            node.add_exec_input();
            node.add_exec_output();
            // Ports will be added dynamically
            break;
        
        case NodeType::PureFunction:
            // No execution ports for pure functions
            break;
        
        case NodeType::Variable:
            node.add_output_port(DataType::Auto, "value");
            break;
        
        case NodeType::GetVariable:
            node.add_output_port(DataType::Auto, "value");
            break;
        
        case NodeType::SetVariable:
            node.add_exec_input();
            node.add_exec_output();
            node.add_input_port(DataType::Auto, "value");
            break;
        
        case NodeType::If:
            node.add_exec_input();
            node.add_input_port(DataType::Bool, "condition");
            node.add_exec_output();  // true branch
            node.add_exec_output();  // false branch
            break;
        
        case NodeType::ForLoop:
            node.add_exec_input();
            node.add_input_port(DataType::Int32, "start");
            node.add_input_port(DataType::Int32, "end");
            node.add_exec_output();  // loop body
            node.add_output_port(DataType::Int32, "index");
            node.add_exec_output();  // completed
            break;
        
        case NodeType::WhileLoop:
            node.add_exec_input();
            node.add_input_port(DataType::Bool, "condition");
            node.add_exec_output();  // loop body
            node.add_exec_output();  // completed
            break;
        
        case NodeType::Print:
            node.add_exec_input();
            node.add_exec_output();
            node.add_input_port(DataType::String, "message");
            break;
        
        // Operators
        case NodeType::Add:
        case NodeType::Subtract:
        case NodeType::Multiply:
        case NodeType::Divide:
        case NodeType::Modulo:
            node.add_input_port(DataType::Auto, "a");
            node.add_input_port(DataType::Auto, "b");
            node.add_output_port(DataType::Auto, "result");
            break;
        
        // Comparison
        case NodeType::Equal:
        case NodeType::NotEqual:
        case NodeType::Less:
        case NodeType::LessEqual:
        case NodeType::Greater:
        case NodeType::GreaterEqual:
            node.add_input_port(DataType::Auto, "a");
            node.add_input_port(DataType::Auto, "b");
            node.add_output_port(DataType::Bool, "result");
            break;
        
        // Logical
        case NodeType::And:
        case NodeType::Or:
            node.add_input_port(DataType::Bool, "a");
            node.add_input_port(DataType::Bool, "b");
            node.add_output_port(DataType::Bool, "result");
            break;
        
        case NodeType::Not:
            node.add_input_port(DataType::Bool, "value");
            node.add_output_port(DataType::Bool, "result");
            break;
        
        default:
            // For other types, ports are added dynamically
            break;
    }
}

auto NodeFactory::generate_default_name(NodeType type) -> std::string {
    return std::format("{}_{}", to_string(type), generate_node_id().value);
}

auto NodeFactory::synchronize_id_counter(NodeId max_id) -> void {
    const auto desired = max_id.value + 1;
    auto current = next_id_.load(std::memory_order_relaxed);

    while (current < desired &&
           !next_id_.compare_exchange_weak(
               current,
               desired,
               std::memory_order_relaxed,
               std::memory_order_relaxed
           )) {
        // retry until we successfully update the counter or discover newer value
    }
}

}  // namespace visprog::core
