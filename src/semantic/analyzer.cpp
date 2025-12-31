#include "analyzer.h"

namespace circuitsim {

SemanticAnalyzer::SemanticAnalyzer(ErrorReporter& errorReporter)
    : errorReporter_(errorReporter) {
    initBuiltinICs();
}

void SemanticAnalyzer::initBuiltinICs() {
    // 74xx series - common logic ICs (14-pin DIPs)
    builtinICs_["7400"] = {"7400", 14, {}}; // Quad 2-input NAND
    builtinICs_["7402"] = {"7402", 14, {}}; // Quad 2-input NOR
    builtinICs_["7404"] = {"7404", 14, {}}; // Hex inverter
    builtinICs_["7408"] = {"7408", 14, {}}; // Quad 2-input AND
    builtinICs_["7410"] = {"7410", 14, {}}; // Triple 3-input NAND
    builtinICs_["7420"] = {"7420", 14, {}}; // Dual 4-input NAND
    builtinICs_["7432"] = {"7432", 14, {}}; // Quad 2-input OR
    builtinICs_["7486"] = {"7486", 14, {}}; // Quad 2-input XOR
    
    // 74xx series - larger ICs
    builtinICs_["7447"] = {"7447", 16, {}}; // BCD to 7-segment decoder
    builtinICs_["7474"] = {"7474", 14, {}}; // Dual D flip-flop
    builtinICs_["7490"] = {"7490", 14, {}}; // Decade counter
    builtinICs_["74138"] = {"74138", 16, {}}; // 3-to-8 decoder
    builtinICs_["74139"] = {"74139", 16, {}}; // Dual 2-to-4 decoder
    builtinICs_["74151"] = {"74151", 16, {}}; // 8-to-1 multiplexer
    builtinICs_["74153"] = {"74153", 16, {}}; // Dual 4-to-1 multiplexer
    builtinICs_["74161"] = {"74161", 16, {}}; // 4-bit binary counter
    builtinICs_["74164"] = {"74164", 14, {}}; // 8-bit shift register
    builtinICs_["74173"] = {"74173", 16, {}}; // 4-bit D register
    builtinICs_["74181"] = {"74181", 24, {}}; // 4-bit ALU
    builtinICs_["74245"] = {"74245", 20, {}}; // Octal bus transceiver
    builtinICs_["74373"] = {"74373", 20, {}}; // Octal transparent latch
    builtinICs_["74374"] = {"74374", 20, {}}; // Octal D flip-flop
    
    // 555 timer
    builtinICs_["555"] = {"555", 8, {}};
    builtinICs_["NE555"] = {"NE555", 8, {}};
    
    // Op-amps
    builtinICs_["741"] = {"741", 8, {}};
    builtinICs_["LM741"] = {"LM741", 8, {}};
    builtinICs_["LM358"] = {"LM358", 8, {}};
    
    // Board types with "pin" counts (connection points)
    builtinICs_["breadboard_830"] = {"breadboard_830", 830, {}};
    builtinICs_["breadboard_400"] = {"breadboard_400", 400, {}};
    builtinICs_["breadboard_170"] = {"breadboard_170", 170, {}};
}

void SemanticAnalyzer::reportError(const std::string& message, SourceLocation loc) {
    errorReporter_.report("semantic", message, loc);
}

bool SemanticAnalyzer::analyze(const ProgramNode& program) {
    // First pass: register all IC definitions (allows forward references)
    for (const auto& icDef : program.icDefinitions) {
        analyzeICDef(*icDef);
    }
    
    // Second pass: register components and boards
    for (const auto& comp : program.components) {
        analyzeCompDecl(*comp);
    }
    
    for (const auto& board : program.boards) {
        analyzeBoardDecl(*board);
    }
    
    // Third pass: validate map block
    if (program.mapBlock) {
        analyzeMapBlock(*program.mapBlock);
    }
    
    return !errorReporter_.hasErrors();
}

void SemanticAnalyzer::analyzeCompDecl(const CompDeclNode& node) {
    // Check for duplicate declaration
    if (symbolTable_.hasSymbol(node.identifier)) {
        reportError("Duplicate component declaration: '" + node.identifier + "'", node.location);
        return;
    }
    
    // Validate component type exists
    bool isBuiltin = builtinICs_.find(node.componentType) != builtinICs_.end();
    bool isCustom = symbolTable_.hasICTemplate(node.componentType);
    
    if (!isBuiltin && !isCustom) {
        reportError("Unknown component type: '" + node.componentType + "'", node.location);
        return;
    }
    
    Symbol sym(node.identifier, SymbolKind::COMPONENT, node.componentType, node.location);
    
    // Copy pin info if custom IC
    if (isCustom) {
        auto ic = symbolTable_.lookupICTemplate(node.componentType);
        if (ic) {
            sym.pins = ic->pins;
        }
    }
    
    symbolTable_.addSymbol(sym);
}

void SemanticAnalyzer::analyzeBoardDecl(const BoardDeclNode& node) {
    if (symbolTable_.hasSymbol(node.identifier)) {
        reportError("Duplicate board declaration: '" + node.identifier + "'", node.location);
        return;
    }
    
    // Validate board type
    bool isValidBoard = node.boardType.find("breadboard") != std::string::npos ||
                        node.boardType.find("pcb") != std::string::npos ||
                        node.boardType.find("veroboard") != std::string::npos;
    
    if (!isValidBoard) {
        reportError("Unknown board type: '" + node.boardType + "'. Expected breadboard, pcb, or veroboard variant.", node.location);
        return;
    }
    
    Symbol sym(node.identifier, SymbolKind::BOARD, node.boardType, node.location);
    symbolTable_.addSymbol(sym);
}

void SemanticAnalyzer::analyzeICDef(const ICDefNode& node) {
    if (symbolTable_.hasICTemplate(node.name)) {
        reportError("Duplicate IC definition: '" + node.name + "'", node.location);
        return;
    }
    
    if (builtinICs_.find(node.name) != builtinICs_.end()) {
        reportError("Cannot redefine built-in IC: '" + node.name + "'", node.location);
        return;
    }
    
    ICTemplate ic(node.name, node.location);
    std::set<std::string> pinNames;
    
    int pinNumber = 1;
    for (const auto& pinDecl : node.pins) {
        if (pinNames.find(pinDecl->pinName) != pinNames.end()) {
            reportError("Duplicate pin name: '" + pinDecl->pinName + "' in IC '" + node.name + "'", pinDecl->location);
            continue;
        }
        
        pinNames.insert(pinDecl->pinName);
        
        PinInfo pin;
        pin.name = pinDecl->pinName;
        pin.type = pinDecl->pinType;
        pin.number = pinNumber++;
        ic.pins.push_back(pin);
    }
    
    ic.pinCount = static_cast<int>(ic.pins.size());
    symbolTable_.addICTemplate(ic);
}

void SemanticAnalyzer::analyzeMapBlock(const MapBlockNode& node) {
    for (const auto& conn : node.connections) {
        analyzeConnection(*conn);
    }
}

void SemanticAnalyzer::analyzeConnection(const ConnectionNode& node) {
    if (!node.source) return;
    
    analyzePinRef(*node.source, true);
    
    for (const auto& dest : node.destinations) {
        if (dest) {
            analyzePinRef(*dest, false);
        }
    }
}

void SemanticAnalyzer::analyzePinRef(const PinRefNode& node, bool isSource) {
    (void)isSource; // Reserved for future type checking (input->output validation)
    
    auto symbol = symbolTable_.lookupSymbol(node.componentId);
    if (!symbol) {
        reportError("Undefined component: '" + node.componentId + "'", node.location);
        return;
    }
    
    if (!isValidPinNumber(node.componentId, node.pinNumber)) {
        int maxPin = getPinCount(symbol->typeId);
        reportError("Invalid pin number " + std::to_string(node.pinNumber) + 
                   " for component '" + node.componentId + "' (type " + symbol->typeId + 
                   " has " + std::to_string(maxPin) + " pins)", node.location);
        return;
    }
    
    // Track pin usage for conflict detection on boards
    if (symbol->kind == SymbolKind::BOARD) {
        auto& pins = usedPins_[node.componentId];
        if (pins.find(node.pinNumber) != pins.end()) {
            reportError("Pin " + std::to_string(node.pinNumber) + 
                       " on board '" + node.componentId + "' is already connected", node.location);
        }
        pins.insert(node.pinNumber);
    }
}

bool SemanticAnalyzer::isValidPinNumber(const std::string& componentId, int pin) {
    auto symbol = symbolTable_.lookupSymbol(componentId);
    if (!symbol) return false;
    
    int maxPins = getPinCount(symbol->typeId);
    return pin >= 1 && pin <= maxPins;
}

int SemanticAnalyzer::getPinCount(const std::string& typeId) {
    // Check builtin ICs
    auto it = builtinICs_.find(typeId);
    if (it != builtinICs_.end()) {
        return it->second.pinCount;
    }
    
    // Check custom ICs
    auto ic = symbolTable_.lookupICTemplate(typeId);
    if (ic) {
        return ic->pinCount;
    }
    
    return 0;
}

} // namespace circuitsim
