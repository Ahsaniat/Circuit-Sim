#include "lexer.h"
#include <unordered_map>

namespace circuitsim {

static const std::unordered_map<std::string, TokenType> keywords = {
    {"def", TokenType::DEF},
    {"map", TokenType::MAP},
    {"pin", TokenType::PIN},
    {"input", TokenType::TYPE_INPUT},
    {"output", TokenType::TYPE_OUTPUT},
    {"gnd", TokenType::TYPE_GND},
    {"vcc", TokenType::TYPE_VCC}
};

Lexer::Lexer(const std::string& source)
    : source_(source)
    , current_(0)
    , line_(1)
    , column_(1)
    , tokenStartColumn_(1)
    , errorCallback_(nullptr) {}

void Lexer::setErrorCallback(ErrorCallback callback) {
    errorCallback_ = callback;
}

std::vector<Token> Lexer::tokenize() {
    std::vector<Token> tokens;
    
    while (!isAtEnd()) {
        skipWhitespace();
        if (isAtEnd()) break;
        
        Token token = scanToken();
        if (token.type != TokenType::COMMENT) {
            tokens.push_back(token);
        }
    }
    
    tokens.push_back(makeToken(TokenType::END_OF_FILE, ""));
    return tokens;
}

char Lexer::peek() const {
    if (isAtEnd()) return '\0';
    return source_[current_];
}

char Lexer::peekNext() const {
    if (current_ + 1 >= source_.size()) return '\0';
    return source_[current_ + 1];
}

char Lexer::advance() {
    char c = source_[current_++];
    if (c == '\n') {
        line_++;
        column_ = 1;
    } else {
        column_++;
    }
    return c;
}

bool Lexer::isAtEnd() const {
    return current_ >= source_.size();
}

bool Lexer::match(char expected) {
    if (isAtEnd() || source_[current_] != expected) return false;
    advance();
    return true;
}

void Lexer::skipWhitespace() {
    while (!isAtEnd()) {
        char c = peek();
        if (c == ' ' || c == '\t' || c == '\r') {
            advance();
        } else {
            break;
        }
    }
}

Token Lexer::makeToken(TokenType type, const std::string& lexeme) {
    return Token(type, lexeme, SourceLocation(line_, tokenStartColumn_));
}

Token Lexer::scanToken() {
    tokenStartColumn_ = column_;
    char c = advance();

    switch (c) {
        case '(': return makeToken(TokenType::LPAREN, "(");
        case ')': return makeToken(TokenType::RPAREN, ")");
        case ',': return makeToken(TokenType::COMMA, ",");
        case '\n': return makeToken(TokenType::NEWLINE, "\\n");
        
        case '-':
            if (match('>')) {
                return makeToken(TokenType::ARROW, "->");
            }
            reportError("Expected '>' after '-'");
            return makeToken(TokenType::UNKNOWN, "-");
        
        case '/':
            if (peek() == '/') {
                return scanComment();
            }
            reportError("Unexpected character '/'");
            return makeToken(TokenType::UNKNOWN, "/");
        
        case '@':
            return scanAtKeyword();
        
        default:
            if (isDigit(c)) {
                current_--;
                column_--;
                return scanNumber();
            }
            if (isAlpha(c) || c == '_') {
                current_--;
                column_--;
                return scanIdentifierOrKeyword();
            }
            
            reportError(std::string("Unexpected character '") + c + "'");
            return makeToken(TokenType::UNKNOWN, std::string(1, c));
    }
}

Token Lexer::scanAtKeyword() {
    size_t start = current_;
    
    while (!isAtEnd() && isAlpha(peek())) {
        advance();
    }
    
    std::string keyword = source_.substr(start, current_ - start);
    
    if (keyword == "comp") {
        return makeToken(TokenType::COMP, "@comp");
    } else if (keyword == "board") {
        return makeToken(TokenType::BOARD, "@board");
    }
    
    reportError("Unknown directive '@" + keyword + "'");
    return makeToken(TokenType::UNKNOWN, "@" + keyword);
}

Token Lexer::scanIdentifierOrKeyword() {
    size_t start = current_;
    tokenStartColumn_ = column_;
    
    while (!isAtEnd() && (isAlphaNumeric(peek()) || peek() == '_')) {
        advance();
    }
    
    std::string text = source_.substr(start, current_ - start);
    
    auto it = keywords.find(text);
    if (it != keywords.end()) {
        return makeToken(it->second, text);
    }
    
    // Check if it looks like a component type (starts with digit, like "7408")
    // Component types are IC part numbers that typically start with numbers
    if (!text.empty() && isDigit(text[0])) {
        return makeToken(TokenType::COMPONENT_TYPE, text);
    }
    
    // Check for board types (contain underscore, like "breadboard_830")
    if (text.find('_') != std::string::npos) {
        return makeToken(TokenType::COMPONENT_TYPE, text);
    }
    
    return makeToken(TokenType::IDENTIFIER, text);
}

Token Lexer::scanNumber() {
    size_t start = current_;
    tokenStartColumn_ = column_;
    
    while (!isAtEnd() && isDigit(peek())) {
        advance();
    }
    
    return makeToken(TokenType::NUMBER, source_.substr(start, current_ - start));
}

Token Lexer::scanComment() {
    advance(); // consume second '/'
    
    size_t start = current_;
    while (!isAtEnd() && peek() != '\n') {
        advance();
    }
    
    return makeToken(TokenType::COMMENT, source_.substr(start, current_ - start));
}

bool Lexer::isDigit(char c) const {
    return c >= '0' && c <= '9';
}

bool Lexer::isAlpha(char c) const {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
}

bool Lexer::isAlphaNumeric(char c) const {
    return isAlpha(c) || isDigit(c);
}

void Lexer::reportError(const std::string& message) {
    if (errorCallback_) {
        errorCallback_(message, SourceLocation(line_, tokenStartColumn_));
    }
}

} // namespace circuitsim
