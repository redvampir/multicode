// Copyright (c) 2025 МультиКод Team. MIT License.

#include "visprog/generators/CppCodeGenerator.hpp"

#include <algorithm> // For std::sort
#include <iostream>
#include <memory>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#include "visprog/core/Connection.hpp"
#include "visprog/core/Graph.hpp"
#include "visprog/core/Node.hpp"
#include "visprog/core/Port.hpp"
#include "visprog/core/Types.hpp"

namespace visprog::generators {

namespace {

// ===========================================================================
// Helper Functions
// ===========================================================================

const core::Node* get_connected_node(const core::Graph& graph, const core::Port& port) {
    const auto* connection = graph.get_connection_for_port(port.get_id());
    if (!connection) {
        return nullptr;
    }
    if (port.get_direction() == core::PortDirection::Input) {
        return graph.get_node(connection->from_node);
    }
    return graph.get_node(connection->to_node);
}

const core::Port* get_connected_port(const core::Graph& graph, const core::Port& port) {
    const auto* connection = graph.get_connection_for_port(port.get_id());
    if (!connection) {
        return nullptr;
    }
    if (port.get_direction() == core::PortDirection::Input) {
        return graph.get_node(connection->from_node)->find_port(connection->from_port);
    }
    return graph.get_node(connection->to_node)->find_port(connection->to_port);
}

std::string to_cpp_type(core::DataType type) {
    switch (type) {
        case core::DataType::Int32: return "int";
        case core::DataType::String: return "std::string";
        case core::DataType::Bool: return "bool";
        default: return "auto";
    }
}

class GraphCodeBuilder {
public:
    explicit GraphCodeBuilder(const core::Graph& graph) : graph_(graph) {}

    auto build() -> core::Result<std::string> {
        // 1. Declare all graph variables in the preamble
        for (const auto& var : graph_.get_variables()) {
            preamble_ << "    " << to_cpp_type(var.type) << " " << var.name << ";\n";
        }
        if (!graph_.get_variables().empty()) {
            preamble_ << "\n";
        }

        // 2. Find start node and begin execution flow generation
        const auto* start_node = find_start_node();
        if (!start_node) {
            return core::Result<std::string>{
                core::Error{"Graph must have a Start node."}};
        }

        auto start_exec_ports = start_node->get_exec_output_ports();
        if (!start_exec_ports.empty()) {
            generate_exec_flow(get_connected_node(graph_, *start_exec_ports[0]));
        }

        return assemble_final_code();
    }

private:
    void generate_exec_flow(const core::Node* current_node, int indent = 1) {
        if (!current_node) {
            return;
        }
        if (recursion_depth_ > 200) {
            main_body_ << std::string(indent * 4, ' ') << "/* Recursion limit reached */\n";
            return;
        }
        recursion_depth_++;

        const auto type = current_node->get_type();
        const std::string indentation(indent * 4, ' ');

        if (type.name == core::NodeTypes::End.name) {
            main_body_ << indentation << "return 0;\n";
        } else if (type.name == core::NodeTypes::PrintString.name) {
            const auto* msg_port = current_node->find_port("message");
            if (msg_port) {
                std::string value_expr = generate_data_expression(*msg_port);
                main_body_ << indentation << "std::cout << " << value_expr << " << std::endl;\n";
            }
            generate_exec_flow(get_next_exec_node(*current_node), indent);
        } else if (type.name == core::NodeTypes::SetVariable.name) {
            auto var_name = current_node->get_property<std::string>("variable_name").value_or("");
            const auto* value_port = current_node->find_port("value");

            if (!var_name.empty() && value_port) {
                std::string value_expr = generate_data_expression(*value_port);
                main_body_ << indentation << var_name << " = " << value_expr << ";\n";
            }
            generate_exec_flow(get_next_exec_node(*current_node), indent);
        } else if (type.name == core::NodeTypes::Sequence.name) {
            auto exec_ports = current_node->get_exec_output_ports();
            
            // Sort ports to ensure deterministic order ("Then 0", "Then 1", ...)
            std::sort(exec_ports.begin(), exec_ports.end(), [](const core::Port* a, const core::Port* b) {
                return a->get_name() < b->get_name();
            });

            for (const auto* port : exec_ports) {
                 generate_exec_flow(get_connected_node(graph_, *port), indent);
            }
        } else if (type.name == core::NodeTypes::Branch.name) {
            const auto* cond_port = current_node->find_port("condition");
            std::string condition_expr = cond_port ? generate_data_expression(*cond_port) : "false";

            main_body_ << indentation << "if (" << condition_expr << ") {\n";
            generate_exec_flow(
                get_connected_node(graph_, *current_node->find_port("true_exec")), indent + 1);
            main_body_ << indentation << "} else {\n";
            generate_exec_flow(
                get_connected_node(graph_, *current_node->find_port("false_exec")), indent + 1);
            main_body_ << indentation << "}\n";
        } else if (type.name == core::NodeTypes::ForLoop.name) {
            const auto* first_idx_port = current_node->find_port("first_index");
            const auto* last_idx_port = current_node->find_port("last_index");
            const auto* index_out_port = current_node->find_port("index");

            std::string first_idx_expr = first_idx_port ? generate_data_expression(*first_idx_port) : "0";
            std::string last_idx_expr = last_idx_port ? generate_data_expression(*last_idx_port) : "10";
            
            std::string loop_var = "i_" + std::to_string(current_node->get_id().value);

            if (index_out_port) {
                generated_expressions_[index_out_port->get_id()] = loop_var;
            }

            main_body_ << indentation << "for (int " << loop_var << " = " << first_idx_expr << "; "
                       << loop_var << " < " << last_idx_expr << "; ++" << loop_var << ") {\n";
            
            generate_exec_flow(get_connected_node(graph_, *current_node->find_port("loop_body")), indent + 1);
            
            main_body_ << indentation << "}\n";

            generate_exec_flow(get_connected_node(graph_, *current_node->find_port("completed")), indent);
        } else {
            generate_exec_flow(get_next_exec_node(*current_node), indent);
        }

        recursion_depth_--;
    }

    std::string generate_data_expression(const core::Port& input_port) {
        if (input_port.get_direction() != core::PortDirection::Input) {
            return "/* invalid port direction */";
        }

        const core::Port* source_port = get_connected_port(graph_, input_port);
        if (!source_port) {
            return get_default_value(input_port.get_data_type());
        }

        const core::Node* source_node = graph_.get_node(source_port->get_owner_node_id());
        if (!source_node) {
            return "/* source node not found */";
        }

        const auto cache_key = source_port->get_id();
        if (generated_expressions_.count(cache_key)) {
            return generated_expressions_[cache_key];
        }

        const auto type = source_node->get_type();
        std::string expression;

        if (type.name == core::NodeTypes::GetVariable.name) {
            expression = source_node->get_property<std::string>("variable_name").value_or("/* unknown_var */");
        } else if (type.name == core::NodeTypes::StringLiteral.name) {
            auto value = source_node->get_property<std::string>("value").value_or("");
            std::string var_name = "var_" + std::to_string(source_node->get_id().value);
            preamble_ << "    const std::string " << var_name << " = \"" << value << "\";\n";
            expression = var_name;
        } else if (type.name == core::NodeTypes::BoolLiteral.name) {
            auto value = source_node->get_property<bool>("value").value_or(false);
            std::string var_name = "var_" + std::to_string(source_node->get_id().value);
            preamble_ << "    const bool " << var_name << " = " << (value ? "true" : "false") << ";\n";
            expression = var_name;
        } else if (type.name == core::NodeTypes::IntLiteral.name) {
            auto value = source_node->get_property<int>("value").value_or(0);
            std::string var_name = "var_" + std::to_string(source_node->get_id().value);
            preamble_ << "    const int " << var_name << " = " << value << ";\n";
            expression = var_name;
        } else if (type.name == core::NodeTypes::Add.name) {
            const auto* port_a = source_node->find_port("a");
            const auto* port_b = source_node->find_port("b");
            if (port_a && port_b) {
                std::string expr_a = generate_data_expression(*port_a);
                std::string expr_b = generate_data_expression(*port_b);
                expression = "(" + expr_a + " + " + expr_b + ")";
            } else {
                expression = get_default_value(core::DataType::Int32);
            }
        } else if (source_port->get_owner_node_id() == graph_.find_start_node()->get_id()) {
             // This case handles data ports on the Start node, if any in the future.
             expression = get_default_value(source_port->get_data_type());
        } else {
            // Default case for any other data node
            expression = get_default_value(input_port.get_data_type());
        }

        generated_expressions_[cache_key] = expression;
        return expression;
    }

    const core::Node* find_start_node() const {
        auto start_nodes = graph_.get_nodes_of_type(core::NodeTypes::Start);
        return start_nodes.empty() ? nullptr : start_nodes[0];
    }

    const core::Node* get_next_exec_node(const core::Node& node) {
        auto exec_ports = node.get_exec_output_ports();
        // This logic is simple, assumes single exec output or takes the first one.
        return exec_ports.empty() ? nullptr : get_connected_node(graph_, *exec_ports[0]);
    }

    std::string get_default_value(core::DataType type) const {
        if (type == core::DataType::String) return "std::string(\"\")";
        if (type == core::DataType::Bool) return "false";
        if (type == core::DataType::Int32) return "0";
        if (type == core::DataType::Any) return "\"(unconnected)\"";
        return "/* unknown type */";
    }

    auto assemble_final_code() -> std::string {
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
