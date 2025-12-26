// Copyright (c) 2025 МультиКод Team. MIT License.

#include "visprog/core/Node.hpp"

#include <algorithm>
#include <ranges>

namespace visprog::core {

// ============================================================================
// Construction
// ============================================================================

Node::Node(NodeId id, NodeType type, std::string instance_name)
    : id_(id),
      type_(type),
      instance_name_(std::move(instance_name)),
      display_name_(),
      description_(),
      ports_(),
      properties_(),
      has_execution_flow_(false) {}

// ============================================================================
// Port Queries
// ============================================================================

auto Node::get_input_ports() const -> std::vector<const Port*> {
    std::vector<const Port*> result;
    for (const auto& port : ports_) {
        if (port.is_input()) {
            result.push_back(&port);
        }
    }
    return result;
}

auto Node::get_output_ports() const -> std::vector<const Port*> {
    std::vector<const Port*> result;
    for (const auto& port : ports_) {
        if (port.is_output()) {
            result.push_back(&port);
        }
    }
    return result;
}

auto Node::get_exec_input_ports() const -> std::vector<const Port*> {
    std::vector<const Port*> result;
    for (const auto& port : ports_) {
        if (port.is_input() && port.is_execution()) {
            result.push_back(&port);
        }
    }
    return result;
}

auto Node::get_exec_output_ports() const -> std::vector<const Port*> {
    std::vector<const Port*> result;
    for (const auto& port : ports_) {
        if (port.is_output() && port.is_execution()) {
            result.push_back(&port);
        }
    }
    return result;
}

auto Node::find_port(PortId id) const -> const Port* {
    auto it = std::ranges::find_if(ports_, [id](const Port& port) { return port.get_id() == id; });
    return it != ports_.end() ? &(*it) : nullptr;
}

// ============================================================================
// Port Management
// ============================================================================

auto Node::add_input_port(DataType data_type, std::string name, PortId id) -> Port& {
    ports_.emplace_back(id, PortDirection::Input, data_type, std::move(name));
    update_execution_flow_flag();
    return ports_.back();
}

auto Node::add_output_port(DataType data_type, std::string name, PortId id) -> Port& {
    ports_.emplace_back(id, PortDirection::Output, data_type, std::move(name));
    update_execution_flow_flag();
    return ports_.back();
}

auto Node::remove_port(PortId id) -> Result<void> {
    auto it = std::ranges::find_if(ports_, [id](const Port& port) { return port.get_id() == id; });
    if (it == ports_.end()) {
        return Result<void>(Error{.message = "Port not found", .code = 1});
    }
    ports_.erase(it);
    update_execution_flow_flag();
    return Result<void>();
}

// ============================================================================
// Validation
// ============================================================================

auto Node::validate() const -> Result<void> {
    if (instance_name_.empty() && type_.name != NodeTypes::Start.name &&
        type_.name != NodeTypes::End.name) {
        return Result<void>(
            Error{.message = "Node instance name cannot be empty for most nodes", .code = 100});
    }

    if (type_.name == NodeTypes::Start.name) {
        if (!get_exec_input_ports().empty()) {
            return Result<void>(
                Error{.message = "Start node should not have execution inputs", .code = 103});
        }
        if (get_exec_output_ports().empty()) {
            return Result<void>(Error{
                .message = "Start node must have at least one execution output", .code = 104});
        }
    } else if (type_.name == NodeTypes::End.name) {
        if (!get_exec_output_ports().empty()) {
            return Result<void>(
                Error{.message = "End node should not have execution outputs", .code = 105});
        }
        if (get_exec_input_ports().empty()) {
            return Result<void>(
                Error{.message = "End node must have at least one execution input", .code = 106});
        }
    }
    // Further validation can be added for custom nodes based on their definitions.

    return Result<void>();
}

// ============================================================================
// Helper Methods (private)
// ============================================================================

void Node::append_port(Port port) {
    if (port.is_execution()) {
        has_execution_flow_ = true;
    }
    ports_.push_back(std::move(port));
}

void Node::update_execution_flow_flag() {
    has_execution_flow_ =
        std::ranges::any_of(ports_, [](const Port& port) { return port.is_execution(); });
}

}  // namespace visprog::core
