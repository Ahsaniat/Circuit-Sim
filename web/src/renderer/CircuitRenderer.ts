import { CircuitIR, ComponentIR, BoardIR, Wire, Position } from '../types';
import { BreadboardGeometry, HolePosition } from '../geometry/BreadboardGeometry';
import { getComponentFootprint } from '../geometry/ComponentFootprints';
import { SnapManager } from '../geometry/SnapManager';
import { CircuitHistory } from '../history/CircuitHistory';
import { buildSvg } from '../export/SvgExporter';

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

// Screen-space interaction tolerances. These are converted to base units
// against the current zoom so they feel identical at every zoom level.
const WIRE_HIT_TOLERANCE_PX = 6;
const WIRE_TERMINAL_RADIUS_PX = 8;
const SNAP_RADIUS_PX = 6;

interface DraggableElement {
    id: string;
    type: 'component' | 'board' | 'wire' | 'wire_terminal';
    x: number;      // In base units
    y: number;
    width: number;
    height: number;
    parentBoardId?: string;  // For components on a board
    wireIndex?: number;      // For wires
    terminal?: 'from' | 'to';  // For wire terminals
}

/**
 * Colors sourced from CSS custom properties so the canvas follows the
 * active theme. Physical component colors (resistor tan, LED colors, IC
 * black) stay literal because they represent the part itself.
 */
interface RenderPalette {
    canvasBg: string;
    boardBg: string;
    boardEdge: string;
    boardRail: string;
    boardChannel: string;
    boardHole: string;
    boardLabel: string;
    pin: string;
    componentLabel: string;
    selection: string;
}

const DEFAULT_PALETTE: RenderPalette = {
    canvasBg: '#f5f5f5',
    boardBg: '#e8e4df',
    boardEdge: '#bbb',
    boardRail: '#f0ebe6',
    boardChannel: '#c8c4bf',
    boardHole: '#222',
    boardLabel: '#888',
    pin: '#888',
    componentLabel: '#666',
    selection: '#0066cc',
};

export class CircuitRenderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private circuitIR: CircuitIR | null = null;
    
    // Geometry instances for each board
    private boardGeometries: Map<string, BreadboardGeometry> = new Map();
    
    // Snap managers for each board
    private snapManagers: Map<string, SnapManager> = new Map();
    
    // Interaction state
    private draggables: DraggableElement[] = [];
    private selectedId: string | null = null;
    private isDragging = false;
    private dragOffset = { x: 0, y: 0 };

    // Pan / pinch state
    private isPanning = false;
    private panStart = { x: 0, y: 0 };
    private spacePressed = false;
    private activePointers: Map<number, { x: number; y: number }> = new Map();
    private pinchState: { distance: number; midX: number; midY: number } | null = null;
    
    // Snap preview state
    private snapPreviewHoles: HolePosition[] = [];
    private isSnapped = false;
    
    // Zoom and pan state
    private zoom = 1;
    private panX = 0;
    private panY = 0;
    
    // Tooltip state
    private tooltip: HTMLDivElement | null = null;
    private hoveredComponentId: string | null = null;

    // Undo/redo history (snapshot based)
    private history = new CircuitHistory<CircuitIR>(100);
    private dragSnapshot: CircuitIR | null = null;
    private onHistoryChange: (() => void) | null = null;

    // Theme palette (re-read whenever data-theme changes)
    private palette: RenderPalette = DEFAULT_PALETTE;
    private paletteTheme = '';

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to get 2D context');
        this.ctx = ctx;
        this.createTooltip();
        this.resize();
        this.setupEventListeners();
        window.addEventListener('resize', () => this.resize());
    }
    
    private createTooltip(): void {
        this.tooltip = document.createElement('div');
        this.tooltip.style.cssText = `
            position: absolute;
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-family: monospace;
            pointer-events: none;
            z-index: 1000;
            display: none;
            white-space: nowrap;
        `;
        document.body.appendChild(this.tooltip);
    }

    private setupEventListeners(): void {
        this.canvas.addEventListener('pointerdown', this.onPointerDown.bind(this));
        this.canvas.addEventListener('pointermove', this.onPointerMove.bind(this));
        this.canvas.addEventListener('pointerup', this.onPointerUp.bind(this));
        this.canvas.addEventListener('pointercancel', this.onPointerUp.bind(this));
        this.canvas.addEventListener('pointerleave', this.onPointerLeave.bind(this));
        this.canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        window.addEventListener('keydown', this.onKeyDown.bind(this));
        window.addEventListener('keyup', this.onKeyUp.bind(this));
    }

    /** Convert a screen-pixel distance to base units at the current zoom. */
    private screenToBase(px: number): number {
        return px / (this.zoom * BASE_SCALE);
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
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom * zoomFactor));
        if (newZoom !== this.zoom) {
            this.applyZoomAround(newZoom, e.clientX, e.clientY);
            this.rebuildDraggables();
            this.redraw();
        }
    }

    /**
     * Zoom so that the world point under (clientX, clientY) stays stationary.
     */
    private applyZoomAround(newZoom: number, clientX: number, clientY: number): void {
        newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = clientX - rect.left;
        const mouseY = clientY - rect.top;
        const worldX = (mouseX - PADDING - this.panX) / this.zoom;
        const worldY = (mouseY - PADDING - this.panY) / this.zoom;
        this.panX = mouseX - PADDING - worldX * newZoom;
        this.panY = mouseY - PADDING - worldY * newZoom;
        this.zoom = newZoom;
    }

    private findElementAt(pos: Position): DraggableElement | null {
        const terminalRadius = this.screenToBase(WIRE_TERMINAL_RADIUS_PX);
        // Priority: Wire terminals → Wires → Components → Boards
        // First check wire terminals (highest priority for precise terminal dragging)
        if (this.circuitIR) {
            for (let i = this.circuitIR.wires.length - 1; i >= 0; i--) {
                const wire = this.circuitIR.wires[i];
                
                // Check 'from' terminal
                const distFrom = Math.sqrt((pos.x - wire.from.x) ** 2 + (pos.y - wire.from.y) ** 2);
                if (distFrom < terminalRadius) {
                    return {
                        id: `wire_${i}_from`,
                        type: 'wire_terminal',
                        x: wire.from.x,
                        y: wire.from.y,
                        width: 0,
                        height: 0,
                        wireIndex: i,
                        terminal: 'from'
                    };
                }
                
                // Check 'to' terminal
                const distTo = Math.sqrt((pos.x - wire.to.x) ** 2 + (pos.y - wire.to.y) ** 2);
                if (distTo < terminalRadius) {
                    return {
                        id: `wire_${i}_to`,
                        type: 'wire_terminal',
                        x: wire.to.x,
                        y: wire.to.y,
                        width: 0,
                        height: 0,
                        wireIndex: i,
                        terminal: 'to'
                    };
                }
            }
        }
        
        // Check other draggables in reverse order (top elements first)
        // Wires → Components → Boards
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
        const tolerance = this.screenToBase(WIRE_HIT_TOLERANCE_PX);
        for (const [p1, p2] of segments) {
            if (this.distanceToSegment(point, p1, p2) < tolerance) {
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

    private onPointerDown(e: PointerEvent): void {
        this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        // Two fingers: pinch zoom + pan, cancelling any element drag
        if (this.activePointers.size === 2) {
            this.beginPinch();
            return;
        }
        if (this.activePointers.size > 2) return;

        // Middle mouse or Space + drag pans the canvas
        if (e.button === 1 || (e.button === 0 && this.spacePressed)) {
            e.preventDefault();
            this.isPanning = true;
            this.panStart = { x: e.clientX, y: e.clientY };
            this.canvas.setPointerCapture(e.pointerId);
            this.canvas.style.cursor = 'grabbing';
            return;
        }
        if (e.button !== 0) return;

        const pos = this.getMousePos(e);
        const element = this.findElementAt(pos);
        
        // Hide tooltip on click
        this.hideTooltip();
        
        if (element) {
            this.selectedId = element.id;
            this.isDragging = true;
            // Snapshot before mutation so a drag can be undone as one action.
            this.dragSnapshot = this.cloneIR();
            
            if (element.type === 'wire_terminal') {
                // For wire terminals, no offset - move directly to mouse position
                this.dragOffset = { x: 0, y: 0 };
            } else if (element.type === 'wire' && element.wireIndex !== undefined && this.circuitIR) {
                // For wires (body), store offset from wire's 'from' position
                const wire = this.circuitIR.wires[element.wireIndex];
                this.dragOffset = { x: pos.x - wire.from.x, y: pos.y - wire.from.y };
            } else {
                this.dragOffset = { x: pos.x - element.x, y: pos.y - element.y };
            }
            
            this.canvas.setPointerCapture(e.pointerId);
            this.canvas.style.cursor = 'grabbing';
            this.redraw();
        } else {
            this.selectedId = null;
            this.redraw();
        }
    }

    private beginPinch(): void {
        this.isDragging = false;
        this.isPanning = false;
        const pts = [...this.activePointers.values()];
        if (pts.length < 2) return;
        const [a, b] = pts;
        this.pinchState = {
            distance: Math.hypot(a.x - b.x, a.y - b.y),
            midX: (a.x + b.x) / 2,
            midY: (a.y + b.y) / 2,
        };
        this.canvas.style.cursor = 'grabbing';
    }

    private updatePinch(): void {
        const pts = [...this.activePointers.values()];
        if (pts.length < 2) return;
        const [a, b] = pts;
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;

        if (this.pinchState && this.pinchState.distance > 0 && distance > 0) {
            const ratio = distance / this.pinchState.distance;
            if (Number.isFinite(ratio) && ratio > 0) {
                this.applyZoomAround(this.zoom * ratio, midX, midY);
            }
            this.panX += midX - this.pinchState.midX;
            this.panY += midY - this.pinchState.midY;
            this.rebuildDraggables();
            this.redraw();
        }
        this.pinchState = { distance, midX, midY };
    }

    private onPointerMove(e: PointerEvent): void {
        if (this.activePointers.has(e.pointerId)) {
            this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        }
        if (this.activePointers.size >= 2) {
            this.updatePinch();
            return;
        }
        if (this.isPanning) {
            this.panX += e.clientX - this.panStart.x;
            this.panY += e.clientY - this.panStart.y;
            this.panStart = { x: e.clientX, y: e.clientY };
            this.rebuildDraggables();
            this.redraw();
            return;
        }

        const pos = this.getMousePos(e);
        
        if (this.isDragging && this.selectedId && this.circuitIR) {
            // pos is now in base units (world coordinates)
            const newBaseX = pos.x - this.dragOffset.x;
            const newBaseY = pos.y - this.dragOffset.y;
            
            // Check if dragging a wire terminal
            if (this.selectedId.includes('_from') || this.selectedId.includes('_to')) {
                // Wire terminal dragging - move only that terminal with SNAP
                const wireIndexMatch = this.selectedId.match(/wire_(\d+)_(from|to)/);
                if (wireIndexMatch) {
                    const wireIndex = parseInt(wireIndexMatch[1]);
                    const terminal = wireIndexMatch[2] as 'from' | 'to';
                    const wire = this.circuitIR.wires[wireIndex];
                    const snapMgr = this.snapManagerFor(wire?.boardId);
                    
                    if (wire && snapMgr) {
                        // Clear waypoints when dragging terminals - manual drag removes routing
                        wire.waypoints = undefined;
                        
                        // Snap the terminal position to nearest hole
                        const snapResult = snapMgr.snapPosition(pos, this.screenToBase(SNAP_RADIUS_PX));
                        this.isSnapped = snapResult.snapped;
                        
                        if (terminal === 'from') {
                            wire.from.x = snapResult.x;
                            wire.from.y = snapResult.y;
                        } else {
                            wire.to.x = snapResult.x;
                            wire.to.y = snapResult.y;
                        }
                        
                        // Update snap preview
                        const geo = this.geometryFor(wire.boardId);
                        if (snapResult.snapped && snapResult.col && snapResult.row && geo) {
                            this.snapPreviewHoles = [geo.getHolePosition(snapResult.col, snapResult.row)];
                        } else {
                            this.snapPreviewHoles = [];
                        }
                    }
                }
            } else {
                // Find the dragged element
                const dragged = this.draggables.find(d => d.id === this.selectedId);
                if (!dragged) return;
                
                if (dragged.type === 'board') {
                    // Move this board and only the components/wires that belong to it
                    const board = this.circuitIR.boards.find(b => b.id === this.selectedId);
                    if (board) {
                        const dx = newBaseX - board.position.x;
                        const dy = newBaseY - board.position.y;
                        
                        board.position = { x: newBaseX, y: newBaseY };
                        
                        for (const comp of this.circuitIR.components) {
                            if (this.boardIdOf(comp.boardId) !== board.id) continue;
                            comp.position.x += dx;
                            comp.position.y += dy;
                        }
                        
                        for (const wire of this.circuitIR.wires) {
                            if (this.boardIdOf(wire.boardId) !== board.id) continue;
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
                        
                        // Update geometry and snap manager
                        const geo = this.boardGeometries.get(board.id);
                        if (geo) {
                            geo.setPosition(newBaseX, newBaseY);
                            const snap = this.snapManagers.get(board.id);
                            if (snap) snap.setGeometry(geo);
                        }
                    }
                    this.snapPreviewHoles = [];
                    this.isSnapped = false;
                } else if (dragged.type === 'wire' && dragged.wireIndex !== undefined) {
                    // Move entire wire independently with SNAP on both terminals
                    const wire = this.circuitIR.wires[dragged.wireIndex];
                    const snapMgr = this.snapManagerFor(wire?.boardId);
                    if (wire && snapMgr) {
                        // Clear waypoints during manual drag - waypoints are for compile-time routing only
                        wire.waypoints = undefined;
                        
                        // Calculate new positions for both terminals
                        const dx = newBaseX - wire.from.x;
                        const dy = newBaseY - wire.from.y;
                        
                        const newFromPos = { x: wire.from.x + dx, y: wire.from.y + dy };
                        const newToPos = { x: wire.to.x + dx, y: wire.to.y + dy };
                        
                        // Try to snap from terminal
                        const fromSnap = snapMgr.snapPosition(newFromPos);
                        if (fromSnap.snapped) {
                            const snapDx = fromSnap.x - newFromPos.x;
                            const snapDy = fromSnap.y - newFromPos.y;
                            wire.from.x = fromSnap.x;
                            wire.from.y = fromSnap.y;
                            wire.to.x = newToPos.x + snapDx;
                            wire.to.y = newToPos.y + snapDy;
                            this.isSnapped = true;
                        } else {
                            wire.from.x = newFromPos.x;
                            wire.from.y = newFromPos.y;
                            wire.to.x = newToPos.x;
                            wire.to.y = newToPos.y;
                            this.isSnapped = false;
                        }
                    }
                    this.snapPreviewHoles = [];
                } else if (dragged.type === 'component') {
                    // Move component with SNAP, using its owning board
                    const comp = this.circuitIR.components.find(c => c.id === this.selectedId);
                    const snapMgr = this.snapManagerFor(comp?.boardId);
                    const geo = this.geometryFor(comp?.boardId);
                    if (comp && snapMgr && geo) {
                        const footprint = getComponentFootprint(comp.category || 'ic', comp.pinCount, comp.type);
                        
                        if (footprint.straddlesChannel) {
                            // IC component - snap using IC-specific method
                            const pinsPerSide = comp.pinCount / 2;
                            const firstPinOffsetX = 1;
                            const snapResult = snapMgr.snapICComponent(
                                { x: newBaseX, y: newBaseY },
                                pinsPerSide,
                                firstPinOffsetX,
                                IC_PIN_LENGTH,
                                this.screenToBase(SNAP_RADIUS_PX)
                            );
                            
                            comp.position.x = snapResult.bodyX;
                            comp.position.y = snapResult.bodyY;
                            this.isSnapped = snapResult.snapped;
                            
                            // Show snap preview for all IC pins
                            if (snapResult.snapped && snapResult.snapCol) {
                                this.snapPreviewHoles = [];
                                for (let i = 0; i < pinsPerSide; i++) {
                                    this.snapPreviewHoles.push(geo.getHolePosition(snapResult.snapCol + i, 'E'));
                                    this.snapPreviewHoles.push(geo.getHolePosition(snapResult.snapCol + i, 'F'));
                                }
                            } else {
                                this.snapPreviewHoles = [];
                            }
                        } else {
                            // Non-IC component - snap by first pin
                            const pin1 = footprint.pins[0];
                            const pin1Offset = { x: pin1.offsetX, y: pin1.offsetY };
                            const snapResult = snapMgr.snapComponentByPin(
                                { x: newBaseX, y: newBaseY },
                                pin1Offset,
                                this.screenToBase(SNAP_RADIUS_PX)
                            );
                            
                            comp.position.x = snapResult.bodyX;
                            comp.position.y = snapResult.bodyY;
                            this.isSnapped = snapResult.snapped;
                            
                            // Show snap preview
                            if (snapResult.snapped && snapResult.snapCol && snapResult.snapRow) {
                                this.snapPreviewHoles = [];
                                for (const pin of footprint.pins) {
                                    const colOffset = Math.round(pin.offsetX / BreadboardGeometry.HOLE_SPACING);
                                    this.snapPreviewHoles.push(
                                        geo.getHolePosition(snapResult.snapCol + colOffset, snapResult.snapRow)
                                    );
                                }
                            } else {
                                this.snapPreviewHoles = [];
                            }
                        }
                    }
                }
            }
            
            this.rebuildDraggables();
            this.redraw();
        } else {
            // Not dragging - handle hover and tooltip
            const element = this.findElementAt(pos);
            this.snapPreviewHoles = [];
            this.isSnapped = false;
            
            // Update cursor
            if (element?.type === 'wire_terminal') {
                this.canvas.style.cursor = 'crosshair';
            } else if (element) {
                this.canvas.style.cursor = 'grab';
            } else {
                this.canvas.style.cursor = 'default';
            }
            
            // Show tooltip for components only (not board, not wires)
            if (element && element.type === 'component' && this.circuitIR) {
                const comp = this.circuitIR.components.find(c => c.id === element.id);
                if (comp && comp.id !== this.hoveredComponentId) {
                    this.hoveredComponentId = comp.id;
                    const label = comp.value ? `${comp.id} (${comp.type}: ${comp.value})` : `${comp.id} (${comp.type})`;
                    this.showTooltip(e.clientX, e.clientY, label);
                } else if (comp) {
                    // Update tooltip position
                    this.updateTooltipPosition(e.clientX, e.clientY);
                }
            } else {
                if (this.hoveredComponentId) {
                    this.hoveredComponentId = null;
                    this.hideTooltip();
                }
            }
        }
    }
    
    private showTooltip(x: number, y: number, text: string): void {
        if (!this.tooltip) return;
        this.tooltip.textContent = text;
        this.tooltip.style.left = `${x + 12}px`;
        this.tooltip.style.top = `${y + 12}px`;
        this.tooltip.style.display = 'block';
    }
    
    private updateTooltipPosition(x: number, y: number): void {
        if (!this.tooltip) return;
        this.tooltip.style.left = `${x + 12}px`;
        this.tooltip.style.top = `${y + 12}px`;
    }
    
    private hideTooltip(): void {
        if (!this.tooltip) return;
        this.tooltip.style.display = 'none';
    }

    private onPointerUp(e: PointerEvent): void {
        this.activePointers.delete(e.pointerId);
        if (this.activePointers.size < 2) {
            this.pinchState = null;
        }
        if (this.canvas.hasPointerCapture(e.pointerId)) {
            this.canvas.releasePointerCapture(e.pointerId);
        }

        if (this.isPanning) {
            this.isPanning = false;
            this.canvas.style.cursor = this.spacePressed ? 'grab' : 'default';
            return;
        }

        if (this.isDragging) {
            // Rebuild occupancy map after drag completes
            this.rebuildOccupancy();
            this.snapPreviewHoles = [];
            this.isSnapped = false;
            this.redraw();
            this.commitHistory();
        }
        this.isDragging = false;
        this.canvas.style.cursor = this.spacePressed ? 'grab' : 'default';
    }
    
    private onPointerLeave(): void {
        if (this.isDragging || this.isPanning || this.activePointers.size > 0) return;
        this.canvas.style.cursor = this.spacePressed ? 'grab' : 'default';
        this.hoveredComponentId = null;
        this.snapPreviewHoles = [];
        this.isSnapped = false;
        this.hideTooltip();
    }

    private onKeyDown(e: KeyboardEvent): void {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
            target.tagName === 'BUTTON' || target.isContentEditable)) {
            return;
        }

        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z' || e.key === 'Z') {
                e.preventDefault();
                if (e.shiftKey) {
                    this.redo();
                } else {
                    this.undo();
                }
                return;
            }
            if (e.key === 'y' || e.key === 'Y') {
                e.preventDefault();
                this.redo();
                return;
            }
            return;
        }

        if (e.code === 'Space') {
            this.spacePressed = true;
            this.canvas.style.cursor = 'grab';
            e.preventDefault();
            return;
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (this.selectedId) {
                e.preventDefault();
                this.deleteSelection();
            }
            return;
        }
        if (e.key === 'Escape') {
            this.selectedId = null;
            this.snapPreviewHoles = [];
            this.redraw();
            return;
        }
        if (e.key === 'f' || e.key === 'F') {
            this.fitToView();
        }
    }

    private onKeyUp(e: KeyboardEvent): void {
        if (e.code === 'Space') {
            this.spacePressed = false;
            if (!this.isPanning) {
                this.canvas.style.cursor = 'default';
            }
        }
    }

    /**
     * Delete the current selection from the in-memory IR. The DSL source is
     * not modified; layout persistence is handled by the app layer.
     */
    private deleteSelection(): void {
        if (!this.circuitIR || !this.selectedId) return;
        const snapshot = this.cloneIR();
        const id = this.selectedId;
        const wireMatch = id.match(/^wire_(\d+)(?:_(?:from|to))?$/);
        if (wireMatch) {
            const index = parseInt(wireMatch[1], 10);
            if (Number.isInteger(index)) {
                this.circuitIR.wires.splice(index, 1);
            }
        } else {
            const compIndex = this.circuitIR.components.findIndex(c => c.id === id);
            if (compIndex >= 0) {
                this.circuitIR.components.splice(compIndex, 1);
                this.circuitIR.wires = this.circuitIR.wires.filter(
                    w => w.from.component !== id && w.to.component !== id
                );
            }
        }
        this.selectedId = null;
        if (snapshot) {
            this.history.push(snapshot);
            this.notifyHistory();
        }
        this.rebuildOccupancy();
        this.rebuildDraggables();
        this.redraw();
    }

    /**
     * Fit the whole circuit into the viewport.
     */
    fitToView(): void {
        if (!this.circuitIR) return;
        const parent = this.canvas.parentElement;
        if (!parent) return;

        const bounds = this.getContentBounds();
        if (!bounds) {
            this.resetZoom();
            return;
        }
        const { minX, minY, maxX, maxY } = bounds;

        const rect = parent.getBoundingClientRect();
        const screenPadding = 24;
        const contentW = Math.max(maxX - minX, 1) * BASE_SCALE;
        const contentH = Math.max(maxY - minY, 1) * BASE_SCALE;
        const zoomX = (rect.width - 2 * screenPadding) / contentW;
        const zoomY = (rect.height - 2 * screenPadding) / contentH;
        this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(zoomX, zoomY)));

        const padX = (rect.width - contentW * this.zoom) / 2;
        const padY = (rect.height - contentH * this.zoom) / 2;
        this.panX = padX - PADDING - minX * BASE_SCALE * this.zoom;
        this.panY = padY - PADDING - minY * BASE_SCALE * this.zoom;

        this.rebuildDraggables();
        this.redraw();
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
        this.loadIR(ir);
        this.history.reset();
        this.dragSnapshot = null;
        this.notifyHistory();
    }

    private loadIR(ir: CircuitIR): void {
        this.circuitIR = ir;
        this.boardGeometries.clear();
        this.snapManagers.clear();
        this.draggables = [];
        this.selectedId = null;
        this.snapPreviewHoles = [];
        this.isSnapped = false;
        
        // Create geometry and snap manager for each board
        for (const board of ir.boards) {
            const geo = new BreadboardGeometry(board.position.x, board.position.y);
            this.boardGeometries.set(board.id, geo);
            this.snapManagers.set(board.id, new SnapManager(geo));
        }
        
        // Register initial occupancy
        this.rebuildOccupancy();
        this.rebuildDraggables();
        this.redraw();
    }

    getIR(): CircuitIR | null {
        return this.circuitIR;
    }

    setOnHistoryChange(fn: () => void): void {
        this.onHistoryChange = fn;
    }

    canUndo(): boolean {
        return this.history.canUndo;
    }

    canRedo(): boolean {
        return this.history.canRedo;
    }

    undo(): void {
        if (!this.circuitIR) return;
        const previous = this.history.undo(this.circuitIR);
        if (!previous) return;
        this.loadIR(previous);
        this.notifyHistory();
    }

    redo(): void {
        if (!this.circuitIR) return;
        const next = this.history.redo(this.circuitIR);
        if (!next) return;
        this.loadIR(next);
        this.notifyHistory();
    }

    private cloneIR(): CircuitIR | null {
        if (!this.circuitIR) return null;
        if (typeof structuredClone === 'function') {
            return structuredClone(this.circuitIR);
        }
        return JSON.parse(JSON.stringify(this.circuitIR)) as CircuitIR;
    }

    private commitHistory(): void {
        if (!this.dragSnapshot || !this.circuitIR) {
            this.dragSnapshot = null;
            return;
        }
        const before = JSON.stringify(this.dragSnapshot);
        const after = JSON.stringify(this.circuitIR);
        if (before !== after) {
            this.history.push(this.dragSnapshot);
            this.notifyHistory();
        }
        this.dragSnapshot = null;
    }

    private notifyHistory(): void {
        this.onHistoryChange?.();
    }

    /** Re-read theme tokens and repaint (called when the theme toggles). */
    refreshTheme(): void {
        this.paletteTheme = '';
        this.refreshPalette();
        this.redraw();
    }

    private refreshPalette(): void {
        const theme = document.documentElement.getAttribute('data-theme') ?? 'dark';
        if (theme === this.paletteTheme) return;
        const style = getComputedStyle(document.documentElement);
        const read = (name: string, fallback: string): string =>
            style.getPropertyValue(name).trim() || fallback;
        this.palette = {
            canvasBg: read('--canvas-bg', DEFAULT_PALETTE.canvasBg),
            boardBg: read('--breadboard-bg', DEFAULT_PALETTE.boardBg),
            boardEdge: read('--board-edge', DEFAULT_PALETTE.boardEdge),
            boardRail: read('--board-rail', DEFAULT_PALETTE.boardRail),
            boardChannel: read('--board-channel', DEFAULT_PALETTE.boardChannel),
            boardHole: read('--board-hole', DEFAULT_PALETTE.boardHole),
            boardLabel: read('--board-label', DEFAULT_PALETTE.boardLabel),
            pin: read('--pin-color', DEFAULT_PALETTE.pin),
            componentLabel: read('--component-label', DEFAULT_PALETTE.componentLabel),
            selection: read('--accent', DEFAULT_PALETTE.selection),
        };
        this.paletteTheme = theme;
    }
    
    /**
     * Rebuild occupancy map for all snap managers.
     * Only elements owned by a board are registered with that board, so
     * multi-board circuits do not double-register pins on every board.
     */
    private rebuildOccupancy(): void {
        if (!this.circuitIR) return;
        
        // Clear and rebuild for each board
        for (const [boardId, snapMgr] of this.snapManagers) {
            snapMgr.clearOccupancy();
            const geo = this.boardGeometries.get(boardId)!;
            
            // Register component pins owned by this board
            for (const comp of this.circuitIR.components) {
                if (this.boardIdOf(comp.boardId) !== boardId) continue;
                const footprint = getComponentFootprint(comp.category || 'ic', comp.pinCount, comp.type);
                
                if (footprint.straddlesChannel) {
                    // IC pins in rows E and F
                    const pinsPerSide = comp.pinCount / 2;
                    const startCol = geo.getICStartColumn(comp.position.x);
                    
                    for (let i = 0; i < pinsPerSide; i++) {
                        // Bottom pins (row F)
                        snapMgr.registerPinOccupancy(startCol + i, 'F', comp.id, i + 1);
                        // Top pins (row E)
                        snapMgr.registerPinOccupancy(startCol + i, 'E', comp.id, comp.pinCount - i);
                    }
                } else {
                    // Non-IC components - calculate pin columns from position
                    for (const pin of footprint.pins) {
                        const pinX = comp.position.x + pin.offsetX;
                        const pinY = comp.position.y + pin.offsetY;
                        const col = geo.getColumnAtX(pinX);
                        const row = geo.getRowAtY(pinY);
                        if (col > 0 && row) {
                            snapMgr.registerPinOccupancy(col, row, comp.id, pin.number);
                        }
                    }
                }
            }
            
            // Register wire terminals owned by this board
            for (let i = 0; i < this.circuitIR.wires.length; i++) {
                const wire = this.circuitIR.wires[i];
                if (this.boardIdOf(wire.boardId) !== boardId) continue;
                
                // From terminal
                const fromCol = geo.getColumnAtX(wire.from.x);
                const fromRow = geo.getRowAtY(wire.from.y);
                if (fromCol > 0 && fromRow) {
                    snapMgr.registerWireOccupancy(fromCol, fromRow, i, 'from');
                }
                
                // To terminal
                const toCol = geo.getColumnAtX(wire.to.x);
                const toRow = geo.getRowAtY(wire.to.y);
                if (toCol > 0 && toRow) {
                    snapMgr.registerWireOccupancy(toCol, toRow, i, 'to');
                }
            }
        }
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
                parentBoardId: this.boardIdOf(comp.boardId)
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
                wireIndex: i,
                parentBoardId: this.boardIdOf(wire.boardId)
            });
        }
    }
    
    /**
     * Resolve the board that owns an element. Elements without an explicit
     * boardId belong to the first board (legacy single-board circuits).
     */
    private boardIdOf(boardId: string | undefined): string | undefined {
        if (boardId && this.boardGeometries.has(boardId)) return boardId;
        return this.circuitIR?.boards[0]?.id;
    }
    
    private snapManagerFor(boardId: string | undefined): SnapManager | undefined {
        const resolved = this.boardIdOf(boardId);
        return resolved ? this.snapManagers.get(resolved) : undefined;
    }
    
    private geometryFor(boardId: string | undefined): BreadboardGeometry | undefined {
        const resolved = this.boardIdOf(boardId);
        return resolved ? this.boardGeometries.get(resolved) : undefined;
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
        
        this.drawScene();
        
        this.ctx.restore();
    }

    /**
     * Draw the scene with the current context and transform. Shared by the
     * interactive canvas and the offscreen export path.
     */
    private drawScene(): void {
        if (!this.circuitIR) return;

        for (const board of this.circuitIR.boards) {
            this.renderBoard(board);
        }
        
        // Render snap preview highlights (before components, so they appear behind)
        this.renderSnapPreview();
        
        // Render wires BEFORE components (so wires appear under components)
        for (let i = 0; i < this.circuitIR.wires.length; i++) {
            this.renderWire(this.circuitIR.wires[i], i);
        }
        
        // Render components on top of wires
        for (const comp of this.circuitIR.components) {
            this.renderComponent(comp);
        }
    }

    /**
     * Bounds of all boards and components in base units.
     */
    private getContentBounds(): { minX: number; minY: number; maxX: number; maxY: number } | null {
        if (!this.circuitIR) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const include = (x: number, y: number, w: number, h: number) => {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + w);
            maxY = Math.max(maxY, y + h);
        };

        for (const board of this.circuitIR.boards) {
            const geo = this.boardGeometries.get(board.id);
            if (geo) include(geo.x, geo.y, geo.width, geo.height);
        }
        for (const comp of this.circuitIR.components) {
            const { width, height } = this.getComponentDimensions(comp);
            include(comp.position.x - 2, comp.position.y - 2, width + 4, height + 4);
        }
        return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
    }
    
    /**
     * Render visual feedback for snap targets
     */
    private renderSnapPreview(): void {
        if (this.snapPreviewHoles.length === 0) return;
        
        const S = BASE_SCALE;
        
        for (const hole of this.snapPreviewHoles) {
            const x = hole.x * S;
            const y = hole.y * S;
            
            // Green highlight ring around snap target hole
            this.ctx.strokeStyle = this.isSnapped ? '#00cc00' : '#ffcc00';
            this.ctx.lineWidth = 2 / this.zoom;
            this.ctx.beginPath();
            this.ctx.arc(x, y, 4, 0, Math.PI * 2);
            this.ctx.stroke();
            
            // Filled center if snapped
            if (this.isSnapped) {
                this.ctx.fillStyle = 'rgba(0, 204, 0, 0.3)';
                this.ctx.beginPath();
                this.ctx.arc(x, y, 4, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }
    }

    clear(): void {
        const parent = this.canvas.parentElement;
        if (!parent) return;
        this.refreshPalette();
        const rect = parent.getBoundingClientRect();
        this.ctx.fillStyle = this.palette.canvasBg;
        this.ctx.fillRect(0, 0, rect.width, rect.height);
    }

    getZoom(): number {
        return this.zoom * 100;
    }

    zoomIn(): void {
        this.setZoomLevel(this.zoom * 1.15);
    }

    zoomOut(): void {
        this.setZoomLevel(this.zoom / 1.15);
    }

    resetZoom(): void {
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.rebuildDraggables();
        this.redraw();
    }

    private setZoomLevel(newZoom: number): void {
        newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
        if (newZoom === this.zoom) return;
        // Zoom centered on canvas
        const rect = this.canvas.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const worldX = (cx - PADDING - this.panX) / this.zoom;
        const worldY = (cy - PADDING - this.panY) / this.zoom;
        this.panX = cx - PADDING - worldX * newZoom;
        this.panY = cy - PADDING - worldY * newZoom;
        this.zoom = newZoom;
        this.rebuildDraggables();
        this.redraw();
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
            this.ctx.strokeStyle = this.palette.selection;
            this.ctx.lineWidth = 3 / this.zoom;
            this.ctx.setLineDash([6 / this.zoom, 3 / this.zoom]);
            this.roundRect(x - 4, y - 4, w + 8, h + 8, 8);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }

        // Board background
        this.ctx.fillStyle = this.palette.boardBg;
        this.ctx.strokeStyle = this.palette.boardEdge;
        this.ctx.lineWidth = 1 / this.zoom;
        this.roundRect(x, y, w, h, 6);
        this.ctx.fill();
        this.ctx.stroke();

        // Top power rail — rail band is the top RAIL_HEIGHT units of the board
        const topRailY = y;
        const holesStartX = geo.holesStartX * S;
        this.ctx.fillStyle = this.palette.boardRail;
        this.ctx.fillRect(x + 6, topRailY, w - 12, railHeight);

        // Rail holes and labels are derived from geometry so drawing and
        // snapping can never disagree.
        const topPlusHole = geo.getHolePosition(1, 'TOP+');
        const topMinusHole = geo.getHolePosition(1, 'TOP-');
        this.ctx.font = `bold ${10 / this.zoom}px sans-serif`;
        this.ctx.textAlign = 'left';
        this.ctx.fillStyle = '#c44';
        this.ctx.fillText('+', x + 8, topPlusHole.y * S + 3);
        this.ctx.fillStyle = '#44c';
        this.ctx.fillText('−', x + 8, topMinusHole.y * S + 3);

        this.ctx.fillStyle = this.palette.boardHole;
        for (let col = 1; col <= numCols; col++) {
            for (const row of ['TOP+', 'TOP-']) {
                const hole = geo.getHolePosition(col, row);
                this.ctx.beginPath();
                this.ctx.arc(hole.x * S, hole.y * S, 1.5, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }

        // Bottom power rail — rail band is the bottom RAIL_HEIGHT units
        const bottomRailY = y + h - railHeight;
        this.ctx.fillStyle = this.palette.boardRail;
        this.ctx.fillRect(x + 6, bottomRailY, w - 12, railHeight);

        const bottomPlusHole = geo.getHolePosition(1, 'BOTTOM+');
        const bottomMinusHole = geo.getHolePosition(1, 'BOTTOM-');
        this.ctx.font = `bold ${10 / this.zoom}px sans-serif`;
        this.ctx.fillStyle = '#c44';
        this.ctx.fillText('+', x + 8, bottomPlusHole.y * S + 3);
        this.ctx.fillStyle = '#44c';
        this.ctx.fillText('−', x + 8, bottomMinusHole.y * S + 3);

        this.ctx.fillStyle = this.palette.boardHole;
        for (let col = 1; col <= numCols; col++) {
            for (const row of ['BOTTOM+', 'BOTTOM-']) {
                const hole = geo.getHolePosition(col, row);
                this.ctx.beginPath();
                this.ctx.arc(hole.x * S, hole.y * S, 1.5, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }

        // Center channel - positioned exactly between rows E and F
        // Row E Y position and Row F Y position from geometry
        const rowEHole = geo.getHolePosition(1, 'E');
        const rowFHole = geo.getHolePosition(1, 'F');
        const channelCenterY = ((rowEHole.y + rowFHole.y) / 2) * S;
        this.ctx.fillStyle = this.palette.boardChannel;
        this.ctx.fillRect(x + 8, channelCenterY - channelHeight / 2, w - 16, channelHeight);

        // Main holes - using geometry for accurate positions
        this.ctx.fillStyle = this.palette.boardHole;
        for (const row of BreadboardGeometry.ALL_ROWS) {
            for (let col = 1; col <= numCols; col++) {
                const hole = geo.getHolePosition(col, row);
                this.ctx.beginPath();
                this.ctx.arc(hole.x * S, hole.y * S, 1.5, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }

        // Column numbers
        this.ctx.fillStyle = this.palette.pin;
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
            case 'switch':
                this.renderSwitch(comp);
                break;
            case 'display':
                this.renderDisplay(comp);
                break;
            case 'buzzer':
                this.renderBuzzer(comp);
                break;
            case 'motor':
                this.renderMotor(comp);
                break;
            case 'power':
                this.renderPower(comp);
                break;
            case 'crystal':
                this.renderCrystal(comp);
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
            this.ctx.strokeStyle = this.palette.selection;
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
        this.ctx.fillStyle = this.palette.pin;
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
        this.ctx.fillStyle = this.palette.componentLabel;
        this.ctx.font = `bold ${9 / this.zoom}px monospace`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(comp.type, x + icWidth / 2, y + icHeight / 2);
        
        // Component ID
        this.ctx.fillStyle = this.palette.componentLabel;
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
        const { width, height } = this.getComponentDimensions(comp);
        const w = width * S;
        const h = height * S;
        
        // Selection highlight
        if (this.selectedId === comp.id) {
            this.ctx.strokeStyle = this.palette.selection;
            this.ctx.lineWidth = 2 / this.zoom;
            this.ctx.setLineDash([4 / this.zoom, 2 / this.zoom]);
            this.roundRect(x - 4, y - 4, w + 8, h + 8, 4);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
        
        const centerY = y + h / 2;
        
        // For horizontal passive components, pins are at x=0 (pin 1) and x=width (pin 2)
        // The body has small margins inside, leads connect body to pin positions
        const bodyMargin = 6;  // Body is slightly smaller than pin span
        const bodyX = x + bodyMargin;
        const bodyW = w - 2 * bodyMargin;
        
        // Pin terminals (at breadboard holes)
        this.ctx.fillStyle = this.palette.pin;
        this.ctx.beginPath();
        this.ctx.arc(x, centerY, 2, 0, Math.PI * 2);  // Pin 1 at left edge
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(x + w, centerY, 2, 0, Math.PI * 2);  // Pin 2 at right edge
        this.ctx.fill();
        
        // Leads (wires from pins to body)
        this.ctx.strokeStyle = this.palette.pin;
        this.ctx.lineWidth = 2 / this.zoom;
        this.ctx.beginPath();
        this.ctx.moveTo(x, centerY);
        this.ctx.lineTo(bodyX, centerY);
        this.ctx.moveTo(bodyX + bodyW, centerY);
        this.ctx.lineTo(x + w, centerY);
        this.ctx.stroke();
        
        if (comp.type === 'CAP') {
            // Capacitor: two parallel plates
            this.ctx.strokeStyle = '#4a7c59';
            this.ctx.lineWidth = 3 / this.zoom;
            const plateGap = 4;
            this.ctx.beginPath();
            this.ctx.moveTo(bodyX + bodyW/2 - plateGap/2, y);
            this.ctx.lineTo(bodyX + bodyW/2 - plateGap/2, y + h);
            this.ctx.moveTo(bodyX + bodyW/2 + plateGap/2, y);
            this.ctx.lineTo(bodyX + bodyW/2 + plateGap/2, y + h);
            this.ctx.stroke();
        } else if (comp.type === 'IND') {
            // Inductor: coil/loops
            this.ctx.strokeStyle = '#6b5b95';
            this.ctx.lineWidth = 2 / this.zoom;
            this.ctx.beginPath();
            const numLoops = 4;
            const loopWidth = bodyW / numLoops;
            for (let i = 0; i < numLoops; i++) {
                this.ctx.arc(bodyX + loopWidth * (i + 0.5), centerY, loopWidth / 2, Math.PI, 0, false);
            }
            this.ctx.stroke();
        } else if (comp.type === 'POT') {
            // Potentiometer: resistor body with arrow
            this.ctx.fillStyle = '#d4a574';
            this.ctx.strokeStyle = '#8b6914';
            this.ctx.lineWidth = 1 / this.zoom;
            this.roundRect(bodyX, y, bodyW, h, 2);
            this.ctx.fill();
            this.ctx.stroke();
            // Arrow for wiper
            this.ctx.beginPath();
            this.ctx.moveTo(bodyX + bodyW/2, y - 4);
            this.ctx.lineTo(bodyX + bodyW/2 - 4, y - 8);
            this.ctx.lineTo(bodyX + bodyW/2 + 4, y - 8);
            this.ctx.closePath();
            this.ctx.fillStyle = this.palette.componentLabel;
            this.ctx.fill();
        } else {
            // Resistor: rectangular body with color bands
            this.ctx.fillStyle = '#d4a574';  // Tan/beige color
            this.ctx.strokeStyle = '#8b6914';
            this.ctx.lineWidth = 1 / this.zoom;
            this.roundRect(bodyX, y, bodyW, h, 2);
            this.ctx.fill();
            this.ctx.stroke();
            
            // Color bands (simplified - 4 bands)
            const bandColors = ['#8b4513', '#000', '#f00', '#ffd700'];
            const bandWidth = 2;
            const bandSpacing = bodyW / 5;
            for (let i = 0; i < 4; i++) {
                this.ctx.fillStyle = bandColors[i];
                this.ctx.fillRect(bodyX + bandSpacing * (i + 0.5) - bandWidth/2, y + 1, bandWidth, h - 2);
            }
        }
        
        // Label
        this.ctx.fillStyle = this.palette.componentLabel;
        this.ctx.font = `${8 / this.zoom}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(`${comp.id}${comp.value ? ' ' + comp.value : ''}`, x + w/2, y + h + 4);
    }
    
    /**
     * Render diodes (standard, zener, schottky)
     * Horizontal diode with pins at breadboard holes
     */
    private renderDiode(comp: ComponentIR): void {
        const S = BASE_SCALE;
        const x = comp.position.x * S;
        const y = comp.position.y * S;
        const { width, height } = this.getComponentDimensions(comp);
        const w = width * S;
        const h = height * S;
        
        // Selection highlight
        if (this.selectedId === comp.id) {
            this.ctx.strokeStyle = this.palette.selection;
            this.ctx.lineWidth = 2 / this.zoom;
            this.ctx.setLineDash([4 / this.zoom, 2 / this.zoom]);
            this.roundRect(x - 4, y - 4, w + 8, h + 8, 4);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
        
        const centerY = y + h / 2;
        
        // Body with margins (pins are at x=0 and x=width)
        const bodyMargin = 4;
        const bodyX = x + bodyMargin;
        const bodyW = w - 2 * bodyMargin;
        
        // Pin terminals (at breadboard holes)
        this.ctx.fillStyle = this.palette.pin;
        this.ctx.beginPath();
        this.ctx.arc(x, centerY, 2, 0, Math.PI * 2);  // Anode
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(x + w, centerY, 2, 0, Math.PI * 2);  // Cathode
        this.ctx.fill();
        
        // Leads from pins to body
        this.ctx.strokeStyle = this.palette.pin;
        this.ctx.lineWidth = 2 / this.zoom;
        this.ctx.beginPath();
        this.ctx.moveTo(x, centerY);
        this.ctx.lineTo(bodyX, centerY);
        this.ctx.moveTo(bodyX + bodyW, centerY);
        this.ctx.lineTo(x + w, centerY);
        this.ctx.stroke();
        
        // Diode body - black glass
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 1 / this.zoom;
        this.roundRect(bodyX, y, bodyW, h, 2);
        this.ctx.fill();
        this.ctx.stroke();
        
        // Cathode band (white/silver stripe)
        this.ctx.fillStyle = '#ccc';
        this.ctx.fillRect(bodyX + bodyW - 4, y, 3, h);
        
        // Label
        this.ctx.fillStyle = this.palette.componentLabel;
        this.ctx.font = `${8 / this.zoom}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(comp.id, x + w/2, y + h + 4);
    }
    
    /**
     * Render LEDs (light emitting diodes)
     * Vertical component with 2 pins in adjacent columns
     */
    private renderLED(comp: ComponentIR): void {
        const S = BASE_SCALE;
        const x = comp.position.x * S;
        const y = comp.position.y * S;
        const { width, height } = this.getComponentDimensions(comp);
        const w = width * S;
        const h = height * S;
        const holeSpacing = BreadboardGeometry.HOLE_SPACING * S;
        
        // Selection highlight
        if (this.selectedId === comp.id) {
            this.ctx.strokeStyle = this.palette.selection;
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
        
        // Pin positions based on footprint (adjacent columns)
        // Pin 1 (anode) at left, pin 2 (cathode) at right
        const pin1X = centerX - holeSpacing / 2;
        const pin2X = centerX + holeSpacing / 2;
        const pinY = y + h + 2 * S;  // Pin tip Y position (matching footprint offsetY)
        
        // Leads from body to pin holes
        this.ctx.strokeStyle = this.palette.pin;
        this.ctx.lineWidth = 2 / this.zoom;
        this.ctx.beginPath();
        this.ctx.moveTo(pin1X, y + h);
        this.ctx.lineTo(pin1X, pinY);
        this.ctx.moveTo(pin2X, y + h);
        this.ctx.lineTo(pin2X, pinY);
        this.ctx.stroke();
        
        // Pin terminals at breadboard holes
        this.ctx.fillStyle = this.palette.pin;
        this.ctx.beginPath();
        this.ctx.arc(pin1X, pinY, 2, 0, Math.PI * 2);  // Anode
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(pin2X, pinY, 2, 0, Math.PI * 2);  // Cathode
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
        this.ctx.strokeStyle = this.palette.componentLabel;
        this.ctx.lineWidth = 1 / this.zoom;
        this.ctx.stroke();
        
        // Flat bottom indicator (cathode side)
        this.ctx.strokeStyle = '#333';
        this.ctx.beginPath();
        this.ctx.moveTo(centerX + 2, y + h - 2);
        this.ctx.lineTo(centerX + radius - 1, y + h - 2);
        this.ctx.stroke();
        
        // Anode/Cathode labels
        this.ctx.fillStyle = this.palette.componentLabel;
        this.ctx.font = `${6 / this.zoom}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.fillText('A', pin1X, pinY + 8);
        this.ctx.fillText('K', pin2X, pinY + 8);
        
        // Component ID
        this.ctx.font = `${8 / this.zoom}px sans-serif`;
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(comp.id, centerX, pinY + 14);
    }
    
    /**
     * Render sensors (LDR, photodiode)
     * Vertical component with 2 pins in adjacent columns
     */
    private renderSensor(comp: ComponentIR): void {
        const S = BASE_SCALE;
        const x = comp.position.x * S;
        const y = comp.position.y * S;
        const { width, height } = this.getComponentDimensions(comp);
        const w = width * S;
        const h = height * S;
        const holeSpacing = BreadboardGeometry.HOLE_SPACING * S;
        
        // Selection highlight
        if (this.selectedId === comp.id) {
            this.ctx.strokeStyle = this.palette.selection;
            this.ctx.lineWidth = 2 / this.zoom;
            this.ctx.setLineDash([4 / this.zoom, 2 / this.zoom]);
            this.ctx.beginPath();
            this.ctx.arc(x + w/2, y + h/2, w/2 + 4, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
        
        const centerX = x + w / 2;
        const centerY = y + h / 2;
        
        // Pin positions (adjacent columns)
        const pin1X = centerX - holeSpacing / 2;
        const pin2X = centerX + holeSpacing / 2;
        const pinY = y + h + 2 * S;
        
        // Leads from body to pin holes
        this.ctx.strokeStyle = this.palette.pin;
        this.ctx.lineWidth = 2 / this.zoom;
        this.ctx.beginPath();
        this.ctx.moveTo(pin1X, y + h);
        this.ctx.lineTo(pin1X, pinY);
        this.ctx.moveTo(pin2X, y + h);
        this.ctx.lineTo(pin2X, pinY);
        this.ctx.stroke();
        
        // Pin terminals
        this.ctx.fillStyle = this.palette.pin;
        this.ctx.beginPath();
        this.ctx.arc(pin1X, pinY, 2, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(pin2X, pinY, 2, 0, Math.PI * 2);
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
            // Photodiode - dark disc with light arrows
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
        this.ctx.strokeStyle = this.palette.componentLabel;
        this.ctx.lineWidth = 1 / this.zoom;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, w/2, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // Pin labels
        this.ctx.fillStyle = this.palette.componentLabel;
        this.ctx.font = `${6 / this.zoom}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.fillText('1', pin1X, pinY + 8);
        this.ctx.fillText('2', pin2X, pinY + 8);
        
        // Component ID
        this.ctx.font = `${8 / this.zoom}px sans-serif`;
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(comp.id, centerX, pinY + 14);
    }
    
    /**
     * Render transistors (NPN, PNP, NMOS, PMOS)
     * TO-92 package with 3 pins in adjacent columns
     */
    private renderTransistor(comp: ComponentIR): void {
        const S = BASE_SCALE;
        const x = comp.position.x * S;
        const y = comp.position.y * S;
        const { width, height } = this.getComponentDimensions(comp);
        const w = width * S;
        const h = height * S;
        const holeSpacing = BreadboardGeometry.HOLE_SPACING * S;
        
        // Selection highlight
        if (this.selectedId === comp.id) {
            this.ctx.strokeStyle = this.palette.selection;
            this.ctx.lineWidth = 2 / this.zoom;
            this.ctx.setLineDash([4 / this.zoom, 2 / this.zoom]);
            this.roundRect(x - 4, y - 4, w + 8, h + 2*S + 8, 4);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
        
        const centerX = x + w / 2;
        
        // Pin positions - 3 pins in adjacent columns
        // Body width spans 2 * holeSpacing, so pins at 0, holeSpacing, 2*holeSpacing
        const pinY = y + h + 2 * S;  // Pin tip Y position
        const pin1X = x;
        const pin2X = x + holeSpacing;
        const pin3X = x + 2 * holeSpacing;
        
        // TO-92 package body - half-cylinder shape
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
        
        // Three leads from body to pin holes
        this.ctx.strokeStyle = this.palette.pin;
        this.ctx.lineWidth = 2 / this.zoom;
        const pinXs = [pin1X, pin2X, pin3X];
        for (const px of pinXs) {
            this.ctx.beginPath();
            this.ctx.moveTo(px, y + h);
            this.ctx.lineTo(px, pinY);
            this.ctx.stroke();
            
            // Pin terminals
            this.ctx.fillStyle = this.palette.pin;
            this.ctx.beginPath();
            this.ctx.arc(px, pinY, 2, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        // Type label on body
        this.ctx.fillStyle = this.palette.componentLabel;
        this.ctx.font = `${7 / this.zoom}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(comp.type, centerX, y + h * 0.6);
        
        // Pin labels
        this.ctx.fillStyle = this.palette.componentLabel;
        this.ctx.font = `${6 / this.zoom}px sans-serif`;
        const isMOSFET = comp.type === 'NMOS' || comp.type === 'PMOS';
        const pinLabels = isMOSFET ? ['S', 'G', 'D'] : ['E', 'B', 'C'];
        for (let i = 0; i < 3; i++) {
            this.ctx.fillText(pinLabels[i], pinXs[i], pinY + 8);
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

    private renderSwitch(comp: ComponentIR): void {
        const S = BASE_SCALE;
        const x = comp.position.x * S;
        const y = comp.position.y * S;
        const { width, height } = this.getComponentDimensions(comp);
        const w = width * S;
        const h = height * S;
        const holeSpacing = BreadboardGeometry.HOLE_SPACING * S;
        
        if (this.selectedId === comp.id) {
            this.ctx.strokeStyle = this.palette.selection;
            this.ctx.lineWidth = 2 / this.zoom;
            this.ctx.setLineDash([4 / this.zoom, 2 / this.zoom]);
            this.roundRect(x - 4, y - 4, w + 8, h + 8, 4);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
        
        if (comp.type === 'PUSHBUTTON') {
            const centerX = x + w / 2;
            const centerY = y + h / 2;
            const pinY = y + h + 1.5 * S;
            
            this.ctx.fillStyle = '#333';
            this.roundRect(x, y, w, h, 2);
            this.ctx.fill();
            
            this.ctx.fillStyle = '#c44';
            this.ctx.beginPath();
            this.ctx.arc(centerX, centerY, Math.min(w, h) * 0.3, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.strokeStyle = this.palette.pin;
            this.ctx.lineWidth = 2 / this.zoom;
            for (let i = 0; i < 2; i++) {
                const px = x + i * holeSpacing;
                this.ctx.beginPath();
                this.ctx.moveTo(px, y);
                this.ctx.lineTo(px, y - 1.5 * S);
                this.ctx.stroke();
                this.ctx.beginPath();
                this.ctx.moveTo(px, y + h);
                this.ctx.lineTo(px, pinY);
                this.ctx.stroke();
                
                this.ctx.fillStyle = this.palette.pin;
                this.ctx.beginPath();
                this.ctx.arc(px, y - 1.5 * S, 2, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.beginPath();
                this.ctx.arc(px, pinY, 2, 0, Math.PI * 2);
                this.ctx.fill();
            }
        } else {
            const centerY = y + h / 2;
            
            this.ctx.fillStyle = '#555';
            this.roundRect(x + w * 0.1, y, w * 0.8, h, 2);
            this.ctx.fill();
            
            this.ctx.fillStyle = '#ddd';
            this.roundRect(x + w * 0.4, y - 2, w * 0.2, h + 4, 1);
            this.ctx.fill();
            
            this.ctx.strokeStyle = this.palette.pin;
            this.ctx.lineWidth = 2 / this.zoom;
            
            if (comp.type === 'SPST') {
                this.ctx.beginPath();
                this.ctx.moveTo(x, centerY);
                this.ctx.lineTo(x + w, centerY);
                this.ctx.stroke();
                
                this.ctx.fillStyle = this.palette.pin;
                this.ctx.beginPath();
                this.ctx.arc(x, centerY, 2, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.beginPath();
                this.ctx.arc(x + w, centerY, 2, 0, Math.PI * 2);
                this.ctx.fill();
            } else {
                const pinY = y + h + 2 * S;
                for (let i = 0; i < 3; i++) {
                    const px = x + i * holeSpacing;
                    this.ctx.beginPath();
                    this.ctx.moveTo(px, y + h);
                    this.ctx.lineTo(px, pinY);
                    this.ctx.stroke();
                    
                    this.ctx.fillStyle = this.palette.pin;
                    this.ctx.beginPath();
                    this.ctx.arc(px, pinY, 2, 0, Math.PI * 2);
                    this.ctx.fill();
                }
            }
        }
        
        this.ctx.fillStyle = this.palette.componentLabel;
        this.ctx.font = `${8 / this.zoom}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(comp.id, x + w / 2, y + h + (comp.type === 'SPST' ? 4 : 14));
    }
    
    private renderDisplay(comp: ComponentIR): void {
        const S = BASE_SCALE;
        const x = comp.position.x * S;
        const y = comp.position.y * S;
        const pinsPerSide = comp.pinCount / 2;
        const holeSpacing = BreadboardGeometry.HOLE_SPACING * S;
        const { width, height, pinLength } = this.getICDimensions(comp.pinCount);
        const w = width * S;
        const h = height * S;
        const pinLengthPx = pinLength * S;
        const firstPinOffset = 1 * S;
        
        if (this.selectedId === comp.id) {
            this.ctx.strokeStyle = this.palette.selection;
            this.ctx.lineWidth = 2 / this.zoom;
            this.ctx.setLineDash([4 / this.zoom, 2 / this.zoom]);
            this.roundRect(x - 4, y - pinLengthPx - 4, w + 8, h + pinLengthPx * 2 + 8, 4);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
        
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 1 / this.zoom;
        this.roundRect(x, y, w, h, 3);
        this.ctx.fill();
        this.ctx.stroke();
        
        const segH = h * 0.45;
        const segW = w * 0.3;
        const cx = x + w / 2;
        const cy = y + h / 2;
        
        this.ctx.strokeStyle = '#300';
        this.ctx.lineWidth = 3 / this.zoom;
        this.ctx.lineCap = 'butt';
        
        this.ctx.beginPath();
        this.ctx.moveTo(cx - segW / 2, cy - segH);
        this.ctx.lineTo(cx + segW / 2, cy - segH);
        this.ctx.stroke();
        
        this.ctx.beginPath();
        this.ctx.moveTo(cx - segW / 2, cy);
        this.ctx.lineTo(cx + segW / 2, cy);
        this.ctx.stroke();
        
        this.ctx.beginPath();
        this.ctx.moveTo(cx - segW / 2, cy + segH);
        this.ctx.lineTo(cx + segW / 2, cy + segH);
        this.ctx.stroke();
        
        this.ctx.strokeStyle = this.palette.pin;
        this.ctx.lineWidth = 2 / this.zoom;
        this.ctx.fillStyle = this.palette.pin;
        for (let i = 0; i < pinsPerSide; i++) {
            const px = x + firstPinOffset + i * holeSpacing;
            this.ctx.fillRect(px - 1.5, y + h, 3, pinLengthPx);
            this.ctx.beginPath();
            this.ctx.arc(px, y + h + pinLengthPx, 2, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.fillRect(px - 1.5, y - pinLengthPx, 3, pinLengthPx);
            this.ctx.beginPath();
            this.ctx.arc(px, y - pinLengthPx, 2, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        this.ctx.fillStyle = this.palette.componentLabel;
        this.ctx.font = `${8 / this.zoom}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(comp.id, x + w / 2, y + h + pinLengthPx + 4);
    }
    
    private renderBuzzer(comp: ComponentIR): void {
        const S = BASE_SCALE;
        const x = comp.position.x * S;
        const y = comp.position.y * S;
        const { width, height } = this.getComponentDimensions(comp);
        const w = width * S;
        const h = height * S;
        const holeSpacing = BreadboardGeometry.HOLE_SPACING * S;
        
        if (this.selectedId === comp.id) {
            this.ctx.strokeStyle = this.palette.selection;
            this.ctx.lineWidth = 2 / this.zoom;
            this.ctx.setLineDash([4 / this.zoom, 2 / this.zoom]);
            this.ctx.beginPath();
            this.ctx.arc(x + w / 2, y + h / 2, Math.max(w, h) / 2 + 4, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
        
        const centerX = x + w / 2;
        const centerY = y + h / 2;
        const radius = Math.min(w, h) / 2;
        const pinY = y + h + 2 * S;
        const pin1X = centerX - holeSpacing / 2;
        const pin2X = centerX + holeSpacing / 2;
        
        this.ctx.fillStyle = this.palette.boardHole;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.strokeStyle = '#444';
        this.ctx.lineWidth = 1 / this.zoom;
        this.ctx.stroke();
        
        this.ctx.fillStyle = this.palette.componentLabel;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, radius * 0.6, 0, Math.PI * 2);
        this.ctx.fill();
        
        if (comp.type !== 'PASSIVE_BUZZER') {
            this.ctx.fillStyle = '#c44';
            this.ctx.font = `bold ${8 / this.zoom}px sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('+', centerX, centerY);
        }
        
        this.ctx.strokeStyle = this.palette.pin;
        this.ctx.lineWidth = 2 / this.zoom;
        this.ctx.beginPath();
        this.ctx.moveTo(pin1X, y + h);
        this.ctx.lineTo(pin1X, pinY);
        this.ctx.moveTo(pin2X, y + h);
        this.ctx.lineTo(pin2X, pinY);
        this.ctx.stroke();
        
        this.ctx.fillStyle = this.palette.pin;
        this.ctx.beginPath();
        this.ctx.arc(pin1X, pinY, 2, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(pin2X, pinY, 2, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.fillStyle = this.palette.componentLabel;
        this.ctx.font = `${8 / this.zoom}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(comp.id, centerX, pinY + 4);
    }
    
    private renderMotor(comp: ComponentIR): void {
        const S = BASE_SCALE;
        const x = comp.position.x * S;
        const y = comp.position.y * S;
        const { width, height } = this.getComponentDimensions(comp);
        const w = width * S;
        const h = height * S;
        const holeSpacing = BreadboardGeometry.HOLE_SPACING * S;
        
        if (this.selectedId === comp.id) {
            this.ctx.strokeStyle = this.palette.selection;
            this.ctx.lineWidth = 2 / this.zoom;
            this.ctx.setLineDash([4 / this.zoom, 2 / this.zoom]);
            this.roundRect(x - 4, y - 4, w + 8, h + 8, 4);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
        
        if (comp.type === 'SERVO') {
            const pinY = y + h + 2 * S;
            
            this.ctx.fillStyle = '#444';
            this.roundRect(x, y, w, h, 2);
            this.ctx.fill();
            
            this.ctx.strokeStyle = this.palette.componentLabel;
            this.ctx.lineWidth = 1 / this.zoom;
            this.ctx.stroke();
            
            this.ctx.fillStyle = '#ccc';
            this.roundRect(x + w * 0.3, y - 2, w * 0.4, 4, 1);
            this.ctx.fill();
            
            this.ctx.strokeStyle = this.palette.pin;
            this.ctx.lineWidth = 2 / this.zoom;
            for (let i = 0; i < 3; i++) {
                const px = x + i * holeSpacing;
                this.ctx.beginPath();
                this.ctx.moveTo(px, y + h);
                this.ctx.lineTo(px, pinY);
                this.ctx.stroke();
                
                this.ctx.fillStyle = this.palette.pin;
                this.ctx.beginPath();
                this.ctx.arc(px, pinY, 2, 0, Math.PI * 2);
                this.ctx.fill();
            }
            
            this.ctx.fillStyle = this.palette.componentLabel;
            this.ctx.font = `${7 / this.zoom}px sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('SERVO', x + w / 2, y + h / 2);
        } else {
            const centerY = y + h / 2;
            
            this.ctx.fillStyle = '#555';
            this.ctx.beginPath();
            this.ctx.ellipse(x + w / 2, centerY, w * 0.4, h / 2, 0, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.strokeStyle = '#333';
            this.ctx.lineWidth = 1 / this.zoom;
            this.ctx.stroke();
            
            this.ctx.fillStyle = this.palette.pin;
            this.ctx.beginPath();
            this.ctx.arc(x + w / 2, centerY, h * 0.2, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.fillStyle = '#aaa';
            this.ctx.fillRect(x + w - 6, centerY - 1, 6, 2);
            
            this.ctx.strokeStyle = this.palette.pin;
            this.ctx.lineWidth = 2 / this.zoom;
            this.ctx.beginPath();
            this.ctx.moveTo(x, centerY);
            this.ctx.lineTo(x + w * 0.2, centerY);
            this.ctx.moveTo(x + w, centerY);
            this.ctx.lineTo(x + w * 0.8, centerY);
            this.ctx.stroke();
            
            this.ctx.fillStyle = this.palette.pin;
            this.ctx.beginPath();
            this.ctx.arc(x, centerY, 2, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.beginPath();
            this.ctx.arc(x + w, centerY, 2, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        this.ctx.fillStyle = this.palette.componentLabel;
        this.ctx.font = `${8 / this.zoom}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(comp.id, x + w / 2, y + h + (comp.type === 'SERVO' ? 14 : 4));
    }
    
    private renderPower(comp: ComponentIR): void {
        const S = BASE_SCALE;
        const x = comp.position.x * S;
        const y = comp.position.y * S;
        const { width, height } = this.getComponentDimensions(comp);
        const w = width * S;
        const h = height * S;
        const holeSpacing = BreadboardGeometry.HOLE_SPACING * S;
        
        if (this.selectedId === comp.id) {
            this.ctx.strokeStyle = this.palette.selection;
            this.ctx.lineWidth = 2 / this.zoom;
            this.ctx.setLineDash([4 / this.zoom, 2 / this.zoom]);
            this.roundRect(x - 4, y - 4, w + 8, h + 8, 4);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
        
        if (comp.type === 'REGULATOR') {
            const pinY = y + h + 2 * S;
            
            this.ctx.fillStyle = '#1a1a1a';
            this.roundRect(x, y, w, h, 2);
            this.ctx.fill();
            
            this.ctx.fillStyle = '#444';
            this.roundRect(x, y, w, h * 0.3, 2);
            this.ctx.fill();
            
            this.ctx.strokeStyle = this.palette.componentLabel;
            this.ctx.lineWidth = 1 / this.zoom;
            this.roundRect(x, y, w, h, 2);
            this.ctx.stroke();
            
            this.ctx.strokeStyle = this.palette.pin;
            this.ctx.lineWidth = 2 / this.zoom;
            for (let i = 0; i < 3; i++) {
                const px = x + i * holeSpacing;
                this.ctx.beginPath();
                this.ctx.moveTo(px, y + h);
                this.ctx.lineTo(px, pinY);
                this.ctx.stroke();
                
                this.ctx.fillStyle = this.palette.pin;
                this.ctx.beginPath();
                this.ctx.arc(px, pinY, 2, 0, Math.PI * 2);
                this.ctx.fill();
            }
            
            this.ctx.fillStyle = this.palette.componentLabel;
            this.ctx.font = `${6 / this.zoom}px sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(comp.type, x + w / 2, y + h / 2);
        } else {
            const centerX = x + w / 2;
            const pinY = y + h + 2 * S;
            const pin1X = centerX - holeSpacing / 2;
            const pin2X = centerX + holeSpacing / 2;
            
            this.ctx.fillStyle = '#333';
            this.roundRect(x, y, w, h * 0.7, 2);
            this.ctx.fill();
            
            this.ctx.fillStyle = this.palette.componentLabel;
            this.roundRect(x, y + h * 0.7, w, h * 0.3, 0);
            this.ctx.fill();
            
            this.ctx.strokeStyle = '#555';
            this.ctx.lineWidth = 1 / this.zoom;
            this.roundRect(x, y, w, h, 2);
            this.ctx.stroke();
            
            this.ctx.fillStyle = '#c44';
            this.ctx.font = `bold ${10 / this.zoom}px sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'top';
            this.ctx.fillText('+', centerX, y + 2);
            
            this.ctx.fillStyle = '#44c';
            this.ctx.fillText('−', centerX, y + h * 0.7 - 8);
            
            this.ctx.strokeStyle = this.palette.pin;
            this.ctx.lineWidth = 2 / this.zoom;
            this.ctx.beginPath();
            this.ctx.moveTo(pin1X, y + h);
            this.ctx.lineTo(pin1X, pinY);
            this.ctx.moveTo(pin2X, y + h);
            this.ctx.lineTo(pin2X, pinY);
            this.ctx.stroke();
            
            this.ctx.fillStyle = this.palette.pin;
            this.ctx.beginPath();
            this.ctx.arc(pin1X, pinY, 2, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.beginPath();
            this.ctx.arc(pin2X, pinY, 2, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        this.ctx.fillStyle = this.palette.componentLabel;
        this.ctx.font = `${8 / this.zoom}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(comp.id, x + w / 2, y + h + (comp.type === 'REGULATOR' ? 14 : 10));
    }
    
    private renderCrystal(comp: ComponentIR): void {
        const S = BASE_SCALE;
        const x = comp.position.x * S;
        const y = comp.position.y * S;
        const { width, height } = this.getComponentDimensions(comp);
        const w = width * S;
        const h = height * S;
        
        if (this.selectedId === comp.id) {
            this.ctx.strokeStyle = this.palette.selection;
            this.ctx.lineWidth = 2 / this.zoom;
            this.ctx.setLineDash([4 / this.zoom, 2 / this.zoom]);
            this.roundRect(x - 4, y - 4, w + 8, h + 8, 4);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
        
        const centerY = y + h / 2;
        
        this.ctx.fillStyle = this.palette.pin;
        this.ctx.strokeStyle = this.palette.componentLabel;
        this.ctx.lineWidth = 1 / this.zoom;
        this.ctx.beginPath();
        this.ctx.ellipse(x + w / 2, centerY, w * 0.4, h / 2, 0, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        
        this.ctx.strokeStyle = '#555';
        this.ctx.lineWidth = 0.5 / this.zoom;
        this.ctx.beginPath();
        this.ctx.moveTo(x + w * 0.3, y);
        this.ctx.lineTo(x + w * 0.3, y + h);
        this.ctx.moveTo(x + w * 0.7, y);
        this.ctx.lineTo(x + w * 0.7, y + h);
        this.ctx.stroke();
        
        this.ctx.strokeStyle = this.palette.pin;
        this.ctx.lineWidth = 2 / this.zoom;
        this.ctx.beginPath();
        this.ctx.moveTo(x, centerY);
        this.ctx.lineTo(x + w * 0.2, centerY);
        this.ctx.moveTo(x + w, centerY);
        this.ctx.lineTo(x + w * 0.8, centerY);
        this.ctx.stroke();
        
        this.ctx.fillStyle = this.palette.pin;
        this.ctx.beginPath();
        this.ctx.arc(x, centerY, 2, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(x + w, centerY, 2, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.fillStyle = this.palette.componentLabel;
        this.ctx.font = `${8 / this.zoom}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        if (comp.value) {
            this.ctx.fillText(`${comp.id} ${comp.value}`, x + w / 2, y + h + 4);
        } else {
            this.ctx.fillText(comp.id, x + w / 2, y + h + 4);
        }
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
            this.ctx.strokeStyle = this.palette.selection;
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

        // Main wire - increased thickness
        this.ctx.strokeStyle = wire.color;
        this.ctx.lineWidth = 3.5 / this.zoom;  // Increased from 2 to 3.5
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

        // Connection dots - made larger
        this.ctx.fillStyle = wire.color;
        this.ctx.beginPath();
        this.ctx.arc(fromX, fromY, 4, 0, Math.PI * 2);  // Increased from 3 to 4
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(toX, toY, 4, 0, Math.PI * 2);  // Increased from 3 to 4
        this.ctx.fill();
        
        // Selection indicators on terminals
        if (isSelected) {
            this.ctx.strokeStyle = this.palette.selection;
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

    /**
     * Export the whole circuit (not just the viewport) as a PNG.
     * Renders offscreen with a fit-to-content transform at the given scale.
     */
    exportCanvas(callback: (blob: Blob | null) => void, scale = 2): void {
        const bounds = this.getContentBounds();
        if (!this.circuitIR || !bounds) {
            callback(null);
            return;
        }

        const contentW = Math.max(bounds.maxX - bounds.minX, 1) * BASE_SCALE;
        const contentH = Math.max(bounds.maxY - bounds.minY, 1) * BASE_SCALE;
        const width = Math.ceil(contentW * scale + 2 * PADDING);
        const height = Math.ceil(contentH * scale + 2 * PADDING);

        const offscreen = document.createElement('canvas');
        offscreen.width = width;
        offscreen.height = height;
        const ctx = offscreen.getContext('2d');
        if (!ctx) {
            callback(null);
            return;
        }

        this.refreshPalette();
        ctx.fillStyle = this.palette.canvasBg;
        ctx.fillRect(0, 0, width, height);

        // Swap context and camera for the export render, then restore.
        const prevCtx = this.ctx;
        const prevZoom = this.zoom;
        const prevPanX = this.panX;
        const prevPanY = this.panY;
        const prevSelected = this.selectedId;
        const prevPreview = this.snapPreviewHoles;

        this.ctx = ctx;
        this.zoom = scale;
        this.panX = -bounds.minX * BASE_SCALE * scale;
        this.panY = -bounds.minY * BASE_SCALE * scale;
        this.selectedId = null;
        this.snapPreviewHoles = [];

        ctx.save();
        ctx.translate(PADDING + this.panX, PADDING + this.panY);
        ctx.scale(this.zoom, this.zoom);
        this.drawScene();
        ctx.restore();

        this.ctx = prevCtx;
        this.zoom = prevZoom;
        this.panX = prevPanX;
        this.panY = prevPanY;
        this.selectedId = prevSelected;
        this.snapPreviewHoles = prevPreview;

        offscreen.toBlob(callback, 'image/png');
    }

    /** Export the whole circuit as a standalone SVG document. */
    exportSVG(): string | null {
        if (!this.circuitIR) return null;
        return buildSvg(this.circuitIR, this.boardGeometries);
    }
}
