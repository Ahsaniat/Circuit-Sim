import { CircuitIR, ComponentIR, BoardIR, Wire, Position } from '../types';

interface Token {
    type: string;
    lexeme: string;
    line: number;
    column: number;
}

interface CompDecl {
    id: string;
    type: string;
}

interface BoardDecl {
    id: string;
    type: string;
}

interface PinRef {
    componentId: string;
    pinNumber: number;
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

const KEYWORDS = new Set(['def', 'map', 'pin', 'input', 'output', 'gnd', 'vcc']);

const BUILTIN_ICS: Record<string, number> = {
    '7400': 14, '7402': 14, '7404': 14, '7408': 14,
    '7410': 14, '7420': 14, '7432': 14, '7486': 14,
    '7447': 16, '7474': 14, '7490': 14,
    '74138': 16, '74139': 16, '74151': 16, '74153': 16,
    '74161': 16, '74164': 14, '74173': 16, '74181': 24,
    '74245': 20, '74373': 20, '74374': 20,
    '555': 8, 'NE555': 8,
    '741': 8, 'LM741': 8, 'LM358': 8
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
        while (!this.isAtEnd() && this.isAlpha(this.peek())) {
            keyword += this.advance();
        }
        if (keyword === 'comp') {
            this.addToken('COMP', '@comp', startCol);
        } else if (keyword === 'board') {
            this.addToken('BOARD', '@board', startCol);
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
            } else if (this.match('BOARD')) {
                program.boards.push(this.parseBoardDecl());
            } else if (this.match('MAP')) {
                program.connections = this.parseMapBlock();
            } else if (this.match('DEF')) {
                this.skipICDef();
            } else {
                this.advance();
            }
        }

        return program;
    }

    private parseCompDecl(): CompDecl {
        const id = this.consume('IDENTIFIER', 'Expected component identifier').lexeme;
        const type = this.consumeAny(['IDENTIFIER', 'NUMBER'], 'Expected component type').lexeme;
        return { id, type };
    }

    private parseBoardDecl(): BoardDecl {
        const id = this.consume('IDENTIFIER', 'Expected board identifier').lexeme;
        const type = this.consume('IDENTIFIER', 'Expected board type').lexeme;
        return { id, type };
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
        const componentId = this.consume('IDENTIFIER', 'Expected component identifier').lexeme;
        this.consume('PIN', "Expected 'pin' keyword");
        const pinNumber = parseInt(this.consume('NUMBER', 'Expected pin number').lexeme, 10);
        return { componentId, pinNumber };
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
    private componentPositions: Map<string, Position> = new Map();
    private componentSizes: Map<string, { width: number; height: number }> = new Map();
    private symbols: Map<string, { kind: string; type: string }> = new Map();
    
    // Breadboard geometry constants
    private readonly HOLE_SPACING = 2.54;
    private readonly NUM_COLS = 63;
    private readonly ROWS_PER_HALF = 5;
    private readonly RAIL_HEIGHT = 20 / 4; // In base units
    private readonly HOLE_MARGIN = 15 / 4;
    private readonly CHANNEL_HEIGHT = 12 / 4;

    generate(program: ParsedProgram): CircuitIR {
        const ir: CircuitIR = {
            width: 0,
            height: 0,
            components: [],
            boards: [],
            wires: []
        };

        for (const comp of program.components) {
            this.symbols.set(comp.id, { kind: 'component', type: comp.type });
        }
        for (const board of program.boards) {
            this.symbols.set(board.id, { kind: 'board', type: board.type });
        }

        for (const board of program.boards) {
            ir.boards.push(this.generateBoard(board));
        }

        for (const comp of program.components) {
            ir.components.push(this.generateComponent(comp));
        }

        this.layoutComponents(ir);

        ir.wires = this.generateWires(program.connections);

        let maxX = 0, maxY = 0;
        for (const b of ir.boards) {
            maxX = Math.max(maxX, b.position.x + b.size.width);
            maxY = Math.max(maxY, b.position.y + b.size.height);
        }
        for (const c of ir.components) {
            const size = this.componentSizes.get(c.id) || { width: 20, height: 10 };
            maxX = Math.max(maxX, c.position.x + size.width);
            maxY = Math.max(maxY, c.position.y + size.height);
        }
        ir.width = maxX + 20;
        ir.height = maxY + 20;

        return ir;
    }

    private generateBoard(board: BoardDecl): BoardIR {
        const w = this.HOLE_MARGIN * 2 + this.NUM_COLS * this.HOLE_SPACING;
        const h = this.RAIL_HEIGHT + this.HOLE_MARGIN + this.ROWS_PER_HALF * this.HOLE_SPACING + 
                  this.CHANNEL_HEIGHT + this.ROWS_PER_HALF * this.HOLE_SPACING + this.HOLE_MARGIN + this.RAIL_HEIGHT;
        
        return {
            id: board.id,
            type: board.type,
            rows: this.NUM_COLS,
            columns: 10,
            position: { x: 0, y: 0 },
            size: { width: w, height: h }
        };
    }

    private generateComponent(comp: CompDecl): ComponentIR {
        const pinCount = BUILTIN_ICS[comp.type] || 14;
        const pinsPerSide = pinCount / 2;
        
        // Horizontal IC: width spans pins, height is body
        const width = (pinsPerSide - 1) * this.HOLE_SPACING + 2;
        const height = 7; // IC body height in base units
        
        this.componentSizes.set(comp.id, { width, height });
        
        return {
            id: comp.id,
            type: comp.type,
            pinCount,
            position: { x: 0, y: 0 },
            size: { width, height }
        };
    }

    private layoutComponents(ir: CircuitIR): void {
        // Position board at origin
        for (const board of ir.boards) {
            board.position = { x: 0, y: 0 };
            this.componentPositions.set(board.id, board.position);
        }

        if (ir.boards.length === 0) {
            // No board, just lay out components in a row
            let currentX = 10;
            for (const comp of ir.components) {
                comp.position = { x: currentX, y: 10 };
                this.componentPositions.set(comp.id, comp.position);
                const size = this.componentSizes.get(comp.id) || { width: 20, height: 10 };
                currentX += size.width + 10;
            }
            return;
        }

        // Place ICs on breadboard straddling the center channel
        // ICs pins must snap exactly to breadboard holes
        const board = ir.boards[0];
        const boardX = board.position.x;
        const boardY = board.position.y;
        
        // Breadboard geometry (must match renderer)
        const railHeight = 24 / 4; // Convert from renderer scale
        const holeMargin = 18 / 4;
        
        // Calculate exact hole positions
        const holesStartX = boardX + holeMargin;
        const topHalfY = boardY + railHeight + holeMargin;
        
        // Row E (index 4)
        const rowEY = topHalfY + 4 * this.HOLE_SPACING;
        
        // Pin tip is at body_y - pinLength (in base units)
        // For pin tip to land on rowEY: body_y - pinLength = rowEY => body_y = rowEY + pinLength
        const pinLength = 1.5; // base units (6px / 4)
        
        // Position IC so top pins land exactly on row E
        const icBodyY = rowEY + pinLength;
        
        let startCol = 2; // Start at column 3 (0-indexed = 2)
        
        for (const comp of ir.components) {
            const pinsPerSide = comp.pinCount / 2;
            
            // Position IC so first pin (pin 1) aligns exactly with hole at startCol
            // Pin x = body_x + 1 (in base units), should equal holesStartX + startCol * HOLE_SPACING
            const icX = holesStartX + startCol * this.HOLE_SPACING - 1;
            
            comp.position = { x: icX, y: icBodyY };
            this.componentPositions.set(comp.id, { x: icX, y: icBodyY });
            
            // Next IC starts after this one plus gap
            startCol += pinsPerSide + 2;
        }
    }

    private getBoardHolePosition(boardId: string, col: number, row: string): Position {
        const boardPos = this.componentPositions.get(boardId);
        if (!boardPos) return { x: 0, y: 0 };
        
        // Use same constants as layoutComponents
        const railHeight = 24 / 4;
        const holeMargin = 18 / 4;
        const channelHeight = 14 / 4;
        
        const holesStartX = boardPos.x + holeMargin;
        const topHalfY = boardPos.y + railHeight + holeMargin;
        const bottomHalfY = topHalfY + 5 * this.HOLE_SPACING + channelHeight;
        
        const rowMap: Record<string, number> = {
            'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4,
            'F': 0, 'G': 1, 'H': 2, 'I': 3, 'J': 4
        };
        
        const rowIndex = rowMap[row] ?? 0;
        const isTopHalf = row <= 'E';
        
        return {
            x: holesStartX + (col - 1) * this.HOLE_SPACING,
            y: isTopHalf ? topHalfY + rowIndex * this.HOLE_SPACING : bottomHalfY + rowIndex * this.HOLE_SPACING
        };
    }

    // Get wire terminal position - connects to a free hole in the same column
    private getWireTerminalPosition(componentId: string, pinNumber: number): Position {
        const pos = this.componentPositions.get(componentId);
        if (!pos) return { x: 0, y: 0 };

        const symbol = this.symbols.get(componentId);
        if (!symbol) return pos;

        if (symbol.kind === 'board') {
            const col = ((pinNumber - 1) % this.NUM_COLS) + 1;
            const row = pinNumber <= this.NUM_COLS ? 'D' : 'G';
            return this.getBoardHolePosition(componentId, col, row);
        }

        // For IC pins, wire connects to adjacent row (not on the IC leg)
        const pinCount = BUILTIN_ICS[symbol.type] || 14;
        const pinsPerSide = pinCount / 2;
        
        // IC body position is stored in pos
        // Pin x = pos.x + 1 + pinIndex * HOLE_SPACING (same as renderer)
        const pinLength = 1.5; // base units
        const icHeight = 7; // base units
        
        if (pinNumber <= pinsPerSide) {
            // Top pin - connects to row D (one row above row E)
            const pinIndex = pinNumber - 1;
            const pinX = pos.x + 1 + pinIndex * this.HOLE_SPACING;
            // Row E is at pos.y - pinLength, Row D is one HOLE_SPACING above
            const rowDY = pos.y - pinLength - this.HOLE_SPACING;
            return { x: pinX, y: rowDY };
        } else {
            // Bottom pin - connects to row G (one row below row F)
            const pinIndex = pinCount - pinNumber;
            const pinX = pos.x + 1 + pinIndex * this.HOLE_SPACING;
            // Row F is at pos.y + icHeight + pinLength, Row G is one HOLE_SPACING below
            const rowGY = pos.y + icHeight + pinLength + this.HOLE_SPACING;
            return { x: pinX, y: rowGY };
        }
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
            // Use wire terminal positions (adjacent free holes) instead of pin positions
            const fromPos = this.getWireTerminalPosition(conn.source.componentId, conn.source.pinNumber);
            const color = colors[i % colors.length];

            for (const dest of conn.destinations) {
                const toPos = this.getWireTerminalPosition(dest.componentId, dest.pinNumber);
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

    const generator = new IRGenerator();
    return generator.generate(program);
}
