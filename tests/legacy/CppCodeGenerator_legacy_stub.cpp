// Copyright (c) 2025 МультиКод Team. MIT License.

#include "visprog/generators/CppCodeGenerator.hpp"

namespace visprog::generators {

auto CppCodeGenerator::generate(const core::Graph&) -> core::Result<std::string> {
    return core::Result<std::string>{
        core::Error{"Legacy codegen tests are disabled until CppCodeGenerator API is restored."}};
}

}  // namespace visprog::generators
