cmake_minimum_required(VERSION 3.25)
project(MultiCode 
    VERSION 0.1.0
    DESCRIPTION "Visual Programming Plugin for VS Code"
    LANGUAGES CXX
)

# ============================================================================
# Project Settings
# ============================================================================

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Export compile commands for clangd/clang-tidy
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# ============================================================================
# Compiler Flags (Modern C++ Best Practices)
# ============================================================================

if(MSVC)
    add_compile_options(
        /W4         # Warning level 4
        /WX         # Warnings as errors
        /permissive-  # Standards conformance
        /Zc:__cplusplus  # Enable __cplusplus macro
        /utf-8      # Treat source files as UTF-8
    )
else()
    add_compile_options(
        -Wall -Wextra -Wpedantic -Werror
        -Wconversion -Wsign-conversion
        -Wnon-virtual-dtor -Woverloaded-virtual
        -Wold-style-cast -Wcast-align
        -Wshadow -Wnull-dereference
        -Wdouble-promotion
    )
endif()

# ============================================================================
# Dependencies (vcpkg or find_package)
# ============================================================================

# JSON library
find_package(nlohmann_json 3.11 QUIET)
if(NOT nlohmann_json_FOUND)
    message(WARNING "nlohmann_json not found - using header-only fallback")
endif()

# Logging library
find_package(spdlog 1.12 QUIET)
if(NOT spdlog_FOUND)
    message(WARNING "spdlog not found - using header-only fallback")
endif()

# Testing framework
find_package(Catch2 3 CONFIG QUIET)

# If not found, try external/Catch2
if(NOT Catch2_FOUND AND EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/external/CMakeLists.txt")
    message(STATUS "Using local Catch2 from external/")
    add_subdirectory(external)
    set(Catch2_FOUND TRUE)
endif()

if(NOT Catch2_FOUND)
    include(FetchContent)
    set(CATCH_BUILD_TESTING OFF CACHE BOOL "" FORCE)
    set(CATCH_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
    set(CATCH_INSTALL_DOCS OFF CACHE BOOL "" FORCE)
    set(CATCH_INSTALL_HELPERS OFF CACHE BOOL "" FORCE)
    set(CATCH_ENABLE_WERROR OFF CACHE BOOL "" FORCE)
    FetchContent_Declare(
        Catch2Fetch
        GIT_REPOSITORY https://github.com/catchorg/Catch2.git
        GIT_TAG v3.7.0
    )
    FetchContent_MakeAvailable(Catch2Fetch)
    set(Catch2_FOUND TRUE)
endif()

if(TARGET Catch2)
    target_compile_options(Catch2 PRIVATE
        $<$<NOT:$<CXX_COMPILER_ID:MSVC>>:-Wno-error>
        $<$<NOT:$<CXX_COMPILER_ID:MSVC>>:-Wno-error=conversion>
    )
endif()

if(TARGET Catch2WithMain)
    target_compile_options(Catch2WithMain PRIVATE
        $<$<NOT:$<CXX_COMPILER_ID:MSVC>>:-Wno-error>
        $<$<NOT:$<CXX_COMPILER_ID:MSVC>>:-Wno-error=conversion>
    )
endif()

# ============================================================================
# Core Library (C++)
# ============================================================================

add_library(multicode_core STATIC
    # Core
    src/core/Types.cpp
    src/core/Port.cpp
    src/core/Node.cpp
    src/core/NodeFactory.cpp
    src/core/Graph.cpp
    src/core/GraphSerializer.cpp

    # Generators
    # TODO: CppCodeGenerator требует рефакторинга - временно отключен
    # src/generators/CppCodeGenerator.cpp
)

target_include_directories(multicode_core
    PUBLIC 
        $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
        $<INSTALL_INTERFACE:include>
    PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/src
)

target_link_libraries(multicode_core
    PUBLIC
        $<$<TARGET_EXISTS:nlohmann_json::nlohmann_json>:nlohmann_json::nlohmann_json>
        $<$<TARGET_EXISTS:spdlog::spdlog>:spdlog::spdlog>
)

if(NOT nlohmann_json_FOUND)
    target_include_directories(multicode_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/third_party)
endif()

# Compiler features
target_compile_features(multicode_core PUBLIC cxx_std_20)

# ============================================================================
# Tests (Catch2)
# ============================================================================

if(Catch2_FOUND)
    enable_testing()
    
    add_executable(multicode_tests
        tests/test_main.cpp
        tests/core/test_node.cpp
        tests/core/test_port.cpp
        tests/core/test_graph_serializer.cpp
        # TODO: test_flow_control_nodes требует обновления API - временно отключен
        # tests/core/test_flow_control_nodes.cpp
        # TODO: test_cpp_code_generator требует рефакторинга CppCodeGenerator - временно отключен
        # tests/generators/test_cpp_code_generator.cpp
    )
    
    target_link_libraries(multicode_tests
        PRIVATE 
            multicode_core
            Catch2::Catch2WithMain
    )
    
    # Disable warnings-as-errors for tests (C4834 nodiscard warnings are intentional in tests)
    if(MSVC)
        target_compile_options(multicode_tests PRIVATE /WX-)
    endif()
    
    # Register tests manually (catch_discover_tests runs at configure time)
    add_test(NAME multicode_tests COMMAND multicode_tests)
    
    # Code coverage (optional)
    if(CMAKE_BUILD_TYPE STREQUAL "Coverage")
        target_compile_options(multicode_tests PRIVATE --coverage)
        target_link_options(multicode_tests PRIVATE --coverage)
    endif()
    
endif()

# ============================================================================
# Installation
# ============================================================================

include(GNUInstallDirs)

install(TARGETS multicode_core
    EXPORT MultiCodeTargets
    LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
    ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR}
    RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
)

install(DIRECTORY include/visprog
    DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}
)

# ============================================================================
# Documentation (Doxygen - optional)
# ============================================================================

option(BUILD_DOCS "Build documentation" OFF)

if(BUILD_DOCS)
    find_package(Doxygen)
    if(DOXYGEN_FOUND)
        doxygen_add_docs(docs
            ${CMAKE_CURRENT_SOURCE_DIR}/include
            ${CMAKE_CURRENT_SOURCE_DIR}/src
            COMMENT "Generating API documentation with Doxygen"
        )
    endif()
endif()

# ============================================================================
# Summary
# ============================================================================

message(STATUS "==================================================")
message(STATUS "МультиКод Configuration Summary")
message(STATUS "==================================================")
message(STATUS "Version:        ${PROJECT_VERSION}")
message(STATUS "C++ Standard:   C++${CMAKE_CXX_STANDARD}")
message(STATUS "Build Type:     ${CMAKE_BUILD_TYPE}")
message(STATUS "Compiler:       ${CMAKE_CXX_COMPILER_ID} ${CMAKE_CXX_COMPILER_VERSION}")
message(STATUS "Tests:          ${Catch2_FOUND}")
message(STATUS "==================================================")
