#ifndef CIRCUITSIM_IR_GENERATOR_H
#define CIRCUITSIM_IR_GENERATOR_H

#include "circuit_ir.h"
#include "../parser/ast.h"
#include "../semantic/symbol_table.h"
#include "../error/error_reporter.h"
#include <unordered_map>

namespace circuitsim {

struct ICLayout {
    int pinCount;
    float width;
    float height;
    float pinSpacing;
};

struct BoardLayout {
    int rows;
    int columns;
    float width;
    float height;
    float holeSpacing;
};

class IRGenerator {
public:
    IRGenerator(const SymbolTable& symbolTable, ErrorReporter& errorReporter);
    
    CircuitIR generate(const ProgramNode& program);

private:
    const SymbolTable& symbolTable_;
    ErrorReporter& errorReporter_;
    
    std::unordered_map<std::string, ICLayout> icLayouts_;
    std::unordered_map<std::string, BoardLayout> boardLayouts_;
    std::unordered_map<std::string, Position> componentPositions_;
    
    void initLayouts();
    
    ComponentIR generateComponent(const CompDeclNode& node);
    BoardIR generateBoard(const BoardDeclNode& node);
    std::vector<Wire> generateWires(const MapBlockNode& mapBlock);
    
    void layoutComponents(CircuitIR& ir);
    Position getPinPosition(const std::string& componentId, int pinNumber);
    
    ICLayout getICLayout(const std::string& type);
    BoardLayout getBoardLayout(const std::string& type);
};

} // namespace circuitsim

#endif // CIRCUITSIM_IR_GENERATOR_H
