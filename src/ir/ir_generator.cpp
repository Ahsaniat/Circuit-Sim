#include "ir_generator.h"
#include <cmath>

namespace circuitsim {

// Standard DIP IC dimensions (in mm, scaled for rendering)
static const float PIN_SPACING = 2.54f;  // 0.1 inch standard
static const float DIP_WIDTH = 7.62f;    // 0.3 inch standard

IRGenerator::IRGenerator(const SymbolTable& symbolTable, ErrorReporter& errorReporter)
    : symbolTable_(symbolTable)
    , errorReporter_(errorReporter) {
    initLayouts();
}

void IRGenerator::initLayouts() {
    // Standard DIP IC layouts
    auto makeDIP = [](int pins) -> ICLayout {
        int pinsPerSide = pins / 2;
        return {
            pins,
            DIP_WIDTH,
            pinsPerSide * PIN_SPACING,
            PIN_SPACING
        };
    };
    
    // Small passive components (2-pin)
    icLayouts_["2"] = {2, 2.0f, 5.0f, PIN_SPACING};  // Resistors, LEDs, etc.
    icLayouts_["3"] = {3, 3.0f, 5.0f, PIN_SPACING};  // Transistors, potentiometers
    
    icLayouts_["8"] = makeDIP(8);
    icLayouts_["14"] = makeDIP(14);
    icLayouts_["16"] = makeDIP(16);
    icLayouts_["20"] = makeDIP(20);
    icLayouts_["24"] = makeDIP(24);
    
    // Board layouts
    boardLayouts_["breadboard_830"] = {63, 10, 165.0f, 55.0f, PIN_SPACING};
    boardLayouts_["breadboard_400"] = {30, 10, 82.0f, 55.0f, PIN_SPACING};
    boardLayouts_["breadboard_170"] = {17, 10, 46.0f, 35.0f, PIN_SPACING};
}

ICLayout IRGenerator::getICLayout(const std::string& type) {
    // Parse component type - may be "baseType:value" format
    std::string baseType = type;
    std::string value;
    size_t colonPos = type.find(':');
    if (colonPos != std::string::npos) {
        baseType = type.substr(0, colonPos);
        value = type.substr(colonPos + 1);
    }
    
    // Get pin count from builtin or custom IC
    int pinCount = 14; // default
    
    // Check symbol table for custom IC
    auto ic = symbolTable_.lookupICTemplate(baseType);
    if (ic) {
        pinCount = ic->pinCount;
    } else {
        // Known IC types and component types with pin counts
        static const std::unordered_map<std::string, int> knownICs = {
            // Standard 74xx ICs
            {"7400", 14}, {"7402", 14}, {"7404", 14}, {"7408", 14},
            {"7410", 14}, {"7411", 14}, {"7420", 14}, {"7421", 14},
            {"7427", 14}, {"7432", 14}, {"7474", 14}, {"7476", 16},
            {"7486", 14}, {"7490", 14},
            {"7447", 16}, 
            {"74138", 16}, {"74139", 16}, {"74148", 16},
            {"74151", 16}, {"74153", 16},
            {"74161", 16}, {"74164", 14}, {"74165", 16},
            {"74173", 16}, {"74181", 24},
            {"74245", 20}, {"74373", 20}, {"74374", 20},
            {"555", 8}, {"NE555", 8},
            {"741", 8}, {"LM741", 8}, {"LM358", 8},
            
            // Component types from keyword syntax
            {"resistor", 2}, {"capacitor", 2}, {"inductor", 2},
            {"potentiometer", 3},
            {"diode", 2}, {"zener_diode", 2}, {"schottky_diode", 2},
            {"led", 2}, {"ir_led", 2}, {"photodiode", 2}, {"ldr", 2},
            {"npn", 3}, {"pnp", 3}, {"nmos", 3}, {"pmos", 3},
            
            // Logic gates (default pin counts)
            {"and_gate", 14}, {"or_gate", 14}, {"xor_gate", 14},
            {"nand_gate", 14}, {"nor_gate", 14}, {"not_gate", 14},
            {"and3_gate", 14}, {"nand3_gate", 14}, {"nor3_gate", 14},
            {"and4_gate", 14}, {"nand4_gate", 14},
            
            // Multiplexers, decoders, etc.
            {"mux_4x1", 16}, {"mux_8x1", 16},
            {"decoder_3to8", 16}, {"decoder_2to4", 16}, {"encoder_8to3", 16},
            {"shift_reg_8", 14}, {"shift_reg_8_parallel", 16},
            {"d_flipflop", 14}, {"jk_flipflop", 16}, {"latch_8", 20},
            {"counter_4bit", 16}, {"counter_decade", 14},

            // Extended components (parity with the web compiler)
            {"switch_spst", 2}, {"switch_spdt", 3}, {"pushbutton", 4},
            {"display_7seg", 10},
            {"buzzer", 2}, {"passive_buzzer", 2},
            {"motor_dc", 2}, {"servo", 3},
            {"battery", 2}, {"regulator", 3},
            {"crystal", 2},

            // 74HC family and friends (parity with the web compiler)
            {"74HC00", 14}, {"74HC02", 14}, {"74HC04", 14}, {"74HC08", 14},
            {"74HC10", 14}, {"74HC11", 14}, {"74HC14", 14}, {"74HC20", 14},
            {"74HC21", 14}, {"74HC27", 14}, {"74HC32", 14}, {"74HC73", 14},
            {"74HC74", 14}, {"74HC86", 14}, {"74HC93", 14}, {"74HC132", 14},
            {"74HC75", 16}, {"74HC283", 16}, {"74HC595", 16}, {"74HC4017", 16},
            {"CD4511", 16}, {"PCF8574", 16},
            {"556", 14},
            {"LM393", 8}, {"LM339", 14}
        };
        
        // First try value (e.g., 7408 in "and_gate:7408")
        if (!value.empty()) {
            auto it = knownICs.find(value);
            if (it != knownICs.end()) {
                pinCount = it->second;
            }
        }
        
        // If not found in value, try base type
        if (pinCount == 14 || value.empty()) {
            auto it = knownICs.find(baseType);
            if (it != knownICs.end()) {
                pinCount = it->second;
            }
        }
    }
    
    std::string key = std::to_string(pinCount);
    auto it = icLayouts_.find(key);
    if (it != icLayouts_.end()) {
        return it->second;
    }
    
    // Generate layout for unknown pin count
    int pinsPerSide = std::max(1, pinCount / 2);
    return {pinCount, DIP_WIDTH, pinsPerSide * PIN_SPACING, PIN_SPACING};
}

BoardLayout IRGenerator::getBoardLayout(const std::string& type) {
    auto it = boardLayouts_.find(type);
    if (it != boardLayouts_.end()) {
        return it->second;
    }
    
    // Default breadboard
    return boardLayouts_["breadboard_830"];
}

CircuitIR IRGenerator::generate(const ProgramNode& program,
                                const std::unordered_map<std::string, std::string>& componentBoards) {
    CircuitIR ir;
    componentBoards_ = componentBoards;
    
    // Generate boards first (they define the workspace)
    for (const auto& board : program.boards) {
        ir.boards.push_back(generateBoard(*board));
    }
    
    // Generate components
    for (const auto& comp : program.components) {
        ir.components.push_back(generateComponent(*comp));
    }
    
    // Layout components on the circuit
    layoutComponents(ir);
    
    // Generate wires from all map blocks (global and board-scoped)
    ir.wires = generateWires(program);
    
    // Calculate total dimensions
    float maxX = 0, maxY = 0;
    for (const auto& b : ir.boards) {
        maxX = std::max(maxX, b.position.x + b.width);
        maxY = std::max(maxY, b.position.y + b.height);
    }
    for (const auto& c : ir.components) {
        maxX = std::max(maxX, c.position.x + c.width);
        maxY = std::max(maxY, c.position.y + c.height);
    }
    
    ir.totalWidth = maxX + 20.0f;  // padding
    ir.totalHeight = maxY + 20.0f;
    
    return ir;
}

ComponentIR IRGenerator::generateComponent(const CompDeclNode& node) {
    ICLayout layout = getICLayout(node.componentType);
    
    ComponentIR comp(node.identifier, node.componentType, layout.pinCount);
    comp.width = layout.width;
    comp.height = layout.height;
    
    return comp;
}

BoardIR IRGenerator::generateBoard(const BoardDeclNode& node) {
    BoardLayout layout = getBoardLayout(node.boardType);
    
    BoardIR board(node.identifier, node.boardType);
    board.rows = layout.rows;
    board.columns = layout.columns;
    board.width = layout.width;
    board.height = layout.height;
    
    return board;
}

void IRGenerator::layoutComponents(CircuitIR& ir) {
    float currentX = 10.0f;
    float currentY = 10.0f;
    
    // Place boards first, stacked vertically
    for (auto& board : ir.boards) {
        board.position = Position(currentX, currentY);
        componentPositions_[board.id] = board.position;
        currentY += board.height + 20.0f;
    }
    
    // Per-board placement cursors
    struct Cursor {
        float x;
        float y;
        float rowStartX;
        float rowHeight;
    };
    std::unordered_map<std::string, Cursor> cursors;
    for (auto& board : ir.boards) {
        float startX = board.position.x + 20.0f;
        cursors[board.id] = Cursor{startX, board.position.y + 10.0f, startX, 0.0f};
    }
    
    const std::string fallbackBoard = ir.boards.empty() ? std::string() : ir.boards[0].id;
    float noBoardX = 10.0f;
    float noBoardY = currentY;
    
    for (auto& comp : ir.components) {
        std::string boardId;
        auto assigned = componentBoards_.find(comp.id);
        if (assigned != componentBoards_.end()) {
            boardId = assigned->second;
        }
        if (boardId.empty()) {
            boardId = fallbackBoard;
        }
        
        auto cursorIt = cursors.find(boardId);
        if (cursorIt == cursors.end()) {
            // No board to place on: simple row layout below the boards.
            comp.position = Position(noBoardX, noBoardY);
            componentPositions_[comp.id] = comp.position;
            noBoardX += comp.width + 15.0f;
            continue;
        }
        
        float wrapRight = 220.0f;
        for (const auto& board : ir.boards) {
            if (board.id == boardId) {
                wrapRight = board.position.x + board.width - 10.0f;
                break;
            }
        }
        
        Cursor& cursor = cursorIt->second;
        if (cursor.x + comp.width > wrapRight && cursor.x > cursor.rowStartX) {
            cursor.x = cursor.rowStartX;
            cursor.y += cursor.rowHeight + 12.0f;
            cursor.rowHeight = 0.0f;
        }
        comp.position = Position(cursor.x, cursor.y);
        componentPositions_[comp.id] = comp.position;
        cursor.x += comp.width + 15.0f;
        cursor.rowHeight = std::max(cursor.rowHeight, comp.height);
    }
}

Position IRGenerator::getPinPosition(const std::string& componentId, int pinNumber) {
    auto it = componentPositions_.find(componentId);
    if (it == componentPositions_.end()) {
        return Position(0, 0);
    }
    
    Position compPos = it->second;
    
    // Check if it's a board
    auto symbol = symbolTable_.lookupSymbol(componentId);
    if (symbol && symbol->kind == SymbolKind::BOARD) {
        // Board connection points follow the same convention as the web app:
        // pin N maps to column ((N-1) % 63) + 1; the first 63 pins are in
        // row D (top half) and later pins in row G (bottom half).
        BoardLayout layout = getBoardLayout(symbol->typeId);
        const int boardColumns = 63;
        int col = (pinNumber - 1) % boardColumns;
        bool topHalf = pinNumber <= boardColumns;
        float x = compPos.x + 5.0f + col * layout.holeSpacing;
        float y = compPos.y + (topHalf ? 7.62f : 20.32f);
        return Position(x, y);
    }
    
    // IC pin positions: DIP layout
    // Pins 1-N/2 on left side (top to bottom)
    // Pins N/2+1 to N on right side (bottom to top)
    ICLayout layout = getICLayout(symbol ? symbol->typeId : "");
    int pinsPerSide = layout.pinCount / 2;
    
    float x, y;
    if (pinNumber <= pinsPerSide) {
        // Left side
        x = compPos.x;
        y = compPos.y + (pinNumber - 1) * layout.pinSpacing;
    } else {
        // Right side
        x = compPos.x + layout.width;
        y = compPos.y + (layout.pinCount - pinNumber) * layout.pinSpacing;
    }
    
    return Position(x, y);
}

std::vector<Wire> IRGenerator::generateWires(const ProgramNode& program) {
    std::vector<Wire> wires;
    
    // Wire colors for visual distinction
    static const std::vector<std::string> colors = {
        "#E63946", "#457B9D", "#2A9D8F", "#E9C46A", 
        "#F4A261", "#264653", "#A8DADC", "#1D3557"
    };
    size_t colorIndex = 0;
    
    for (const auto& mapBlock : program.mapBlocks) {
        for (const auto& conn : mapBlock->connections) {
            if (!conn->source) continue;
            
            Position fromPos = getPinPosition(conn->source->componentId, conn->source->pinNumber);
            PinPosition from(conn->source->componentId, conn->source->pinNumber, fromPos);
            
            std::string wireColor = colors[colorIndex % colors.size()];
            
            for (const auto& dest : conn->destinations) {
                if (!dest) continue;
                
                Position toPos = getPinPosition(dest->componentId, dest->pinNumber);
                PinPosition to(dest->componentId, dest->pinNumber, toPos);
                
                Wire wire(from, to);
                wire.color = wireColor;
                wires.push_back(wire);
            }
            
            colorIndex++;
        }
    }
    
    return wires;
}

} // namespace circuitsim
