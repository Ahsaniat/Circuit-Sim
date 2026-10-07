#ifndef CIRCUITSIM_LEXER_H
#define CIRCUITSIM_LEXER_H

#include "token.h"
#include <string>
#include <vector>
#include <functional>

namespace circuitsim {

using ErrorCallback = std::function<void(const std::string&, SourceLocation)>;

class Lexer {
public:
    explicit Lexer(const std::string& source);
    
    std::vector<Token> tokenize();
    void setErrorCallback(ErrorCallback callback);

private:
    std::string source_;
    size_t current_;
    int line_;
    int column_;
    int tokenStartColumn_;
    ErrorCallback errorCallback_;

    char peek() const;
    char advance();
    bool isAtEnd() const;
    bool match(char expected);
    
    void skipWhitespace();
    Token scanToken();
    Token makeToken(TokenType type, const std::string& lexeme);
    
    Token scanIdentifierOrKeyword();
    Token scanNumber();
    Token scanComment();
    Token scanAtKeyword();
    
    bool isDigit(char c) const;
    bool isAlpha(char c) const;
    bool isAlphaNumeric(char c) const;
    
    void reportError(const std::string& message);
};

} // namespace circuitsim

#endif // CIRCUITSIM_LEXER_H
