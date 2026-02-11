// Copyright (c) 2025 МультиКод Team. MIT License.

#pragma once

namespace visprog::core::error_codes {

// Цель: единый реестр кодов ошибок C++ ядра.
// Инварианты: значения стабильны для тестов/диагностики; группы не пересекаются по смыслу.
// Риски: изменение значений ломает обратную совместимость тестов и внешних интеграций.
// Проверка: cmake --build build -j4 && ctest --test-dir build --output-on-failure

namespace graph_connection {
constexpr int NotFound = 200;
constexpr int NodeNotFound = 301;
constexpr int SourcePortNotFound = 302;
constexpr int TargetPortNotFound = 303;
constexpr int SelfReference = 304;
constexpr int TypeMismatch = 305;
constexpr int DuplicateConnection = 306;
}  // namespace graph_connection

namespace graph_validation {
constexpr int BrokenNodeReference = 510;
constexpr int BrokenPortReference = 511;
constexpr int LookupMismatch = 512;
constexpr int TypeMismatch = 513;
constexpr int AdjacencyMismatch = 514;
}  // namespace graph_validation

namespace serializer {
constexpr int InvalidDocument = 600;
constexpr int MissingField = 601;
constexpr int InvalidEnum = 602;
constexpr int InvalidPropertyValue = 603;
constexpr int InvalidTypeName = 604;
constexpr int InvalidConnection = 605;
constexpr int InvalidSchemaVersion = 606;
}  // namespace serializer

}  // namespace visprog::core::error_codes
