#include "parser.h"

#include <exception>

namespace circuitsim {

Parser::Parser(const std::vector<Token>& tokens, ErrorReporter& errorReporter)
    : tokens_(tokens)
    , current_(0)
    , errorReporter_(errorReporter) {}

const Token& Parser::peek() const {
    return tokens_[current_];
}

const Token& Parser::previous() const {
    return tokens_[current_ - 1];
}

const Token& Parser::advance() {
    if (!isAtEnd()) current_++;
    return previous();
}

bool Parser::isAtEnd() const {
    return peek().type == TokenType::END_OF_FILE;
}

bool Parser::check(TokenType type) const {
    if (isAtEnd()) return false;
    return peek().type == type;
}

bool Parser::match(TokenType type) {
    if (check(type)) {
        advance();
        return true;
    }
    return false;
}

bool Parser::match(std::initializer_list<TokenType> types) {
    for (TokenType type : types) {
        if (check(type)) {
            advance();
            return true;
        }
    }
    return false;
}

Token Parser::consume(TokenType type, const std::string& message) {
    if (check(type)) return advance();
    reportError(message);
    return Token(TokenType::UNKNOWN, "", peek().location);
}

void Parser::skipNewlines() {
    while (match(TokenType::NEWLINE)) {}
}

void Parser::synchronize() {
    advance();
    while (!isAtEnd()) {
        if (previous().type == TokenType::NEWLINE) return;
        
        switch (peek().type) {
            case TokenType::COMP:
            case TokenType::BOARD:
            case TokenType::DEF:
            case TokenType::MAP:
                return;
            default:
                // Also sync on any component keyword
                if (isComponentKeyword(peek().type)) return;
                advance();
        }
    }
}

void Parser::reportError(const std::string& message) {
    errorReporter_.report("parser", message, peek().location);
}

bool Parser::isComponentKeyword(TokenType type) const {
    switch (type) {
        case TokenType::RESISTOR:
        case TokenType::CAPACITOR:
        case TokenType::INDUCTOR:
        case TokenType::POTENTIOMETER:
        case TokenType::DIODE:
        case TokenType::ZENER_DIODE:
        case TokenType::SCHOTTKY_DIODE:
        case TokenType::LED:
        case TokenType::IR_LED:
        case TokenType::PHOTODIODE:
        case TokenType::LDR:
        case TokenType::NPN:
        case TokenType::PNP:
        case TokenType::NMOS:
        case TokenType::PMOS:
        case TokenType::AND_GATE:
        case TokenType::OR_GATE:
        case TokenType::XOR_GATE:
        case TokenType::NAND_GATE:
        case TokenType::NOR_GATE:
        case TokenType::NOT_GATE:
        case TokenType::AND3_GATE:
        case TokenType::NAND3_GATE:
        case TokenType::NOR3_GATE:
        case TokenType::AND4_GATE:
        case TokenType::NAND4_GATE:
        case TokenType::MUX_4X1:
        case TokenType::MUX_8X1:
        case TokenType::DECODER_3TO8:
        case TokenType::DECODER_2TO4:
        case TokenType::ENCODER_8TO3:
        case TokenType::SHIFT_REG_8:
        case TokenType::SHIFT_REG_8_PAR:
        case TokenType::D_FLIPFLOP:
        case TokenType::JK_FLIPFLOP:
        case TokenType::LATCH_8:
        case TokenType::COUNTER_4BIT:
        case TokenType::COUNTER_DECADE:
            return true;
        default:
            return false;
    }
}

bool Parser::matchComponentKeyword() {
    if (isComponentKeyword(peek().type)) {
        advance();
        return true;
    }
    return false;
}

std::string Parser::getComponentTypeFromKeyword(TokenType type) const {
    switch (type) {
        case TokenType::RESISTOR: return "resistor";
        case TokenType::CAPACITOR: return "capacitor";
        case TokenType::INDUCTOR: return "inductor";
        case TokenType::POTENTIOMETER: return "potentiometer";
        case TokenType::DIODE: return "diode";
        case TokenType::ZENER_DIODE: return "zener_diode";
        case TokenType::SCHOTTKY_DIODE: return "schottky_diode";
        case TokenType::LED: return "led";
        case TokenType::IR_LED: return "ir_led";
        case TokenType::PHOTODIODE: return "photodiode";
        case TokenType::LDR: return "ldr";
        case TokenType::NPN: return "npn";
        case TokenType::PNP: return "pnp";
        case TokenType::NMOS: return "nmos";
        case TokenType::PMOS: return "pmos";
        case TokenType::AND_GATE: return "and_gate";
        case TokenType::OR_GATE: return "or_gate";
        case TokenType::XOR_GATE: return "xor_gate";
        case TokenType::NAND_GATE: return "nand_gate";
        case TokenType::NOR_GATE: return "nor_gate";
        case TokenType::NOT_GATE: return "not_gate";
        case TokenType::AND3_GATE: return "and3_gate";
        case TokenType::NAND3_GATE: return "nand3_gate";
        case TokenType::NOR3_GATE: return "nor3_gate";
        case TokenType::AND4_GATE: return "and4_gate";
        case TokenType::NAND4_GATE: return "nand4_gate";
        case TokenType::MUX_4X1: return "mux_4x1";
        case TokenType::MUX_8X1: return "mux_8x1";
        case TokenType::DECODER_3TO8: return "decoder_3to8";
        case TokenType::DECODER_2TO4: return "decoder_2to4";
        case TokenType::ENCODER_8TO3: return "encoder_8to3";
        case TokenType::SHIFT_REG_8: return "shift_reg_8";
        case TokenType::SHIFT_REG_8_PAR: return "shift_reg_8_parallel";
        case TokenType::D_FLIPFLOP: return "d_flipflop";
        case TokenType::JK_FLIPFLOP: return "jk_flipflop";
        case TokenType::LATCH_8: return "latch_8";
        case TokenType::COUNTER_4BIT: return "counter_4bit";
        case TokenType::COUNTER_DECADE: return "counter_decade";
        default: return "unknown";
    }
}

std::unique_ptr<ProgramNode> Parser::parse() {
    auto program = std::make_unique<ProgramNode>(SourceLocation(1, 1));
    
    skipNewlines();
    
    while (!isAtEnd()) {
        try {
            if (match(TokenType::COMP)) {
                auto comp = parseCompDecl();
                if (comp) program->components.push_back(std::move(comp));
            } else if (matchComponentKeyword()) {
                auto comp = parseTypedCompDecl();
                if (comp) program->components.push_back(std::move(comp));
            } else if (match(TokenType::BOARD)) {
                auto board = parseBoardDecl();
                if (board) program->boards.push_back(std::move(board));
            } else if (match(TokenType::DEF)) {
                auto icDef = parseICDef();
                if (icDef) program->icDefinitions.push_back(std::move(icDef));
            } else if (match(TokenType::MAP)) {
                SourceLocation mapLocation = previous().location;
                auto mapBlock = parseMapBlock();
                if (program->mapBlock) {
                    errorReporter_.report("parser",
                        "Duplicate 'map' block; merge the connections into a single block",
                        mapLocation);
                } else {
                    program->mapBlock = std::move(mapBlock);
                }
            } else {
                reportError("Expected component declaration, '@board', 'def', or 'map'");
                synchronize();
            }
        } catch (const std::exception& e) {
            reportError(std::string("Parser error: ") + e.what());
            synchronize();
        }
        
        skipNewlines();
    }
    
    return program;
}

// @comp A1 7408
std::unique_ptr<CompDeclNode> Parser::parseCompDecl() {
    SourceLocation loc = previous().location;
    
    Token idToken = consume(TokenType::IDENTIFIER, "Expected component identifier after '@comp'");
    if (idToken.type == TokenType::UNKNOWN) return nullptr;
    
    // Component type can be COMPONENT_TYPE, IDENTIFIER, or NUMBER (for ICs like 7408)
    Token typeToken;
    if (check(TokenType::COMPONENT_TYPE) || check(TokenType::IDENTIFIER) || check(TokenType::NUMBER)) {
        typeToken = advance();
    } else {
        reportError("Expected component type after identifier");
        return nullptr;
    }
    
    return std::make_unique<CompDeclNode>(idToken.lexeme, typeToken.lexeme, loc);
}

// @resistor R1 10k, @AND A1 7408, etc.
std::unique_ptr<CompDeclNode> Parser::parseTypedCompDecl() {
    SourceLocation loc = previous().location;
    TokenType componentKeyword = previous().type;
    std::string baseType = getComponentTypeFromKeyword(componentKeyword);
    
    Token idToken = consume(TokenType::IDENTIFIER, "Expected component identifier");
    if (idToken.type == TokenType::UNKNOWN) return nullptr;
    
    // Value/part number is optional for typed components
    std::string componentType = baseType;
    if (check(TokenType::COMPONENT_TYPE) || check(TokenType::IDENTIFIER) || check(TokenType::NUMBER)) {
        Token valueToken = advance();
        // Combine base type with value, e.g., "resistor:10k" or "and_gate:7408"
        componentType = baseType + ":" + valueToken.lexeme;
    }
    
    return std::make_unique<CompDeclNode>(idToken.lexeme, componentType, loc);
}

// @board B1 breadboard_830
std::unique_ptr<BoardDeclNode> Parser::parseBoardDecl() {
    SourceLocation loc = previous().location;
    
    Token idToken = consume(TokenType::IDENTIFIER, "Expected board identifier after '@board'");
    if (idToken.type == TokenType::UNKNOWN) return nullptr;
    
    // Board type can be COMPONENT_TYPE, IDENTIFIER, or NUMBER
    Token typeToken;
    if (check(TokenType::COMPONENT_TYPE) || check(TokenType::IDENTIFIER) || check(TokenType::NUMBER)) {
        typeToken = advance();
    } else {
        reportError("Expected board type after identifier");
        return nullptr;
    }
    
    return std::make_unique<BoardDeclNode>(idToken.lexeme, typeToken.lexeme, loc);
}

// def IC_NAME (pin1->input, pin2->output)
std::unique_ptr<ICDefNode> Parser::parseICDef() {
    SourceLocation loc = previous().location;
    
    Token nameToken = consume(TokenType::IDENTIFIER, "Expected IC name after 'def'");
    if (nameToken.type == TokenType::UNKNOWN) return nullptr;
    
    auto icDef = std::make_unique<ICDefNode>(nameToken.lexeme, loc);
    
    consume(TokenType::LPAREN, "Expected '(' after IC name");
    skipNewlines();
    
    if (!check(TokenType::RPAREN)) {
        do {
            skipNewlines();
            auto pinDecl = parsePinDecl();
            if (pinDecl) {
                icDef->pins.push_back(std::move(pinDecl));
            }
            skipNewlines();
        } while (match(TokenType::COMMA));
    }
    
    skipNewlines();
    consume(TokenType::RPAREN, "Expected ')' after pin declarations");
    
    return icDef;
}

// pin1 -> input
std::unique_ptr<PinDeclNode> Parser::parsePinDecl() {
    SourceLocation loc = peek().location;
    
    Token pinName = consume(TokenType::IDENTIFIER, "Expected pin name");
    if (pinName.type == TokenType::UNKNOWN) return nullptr;
    
    consume(TokenType::ARROW, "Expected '->' after pin name");
    
    std::string pinType;
    if (match(TokenType::TYPE_INPUT)) {
        pinType = "input";
    } else if (match(TokenType::TYPE_OUTPUT)) {
        pinType = "output";
    } else if (match(TokenType::TYPE_GND)) {
        pinType = "gnd";
    } else if (match(TokenType::TYPE_VCC)) {
        pinType = "vcc";
    } else {
        reportError("Expected pin type (input, output, gnd, vcc)");
        return nullptr;
    }
    
    return std::make_unique<PinDeclNode>(pinName.lexeme, pinType, loc);
}

// map ( ... )
std::unique_ptr<MapBlockNode> Parser::parseMapBlock() {
    SourceLocation loc = previous().location;
    
    consume(TokenType::LPAREN, "Expected '(' after 'map'");
    skipNewlines();
    
    auto mapBlock = std::make_unique<MapBlockNode>(loc);
    
    while (!check(TokenType::RPAREN) && !isAtEnd()) {
        size_t positionBefore = current_;
        auto connection = parseConnection();
        if (connection) {
            mapBlock->connections.push_back(std::move(connection));
        }
        // Guarantee forward progress: a failed parse must never leave the
        // cursor in place or this loop would spin and grow the error list
        // without bound.
        if (current_ == positionBefore) {
            advance();
        }
        skipNewlines();
    }
    
    consume(TokenType::RPAREN, "Expected ')' to close map block");
    
    return mapBlock;
}

// (A1 pin 3 -> O1 pin 1, X1 pin 2)
std::unique_ptr<ConnectionNode> Parser::parseConnection() {
    SourceLocation loc = peek().location;
    
    if (!check(TokenType::LPAREN)) {
        reportError("Expected '(' to start connection");
        return nullptr;
    }
    advance();
    
    auto connection = std::make_unique<ConnectionNode>(loc);
    
    connection->source = parsePinRef();
    if (!connection->source) {
        skipToConnectionEnd();
        return nullptr;
    }
    
    if (!check(TokenType::ARROW)) {
        reportError("Expected '->' after source pin");
        skipToConnectionEnd();
        return nullptr;
    }
    advance();
    
    do {
        auto dest = parsePinRef();
        if (!dest) {
            skipToConnectionEnd();
            return nullptr;
        }
        connection->destinations.push_back(std::move(dest));
    } while (match(TokenType::COMMA));
    
    if (!check(TokenType::RPAREN)) {
        reportError("Expected ')' to close connection");
        skipToConnectionEnd();
        return nullptr;
    }
    advance();
    
    return connection;
}

// Consume the rest of a malformed connection so parsing can resume at the
// next connection without looping on the same token.
void Parser::skipToConnectionEnd() {
    while (!isAtEnd() && !check(TokenType::RPAREN) && !check(TokenType::LPAREN)) {
        advance();
    }
    match(TokenType::RPAREN);
}

// A1 pin 3
std::unique_ptr<PinRefNode> Parser::parsePinRef() {
    SourceLocation loc = peek().location;
    
    Token compId = consume(TokenType::IDENTIFIER, "Expected component identifier");
    if (compId.type == TokenType::UNKNOWN) return nullptr;
    
    consume(TokenType::PIN, "Expected 'pin' keyword");
    
    Token pinNum = consume(TokenType::NUMBER, "Expected pin number");
    if (pinNum.type == TokenType::UNKNOWN) return nullptr;
    
    // NUMBER tokens may carry alphanumeric suffixes (10k, 2N2222); a pin
    // number must be plain digits, so validate instead of relying on stoi.
    int pin = 0;
    bool valid = !pinNum.lexeme.empty();
    for (char ch : pinNum.lexeme) {
        if (ch < '0' || ch > '9') {
            valid = false;
            break;
        }
        pin = pin * 10 + (ch - '0');
        if (pin > 1000000) {
            valid = false;
            break;
        }
    }
    if (!valid) {
        reportError("Invalid pin number '" + pinNum.lexeme + "'");
        return nullptr;
    }
    
    return std::make_unique<PinRefNode>(compId.lexeme, pin, loc);
}

} // namespace circuitsim
