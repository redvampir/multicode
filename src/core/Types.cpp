// Copyright (c) 2025 МультиКод Team. MIT License.

#include "visprog/core/Types.hpp"

namespace visprog::core {

auto to_string(NodeType type) -> std::string_view {
    switch (type) {
        // Control Flow
        case NodeType::Start:
            return "Start";
        case NodeType::End:
            return "End";

        // Functions
        case NodeType::Function:
            return "Function";
        case NodeType::PureFunction:
            return "PureFunction";
        case NodeType::Constructor:
            return "Constructor";
        case NodeType::Destructor:
            return "Destructor";

        // Variables
        case NodeType::Variable:
            return "Variable";
        case NodeType::Constant:
            return "Constant";
        case NodeType::GetVariable:
            return "GetVariable";
        case NodeType::SetVariable:
            return "SetVariable";

        // Control Flow
        case NodeType::If:
            return "If";
        case NodeType::Else:
            return "Else";
        case NodeType::ElseIf:
            return "ElseIf";
        case NodeType::Switch:
            return "Switch";
        case NodeType::Case:
            return "Case";

        // Loops
        case NodeType::ForLoop:
            return "ForLoop";
        case NodeType::WhileLoop:
            return "WhileLoop";
        case NodeType::DoWhileLoop:
            return "DoWhileLoop";
        case NodeType::RangeFor:
            return "RangeFor";

        // Operators
        case NodeType::Add:
            return "Add";
        case NodeType::Subtract:
            return "Subtract";
        case NodeType::Multiply:
            return "Multiply";
        case NodeType::Divide:
            return "Divide";
        case NodeType::Modulo:
            return "Modulo";

        // Comparison
        case NodeType::Equal:
            return "Equal";
        case NodeType::NotEqual:
            return "NotEqual";
        case NodeType::Less:
            return "Less";
        case NodeType::LessEqual:
            return "LessEqual";
        case NodeType::Greater:
            return "Greater";
        case NodeType::GreaterEqual:
            return "GreaterEqual";

        // Logical
        case NodeType::And:
            return "And";
        case NodeType::Or:
            return "Or";
        case NodeType::Not:
            return "Not";

        // Bitwise
        case NodeType::BitwiseAnd:
            return "BitwiseAnd";
        case NodeType::BitwiseOr:
            return "BitwiseOr";
        case NodeType::BitwiseXor:
            return "BitwiseXor";
        case NodeType::BitwiseNot:
            return "BitwiseNot";
        case NodeType::ShiftLeft:
            return "ShiftLeft";
        case NodeType::ShiftRight:
            return "ShiftRight";

        // Data Structures
        case NodeType::Array:
            return "Array";
        case NodeType::Vector:
            return "Vector";
        case NodeType::Map:
            return "Map";
        case NodeType::Set:
            return "Set";

        // I/O
        case NodeType::Print:
            return "Print";
        case NodeType::Read:
            return "Read";
        case NodeType::FileRead:
            return "FileRead";
        case NodeType::FileWrite:
            return "FileWrite";

        // Low-Level
        case NodeType::PointerDereference:
            return "PointerDereference";
        case NodeType::AddressOf:
            return "AddressOf";
        case NodeType::MemoryCopy:
            return "MemoryCopy";
        case NodeType::MemoryAlloc:
            return "MemoryAlloc";
        case NodeType::MemoryFree:
            return "MemoryFree";
        case NodeType::Assembly:
            return "Assembly";

        // OOP
        case NodeType::Class:
            return "Class";
        case NodeType::Struct:
            return "Struct";
        case NodeType::Method:
            return "Method";
        case NodeType::Field:
            return "Field";

        // Events
        case NodeType::Event:
            return "Event";
        case NodeType::EventHandler:
            return "EventHandler";

        // Comments & Debug
        case NodeType::Comment:
            return "Comment";
        case NodeType::DebugPrint:
            return "DebugPrint";
        case NodeType::Breakpoint:
            return "Breakpoint";

        // Custom
        case NodeType::Custom:
            return "Custom";
    }

    return "Unknown";
}

auto to_string(DataType type) -> std::string_view {
    switch (type) {
        // Primitives
        case DataType::Void:
            return "void";
        case DataType::Bool:
            return "bool";
        case DataType::Int8:
            return "int8_t";
        case DataType::Int16:
            return "int16_t";
        case DataType::Int32:
            return "int32_t";
        case DataType::Int64:
            return "int64_t";
        case DataType::UInt8:
            return "uint8_t";
        case DataType::UInt16:
            return "uint16_t";
        case DataType::UInt32:
            return "uint32_t";
        case DataType::UInt64:
            return "uint64_t";
        case DataType::Float:
            return "float";
        case DataType::Double:
            return "double";
        case DataType::Char:
            return "char";

        // Strings
        case DataType::String:
            return "std::string";
        case DataType::StringView:
            return "std::string_view";

        // Pointers
        case DataType::Pointer:
            return "T*";
        case DataType::Reference:
            return "T&";

        // Containers
        case DataType::Array:
            return "std::array<T>";
        case DataType::Vector:
            return "std::vector<T>";
        case DataType::Map:
            return "std::map<K,V>";
        case DataType::Set:
            return "std::set<T>";

        // User-defined
        case DataType::Struct:
            return "struct";
        case DataType::Class:
            return "class";
        case DataType::Enum:
            return "enum";

        // Special
        case DataType::Auto:
            return "auto";
        case DataType::Template:
            return "template<T>";
        case DataType::Execution:
            return "exec";
        case DataType::Any:
            return "any";
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

    return "Unknown";
}

auto get_color_for_type(DataType type) -> std::string_view {
    switch (type) {
        // Integers - Cyan
        case DataType::Int8:
        case DataType::Int16:
        case DataType::Int32:
        case DataType::Int64:
        case DataType::UInt8:
        case DataType::UInt16:
        case DataType::UInt32:
        case DataType::UInt64:
            return "#00BCD4";  // Cyan

        // Floats - Green
        case DataType::Float:
        case DataType::Double:
            return "#4CAF50";  // Green

        // Bool - Red
        case DataType::Bool:
            return "#F44336";  // Red

        // Strings - Purple
        case DataType::String:
        case DataType::StringView:
        case DataType::Char:
            return "#9C27B0";  // Purple

        // Pointers - Gray
        case DataType::Pointer:
        case DataType::Reference:
            return "#757575";  // Gray

        // Containers - Orange
        case DataType::Array:
        case DataType::Vector:
        case DataType::Map:
        case DataType::Set:
            return "#FF9800";  // Orange

        // User-defined - Blue
        case DataType::Struct:
        case DataType::Class:
        case DataType::Enum:
            return "#2196F3";  // Blue

        // Execution - White
        case DataType::Execution:
            return "#FFFFFF";  // White

        // Special - Yellow
        case DataType::Auto:
        case DataType::Template:
        case DataType::Any:
            return "#FFEB3B";  // Yellow

        case DataType::Void:
        default:
            return "#9E9E9E";  // Light Gray
    }
}

}  // namespace visprog::core
