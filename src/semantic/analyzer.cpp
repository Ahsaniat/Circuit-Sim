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
    builtinICs_["7411"] = {"7411", 14, {}}; // Triple 3-input AND
    builtinICs_["7420"] = {"7420", 14, {}}; // Dual 4-input NAND
    builtinICs_["7421"] = {"7421", 14, {}}; // Dual 4-input AND
    builtinICs_["7427"] = {"7427", 14, {}}; // Triple 3-input NOR
    builtinICs_["7432"] = {"7432", 14, {}}; // Quad 2-input OR
    builtinICs_["7476"] = {"7476", 16, {}}; // Dual JK flip-flop
    builtinICs_["7486"] = {"7486", 14, {}}; // Quad 2-input XOR
    
    // 74xx series - larger ICs
    builtinICs_["7447"] = {"7447", 16, {}}; // BCD to 7-segment decoder
    builtinICs_["7474"] = {"7474", 14, {}}; // Dual D flip-flop
    builtinICs_["7490"] = {"7490", 14, {}}; // Decade counter
    builtinICs_["74138"] = {"74138", 16, {}}; // 3-to-8 decoder
    builtinICs_["74139"] = {"74139", 16, {}}; // Dual 2-to-4 decoder
    builtinICs_["74148"] = {"74148", 16, {}}; // 8-to-3 priority encoder
    builtinICs_["74151"] = {"74151", 16, {}}; // 8-to-1 multiplexer
    builtinICs_["74153"] = {"74153", 16, {}}; // Dual 4-to-1 multiplexer
    builtinICs_["74161"] = {"74161", 16, {}}; // 4-bit binary counter
    builtinICs_["74164"] = {"74164", 14, {}}; // 8-bit shift register (SIPO)
    builtinICs_["74165"] = {"74165", 16, {}}; // 8-bit shift register (PISO)
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
    
    // ===== NEW COMPONENT TYPES (keyword-based) =====
    
    // Passive components (2 pins by default)
    builtinICs_["resistor"] = {"resistor", 2, {}};
    builtinICs_["capacitor"] = {"capacitor", 2, {}};
    builtinICs_["inductor"] = {"inductor", 2, {}};
    builtinICs_["potentiometer"] = {"potentiometer", 3, {}};  // 3 pins
    
    // Diodes (2 pins)
    builtinICs_["diode"] = {"diode", 2, {}};
    builtinICs_["zener_diode"] = {"zener_diode", 2, {}};
    builtinICs_["schottky_diode"] = {"schottky_diode", 2, {}};
    
    // LEDs and optical (2 pins, except photodiode which may have 2-3)
    builtinICs_["led"] = {"led", 2, {}};
    builtinICs_["ir_led"] = {"ir_led", 2, {}};
    builtinICs_["photodiode"] = {"photodiode", 2, {}};
    builtinICs_["ldr"] = {"ldr", 2, {}};
    
    // Transistors (3 pins: Base/Gate, Collector/Drain, Emitter/Source)
    builtinICs_["npn"] = {"npn", 3, {}};
    builtinICs_["pnp"] = {"pnp", 3, {}};
    builtinICs_["nmos"] = {"nmos", 3, {}};
    builtinICs_["pmos"] = {"pmos", 3, {}};
    
    // Logic gates - base types (will be combined with part numbers)
    builtinICs_["and_gate"] = {"and_gate", 14, {}};   // 7408 by default
    builtinICs_["or_gate"] = {"or_gate", 14, {}};     // 7432 by default
    builtinICs_["xor_gate"] = {"xor_gate", 14, {}};   // 7486 by default
    builtinICs_["nand_gate"] = {"nand_gate", 14, {}}; // 7400 by default
    builtinICs_["nor_gate"] = {"nor_gate", 14, {}};   // 7402 by default
    builtinICs_["not_gate"] = {"not_gate", 14, {}};   // 7404 by default
    
    builtinICs_["and3_gate"] = {"and3_gate", 14, {}};   // 7411
    builtinICs_["nand3_gate"] = {"nand3_gate", 14, {}}; // 7410
    builtinICs_["nor3_gate"] = {"nor3_gate", 14, {}};   // 7427
    
    builtinICs_["and4_gate"] = {"and4_gate", 14, {}};   // 7421
    builtinICs_["nand4_gate"] = {"nand4_gate", 14, {}}; // 7420
    
    // Multiplexers and decoders
    builtinICs_["mux_4x1"] = {"mux_4x1", 16, {}};       // 74153
    builtinICs_["mux_8x1"] = {"mux_8x1", 16, {}};       // 74151
    builtinICs_["decoder_3to8"] = {"decoder_3to8", 16, {}};  // 74138
    builtinICs_["decoder_2to4"] = {"decoder_2to4", 16, {}};  // 74139
    builtinICs_["encoder_8to3"] = {"encoder_8to3", 16, {}};  // 74148
    
    // Shift registers and flip-flops
    builtinICs_["shift_reg_8"] = {"shift_reg_8", 14, {}};           // 74164
    builtinICs_["shift_reg_8_parallel"] = {"shift_reg_8_parallel", 16, {}};  // 74165
    builtinICs_["d_flipflop"] = {"d_flipflop", 14, {}};  // 7474
    builtinICs_["jk_flipflop"] = {"jk_flipflop", 16, {}}; // 7476
    builtinICs_["latch_8"] = {"latch_8", 20, {}};        // 74373
    
    // Counters
    builtinICs_["counter_4bit"] = {"counter_4bit", 16, {}};    // 74161
    builtinICs_["counter_decade"] = {"counter_decade", 14, {}}; // 7490
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
    
    // Parse component type - may be "baseType:value" or just "type"
    std::string baseType = node.componentType;
    std::string value;
    size_t colonPos = node.componentType.find(':');
    if (colonPos != std::string::npos) {
        baseType = node.componentType.substr(0, colonPos);
        value = node.componentType.substr(colonPos + 1);
    }
    
    // Validate component type exists
    bool isBuiltin = builtinICs_.find(baseType) != builtinICs_.end();
    bool isCustom = symbolTable_.hasICTemplate(baseType);
    
    // Also check if value is a valid IC type (e.g., and_gate:7408 -> check 7408)
    if (!isBuiltin && !isCustom && !value.empty()) {
        isBuiltin = builtinICs_.find(value) != builtinICs_.end();
        if (isBuiltin) {
            // Use the IC type's pin count instead of base type
            baseType = value;
        }
    }
    
    // For unknown types, allow them as generic components
    // This enables @comp to be used as an escape hatch for custom/arbitrary components
    Symbol sym(node.identifier, SymbolKind::COMPONENT, node.componentType, node.location);
    
    // Copy pin info if custom IC
    if (isCustom) {
        auto ic = symbolTable_.lookupICTemplate(baseType);
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
    // Parse type - may be "baseType:value" format
    std::string baseType = typeId;
    std::string value;
    size_t colonPos = typeId.find(':');
    if (colonPos != std::string::npos) {
        baseType = typeId.substr(0, colonPos);
        value = typeId.substr(colonPos + 1);
    }
    
    // First check if value is a specific IC type (e.g., 7408)
    if (!value.empty()) {
        auto it = builtinICs_.find(value);
        if (it != builtinICs_.end()) {
            return it->second.pinCount;
        }
    }
    
    // Check base type in builtin ICs
    auto it = builtinICs_.find(baseType);
    if (it != builtinICs_.end()) {
        return it->second.pinCount;
    }
    
    // Check custom ICs
    auto ic = symbolTable_.lookupICTemplate(baseType);
    if (ic) {
        return ic->pinCount;
    }
    
    return 0;
}

} // namespace circuitsim
