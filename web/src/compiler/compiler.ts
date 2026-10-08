import { CircuitIR, BoardIR, Wire, Position } from '../types';
import { BreadboardGeometry } from '../geometry/BreadboardGeometry';
import { 
    ComponentCategory, 
    ComponentFootprint, 
    PlacementResult,
    getComponentFootprint, 
    calculatePlacement 
} from '../geometry/ComponentFootprints';
import { artFor, artDisplaySize } from '../renderer/componentArt';

interface Token {
    type: string;
    lexeme: string;
    line: number;
    column: number;
}

interface CompDecl {
    id: string;
    type: string;
    value?: string;  // For resistors, capacitors, etc.
    category: ComponentCategory;
    line: number;
    column: number;
}

interface BoardDecl {
    id: string;
    type: string;
    line: number;
    column: number;
}

interface PinRef {
    componentId: string;
    pinNumber: number;
    line: number;
    column: number;
}

interface Connection {
    source: PinRef;
    destinations: PinRef[];
    /** Board scope from `B1.map (...)`; undefined for a global map block. */
    boardId?: string;
    boardLine?: number;
    boardColumn?: number;
}

interface PlaceAssignment {
    refs: Array<{ id: string; line: number; column: number }>;
    boardId: string;
    line: number;
    column: number;
}

interface ParsedProgram {
    components: CompDecl[];
    boards: BoardDecl[];
    connections: Connection[];
    placements: PlaceAssignment[];
    customICs: CustomICDef[];
}

interface CustomICDef {
    name: string;
    pins: Array<{ name: string; type: string }>;
    line: number;
    column: number;
}

// Component categories for different rendering and pin layouts
// (Now imported from ComponentFootprints)

const KEYWORDS = new Set(['def', 'map', 'pin', 'input', 'output', 'gnd', 'vcc']);

// Component type keywords that can be used with @keyword syntax
const COMPONENT_KEYWORDS: Record<string, { category: ComponentCategory; defaultType: string; pinCount: number }> = {
    // Passive components (2 pins)
    'resistor': { category: 'passive', defaultType: 'RES', pinCount: 2 },
    'capacitor': { category: 'passive', defaultType: 'CAP', pinCount: 2 },
    'inductor': { category: 'passive', defaultType: 'IND', pinCount: 2 },
    'potentiometer': { category: 'passive', defaultType: 'POT', pinCount: 3 },
    
    // Diodes (2 pins)
    'diode': { category: 'diode', defaultType: 'DIODE', pinCount: 2 },
    'zener_diode': { category: 'diode', defaultType: 'ZENER', pinCount: 2 },
    'schottky_diode': { category: 'diode', defaultType: 'SCHOTTKY', pinCount: 2 },
    
    // LEDs and optical (2-3 pins)
    'led': { category: 'led', defaultType: 'LED', pinCount: 2 },
    'ir_led': { category: 'led', defaultType: 'IR_LED', pinCount: 2 },
    'photodiode': { category: 'led', defaultType: 'PHOTODIODE', pinCount: 2 },
    'ldr': { category: 'sensor', defaultType: 'LDR', pinCount: 2 },
    
    // Transistors (3 pins)
    'npn': { category: 'transistor', defaultType: 'NPN', pinCount: 3 },
    'pnp': { category: 'transistor', defaultType: 'PNP', pinCount: 3 },
    'nmos': { category: 'transistor', defaultType: 'NMOS', pinCount: 3 },
    'pmos': { category: 'transistor', defaultType: 'PMOS', pinCount: 3 },
    
    // Logic gates - dual input (14 pins, quad package)
    'AND': { category: 'ic', defaultType: '7408', pinCount: 14 },
    'OR': { category: 'ic', defaultType: '7432', pinCount: 14 },
    'XOR': { category: 'ic', defaultType: '7486', pinCount: 14 },
    'NAND': { category: 'ic', defaultType: '7400', pinCount: 14 },
    'NOR': { category: 'ic', defaultType: '7402', pinCount: 14 },
    'NOT': { category: 'ic', defaultType: '7404', pinCount: 14 },
    
    // Triple 3-input gates
    'AND3': { category: 'ic', defaultType: '7411', pinCount: 14 },
    'NAND3': { category: 'ic', defaultType: '7410', pinCount: 14 },
    'NOR3': { category: 'ic', defaultType: '7427', pinCount: 14 },
    
    // Dual 4-input gates
    'AND4': { category: 'ic', defaultType: '7421', pinCount: 14 },
    'NAND4': { category: 'ic', defaultType: '7420', pinCount: 14 },
    
    // Multiplexers
    'mux_4x1': { category: 'ic', defaultType: '74153', pinCount: 16 },
    'mux_8x1': { category: 'ic', defaultType: '74151', pinCount: 16 },
    
    // Decoders/Encoders
    'decoder_3to8': { category: 'ic', defaultType: '74138', pinCount: 16 },
    'decoder_2to4': { category: 'ic', defaultType: '74139', pinCount: 16 },
    'encoder_8to3': { category: 'ic', defaultType: '74148', pinCount: 16 },
    
    // Shift registers
    'shift_reg_8': { category: 'ic', defaultType: '74164', pinCount: 14 },
    'shift_reg_8_parallel': { category: 'ic', defaultType: '74165', pinCount: 16 },
    
    // Flip-flops and latches
    'd_flipflop': { category: 'ic', defaultType: '7474', pinCount: 14 },
    'jk_flipflop': { category: 'ic', defaultType: '7476', pinCount: 16 },
    'latch_8': { category: 'ic', defaultType: '74373', pinCount: 20 },
    
    // Counters
    'counter_4bit': { category: 'ic', defaultType: '74161', pinCount: 16 },
    'counter_decade': { category: 'ic', defaultType: '7490', pinCount: 14 },

    // Switches
    'switch_spst': { category: 'switch', defaultType: 'SPST', pinCount: 2 },
    'switch_spdt': { category: 'switch', defaultType: 'SPDT', pinCount: 3 },
    'pushbutton': { category: 'switch', defaultType: 'PUSHBUTTON', pinCount: 4 },

    // Displays
    'display_7seg': { category: 'display', defaultType: '7SEG', pinCount: 10 },

    // Buzzers
    'buzzer': { category: 'buzzer', defaultType: 'ACTIVE', pinCount: 2 },
    'passive_buzzer': { category: 'buzzer', defaultType: 'PASSIVE_BUZZER', pinCount: 2 },

    // Motors
    'motor_dc': { category: 'motor', defaultType: 'DC', pinCount: 2 },
    'servo': { category: 'motor', defaultType: 'SERVO', pinCount: 3 },

    // Power
    'battery': { category: 'power', defaultType: 'BATTERY', pinCount: 2 },
    'regulator': { category: 'power', defaultType: 'REGULATOR', pinCount: 3 },

    // Crystal
    'crystal': { category: 'crystal', defaultType: 'CRYSTAL', pinCount: 2 },
};

// Built-in IC pin counts (extended)
const BUILTIN_ICS: Record<string, number> = {
    // 74xx series - basic gates
    '7400': 14, '7402': 14, '7404': 14, '7408': 14,
    '7410': 14, '7411': 14, '7420': 14, '7421': 14,
    '7427': 14, '7432': 14, '7486': 14,
    
    // 74xx series - flip-flops and counters
    '7447': 16, '7474': 14, '7476': 16, '7490': 14,
    
    // 74xx series - decoders, mux, shift registers
    '74138': 16, '74139': 16, '74148': 16,
    '74151': 16, '74153': 16,
    '74161': 16, '74164': 14, '74165': 16,
    '74173': 16, '74181': 24,
    '74245': 20, '74373': 20, '74374': 20,
    
    // Timer ICs
    '555': 8, 'NE555': 8,
    
    // Op-amps
    '741': 8, 'LM741': 8, 'LM358': 8,
    
    // 74HC series (same pinouts as their 74xx counterparts) and friends
    '74HC00': 14, '74HC02': 14, '74HC04': 14, '74HC08': 14,
    '74HC10': 14, '74HC11': 14, '74HC14': 14, '74HC20': 14,
    '74HC21': 14, '74HC27': 14, '74HC32': 14, '74HC73': 14,
    '74HC74': 14, '74HC86': 14, '74HC93': 14, '74HC132': 14,
    '74HC75': 16, '74HC283': 16, '74HC595': 16, '74HC4017': 16,
    'CD4511': 16, 'PCF8574': 16,
    '556': 14,
    
    // Comparators
    'LM393': 8, 'LM339': 14,
    
    // Simple components (2-3 pins)
    'RES': 2, 'CAP': 2, 'IND': 2, 'POT': 3,
    'DIODE': 2, 'ZENER': 2, 'SCHOTTKY': 2,
    'LED': 2, 'IR_LED': 2, 'PHOTODIODE': 2, 'LDR': 2,
    'NPN': 3, 'PNP': 3, 'NMOS': 3, 'PMOS': 3,

    // Switches, displays, audio, motors, power, crystal
    'SPST': 2, 'SPDT': 3, 'PUSHBUTTON': 4,
    '7SEG': 10,
    'ACTIVE': 2, 'PASSIVE_BUZZER': 2,
    'DC': 2, 'SERVO': 3,
    'BATTERY': 2, 'REGULATOR': 3,
    'CRYSTAL': 2,
};

export class CompileError extends Error {
    constructor(message: string, public line: number, public column: number) {
        super(`Line ${line}, Col ${column}: ${message}`);
    }
}

class Lexer {
    private source: string;
    private current = 0;
    private line = 1;
    private column = 1;
    private tokens: Token[] = [];

    constructor(source: string) {
        this.source = source;
    }

    tokenize(): Token[] {
        while (!this.isAtEnd()) {
            this.skipWhitespace();
            if (this.isAtEnd()) break;
            this.scanToken();
        }
        this.tokens.push({ type: 'EOF', lexeme: '', line: this.line, column: this.column });
        return this.tokens;
    }

    private isAtEnd(): boolean {
        return this.current >= this.source.length;
    }

    private peek(): string {
        return this.isAtEnd() ? '\0' : this.source[this.current];
    }

    private advance(): string {
        const c = this.source[this.current++];
        if (c === '\n') {
            this.line++;
            this.column = 1;
        } else {
            this.column++;
        }
        return c;
    }

    private skipWhitespace(): void {
        while (!this.isAtEnd()) {
            const c = this.peek();
            if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
                this.advance();
            } else if (c === '/' && this.source[this.current + 1] === '/') {
                while (!this.isAtEnd() && this.peek() !== '\n') this.advance();
            } else {
                break;
            }
        }
    }

    private scanToken(): void {
        const startCol = this.column;
        const c = this.advance();

        switch (c) {
            case '(': this.addToken('LPAREN', '(', startCol); break;
            case ')': this.addToken('RPAREN', ')', startCol); break;
            case ',': this.addToken('COMMA', ',', startCol); break;
            case '.': this.addToken('DOT', '.', startCol); break;
            case '-':
                if (this.peek() === '>') {
                    this.advance();
                    this.addToken('ARROW', '->', startCol);
                } else {
                    throw new CompileError("Unexpected character '-'", this.line, startCol);
                }
                break;
            case '@':
                this.scanAtKeyword(startCol);
                break;
            default:
                if (this.isDigit(c)) {
                    this.scanNumber(c, startCol);
                } else if (this.isAlpha(c) || c === '_') {
                    this.scanIdentifier(c, startCol);
                } else {
                    throw new CompileError(`Unexpected character '${c}'`, this.line, startCol);
                }
        }
    }

    private scanAtKeyword(startCol: number): void {
        let keyword = '';
        while (!this.isAtEnd() && (this.isAlphaNumeric(this.peek()) || this.peek() === '_')) {
            keyword += this.advance();
        }
        
        if (keyword === 'comp') {
            this.addToken('COMP', '@comp', startCol);
        } else if (keyword === 'board') {
            this.addToken('BOARD', '@board', startCol);
        } else if (COMPONENT_KEYWORDS[keyword]) {
            // New component-specific keywords like @resistor, @AND, @led, etc.
            this.addToken('COMP_TYPE', '@' + keyword, startCol);
        } else {
            // Unknown directives must fail loudly: silently dropping them hides
            // typos and unsupported components behind a successful compile.
            throw new CompileError(`Unknown directive '@${keyword}'`, this.line, startCol);
        }
    }

    private scanIdentifier(first: string, startCol: number): void {
        let text = first;
        while (!this.isAtEnd() && (this.isAlphaNumeric(this.peek()) || this.peek() === '_')) {
            text += this.advance();
        }

        if (text === 'map') {
            this.addToken('MAP', text, startCol);
        } else if (text === 'pin') {
            this.addToken('PIN', text, startCol);
        } else if (text === 'def') {
            this.addToken('DEF', text, startCol);
        } else if (text === 'place') {
            this.addToken('PLACE', text, startCol);
        } else if (text === 'on') {
            this.addToken('ON', text, startCol);
        } else if (KEYWORDS.has(text)) {
            this.addToken('KEYWORD', text, startCol);
        } else {
            this.addToken('IDENTIFIER', text, startCol);
        }
    }

    private scanNumber(first: string, startCol: number): void {
        let num = first;
        while (!this.isAtEnd() && this.isDigit(this.peek())) {
            num += this.advance();
        }

        // Decimal point followed by digits (e.g. 4.7k)
        if (!this.isAtEnd() && this.peek() === '.' && this.isDigit(this.source[this.current + 1] ?? '')) {
            num += this.advance(); // consume '.'
            while (!this.isAtEnd() && this.isDigit(this.peek())) {
                num += this.advance();
            }
        }

        // Alphanumeric unit/part-number suffix (e.g. 10k, 100uF, 2N2222, 16MHz, 50%)
        while (!this.isAtEnd() && (this.isAlphaNumeric(this.peek()) || this.peek() === '%')) {
            num += this.advance();
        }

        this.addToken('NUMBER', num, startCol);
    }

    private addToken(type: string, lexeme: string, column: number): void {
        this.tokens.push({ type, lexeme, line: this.line, column });
    }

    private isDigit(c: string): boolean {
        return c >= '0' && c <= '9';
    }

    private isAlpha(c: string): boolean {
        return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
    }

    private isAlphaNumeric(c: string): boolean {
        return this.isAlpha(c) || this.isDigit(c);
    }
}

class Parser {
    private tokens: Token[];
    private current = 0;

    constructor(tokens: Token[]) {
        this.tokens = tokens;
    }

    parse(): ParsedProgram {
        const program: ParsedProgram = {
            components: [],
            boards: [],
            connections: [],
            placements: [],
            customICs: []
        };

        while (!this.isAtEnd()) {
            if (this.match('COMP')) {
                program.components.push(this.parseCompDecl());
            } else if (this.match('COMP_TYPE')) {
                // New syntax: @resistor R1 10k, @AND A1 7408
                program.components.push(this.parseTypedCompDecl());
            } else if (this.match('BOARD')) {
                program.boards.push(this.parseBoardDecl());
            } else if (this.check('PLACE')) {
                program.placements.push(this.parsePlaceStatement());
            } else if (this.check('IDENTIFIER') && this.checkNext('MAP')) {
                // Board-scoped map without dot: B1 map ( ... )
                const boardToken = this.advance();
                this.advance(); // 'map'
                const connections = this.parseMapBlock();
                this.applyScope(connections, boardToken);
                program.connections.push(...connections);
            } else if (this.check('IDENTIFIER') && this.checkNext('DOT') && this.checkNextN(2, 'MAP')) {
                // Canonical form: B1.map ( ... )
                const boardToken = this.advance();
                this.advance(); // '.'
                this.advance(); // 'map'
                const connections = this.parseMapBlock();
                this.applyScope(connections, boardToken);
                program.connections.push(...connections);
            } else if (this.match('MAP')) {
                // Global map block; unplaced components default to the first board.
                program.connections.push(...this.parseMapBlock());
            } else if (this.match('DEF')) {
                program.customICs.push(this.parseICDef());
            } else {
                // Strict mode: never silently discard tokens. A stray token is
                // almost always a typo that must be reported with its location.
                const token = this.peek();
                throw new CompileError(`Unexpected token '${token.lexeme}'`, token.line, token.column);
            }
        }

        return program;
    }

    private checkNext(type: string): boolean {
        return this.tokens[this.current + 1]?.type === type;
    }

    private checkNextN(offset: number, type: string): boolean {
        return this.tokens[this.current + offset]?.type === type;
    }

    private applyScope(connections: Connection[], boardToken: Token): void {
        for (const connection of connections) {
            connection.boardId = boardToken.lexeme;
            connection.boardLine = boardToken.line;
            connection.boardColumn = boardToken.column;
        }
    }

    private parsePlaceStatement(): PlaceAssignment {
        const placeToken = this.advance(); // 'place'
        const refs: Array<{ id: string; line: number; column: number }> = [];
        do {
            const idToken = this.consume('IDENTIFIER', 'Expected component identifier after place');
            refs.push({ id: idToken.lexeme, line: idToken.line, column: idToken.column });
        } while (this.match('COMMA'));
        this.consume('ON', "Expected 'on' in place statement");
        const boardToken = this.consume('IDENTIFIER', "Expected board identifier after 'on'");
        return {
            refs,
            boardId: boardToken.lexeme,
            line: placeToken.line,
            column: placeToken.column
        };
    }

    private parseCompDecl(): CompDecl {
        const idToken = this.consume('IDENTIFIER', 'Expected component identifier');
        const type = this.consumeAny(['IDENTIFIER', 'NUMBER'], 'Expected component type').lexeme;
        return { id: idToken.lexeme, type, category: 'ic', line: idToken.line, column: idToken.column };
    }
    
    private parseTypedCompDecl(): CompDecl {
        // Previous token was COMP_TYPE like @resistor, @AND, etc.
        const compTypeToken = this.tokens[this.current - 1];
        const compKeyword = compTypeToken.lexeme.substring(1); // Remove @
        
        const compInfo = COMPONENT_KEYWORDS[compKeyword];
        if (!compInfo) {
            throw new CompileError(`Unknown component type: ${compKeyword}`, compTypeToken.line, compTypeToken.column);
        }
        
        // Parse component identifier
        const idToken = this.consume('IDENTIFIER', 'Expected component identifier');
        const id = idToken.lexeme;
        
        // Parse optional value or IC number
        let type = compInfo.defaultType;
        let value: string | undefined;
        
        if (!this.isAtEnd() && !this.check('COMP') && !this.check('COMP_TYPE') && 
            !this.check('BOARD') && !this.check('MAP') && !this.check('DEF')) {
            // Check for value/type specification
            if (this.check('NUMBER') || this.check('IDENTIFIER')) {
                const valueToken = this.advance();
                // For passive components, this is the value (10k, 100uF)
                // For ICs/gates, this might be the IC number (7408)
                if (compInfo.category === 'passive' || compInfo.category === 'diode' || 
                    compInfo.category === 'led' || compInfo.category === 'sensor' ||
                    compInfo.category === 'transistor') {
                    value = valueToken.lexeme;
                } else {
                    // For ICs, use as type if it's a valid IC number
                    if (BUILTIN_ICS[valueToken.lexeme]) {
                        type = valueToken.lexeme;
                    } else {
                        value = valueToken.lexeme;
                    }
                }
            }
        }
        
        return { id, type, value, category: compInfo.category, line: idToken.line, column: idToken.column };
    }

    private parseBoardDecl(): BoardDecl {
        const idToken = this.consume('IDENTIFIER', 'Expected board identifier');
        const type = this.consume('IDENTIFIER', 'Expected board type').lexeme;
        return { id: idToken.lexeme, type, line: idToken.line, column: idToken.column };
    }

    private parseMapBlock(): Connection[] {
        const connections: Connection[] = [];
        this.consume('LPAREN', "Expected '(' after map");

        while (!this.check('RPAREN') && !this.isAtEnd()) {
            connections.push(this.parseConnection());
        }

        this.consume('RPAREN', "Expected ')' to close map block");
        return connections;
    }

    private parseConnection(): Connection {
        this.consume('LPAREN', "Expected '(' to start connection");

        const source = this.parsePinRef();
        this.consume('ARROW', "Expected '->' after source pin");

        const destinations: PinRef[] = [];
        do {
            destinations.push(this.parsePinRef());
        } while (this.match('COMMA'));

        this.consume('RPAREN', "Expected ')' to close connection");

        return { source, destinations };
    }

    private parsePinRef(): PinRef {
        const componentId = this.consume('IDENTIFIER', 'Expected component identifier');
        this.consume('PIN', "Expected 'pin' keyword");
        const pinToken = this.consume('NUMBER', 'Expected pin number');
        // NUMBER tokens may carry suffixes (10k, 2N2222); a pin must be digits.
        if (!/^\d+$/.test(pinToken.lexeme)) {
            throw new CompileError(`Invalid pin number '${pinToken.lexeme}'`, pinToken.line, pinToken.column);
        }
        const pinNumber = parseInt(pinToken.lexeme, 10);
        return { componentId: componentId.lexeme, pinNumber, line: componentId.line, column: componentId.column };
    }

    private parseICDef(): CustomICDef {
        const nameToken = this.consumeAny(['IDENTIFIER', 'NUMBER'], "Expected IC name after 'def'");
        this.consume('LPAREN', "Expected '(' after IC name");
        const pins: Array<{ name: string; type: string }> = [];

        while (!this.check('RPAREN') && !this.isAtEnd()) {
            const pinName = this.consume('IDENTIFIER', 'Expected pin name');
            this.consume('ARROW', "Expected '->' after pin name");
            const typeToken = this.peek();
            if (typeToken.type === 'KEYWORD' && ['input', 'output', 'gnd', 'vcc'].includes(typeToken.lexeme)) {
                this.advance();
                pins.push({ name: pinName.lexeme, type: typeToken.lexeme });
            } else {
                throw new CompileError('Expected pin type (input, output, gnd, vcc)', typeToken.line, typeToken.column);
            }
            if (!this.match('COMMA')) break;
        }

        this.consume('RPAREN', "Expected ')' to close IC definition");
        return { name: nameToken.lexeme, pins, line: nameToken.line, column: nameToken.column };
    }

    private peek(): Token {
        return this.tokens[this.current];
    }

    private advance(): Token {
        if (!this.isAtEnd()) this.current++;
        return this.tokens[this.current - 1];
    }

    private isAtEnd(): boolean {
        return this.peek().type === 'EOF';
    }

    private check(type: string): boolean {
        return !this.isAtEnd() && this.peek().type === type;
    }

    private match(type: string): boolean {
        if (this.check(type)) {
            this.advance();
            return true;
        }
        return false;
    }

    private consume(type: string, message: string): Token {
        if (this.check(type)) return this.advance();
        const token = this.peek();
        throw new CompileError(message, token.line, token.column);
    }

    private consumeAny(types: string[], message: string): Token {
        for (const type of types) {
            if (this.check(type)) return this.advance();
        }
        const token = this.peek();
        throw new CompileError(message, token.line, token.column);
    }
}

class IRGenerator {
    private symbols: Map<string, { kind: string; type: string; category: ComponentCategory }> = new Map();
    
    // Hole occupancy tracking: key = "col,row" (e.g., "5,D"), value = componentId or wire index
    private occupiedHoles: Map<string, string> = new Map();
    
    // Component placements - stores footprint and placement info for each component
    private componentPlacements: Map<string, { footprint: ComponentFootprint; placement: PlacementResult }> = new Map();
    
    // Board geometries and per-board placement state
    private boardGeometries: Map<string, BreadboardGeometry> = new Map();
    private componentBoards: Map<string, string> = new Map();
    private nextAvailableCol: Map<string, number> = new Map();
    
    // Board that owns unassigned components (first declared board)
    private defaultBoardId: string | null = null;

    // Pin counts for `def` custom ICs
    private customPinCounts: Map<string, number> = new Map();

    generate(program: ParsedProgram, componentBoards: Map<string, string>): CircuitIR {
        const ir: CircuitIR = {
            width: 0,
            height: 0,
            components: [],
            boards: [],
            wires: []
        };

        // Clear state
        this.occupiedHoles.clear();
        this.componentPlacements.clear();
        this.symbols.clear();
        this.boardGeometries.clear();
        this.componentBoards = new Map(componentBoards);
        this.nextAvailableCol.clear();
        this.defaultBoardId = null;
        this.customPinCounts = new Map(program.customICs.map(ic => [ic.name, ic.pins.length]));

        ir.customICs = program.customICs.map(ic => ({ name: ic.name, pins: ic.pins.map(p => ({ ...p })) }));

        for (const comp of program.components) {
            this.symbols.set(comp.id, { kind: 'component', type: comp.type, category: comp.category });
        }
        for (const board of program.boards) {
            this.symbols.set(board.id, { kind: 'board', type: board.type, category: 'ic' });
        }

        for (let i = 0; i < program.boards.length; i++) {
            const boardIr = this.generateBoard(program.boards[i], i);
            ir.boards.push(boardIr);
            this.boardGeometries.set(
                boardIr.id,
                new BreadboardGeometry(boardIr.position.x, boardIr.position.y)
            );
            this.nextAvailableCol.set(boardIr.id, 3);
        }
        this.defaultBoardId = program.boards[0]?.id ?? null;

        // Layout and generate components using unified footprint system
        this.layoutAndGenerateComponents(program.components, ir);

        ir.wires = this.generateWires(program.connections);

        let maxX = 0, maxY = 0;
        for (const b of ir.boards) {
            maxX = Math.max(maxX, b.position.x + b.size.width);
            maxY = Math.max(maxY, b.position.y + b.size.height);
        }
        for (const c of ir.components) {
            maxX = Math.max(maxX, c.position.x + c.size.width);
            maxY = Math.max(maxY, c.position.y + c.size.height);
        }
        ir.width = maxX + 20;
        ir.height = maxY + 20;

        return ir;
    }

    private generateBoard(board: BoardDecl, index: number): BoardIR {
        // Boards are laid out side by side so they do not overlap.
        const x = index * (BreadboardGeometry.BOARD_WIDTH + 20);
        
        return {
            id: board.id,
            type: board.type,
            rows: BreadboardGeometry.NUM_COLS,
            columns: 10,
            position: { x, y: 0 },
            size: { 
                width: BreadboardGeometry.BOARD_WIDTH, 
                height: BreadboardGeometry.BOARD_HEIGHT 
            }
        };
    }

    /**
     * Resolve the pin count for a component. Semantic validation already
     * rejects unknown types; this guard keeps the invariant explicit.
     */
    private resolvePinCount(comp: CompDecl): number {
        const pinCount = BUILTIN_ICS[comp.type] ?? this.customPinCounts.get(comp.type);
        if (pinCount === undefined) {
            throw new CompileError(`Unknown component type: '${comp.type}'`, comp.line, comp.column);
        }
        return pinCount;
    }

    /**
     * Layout and generate all components, grouped by their assigned board.
     */
    private layoutAndGenerateComponents(components: CompDecl[], ir: CircuitIR): void {
        if (this.boardGeometries.size === 0) {
            // No board - simple row layout
            let currentX = 10;
            for (const comp of components) {
                const pinCount = this.resolvePinCount(comp);
                const footprint = getComponentFootprint(comp.category, pinCount, comp.type);
                
                ir.components.push({
                    id: comp.id,
                    type: comp.type,
                    pinCount,
                    position: { x: currentX, y: 10 },
                    size: { width: footprint.bodyWidth, height: footprint.bodyHeight },
                    category: comp.category,
                    value: comp.value
                });
                
                currentX += footprint.bodyWidth + 10;
            }
            return;
        }

        // Group components by their assigned board, keeping board order.
        const byBoard = new Map<string, CompDecl[]>();
        for (const comp of components) {
            const boardId = this.componentBoards.get(comp.id) ?? this.defaultBoardId;
            if (!boardId || !this.boardGeometries.has(boardId)) {
                throw new CompileError(`Component '${comp.id}' has no board to be placed on`, comp.line, comp.column);
            }
            const list = byBoard.get(boardId) ?? [];
            list.push(comp);
            byBoard.set(boardId, list);
        }

        for (const [boardId, boardComponents] of byBoard) {
            const straddlingComps: CompDecl[] = [];
            const batteryComps: CompDecl[] = [];
            const topHalfComps: CompDecl[] = [];
            const bottomHalfComps: CompDecl[] = [];

            for (const comp of boardComponents) {
                if (comp.type === 'BATTERY') {
                    batteryComps.push(comp);
                    continue;
                }
                const pinCount = this.resolvePinCount(comp);
                const footprint = getComponentFootprint(comp.category, pinCount, comp.type);
                if (footprint.straddlesChannel) {
                    straddlingComps.push(comp);
                } else if (topHalfComps.length <= bottomHalfComps.length) {
                    topHalfComps.push(comp);
                } else {
                    bottomHalfComps.push(comp);
                }
            }

            for (const comp of straddlingComps) {
                this.placeComponent(comp, ir, 'straddling', undefined, boardId);
            }
            // Batteries live on the top power rail.
            for (const comp of batteryComps) {
                this.placeComponent(comp, ir, 'top', 'TOP+', boardId);
            }
            for (const comp of topHalfComps) {
                this.placeComponent(comp, ir, 'top', 'C', boardId);
            }
            for (const comp of bottomHalfComps) {
                this.placeComponent(comp, ir, 'bottom', 'H', boardId);
            }
        }
    }

    /**
     * Place a single component on its assigned board.
     */
    private placeComponent(
        comp: CompDecl, 
        ir: CircuitIR, 
        _placement: 'top' | 'bottom' | 'straddling',
        preferredRow: string | undefined,
        boardId: string
    ): void {
        const geo = this.boardGeometries.get(boardId);
        if (!geo) return;

        const startCol = this.nextAvailableCol.get(boardId) ?? 3;

        const pinCount = this.resolvePinCount(comp);
        const footprint = getComponentFootprint(comp.category, pinCount, comp.type);
        
        // Calculate placement
        const placementResult = calculatePlacement(
            footprint, 
            geo, 
            startCol, 
            preferredRow
        );

        // Mark occupied holes (scoped to this board)
        for (const [, pinPos] of placementResult.pinPositions) {
            this.occupiedHoles.set(`${boardId}:${pinPos.col},${pinPos.row}`, comp.id);
        }

        // Store placement info
        this.componentPlacements.set(comp.id, { footprint, placement: placementResult });

        // Reserve room for the rendered artwork so large parts do not
        // overlap their neighbours. The artwork's on-screen size follows
        // from its pin span, so it is computed from the footprint here.
        const pinSpanX = Math.max(...footprint.pins.map(p => p.offsetX)) - Math.min(...footprint.pins.map(p => p.offsetX));
        const pinSpanY = Math.max(...footprint.pins.map(p => p.offsetY)) - Math.min(...footprint.pins.map(p => p.offsetY));
        const art = artFor(comp.type);
        const display = art ? artDisplaySize(art, pinSpanX, pinSpanY) : null;

        // Update next available column. A single cursor per board keeps two
        // components from ever sharing a column half (which would connect
        // them electrically on a breadboard).
        const maxCol = Math.max(...placementResult.occupiedColumns);
        const occupiedSpan = maxCol - startCol + 1;
        const artColumns = display ? Math.ceil(display.width / BreadboardGeometry.HOLE_SPACING) : 0;
        const columnsNeeded = Math.max(occupiedSpan, artColumns);
        const tall = display ? display.height > 8 : false;
        this.nextAvailableCol.set(boardId, startCol + columnsNeeded + (tall ? 4 : 2));

        // Create component IR
        ir.components.push({
            id: comp.id,
            type: comp.type,
            pinCount,
            position: { x: placementResult.bodyX, y: placementResult.bodyY },
            size: { width: footprint.bodyWidth, height: footprint.bodyHeight },
            category: comp.category,
            value: comp.value,
            boardId
        });
    }

    private getBoardHolePosition(boardId: string, col: number, row: string): Position {
        const geo = this.boardGeometries.get(boardId);
        if (!geo) return { x: 0, y: 0 };
        const hole = geo.getHolePosition(col, row);
        return { x: hole.x, y: hole.y };
    }

    /**
     * Find a free hole on a power rail, searching columns next to the given
     * one (the whole rail is one electrical node).
     */
    private findFreeRailHole(boardId: string, col: number, row: string, wireId: string): Position {
        for (let offset = 1; offset <= BreadboardGeometry.NUM_COLS; offset++) {
            for (const candidate of [col + offset, col - offset]) {
                if (candidate < 1 || candidate > BreadboardGeometry.NUM_COLS) continue;
                const key = `${boardId}:${candidate},${row}`;
                if (!this.occupiedHoles.has(key)) {
                    this.occupiedHoles.set(key, wireId);
                    return this.getBoardHolePosition(boardId, candidate, row);
                }
            }
        }
        return this.getBoardHolePosition(boardId, col, row);
    }

    // Find the next free hole in the same column (shorted together on breadboard)
    private findFreeHoleInColumn(boardId: string, col: number, preferredRow: string, wireId: string): string {
        // Rows in order of preference for top half (A-E) and bottom half (F-J)
        const topRows = ['D', 'C', 'B', 'A']; // E is occupied by IC pin
        const bottomRows = ['G', 'H', 'I', 'J']; // F is occupied by IC pin
        
        const geo = this.boardGeometries.get(boardId);
        const isTopHalf = geo?.isTopHalf(preferredRow) ?? (preferredRow <= 'E');
        const rows = isTopHalf ? topRows : bottomRows;
        
        for (const row of rows) {
            const key = `${boardId}:${col},${row}`;
            if (!this.occupiedHoles.has(key)) {
                this.occupiedHoles.set(key, wireId);
                return row;
            }
        }
        
        // Fallback to preferred row if all are occupied
        return preferredRow;
    }

    /**
     * Get wire terminal position - uses the unified placement system.
     * Finds a free hole in the same column as the component pin, on the
     * board that owns the component.
     */
    private getWireTerminalPosition(componentId: string, pinNumber: number, wireId: string): Position {
        const symbol = this.symbols.get(componentId);
        if (!symbol) return { x: 0, y: 0 };

        if (symbol.kind === 'board') {
            const boardId = componentId;
            const col = ((pinNumber - 1) % BreadboardGeometry.NUM_COLS) + 1;
            const preferredRow = pinNumber <= BreadboardGeometry.NUM_COLS ? 'D' : 'G';
            const row = this.findFreeHoleInColumn(boardId, col, preferredRow, wireId);
            return this.getBoardHolePosition(boardId, col, row);
        }

        const boardId = this.componentBoards.get(componentId) ?? this.defaultBoardId;
        if (!boardId) return { x: 0, y: 0 };

        // Look up the component's placement info
        const placementInfo = this.componentPlacements.get(componentId);
        if (!placementInfo) return { x: 0, y: 0 };
        
        const { footprint, placement } = placementInfo;
        
        // Find the pin position from placement
        const pinPos = placement.pinPositions.get(pinNumber);
        if (!pinPos) {
            // Unreachable after semantic validation, but never fail silently.
            throw new CompileError(`Pin ${pinNumber} not found for component '${componentId}'`, 1, 1);
        }
        
        // Pins sitting on a power rail connect anywhere along that bus, so
        // place the wire terminal on a free hole of the same rail row.
        if (BreadboardGeometry.RAIL_ROWS.includes(pinPos.row)) {
            return this.findFreeRailHole(boardId, pinPos.col, pinPos.row, wireId);
        }

        // Determine which row to find a free hole in
        // For ICs: E pins -> look in top half (D, C, B, A)
        //          F pins -> look in bottom half (G, H, I, J)
        // For other components: look in same half as the pin's row
        let preferredFreeRow: string;
        
        if (footprint.straddlesChannel) {
            // IC component - pins are in E or F
            preferredFreeRow = pinPos.row === 'E' ? 'D' : 'G';
        } else {
            // Non-IC component - find free hole in same half
            const isTopHalf = BreadboardGeometry.TOP_ROWS.includes(pinPos.row);
            preferredFreeRow = isTopHalf ? 'D' : 'G';
        }
        
        // Find a free hole in the same column
        const freeRow = this.findFreeHoleInColumn(boardId, pinPos.col, preferredFreeRow, wireId);
        return this.getBoardHolePosition(boardId, pinPos.col, freeRow);
    }

    /** Board that owns a symbol (components via assignment, boards via identity). */
    private boardIdOfSymbol(id: string): string | undefined {
        const symbol = this.symbols.get(id);
        if (symbol?.kind === 'board') return id;
        return this.componentBoards.get(id) ?? this.defaultBoardId ?? undefined;
    }

    private generateWires(connections: Connection[]): Wire[] {
        const wires: Wire[] = [];
        const colors = ['#E63946', '#457B9D', '#2A9D8F', '#E9C46A', '#F4A261', '#264653', '#8338EC', '#3A86FF'];
        
        // Track used routing channels to avoid overlaps
        const usedYChannels: number[] = [];
        const usedXChannels: number[] = [];
        const CHANNEL_SPACING = 1.5;

        for (let i = 0; i < connections.length; i++) {
            const conn = connections[i];
            const wireId = `wire_${i}`;
            // Use wire terminal positions (adjacent free holes) instead of pin positions
            const fromPos = this.getWireTerminalPosition(conn.source.componentId, conn.source.pinNumber, wireId + '_from');
            const color = colors[i % colors.length];

            for (let j = 0; j < conn.destinations.length; j++) {
                const dest = conn.destinations[j];
                const toPos = this.getWireTerminalPosition(dest.componentId, dest.pinNumber, wireId + '_to_' + j);
                const waypoints = this.routeWire(fromPos, toPos, usedYChannels, usedXChannels, CHANNEL_SPACING);
                
                wires.push({
                    from: {
                        component: conn.source.componentId,
                        pin: conn.source.pinNumber,
                        x: fromPos.x,
                        y: fromPos.y
                    },
                    to: {
                        component: dest.componentId,
                        pin: dest.pinNumber,
                        x: toPos.x,
                        y: toPos.y
                    },
                    color,
                    waypoints,
                    boardId: this.boardIdOfSymbol(conn.source.componentId)
                });
            }
        }

        return wires;
    }

    private routeWire(from: Position, to: Position, usedYChannels: number[], usedXChannels: number[], spacing: number): Position[] {
        const waypoints: Position[] = [];
        
        // Simple Manhattan routing with channel allocation
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
            return []; // Direct connection
        }
        
        // Determine if we need horizontal-first or vertical-first routing
        const isFromAbove = from.y < to.y;
        const isFromLeft = from.x < to.x;
        
        // For pins in same row (horizontal wire)
        if (Math.abs(dy) < 2) {
            // Route around: go up/down, across, then back
            let yChannel = isFromAbove ? from.y - 3 : from.y + 3;
            
            // Find unused channel
            while (usedYChannels.some(y => Math.abs(y - yChannel) < spacing)) {
                yChannel += isFromAbove ? -spacing : spacing;
            }
            usedYChannels.push(yChannel);
            
            waypoints.push({ x: from.x, y: yChannel });
            waypoints.push({ x: to.x, y: yChannel });
            return waypoints;
        }
        
        // For pins in same column (vertical wire)
        if (Math.abs(dx) < 2) {
            // Route around: go left/right, down, then back
            let xChannel = isFromLeft ? from.x - 3 : from.x + 3;
            
            while (usedXChannels.some(x => Math.abs(x - xChannel) < spacing)) {
                xChannel += isFromLeft ? -spacing : spacing;
            }
            usedXChannels.push(xChannel);
            
            waypoints.push({ x: xChannel, y: from.y });
            waypoints.push({ x: xChannel, y: to.y });
            return waypoints;
        }
        
        // General case: L-shaped or Z-shaped routing
        // Prefer routing that minimizes crossings
        
        // Check if direct L-route works
        const midY = from.y + (to.y - from.y) / 2;
        
        // Find unused horizontal channel
        let hChannel = midY;
        let attempts = 0;
        while (usedYChannels.some(y => Math.abs(y - hChannel) < spacing) && attempts < 20) {
            hChannel += (attempts % 2 === 0 ? 1 : -1) * Math.ceil(attempts / 2) * spacing;
            attempts++;
        }
        usedYChannels.push(hChannel);
        
        // Z-route: vertical, horizontal, vertical
        waypoints.push({ x: from.x, y: hChannel });
        waypoints.push({ x: to.x, y: hChannel });
        
        return waypoints;
    }
}

export function compile(source: string): CircuitIR {
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();

    const parser = new Parser(tokens);
    const program = parser.parse();

    const assignments = validateProgram(program);

    const generator = new IRGenerator();
    return generator.generate(program, assignments);
}

// Connection-point counts per board type, used for pin-range validation.
const BOARD_PIN_COUNTS: Record<string, number> = {
    'breadboard_830': 830,
    'breadboard_400': 400,
    'breadboard_170': 170,
};

interface SymbolInfo {
    kind: 'component' | 'board';
    pinCount: number;
}

/**
 * Semantic validation. Runs after parsing and before IR generation so that
 * undefined references, duplicate declarations and out-of-range pins are
 * reported instead of silently producing phantom geometry.
 *
 * Returns the component-to-board assignment:
 *  - `place` statements are authoritative,
 *  - board-scoped map blocks assign the components they first reference,
 *  - everything else belongs to the first board.
 */
function validateProgram(program: ParsedProgram): Map<string, string> {
    const symbols = new Map<string, SymbolInfo>();
    const customICs = new Map<string, number>();

    for (const ic of program.customICs) {
        if (BUILTIN_ICS[ic.name] !== undefined) {
            throw new CompileError(`Cannot redefine built-in IC: '${ic.name}'`, ic.line, ic.column);
        }
        if (customICs.has(ic.name)) {
            throw new CompileError(`Duplicate IC definition: '${ic.name}'`, ic.line, ic.column);
        }
        if (ic.pins.length === 0) {
            throw new CompileError(`IC '${ic.name}' must define at least one pin`, ic.line, ic.column);
        }
        customICs.set(ic.name, ic.pins.length);
    }

    for (const comp of program.components) {
        if (symbols.has(comp.id)) {
            throw new CompileError(`Duplicate component declaration: '${comp.id}'`, comp.line, comp.column);
        }
        const pinCount = BUILTIN_ICS[comp.type] ?? customICs.get(comp.type);
        if (pinCount === undefined) {
            throw new CompileError(`Unknown component type: '${comp.type}'`, comp.line, comp.column);
        }
        symbols.set(comp.id, { kind: 'component', pinCount });
    }

    for (const board of program.boards) {
        if (symbols.has(board.id)) {
            throw new CompileError(`Duplicate board declaration: '${board.id}'`, board.line, board.column);
        }
        symbols.set(board.id, { kind: 'board', pinCount: BOARD_PIN_COUNTS[board.type] ?? 830 });
    }

    // Board-scoped map blocks must name a declared board.
    for (const conn of program.connections) {
        if (conn.boardId === undefined) continue;
        const symbol = symbols.get(conn.boardId);
        if (!symbol || symbol.kind !== 'board') {
            throw new CompileError(
                `Unknown board: '${conn.boardId}'`,
                conn.boardLine ?? 1,
                conn.boardColumn ?? 1
            );
        }
    }

    // place statements must name declared boards and components.
    for (const place of program.placements) {
        const boardSymbol = symbols.get(place.boardId);
        if (!boardSymbol || boardSymbol.kind !== 'board') {
            throw new CompileError(`Unknown board: '${place.boardId}'`, place.line, place.column);
        }
        for (const ref of place.refs) {
            const symbol = symbols.get(ref.id);
            if (!symbol) {
                throw new CompileError(`Undefined component: '${ref.id}'`, ref.line, ref.column);
            }
            if (symbol.kind !== 'component') {
                throw new CompileError(`'${ref.id}' is a board, not a component`, ref.line, ref.column);
            }
        }
    }

    const usedBoardPins = new Map<string, Set<number>>();

    const validatePinRef = (ref: PinRef): void => {
        const symbol = symbols.get(ref.componentId);
        if (!symbol) {
            throw new CompileError(`Undefined component: '${ref.componentId}'`, ref.line, ref.column);
        }
        if (!Number.isInteger(ref.pinNumber) || ref.pinNumber < 1 || ref.pinNumber > symbol.pinCount) {
            throw new CompileError(
                `Invalid pin number ${ref.pinNumber} for '${ref.componentId}' (has ${symbol.pinCount} pins)`,
                ref.line,
                ref.column
            );
        }
        if (symbol.kind === 'board') {
            let used = usedBoardPins.get(ref.componentId);
            if (!used) {
                used = new Set<number>();
                usedBoardPins.set(ref.componentId, used);
            }
            if (used.has(ref.pinNumber)) {
                throw new CompileError(
                    `Pin ${ref.pinNumber} on board '${ref.componentId}' is already connected`,
                    ref.line,
                    ref.column
                );
            }
            used.add(ref.pinNumber);
        }
    };

    for (const conn of program.connections) {
        validatePinRef(conn.source);
        for (const dest of conn.destinations) {
            validatePinRef(dest);
        }
    }

    // Component-to-board assignment. Explicit `place` statements win; a
    // board-scoped map assigns the components it first references; a
    // component claimed by two scoped maps without an explicit place is an
    // error because the intent is ambiguous.
    const assignments = new Map<string, string>();
    const origin = new Map<string, 'place' | 'map'>();

    for (const place of program.placements) {
        for (const ref of place.refs) {
            const existing = assignments.get(ref.id);
            if (existing !== undefined && existing !== place.boardId) {
                throw new CompileError(
                    `Component '${ref.id}' is already placed on '${existing}'`,
                    ref.line,
                    ref.column
                );
            }
            assignments.set(ref.id, place.boardId);
            origin.set(ref.id, 'place');
        }
    }

    for (const conn of program.connections) {
        if (!conn.boardId) continue;
        for (const ref of [conn.source, ...conn.destinations]) {
            const existing = assignments.get(ref.componentId);
            if (existing === undefined) {
                assignments.set(ref.componentId, conn.boardId);
                origin.set(ref.componentId, 'map');
            } else if (existing !== conn.boardId && origin.get(ref.componentId) === 'map') {
                throw new CompileError(
                    `Component '${ref.componentId}' is referenced by both '${existing}.map' and '${conn.boardId}.map'; use 'place' to choose a board`,
                    ref.line,
                    ref.column
                );
            }
        }
    }

    const firstBoard = program.boards[0]?.id;
    if (firstBoard) {
        for (const comp of program.components) {
            if (!assignments.has(comp.id)) {
                assignments.set(comp.id, firstBoard);
            }
        }
    }

    return assignments;
}
