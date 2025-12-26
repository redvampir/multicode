// Copyright (c) 2025 МультиКод Team. MIT License.

#include "visprog/core/Types.hpp"

#include <stdexcept>

namespace visprog::core {

auto to_string(DataType type) -> std::string_view {
    switch (type) {
        // Primitives
        case DataType::Void:
            return "void";
        case DataType::Bool:
            return "bool";
        case DataType::Int8:
            return "int8";
        case DataType::Int16:
            return "int16";
        case DataType::Int32:
            return "int32";
        case DataType::Int64:
            return "int64";
        case DataType::UInt8:
            return "uint8";
        case DataType::UInt16:
            return "uint16";
        case DataType::UInt32:
            return "uint32";
        case DataType::UInt64:
            return "uint64";
        case DataType::Float:
            return "float";
        case DataType::Double:
            return "double";

        // Strings
        case DataType::String:
            return "string";
        case DataType::StringView:
            return "string_view";
        case DataType::Char:
            return "char";
        case DataType::WChar:
            return "wchar";

        // Pointers and References
        case DataType::Pointer:
            return "pointer";
        case DataType::Reference:
            return "reference";

        // Containers
        case DataType::Array:
            return "array";
        case DataType::Vector:
            return "vector";
        case DataType::Map:
            return "map";
        case DataType::Set:
            return "set";

        // User-defined types
        case DataType::Struct:
            return "struct";
        case DataType::Class:
            return "class";
        case DataType::Enum:
            return "enum";
        case DataType::Template:
            return "template";
        case DataType::Object:
            return "object";

        // Special
        case DataType::Execution:
            return "execution";
        case DataType::Any:
            return "any";
        case DataType::Auto:
            return "auto";
        case DataType::Unknown:
            return "unknown";
    }
    return "unknown";
}

auto to_string(Language lang) -> std::string_view {
    switch (lang) {
        case Language::Cpp:
            return "C++";
        case Language::Rust:
            return "Rust";
        case Language::Assembly:
            return "Assembly";
    }
    return "unknown";
}

auto get_color_for_type(DataType type) -> std::string_view {
    switch (type) {
        // Execution flow
        case DataType::Execution:
            return "#FFFFFF";  // White

        // Boolean
        case DataType::Bool:
            return "#E57373";  // Red

        // Integers
        case DataType::Int8:
        case DataType::Int16:
        case DataType::Int32:
        case DataType::Int64:
        case DataType::UInt8:
        case DataType::UInt16:
        case DataType::UInt32:
        case DataType::UInt64:
            return "#64B5F6";  // Blue

        // Floating point
        case DataType::Float:
        case DataType::Double:
            return "#81C784";  // Green

        // Strings
        case DataType::String:
        case DataType::StringView:
        case DataType::Char:
        case DataType::WChar:
            return "#FFB74D";  // Orange

        // Pointers and References
        case DataType::Pointer:
        case DataType::Reference:
            return "#CE93D8";  // Purple

        // Containers
        case DataType::Array:
        case DataType::Vector:
        case DataType::Map:
        case DataType::Set:
            return "#4DD0E1";  // Cyan

        // User-defined types
        case DataType::Struct:
        case DataType::Class:
        case DataType::Enum:
        case DataType::Template:
        case DataType::Object:
            return "#90A4AE";  // Blue-grey

        // Special types
        case DataType::Void:
        case DataType::Any:
        case DataType::Auto:
        case DataType::Unknown:
            return "#BDBDBD";  // Grey
    }
    return "#BDBDBD";  // Default grey
}

}  // namespace visprog::core
