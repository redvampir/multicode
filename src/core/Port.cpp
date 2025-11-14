// Copyright (c) 2025 МультиКод Team. MIT License.

#include "visprog/core/Port.hpp"

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
    
    // Exact type match
    if (data_type_ == other.data_type_) {
        // For user-defined types, check type names
        if (data_type_ == DataType::Class || 
            data_type_ == DataType::Struct ||
            data_type_ == DataType::Enum) {
            return type_name_ == other.type_name_;
        }
        return true;
    }
    
    // Implicit conversions (simplified for now)
    // TODO: Implement full type conversion rules
    
    // Integer to Float promotion (Int32 → Float/Double)
    const bool int_to_float =
        (data_type_ >= DataType::Int8 && data_type_ <= DataType::UInt64) &&
        (other.data_type_ == DataType::Float || other.data_type_ == DataType::Double);
    
    if (int_to_float) {
        return true;
    }
    
    // Float to Double promotion
    if (data_type_ == DataType::Float && other.data_type_ == DataType::Double) {
        return true;
    }
    
    // Integer widening (Int32 → Int64, but NOT Int64 → Int32)
    const bool is_int_widening = 
        (data_type_ == DataType::Int8 && other.data_type_ == DataType::Int16) ||
        (data_type_ == DataType::Int8 && other.data_type_ == DataType::Int32) ||
        (data_type_ == DataType::Int8 && other.data_type_ == DataType::Int64) ||
        (data_type_ == DataType::Int16 && other.data_type_ == DataType::Int32) ||
        (data_type_ == DataType::Int16 && other.data_type_ == DataType::Int64) ||
        (data_type_ == DataType::Int32 && other.data_type_ == DataType::Int64) ||
        (data_type_ == DataType::UInt8 && other.data_type_ == DataType::UInt16) ||
        (data_type_ == DataType::UInt8 && other.data_type_ == DataType::UInt32) ||
        (data_type_ == DataType::UInt8 && other.data_type_ == DataType::UInt64) ||
        (data_type_ == DataType::UInt16 && other.data_type_ == DataType::UInt32) ||
        (data_type_ == DataType::UInt16 && other.data_type_ == DataType::UInt64) ||
        (data_type_ == DataType::UInt32 && other.data_type_ == DataType::UInt64);
    
    if (is_int_widening) {
        return true;
    }
    
    // Any type to String conversion (to_string-like conversion)
    if (other.data_type_ == DataType::String || other.data_type_ == DataType::StringView) {
        return true;  // Any type can be converted to string
    }
    
    // Float conversions (Float ↔ Double)
    const bool both_floats = 
        (data_type_ == DataType::Float || data_type_ == DataType::Double) &&
        (other.data_type_ == DataType::Float || other.data_type_ == DataType::Double);
    
    if (both_floats) {
        return true;
    }
    
    // Pointer/Reference conversions
    if (data_type_ == DataType::Pointer && other.data_type_ == DataType::Reference) {
        return true;
    }
    
    if (data_type_ == DataType::Reference && other.data_type_ == DataType::Pointer) {
        return true;
    }
    
    // String conversions
    if (data_type_ == DataType::String && other.data_type_ == DataType::StringView) {
        return true;
    }
    
    if (data_type_ == DataType::StringView && other.data_type_ == DataType::String) {
        return true;
    }
    
    // No compatible conversion found
    return false;
}

}  // namespace visprog::core
