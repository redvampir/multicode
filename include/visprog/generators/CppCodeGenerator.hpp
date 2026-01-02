// Copyright (c) 2025 МультиКод Team. MIT License.

#pragma once

#include "visprog/core/ICodeGenerator.hpp"

namespace visprog::generators {

/**
 * @brief C++ Code Generator.
 *
 * Implements the ICodeGenerator interface to produce C++20 source code.
 */
class CppCodeGenerator : public core::ICodeGenerator {
public:
    [[nodiscard]] auto generate(const core::Graph& graph) -> core::Result<std::string> override;
};

}  // namespace visprog::generators
