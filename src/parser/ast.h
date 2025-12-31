#ifndef CIRCUITSIM_AST_H
#define CIRCUITSIM_AST_H

#include "../lexer/token.h"
#include <string>
#include <vector>
#include <memory>

namespace circuitsim {

// Forward declarations
struct ASTNode;
struct ProgramNode;
struct CompDeclNode;
struct BoardDeclNode;
struct ICDefNode;
struct MapBlockNode;
struct PinDeclNode;
struct ConnectionNode;
struct PinRefNode;

enum class ASTNodeType {
    PROGRAM,
    COMP_DECL,
    BOARD_DECL,
    IC_DEF,
    MAP_BLOCK,
    PIN_DECL,
    CONNECTION,
    PIN_REF
};

struct ASTNode {
    ASTNodeType type;
    SourceLocation location;
    
    ASTNode(ASTNodeType t, SourceLocation loc) : type(t), location(loc) {}
    virtual ~ASTNode() = default;
};

// Pin reference: A1 pin 3
struct PinRefNode : ASTNode {
    std::string componentId;
    int pinNumber;
    
    PinRefNode(const std::string& comp, int pin, SourceLocation loc)
        : ASTNode(ASTNodeType::PIN_REF, loc)
        , componentId(comp)
        , pinNumber(pin) {}
};

// Connection: (A1 pin 3 -> O1 pin 1, X1 pin 2)
struct ConnectionNode : ASTNode {
    std::unique_ptr<PinRefNode> source;
    std::vector<std::unique_ptr<PinRefNode>> destinations;
    
    ConnectionNode(SourceLocation loc)
        : ASTNode(ASTNodeType::CONNECTION, loc) {}
};

// Pin declaration in IC def: pin1 -> input
struct PinDeclNode : ASTNode {
    std::string pinName;
    std::string pinType; // "input", "output", "gnd", "vcc"
    
    PinDeclNode(const std::string& name, const std::string& type, SourceLocation loc)
        : ASTNode(ASTNodeType::PIN_DECL, loc)
        , pinName(name)
        , pinType(type) {}
};

// Component declaration: @comp A1 7408
struct CompDeclNode : ASTNode {
    std::string identifier;
    std::string componentType;
    
    CompDeclNode(const std::string& id, const std::string& type, SourceLocation loc)
        : ASTNode(ASTNodeType::COMP_DECL, loc)
        , identifier(id)
        , componentType(type) {}
};

// Board declaration: @board B1 breadboard_830
struct BoardDeclNode : ASTNode {
    std::string identifier;
    std::string boardType;
    
    BoardDeclNode(const std::string& id, const std::string& type, SourceLocation loc)
        : ASTNode(ASTNodeType::BOARD_DECL, loc)
        , identifier(id)
        , boardType(type) {}
};

// IC definition: def IC_NAME (pin1->input, pin2->output)
struct ICDefNode : ASTNode {
    std::string name;
    std::vector<std::unique_ptr<PinDeclNode>> pins;
    
    ICDefNode(const std::string& n, SourceLocation loc)
        : ASTNode(ASTNodeType::IC_DEF, loc)
        , name(n) {}
};

// Map block: map (...)
struct MapBlockNode : ASTNode {
    std::vector<std::unique_ptr<ConnectionNode>> connections;
    
    MapBlockNode(SourceLocation loc)
        : ASTNode(ASTNodeType::MAP_BLOCK, loc) {}
};

// Root program node
struct ProgramNode : ASTNode {
    std::vector<std::unique_ptr<CompDeclNode>> components;
    std::vector<std::unique_ptr<BoardDeclNode>> boards;
    std::vector<std::unique_ptr<ICDefNode>> icDefinitions;
    std::unique_ptr<MapBlockNode> mapBlock;
    
    ProgramNode(SourceLocation loc)
        : ASTNode(ASTNodeType::PROGRAM, loc) {}
};

} // namespace circuitsim

#endif // CIRCUITSIM_AST_H
