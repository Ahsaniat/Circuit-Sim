#ifndef CIRCUITSIM_TOKEN_H
#define CIRCUITSIM_TOKEN_H

#include <string>
#include <unordered_map>

namespace circuitsim {

enum class TokenType {
    // Keywords
    COMP,       // @comp
    BOARD,      // @board
    DEF,        // def
    MAP,        // map
    PIN,        // pin

    // Types
    TYPE_INPUT,
    TYPE_OUTPUT,
    TYPE_GND,
    TYPE_VCC,

    // Literals
    IDENTIFIER,
    NUMBER,
    COMPONENT_TYPE,

    // Operators
    ARROW,      // ->
    COMMA,      // ,

    // Delimiters
    LPAREN,     // (
    RPAREN,     // )

    // Special
    NEWLINE,
    COMMENT,
    END_OF_FILE,
    UNKNOWN
};

struct SourceLocation {
    int line;
    int column;
    
    SourceLocation(int l = 1, int c = 1) : line(l), column(c) {}
};

struct Token {
    TokenType type;
    std::string lexeme;
    SourceLocation location;

    Token(TokenType t, const std::string& lex, SourceLocation loc)
        : type(t), lexeme(lex), location(loc) {}

    Token() : type(TokenType::UNKNOWN), lexeme(""), location() {}
};

inline const char* tokenTypeToString(TokenType type) {
    switch (type) {
        case TokenType::COMP: return "COMP";
        case TokenType::BOARD: return "BOARD";
        case TokenType::DEF: return "DEF";
        case TokenType::MAP: return "MAP";
        case TokenType::PIN: return "PIN";
        case TokenType::TYPE_INPUT: return "TYPE_INPUT";
        case TokenType::TYPE_OUTPUT: return "TYPE_OUTPUT";
        case TokenType::TYPE_GND: return "TYPE_GND";
        case TokenType::TYPE_VCC: return "TYPE_VCC";
        case TokenType::IDENTIFIER: return "IDENTIFIER";
        case TokenType::NUMBER: return "NUMBER";
        case TokenType::COMPONENT_TYPE: return "COMPONENT_TYPE";
        case TokenType::ARROW: return "ARROW";
        case TokenType::COMMA: return "COMMA";
        case TokenType::LPAREN: return "LPAREN";
        case TokenType::RPAREN: return "RPAREN";
        case TokenType::NEWLINE: return "NEWLINE";
        case TokenType::COMMENT: return "COMMENT";
        case TokenType::END_OF_FILE: return "EOF";
        case TokenType::UNKNOWN: return "UNKNOWN";
        default: return "INVALID";
    }
}

} // namespace circuitsim

#endif // CIRCUITSIM_TOKEN_H
