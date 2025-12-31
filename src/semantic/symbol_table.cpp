#include "symbol_table.h"

namespace circuitsim {

bool SymbolTable::addSymbol(const Symbol& symbol) {
    if (hasSymbol(symbol.name)) {
        return false;
    }
    symbols_.emplace(symbol.name, symbol);
    return true;
}

bool SymbolTable::addICTemplate(const ICTemplate& ic) {
    if (hasICTemplate(ic.name)) {
        return false;
    }
    icTemplates_.emplace(ic.name, ic);
    return true;
}

std::optional<Symbol> SymbolTable::lookupSymbol(const std::string& name) const {
    auto it = symbols_.find(name);
    if (it != symbols_.end()) {
        return it->second;
    }
    return std::nullopt;
}

std::optional<ICTemplate> SymbolTable::lookupICTemplate(const std::string& name) const {
    auto it = icTemplates_.find(name);
    if (it != icTemplates_.end()) {
        return it->second;
    }
    return std::nullopt;
}

bool SymbolTable::hasSymbol(const std::string& name) const {
    return symbols_.find(name) != symbols_.end();
}

bool SymbolTable::hasICTemplate(const std::string& name) const {
    return icTemplates_.find(name) != icTemplates_.end();
}

} // namespace circuitsim
