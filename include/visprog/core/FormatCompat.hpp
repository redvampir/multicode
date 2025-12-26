// Copyright (c) 2025 МультиКод Team. MIT License.
// Compatibility layer for std::format (C++20) on older compilers (GCC < 13)

#pragma once

#include <sstream>
#include <string>
#include <string_view>

namespace visprog::core::compat {

/// Simple string concatenation helper for GCC 11/12 compatibility
/// Usage: format("Node ", id, " does not exist") instead of std::format("Node {} does not exist",
/// id)

template <typename... Args>
[[nodiscard]] auto format(Args&&... args) -> std::string {
    std::ostringstream oss;
    (oss << ... << std::forward<Args>(args));
    return oss.str();
}

}  // namespace visprog::core::compat
