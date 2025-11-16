// Copyright (c) 2025 МультиКод Team. MIT License.

#include "visprog/core/Node.hpp"
#include <algorithm>
#include <ranges>

namespace visprog::core {

// ============================================================================
// Construction
// ============================================================================

Node::Node(NodeId id, NodeType type, std::string name)
    : id_(id)
    , type_(type)
    , name_(std::move(name))
    , display_name_()
    , description_()
    , ports_()
    , metadata_()
    , has_execution_flow_(false) {
}

// ============================================================================
// Port Queries
// ============================================================================

auto Node::get_input_ports() const -> std::vector<const Port*> {
    std::vector<const Port*> result;
    result.reserve(ports_.size() / 2);  // Typical case: half inputs
    
    for (const auto& port : ports_) {
        if (port.is_input()) {
            result.push_back(&port);
        }
    }
    
    return result;
}

auto Node::get_output_ports() const -> std::vector<const Port*> {
    std::vector<const Port*> result;
    result.reserve(ports_.size() / 2);  // Typical case: half outputs
    
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
    auto it = std::ranges::find_if(ports_, [id](const Port& port) {
        return port.get_id() == id;
    });
    
    return it != ports_.end() ? &(*it) : nullptr;
}

// ============================================================================
// Port Management
// ============================================================================

auto Node::add_input_port(DataType data_type, std::string name) -> PortId {
    const auto port_id = generate_port_id();
    
    ports_.emplace_back(
        port_id,
        PortDirection::Input,
        data_type,
        std::move(name)
    );
    
    return port_id;
}

auto Node::add_output_port(DataType data_type, std::string name) -> PortId {
    const auto port_id = generate_port_id();
    
    ports_.emplace_back(
        port_id,
        PortDirection::Output,
        data_type,
        std::move(name)
    );
    
    return port_id;
}

auto Node::add_exec_input() -> PortId {
    const auto port_id = generate_port_id();
    
    ports_.emplace_back(
        port_id,
        PortDirection::Input,
        DataType::Execution,
        "exec_in"
    );
    
    has_execution_flow_ = true;
    
    return port_id;
}

auto Node::add_exec_output() -> PortId {
    const auto port_id = generate_port_id();
    
    ports_.emplace_back(
        port_id,
        PortDirection::Output,
        DataType::Execution,
        "exec_out"
    );
    
    has_execution_flow_ = true;
    
    return port_id;
}

auto Node::remove_port(PortId id) -> Result<void> {
    auto it = std::ranges::find_if(ports_, [id](const Port& port) {
        return port.get_id() == id;
    });
    
    if (it == ports_.end()) {
        return Result<void>(Error{
            .message = "Port not found",
            .code = 1
        });
    }
    
    ports_.erase(it);
    
    // Update execution flow flag
    update_execution_flow_flag();
    
    return Result<void>();
}

// ============================================================================
// Metadata
// ============================================================================

auto Node::set_metadata(std::string key, std::string value) -> void {
    metadata_[std::move(key)] = std::move(value);
}

auto Node::get_metadata(std::string_view key) const -> std::optional<std::string_view> {
    if (auto it = metadata_.find(std::string(key)); it != metadata_.end()) {
        return it->second;
    }
    return std::nullopt;
}

// ============================================================================
// Validation
// ============================================================================

auto Node::validate() const -> Result<void> {
    // Check: Name not empty
    if (name_.empty()) {
        return Result<void>(Error{
            .message = "Node name cannot be empty",
            .code = 100
        });
    }
    
    // Check: Execution nodes must have exec ports
    if (has_execution_flow_) {
        const auto exec_inputs = get_exec_input_ports();
        const auto exec_outputs = get_exec_output_ports();
        
        if (exec_inputs.empty() && exec_outputs.empty()) {
            return Result<void>(Error{
                .message = "Node marked as having execution flow but has no exec ports",
                .code = 101
            });
        }
    }
    
    // Check: Port IDs are unique
    std::vector<PortId> port_ids;
    port_ids.reserve(ports_.size());
    
    for (const auto& port : ports_) {
        port_ids.push_back(port.get_id());
    }
    
    std::ranges::sort(port_ids, [](PortId a, PortId b) { 
        return a.value < b.value; 
    });
    
    auto [first, last] = std::ranges::unique(port_ids);
    if (first != last) {
        return Result<void>(Error{
            .message = "Duplicate port IDs found",
            .code = 102
        });
    }
    
    // Check: Type-specific validation
    switch (type_) {
        case NodeType::Start:
            // Start node should have only exec output
            if (get_exec_input_ports().size() > 0) {
                return Result<void>(Error{
                    .message = "Start node should not have execution inputs",
                    .code = 103
                });
            }
            if (get_exec_output_ports().empty()) {
                return Result<void>(Error{
                    .message = "Start node must have at least one execution output",
                    .code = 104
                });
            }
            break;
        
        case NodeType::End:
            // End node should have only exec input
            if (get_exec_output_ports().size() > 0) {
                return Result<void>(Error{
                    .message = "End node should not have execution outputs",
                    .code = 105
                });
            }
            if (get_exec_input_ports().empty()) {
                return Result<void>(Error{
                    .message = "End node must have at least one execution input",
                    .code = 106
                });
            }
            break;
        
        case NodeType::PureFunction:
            // Pure functions don't have execution ports
            if (has_execution_flow_) {
                return Result<void>(Error{
                    .message = "Pure function nodes cannot have execution flow",
                    .code = 107
                });
            }
            break;
        
        default:
            // Other types are valid
            break;
    }
    
    // All checks passed
    return Result<void>();
}

// ============================================================================
// Helper Methods
// ============================================================================

auto Node::generate_port_id() -> PortId {
    return Port::generate_unique_id();
}

auto Node::update_execution_flow_flag() -> void {
    has_execution_flow_ = std::ranges::any_of(ports_, [](const Port& port) {
        return port.is_execution();
    });
}

auto Node::append_port(Port port) -> void {
    if (port.is_execution()) {
        has_execution_flow_ = true;
    }

    ports_.push_back(std::move(port));
}

}  // namespace visprog::core
