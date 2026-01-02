// Copyright (c) 2025 МультиКод Team. MIT License.

#pragma once

#include "visprog/core/Graph.hpp"
#include "visprog/core/Types.hpp"

#include <string>

namespace visprog::core {

/**
 * @brief Interface for all code generators.
 *
 * Defines a contract for transforming a visual programming graph into source
 * code for a specific language.
 */
class ICodeGenerator {
public:
    virtual ~ICodeGenerator() = default;

    /**
     * @brief Generates source code from a graph.
     * @param graph The graph to process.
     * @return A Result containing the generated code as a string, or an Error.
     */
    [[nodiscard]] virtual auto generate(const Graph& graph) -> Result<std::string> = 0;
};

}  // namespace visprog::core
