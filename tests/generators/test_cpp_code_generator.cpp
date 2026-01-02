#include <catch2/catch_test_macros.hpp>
#include "visprog/generators/CppCodeGenerator.hpp"
#include "visprog/core/Graph.hpp"

using namespace visprog::core;
using namespace visprog::generators;

TEST_CASE("CppCodeGenerator", "[generators]") {
    CppCodeGenerator generator;
    Graph graph;

    SECTION("Generate basic code from an empty graph") {
        auto result = generator.generate(graph);
        REQUIRE(result.has_value());

        auto code = result.value();
        REQUIRE(!code.empty());
        REQUIRE(code.find("Hello from generated code!") != std::string::npos);
    }
}
