#ifndef CIRCUITSIM_PARSER_H
#define CIRCUITSIM_PARSER_H

#include "ast.h"
#include "../lexer/token.h"
#include "../error/error_reporter.h"
#include <vector>
#include <memory>

namespace circuitsim {

class Parser {
public:
    Parser(const std::vector<Token>& tokens, ErrorReporter& errorReporter);
    
    std::unique_ptr<ProgramNode> parse();

private:
    const std::vector<Token>& tokens_;
    size_t current_;
    ErrorReporter& errorReporter_;

    // Token navigation
    const Token& peek() const;
    const Token& previous() const;
    const Token& advance();
    bool isAtEnd() const;
    TokenType peekType(size_t offset) const;
    bool check(TokenType type) const;
    bool match(TokenType type);
    bool match(std::initializer_list<TokenType> types);
    Token consume(TokenType type, const std::string& message);
    
    // Component keyword detection
    bool isComponentKeyword(TokenType type) const;
    bool matchComponentKeyword();
    std::string getComponentTypeFromKeyword(TokenType type) const;
    
    void skipNewlines();
    void synchronize();
    void skipToConnectionEnd();
    
    // Parsing methods
    std::unique_ptr<CompDeclNode> parseCompDecl();
    std::unique_ptr<CompDeclNode> parseTypedCompDecl();  // For @resistor, @AND, etc.
    std::unique_ptr<BoardDeclNode> parseBoardDecl();
    std::unique_ptr<ICDefNode> parseICDef();
    std::unique_ptr<MapBlockNode> parseMapBlock();
    std::unique_ptr<PlaceNode> parsePlaceStatement();
    std::unique_ptr<ConnectionNode> parseConnection();
    std::unique_ptr<PinRefNode> parsePinRef();
    std::unique_ptr<PinDeclNode> parsePinDecl();
    
    void reportError(const std::string& message);
};

} // namespace circuitsim

#endif // CIRCUITSIM_PARSER_H
