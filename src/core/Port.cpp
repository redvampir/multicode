// Copyright (c) 2025 МультиКод Team. MIT License.

#include "visprog/core/Port.hpp"

#include <string_view>

namespace {

using visprog::core::DataType;

constexpr auto whitespace_chars = " \t\n\r\f\v";

[[nodiscard]] auto trim(std::string_view value) noexcept -> std::string_view {
    const auto first = value.find_first_not_of(whitespace_chars);
    if (first == std::string_view::npos) {
        return {};
    }

    const auto last = value.find_last_not_of(whitespace_chars);
    return value.substr(first, last - first + 1);
}

[[nodiscard]] constexpr auto is_generic_type_name(std::string_view name) noexcept -> bool {
    return name.empty() || name == "*" || name == "void" || name == "auto" || name == "any";
}

[[nodiscard]] auto are_type_names_compatible(std::string_view lhs, std::string_view rhs) noexcept -> bool {
    const auto lhs_trimmed = trim(lhs);
    const auto rhs_trimmed = trim(rhs);

    if (lhs_trimmed == rhs_trimmed) {
        return true;
    }

    return is_generic_type_name(lhs_trimmed) || is_generic_type_name(rhs_trimmed);
}

[[nodiscard]] constexpr auto requires_type_name(DataType type) noexcept -> bool {
    switch (type) {
        case DataType::Pointer:
        case DataType::Reference:
        case DataType::Array:
        case DataType::Vector:
        case DataType::Map:
        case DataType::Set:
        case DataType::Struct:
        case DataType::Class:
        case DataType::Enum:
        case DataType::Template:
            return true;
        default:
            return false;
    }
}

[[nodiscard]] constexpr auto is_signed_integral(DataType type) noexcept -> bool {
    switch (type) {
        case DataType::Int8:
        case DataType::Int16:
        case DataType::Int32:
        case DataType::Int64:
            return true;
        default:
            return false;
    }
}

[[nodiscard]] constexpr auto is_unsigned_integral(DataType type) noexcept -> bool {
    switch (type) {
        case DataType::UInt8:
        case DataType::UInt16:
        case DataType::UInt32:
        case DataType::UInt64:
            return true;
        default:
            return false;
    }
}

[[nodiscard]] constexpr auto is_integral(DataType type) noexcept -> bool {
    return is_signed_integral(type) || is_unsigned_integral(type) || type == DataType::Bool || type == DataType::Char;
}

[[nodiscard]] constexpr auto is_floating_point(DataType type) noexcept -> bool {
    return type == DataType::Float || type == DataType::Double;
}

[[nodiscard]] constexpr auto is_numeric(DataType type) noexcept -> bool {
    return is_integral(type) || is_floating_point(type);
}

[[nodiscard]] constexpr auto is_string_like(DataType type) noexcept -> bool {
    return type == DataType::String || type == DataType::StringView;
}

[[nodiscard]] constexpr auto is_pointer_like(DataType type) noexcept -> bool {
    return type == DataType::Pointer || type == DataType::Reference;
}

[[nodiscard]] constexpr auto is_container(DataType type) noexcept -> bool {
    switch (type) {
        case DataType::Array:
        case DataType::Vector:
        case DataType::Map:
        case DataType::Set:
            return true;
        default:
            return false;
    }
}

[[nodiscard]] constexpr auto is_user_defined(DataType type) noexcept -> bool {
    return type == DataType::Struct || type == DataType::Class || type == DataType::Enum;
}

[[nodiscard]] constexpr auto is_numeric_widening(DataType from, DataType to) noexcept -> bool {
    switch (from) {
        case DataType::Int8:
            return to == DataType::Int16 || to == DataType::Int32 || to == DataType::Int64;
        case DataType::Int16:
            return to == DataType::Int32 || to == DataType::Int64;
        case DataType::Int32:
            return to == DataType::Int64;
        case DataType::UInt8:
            return to == DataType::UInt16 || to == DataType::UInt32 || to == DataType::UInt64;
        case DataType::UInt16:
            return to == DataType::UInt32 || to == DataType::UInt64;
        case DataType::UInt32:
            return to == DataType::UInt64;
        default:
            return false;
    }
}

[[nodiscard]] constexpr auto is_integral_to_floating(DataType from, DataType to) noexcept -> bool {
    if (!is_integral(from)) {
        return false;
    }

    return to == DataType::Float || to == DataType::Double;
}

[[nodiscard]] constexpr auto is_float_promotion(DataType from, DataType to) noexcept -> bool {
    return from == DataType::Float && to == DataType::Double;
}

[[nodiscard]] auto is_pointer_compatible(DataType from_type,
                                          std::string_view from_name,
                                          DataType to_type,
                                          std::string_view to_name) noexcept -> bool {
    if (!is_pointer_like(from_type) || !is_pointer_like(to_type)) {
        return false;
    }

    return are_type_names_compatible(from_name, to_name);
}

[[nodiscard]] auto is_container_compatible(DataType from_type,
                                            std::string_view from_name,
                                            DataType to_type,
                                            std::string_view to_name) noexcept -> bool {
    if (!is_container(from_type) || !is_container(to_type)) {
        return false;
    }

    if (from_type != to_type) {
        return false;
    }

    return are_type_names_compatible(from_name, to_name);
}

[[nodiscard]] auto is_user_defined_compatible(DataType from_type,
                                              std::string_view from_name,
                                              DataType to_type,
                                              std::string_view to_name) noexcept -> bool {
    if (!is_user_defined(from_type) || !is_user_defined(to_type)) {
        return false;
    }

    if (from_type != to_type) {
        return false;
    }

    return are_type_names_compatible(from_name, to_name);
}

}  // namespace

namespace visprog::core {

auto Port::generate_unique_id() noexcept -> PortId {
    return PortId{next_id_.fetch_add(1, std::memory_order_relaxed)};
}

Port::Port(PortId id,
           PortDirection direction,
           DataType data_type,
           std::string name) noexcept
    : id_(id)
    , direction_(direction)
    , data_type_(data_type)
    , name_(std::move(name))
    , type_name_() {
}

auto Port::can_connect_to(const Port& other) const noexcept -> bool {
    // Cannot connect to itself
    if (id_ == other.id_) {
        return false;
    }
    
    // Direction check: Output → Input or InOut ↔ any
    const bool direction_ok = 
        (is_output() && other.is_input()) ||
        (is_input() && other.is_output()) ||
        (direction_ == PortDirection::InOut) ||
        (other.direction_ == PortDirection::InOut);
    
    if (!direction_ok) {
        return false;
    }
    
    // Type compatibility check

    // Execution ports can only connect to execution ports
    if (is_execution() || other.is_execution()) {
        return is_execution() == other.is_execution();
    }

    // Any type can connect to anything (custom nodes)
    if (data_type_ == DataType::Any || other.data_type_ == DataType::Any) {
        return true;
    }
    
    // Auto type can connect to anything
    if (data_type_ == DataType::Auto || other.data_type_ == DataType::Auto) {
        return true;
    }
    
    // Void ports can only connect to void ports
    if (data_type_ == DataType::Void || other.data_type_ == DataType::Void) {
        return data_type_ == other.data_type_;
    }

    // Exact type match
    if (data_type_ == other.data_type_) {
        if (requires_type_name(data_type_)) {
            return are_type_names_compatible(type_name_, other.type_name_);
        }
        return true;
    }

    // Template placeholders allow compatible matches by name
    if (data_type_ == DataType::Template || other.data_type_ == DataType::Template) {
        return are_type_names_compatible(type_name_, other.type_name_);
    }

    // Pointer and reference conversions (including pointer <-> reference)
    if (is_pointer_compatible(data_type_, type_name_, other.data_type_, other.type_name_)) {
        return true;
    }

    if (is_pointer_compatible(other.data_type_, other.type_name_, data_type_, type_name_)) {
        return true;
    }

    // Container compatibility (element/key types must match)
    if (is_container_compatible(data_type_, type_name_, other.data_type_, other.type_name_)) {
        return true;
    }

    if (is_container_compatible(other.data_type_, other.type_name_, data_type_, type_name_)) {
        return true;
    }

    // User-defined types must have matching identifiers
    if (is_user_defined_compatible(data_type_, type_name_, other.data_type_, other.type_name_)) {
        return true;
    }

    if (is_user_defined_compatible(other.data_type_, other.type_name_, data_type_, type_name_)) {
        return true;
    }

    // Numeric promotions (integral widening, integral -> floating, float -> double)
    if (is_numeric_widening(data_type_, other.data_type_) ||
        is_integral_to_floating(data_type_, other.data_type_) ||
        is_float_promotion(data_type_, other.data_type_)) {
        return true;
    }

    // Allow float interchange (Float <-> Double)
    if (is_floating_point(data_type_) && is_floating_point(other.data_type_)) {
        return true;
    }

    // String-like conversions (String <-> StringView and any type -> string)
    if (is_string_like(data_type_) && is_string_like(other.data_type_)) {
        return true;
    }

    if (is_string_like(other.data_type_)) {
        return true;
    }

    // Numeric to bool conversions are allowed only towards bool targets
    if (other.data_type_ == DataType::Bool && is_numeric(data_type_)) {
        return true;
    }

    // No compatible conversion found
    return false;
}

}  // namespace visprog::core
