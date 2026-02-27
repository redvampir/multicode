// Copyright (c) 2025 МультиКод Team. MIT License.

#include "visprog/generators/CppCodeGenerator.hpp"

#include <algorithm>
#include <cstdint>
#include <sstream>
#include <string>
#include <string_view>
#include <unordered_map>

#include "visprog/core/Connection.hpp"
#include "visprog/core/Graph.hpp"
#include "visprog/core/Node.hpp"
#include "visprog/core/Port.hpp"
#include "visprog/core/Types.hpp"

namespace visprog::generators {

namespace {

const core::Port* find_port_by_name(const core::Node& node, std::string_view name) {
    for (const auto& port : node.get_ports()) {
        if (port.get_name() == name) {
            return &port;
        }
    }
    return nullptr;
}

const core::Node* find_node_with_port(const core::Graph& graph, core::PortId port_id) {
    for (const auto& node : graph.get_nodes()) {
        if (node->find_port(port_id) != nullptr) {
            return node.get();
        }
    }
    return nullptr;
}

const core::Node* get_connected_node(const core::Graph& graph, const core::Port& port) {
    for (const auto& connection : graph.get_connections()) {
        if (port.get_direction() == core::PortDirection::Input &&
            connection.to_port == port.get_id()) {
            return graph.get_node(connection.from_node);
        }
        if (port.get_direction() == core::PortDirection::Output &&
            connection.from_port == port.get_id()) {
            return graph.get_node(connection.to_node);
        }
    }
    return nullptr;
}

const core::Port* get_connected_port(const core::Graph& graph, const core::Port& port) {
    for (const auto& connection : graph.get_connections()) {
        if (port.get_direction() == core::PortDirection::Input &&
            connection.to_port == port.get_id()) {
            const auto* source_node = graph.get_node(connection.from_node);
            return source_node ? source_node->find_port(connection.from_port) : nullptr;
        }

        if (port.get_direction() == core::PortDirection::Output &&
            connection.from_port == port.get_id()) {
            const auto* target_node = graph.get_node(connection.to_node);
            return target_node ? target_node->find_port(connection.to_port) : nullptr;
        }
    }
    return nullptr;
}

std::string to_cpp_type(core::DataType type) {
    switch (type) {
        case core::DataType::Int32:
            return "int";
        case core::DataType::String:
            return "std::string";
        case core::DataType::Bool:
            return "bool";
        default:
            return "auto";
    }
}

class GraphCodeBuilder {
public:
    explicit GraphCodeBuilder(const core::Graph& graph) : graph_(graph) {}

    auto build() -> core::Result<std::string> {
        for (const auto& var : graph_.get_variables()) {
            preamble_ << "    " << to_cpp_type(var.type) << " " << var.name << ";\n";
        }
        if (!graph_.get_variables().empty()) {
            preamble_ << "\n";
        }

        const auto* start_node = find_start_node();
        if (start_node == nullptr) {
            return core::Result<std::string>{core::Error{"Graph must have a Start node."}};
        }

        const auto start_exec_ports = start_node->get_exec_output_ports();
        if (!start_exec_ports.empty()) {
            generate_exec_flow(get_connected_node(graph_, *start_exec_ports[0]));
        }

        return core::Result<std::string>{assemble_final_code()};
    }

private:
    void generate_exec_flow(const core::Node* current_node, int indent = 1) {
        if (current_node == nullptr) {
            return;
        }
        if (recursion_depth_ > 200) {
            main_body_ << std::string(static_cast<std::size_t>(indent * 4), ' ')
                       << "/* Recursion limit reached */\n";
            return;
        }
        recursion_depth_++;

        const auto type = current_node->get_type();
        const auto indentation = std::string(static_cast<std::size_t>(indent * 4), ' ');

        if (type.name == core::NodeTypes::End.name) {
            main_body_ << indentation << "return 0;\n";
        } else if (type.name == core::NodeTypes::PrintString.name) {
            if (const auto* msg_port = find_port_by_name(*current_node, "value")) {
                const auto value_expr = generate_data_expression(*msg_port);
                main_body_ << indentation << "std::cout << " << value_expr << " << std::endl;\n";
            }
            generate_exec_flow(get_next_exec_node(*current_node), indent);
        } else if (type.name == core::NodeTypes::SetVariable.name) {
            const auto var_name =
                current_node->get_property<std::string>("variable_name").value_or("");
            const auto* value_port = find_port_by_name(*current_node, "value");

            if (!var_name.empty() && value_port != nullptr) {
                const auto value_expr = generate_data_expression(*value_port);
                main_body_ << indentation << var_name << " = " << value_expr << ";\n";
            }
            generate_exec_flow(get_next_exec_node(*current_node), indent);
        } else if (type.name == core::NodeTypes::Sequence.name) {
            auto exec_ports = current_node->get_exec_output_ports();
            std::sort(
                exec_ports.begin(), exec_ports.end(), [](const core::Port* a, const core::Port* b) {
                    return a->get_name() < b->get_name();
                });

            for (const auto* port : exec_ports) {
                generate_exec_flow(get_connected_node(graph_, *port), indent);
            }
        } else if (type.name == core::NodeTypes::Branch.name) {
            const auto* cond_port = find_port_by_name(*current_node, "condition");
            const auto condition_expr = cond_port ? generate_data_expression(*cond_port) : "false";

            main_body_ << indentation << "if (" << condition_expr << ") {\n";
            if (const auto* true_exec = find_port_by_name(*current_node, "true_exec")) {
                generate_exec_flow(get_connected_node(graph_, *true_exec), indent + 1);
            }
            main_body_ << indentation << "} else {\n";
            if (const auto* false_exec = find_port_by_name(*current_node, "false_exec")) {
                generate_exec_flow(get_connected_node(graph_, *false_exec), indent + 1);
            }
            main_body_ << indentation << "}\n";
        } else if (type.name == core::NodeTypes::ForLoop.name) {
            const auto* first_idx_port = find_port_by_name(*current_node, "first_index");
            const auto* last_idx_port = find_port_by_name(*current_node, "last_index");
            const auto* index_out_port = find_port_by_name(*current_node, "index");

            const auto first_idx_expr =
                first_idx_port ? generate_data_expression(*first_idx_port) : "0";
            const auto last_idx_expr =
                last_idx_port ? generate_data_expression(*last_idx_port) : "10";

            const auto loop_var = "i_" + std::to_string(current_node->get_id().value);

            if (index_out_port != nullptr) {
                generated_expressions_[index_out_port->get_id()] = loop_var;
            }

            main_body_ << indentation << "for (int " << loop_var << " = " << first_idx_expr << "; "
                       << loop_var << " < " << last_idx_expr << "; ++" << loop_var << ") {\n";

            if (const auto* loop_body = find_port_by_name(*current_node, "loop_body")) {
                generate_exec_flow(get_connected_node(graph_, *loop_body), indent + 1);
            }

            main_body_ << indentation << "}\n";

            if (const auto* completed = find_port_by_name(*current_node, "completed")) {
                generate_exec_flow(get_connected_node(graph_, *completed), indent);
            }
        } else {
            generate_exec_flow(get_next_exec_node(*current_node), indent);
        }

        recursion_depth_--;
    }

    std::string generate_data_expression(const core::Port& input_port) {
        if (input_port.get_direction() != core::PortDirection::Input) {
            return "/* invalid port direction */";
        }

        const auto* source_port = get_connected_port(graph_, input_port);
        if (source_port == nullptr) {
            return get_default_value(input_port.get_data_type());
        }

        const auto* source_node = find_node_with_port(graph_, source_port->get_id());
        if (source_node == nullptr) {
            return "/* source node not found */";
        }

        const auto cache_key = source_port->get_id();
        if (generated_expressions_.contains(cache_key)) {
            return generated_expressions_[cache_key];
        }

        const auto type = source_node->get_type();
        std::string expression;

        if (type.name == core::NodeTypes::GetVariable.name) {
            expression = source_node->get_property<std::string>("variable_name")
                             .value_or("/* unknown_var */");
        } else if (type.name == core::NodeTypes::StringLiteral.name) {
            const auto value = source_node->get_property<std::string>("value").value_or("");
            const auto var_name = "var_" + std::to_string(source_node->get_id().value);
            preamble_ << "    const std::string " << var_name << " = \"" << value << "\";\n";
            expression = var_name;
        } else if (type.name == core::NodeTypes::BoolLiteral.name) {
            const auto value = source_node->get_property<bool>("value").value_or(false);
            const auto var_name = "var_" + std::to_string(source_node->get_id().value);
            preamble_ << "    const bool " << var_name << " = " << (value ? "true" : "false")
                      << ";\n";
            expression = var_name;
        } else if (type.name == core::NodeTypes::IntLiteral.name) {
            const auto value = source_node->get_property<std::int64_t>("value").value_or(0);
            const auto var_name = "var_" + std::to_string(source_node->get_id().value);
            preamble_ << "    const int " << var_name << " = " << value << ";\n";
            expression = var_name;
        } else if (type.name == core::NodeTypes::Add.name) {
            const auto* port_a = find_port_by_name(*source_node, "a");
            const auto* port_b = find_port_by_name(*source_node, "b");
            if (port_a != nullptr && port_b != nullptr) {
                const auto expr_a = generate_data_expression(*port_a);
                const auto expr_b = generate_data_expression(*port_b);
                expression = "(" + expr_a + " + " + expr_b + ")";
            } else {
                expression = get_default_value(core::DataType::Int32);
            }
        } else if (const auto* start_node = find_start_node();
                   start_node != nullptr && source_node->get_id() == start_node->get_id()) {
            expression = get_default_value(source_port->get_data_type());
        } else {
            expression = get_default_value(input_port.get_data_type());
        }

        generated_expressions_[cache_key] = expression;
        return expression;
    }

    [[nodiscard]] const core::Node* find_start_node() const {
        for (const auto& node : graph_.get_nodes()) {
            if (node->get_type().name == core::NodeTypes::Start.name) {
                return node.get();
            }
        }
        return nullptr;
    }

    [[nodiscard]] const core::Node* get_next_exec_node(const core::Node& node) const {
        const auto exec_ports = node.get_exec_output_ports();
        return exec_ports.empty() ? nullptr : get_connected_node(graph_, *exec_ports[0]);
    }

    [[nodiscard]] static std::string get_default_value(core::DataType type) {
        if (type == core::DataType::String) {
            return "std::string(\"\")";
        }
        if (type == core::DataType::Bool) {
            return "false";
        }
        if (type == core::DataType::Int32) {
            return "0";
        }
        if (type == core::DataType::Any) {
            return "\"(unconnected)\"";
        }
        return "/* unknown type */";
    }

    [[nodiscard]] std::string assemble_final_code() const {
        std::stringstream ss;
        ss << "// Generated by MultiCode C++ Code Generator\n";
        ss << "#include <iostream>\n";
        ss << "#include <string>\n\n";
        ss << "int main() {\n";
        ss << preamble_.str();
        ss << main_body_.str();
        if (main_body_.str().find("return 0;") == std::string::npos) {
            ss << "    return 0;\n";
        }
        ss << "}\n";
        return ss.str();
    }

    const core::Graph& graph_;
    std::stringstream preamble_;
    std::stringstream main_body_;
    std::unordered_map<core::PortId, std::string> generated_expressions_;
    int recursion_depth_{0};
};

}  // namespace

auto CppCodeGenerator::generate(const core::Graph& graph) -> core::Result<std::string> {
    GraphCodeBuilder builder(graph);
    return builder.build();
}

}  // namespace visprog::generators
