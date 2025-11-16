// Copyright (c) 2025 МультиКод Team. MIT License.

#include <catch2/catch_all.hpp>
#include <stdexcept>
#include <string>
#include <string_view>
#include <utility>

namespace {

template <typename Callable>
void ExpectInvalidArgumentContains(Callable&& callable, std::string_view expected_substring) {
    bool captured_exception = false;

    try {
        std::forward<Callable>(callable)();
    } catch (const std::invalid_argument& error) {
        captured_exception = true;

        const std::string_view message{error.what() != nullptr ? error.what() : ""};
        REQUIRE(message.find(expected_substring) != std::string_view::npos);
    }

    if (!captured_exception) {
        FAIL("ожидалось исключение std::invalid_argument");
    }
}

}  // namespace

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

    REQUIRE(arr_out.set_type_name("int"));
    REQUIRE(arr_in.set_type_name("int"));

    REQUIRE(arr_out.can_connect_to(arr_in));
}

TEST_CASE("Port: Pointer types", "[port][types]") {
    Port ptr_out(PortId{1}, PortDirection::Output, DataType::Pointer, "ptr");
    Port ptr_in(PortId{2}, PortDirection::Input, DataType::Pointer, "in");

    REQUIRE(ptr_out.set_type_name("int"));
    REQUIRE(ptr_in.set_type_name("int"));

    // Pointers should be compatible when element types match
    REQUIRE(ptr_out.can_connect_to(ptr_in));
}

TEST_CASE("Port: Custom type compatibility", "[port][types]") {
    Port class_out(PortId{10}, PortDirection::Output, DataType::Class, "class_out");
    Port class_in(PortId{11}, PortDirection::Input, DataType::Class, "class_in");
    Port other_class_in(PortId{12}, PortDirection::Input, DataType::Class, "class_other");

    REQUIRE(class_out.set_type_name("Game.Character"));
    REQUIRE(class_in.set_type_name("Game.Character"));
    REQUIRE(other_class_in.set_type_name("Game.Inventory"));

    REQUIRE(class_out.can_connect_to(class_in));
    REQUIRE_FALSE(class_out.can_connect_to(other_class_in));
}

TEST_CASE("Port: Pointer and reference interoperability", "[port][types]") {
    Port ptr_out(PortId{20}, PortDirection::Output, DataType::Pointer, "ptr_out");
    Port ref_in(PortId{21}, PortDirection::Input, DataType::Reference, "ref_in");
    Port generic_ptr_in(PortId{22}, PortDirection::Input, DataType::Pointer, "generic_in");

    REQUIRE(ptr_out.set_type_name("float"));
    REQUIRE(ref_in.set_type_name("float"));
    REQUIRE(generic_ptr_in.set_type_name("void"));

    REQUIRE(ptr_out.can_connect_to(ref_in));
    REQUIRE(ptr_out.can_connect_to(generic_ptr_in));
}

TEST_CASE("Port: Container element validation", "[port][types]") {
    Port vec_out(PortId{30}, PortDirection::Output, DataType::Vector, "vec_out");
    Port vec_in(PortId{31}, PortDirection::Input, DataType::Vector, "vec_in");
    Port vec_in_other(PortId{32}, PortDirection::Input, DataType::Vector, "vec_in_other");
    Port map_in(PortId{33}, PortDirection::Input, DataType::Map, "map_in");

    REQUIRE(vec_out.set_type_name("int"));
    REQUIRE(vec_in.set_type_name("int"));
    REQUIRE(vec_in_other.set_type_name("float"));
    REQUIRE(map_in.set_type_name("std::string,int"));

    REQUIRE(vec_out.can_connect_to(vec_in));
    REQUIRE_FALSE(vec_out.can_connect_to(vec_in_other));
    REQUIRE_FALSE(vec_out.can_connect_to(map_in));
}

TEST_CASE("Port: set_type_name validation", "[port][type_name]") {
    SECTION("Rejects primitive types") {
        Port data_port(PortId{40}, PortDirection::Input, DataType::Int32, "value");

        ExpectInvalidArgumentContains(
            [&]() { static_cast<void>(data_port.set_type_name("custom")); }, "does not support");
    }

    SECTION("Allows pointer universal markers") {
        Port ptr_port(PortId{41}, PortDirection::Output, DataType::Pointer, "ptr");

        REQUIRE(ptr_port.set_type_name("void"));
        REQUIRE(ptr_port.get_type_name() == "void");
    }

    SECTION("Rejects universal markers for containers") {
        Port vec_port(PortId{42}, PortDirection::Output, DataType::Vector, "vec");

        REQUIRE(vec_port.set_type_name("int"));
        REQUIRE(vec_port.get_type_name() == "int");

        ExpectInvalidArgumentContains([&]() { static_cast<void>(vec_port.set_type_name("void")); },
                                      "universal marker");
    }

    SECTION("Template accepts wildcard names") {
        Port templ_port(PortId{43}, PortDirection::Input, DataType::Template, "templ");

        REQUIRE(templ_port.set_type_name("auto"));
        REQUIRE(templ_port.get_type_name() == "auto");
    }
}

TEST_CASE("Port: Container type name normalization", "[port][types]") {
    SECTION("Map assignments ignore formatting") {
        Port map_out(PortId{40}, PortDirection::Output, DataType::Map, "map_out");
        Port map_in(PortId{41}, PortDirection::Input, DataType::Map, "map_in");

        REQUIRE(map_out.set_type_name("Key=std::string, Value=Vector<int>"));
        REQUIRE(map_in.set_type_name("value=vector< int >, key=STD::STRING"));

        REQUIRE(map_out.can_connect_to(map_in));
    }

    SECTION("Nested generics normalize recursively") {
        Port vector_out(PortId{42}, PortDirection::Output, DataType::Vector, "vector_out");
        Port vector_in(PortId{43}, PortDirection::Input, DataType::Vector, "vector_in");

        REQUIRE(vector_out.set_type_name("Map<std::string, Vector<Game.Item>>"));
        REQUIRE(vector_in.set_type_name("map < std::string , vector<game.item> >"));

        REQUIRE(vector_out.can_connect_to(vector_in));
    }
}

TEST_CASE("Port: Template placeholders", "[port][types]") {
    Port templ_out(PortId{40}, PortDirection::Output, DataType::Template, "templ_out");
    Port templ_in(PortId{41}, PortDirection::Input, DataType::Template, "templ_in");
    Port templ_in_other(PortId{42}, PortDirection::Input, DataType::Template, "templ_in_other");

    REQUIRE(templ_out.set_type_name("T"));
    REQUIRE(templ_in.set_type_name("T"));
    REQUIRE(templ_in_other.set_type_name("U"));

    REQUIRE(templ_out.can_connect_to(templ_in));
    REQUIRE_FALSE(templ_out.can_connect_to(templ_in_other));
}

TEST_CASE("Port: Void isolation", "[port][types]") {
    Port void_out(PortId{50}, PortDirection::Output, DataType::Void, "void_out");
    Port void_in(PortId{51}, PortDirection::Input, DataType::Void, "void_in");
    Port int_in(PortId{52}, PortDirection::Input, DataType::Int32, "int_in");

    REQUIRE(void_out.can_connect_to(void_in));
    REQUIRE_FALSE(void_out.can_connect_to(int_in));
}

// ============================================================================
// Edge Cases
// ============================================================================

TEST_CASE("Port: Empty name", "[port][edge]") {
    Port port(PortId{1}, PortDirection::Input, DataType::Int32, "");

    REQUIRE(port.get_name().empty());
}

#if defined(VISPROG_ENABLE_PORT_DISPLAY_NAME_TEST)
TEST_CASE("Port: Display name", "[port]") {
    Port port(PortId{1}, PortDirection::Input, DataType::Int32, "value");
    REQUIRE(port.get_name() == "value");
}
#endif  // VISPROG_ENABLE_PORT_DISPLAY_NAME_TEST
