cmake_minimum_required(VERSION 3.16)
project(CircuitSim VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Core compiler sources (everything except the CLI entry point)
set(CORE_SOURCES
    src/compiler.cpp
    src/lexer/lexer.cpp
    src/parser/parser.cpp
    src/semantic/symbol_table.cpp
    src/semantic/analyzer.cpp
    src/ir/circuit_ir.cpp
    src/ir/ir_generator.cpp
    src/error/error_reporter.cpp
)

# Headers
set(HEADERS
    src/compiler.h
    src/lexer/lexer.h
    src/lexer/token.h
    src/parser/parser.h
    src/parser/ast.h
    src/semantic/symbol_table.h
    src/semantic/analyzer.h
    src/ir/circuit_ir.h
    src/ir/ir_generator.h
    src/error/error_reporter.h
)

add_library(circuitsim_core STATIC ${CORE_SOURCES} ${HEADERS})
target_include_directories(circuitsim_core PUBLIC ${CMAKE_SOURCE_DIR}/src)

# Main executable
add_executable(circuitsim src/main.cpp)
target_link_libraries(circuitsim PRIVATE circuitsim_core)

# Compiler warnings
if(MSVC)
    target_compile_options(circuitsim_core PRIVATE /W4)
    target_compile_options(circuitsim PRIVATE /W4)
else()
    target_compile_options(circuitsim_core PRIVATE -Wall -Wextra -Wpedantic)
    target_compile_options(circuitsim PRIVATE -Wall -Wextra -Wpedantic)
endif()

# Tests
option(BUILD_TESTS "Build tests" OFF)
if(BUILD_TESTS)
    enable_testing()
    add_executable(circuitsim_tests tests/cpp/compiler_tests.cpp)
    target_link_libraries(circuitsim_tests PRIVATE circuitsim_core)
    if(NOT MSVC)
        target_compile_options(circuitsim_tests PRIVATE -Wall -Wextra -Wpedantic)
    endif()
    add_test(NAME compiler_tests COMMAND circuitsim_tests)
endif()
