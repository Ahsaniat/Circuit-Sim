/**
 * Unified breadboard geometry system.
 * Single source of truth for all breadboard measurements.
 * All values are in base units (1 base unit = 2.54mm = 0.1 inch = standard pin spacing)
 */

export interface HolePosition {
    x: number;
    y: number;
    col: number;  // 1-indexed column number
    row: string;  // 'A'-'J' for main rows, '+'/'-' for rails
}

export class BreadboardGeometry {
    // Standard breadboard dimensions in base units
    static readonly HOLE_SPACING = 2.54;      // Distance between holes (2.54mm)
    static readonly NUM_COLS = 63;            // Standard breadboard columns
    static readonly ROWS_PER_HALF = 5;        // Rows A-E and F-J
    
    // Layout measurements in base units
    static readonly RAIL_HEIGHT = 6;          // Power rail area height
    static readonly HOLE_MARGIN = 4.5;        // Margin from edge to first hole
    static readonly CHANNEL_HEIGHT = 3.5;     // Center channel height
    
    // Derived measurements
    static readonly BOARD_WIDTH = BreadboardGeometry.HOLE_MARGIN * 2 + 
        BreadboardGeometry.NUM_COLS * BreadboardGeometry.HOLE_SPACING;
    
    static readonly BOARD_HEIGHT = 
        BreadboardGeometry.RAIL_HEIGHT +                              // Top rail
        BreadboardGeometry.HOLE_MARGIN +                              // Margin
        BreadboardGeometry.ROWS_PER_HALF * BreadboardGeometry.HOLE_SPACING +  // Top holes
        BreadboardGeometry.CHANNEL_HEIGHT +                           // Channel
        BreadboardGeometry.ROWS_PER_HALF * BreadboardGeometry.HOLE_SPACING +  // Bottom holes
        BreadboardGeometry.HOLE_MARGIN +                              // Margin
        BreadboardGeometry.RAIL_HEIGHT;                               // Bottom rail
    
    // Row definitions
    static readonly TOP_ROWS = ['A', 'B', 'C', 'D', 'E'];
    static readonly BOTTOM_ROWS = ['F', 'G', 'H', 'I', 'J'];
    static readonly RAIL_ROWS = ['TOP+', 'TOP-', 'BOTTOM+', 'BOTTOM-'];
    static readonly ALL_ROWS = [...BreadboardGeometry.TOP_ROWS, ...BreadboardGeometry.BOTTOM_ROWS];
    static readonly ALL_ROWS_WITH_RAILS = [...BreadboardGeometry.TOP_ROWS, ...BreadboardGeometry.BOTTOM_ROWS, ...BreadboardGeometry.RAIL_ROWS];
    
    private boardX: number;
    private boardY: number;
    
    // Cached Y positions for each row
    private rowYPositions: Map<string, number> = new Map();
    
    constructor(boardX: number = 0, boardY: number = 0) {
        this.boardX = boardX;
        this.boardY = boardY;
        this.calculateRowPositions();
    }
    
    private calculateRowPositions(): void {
        const topHalfStartY = this.boardY + BreadboardGeometry.RAIL_HEIGHT + 
            BreadboardGeometry.HOLE_MARGIN;
        
        // Top power rail rows
        const topRailY = this.boardY + 4;
        this.rowYPositions.set('TOP+', topRailY + 8);
        this.rowYPositions.set('TOP-', topRailY + BreadboardGeometry.RAIL_HEIGHT - 10);
        
        // Top half rows (A-E)
        for (let i = 0; i < BreadboardGeometry.ROWS_PER_HALF; i++) {
            const row = BreadboardGeometry.TOP_ROWS[i];
            this.rowYPositions.set(row, topHalfStartY + i * BreadboardGeometry.HOLE_SPACING);
        }
        
        // Bottom half rows (F-J)
        const bottomHalfStartY = topHalfStartY + 
            BreadboardGeometry.ROWS_PER_HALF * BreadboardGeometry.HOLE_SPACING +
            BreadboardGeometry.CHANNEL_HEIGHT;
        
        for (let i = 0; i < BreadboardGeometry.ROWS_PER_HALF; i++) {
            const row = BreadboardGeometry.BOTTOM_ROWS[i];
            this.rowYPositions.set(row, bottomHalfStartY + i * BreadboardGeometry.HOLE_SPACING);
        }
        
        // Bottom power rail rows
        const bottomRailY = this.boardY + BreadboardGeometry.BOARD_HEIGHT - BreadboardGeometry.RAIL_HEIGHT;
        this.rowYPositions.set('BOTTOM+', bottomRailY + 10);
        this.rowYPositions.set('BOTTOM-', bottomRailY + BreadboardGeometry.RAIL_HEIGHT - 8);
    }
    
    /**
     * Get the X coordinate of the first hole column
     */
    get holesStartX(): number {
        return this.boardX + BreadboardGeometry.HOLE_MARGIN;
    }
    
    /**
     * Get exact position of a hole given column (1-indexed) and row letter
     */
    getHolePosition(col: number, row: string): HolePosition {
        const x = this.holesStartX + (col - 1) * BreadboardGeometry.HOLE_SPACING;
        const y = this.rowYPositions.get(row) ?? 0;
        return { x, y, col, row };
    }
    
    /**
     * Get the column number for an X coordinate (returns 0 if not on a hole)
     */
    getColumnAtX(x: number): number {
        const relX = x - this.holesStartX;
        const col = Math.round(relX / BreadboardGeometry.HOLE_SPACING) + 1;
        if (col < 1 || col > BreadboardGeometry.NUM_COLS) return 0;
        return col;
    }
    
    /**
     * Get the row letter for a Y coordinate (returns empty string if not on a row)
     * Includes main rows (A-J) and power rail rows (TOP+, TOP-, BOTTOM+, BOTTOM-)
     */
    getRowAtY(y: number): string {
        for (const [row, rowY] of this.rowYPositions) {
            if (Math.abs(y - rowY) < BreadboardGeometry.HOLE_SPACING / 2) {
                return row;
            }
        }
        return '';
    }
    
    /**
     * Snap X coordinate to nearest hole column
     */
    snapToColumn(x: number): number {
        const col = this.getColumnAtX(x);
        if (col === 0) return x;
        return this.holesStartX + (col - 1) * BreadboardGeometry.HOLE_SPACING;
    }
    
    /**
     * Snap Y coordinate to nearest row
     */
    snapToRow(y: number): number {
        const row = this.getRowAtY(y);
        if (!row) return y;
        return this.rowYPositions.get(row) ?? y;
    }
    
    /**
     * Check if a row is in the top half (A-E)
     */
    isTopHalf(row: string): boolean {
        return BreadboardGeometry.TOP_ROWS.includes(row);
    }
    
    /**
     * Get Y position of the center channel
     */
    get channelY(): number {
        const rowEY = this.rowYPositions.get('E') ?? 0;
        return rowEY + BreadboardGeometry.HOLE_SPACING / 2;
    }
    
    /**
     * Get the IC row - row E for top pins, row F for bottom pins
     */
    getICPinRow(isTopPin: boolean): string {
        return isTopPin ? 'E' : 'F';
    }
    
    /**
     * Calculate IC body position so pins align with holes
     * IC straddles the channel: top pins in row E, bottom pins in row F
     * @param startCol - Column for first pin (1-indexed)
     * @param pinLength - Length of IC pins in base units
     * @returns Position of IC body top-left corner
     */
    getICBodyPosition(startCol: number, pinLength: number = 1.5): { x: number; y: number } {
        const rowEY = this.rowYPositions.get('E') ?? 0;
        // Top pin tip sits at row E, so body top = rowEY + pinLength
        const bodyY = rowEY + pinLength;
        // IC body left edge: first pin is at bodyX + 1 base unit from left edge
        const bodyX = this.holesStartX + (startCol - 1) * BreadboardGeometry.HOLE_SPACING - 1;
        return { x: bodyX, y: bodyY };
    }
    
    /**
     * Get IC body height that ensures bottom pins land on row F
     * Body height = (E to F distance) - 2 * pinLength
     */
    static getICBodyHeight(pinLength: number = 1.5): number {
        const eToFDistance = BreadboardGeometry.HOLE_SPACING + BreadboardGeometry.CHANNEL_HEIGHT;
        return eToFDistance - 2 * pinLength;
    }
    
    /**
     * Get the starting column for an IC placed at given position
     */
    getICStartColumn(bodyX: number): number {
        // Inverse of getICBodyPosition: bodyX = holesStartX + (col-1) * spacing - 1
        // So: col = (bodyX + 1 - holesStartX) / spacing + 1
        return Math.round((bodyX + 1 - this.holesStartX) / BreadboardGeometry.HOLE_SPACING) + 1;
    }
    
    /**
     * Update board position (for dragging)
     */
    setPosition(x: number, y: number): void {
        this.boardX = x;
        this.boardY = y;
        this.calculateRowPositions();
    }
    
    get x(): number { return this.boardX; }
    get y(): number { return this.boardY; }
    get width(): number { return BreadboardGeometry.BOARD_WIDTH; }
    get height(): number { return BreadboardGeometry.BOARD_HEIGHT; }
}
