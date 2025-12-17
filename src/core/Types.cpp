// Copyright (c) 2025 МультиКод Team. MIT License.

#include "visprog/core/Types.hpp"

#include <stdexcept>

namespace visprog::core {

auto to_string(DataType type) -> std::string_view {
    switch (type) {
        case DataType::Void: return "void";
        case DataType::Bool: return "bool";
        case DataType::Int32: return "int32";
        case DataType::Int64: return "int64";
        case DataType::Float: return "float";
        case DataType::Double: return "double";
        case DataType::String: return "string";
        case DataType::StringView: return "string_view";
        case DataType::Execution: return "Execution";
        case DataType::Any: return "any";
    }
    return "unknown";
}

auto to_string(Language lang) -> std::string_view {
    switch (lang) {
        case Language::Cpp: return "C++";
        case Language::Rust: return "Rust";
        case Language::Assembly: return "Assembly";
    }
    return "unknown";
}

auto get_color_for_type(DataType type) -> std::string_view {
    switch (type) {
        case DataType::Execution: return "#FFFFFF"; // White for execution
        case DataType::Bool: return "#E57373";      // Red
        case DataType::Int32:
        case DataType::Int64: return "#64B5F6";      // Blue
        case DataType::Float:
        case DataType::Double: return "#81C784";     // Green
        case DataType::String:
        case DataType::StringView: return "#FFB74D"; // Orange
        default: return "#BDBDBD";                   // Grey for others
    }
}

}