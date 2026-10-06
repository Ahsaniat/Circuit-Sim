import { CircuitIR, BoardIR, Wire, Position } from '../types';
import { BreadboardGeometry } from '../geometry/BreadboardGeometry';
import { 
    ComponentCategory, 
    ComponentFootprint, 
    PlacementResult,
    getComponentFootprint, 
    calculatePlacement 
} from '../geometry/ComponentFootprints';

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
}

interface ParsedProgram {
    components: CompDecl[];
    boards: BoardDecl[];
    connections: Connection[];
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
            case '-':
                if (this.peek() === '>') {
                    this.advance();
                    this.addToken('ARROW', '->', startCol);
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
            connections: []
        };

        while (!this.isAtEnd()) {
            if (this.match('COMP')) {
                program.components.push(this.parseCompDecl());
            } else if (this.match('COMP_TYPE')) {
                // New syntax: @resistor R1 10k, @AND A1 7408
                program.components.push(this.parseTypedCompDecl());
            } else if (this.match('BOARD')) {
                program.boards.push(this.parseBoardDecl());
            } else if (this.match('MAP')) {
                program.connections = this.parseMapBlock();
            } else if (this.match('DEF')) {
                this.skipICDef();
            } else {
                // Strict mode: never silently discard tokens. A stray token is
                // almost always a typo that must be reported with its location.
                const token = this.peek();
                throw new CompileError(`Unexpected token '${token.lexeme}'`, token.line, token.column);
            }
        }

        return program;
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
        const pinNumber = parseInt(this.consume('NUMBER', 'Expected pin number').lexeme, 10);
        return { componentId: componentId.lexeme, pinNumber, line: componentId.line, column: componentId.column };
    }

    private skipICDef(): void {
        this.consume('IDENTIFIER', 'Expected IC name');
        this.consume('LPAREN', "Expected '('");
        let depth = 1;
        while (depth > 0 && !this.isAtEnd()) {
            if (this.match('LPAREN')) depth++;
            else if (this.match('RPAREN')) depth--;
            else this.advance();
        }
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
    
    // Board geometry instance
    private boardGeometry: BreadboardGeometry | null = null;
    
    // Track next available column for each row group
    private nextAvailableCol: { top: number; bottom: number; straddling: number } = { top: 3, bottom: 3, straddling: 3 };

    generate(program: ParsedProgram): CircuitIR {
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
        this.boardGeometry = null;
        this.nextAvailableCol = { top: 3, bottom: 3, straddling: 3 };

        for (const comp of program.components) {
            this.symbols.set(comp.id, { kind: 'component', type: comp.type, category: comp.category });
        }
        for (const board of program.boards) {
            this.symbols.set(board.id, { kind: 'board', type: board.type, category: 'ic' });
        }

        for (const board of program.boards) {
            ir.boards.push(this.generateBoard(board));
        }

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

    private generateBoard(board: BoardDecl): BoardIR {
        // Create geometry instance at origin
        this.boardGeometry = new BreadboardGeometry(0, 0);
        
        return {
            id: board.id,
            type: board.type,
            rows: BreadboardGeometry.NUM_COLS,
            columns: 10,
            position: { x: 0, y: 0 },
            size: { 
                width: BreadboardGeometry.BOARD_WIDTH, 
                height: BreadboardGeometry.BOARD_HEIGHT 
            }
        };
    }

    /**
     * Layout and generate all components using the unified footprint system
     */
    private layoutAndGenerateComponents(components: CompDecl[], ir: CircuitIR): void {
        if (!this.boardGeometry) {
            // No board - simple row layout
            let currentX = 10;
            for (const comp of components) {
                const pinCount = BUILTIN_ICS[comp.type] || 14;
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

        // Group components by placement type
        const straddlingComps: CompDecl[] = [];  // ICs that straddle the channel
        const topHalfComps: CompDecl[] = [];     // Components in top half (rows A-E)
        const bottomHalfComps: CompDecl[] = [];  // Components in bottom half (rows F-J)

        for (const comp of components) {
            const pinCount = BUILTIN_ICS[comp.type] || 14;
            const footprint = getComponentFootprint(comp.category, pinCount, comp.type);
            
            if (footprint.straddlesChannel) {
                straddlingComps.push(comp);
            } else {
                // Alternate between top and bottom half for non-IC components
                if (topHalfComps.length <= bottomHalfComps.length) {
                    topHalfComps.push(comp);
                } else {
                    bottomHalfComps.push(comp);
                }
            }
        }

        // Place straddling components (ICs) first
        for (const comp of straddlingComps) {
            this.placeComponent(comp, ir, 'straddling');
        }

        // Place top-half components
        for (const comp of topHalfComps) {
            this.placeComponent(comp, ir, 'top', 'C');  // Row C is a good default for top half
        }

        // Place bottom-half components
        for (const comp of bottomHalfComps) {
            this.placeComponent(comp, ir, 'bottom', 'H');  // Row H is a good default for bottom half
        }
    }

    /**
     * Place a single component on the breadboard
     */
    private placeComponent(
        comp: CompDecl, 
        ir: CircuitIR, 
        placement: 'top' | 'bottom' | 'straddling',
        preferredRow?: string
    ): void {
        if (!this.boardGeometry) return;

        const pinCount = BUILTIN_ICS[comp.type] || 14;
        const footprint = getComponentFootprint(comp.category, pinCount, comp.type);
        
        // Determine starting column based on placement type
        const startCol = this.nextAvailableCol[placement];
        
        // Calculate placement
        const placementResult = calculatePlacement(
            footprint, 
            this.boardGeometry, 
            startCol, 
            preferredRow
        );

        // Mark occupied holes
        for (const [, pinPos] of placementResult.pinPositions) {
            this.occupiedHoles.set(`${pinPos.col},${pinPos.row}`, comp.id);
        }

        // Store placement info
        this.componentPlacements.set(comp.id, { footprint, placement: placementResult });

        // Update next available column
        const maxCol = Math.max(...placementResult.occupiedColumns);
        this.nextAvailableCol[placement] = maxCol + 2;  // Leave 1 column gap

        // Create component IR
        ir.components.push({
            id: comp.id,
            type: comp.type,
            pinCount,
            position: { x: placementResult.bodyX, y: placementResult.bodyY },
            size: { width: footprint.bodyWidth, height: footprint.bodyHeight },
            category: comp.category,
            value: comp.value
        });
    }

    private getBoardHolePosition(col: number, row: string): Position {
        if (!this.boardGeometry) return { x: 0, y: 0 };
        const hole = this.boardGeometry.getHolePosition(col, row);
        return { x: hole.x, y: hole.y };
    }

    // Find the next free hole in the same column (shorted together on breadboard)
    private findFreeHoleInColumn(col: number, preferredRow: string, wireId: string): string {
        // Rows in order of preference for top half (A-E) and bottom half (F-J)
        const topRows = ['D', 'C', 'B', 'A']; // E is occupied by IC pin
        const bottomRows = ['G', 'H', 'I', 'J']; // F is occupied by IC pin
        
        const isTopHalf = this.boardGeometry?.isTopHalf(preferredRow) ?? (preferredRow <= 'E');
        const rows = isTopHalf ? topRows : bottomRows;
        
        for (const row of rows) {
            const key = `${col},${row}`;
            if (!this.occupiedHoles.has(key)) {
                this.occupiedHoles.set(key, wireId);
                return row;
            }
        }
        
        // Fallback to preferred row if all are occupied
        return preferredRow;
    }

    /**
     * Get wire terminal position - uses the unified placement system
     * Finds a free hole in the same column as the component pin
     */
    private getWireTerminalPosition(componentId: string, pinNumber: number, wireId: string): Position {
        const symbol = this.symbols.get(componentId);
        if (!symbol) return { x: 0, y: 0 };

        if (symbol.kind === 'board') {
            const col = ((pinNumber - 1) % BreadboardGeometry.NUM_COLS) + 1;
            const preferredRow = pinNumber <= BreadboardGeometry.NUM_COLS ? 'D' : 'G';
            const row = this.findFreeHoleInColumn(col, preferredRow, wireId);
            return this.getBoardHolePosition(col, row);
        }

        // Look up the component's placement info
        const placementInfo = this.componentPlacements.get(componentId);
        if (!placementInfo) return { x: 0, y: 0 };
        
        const { footprint, placement } = placementInfo;
        
        // Find the pin position from placement
        const pinPos = placement.pinPositions.get(pinNumber);
        if (!pinPos) {
            // Pin not found - try to calculate it for ICs
            console.warn(`Pin ${pinNumber} not found for component ${componentId}`);
            return { x: 0, y: 0 };
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
        const freeRow = this.findFreeHoleInColumn(pinPos.col, preferredFreeRow, wireId);
        return this.getBoardHolePosition(pinPos.col, freeRow);
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
                    waypoints
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

    validateProgram(program);

    const generator = new IRGenerator();
    return generator.generate(program);
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
 */
function validateProgram(program: ParsedProgram): void {
    const symbols = new Map<string, SymbolInfo>();

    for (const comp of program.components) {
        if (symbols.has(comp.id)) {
            throw new CompileError(`Duplicate component declaration: '${comp.id}'`, comp.line, comp.column);
        }
        const pinCount = BUILTIN_ICS[comp.type];
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
}
