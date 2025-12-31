import { CircuitIR, ComponentIR, BoardIR, Wire, Position } from '../types';
import { BreadboardGeometry } from '../geometry/BreadboardGeometry';

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
    
    // Hole occupancy tracking: key = "col,row" (e.g., "5,D"), value = componentId or wire index
    private occupiedHoles: Map<string, string> = new Map();
    
    // IC starting columns (for wire terminal calculation)
    private icStartColumns: Map<string, number> = new Map();
    
    // Board geometry instance
    private boardGeometry: BreadboardGeometry | null = null;

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
        this.componentPositions.clear();
        this.componentSizes.clear();
        this.symbols.clear();
        this.icStartColumns.clear();
        this.boardGeometry = null;

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
        
        // Mark IC pin holes as occupied
        this.markICPinHoles(ir);

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

    private markICPinHoles(ir: CircuitIR): void {
        if (!this.boardGeometry) return;
        
        // For each IC, mark the holes where its pins are inserted
        for (const comp of ir.components) {
            const pinsPerSide = comp.pinCount / 2;
            const startCol = this.icStartColumns.get(comp.id);
            if (startCol === undefined) continue;
            
            // Top pins (1 to pinsPerSide) go into row E
            for (let i = 0; i < pinsPerSide; i++) {
                const col = startCol + i;
                this.occupiedHoles.set(`${col},E`, comp.id);
            }
            
            // Bottom pins go into row F
            for (let i = 0; i < pinsPerSide; i++) {
                const col = startCol + i;
                this.occupiedHoles.set(`${col},F`, comp.id);
            }
        }
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

    private generateComponent(comp: CompDecl): ComponentIR {
        const pinCount = BUILTIN_ICS[comp.type] || 14;
        const pinsPerSide = pinCount / 2;
        
        // Horizontal IC: width spans pins, height is body
        const width = (pinsPerSide - 1) * BreadboardGeometry.HOLE_SPACING + 2;
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

        if (ir.boards.length === 0 || !this.boardGeometry) {
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

        // Place ICs on breadboard using unified geometry
        let startCol = 3; // Start at column 3 (1-indexed)
        const pinLength = 1.5; // base units
        
        for (const comp of ir.components) {
            const pinsPerSide = comp.pinCount / 2;
            
            // Get IC body position from geometry (ensures pin alignment)
            const bodyPos = this.boardGeometry.getICBodyPosition(startCol, pinLength);
            
            comp.position = { x: bodyPos.x, y: bodyPos.y };
            this.componentPositions.set(comp.id, comp.position);
            this.icStartColumns.set(comp.id, startCol);
            
            // Next IC starts after this one plus gap
            startCol += pinsPerSide + 2;
        }
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

    // Get wire terminal position - connects to a free hole in the same column
    private getWireTerminalPosition(componentId: string, pinNumber: number, wireId: string): Position {
        const symbol = this.symbols.get(componentId);
        if (!symbol) return { x: 0, y: 0 };

        if (symbol.kind === 'board') {
            const col = ((pinNumber - 1) % BreadboardGeometry.NUM_COLS) + 1;
            const preferredRow = pinNumber <= BreadboardGeometry.NUM_COLS ? 'D' : 'G';
            const row = this.findFreeHoleInColumn(col, preferredRow, wireId);
            return this.getBoardHolePosition(col, row);
        }

        // For IC pins, find a free hole in the same column
        const pinCount = BUILTIN_ICS[symbol.type] || 14;
        const pinsPerSide = pinCount / 2;
        
        // Get the starting column for this IC
        const startCol = this.icStartColumns.get(componentId);
        if (startCol === undefined) return { x: 0, y: 0 };
        
        if (pinNumber <= pinsPerSide) {
            // Top pin (pins 1 to N/2)
            const pinIndex = pinNumber - 1;
            const col = startCol + pinIndex;
            const row = this.findFreeHoleInColumn(col, 'D', wireId);
            return this.getBoardHolePosition(col, row);
        } else {
            // Bottom pin (pins N to N/2+1, numbered right to left)
            const pinIndex = pinCount - pinNumber;
            const col = startCol + pinIndex;
            const row = this.findFreeHoleInColumn(col, 'G', wireId);
            return this.getBoardHolePosition(col, row);
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

    const generator = new IRGenerator();
    return generator.generate(program);
}
