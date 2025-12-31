cmake_minimum_required(VERSION 3.16)
project(CircuitSim VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Source files
set(SOURCES
    src/main.cpp
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

# Main executable
add_executable(circuitsim ${SOURCES} ${HEADERS})
target_include_directories(circuitsim PRIVATE ${CMAKE_SOURCE_DIR}/src)

# Compiler warnings
if(MSVC)
    target_compile_options(circuitsim PRIVATE /W4)
else()
    target_compile_options(circuitsim PRIVATE -Wall -Wextra -Wpedantic)
endif()

# Test executable (optional, for development)
option(BUILD_TESTS "Build tests" OFF)
if(BUILD_TESTS)
    enable_testing()
    # Add test targets here later
endif()
