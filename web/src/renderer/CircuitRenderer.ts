import { CircuitIR, ComponentIR, BoardIR, Wire, Position } from '../types';
import { BreadboardGeometry } from '../geometry/BreadboardGeometry';
import { getComponentFootprint } from '../geometry/ComponentFootprints';

const BASE_SCALE = 4;  // Pixels per base unit
const PADDING = 20;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

// IC rendering constants derived from geometry
// IC straddles channel: top pins in row E, bottom pins in row F
// Distance from row E to row F = HOLE_SPACING + CHANNEL_HEIGHT
// Body height = (E to F distance) - 2 * pin length
const IC_PIN_LENGTH = 1.5;  // Pin length in base units (matches compiler)
const E_TO_F_DISTANCE = BreadboardGeometry.HOLE_SPACING + BreadboardGeometry.CHANNEL_HEIGHT;
const IC_BODY_HEIGHT = E_TO_F_DISTANCE - 2 * IC_PIN_LENGTH;

// Wire hit detection tolerance (in base units)
const WIRE_HIT_TOLERANCE = 1.5;

interface DraggableElement {
    id: string;
    type: 'component' | 'board' | 'wire';
    x: number;      // In base units
    y: number;
    width: number;
    height: number;
    parentBoardId?: string;  // For components on a board
    wireIndex?: number;      // For wires
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
    
    // Zoom and pan state
    private zoom = 1;
    private panX = 0;
    private panY = 0;

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
        this.canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
    }

    private getMousePos(e: MouseEvent): Position {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        // Convert screen coordinates to canvas world coordinates
        const canvasX = (e.clientX - rect.left) * dpr;
        const canvasY = (e.clientY - rect.top) * dpr;
        // Account for pan, padding, zoom, and BASE_SCALE to get base units
        // Screen -> canvas: already done above
        // canvas -> world (after pan/padding): (canvasX/dpr - PADDING - panX) / zoom
        // world -> base units: / BASE_SCALE
        return { 
            x: (canvasX / dpr - PADDING - this.panX) / this.zoom / BASE_SCALE, 
            y: (canvasY / dpr - PADDING - this.panY) / this.zoom / BASE_SCALE
        };
    }
    
    private onWheel(e: WheelEvent): void {
        e.preventDefault();
        
        const rect = this.canvas.getBoundingClientRect();
        // Mouse position in screen space (relative to canvas)
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Calculate zoom factor
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom * zoomFactor));
        
        if (newZoom !== this.zoom) {
            // Adjust pan to keep mouse point stationary
            // Before zoom: screenPos = (worldPos * zoom) + pan + padding
            // After zoom: screenPos = (worldPos * newZoom) + newPan + padding
            // We want the same worldPos under the mouse, so:
            // (mouseX - padding - panX) / zoom = (mouseX - padding - newPanX) / newZoom
            const worldX = (mouseX - PADDING - this.panX) / this.zoom;
            const worldY = (mouseY - PADDING - this.panY) / this.zoom;
            
            this.panX = mouseX - PADDING - worldX * newZoom;
            this.panY = mouseY - PADDING - worldY * newZoom;
            this.zoom = newZoom;
            
            this.rebuildDraggables();
            this.redraw();
        }
    }

    private findElementAt(pos: Position): DraggableElement | null {
        // Check in reverse order (top elements first)
        // Wires → Components → Boards (in that priority order)
        for (let i = this.draggables.length - 1; i >= 0; i--) {
            const el = this.draggables[i];
            
            if (el.type === 'wire' && el.wireIndex !== undefined && this.circuitIR) {
                // For wires, use line-segment hit detection
                const wire = this.circuitIR.wires[el.wireIndex];
                if (wire && this.isPointNearWire(pos, wire)) {
                    return el;
                }
            } else {
                // For boards and components, use bounding box
                if (pos.x >= el.x && pos.x <= el.x + el.width &&
                    pos.y >= el.y && pos.y <= el.y + el.height) {
                    return el;
                }
            }
        }
        return null;
    }
    
    // Check if a point is close to any segment of a wire
    private isPointNearWire(point: Position, wire: Wire): boolean {
        const segments: [Position, Position][] = [];
        
        // Build list of wire segments
        let current: Position = { x: wire.from.x, y: wire.from.y };
        
        if (wire.waypoints) {
            for (const wp of wire.waypoints) {
                segments.push([current, wp]);
                current = wp;
            }
        }
        segments.push([current, { x: wire.to.x, y: wire.to.y }]);
        
        // Check distance to each segment
        for (const [p1, p2] of segments) {
            if (this.distanceToSegment(point, p1, p2) < WIRE_HIT_TOLERANCE) {
                return true;
            }
        }
        return false;
    }
    
    // Calculate perpendicular distance from point to line segment
    private distanceToSegment(point: Position, p1: Position, p2: Position): number {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const lengthSq = dx * dx + dy * dy;
        
        if (lengthSq === 0) {
            // p1 and p2 are the same point
            return Math.sqrt((point.x - p1.x) ** 2 + (point.y - p1.y) ** 2);
        }
        
        // Parameter t for projection onto line segment [0, 1]
        let t = ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / lengthSq;
        t = Math.max(0, Math.min(1, t));
        
        // Closest point on segment
        const closestX = p1.x + t * dx;
        const closestY = p1.y + t * dy;
        
        return Math.sqrt((point.x - closestX) ** 2 + (point.y - closestY) ** 2);
    }

    private onMouseDown(e: MouseEvent): void {
        const pos = this.getMousePos(e);
        const element = this.findElementAt(pos);
        
        if (element) {
            this.selectedId = element.id;
            this.isDragging = true;
            
            // For wires, store the initial position for offset calculation
            if (element.type === 'wire' && element.wireIndex !== undefined && this.circuitIR) {
                const wire = this.circuitIR.wires[element.wireIndex];
                this.dragOffset = { x: pos.x - wire.from.x, y: pos.y - wire.from.y };
            } else {
                this.dragOffset = { x: pos.x - element.x, y: pos.y - element.y };
            }
            
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
            // pos is now in base units (world coordinates)
            const newBaseX = pos.x - this.dragOffset.x;
            const newBaseY = pos.y - this.dragOffset.y;
            
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
            } else if (dragged.type === 'wire' && dragged.wireIndex !== undefined) {
                // Move wire independently
                const wire = this.circuitIR.wires[dragged.wireIndex];
                if (wire) {
                    const dx = newBaseX - wire.from.x;
                    const dy = newBaseY - wire.from.y;
                    
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
        // Draggables now store base units, not scaled pixels
        for (const board of this.circuitIR.boards) {
            const geo = this.boardGeometries.get(board.id);
            if (geo) {
                this.draggables.push({
                    id: board.id,
                    type: 'board',
                    x: geo.x,
                    y: geo.y,
                    width: geo.width,
                    height: geo.height
                });
            }
        }
        
        // Add components (rendered on top, checked first)
        for (const comp of this.circuitIR.components) {
            const { width, height } = this.getComponentDimensions(comp);
            
            this.draggables.push({
                id: comp.id,
                type: 'component',
                x: comp.position.x,
                y: comp.position.y,
                width: width,
                height: height,
                parentBoardId: this.circuitIR.boards[0]?.id
            });
        }
        
        // Add wires (checked first during hit testing since added last)
        for (let i = 0; i < this.circuitIR.wires.length; i++) {
            const wire = this.circuitIR.wires[i];
            // Compute bounding box for wire (used for reference, actual hit test uses line distance)
            const minX = Math.min(wire.from.x, wire.to.x, ...(wire.waypoints?.map(w => w.x) || []));
            const maxX = Math.max(wire.from.x, wire.to.x, ...(wire.waypoints?.map(w => w.x) || []));
            const minY = Math.min(wire.from.y, wire.to.y, ...(wire.waypoints?.map(w => w.y) || []));
            const maxY = Math.max(wire.from.y, wire.to.y, ...(wire.waypoints?.map(w => w.y) || []));
            
            this.draggables.push({
                id: `wire_${i}`,
                type: 'wire',
                x: minX,
                y: minY,
                width: maxX - minX,
                height: maxY - minY,
                wireIndex: i
            });
        }
    }
    
    /**
     * Get component dimensions based on category using the unified footprint system
     */
    private getComponentDimensions(comp: ComponentIR): { width: number; height: number; pinLength: number } {
        const category = comp.category || 'ic';
        const footprint = getComponentFootprint(category, comp.pinCount, comp.type);
        
        // Calculate pin length from footprint
        let pinLength = IC_PIN_LENGTH;
        if (footprint.pins.length > 0) {
            const pin = footprint.pins[0];
            // For vertical components, pin extends below body
            if (footprint.orientation === 'vertical') {
                pinLength = Math.abs(pin.offsetY - footprint.bodyHeight);
            }
        }
        
        return { 
            width: footprint.bodyWidth, 
            height: footprint.bodyHeight, 
            pinLength 
        };
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
        // Apply pan and zoom transforms
        this.ctx.translate(PADDING + this.panX, PADDING + this.panY);
        this.ctx.scale(this.zoom, this.zoom);
        
        for (const board of this.circuitIR.boards) {
            this.renderBoard(board);
        }
        
        for (const comp of this.circuitIR.components) {
            this.renderComponent(comp);
        }
        
        for (let i = 0; i < this.circuitIR.wires.length; i++) {
            this.renderWire(this.circuitIR.wires[i], i);
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
        
        const S = BASE_SCALE;  // Base scale factor
        const x = geo.x * S;
        const y = geo.y * S;
        const w = geo.width * S;
        const h = geo.height * S;
        const holeSpacing = BreadboardGeometry.HOLE_SPACING * S;
        const numCols = BreadboardGeometry.NUM_COLS;
        const railHeight = BreadboardGeometry.RAIL_HEIGHT * S;
        const channelHeight = BreadboardGeometry.CHANNEL_HEIGHT * S;
        
        // Selection highlight for board
        if (this.selectedId === board.id) {
            this.ctx.strokeStyle = '#0066cc';
            this.ctx.lineWidth = 3 / this.zoom;
            this.ctx.setLineDash([6 / this.zoom, 3 / this.zoom]);
            this.roundRect(x - 4, y - 4, w + 8, h + 8, 8);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }

        // Board background
        this.ctx.fillStyle = '#e8e4df';
        this.ctx.strokeStyle = '#bbb';
        this.ctx.lineWidth = 1 / this.zoom;
        this.roundRect(x, y, w, h, 6);
        this.ctx.fill();
        this.ctx.stroke();

        // Top power rail
        const topRailY = y + 4;
        this.ctx.fillStyle = '#f0ebe6';
        this.ctx.fillRect(x + 6, topRailY, w - 12, railHeight - 4);
        
        // + and - labels only (no colored strips)
        this.ctx.font = `bold ${10 / this.zoom}px sans-serif`;
        this.ctx.textAlign = 'left';
        this.ctx.fillStyle = '#c44';
        this.ctx.fillText('+', x + 8, topRailY + 10);
        this.ctx.fillStyle = '#44c';
        this.ctx.fillText('−', x + 8, topRailY + railHeight - 8);
        
        // Top rail holes
        const holesStartX = geo.holesStartX * S;
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
        this.ctx.font = `bold ${10 / this.zoom}px sans-serif`;
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

        // Center channel - positioned exactly between rows E and F
        // Row E Y position and Row F Y position from geometry
        const rowEHole = geo.getHolePosition(1, 'E');
        const rowFHole = geo.getHolePosition(1, 'F');
        const channelCenterY = ((rowEHole.y + rowFHole.y) / 2) * S;
        this.ctx.fillStyle = '#c8c4bf';
        this.ctx.fillRect(x + 8, channelCenterY - channelHeight / 2, w - 16, channelHeight);

        // Main holes - using geometry for accurate positions
        this.ctx.fillStyle = '#222';
        for (const row of BreadboardGeometry.ALL_ROWS) {
            for (let col = 1; col <= numCols; col++) {
                const hole = geo.getHolePosition(col, row);
                this.ctx.beginPath();
                this.ctx.arc(hole.x * S, hole.y * S, 1.5, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }

        // Column numbers
        this.ctx.fillStyle = '#888';
        this.ctx.font = `${8 / this.zoom}px sans-serif`;
        this.ctx.textAlign = 'center';
        for (let col = 1; col <= numCols; col += 5) {
            const hx = holesStartX + (col - 1) * holeSpacing;
            this.ctx.fillText(String(col), hx, y + h + 12);
        }

        // Row labels
        this.ctx.textAlign = 'right';
        for (const row of BreadboardGeometry.TOP_ROWS) {
            const hole = geo.getHolePosition(1, row);
            this.ctx.fillText(row, x - 4, hole.y * S + 3);
        }
        for (const row of BreadboardGeometry.BOTTOM_ROWS) {
            const hole = geo.getHolePosition(1, row);
            this.ctx.fillText(row, x - 4, hole.y * S + 3);
        }
    }

    private renderComponent(comp: ComponentIR): void {
        const category = comp.category || 'ic';
        
        switch (category) {
            case 'passive':
                this.renderPassive(comp);
                break;
            case 'diode':
                this.renderDiode(comp);
                break;
            case 'led':
                this.renderLED(comp);
                break;
            case 'sensor':
                this.renderSensor(comp);
                break;
            case 'transistor':
                this.renderTransistor(comp);
                break;
            case 'ic':
            default:
                this.renderIC(comp);
                break;
        }
    }
    
    /**
     * Render IC chips with standard pin numbering:
     * Bottom pins: 1, 2, 3, ..., N/2 (left to right)
     * Top pins: N, N-1, N-2, ..., N/2+1 (left to right, i.e., right to left in numbering)
     */
    private renderIC(comp: ComponentIR): void {
        const S = BASE_SCALE;
        const x = comp.position.x * S;
        const y = comp.position.y * S;
        const pinsPerSide = comp.pinCount / 2;
        const holeSpacing = BreadboardGeometry.HOLE_SPACING * S;
        
        const { width, height, pinLength } = this.getICDimensions(comp.pinCount);
        const icWidth = width * S;
        const icHeight = height * S;
        const pinLengthPx = pinLength * S;
        
        const firstPinOffset = 1 * S;

        // Selection highlight
        if (this.selectedId === comp.id) {
            this.ctx.strokeStyle = '#0066cc';
            this.ctx.lineWidth = 2 / this.zoom;
            this.ctx.setLineDash([4 / this.zoom, 2 / this.zoom]);
            this.roundRect(x - 4, y - pinLengthPx - 4, icWidth + 8, icHeight + pinLengthPx * 2 + 8, 4);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }

        // IC body
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 1 / this.zoom;
        this.roundRect(x, y, icWidth, icHeight, 3);
        this.ctx.fill();
        this.ctx.stroke();

        // Notch on left side (indicates pin 1 orientation)
        this.ctx.fillStyle = '#333';
        this.ctx.beginPath();
        this.ctx.arc(x, y + icHeight / 2, 4, -Math.PI / 2, Math.PI / 2);
        this.ctx.fill();

        // Pin 1 dot (bottom-left corner, near first bottom pin)
        this.ctx.fillStyle = '#555';
        this.ctx.beginPath();
        this.ctx.arc(x + 6, y + icHeight - 6, 2, 0, Math.PI * 2);
        this.ctx.fill();

        // Pins - Standard IC numbering: 
        // Bottom: pins 1 to N/2 (left to right)
        // Top: pins N to N/2+1 (left to right, so numbers decrease)
        this.ctx.fillStyle = '#888';
        for (let i = 0; i < pinsPerSide; i++) {
            const px = x + firstPinOffset + i * holeSpacing;
            
            // Bottom pins (1, 2, 3, ... N/2) - inserted into row F
            this.ctx.fillRect(px - 1.5, y + icHeight, 3, pinLengthPx);
            this.ctx.beginPath();
            this.ctx.arc(px, y + icHeight + pinLengthPx, 2, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Top pins (N, N-1, N-2, ... N/2+1) - inserted into row E
            this.ctx.fillRect(px - 1.5, y - pinLengthPx, 3, pinLengthPx);
            this.ctx.beginPath();
            this.ctx.arc(px, y - pinLengthPx, 2, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // IC label
        this.ctx.fillStyle = '#999';
        this.ctx.font = `bold ${9 / this.zoom}px monospace`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(comp.type, x + icWidth / 2, y + icHeight / 2);
        
        // Component ID
        this.ctx.fillStyle = '#666';
        this.ctx.font = `${10 / this.zoom}px sans-serif`;
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(comp.id, x + icWidth / 2, y + icHeight + pinLengthPx + 4);
    }
    
    /**
     * Render passive components (resistor, capacitor, inductor, potentiometer)
     * Resistor: zigzag body with two leads
     * Capacitor: two plates
     * Inductor: coil
     */
    private renderPassive(comp: ComponentIR): void {
        const S = BASE_SCALE;
        const x = comp.position.x * S;
        const y = comp.position.y * S;
        const { width, height, pinLength } = this.getComponentDimensions(comp);
        const w = width * S;
        const h = height * S;
        const leadLen = pinLength * S;
        
        // Selection highlight
        if (this.selectedId === comp.id) {
            this.ctx.strokeStyle = '#0066cc';
            this.ctx.lineWidth = 2 / this.zoom;
            this.ctx.setLineDash([4 / this.zoom, 2 / this.zoom]);
            this.roundRect(x - leadLen - 4, y - 4, w + leadLen * 2 + 8, h + 8, 4);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
        
        const centerY = y + h / 2;
        
        // Leads (wires)
        this.ctx.strokeStyle = '#888';
        this.ctx.lineWidth = 2 / this.zoom;
        this.ctx.beginPath();
        this.ctx.moveTo(x - leadLen, centerY);
        this.ctx.lineTo(x, centerY);
        this.ctx.moveTo(x + w, centerY);
        this.ctx.lineTo(x + w + leadLen, centerY);
        this.ctx.stroke();
        
        // Lead terminals
        this.ctx.fillStyle = '#888';
        this.ctx.beginPath();
        this.ctx.arc(x - leadLen, centerY, 2, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(x + w + leadLen, centerY, 2, 0, Math.PI * 2);
        this.ctx.fill();
        
        if (comp.type === 'CAP') {
            // Capacitor: two parallel plates
            this.ctx.strokeStyle = '#4a7c59';
            this.ctx.lineWidth = 3 / this.zoom;
            const plateGap = 4;
            this.ctx.beginPath();
            this.ctx.moveTo(x + w/2 - plateGap/2, y);
            this.ctx.lineTo(x + w/2 - plateGap/2, y + h);
            this.ctx.moveTo(x + w/2 + plateGap/2, y);
            this.ctx.lineTo(x + w/2 + plateGap/2, y + h);
            this.ctx.stroke();
        } else if (comp.type === 'IND') {
            // Inductor: coil/loops
            this.ctx.strokeStyle = '#6b5b95';
            this.ctx.lineWidth = 2 / this.zoom;
            this.ctx.beginPath();
            const numLoops = 4;
            const loopWidth = w / numLoops;
            for (let i = 0; i < numLoops; i++) {
                this.ctx.arc(x + loopWidth * (i + 0.5), centerY, loopWidth / 2, Math.PI, 0, false);
            }
            this.ctx.stroke();
        } else if (comp.type === 'POT') {
            // Potentiometer: resistor body with arrow
            this.ctx.fillStyle = '#d4a574';
            this.ctx.strokeStyle = '#8b6914';
            this.ctx.lineWidth = 1 / this.zoom;
            this.roundRect(x, y, w, h, 2);
            this.ctx.fill();
            this.ctx.stroke();
            // Arrow for wiper
            this.ctx.beginPath();
            this.ctx.moveTo(x + w/2, y - 4);
            this.ctx.lineTo(x + w/2 - 4, y - 8);
            this.ctx.lineTo(x + w/2 + 4, y - 8);
            this.ctx.closePath();
            this.ctx.fillStyle = '#666';
            this.ctx.fill();
        } else {
            // Resistor: rectangular body with color bands
            // Body
            this.ctx.fillStyle = '#d4a574';  // Tan/beige color
            this.ctx.strokeStyle = '#8b6914';
            this.ctx.lineWidth = 1 / this.zoom;
            this.roundRect(x, y, w, h, 2);
            this.ctx.fill();
            this.ctx.stroke();
            
            // Color bands (simplified - 4 bands)
            const bandColors = ['#8b4513', '#000', '#f00', '#ffd700'];
            const bandWidth = 2;
            const bandSpacing = w / 5;
            for (let i = 0; i < 4; i++) {
                this.ctx.fillStyle = bandColors[i];
                this.ctx.fillRect(x + bandSpacing * (i + 0.5) - bandWidth/2, y + 1, bandWidth, h - 2);
            }
        }
        
        // Label
        this.ctx.fillStyle = '#666';
        this.ctx.font = `${8 / this.zoom}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(`${comp.id}${comp.value ? ' ' + comp.value : ''}`, x + w/2, y + h + 4);
    }
    
    /**
     * Render diodes (standard, zener, schottky)
     * Triangle pointing toward cathode with line
     */
    private renderDiode(comp: ComponentIR): void {
        const S = BASE_SCALE;
        const x = comp.position.x * S;
        const y = comp.position.y * S;
        const { width, height, pinLength } = this.getComponentDimensions(comp);
        const w = width * S;
        const h = height * S;
        const leadLen = pinLength * S;
        
        // Selection highlight
        if (this.selectedId === comp.id) {
            this.ctx.strokeStyle = '#0066cc';
            this.ctx.lineWidth = 2 / this.zoom;
            this.ctx.setLineDash([4 / this.zoom, 2 / this.zoom]);
            this.roundRect(x - leadLen - 4, y - 4, w + leadLen * 2 + 8, h + 8, 4);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
        
        const centerY = y + h / 2;
        
        // Leads
        this.ctx.strokeStyle = '#888';
        this.ctx.lineWidth = 2 / this.zoom;
        this.ctx.beginPath();
        this.ctx.moveTo(x - leadLen, centerY);
        this.ctx.lineTo(x, centerY);
        this.ctx.moveTo(x + w, centerY);
        this.ctx.lineTo(x + w + leadLen, centerY);
        this.ctx.stroke();
        
        // Lead terminals
        this.ctx.fillStyle = '#888';
        this.ctx.beginPath();
        this.ctx.arc(x - leadLen, centerY, 2, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(x + w + leadLen, centerY, 2, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Diode body - black glass
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 1 / this.zoom;
        this.roundRect(x, y, w, h, 2);
        this.ctx.fill();
        this.ctx.stroke();
        
        // Cathode band (white/silver stripe)
        this.ctx.fillStyle = '#ccc';
        this.ctx.fillRect(x + w - 6, y, 4, h);
        
        // Label
        this.ctx.fillStyle = '#666';
        this.ctx.font = `${8 / this.zoom}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(comp.id, x + w/2, y + h + 4);
    }
    
    /**
     * Render LEDs (light emitting diodes)
     * Rounded dome shape with flat bottom (cathode side)
     */
    private renderLED(comp: ComponentIR): void {
        const S = BASE_SCALE;
        const x = comp.position.x * S;
        const y = comp.position.y * S;
        const { width, height, pinLength } = this.getComponentDimensions(comp);
        const w = width * S;
        const h = height * S;
        const leadLen = pinLength * S;
        
        // Selection highlight
        if (this.selectedId === comp.id) {
            this.ctx.strokeStyle = '#0066cc';
            this.ctx.lineWidth = 2 / this.zoom;
            this.ctx.setLineDash([4 / this.zoom, 2 / this.zoom]);
            this.ctx.beginPath();
            this.ctx.arc(x + w/2, y + h/2, w/2 + 4, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
        
        const centerX = x + w / 2;
        const centerY = y + h / 2;
        const radius = Math.min(w, h) / 2;
        
        // Leads (vertical for LED)
        this.ctx.strokeStyle = '#888';
        this.ctx.lineWidth = 2 / this.zoom;
        this.ctx.beginPath();
        // Anode (longer)
        this.ctx.moveTo(centerX - 4, y + h);
        this.ctx.lineTo(centerX - 4, y + h + leadLen);
        // Cathode (shorter with flat)
        this.ctx.moveTo(centerX + 4, y + h);
        this.ctx.lineTo(centerX + 4, y + h + leadLen * 0.7);
        this.ctx.stroke();
        
        // Lead terminals
        this.ctx.fillStyle = '#888';
        this.ctx.beginPath();
        this.ctx.arc(centerX - 4, y + h + leadLen, 2, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(centerX + 4, y + h + leadLen * 0.7, 2, 0, Math.PI * 2);
        this.ctx.fill();
        
        // LED dome - color based on type
        let ledColor = '#ff3333';  // Default red
        if (comp.type === 'IR_LED') ledColor = '#660066';  // Purple tint for IR
        else if (comp.type.includes('GREEN')) ledColor = '#33ff33';
        else if (comp.type.includes('BLUE')) ledColor = '#3333ff';
        else if (comp.type.includes('YELLOW')) ledColor = '#ffff33';
        
        // Dome gradient
        const gradient = this.ctx.createRadialGradient(
            centerX - radius/3, centerY - radius/3, 0,
            centerX, centerY, radius
        );
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.3, ledColor);
        gradient.addColorStop(1, this.darkenColor(ledColor, 0.5));
        
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Outline
        this.ctx.strokeStyle = '#666';
        this.ctx.lineWidth = 1 / this.zoom;
        this.ctx.stroke();
        
        // Flat bottom indicator (cathode side)
        this.ctx.strokeStyle = '#333';
        this.ctx.beginPath();
        this.ctx.moveTo(centerX + 3, y + h - 2);
        this.ctx.lineTo(centerX + radius - 1, y + h - 2);
        this.ctx.stroke();
        
        // Label
        this.ctx.fillStyle = '#666';
        this.ctx.font = `${8 / this.zoom}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(comp.id, centerX, y + h + leadLen + 4);
    }
    
    /**
     * Render sensors (LDR, photodiode)
     */
    private renderSensor(comp: ComponentIR): void {
        const S = BASE_SCALE;
        const x = comp.position.x * S;
        const y = comp.position.y * S;
        const { width, height, pinLength } = this.getComponentDimensions(comp);
        const w = width * S;
        const h = height * S;
        const leadLen = pinLength * S;
        
        // Selection highlight
        if (this.selectedId === comp.id) {
            this.ctx.strokeStyle = '#0066cc';
            this.ctx.lineWidth = 2 / this.zoom;
            this.ctx.setLineDash([4 / this.zoom, 2 / this.zoom]);
            this.roundRect(x - leadLen - 4, y - 4, w + leadLen * 2 + 8, h + 8, 4);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
        
        const centerX = x + w / 2;
        const centerY = y + h / 2;
        
        // Leads (vertical)
        this.ctx.strokeStyle = '#888';
        this.ctx.lineWidth = 2 / this.zoom;
        this.ctx.beginPath();
        this.ctx.moveTo(centerX - 4, y + h);
        this.ctx.lineTo(centerX - 4, y + h + leadLen);
        this.ctx.moveTo(centerX + 4, y + h);
        this.ctx.lineTo(centerX + 4, y + h + leadLen);
        this.ctx.stroke();
        
        // Lead terminals
        this.ctx.fillStyle = '#888';
        this.ctx.beginPath();
        this.ctx.arc(centerX - 4, y + h + leadLen, 2, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(centerX + 4, y + h + leadLen, 2, 0, Math.PI * 2);
        this.ctx.fill();
        
        if (comp.type === 'LDR') {
            // LDR - brownish disc with zigzag pattern
            this.ctx.fillStyle = '#8b4513';
            this.ctx.beginPath();
            this.ctx.arc(centerX, centerY, w/2, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Zigzag pattern (light-sensitive element)
            this.ctx.strokeStyle = '#ffd700';
            this.ctx.lineWidth = 1 / this.zoom;
            this.ctx.beginPath();
            const zigzags = 5;
            const zigWidth = w * 0.6 / zigzags;
            for (let i = 0; i < zigzags; i++) {
                const startX = x + w * 0.2 + i * zigWidth;
                this.ctx.moveTo(startX, centerY - h * 0.2);
                this.ctx.lineTo(startX + zigWidth/2, centerY + h * 0.2);
                this.ctx.lineTo(startX + zigWidth, centerY - h * 0.2);
            }
            this.ctx.stroke();
        } else {
            // Photodiode - similar to diode but with light arrows
            this.ctx.fillStyle = '#333';
            this.ctx.beginPath();
            this.ctx.arc(centerX, centerY, w/2, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Light arrows pointing at sensor
            this.ctx.strokeStyle = '#ff0';
            this.ctx.lineWidth = 1 / this.zoom;
            for (let i = -1; i <= 1; i++) {
                const arrowX = x - 4;
                const arrowY = centerY + i * 4;
                this.ctx.beginPath();
                this.ctx.moveTo(arrowX - 6, arrowY);
                this.ctx.lineTo(arrowX, arrowY);
                this.ctx.moveTo(arrowX - 2, arrowY - 2);
                this.ctx.lineTo(arrowX, arrowY);
                this.ctx.lineTo(arrowX - 2, arrowY + 2);
                this.ctx.stroke();
            }
        }
        
        // Outline
        this.ctx.strokeStyle = '#666';
        this.ctx.lineWidth = 1 / this.zoom;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, w/2, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // Label
        this.ctx.fillStyle = '#666';
        this.ctx.font = `${8 / this.zoom}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(comp.id, centerX, y + h + leadLen + 4);
    }
    
    /**
     * Render transistors (NPN, PNP, NMOS, PMOS)
     * TO-92 package with 3 pins
     */
    private renderTransistor(comp: ComponentIR): void {
        const S = BASE_SCALE;
        const x = comp.position.x * S;
        const y = comp.position.y * S;
        const { width, height, pinLength } = this.getComponentDimensions(comp);
        const w = width * S;
        const h = height * S;
        const leadLen = pinLength * S;
        
        // Selection highlight
        if (this.selectedId === comp.id) {
            this.ctx.strokeStyle = '#0066cc';
            this.ctx.lineWidth = 2 / this.zoom;
            this.ctx.setLineDash([4 / this.zoom, 2 / this.zoom]);
            this.roundRect(x - 4, y - 4, w + 8, h + leadLen + 8, 4);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
        
        const centerX = x + w / 2;
        
        // TO-92 package body - half-cylinder shape
        // Flat back
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.beginPath();
        this.ctx.moveTo(x, y + h);
        this.ctx.lineTo(x, y + h * 0.3);
        this.ctx.arc(centerX, y + h * 0.3, w/2, Math.PI, 0, false);
        this.ctx.lineTo(x + w, y + h);
        this.ctx.closePath();
        this.ctx.fill();
        
        // Outline
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 1 / this.zoom;
        this.ctx.stroke();
        
        // Three leads (E/B/C for BJT or S/G/D for MOSFET)
        this.ctx.strokeStyle = '#888';
        this.ctx.lineWidth = 2 / this.zoom;
        const pinSpacing = w / 3;
        for (let i = 0; i < 3; i++) {
            const px = x + pinSpacing * (i + 0.5);
            this.ctx.beginPath();
            this.ctx.moveTo(px, y + h);
            this.ctx.lineTo(px, y + h + leadLen);
            this.ctx.stroke();
            
            // Pin terminals
            this.ctx.fillStyle = '#888';
            this.ctx.beginPath();
            this.ctx.arc(px, y + h + leadLen, 2, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        // Type label on body
        this.ctx.fillStyle = '#999';
        this.ctx.font = `${7 / this.zoom}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(comp.type, centerX, y + h * 0.6);
        
        // Pin labels (tiny, below pins)
        this.ctx.fillStyle = '#666';
        this.ctx.font = `${6 / this.zoom}px sans-serif`;
        const isMOSFET = comp.type === 'NMOS' || comp.type === 'PMOS';
        const pinLabels = isMOSFET ? ['S', 'G', 'D'] : ['E', 'B', 'C'];
        for (let i = 0; i < 3; i++) {
            const px = x + pinSpacing * (i + 0.5);
            this.ctx.fillText(pinLabels[i], px, y + h + leadLen + 8);
        }
        
        // Component ID
        this.ctx.font = `${8 / this.zoom}px sans-serif`;
        this.ctx.fillText(comp.id, centerX, y - 6);
    }
    
    // Helper to darken a hex color
    private darkenColor(hex: string, factor: number): string {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgb(${Math.floor(r * factor)}, ${Math.floor(g * factor)}, ${Math.floor(b * factor)})`;
    }

    private renderWire(wire: Wire, wireIndex?: number): void {
        const S = BASE_SCALE;
        const fromX = wire.from.x * S;
        const fromY = wire.from.y * S;
        const toX = wire.to.x * S;
        const toY = wire.to.y * S;
        
        // Check if this wire is selected
        const isSelected = this.selectedId === `wire_${wireIndex}`;

        // Selection highlight (draw thicker line behind)
        if (isSelected) {
            this.ctx.strokeStyle = '#0066cc';
            this.ctx.lineWidth = 6 / this.zoom;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.setLineDash([]);
            
            this.ctx.beginPath();
            this.ctx.moveTo(fromX, fromY);
            if (wire.waypoints) {
                for (const wp of wire.waypoints) {
                    this.ctx.lineTo(wp.x * S, wp.y * S);
                }
            }
            this.ctx.lineTo(toX, toY);
            this.ctx.stroke();
        }

        // Main wire
        this.ctx.strokeStyle = wire.color;
        this.ctx.lineWidth = 2 / this.zoom;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        this.ctx.beginPath();
        this.ctx.moveTo(fromX, fromY);

        if (wire.waypoints) {
            for (const wp of wire.waypoints) {
                this.ctx.lineTo(wp.x * S, wp.y * S);
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
        
        // Selection indicators on terminals
        if (isSelected) {
            this.ctx.strokeStyle = '#0066cc';
            this.ctx.lineWidth = 2 / this.zoom;
            this.ctx.beginPath();
            this.ctx.arc(fromX, fromY, 5, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.beginPath();
            this.ctx.arc(toX, toY, 5, 0, Math.PI * 2);
            this.ctx.stroke();
        }
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
