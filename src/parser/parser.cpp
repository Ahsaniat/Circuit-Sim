#include "parser.h"

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
                advance();
        }
    }
}

void Parser::reportError(const std::string& message) {
    errorReporter_.report("parser", message, peek().location);
}

std::unique_ptr<ProgramNode> Parser::parse() {
    auto program = std::make_unique<ProgramNode>(SourceLocation(1, 1));
    
    skipNewlines();
    
    while (!isAtEnd()) {
        try {
            if (match(TokenType::COMP)) {
                auto comp = parseCompDecl();
                if (comp) program->components.push_back(std::move(comp));
            } else if (match(TokenType::BOARD)) {
                auto board = parseBoardDecl();
                if (board) program->boards.push_back(std::move(board));
            } else if (match(TokenType::DEF)) {
                auto icDef = parseICDef();
                if (icDef) program->icDefinitions.push_back(std::move(icDef));
            } else if (match(TokenType::MAP)) {
                program->mapBlock = parseMapBlock();
            } else {
                reportError("Expected '@comp', '@board', 'def', or 'map'");
                synchronize();
            }
        } catch (...) {
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
        auto connection = parseConnection();
        if (connection) {
            mapBlock->connections.push_back(std::move(connection));
        }
        skipNewlines();
    }
    
    consume(TokenType::RPAREN, "Expected ')' to close map block");
    
    return mapBlock;
}

// (A1 pin 3 -> O1 pin 1, X1 pin 2)
std::unique_ptr<ConnectionNode> Parser::parseConnection() {
    SourceLocation loc = peek().location;
    
    consume(TokenType::LPAREN, "Expected '(' to start connection");
    
    auto connection = std::make_unique<ConnectionNode>(loc);
    
    connection->source = parsePinRef();
    if (!connection->source) return nullptr;
    
    consume(TokenType::ARROW, "Expected '->' after source pin");
    
    do {
        auto dest = parsePinRef();
        if (dest) {
            connection->destinations.push_back(std::move(dest));
        }
    } while (match(TokenType::COMMA));
    
    consume(TokenType::RPAREN, "Expected ')' to close connection");
    
    return connection;
}

// A1 pin 3
std::unique_ptr<PinRefNode> Parser::parsePinRef() {
    SourceLocation loc = peek().location;
    
    Token compId = consume(TokenType::IDENTIFIER, "Expected component identifier");
    if (compId.type == TokenType::UNKNOWN) return nullptr;
    
    consume(TokenType::PIN, "Expected 'pin' keyword");
    
    Token pinNum = consume(TokenType::NUMBER, "Expected pin number");
    if (pinNum.type == TokenType::UNKNOWN) return nullptr;
    
    int pin = std::stoi(pinNum.lexeme);
    
    return std::make_unique<PinRefNode>(compId.lexeme, pin, loc);
}

} // namespace circuitsim
