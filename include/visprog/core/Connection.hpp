// Copyright (c) 2025 МультиКод Team. MIT License.

#pragma once

#include "visprog/core/Types.hpp"

namespace visprog::core {

/// @brief Connection represents a link between two ports
/// @details Immutable value type
struct Connection {
    ConnectionId id;      ///< Unique connection identifier
    NodeId from_node;     ///< Source node
    PortId from_port;     ///< Source port
    NodeId to_node;       ///< Target node
    PortId to_port;       ///< Target port
    ConnectionType type;  ///< Execution or Data flow

    /// @brief Three-way comparison operator
    [[nodiscard]] auto operator<=>(const Connection&) const noexcept = default;
};

}  // namespace visprog::core
