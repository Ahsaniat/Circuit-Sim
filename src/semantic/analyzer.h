#ifndef CIRCUITSIM_ANALYZER_H
#define CIRCUITSIM_ANALYZER_H

#include "symbol_table.h"
#include "../parser/ast.h"
#include "../error/error_reporter.h"
#include <set>

namespace circuitsim {

// Built-in IC definitions with pin counts
struct BuiltinIC {
    std::string name;
    int pinCount;
    std::vector<PinInfo> pins;
};

class SemanticAnalyzer {
public:
    SemanticAnalyzer(ErrorReporter& errorReporter);
    
    bool analyze(const ProgramNode& program);
    const SymbolTable& getSymbolTable() const { return symbolTable_; }
    const std::unordered_map<std::string, std::string>& getComponentBoards() const { return componentBoards_; }

private:
    ErrorReporter& errorReporter_;
    SymbolTable symbolTable_;
    std::unordered_map<std::string, BuiltinIC> builtinICs_;
    
    // Track used pins per component for conflict detection
    std::unordered_map<std::string, std::set<int>> usedPins_;
    
    // Component-to-board assignment from `place` statements and scoped maps
    std::unordered_map<std::string, std::string> componentBoards_;
    std::unordered_map<std::string, std::string> assignmentOrigin_; // "place" | "map"
    
    void initBuiltinICs();
    
    void analyzeCompDecl(const CompDeclNode& node);
    void analyzeBoardDecl(const BoardDeclNode& node);
    void analyzeICDef(const ICDefNode& node);
    void analyzeMapBlock(const MapBlockNode& node);
    void analyzePlaceStatement(const PlaceNode& node);
    void analyzeConnection(const ConnectionNode& node);
    void analyzePinRef(const PinRefNode& node, bool isSource);
    
    bool isValidPinNumber(const std::string& componentId, int pin);
    int getPinCount(const std::string& typeId);
    
    void reportError(const std::string& message, SourceLocation loc);
};

} // namespace circuitsim

#endif // CIRCUITSIM_ANALYZER_H
