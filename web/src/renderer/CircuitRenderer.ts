import { CircuitIR, ComponentIR, BoardIR, Wire, Position } from '../types';
import { BreadboardGeometry } from '../geometry/BreadboardGeometry';

const SCALE = 4;  // Pixels per base unit
const PADDING = 20;

// IC rendering constants derived from geometry
// IC straddles channel: top pins in row E, bottom pins in row F
// Distance from row E to row F = HOLE_SPACING + CHANNEL_HEIGHT
// Body height = (E to F distance) - 2 * pin length
const IC_PIN_LENGTH = 1.5;  // Pin length in base units (matches compiler)
const E_TO_F_DISTANCE = BreadboardGeometry.HOLE_SPACING + BreadboardGeometry.CHANNEL_HEIGHT;
const IC_BODY_HEIGHT = E_TO_F_DISTANCE - 2 * IC_PIN_LENGTH;

interface DraggableElement {
    id: string;
    type: 'component' | 'board';
    x: number;      // In pixels (scaled)
    y: number;
    width: number;
    height: number;
    parentBoardId?: string;  // For components on a board
}

export class CircuitRenderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private circuitIR: CircuitIR | null = null;
    
    // Geometry instances for each board
    private boardGeometries: Map<string, BreadboardGeometry> = new Map();
    
    // Interaction state
    private draggables: DraggableElement[] = [];
    private selectedId: string | null = null;
    private isDragging = false;
    private dragOffset = { x: 0, y: 0 };

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to get 2D context');
        this.ctx = ctx;
        this.resize();
        this.setupEventListeners();
        window.addEventListener('resize', () => this.resize());
    }

    private setupEventListeners(): void {
        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', this.onMouseUp.bind(this));
    }

    private getMousePos(e: MouseEvent): Position {
        const rect = this.canvas.getBoundingClientRect();
        return { 
            x: e.clientX - rect.left - PADDING, 
            y: e.clientY - rect.top - PADDING 
        };
    }

    private findElementAt(pos: Position): DraggableElement | null {
        // Check in reverse order (top elements first)
        // Components are rendered after boards, so check components first
        for (let i = this.draggables.length - 1; i >= 0; i--) {
            const el = this.draggables[i];
            if (pos.x >= el.x && pos.x <= el.x + el.width &&
                pos.y >= el.y && pos.y <= el.y + el.height) {
                return el;
            }
        }
        return null;
    }

    private onMouseDown(e: MouseEvent): void {
        const pos = this.getMousePos(e);
        const element = this.findElementAt(pos);
        
        if (element) {
            this.selectedId = element.id;
            this.isDragging = true;
            this.dragOffset = { x: pos.x - element.x, y: pos.y - element.y };
            this.canvas.style.cursor = 'grabbing';
            this.redraw();
        } else {
            this.selectedId = null;
            this.redraw();
        }
    }

    private onMouseMove(e: MouseEvent): void {
        const pos = this.getMousePos(e);
        
        if (this.isDragging && this.selectedId && this.circuitIR) {
            const newX = pos.x - this.dragOffset.x;
            const newY = pos.y - this.dragOffset.y;
            const newBaseX = newX / SCALE;
            const newBaseY = newY / SCALE;
            
            // Find the dragged element
            const dragged = this.draggables.find(d => d.id === this.selectedId);
            if (!dragged) return;
            
            if (dragged.type === 'board') {
                // Move board and all components and wires on it
                const board = this.circuitIR.boards.find(b => b.id === this.selectedId);
                if (board) {
                    const dx = newBaseX - board.position.x;
                    const dy = newBaseY - board.position.y;
                    
                    board.position = { x: newBaseX, y: newBaseY };
                    
                    // Move all components on this board
                    for (const comp of this.circuitIR.components) {
                        comp.position.x += dx;
                        comp.position.y += dy;
                    }
                    
                    // Move all wires (update positions and waypoints)
                    for (const wire of this.circuitIR.wires) {
                        wire.from.x += dx;
                        wire.from.y += dy;
                        wire.to.x += dx;
                        wire.to.y += dy;
                        if (wire.waypoints) {
                            for (const wp of wire.waypoints) {
                                wp.x += dx;
                                wp.y += dy;
                            }
                        }
                    }
                    
                    // Update geometry
                    const geo = this.boardGeometries.get(board.id);
                    if (geo) geo.setPosition(newBaseX, newBaseY);
                }
            } else {
                // Move just the component
                const comp = this.circuitIR.components.find(c => c.id === this.selectedId);
                if (comp) {
                    comp.position = { x: newBaseX, y: newBaseY };
                }
            }
            
            this.rebuildDraggables();
            this.redraw();
        } else {
            const element = this.findElementAt(pos);
            this.canvas.style.cursor = element ? 'grab' : 'default';
        }
    }

    private onMouseUp(): void {
        this.isDragging = false;
        this.canvas.style.cursor = 'default';
    }

    resize(): void {
        const parent = this.canvas.parentElement;
        if (!parent) return;
        
        const dpr = window.devicePixelRatio || 1;
        const rect = parent.getBoundingClientRect();
        
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `${rect.height}px`;
        
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
        
        if (this.circuitIR) this.redraw();
    }

    render(ir: CircuitIR): void {
        this.circuitIR = ir;
        this.boardGeometries.clear();
        this.draggables = [];
        this.selectedId = null;
        
        // Create geometry for each board
        for (const board of ir.boards) {
            this.boardGeometries.set(
                board.id, 
                new BreadboardGeometry(board.position.x, board.position.y)
            );
        }
        
        this.rebuildDraggables();
        this.redraw();
    }

    private rebuildDraggables(): void {
        this.draggables = [];
        
        if (!this.circuitIR) return;
        
        // Add boards first (so they're checked last during hit testing)
        for (const board of this.circuitIR.boards) {
            const geo = this.boardGeometries.get(board.id);
            if (geo) {
                this.draggables.push({
                    id: board.id,
                    type: 'board',
                    x: geo.x * SCALE,
                    y: geo.y * SCALE,
                    width: geo.width * SCALE,
                    height: geo.height * SCALE
                });
            }
        }
        
        // Add components (rendered on top, checked first)
        for (const comp of this.circuitIR.components) {
            const { width, height } = this.getICDimensions(comp.pinCount);
            
            this.draggables.push({
                id: comp.id,
                type: 'component',
                x: comp.position.x * SCALE,
                y: comp.position.y * SCALE,
                width: width * SCALE,
                height: height * SCALE,
                parentBoardId: this.circuitIR.boards[0]?.id
            });
        }
    }
    
    /**
     * Get IC dimensions in base units - ensures pins align with breadboard holes
     * IC body width = (pinsPerSide - 1) * HOLE_SPACING + margins
     * IC body height = calculated so pins reach rows E and F
     */
    private getICDimensions(pinCount: number): { width: number; height: number; pinLength: number } {
        const pinsPerSide = pinCount / 2;
        // Width: pins span (pinsPerSide-1) * HOLE_SPACING, plus 2 units for body margins
        const width = (pinsPerSide - 1) * BreadboardGeometry.HOLE_SPACING + 2;
        // Height: body spans the channel between row E and F
        const height = IC_BODY_HEIGHT;
        return { width, height, pinLength: IC_PIN_LENGTH };
    }

    private redraw(): void {
        if (!this.circuitIR) return;
        
        this.clear();
        this.ctx.save();
        this.ctx.translate(PADDING, PADDING);
        
        for (const board of this.circuitIR.boards) {
            this.renderBoard(board);
        }
        
        for (const comp of this.circuitIR.components) {
            this.renderComponent(comp);
        }
        
        for (const wire of this.circuitIR.wires) {
            this.renderWire(wire);
        }
        
        this.ctx.restore();
    }

    clear(): void {
        const parent = this.canvas.parentElement;
        if (!parent) return;
        const rect = parent.getBoundingClientRect();
        this.ctx.fillStyle = '#f5f5f5';
        this.ctx.fillRect(0, 0, rect.width, rect.height);
    }

    private renderBoard(board: BoardIR): void {
        const geo = this.boardGeometries.get(board.id);
        if (!geo) return;
        
        const x = geo.x * SCALE;
        const y = geo.y * SCALE;
        const w = geo.width * SCALE;
        const h = geo.height * SCALE;
        const holeSpacing = BreadboardGeometry.HOLE_SPACING * SCALE;
        const numCols = BreadboardGeometry.NUM_COLS;
        const railHeight = BreadboardGeometry.RAIL_HEIGHT * SCALE;
        const channelHeight = BreadboardGeometry.CHANNEL_HEIGHT * SCALE;
        
        // Selection highlight for board
        if (this.selectedId === board.id) {
            this.ctx.strokeStyle = '#0066cc';
            this.ctx.lineWidth = 3;
            this.ctx.setLineDash([6, 3]);
            this.roundRect(x - 4, y - 4, w + 8, h + 8, 8);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }

        // Board background
        this.ctx.fillStyle = '#e8e4df';
        this.ctx.strokeStyle = '#bbb';
        this.ctx.lineWidth = 1;
        this.roundRect(x, y, w, h, 6);
        this.ctx.fill();
        this.ctx.stroke();

        // Top power rail
        const topRailY = y + 4;
        this.ctx.fillStyle = '#f0ebe6';
        this.ctx.fillRect(x + 6, topRailY, w - 12, railHeight - 4);
        
        // + and - labels only (no colored strips)
        this.ctx.font = 'bold 10px sans-serif';
        this.ctx.textAlign = 'left';
        this.ctx.fillStyle = '#c44';
        this.ctx.fillText('+', x + 8, topRailY + 10);
        this.ctx.fillStyle = '#44c';
        this.ctx.fillText('−', x + 8, topRailY + railHeight - 8);
        
        // Top rail holes
        const holesStartX = geo.holesStartX * SCALE;
        this.ctx.fillStyle = '#222';
        for (let col = 0; col < numCols; col++) {
            const hx = holesStartX + col * holeSpacing;
            this.ctx.beginPath();
            this.ctx.arc(hx, topRailY + 8, 1.5, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.beginPath();
            this.ctx.arc(hx, topRailY + railHeight - 10, 1.5, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // Bottom power rail
        const bottomRailY = y + h - railHeight;
        this.ctx.fillStyle = '#f0ebe6';
        this.ctx.fillRect(x + 6, bottomRailY, w - 12, railHeight - 4);
        
        // + and - labels
        this.ctx.fillStyle = '#c44';
        this.ctx.fillText('+', x + 8, bottomRailY + 10);
        this.ctx.fillStyle = '#44c';
        this.ctx.fillText('−', x + 8, bottomRailY + railHeight - 8);
        
        // Bottom rail holes
        this.ctx.fillStyle = '#222';
        for (let col = 0; col < numCols; col++) {
            const hx = holesStartX + col * holeSpacing;
            this.ctx.beginPath();
            this.ctx.arc(hx, bottomRailY + 8, 1.5, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.beginPath();
            this.ctx.arc(hx, bottomRailY + railHeight - 10, 1.5, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // Center channel
        const channelY = geo.channelY * SCALE - channelHeight / 2;
        this.ctx.fillStyle = '#c8c4bf';
        this.ctx.fillRect(x + 8, channelY, w - 16, channelHeight);

        // Main holes - using geometry for accurate positions
        this.ctx.fillStyle = '#222';
        for (const row of BreadboardGeometry.ALL_ROWS) {
            for (let col = 1; col <= numCols; col++) {
                const hole = geo.getHolePosition(col, row);
                this.ctx.beginPath();
                this.ctx.arc(hole.x * SCALE, hole.y * SCALE, 1.5, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }

        // Column numbers
        this.ctx.fillStyle = '#888';
        this.ctx.font = '8px sans-serif';
        this.ctx.textAlign = 'center';
        for (let col = 1; col <= numCols; col += 5) {
            const hx = holesStartX + (col - 1) * holeSpacing;
            this.ctx.fillText(String(col), hx, y + h + 12);
        }

        // Row labels
        this.ctx.textAlign = 'right';
        for (const row of BreadboardGeometry.TOP_ROWS) {
            const hole = geo.getHolePosition(1, row);
            this.ctx.fillText(row, x - 4, hole.y * SCALE + 3);
        }
        for (const row of BreadboardGeometry.BOTTOM_ROWS) {
            const hole = geo.getHolePosition(1, row);
            this.ctx.fillText(row, x - 4, hole.y * SCALE + 3);
        }
    }

    private renderComponent(comp: ComponentIR): void {
        const x = comp.position.x * SCALE;
        const y = comp.position.y * SCALE;
        const pinsPerSide = comp.pinCount / 2;
        const holeSpacing = BreadboardGeometry.HOLE_SPACING * SCALE;
        
        // Use geometry-derived dimensions for consistent alignment
        const { width, height, pinLength } = this.getICDimensions(comp.pinCount);
        const icWidth = width * SCALE;
        const icHeight = height * SCALE;
        const pinLengthPx = pinLength * SCALE;
        
        // Calculate first pin X offset from body left edge (1 base unit = body margin)
        const firstPinOffset = 1 * SCALE;

        // Selection highlight
        if (this.selectedId === comp.id) {
            this.ctx.strokeStyle = '#0066cc';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([4, 2]);
            this.roundRect(x - 4, y - pinLengthPx - 4, icWidth + 8, icHeight + pinLengthPx * 2 + 8, 4);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }

        // IC body
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 1;
        this.roundRect(x, y, icWidth, icHeight, 3);
        this.ctx.fill();
        this.ctx.stroke();

        // Notch on left side
        this.ctx.fillStyle = '#333';
        this.ctx.beginPath();
        this.ctx.arc(x, y + icHeight / 2, 4, -Math.PI / 2, Math.PI / 2);
        this.ctx.fill();

        // Pin 1 dot
        this.ctx.fillStyle = '#555';
        this.ctx.beginPath();
        this.ctx.arc(x + 6, y + 6, 2, 0, Math.PI * 2);
        this.ctx.fill();

        // Pins - positioned to align with breadboard holes
        this.ctx.fillStyle = '#888';
        for (let i = 0; i < pinsPerSide; i++) {
            // Pin X position: first pin at body + offset, subsequent pins at hole spacing
            const px = x + firstPinOffset + i * holeSpacing;
            // Top pins
            this.ctx.fillRect(px - 1.5, y - pinLengthPx, 3, pinLengthPx);
            this.ctx.beginPath();
            this.ctx.arc(px, y - pinLengthPx, 2, 0, Math.PI * 2);
            this.ctx.fill();
            // Bottom pins
            this.ctx.fillRect(px - 1.5, y + icHeight, 3, pinLengthPx);
            this.ctx.beginPath();
            this.ctx.arc(px, y + icHeight + pinLengthPx, 2, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // IC label
        this.ctx.fillStyle = '#999';
        this.ctx.font = 'bold 9px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(comp.type, x + icWidth / 2, y + icHeight / 2);
        
        // Component ID
        this.ctx.fillStyle = '#666';
        this.ctx.font = '10px sans-serif';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(comp.id, x + icWidth / 2, y + icHeight + pinLengthPx + 4);
    }

    private renderWire(wire: Wire): void {
        const fromX = wire.from.x * SCALE;
        const fromY = wire.from.y * SCALE;
        const toX = wire.to.x * SCALE;
        const toY = wire.to.y * SCALE;

        this.ctx.strokeStyle = wire.color;
        this.ctx.lineWidth = 2;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        this.ctx.beginPath();
        this.ctx.moveTo(fromX, fromY);

        if (wire.waypoints) {
            for (const wp of wire.waypoints) {
                this.ctx.lineTo(wp.x * SCALE, wp.y * SCALE);
            }
        }

        this.ctx.lineTo(toX, toY);
        this.ctx.stroke();

        // Connection dots
        this.ctx.fillStyle = wire.color;
        this.ctx.beginPath();
        this.ctx.arc(fromX, fromY, 3, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(toX, toY, 3, 0, Math.PI * 2);
        this.ctx.fill();
    }

    private roundRect(x: number, y: number, w: number, h: number, r: number): void {
        this.ctx.beginPath();
        this.ctx.moveTo(x + r, y);
        this.ctx.lineTo(x + w - r, y);
        this.ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        this.ctx.lineTo(x + w, y + h - r);
        this.ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        this.ctx.lineTo(x + r, y + h);
        this.ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        this.ctx.lineTo(x, y + r);
        this.ctx.quadraticCurveTo(x, y, x + r, y);
        this.ctx.closePath();
    }
}
