#ifndef CIRCUITSIM_SYMBOL_TABLE_H
#define CIRCUITSIM_SYMBOL_TABLE_H

#include "../lexer/token.h"
#include <string>
#include <unordered_map>
#include <vector>
#include <optional>

namespace circuitsim {

enum class SymbolKind {
    COMPONENT,
    BOARD,
    CUSTOM_IC
};

struct PinInfo {
    std::string name;
    std::string type; // "input", "output", "gnd", "vcc"
    int number;
};

struct Symbol {
    std::string name;
    SymbolKind kind;
    std::string typeId;      // "7408", "breadboard_830", or custom IC name
    SourceLocation location;
    std::vector<PinInfo> pins;
    
    Symbol(const std::string& n, SymbolKind k, const std::string& t, SourceLocation loc)
        : name(n), kind(k), typeId(t), location(loc) {}
};

struct ICTemplate {
    std::string name;
    std::vector<PinInfo> pins;
    int pinCount;
    SourceLocation location;
    
    ICTemplate(const std::string& n, SourceLocation loc)
        : name(n), pinCount(0), location(loc) {}
};

class SymbolTable {
public:
    bool addSymbol(const Symbol& symbol);
    bool addICTemplate(const ICTemplate& ic);
    
    std::optional<Symbol> lookupSymbol(const std::string& name) const;
    std::optional<ICTemplate> lookupICTemplate(const std::string& name) const;
    
    bool hasSymbol(const std::string& name) const;
    bool hasICTemplate(const std::string& name) const;
    
    const std::unordered_map<std::string, Symbol>& getSymbols() const { return symbols_; }
    const std::unordered_map<std::string, ICTemplate>& getICTemplates() const { return icTemplates_; }

private:
    std::unordered_map<std::string, Symbol> symbols_;
    std::unordered_map<std::string, ICTemplate> icTemplates_;
};

} // namespace circuitsim

#endif // CIRCUITSIM_SYMBOL_TABLE_H
