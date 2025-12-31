#ifndef CIRCUITSIM_COMPILER_H
#define CIRCUITSIM_COMPILER_H

#include <string>
#include "lexer/lexer.h"
#include "parser/parser.h"
#include "semantic/analyzer.h"
#include "ir/ir_generator.h"
#include "error/error_reporter.h"

namespace circuitsim {

struct CompileResult {
    bool success;
    std::string json;
    std::string errors;
};

class Compiler {
public:
    CompileResult compile(const std::string& source);
};

} // namespace circuitsim

#endif // CIRCUITSIM_COMPILER_H
