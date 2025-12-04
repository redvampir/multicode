// Copyright (c) 2025 МультиКод Team. MIT License.

#pragma once

#include <nlohmann/json.hpp>
#include <string_view>

#include "visprog/core/Graph.hpp"

namespace visprog::core {

/// \brief Сериализация и десериализация графа в JSON-формат.
class GraphSerializer {
public:
    inline static constexpr std::string_view kSchemaVersion = "1.0.0";
    inline static constexpr std::string_view kSchemaCoreMin = "0.1.0-alpha";
    inline static constexpr std::string_view kSchemaCoreMax = "0.1.x";

    GraphSerializer() = delete;

    /// \brief Представить граф в JSON-структуре для UI и snapshot-тестов.
    [[nodiscard]] static auto to_json(const Graph& graph) -> nlohmann::json;

    /// \brief Собрать граф из JSON, выполняя строгую валидацию данных.
    [[nodiscard]] static auto from_json(const nlohmann::json& document) -> Result<Graph>;
};

}  // namespace visprog::core
