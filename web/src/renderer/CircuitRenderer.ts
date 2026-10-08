import { CircuitIR, ComponentIR, BoardIR, Wire, Position, ComponentCategory } from '../types';
import { BreadboardGeometry, HolePosition } from '../geometry/BreadboardGeometry';
import { getComponentFootprint, getICPinCounts } from '../geometry/ComponentFootprints';
import { SnapManager } from '../geometry/SnapManager';
import { CircuitHistory } from '../history/CircuitHistory';
import { buildSvg } from '../export/SvgExporter';
import { translateBoardElements } from './boardMove';
import { cornerRadius, wirePoints } from './wirePath';
import { resistorBandColors } from './resistorBands';
import { artFor, ComponentArt, computeArtTransform } from './componentArt';
import { componentPinHole, componentPinHoles } from '../geometry/PinGeometry';
import { Netlist } from '../simulation/Netlist';
import { SimulationResult, LogicValue } from '../simulation/Simulator';
import { componentSummary } from '../components/PinDatabase';

// Wire colors used while a simulation is active.
const SIM_VALUE_COLORS: Record<string, string> = {
    '1': '#2ecc71',
    '0': '#5b7fb4',
    'X': '#e67e22',
};

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
    boardChannel: string;
    boardHole: string;
    pin: string;
    componentLabel: string;
    selection: string;
}

const DEFAULT_PALETTE: RenderPalette = {
    canvasBg: '#f5f5f5',
    boardBg: '#e8eaec',
    boardEdge: '#cfd3d8',
    boardChannel: '#d4d7db',
    boardHole: '#222',
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

    // Active simulation overlay (null when simulation is off)
    private simResult: SimulationResult | null = null;
    private simNetlist: Netlist | null = null;

    // Netlist for highlighting (set even when simulation is off)
    private netlist: Netlist | null = null;
    private hoveredNetId: number | null = null;

    // Switches closed by the user while simulating (push buttons, toggles)
    private closedSwitches = new Set<string>();
    private onSwitchToggle: ((id: string) => void) | null = null;
    private pointerDownScreen = { x: 0, y: 0 };

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

    /**
     * Pointer capture can throw for synthetic or already-released pointers;
     * dragging must keep working in that case.
     */
    private capturePointer(pointerId: number): void {
        try {
            this.canvas.setPointerCapture(pointerId);
        } catch {
            // Ignore: capture is an optimisation, not a requirement.
        }
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
        this.pointerDownScreen = { x: e.clientX, y: e.clientY };

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
            this.capturePointer(e.pointerId);
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
            
            this.capturePointer(e.pointerId);
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
                    // Move this board and its elements; cross-board wire
                    // endpoints follow whichever board they belong to.
                    const board = this.circuitIR.boards.find(b => b.id === this.selectedId);
                    if (board) {
                        const dx = newBaseX - board.position.x;
                        const dy = newBaseY - board.position.y;
                        
                        board.position = { x: newBaseX, y: newBaseY };
                        translateBoardElements(this.circuitIR, board.id, dx, dy);
                        
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
                            const firstPinOffsetX = 1;
                            const snapResult = snapMgr.snapICComponent(
                                { x: newBaseX, y: newBaseY },
                                comp.pinCount,
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
                                for (let pin = 1; pin <= comp.pinCount; pin++) {
                                    const hole = componentPinHole(comp, pin, geo);
                                    if (hole) this.snapPreviewHoles.push(hole);
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

            // Net highlighting: hovering a wire lights up its whole net.
            const netId = element?.type === 'wire' && element.wireIndex !== undefined && this.netlist
                ? this.netlist.wireNet[element.wireIndex] ?? null
                : null;
            if (netId !== this.hoveredNetId) {
                this.hoveredNetId = netId;
                this.redraw();
            }
            
            // Update cursor
            const hoveredComp = element?.type === 'component' && this.circuitIR
                ? this.circuitIR.components.find(c => c.id === element.id)
                : undefined;
            if (element?.type === 'wire_terminal') {
                this.canvas.style.cursor = 'crosshair';
            } else if (hoveredComp?.category === 'switch' && this.simResult) {
                this.canvas.style.cursor = 'pointer';
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
                    const summary = componentSummary(comp.type);
                    const detail = summary ? `${comp.type} — ${summary}` : comp.type;
                    const label = comp.value ? `${comp.id} (${detail}, ${comp.value})` : `${comp.id} (${detail})`;
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

        // A click without movement on a switch toggles it while simulating.
        if (this.simResult && this.selectedId) {
            const moved = Math.hypot(
                e.clientX - this.pointerDownScreen.x,
                e.clientY - this.pointerDownScreen.y
            );
            const comp = this.circuitIR?.components.find(c => c.id === this.selectedId);
            if (moved < 4 && comp?.category === 'switch') {
                if (this.closedSwitches.has(comp.id)) {
                    this.closedSwitches.delete(comp.id);
                } else {
                    this.closedSwitches.add(comp.id);
                }
                this.redraw();
                this.onSwitchToggle?.(comp.id);
            }
        }

        this.isDragging = false;
        this.canvas.style.cursor = this.spacePressed ? 'grab' : 'default';
    }
    
    private onPointerLeave(): void {
        if (this.isDragging || this.isPanning || this.activePointers.size > 0) return;
        this.canvas.style.cursor = this.spacePressed ? 'grab' : 'default';
        this.hoveredComponentId = null;
        this.hoveredNetId = null;
        this.snapPreviewHoles = [];
        this.isSnapped = false;
        this.hideTooltip();
        this.redraw();
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
        this.closedSwitches.clear();
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

    /** Enable/disable the simulation overlay. */
    setSimulation(result: SimulationResult | null, netlist: Netlist | null): void {
        this.simResult = result;
        this.simNetlist = netlist;
        if (netlist) this.netlist = netlist;
        this.redraw();
    }

    /** Provide the netlist used for net highlighting. */
    setNetlist(netlist: Netlist | null): void {
        this.netlist = netlist;
        this.hoveredNetId = null;
    }

    /** Switches the user has closed while simulating. */
    getClosedSwitches(): ReadonlySet<string> {
        return this.closedSwitches;
    }

    setOnSwitchToggle(fn: (id: string) => void): void {
        this.onSwitchToggle = fn;
    }

    private isSwitchClosed(id: string): boolean {
        return this.closedSwitches.has(id);
    }

    private highlightedNetId(): number | null {
        if (!this.netlist) return null;
        if (this.hoveredNetId !== null) return this.hoveredNetId;
        if (this.selectedId) {
            const match = this.selectedId.match(/^wire_(\d+)/);
            if (match) {
                return this.netlist.wireNet[parseInt(match[1], 10)] ?? null;
            }
        }
        return null;
    }

    isSimulating(): boolean {
        return this.simResult !== null;
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
            boardChannel: read('--board-channel', DEFAULT_PALETTE.boardChannel),
            boardHole: read('--board-hole', DEFAULT_PALETTE.boardHole),
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
                for (let pin = 1; pin <= comp.pinCount; pin++) {
                    const hole = componentPinHole(comp, pin, geo);
                    if (hole) {
                        snapMgr.registerPinOccupancy(hole.col, hole.row, comp.id, pin);
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
        const { bottom } = getICPinCounts(pinCount);
        // Width: pins span (bottom-1) * HOLE_SPACING, plus 2 units for body margins
        const width = (bottom - 1) * BreadboardGeometry.HOLE_SPACING + 2;
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
            this.ctx.lineWidth = 2;
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
        const channelHeight = BreadboardGeometry.CHANNEL_HEIGHT * S;
        
        // Selection highlight for board
        if (this.selectedId === board.id) {
            this.ctx.strokeStyle = this.palette.selection;
            this.ctx.lineWidth = 3;
            this.ctx.setLineDash([6, 3]);
            this.roundRect(x - 4, y - 4, w + 8, h + 8, 8);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }

        // Board background
        this.ctx.fillStyle = this.palette.boardBg;
        this.ctx.strokeStyle = this.palette.boardEdge;
        this.ctx.lineWidth = 1;
        this.roundRect(x, y, w, h, 6);
        this.ctx.fill();
        this.ctx.stroke();

        // Top power rail: red (+) and blue (−) bus lines running beside the
        // hole rows, not through them.
        const holesStartX = geo.holesStartX * S;
        const topPlusHole = geo.getHolePosition(1, 'TOP+');
        const topMinusHole = geo.getHolePosition(1, 'TOP-');
        const railEndX = geo.getHolePosition(numCols, 'TOP+').x * S;
        const railOffset = 0.8 * S;
        const topPlusLineY = topPlusHole.y * S - railOffset;
        const topMinusLineY = topMinusHole.y * S + railOffset;

        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = '#d9534f';
        this.ctx.beginPath();
        this.ctx.moveTo(holesStartX, topPlusLineY);
        this.ctx.lineTo(railEndX, topPlusLineY);
        this.ctx.stroke();
        this.ctx.strokeStyle = '#4a7fd4';
        this.ctx.beginPath();
        this.ctx.moveTo(holesStartX, topMinusLineY);
        this.ctx.lineTo(railEndX, topMinusLineY);
        this.ctx.stroke();

        // Rail labels at both ends
        this.ctx.font = `bold 10px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = '#d9534f';
        this.ctx.fillText('+', holesStartX - 7, topPlusLineY + 3);
        this.ctx.fillText('+', railEndX + 7, topPlusLineY + 3);
        this.ctx.fillStyle = '#4a7fd4';
        this.ctx.fillText('−', holesStartX - 7, topMinusLineY + 3);
        this.ctx.fillText('−', railEndX + 7, topMinusLineY + 3);

        this.ctx.fillStyle = this.palette.boardHole;
        for (let col = 1; col <= numCols; col++) {
            for (const row of ['TOP+', 'TOP-']) {
                const hole = geo.getHolePosition(col, row);
                this.ctx.beginPath();
                this.ctx.arc(hole.x * S, hole.y * S, 1.25, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }

        // Bottom power rail
        const bottomPlusHole = geo.getHolePosition(1, 'BOTTOM+');
        const bottomMinusHole = geo.getHolePosition(1, 'BOTTOM-');
        const bottomRailEndX = geo.getHolePosition(numCols, 'BOTTOM+').x * S;
        const bottomPlusLineY = bottomPlusHole.y * S - railOffset;
        const bottomMinusLineY = bottomMinusHole.y * S + railOffset;

        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = '#d9534f';
        this.ctx.beginPath();
        this.ctx.moveTo(holesStartX, bottomPlusLineY);
        this.ctx.lineTo(bottomRailEndX, bottomPlusLineY);
        this.ctx.stroke();
        this.ctx.strokeStyle = '#4a7fd4';
        this.ctx.beginPath();
        this.ctx.moveTo(holesStartX, bottomMinusLineY);
        this.ctx.lineTo(bottomRailEndX, bottomMinusLineY);
        this.ctx.stroke();

        this.ctx.font = `bold 10px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = '#d9534f';
        this.ctx.fillText('+', holesStartX - 7, bottomPlusLineY + 3);
        this.ctx.fillText('+', bottomRailEndX + 7, bottomPlusLineY + 3);
        this.ctx.fillStyle = '#4a7fd4';
        this.ctx.fillText('−', holesStartX - 7, bottomMinusLineY + 3);
        this.ctx.fillText('−', bottomRailEndX + 7, bottomMinusLineY + 3);

        this.ctx.fillStyle = this.palette.boardHole;
        for (let col = 1; col <= numCols; col++) {
            for (const row of ['BOTTOM+', 'BOTTOM-']) {
                const hole = geo.getHolePosition(col, row);
                this.ctx.beginPath();
                this.ctx.arc(hole.x * S, hole.y * S, 1.25, 0, Math.PI * 2);
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
                this.ctx.arc(hole.x * S, hole.y * S, 1.25, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }

        // Column numbers above row A and below row J, every 5 columns
        this.ctx.fillStyle = this.palette.pin;
        this.ctx.font = `${8}px sans-serif`;
        this.ctx.textAlign = 'center';
        const rowAHole = geo.getHolePosition(1, 'A');
        for (let col = 1; col <= numCols; col += 5) {
            const hx = holesStartX + (col - 1) * holeSpacing;
            this.ctx.fillText(String(col), hx, rowAHole.y * S - 8);
            this.ctx.fillText(String(col), hx, y + h + 12);
        }

        // Row labels on both sides
        this.ctx.textAlign = 'right';
        for (const row of BreadboardGeometry.ALL_ROWS) {
            const hole = geo.getHolePosition(1, row);
            this.ctx.fillText(row, x - 4, hole.y * S + 3);
        }
        this.ctx.textAlign = 'left';
        for (const row of BreadboardGeometry.ALL_ROWS) {
            const hole = geo.getHolePosition(numCols, row);
            this.ctx.fillText(row, x + w + 4, hole.y * S + 3);
        }
    }

    private renderComponent(comp: ComponentIR): void {
        const category = comp.category || 'ic';
        
        // Prefer user-authored SVG artwork when available and loaded.
        const art = artFor(comp.type);
        if (art) {
            const geo = this.geometryFor(comp.boardId);
            const image = this.getArtImage(art.url);
            if (geo && image && this.renderComponentArt(comp, art, image, geo)) {
                return;
            }
        }
        
        this.drawComponentShadow(comp, category);
        
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

    // User-authored SVG artwork, rasterized once per URL.
    private artImages = new Map<string, HTMLImageElement>();

    private getArtImage(url: string): HTMLImageElement | null {
        let image = this.artImages.get(url);
        if (!image) {
            image = new Image();
            image.onload = () => this.redraw();
            image.src = url;
            this.artImages.set(url, image);
        }
        return image.complete && image.naturalWidth > 0 ? image : null;
    }

    /**
     * Draw a component from its SVG artwork, mapped onto its pin holes.
     * Returns false when the artwork cannot be placed (caller falls back to
     * the procedural renderer).
     */
    private renderComponentArt(
        comp: ComponentIR,
        art: ComponentArt,
        image: HTMLImageElement,
        geo: BreadboardGeometry
    ): boolean {
        const holes = componentPinHoles(comp, geo);
        const holeList = Array.from({ length: comp.pinCount }, (_, index) => {
            const hole = holes.get(index + 1);
            return hole ? { x: hole.x * BASE_SCALE, y: hole.y * BASE_SCALE } : undefined;
        });
        const transform = computeArtTransform(art, holeList);
        if (!transform) return false;

        const cos = Math.cos(transform.rotate);
        const sin = Math.sin(transform.rotate);
        const apply = (x: number, y: number) => ({
            x: transform.translateX + transform.scaleX * (x * cos - y * sin),
            y: transform.translateY + transform.scaleY * (x * sin + y * cos),
        });

        // Artwork bounding box in canvas units.
        const corners = [
            apply(0, 0),
            apply(art.width, 0),
            apply(art.width, art.height),
            apply(0, art.height),
        ];
        const minX = Math.min(...corners.map(c => c.x));
        const maxX = Math.max(...corners.map(c => c.x));
        const minY = Math.min(...corners.map(c => c.y));
        const maxY = Math.max(...corners.map(c => c.y));

        // The artwork itself, with a shadow that follows its silhouette
        // (no background panel behind transparent areas).
        const avgScale = (transform.scaleX + transform.scaleY) / 2 || 1;
        this.ctx.save();
        this.ctx.translate(transform.translateX, transform.translateY);
        this.ctx.scale(transform.scaleX, transform.scaleY);
        this.ctx.rotate(transform.rotate);
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
        this.ctx.shadowBlur = 6 / avgScale;
        this.ctx.shadowOffsetY = 2.5 / avgScale;
        this.ctx.drawImage(image, 0, 0, art.width, art.height);
        // Cover the printed type; the real type is drawn after the restore.
        if (art.label) {
            this.ctx.shadowColor = 'transparent';
            this.ctx.shadowBlur = 0;
            this.ctx.shadowOffsetY = 0;
            this.ctx.fillStyle = art.label.coverColor ?? '#333333';
            this.ctx.fillRect(
                art.label.x - art.label.coverWidth / 2,
                art.label.y - art.label.coverHeight / 2,
                art.label.coverWidth,
                art.label.coverHeight
            );
        }
        this.ctx.restore();

        // Selection highlight around the artwork
        if (this.selectedId === comp.id) {
            this.ctx.strokeStyle = this.palette.selection;
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([4, 2]);
            this.roundRect(minX - 4, minY - 4, maxX - minX + 8, maxY - minY + 8, 4);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }

        // Dynamic type marking for ICs (the artwork's printed label was covered)
        if (art.label) {
            const center = apply(art.label.x, art.label.y);
            const bodyHeight = maxY - minY;
            this.ctx.fillStyle = '#e8e8e8';
            this.ctx.font = `bold ${Math.max(6, bodyHeight * 0.3)}px sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(comp.type, center.x, center.y);
        }

        // A closed switch gets a pressed look and a green status ring.
        if (comp.category === 'switch' && this.isSwitchClosed(comp.id)) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
            this.ctx.beginPath();
            this.ctx.ellipse(
                (minX + maxX) / 2,
                minY + (maxY - minY) * 0.38,
                (maxX - minX) * 0.32,
                (maxY - minY) * 0.22,
                0, 0, Math.PI * 2
            );
            this.ctx.fill();
            this.ctx.strokeStyle = '#2ecc71';
            this.ctx.lineWidth = 2;
            this.roundRect(minX - 2, minY - 2, maxX - minX + 4, maxY - minY + 4, 4);
            this.ctx.stroke();
        }

        // Simulation overlay for LEDs: glow when lit, dim when dark.
        if (comp.category === 'led' && this.simResult) {
            const dome = apply(art.width * 0.46, art.height * 0.42);
            const lit = this.simResult.litLeds.has(comp.id);
            if (lit) {
                this.ctx.save();
                this.ctx.shadowColor = '#ff3333';
                this.ctx.shadowBlur = 24;
                this.ctx.fillStyle = 'rgba(255, 60, 60, 0.85)';
                this.ctx.beginPath();
                this.ctx.arc(dome.x, dome.y, Math.max(3, (maxX - minX) * 0.22), 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.restore();
            } else {
                this.ctx.fillStyle = 'rgba(10, 10, 10, 0.35)';
                this.ctx.beginPath();
                this.ctx.ellipse(
                    dome.x, dome.y,
                    Math.max(3, (maxX - minX) * 0.24), Math.max(3, (maxY - minY) * 0.3),
                    0, 0, Math.PI * 2
                );
                this.ctx.fill();
            }
        }

        // Component label
        this.ctx.fillStyle = this.palette.componentLabel;
        this.ctx.font = '8px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        const label = comp.value ? `${comp.id} ${comp.value}` : comp.id;
        this.ctx.fillText(label, (minX + maxX) / 2, maxY + 4);

        return true;
    }

    /**
     * Soft drop shadow under a component body (TinkerCAD-style depth).
     */
    private drawComponentShadow(comp: ComponentIR, category: ComponentCategory): void {        const S = BASE_SCALE;
        const { width, height } = this.getComponentDimensions(comp);
        const x = comp.position.x * S;
        const y = comp.position.y * S;
        const w = width * S;
        const h = height * S;

        this.ctx.save();
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
        this.ctx.shadowBlur = 6;
        this.ctx.shadowOffsetY = 2.5;
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.10)';
        this.ctx.beginPath();
        if (category === 'led' || category === 'sensor') {
            this.ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        } else {
            this.roundRect(x, y, w, h, 3);
        }
        this.ctx.fill();
        this.ctx.restore();
    }

    /** Metallic component lead. */
    private drawLead(x1: number, y1: number, x2: number, y2: number): void {
        this.ctx.strokeStyle = '#9aa0a6';
        this.ctx.lineWidth = 2.4;
        this.ctx.lineCap = 'round';
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
    }

    /** Silver solder pad where a lead meets a breadboard hole. */
    private drawPinPad(x: number, y: number, radius = 2.6): void {
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.fillStyle = '#cdd1d6';
        this.ctx.fill();
        this.ctx.strokeStyle = '#8a9099';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
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
        const { bottom, top, topOffset } = getICPinCounts(comp.pinCount);
        const holeSpacing = BreadboardGeometry.HOLE_SPACING * S;
        
        const { width, height, pinLength } = this.getICDimensions(comp.pinCount);
        const icWidth = width * S;
        const icHeight = height * S;
        const pinLengthPx = pinLength * S;
        
        const firstPinOffset = 1 * S;

        // Selection highlight
        if (this.selectedId === comp.id) {
            this.ctx.strokeStyle = this.palette.selection;
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([4, 2]);
            this.roundRect(x - 4, y - pinLengthPx - 4, icWidth + 8, icHeight + pinLengthPx * 2 + 8, 4);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }

        // IC body with a subtle sheen and rounded ends
        const bodyGradient = this.ctx.createLinearGradient(0, y, 0, y + icHeight);
        bodyGradient.addColorStop(0, '#333333');
        bodyGradient.addColorStop(0.15, '#232323');
        bodyGradient.addColorStop(1, '#111111');
        this.ctx.fillStyle = bodyGradient;
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 1;
        this.roundRect(x, y, icWidth, icHeight, 4);
        this.ctx.fill();
        this.ctx.stroke();

        // Notch at the pin-1 end (dark semicircle cut into the body edge)
        this.ctx.fillStyle = '#0b0b0b';
        this.ctx.beginPath();
        this.ctx.arc(x, y + icHeight / 2, icHeight * 0.22, -Math.PI / 2, Math.PI / 2);
        this.ctx.fill();
        this.ctx.strokeStyle = '#3d3d3d';
        this.ctx.lineWidth = 0.8;
        this.ctx.stroke();

        // Pin 1 dot
        this.ctx.fillStyle = '#6f6f6f';
        this.ctx.beginPath();
        this.ctx.arc(x + 6, y + icHeight - 6, 2, 0, Math.PI * 2);
        this.ctx.fill();

        // Pins - Standard IC numbering: 
        // Bottom: pins 1 to ceil(N/2) (left to right)
        // Top: pins N to ceil(N/2)+1 (left to right, so numbers decrease;
        // right-aligned when the count is odd)
        for (let i = 0; i < bottom; i++) {
            const px = x + firstPinOffset + i * holeSpacing;
            
            // Bottom pins (1, 2, 3, ...) - inserted into row F
            this.drawLead(px, y + icHeight, px, y + icHeight + pinLengthPx);
            this.drawPinPad(px, y + icHeight + pinLengthPx);
        }
        for (let i = 0; i < top; i++) {
            const px = x + firstPinOffset + (topOffset + i) * holeSpacing;
            
            // Top pins (N, N-1, ...) - inserted into row E
            this.drawLead(px, y - pinLengthPx, px, y);
            this.drawPinPad(px, y - pinLengthPx);
        }

        // IC label (white marking like a real DIP)
        this.ctx.fillStyle = '#e8e8e8';
        this.ctx.font = `bold ${9}px monospace`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(comp.type, x + icWidth / 2, y + icHeight / 2);
        
        // Component ID
        this.ctx.fillStyle = this.palette.componentLabel;
        this.ctx.font = `${10}px sans-serif`;
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
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([4, 2]);
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
        
        // Leads and solder pads
        this.drawLead(x, centerY, bodyX, centerY);
        this.drawLead(bodyX + bodyW, centerY, x + w, centerY);
        this.drawPinPad(x, centerY);
        this.drawPinPad(x + w, centerY);
        
        if (comp.type === 'CAP') {
            const microfarads = this.capacitanceMicrofarads(comp.value);
            if (microfarads !== null && microfarads >= 1) {
                // Electrolytic can with a polarity stripe
                const gradient = this.ctx.createLinearGradient(0, y, 0, y + h);
                gradient.addColorStop(0, '#3d5a99');
                gradient.addColorStop(0.5, '#2b3f6e');
                gradient.addColorStop(1, '#1d2c4f');
                this.ctx.fillStyle = gradient;
                this.ctx.strokeStyle = '#16213b';
                this.ctx.lineWidth = 1;
                this.roundRect(bodyX, y, bodyW, h, h / 3);
                this.ctx.fill();
                this.ctx.stroke();
                this.ctx.fillStyle = '#c9cdd2';
                this.ctx.fillRect(bodyX + bodyW - 6, y + 1, 4, h - 2);
                this.ctx.fillStyle = '#2b3f6e';
                this.ctx.font = `bold ${7}px sans-serif`;
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText('−', bodyX + bodyW - 4, centerY);
            } else {
                // Ceramic disc
                const radius = h * 0.7;
                this.ctx.fillStyle = '#e08a3c';
                this.ctx.strokeStyle = '#a85f1e';
                this.ctx.lineWidth = 1;
                this.ctx.beginPath();
                this.ctx.ellipse(bodyX + bodyW / 2, centerY, radius * 0.8, radius, 0, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.stroke();
            }
        } else if (comp.type === 'IND') {
            // Copper coil
            this.ctx.strokeStyle = '#b87333';
            this.ctx.lineWidth = 2.4;
            const numLoops = 4;
            const loopWidth = bodyW / numLoops;
            for (let i = 0; i < numLoops; i++) {
                this.ctx.beginPath();
                this.ctx.arc(bodyX + loopWidth * (i + 0.5), centerY, loopWidth / 2, Math.PI, 0, false);
                this.ctx.stroke();
            }
        } else if (comp.type === 'POT') {
            // Blue trimmer with a metal adjustment screw
            const gradient = this.ctx.createLinearGradient(0, y, 0, y + h);
            gradient.addColorStop(0, '#4a63c8');
            gradient.addColorStop(1, '#2f3f8f');
            this.ctx.fillStyle = gradient;
            this.ctx.strokeStyle = '#1f2a5f';
            this.ctx.lineWidth = 1;
            this.roundRect(bodyX, y, bodyW, h, 2);
            this.ctx.fill();
            this.ctx.stroke();
            this.ctx.beginPath();
            this.ctx.arc(bodyX + bodyW / 2, centerY, Math.min(h, bodyW) * 0.22, 0, Math.PI * 2);
            this.ctx.fillStyle = '#d7dade';
            this.ctx.fill();
            this.ctx.strokeStyle = '#8a9099';
            this.ctx.stroke();
        } else {
            // Resistor: beige body with real colour bands
            const gradient = this.ctx.createLinearGradient(0, y, 0, y + h);
            gradient.addColorStop(0, '#e6c9a3');
            gradient.addColorStop(0.5, '#d9b98d');
            gradient.addColorStop(1, '#c3a172');
            this.ctx.fillStyle = gradient;
            this.ctx.strokeStyle = '#8b6914';
            this.ctx.lineWidth = 1;
            this.roundRect(bodyX, y, bodyW, h, h / 2.6);
            this.ctx.fill();
            this.ctx.stroke();
            
            const bands = resistorBandColors(comp.value);
            const bandWidth = Math.max(2, bodyW * 0.09);
            const bandFractions = [0.22, 0.42, 0.62, 0.85];
            bands.forEach((color, index) => {
                this.ctx.fillStyle = color;
                this.ctx.fillRect(bodyX + bodyW * bandFractions[index] - bandWidth / 2, y + 1.5, bandWidth, h - 3);
            });
        }
        
        // Label
        this.ctx.fillStyle = this.palette.componentLabel;
        this.ctx.font = `${8}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(`${comp.id}${comp.value ? ' ' + comp.value : ''}`, x + w/2, y + h + 4);
    }

    /** Decode capacitor values into microfarads for the visual style. */
    private capacitanceMicrofarads(value?: string): number | null {
        if (!value) return null;
        const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(u|µ|n|p)?f?$/i);
        if (!match) return null;
        const amount = parseFloat(match[1]);
        if (!Number.isFinite(amount)) return null;
        const unit = (match[2] ?? 'u').toLowerCase();
        if (unit === 'n') return amount / 1e3;
        if (unit === 'p') return amount / 1e6;
        return amount;
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
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([4, 2]);
            this.roundRect(x - 4, y - 4, w + 8, h + 8, 4);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
        
        const centerY = y + h / 2;
        
        // Body with margins (pins are at x=0 and x=width)
        const bodyMargin = 4;
        const bodyX = x + bodyMargin;
        const bodyW = w - 2 * bodyMargin;
        
        // Leads and solder pads
        this.drawLead(x, centerY, bodyX, centerY);
        this.drawLead(bodyX + bodyW, centerY, x + w, centerY);
        this.drawPinPad(x, centerY);
        this.drawPinPad(x + w, centerY);
        
        // Diode body - black glass with a subtle sheen
        const diodeGradient = this.ctx.createLinearGradient(0, y, 0, y + h);
        diodeGradient.addColorStop(0, '#3a3a3a');
        diodeGradient.addColorStop(0.5, '#1c1c1c');
        diodeGradient.addColorStop(1, '#0e0e0e');
        this.ctx.fillStyle = diodeGradient;
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 1;
        this.roundRect(bodyX, y, bodyW, h, 2);
        this.ctx.fill();
        this.ctx.stroke();
        
        // Cathode band (white/silver stripe)
        this.ctx.fillStyle = '#ccc';
        this.ctx.fillRect(bodyX + bodyW - 4, y, 3, h);
        
        // Label
        this.ctx.fillStyle = this.palette.componentLabel;
        this.ctx.font = `${8}px sans-serif`;
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
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([4, 2]);
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
        
        // Metallic leads and solder pads
        this.drawLead(pin1X, y + h, pin1X, pinY);
        this.drawLead(pin2X, y + h, pin2X, pinY);
        this.drawPinPad(pin1X, pinY);
        this.drawPinPad(pin2X, pinY);
        
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
        this.ctx.strokeStyle = this.darkenColor(ledColor, 0.6);
        this.ctx.lineWidth = 1;
        this.ctx.stroke();

        // Glass highlight
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.beginPath();
        this.ctx.ellipse(
            centerX - radius * 0.35,
            centerY - radius * 0.4,
            radius * 0.3,
            radius * 0.18,
            -0.6,
            0,
            Math.PI * 2
        );
        this.ctx.fill();

        // Base collar where the dome meets the leads
        this.ctx.fillStyle = '#d8dade';
        this.ctx.strokeStyle = '#9aa0a6';
        this.ctx.lineWidth = 0.8;
        this.ctx.beginPath();
        this.ctx.rect(centerX - radius * 0.62, y + h - 2.5, radius * 1.24, 2.5);
        this.ctx.fill();
        this.ctx.stroke();

        // Flat edge marks the cathode side
        this.ctx.strokeStyle = '#4a4a4a';
        this.ctx.lineWidth = 1.2;
        this.ctx.beginPath();
        this.ctx.moveTo(centerX + radius * 0.35, y + h - 2);
        this.ctx.lineTo(centerX + radius - 1, y + h - 2);
        this.ctx.stroke();

        // Simulation: glow when lit, dim when dark
        const lit = this.simResult?.litLeds.has(comp.id) ?? false;
        if (lit) {
            this.ctx.save();
            this.ctx.shadowColor = ledColor;
            this.ctx.shadowBlur = 24;
            this.ctx.fillStyle = ledColor;
            this.ctx.beginPath();
            this.ctx.arc(centerX, centerY, radius * 0.95, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        } else if (this.simResult) {
            this.ctx.fillStyle = 'rgba(10, 10, 10, 0.45)';
            this.ctx.beginPath();
            this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        // Anode/Cathode labels
        this.ctx.fillStyle = this.palette.componentLabel;
        this.ctx.font = `${6}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.fillText('A', pin1X, pinY + 8);
        this.ctx.fillText('K', pin2X, pinY + 8);
        
        // Component ID
        this.ctx.font = `${8}px sans-serif`;
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
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([4, 2]);
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
        
        // Leads and solder pads
        this.drawLead(pin1X, y + h, pin1X, pinY);
        this.drawLead(pin2X, y + h, pin2X, pinY);
        this.drawPinPad(pin1X, pinY);
        this.drawPinPad(pin2X, pinY);
        
        if (comp.type === 'LDR') {
            // LDR - brownish disc with zigzag pattern
            this.ctx.fillStyle = '#8b4513';
            this.ctx.beginPath();
            this.ctx.arc(centerX, centerY, w/2, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Zigzag pattern (light-sensitive element)
            this.ctx.strokeStyle = '#ffd700';
            this.ctx.lineWidth = 1;
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
            this.ctx.lineWidth = 1;
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
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, w/2, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // Pin labels
        this.ctx.fillStyle = this.palette.componentLabel;
        this.ctx.font = `${6}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.fillText('1', pin1X, pinY + 8);
        this.ctx.fillText('2', pin2X, pinY + 8);
        
        // Component ID
        this.ctx.font = `${8}px sans-serif`;
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
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([4, 2]);
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
        
        // TO-92 package body - half-cylinder shape with a flat face
        const bodyGradient = this.ctx.createLinearGradient(0, y, 0, y + h);
        bodyGradient.addColorStop(0, '#3a3a3a');
        bodyGradient.addColorStop(0.4, '#232323');
        bodyGradient.addColorStop(1, '#141414');
        this.ctx.fillStyle = bodyGradient;
        this.ctx.beginPath();
        this.ctx.moveTo(x, y + h);
        this.ctx.lineTo(x, y + h * 0.3);
        this.ctx.arc(centerX, y + h * 0.3, w/2, Math.PI, 0, false);
        this.ctx.lineTo(x + w, y + h);
        this.ctx.closePath();
        this.ctx.fill();
        
        // Outline and flat-face edge
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
        this.ctx.strokeStyle = '#454545';
        this.ctx.beginPath();
        this.ctx.moveTo(x + w * 0.12, y + h - 1);
        this.ctx.lineTo(x + w * 0.88, y + h - 1);
        this.ctx.stroke();
        
        // Three leads with solder pads
        const pinXs = [pin1X, pin2X, pin3X];
        for (const px of pinXs) {
            this.drawLead(px, y + h, px, pinY);
            this.drawPinPad(px, pinY);
        }
        
        // Type label on body (white marking)
        this.ctx.fillStyle = '#d8d8d8';
        this.ctx.font = `${7}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(comp.type, centerX, y + h * 0.6);
        
        // Pin labels
        this.ctx.fillStyle = this.palette.componentLabel;
        this.ctx.font = `${6}px sans-serif`;
        const isMOSFET = comp.type === 'NMOS' || comp.type === 'PMOS';
        const pinLabels = isMOSFET ? ['S', 'G', 'D'] : ['E', 'B', 'C'];
        for (let i = 0; i < 3; i++) {
            this.ctx.fillText(pinLabels[i], pinXs[i], pinY + 8);
        }
        
        // Component ID
        this.ctx.font = `${8}px sans-serif`;
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
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([4, 2]);
            this.roundRect(x - 4, y - 4, w + 8, h + 8, 4);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
        
        if (comp.type === 'PUSHBUTTON') {
            const centerX = x + w / 2;
            const centerY = y + h / 2;
            const pinY = y + h + 1.5 * S;
            
            // Base plate
            const baseGradient = this.ctx.createLinearGradient(0, y, 0, y + h);
            baseGradient.addColorStop(0, '#3a3a3a');
            baseGradient.addColorStop(1, '#222222');
            this.ctx.fillStyle = baseGradient;
            this.ctx.strokeStyle = '#111';
            this.ctx.lineWidth = 1;
            this.roundRect(x, y, w, h, 2.5);
            this.ctx.fill();
            this.ctx.stroke();
            
            // Red cap with a highlight
            const capRadius = Math.min(w, h) * 0.32;
            const capGradient = this.ctx.createRadialGradient(
                centerX - capRadius / 3, centerY - capRadius / 3, 0,
                centerX, centerY, capRadius
            );
            capGradient.addColorStop(0, '#ff8a80');
            capGradient.addColorStop(0.4, '#e53935');
            capGradient.addColorStop(1, '#8e1c17');
            this.ctx.fillStyle = capGradient;
            this.ctx.beginPath();
            this.ctx.arc(centerX, centerY, capRadius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.strokeStyle = '#6d1410';
            this.ctx.stroke();
            
            // Four legs with pads (2 up, 2 down)
            for (let i = 0; i < 2; i++) {
                const px = x + i * holeSpacing;
                this.drawLead(px, y, px, y - 1.5 * S);
                this.drawLead(px, y + h, px, pinY);
                this.drawPinPad(px, y - 1.5 * S);
                this.drawPinPad(px, pinY);
            }
        } else {
            const centerY = y + h / 2;
            
            // Metal slide-switch housing
            const housingGradient = this.ctx.createLinearGradient(0, y, 0, y + h);
            housingGradient.addColorStop(0, '#9aa0a6');
            housingGradient.addColorStop(0.5, '#787f87');
            housingGradient.addColorStop(1, '#5d646b');
            this.ctx.fillStyle = housingGradient;
            this.ctx.strokeStyle = '#4a5057';
            this.ctx.lineWidth = 1;
            this.roundRect(x + w * 0.1, y, w * 0.8, h, 2);
            this.ctx.fill();
            this.ctx.stroke();
            
            // Actuator (shifted when the switch is closed)
            const closed = this.isSwitchClosed(comp.id);
            this.ctx.fillStyle = '#1f1f1f';
            this.roundRect(x + w * 0.4, y - 2 + (closed ? 2 : 0), w * 0.2, h + 4, 1);
            this.ctx.fill();
            if (closed) {
                this.ctx.strokeStyle = '#2ecc71';
                this.ctx.lineWidth = 2;
                this.roundRect(x + w * 0.1 - 2, y - 3, w * 0.8 + 4, h + 6, 3);
                this.ctx.stroke();
            }
            
            if (comp.type === 'SPST') {
                this.drawLead(x, centerY, x + w * 0.1, centerY);
                this.drawLead(x + w * 0.9, centerY, x + w, centerY);
                this.drawPinPad(x, centerY);
                this.drawPinPad(x + w, centerY);
            } else {
                const pinY = y + h + 2 * S;
                for (let i = 0; i < 3; i++) {
                    const px = x + i * holeSpacing;
                    this.drawLead(px, y + h, px, pinY);
                    this.drawPinPad(px, pinY);
                }
            }
        }
        
        this.ctx.fillStyle = this.palette.componentLabel;
        this.ctx.font = `${8}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(comp.id, x + w / 2, y + h + (comp.type === 'SPST' ? 4 : 14));
    }
    
    private renderDisplay(comp: ComponentIR): void {
        const S = BASE_SCALE;
        const x = comp.position.x * S;
        const y = comp.position.y * S;
        const { bottom, top, topOffset } = getICPinCounts(comp.pinCount);
        const holeSpacing = BreadboardGeometry.HOLE_SPACING * S;
        const { width, height, pinLength } = this.getICDimensions(comp.pinCount);
        const w = width * S;
        const h = height * S;
        const pinLengthPx = pinLength * S;
        const firstPinOffset = 1 * S;
        
        if (this.selectedId === comp.id) {
            this.ctx.strokeStyle = this.palette.selection;
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([4, 2]);
            this.roundRect(x - 4, y - pinLengthPx - 4, w + 8, h + pinLengthPx * 2 + 8, 4);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
        
        // Module body
        const bodyGradient = this.ctx.createLinearGradient(0, y, 0, y + h);
        bodyGradient.addColorStop(0, '#2e2e2e');
        bodyGradient.addColorStop(1, '#141414');
        this.ctx.fillStyle = bodyGradient;
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 1;
        this.roundRect(x, y, w, h, 3);
        this.ctx.fill();
        this.ctx.stroke();

        // Display window with a seven-segment digit
        const windowW = w * 0.42;
        const windowH = h * 0.8;
        const wx = x + w / 2 - windowW / 2;
        const wy = y + h / 2 - windowH / 2;
        this.ctx.fillStyle = '#0c0c0c';
        this.ctx.beginPath();
        this.ctx.rect(wx, wy, windowW, windowH);
        this.ctx.fill();

        const t = Math.max(1.1, windowH * 0.12);
        const left = wx + t * 0.7;
        const right = wx + windowW - t * 0.7;
        const topY = wy + t * 0.7;
        const midY = wy + windowH / 2;
        const bottomY = wy + windowH - t * 0.7;

        this.ctx.strokeStyle = '#5a1a1a';
        this.ctx.lineWidth = t;
        this.ctx.lineCap = 'round';
        const segment = (x1: number, y1: number, x2: number, y2: number) => {
            this.ctx.beginPath();
            this.ctx.moveTo(x1, y1);
            this.ctx.lineTo(x2, y2);
            this.ctx.stroke();
        };
        segment(left, topY, right, topY);          // a
        segment(right, topY, right, midY);          // b
        segment(right, midY, right, bottomY);       // c
        segment(left, bottomY, right, bottomY);     // d
        segment(left, midY, left, bottomY);         // e
        segment(left, topY, left, midY);            // f
        segment(left, midY, right, midY);           // g
        // Decimal point
        this.ctx.fillStyle = '#5a1a1a';
        this.ctx.beginPath();
        this.ctx.arc(right + t * 0.9, bottomY, t * 0.55, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Pins with solder pads
        for (let i = 0; i < bottom; i++) {
            const px = x + firstPinOffset + i * holeSpacing;
            this.drawLead(px, y + h, px, y + h + pinLengthPx);
            this.drawPinPad(px, y + h + pinLengthPx);
        }
        for (let i = 0; i < top; i++) {
            const px = x + firstPinOffset + (topOffset + i) * holeSpacing;
            this.drawLead(px, y - pinLengthPx, px, y);
            this.drawPinPad(px, y - pinLengthPx);
        }
        
        this.ctx.fillStyle = this.palette.componentLabel;
        this.ctx.font = `${8}px sans-serif`;
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
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([4, 2]);
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
        
        const buzzerGradient = this.ctx.createRadialGradient(
            centerX - radius * 0.3, centerY - radius * 0.3, radius * 0.1,
            centerX, centerY, radius
        );
        buzzerGradient.addColorStop(0, '#4a4a4a');
        buzzerGradient.addColorStop(0.6, '#242424');
        buzzerGradient.addColorStop(1, '#101010');
        this.ctx.fillStyle = buzzerGradient;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
        
        // Sound opening
        this.ctx.fillStyle = '#050505';
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, radius * 0.6, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.strokeStyle = '#3a3a3a';
        this.ctx.stroke();

        // Simulation: sound arcs while the buzzer is driven
        if (this.simResult?.activeBuzzers.has(comp.id)) {
            this.ctx.strokeStyle = '#2ecc71';
            this.ctx.lineWidth = 1.5;
            for (let r = 1; r <= 3; r++) {
                this.ctx.beginPath();
                this.ctx.arc(centerX, centerY, radius + r * 4, -Math.PI / 3, Math.PI / 3);
                this.ctx.stroke();
                this.ctx.beginPath();
                this.ctx.arc(centerX, centerY, radius + r * 4, (Math.PI * 2) / 3, (Math.PI * 4) / 3);
                this.ctx.stroke();
            }
        }
        
        if (comp.type !== 'PASSIVE_BUZZER') {
            this.ctx.fillStyle = '#c44';
            this.ctx.font = `bold ${8}px sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('+', centerX, centerY);
        }
        
        this.drawLead(pin1X, y + h, pin1X, pinY);
        this.drawLead(pin2X, y + h, pin2X, pinY);
        this.drawPinPad(pin1X, pinY);
        this.drawPinPad(pin2X, pinY);
        
        this.ctx.fillStyle = this.palette.componentLabel;
        this.ctx.font = `${8}px sans-serif`;
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
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([4, 2]);
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
            this.ctx.lineWidth = 1;
            this.ctx.stroke();
            
            this.ctx.fillStyle = '#ccc';
            this.roundRect(x + w * 0.3, y - 2, w * 0.4, 4, 1);
            this.ctx.fill();
            
            for (let i = 0; i < 3; i++) {
                const px = x + i * holeSpacing;
                this.drawLead(px, y + h, px, pinY);
                this.drawPinPad(px, pinY);
            }
            
            this.ctx.fillStyle = this.palette.componentLabel;
            this.ctx.font = `${7}px sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('SERVO', x + w / 2, y + h / 2);
        } else {
            const centerY = y + h / 2;
            
            // Metal can with a gradient
            const canGradient = this.ctx.createLinearGradient(0, y, 0, y + h);
            canGradient.addColorStop(0, '#c9cdd2');
            canGradient.addColorStop(0.5, '#9aa0a6');
            canGradient.addColorStop(1, '#6f757c');
            this.ctx.fillStyle = canGradient;
            this.ctx.beginPath();
            this.ctx.ellipse(x + w / 2, centerY, w * 0.4, h / 2, 0, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.strokeStyle = '#5d646b';
            this.ctx.lineWidth = 1;
            this.ctx.stroke();
            
            // Shaft
            this.ctx.fillStyle = '#d7dade';
            this.ctx.fillRect(x + w - 6, centerY - 1, 6, 2);
            
            this.drawLead(x, centerY, x + w * 0.2, centerY);
            this.drawLead(x + w * 0.8, centerY, x + w, centerY);
            this.drawPinPad(x, centerY);
            this.drawPinPad(x + w, centerY);
        }
        
        this.ctx.fillStyle = this.palette.componentLabel;
        this.ctx.font = `${8}px sans-serif`;
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
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([4, 2]);
            this.roundRect(x - 4, y - 4, w + 8, h + 8, 4);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
        
        if (comp.type === 'REGULATOR') {
            const pinY = y + h + 2 * S;
            const centerX = x + w / 2;
            
            // TO-220 metal tab
            this.ctx.fillStyle = '#b9bec4';
            this.ctx.strokeStyle = '#8a9099';
            this.ctx.lineWidth = 1;
            this.roundRect(x + w * 0.2, y - h * 0.16, w * 0.6, h * 0.2, 1);
            this.ctx.fill();
            this.ctx.stroke();
            
            // Body
            const bodyGradient = this.ctx.createLinearGradient(0, y, 0, y + h);
            bodyGradient.addColorStop(0, '#3a3a3a');
            bodyGradient.addColorStop(1, '#101010');
            this.ctx.fillStyle = bodyGradient;
            this.roundRect(x, y, w, h, 2);
            this.ctx.fill();
            this.ctx.strokeStyle = '#000';
            this.ctx.stroke();
            
            // White marking
            this.ctx.fillStyle = '#e8e8e8';
            this.ctx.font = `${6}px sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(comp.value ?? 'REG', centerX, y + h * 0.55);
            
            for (let i = 0; i < 3; i++) {
                const px = x + i * holeSpacing;
                this.drawLead(px, y + h, px, pinY);
                this.drawPinPad(px, pinY);
            }
        } else {
            const centerX = x + w / 2;
            const pinY = y + h + 2 * S;
            const pin1X = centerX - holeSpacing / 2;
            const pin2X = centerX + holeSpacing / 2;
            
            // 9V battery block
            const bodyGradient = this.ctx.createLinearGradient(0, y, 0, y + h);
            bodyGradient.addColorStop(0, '#46569c');
            bodyGradient.addColorStop(0.5, '#33406f');
            bodyGradient.addColorStop(1, '#1f2848');
            this.ctx.fillStyle = bodyGradient;
            this.ctx.strokeStyle = '#161d36';
            this.ctx.lineWidth = 1;
            this.roundRect(x, y, w, h, 2.5);
            this.ctx.fill();
            this.ctx.stroke();
            
            // Silver top with the two snap terminals
            this.ctx.fillStyle = '#c9cdd2';
            this.roundRect(x, y, w, h * 0.18, 2);
            this.ctx.fill();
            this.ctx.fillStyle = '#8a9099';
            this.roundRect(centerX - holeSpacing * 0.7, y - 1.5, holeSpacing * 0.5, 2.5, 1);
            this.ctx.fill();
            this.roundRect(centerX + holeSpacing * 0.2, y - 1.5, holeSpacing * 0.5, 2.5, 1);
            this.ctx.fill();
            
            // Polarity marks and value
            this.ctx.fillStyle = '#ff6b6b';
            this.ctx.font = `bold ${8}px sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('+', centerX - holeSpacing * 0.45, y + h * 0.3);
            this.ctx.fillStyle = '#9bb3ff';
            this.ctx.fillText('−', centerX + holeSpacing * 0.45, y + h * 0.3);
            this.ctx.fillStyle = '#e8e8e8';
            this.ctx.font = `bold ${9}px sans-serif`;
            this.ctx.fillText(comp.value ?? '9V', centerX, y + h * 0.62);
            
            this.drawLead(pin1X, y + h, pin1X, pinY);
            this.drawLead(pin2X, y + h, pin2X, pinY);
            this.drawPinPad(pin1X, pinY);
            this.drawPinPad(pin2X, pinY);
        }
        
        this.ctx.fillStyle = this.palette.componentLabel;
        this.ctx.font = `${8}px sans-serif`;
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
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([4, 2]);
            this.roundRect(x - 4, y - 4, w + 8, h + 8, 4);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
        
        const centerY = y + h / 2;
        
        // HC-49 metal can with a gradient
        const canGradient = this.ctx.createLinearGradient(0, y, 0, y + h);
        canGradient.addColorStop(0, '#d7dade');
        canGradient.addColorStop(0.5, '#aab0b6');
        canGradient.addColorStop(1, '#7c838a');
        this.ctx.fillStyle = canGradient;
        this.ctx.strokeStyle = '#5d646b';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.ellipse(x + w / 2, centerY, w * 0.4, h / 2, 0, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        
        // Can crimp lines
        this.ctx.strokeStyle = '#8a9099';
        this.ctx.lineWidth = 0.5;
        this.ctx.beginPath();
        this.ctx.moveTo(x + w * 0.3, y + h * 0.12);
        this.ctx.lineTo(x + w * 0.3, y + h * 0.88);
        this.ctx.moveTo(x + w * 0.7, y + h * 0.12);
        this.ctx.lineTo(x + w * 0.7, y + h * 0.88);
        this.ctx.stroke();
        
        this.drawLead(x, centerY, x + w * 0.2, centerY);
        this.drawLead(x + w * 0.8, centerY, x + w, centerY);
        this.drawPinPad(x, centerY);
        this.drawPinPad(x + w, centerY);
        
        this.ctx.fillStyle = this.palette.componentLabel;
        this.ctx.font = `${8}px sans-serif`;
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
        const points = wirePoints(wire.from, wire.waypoints, wire.to).map(p => ({
            x: p.x * S,
            y: p.y * S,
        }));
        const from = points[0];
        const to = points[points.length - 1];
        
        // Check if this wire is selected
        const isSelected = this.selectedId === `wire_${wireIndex}`;
        const cornerRadiusPx = 6;

        // Selection highlight (draw thicker line behind)
        if (isSelected) {
            this.ctx.strokeStyle = this.palette.selection;
            this.ctx.lineWidth = 7;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.setLineDash([]);
            this.traceWirePath(points, cornerRadiusPx);
            this.ctx.stroke();
        }

        // Simulation overlay: colour wires by net value when active
        let strokeColor = wire.color;
        if (this.simResult && this.simNetlist && wireIndex !== undefined) {
            const netId = this.simNetlist.wireNet[wireIndex];
            const value: LogicValue | undefined = netId !== undefined ? this.simResult.netValues[netId] : undefined;
            if (value === 1 || value === 0 || value === 'X') {
                strokeColor = SIM_VALUE_COLORS[String(value)] ?? wire.color;
            }
        }
        this.ctx.strokeStyle = strokeColor;
        this.ctx.lineWidth = 4;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.traceWirePath(points, cornerRadiusPx);
        this.ctx.stroke();

        // Net highlight halo
        const netId = wireIndex !== undefined && this.netlist ? this.netlist.wireNet[wireIndex] : undefined;
        if (netId !== undefined && netId === this.highlightedNetId()) {
            this.ctx.strokeStyle = 'rgba(88, 166, 255, 0.35)';
            this.ctx.lineWidth = 10;
            this.traceWirePath(points, cornerRadiusPx);
            this.ctx.stroke();
        }

        // Ring terminals, the breadboard-editor convention: a light centre
        // over the hole with a ring in the wire colour.
        const ringRadius = 3.4;
        for (const terminal of [from, to]) {
            this.ctx.beginPath();
            this.ctx.arc(terminal.x, terminal.y, ringRadius, 0, Math.PI * 2);
            this.ctx.fillStyle = '#f5f5f5';
            this.ctx.fill();
            this.ctx.strokeStyle = strokeColor;
            this.ctx.lineWidth = 2.2;
            this.ctx.stroke();
        }
        
        // Selection indicators on terminals
        if (isSelected) {
            this.ctx.strokeStyle = this.palette.selection;
            this.ctx.lineWidth = 2;
            for (const terminal of [from, to]) {
                this.ctx.beginPath();
                this.ctx.arc(terminal.x, terminal.y, ringRadius + 2, 0, Math.PI * 2);
                this.ctx.stroke();
            }
        }
    }

    /**
     * Trace an orthogonal polyline with rounded corners.
     */
    private traceWirePath(points: Position[], requestedRadius: number): void {
        this.ctx.beginPath();
        if (points.length === 0) return;
        this.ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length - 1; i++) {
            const radius = cornerRadius(points[i - 1], points[i], points[i + 1], requestedRadius);
            if (radius <= 0.01) {
                this.ctx.lineTo(points[i].x, points[i].y);
            } else {
                this.ctx.arcTo(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y, radius);
            }
        }
        this.ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
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
