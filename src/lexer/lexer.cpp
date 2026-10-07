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
    
    // Allow alphanumeric and underscore in @ keywords
    while (!isAtEnd() && (isAlphaNumeric(peek()) || peek() == '_')) {
        advance();
    }
    
    std::string keyword = source_.substr(start, current_ - start);
    
    // Generic component
    if (keyword == "comp") {
        return makeToken(TokenType::COMP, "@comp");
    }
    // Board
    if (keyword == "board") {
        return makeToken(TokenType::BOARD, "@board");
    }
    
    // Passive components
    if (keyword == "resistor") {
        return makeToken(TokenType::RESISTOR, "@resistor");
    }
    if (keyword == "capacitor") {
        return makeToken(TokenType::CAPACITOR, "@capacitor");
    }
    if (keyword == "inductor") {
        return makeToken(TokenType::INDUCTOR, "@inductor");
    }
    if (keyword == "potentiometer") {
        return makeToken(TokenType::POTENTIOMETER, "@potentiometer");
    }
    
    // Diodes
    if (keyword == "diode") {
        return makeToken(TokenType::DIODE, "@diode");
    }
    if (keyword == "zener_diode") {
        return makeToken(TokenType::ZENER_DIODE, "@zener_diode");
    }
    if (keyword == "schottky_diode") {
        return makeToken(TokenType::SCHOTTKY_DIODE, "@schottky_diode");
    }
    
    // LEDs and optical
    if (keyword == "led") {
        return makeToken(TokenType::LED, "@led");
    }
    if (keyword == "ir_led") {
        return makeToken(TokenType::IR_LED, "@ir_led");
    }
    if (keyword == "photodiode") {
        return makeToken(TokenType::PHOTODIODE, "@photodiode");
    }
    if (keyword == "ldr") {
        return makeToken(TokenType::LDR, "@ldr");
    }
    
    // Transistors - BJT
    if (keyword == "npn") {
        return makeToken(TokenType::NPN, "@npn");
    }
    if (keyword == "pnp") {
        return makeToken(TokenType::PNP, "@pnp");
    }
    
    // Transistors - MOSFET
    if (keyword == "nmos") {
        return makeToken(TokenType::NMOS, "@nmos");
    }
    if (keyword == "pmos") {
        return makeToken(TokenType::PMOS, "@pmos");
    }
    
    // Logic gates - 2 input
    if (keyword == "AND") {
        return makeToken(TokenType::AND_GATE, "@AND");
    }
    if (keyword == "OR") {
        return makeToken(TokenType::OR_GATE, "@OR");
    }
    if (keyword == "XOR") {
        return makeToken(TokenType::XOR_GATE, "@XOR");
    }
    if (keyword == "NAND") {
        return makeToken(TokenType::NAND_GATE, "@NAND");
    }
    if (keyword == "NOR") {
        return makeToken(TokenType::NOR_GATE, "@NOR");
    }
    if (keyword == "NOT") {
        return makeToken(TokenType::NOT_GATE, "@NOT");
    }
    
    // Logic gates - 3 input
    if (keyword == "AND3") {
        return makeToken(TokenType::AND3_GATE, "@AND3");
    }
    if (keyword == "NAND3") {
        return makeToken(TokenType::NAND3_GATE, "@NAND3");
    }
    if (keyword == "NOR3") {
        return makeToken(TokenType::NOR3_GATE, "@NOR3");
    }
    
    // Logic gates - 4 input
    if (keyword == "AND4") {
        return makeToken(TokenType::AND4_GATE, "@AND4");
    }
    if (keyword == "NAND4") {
        return makeToken(TokenType::NAND4_GATE, "@NAND4");
    }
    
    // Multiplexers
    if (keyword == "mux_4x1") {
        return makeToken(TokenType::MUX_4X1, "@mux_4x1");
    }
    if (keyword == "mux_8x1") {
        return makeToken(TokenType::MUX_8X1, "@mux_8x1");
    }
    
    // Decoders/Encoders
    if (keyword == "decoder_3to8") {
        return makeToken(TokenType::DECODER_3TO8, "@decoder_3to8");
    }
    if (keyword == "decoder_2to4") {
        return makeToken(TokenType::DECODER_2TO4, "@decoder_2to4");
    }
    if (keyword == "encoder_8to3") {
        return makeToken(TokenType::ENCODER_8TO3, "@encoder_8to3");
    }
    
    // Shift registers
    if (keyword == "shift_reg_8") {
        return makeToken(TokenType::SHIFT_REG_8, "@shift_reg_8");
    }
    if (keyword == "shift_reg_8_parallel") {
        return makeToken(TokenType::SHIFT_REG_8_PAR, "@shift_reg_8_parallel");
    }
    
    // Flip-flops
    if (keyword == "d_flipflop") {
        return makeToken(TokenType::D_FLIPFLOP, "@d_flipflop");
    }
    if (keyword == "jk_flipflop") {
        return makeToken(TokenType::JK_FLIPFLOP, "@jk_flipflop");
    }
    if (keyword == "latch_8") {
        return makeToken(TokenType::LATCH_8, "@latch_8");
    }
    
    // Counters
    if (keyword == "counter_4bit") {
        return makeToken(TokenType::COUNTER_4BIT, "@counter_4bit");
    }
    if (keyword == "counter_decade") {
        return makeToken(TokenType::COUNTER_DECADE, "@counter_decade");
    }
    
    // Switches
    if (keyword == "switch_spst") {
        return makeToken(TokenType::SWITCH_SPST, "@switch_spst");
    }
    if (keyword == "switch_spdt") {
        return makeToken(TokenType::SWITCH_SPDT, "@switch_spdt");
    }
    if (keyword == "pushbutton") {
        return makeToken(TokenType::PUSHBUTTON, "@pushbutton");
    }
    
    // Displays
    if (keyword == "display_7seg") {
        return makeToken(TokenType::DISPLAY_7SEG, "@display_7seg");
    }
    
    // Buzzers
    if (keyword == "buzzer") {
        return makeToken(TokenType::BUZZER, "@buzzer");
    }
    if (keyword == "passive_buzzer") {
        return makeToken(TokenType::PASSIVE_BUZZER, "@passive_buzzer");
    }
    
    // Motors
    if (keyword == "motor_dc") {
        return makeToken(TokenType::MOTOR_DC, "@motor_dc");
    }
    if (keyword == "servo") {
        return makeToken(TokenType::SERVO, "@servo");
    }
    
    // Power
    if (keyword == "battery") {
        return makeToken(TokenType::BATTERY, "@battery");
    }
    if (keyword == "regulator") {
        return makeToken(TokenType::REGULATOR, "@regulator");
    }
    
    // Crystal
    if (keyword == "crystal") {
        return makeToken(TokenType::CRYSTAL, "@crystal");
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
    
    // Check for known board types specifically (breadboard_830, breadboard_400, breadboard_170)
    // Don't classify arbitrary underscore identifiers as COMPONENT_TYPE
    if (text.find("breadboard_") == 0) {
        return makeToken(TokenType::COMPONENT_TYPE, text);
    }
    
    return makeToken(TokenType::IDENTIFIER, text);
}

Token Lexer::scanNumber() {
    size_t start = current_;
    tokenStartColumn_ = column_;
    
    // Scan digits
    while (!isAtEnd() && isDigit(peek())) {
        advance();
    }
    
    // Allow decimal point followed by more digits
    if (!isAtEnd() && peek() == '.' && current_ + 1 < source_.size() && isDigit(source_[current_ + 1])) {
        advance(); // consume '.'
        while (!isAtEnd() && isDigit(peek())) {
            advance();
        }
    }
    
    // Allow alphanumeric suffix for component part numbers (e.g., 2N2222, 10k, 100uF)
    // This handles cases like: 10k, 4.7k, 2N2222, 100uF, BC547
    while (!isAtEnd() && (isAlphaNumeric(peek()) || peek() == '%')) {
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
