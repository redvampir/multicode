// Copyright (c) 2025 МультиКод Team. MIT License.

#include <catch2/catch_all.hpp>

#include "visprog/core/Port.hpp"

using namespace visprog::core;

// ============================================================================
// Port Construction Tests
// ============================================================================

TEST_CASE("Port: Basic construction", "[port]") {
    Port port(PortId{42}, PortDirection::Input, DataType::Int32, "x");

    REQUIRE(port.get_id() == PortId{42});
    REQUIRE(port.get_direction() == PortDirection::Input);
    REQUIRE(port.get_data_type() == DataType::Int32);
    REQUIRE(port.get_name() == "x");
}

TEST_CASE("Port: Execution port", "[port]") {
    Port exec_port(PortId{1}, PortDirection::Output, DataType::Execution, "exec");

    REQUIRE(exec_port.is_execution());
    REQUIRE(exec_port.get_data_type() == DataType::Execution);
}

TEST_CASE("Port: Data port", "[port]") {
    Port data_port(PortId{1}, PortDirection::Input, DataType::Float, "value");

    REQUIRE(!data_port.is_execution());
    REQUIRE(data_port.get_data_type() == DataType::Float);
}

// ============================================================================
// Type Compatibility Tests
// ============================================================================

TEST_CASE("Port: Identical types can connect", "[port][compatibility]") {
    Port out(PortId{1}, PortDirection::Output, DataType::Int32, "out");
    Port in(PortId{2}, PortDirection::Input, DataType::Int32, "in");

    REQUIRE(out.can_connect_to(in));
}

TEST_CASE("Port: Implicit conversions", "[port][compatibility]") {
    SECTION("Int32 -> Int64") {
        Port out(PortId{1}, PortDirection::Output, DataType::Int32, "out");
        Port in(PortId{2}, PortDirection::Input, DataType::Int64, "in");

        REQUIRE(out.can_connect_to(in));
    }

    SECTION("Float -> Double") {
        Port out(PortId{1}, PortDirection::Output, DataType::Float, "out");
        Port in(PortId{2}, PortDirection::Input, DataType::Double, "in");

        REQUIRE(out.can_connect_to(in));
    }

    SECTION("Int32 -> Float (promotion)") {
        Port out(PortId{1}, PortDirection::Output, DataType::Int32, "out");
        Port in(PortId{2}, PortDirection::Input, DataType::Float, "in");

        REQUIRE(out.can_connect_to(in));
    }

    SECTION("Any type to String (to_string conversion)") {
        Port int_out(PortId{1}, PortDirection::Output, DataType::Int32, "out");
        Port str_in(PortId{2}, PortDirection::Input, DataType::String, "in");

        REQUIRE(int_out.can_connect_to(str_in));
    }
}

TEST_CASE("Port: Incompatible types cannot connect", "[port][compatibility]") {
    SECTION("Int64 -> Int32 (narrowing)") {
        Port out(PortId{1}, PortDirection::Output, DataType::Int64, "out");
        Port in(PortId{2}, PortDirection::Input, DataType::Int32, "in");

        REQUIRE(!out.can_connect_to(in));
    }

    SECTION("Float -> Int32 (precision loss)") {
        Port out(PortId{1}, PortDirection::Output, DataType::Float, "out");
        Port in(PortId{2}, PortDirection::Input, DataType::Int32, "in");

        REQUIRE(!out.can_connect_to(in));
    }

    SECTION("String -> Int32 (no implicit conversion)") {
        Port out(PortId{1}, PortDirection::Output, DataType::String, "out");
        Port in(PortId{2}, PortDirection::Input, DataType::Int32, "in");

        REQUIRE(!out.can_connect_to(in));
    }
}

TEST_CASE("Port: Any type compatibility", "[port][compatibility]") {
    Port any_in(PortId{1}, PortDirection::Input, DataType::Any, "any");
    Port int_out(PortId{2}, PortDirection::Output, DataType::Int32, "int");
    Port str_out(PortId{3}, PortDirection::Output, DataType::String, "str");

    // Any can accept any type
    REQUIRE(int_out.can_connect_to(any_in));
    REQUIRE(str_out.can_connect_to(any_in));
}

TEST_CASE("Port: Execution port compatibility", "[port][compatibility]") {
    Port exec_out(PortId{1}, PortDirection::Output, DataType::Execution, "exec_out");
    Port exec_in(PortId{2}, PortDirection::Input, DataType::Execution, "exec_in");
    Port data_in(PortId{3}, PortDirection::Input, DataType::Int32, "data");

    // Execution ports can only connect to execution ports
    REQUIRE(exec_out.can_connect_to(exec_in));
    REQUIRE(!exec_out.can_connect_to(data_in));
}

TEST_CASE("Port: Direction validation", "[port][compatibility]") {
    Port out1(PortId{1}, PortDirection::Output, DataType::Int32, "out1");
    Port out2(PortId{2}, PortDirection::Output, DataType::Int32, "out2");
    Port in1(PortId{3}, PortDirection::Input, DataType::Int32, "in1");

    // Output -> Input: OK
    REQUIRE(out1.can_connect_to(in1));

    // Output -> Output: NOT OK
    REQUIRE(!out1.can_connect_to(out2));

    // Input -> Input: NOT OK
    REQUIRE(!in1.can_connect_to(in1));
}

// ============================================================================
// Complex Type Tests
// ============================================================================

TEST_CASE("Port: Array type", "[port][types]") {
    Port arr_out(PortId{1}, PortDirection::Output, DataType::Array, "arr");
    Port arr_in(PortId{2}, PortDirection::Input, DataType::Array, "in");

    REQUIRE(arr_out.can_connect_to(arr_in));
}

TEST_CASE("Port: Pointer types", "[port][types]") {
    Port ptr_out(PortId{1}, PortDirection::Output, DataType::Pointer, "ptr");
    Port ptr_in(PortId{2}, PortDirection::Input, DataType::Pointer, "in");

    // Pointers should be compatible
    REQUIRE(ptr_out.can_connect_to(ptr_in));
}

// ============================================================================
// Edge Cases
// ============================================================================

TEST_CASE("Port: Empty name", "[port][edge]") {
    Port port(PortId{1}, PortDirection::Input, DataType::Int32, "");

    REQUIRE(port.get_name().empty());
}

#ifdef VISPROG_ENABLE_PORT_DISPLAY_NAME_TEST
TEST_CASE("Port: Display name", "[port]") {
    Port port(PortId{1}, PortDirection::Input, DataType::Int32, "value");

    REQUIRE(port.get_name() == "value");
}
#endif  // VISPROG_ENABLE_PORT_DISPLAY_NAME_TEST
