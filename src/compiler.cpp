#include "compiler.h"

namespace circuitsim {

CompileResult Compiler::compile(const std::string& source) {
    CompileResult result;
    result.success = false;
    
    ErrorReporter errorReporter;
    
    // Lexer phase
    Lexer lexer(source);
    lexer.setErrorCallback([&errorReporter](const std::string& msg, SourceLocation loc) {
        errorReporter.report("lexer", msg, loc);
    });
    
    std::vector<Token> tokens = lexer.tokenize();
    
    if (errorReporter.hasErrors()) {
        result.errors = errorReporter.formatErrors();
        return result;
    }
    
    // Parser phase
    Parser parser(tokens, errorReporter);
    auto program = parser.parse();
    
    if (errorReporter.hasErrors()) {
        result.errors = errorReporter.formatErrors();
        return result;
    }
    
    // Semantic analysis phase
    SemanticAnalyzer analyzer(errorReporter);
    bool valid = analyzer.analyze(*program);
    
    if (!valid) {
        result.errors = errorReporter.formatErrors();
        return result;
    }
    
    // IR generation phase
    IRGenerator irGen(analyzer.getSymbolTable(), errorReporter);
    CircuitIR ir = irGen.generate(*program, analyzer.getComponentBoards());
    
    result.success = true;
    result.json = ir.toJSON();
    
    return result;
}

} // namespace circuitsim
