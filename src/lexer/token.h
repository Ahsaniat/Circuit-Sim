#ifndef CIRCUITSIM_TOKEN_H
#define CIRCUITSIM_TOKEN_H

#include <string>
#include <unordered_map>

namespace circuitsim {

enum class TokenType {
    // Keywords
    COMP,       // @comp (generic component)
    BOARD,      // @board
    DEF,        // def
    MAP,        // map
    PIN,        // pin
    
    // Component-specific keywords (all map to component declarations)
    RESISTOR,       // @resistor
    CAPACITOR,      // @capacitor
    INDUCTOR,       // @inductor
    POTENTIOMETER,  // @potentiometer
    DIODE,          // @diode
    ZENER_DIODE,    // @zener_diode
    SCHOTTKY_DIODE, // @schottky_diode
    LED,            // @led
    IR_LED,         // @ir_led
    PHOTODIODE,     // @photodiode
    LDR,            // @ldr
    NPN,            // @npn (BJT)
    PNP,            // @pnp (BJT)
    NMOS,           // @nmos (MOSFET)
    PMOS,           // @pmos (MOSFET)
    AND_GATE,       // @AND
    OR_GATE,        // @OR
    XOR_GATE,       // @XOR
    NAND_GATE,      // @NAND
    NOR_GATE,       // @NOR
    NOT_GATE,       // @NOT
    AND3_GATE,      // @AND3
    NAND3_GATE,     // @NAND3
    NOR3_GATE,      // @NOR3
    AND4_GATE,      // @AND4
    NAND4_GATE,     // @NAND4
    MUX_4X1,        // @mux_4x1
    MUX_8X1,        // @mux_8x1
    DECODER_3TO8,   // @decoder_3to8
    DECODER_2TO4,   // @decoder_2to4
    ENCODER_8TO3,   // @encoder_8to3
    SHIFT_REG_8,    // @shift_reg_8
    SHIFT_REG_8_PAR,// @shift_reg_8_parallel
    D_FLIPFLOP,     // @d_flipflop
    JK_FLIPFLOP,    // @jk_flipflop
    LATCH_8,        // @latch_8
    COUNTER_4BIT,   // @counter_4bit
    COUNTER_DECADE, // @counter_decade

    // Extended component keywords (parity with the web compiler)
    SWITCH_SPST,    // @switch_spst
    SWITCH_SPDT,    // @switch_spdt
    PUSHBUTTON,     // @pushbutton
    DISPLAY_7SEG,   // @display_7seg
    BUZZER,         // @buzzer
    PASSIVE_BUZZER, // @passive_buzzer
    MOTOR_DC,       // @motor_dc
    SERVO,          // @servo
    BATTERY,        // @battery
    REGULATOR,      // @regulator
    CRYSTAL,        // @crystal

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
        case TokenType::RESISTOR: return "RESISTOR";
        case TokenType::CAPACITOR: return "CAPACITOR";
        case TokenType::INDUCTOR: return "INDUCTOR";
        case TokenType::POTENTIOMETER: return "POTENTIOMETER";
        case TokenType::DIODE: return "DIODE";
        case TokenType::ZENER_DIODE: return "ZENER_DIODE";
        case TokenType::SCHOTTKY_DIODE: return "SCHOTTKY_DIODE";
        case TokenType::LED: return "LED";
        case TokenType::IR_LED: return "IR_LED";
        case TokenType::PHOTODIODE: return "PHOTODIODE";
        case TokenType::LDR: return "LDR";
        case TokenType::NPN: return "NPN";
        case TokenType::PNP: return "PNP";
        case TokenType::NMOS: return "NMOS";
        case TokenType::PMOS: return "PMOS";
        case TokenType::AND_GATE: return "AND_GATE";
        case TokenType::OR_GATE: return "OR_GATE";
        case TokenType::XOR_GATE: return "XOR_GATE";
        case TokenType::NAND_GATE: return "NAND_GATE";
        case TokenType::NOR_GATE: return "NOR_GATE";
        case TokenType::NOT_GATE: return "NOT_GATE";
        case TokenType::AND3_GATE: return "AND3_GATE";
        case TokenType::NAND3_GATE: return "NAND3_GATE";
        case TokenType::NOR3_GATE: return "NOR3_GATE";
        case TokenType::AND4_GATE: return "AND4_GATE";
        case TokenType::NAND4_GATE: return "NAND4_GATE";
        case TokenType::MUX_4X1: return "MUX_4X1";
        case TokenType::MUX_8X1: return "MUX_8X1";
        case TokenType::DECODER_3TO8: return "DECODER_3TO8";
        case TokenType::DECODER_2TO4: return "DECODER_2TO4";
        case TokenType::ENCODER_8TO3: return "ENCODER_8TO3";
        case TokenType::SHIFT_REG_8: return "SHIFT_REG_8";
        case TokenType::SHIFT_REG_8_PAR: return "SHIFT_REG_8_PAR";
        case TokenType::D_FLIPFLOP: return "D_FLIPFLOP";
        case TokenType::JK_FLIPFLOP: return "JK_FLIPFLOP";
        case TokenType::LATCH_8: return "LATCH_8";
        case TokenType::COUNTER_4BIT: return "COUNTER_4BIT";
        case TokenType::COUNTER_DECADE: return "COUNTER_DECADE";
        case TokenType::SWITCH_SPST: return "SWITCH_SPST";
        case TokenType::SWITCH_SPDT: return "SWITCH_SPDT";
        case TokenType::PUSHBUTTON: return "PUSHBUTTON";
        case TokenType::DISPLAY_7SEG: return "DISPLAY_7SEG";
        case TokenType::BUZZER: return "BUZZER";
        case TokenType::PASSIVE_BUZZER: return "PASSIVE_BUZZER";
        case TokenType::MOTOR_DC: return "MOTOR_DC";
        case TokenType::SERVO: return "SERVO";
        case TokenType::BATTERY: return "BATTERY";
        case TokenType::REGULATOR: return "REGULATOR";
        case TokenType::CRYSTAL: return "CRYSTAL";
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
