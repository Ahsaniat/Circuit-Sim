import { CircuitIR, ComponentIR, BoardIR, Wire, Position } from '../types';

const SCALE = 4;
const PADDING = 20;
const HOLE_SPACING = 2.54 * SCALE;

interface BoardGeometry {
    x: number;
    y: number;
    width: number;
    height: number;
    holesStartX: number;
    topHalfY: number;
    bottomHalfY: number;
    channelY: number;
    numCols: number;
}

interface DraggableElement {
    id: string;
    type: 'component' | 'board';
    x: number;
    y: number;
    width: number;
    height: number;
}

export class CircuitRenderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private circuitIR: CircuitIR | null = null;
    private boardGeometry: Map<string, BoardGeometry> = new Map();
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
        return { x: e.clientX - rect.left - PADDING, y: e.clientY - rect.top - PADDING };
    }

    private findElementAt(pos: Position): DraggableElement | null {
        for (let i = this.draggables.length - 1; i >= 0; i--) {
            const el = this.draggables[i];
            if (pos.x >= el.x && pos.x <= el.x + el.width && pos.y >= el.y && pos.y <= el.y + el.height) {
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
            const newX = (pos.x - this.dragOffset.x) / SCALE;
            const newY = (pos.y - this.dragOffset.y) / SCALE;
            const comp = this.circuitIR.components.find(c => c.id === this.selectedId);
            if (comp) comp.position = { x: newX, y: newY };
            const draggable = this.draggables.find(d => d.id === this.selectedId);
            if (draggable) { draggable.x = newX * SCALE; draggable.y = newY * SCALE; }
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
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
        if (this.circuitIR) this.redraw();
    }

    render(ir: CircuitIR): void {
        this.circuitIR = ir;
        this.boardGeometry.clear();
        this.draggables = [];
        this.selectedId = null;
        this.redraw();
    }

    private redraw(): void {
        if (!this.circuitIR) return;
        this.clear();
        this.ctx.save();
        this.ctx.translate(PADDING, PADDING);
        for (const board of this.circuitIR.boards) this.renderBoard(board);
        for (const comp of this.circuitIR.components) this.renderComponent(comp);
        for (const wire of this.circuitIR.wires) this.renderWire(wire);
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
        const x = board.position.x * SCALE;
        const y = board.position.y * SCALE;
        const numCols = 63, numRowsPerHalf = 5, railHeight = 24, channelHeight = 14, holeMargin = 18;
        const w = holeMargin * 2 + numCols * HOLE_SPACING;
        const h = railHeight + holeMargin + numRowsPerHalf * HOLE_SPACING + channelHeight + numRowsPerHalf * HOLE_SPACING + holeMargin + railHeight;
        const geo: BoardGeometry = {
            x, y, width: w, height: h,
            holesStartX: x + holeMargin,
            topHalfY: y + railHeight + holeMargin,
            bottomHalfY: y + railHeight + holeMargin + numRowsPerHalf * HOLE_SPACING + channelHeight,
            channelY: y + railHeight + holeMargin + numRowsPerHalf * HOLE_SPACING,
            numCols
        };
        this.boardGeometry.set(board.id, geo);

        this.ctx.fillStyle = '#e8e4df';
        this.ctx.strokeStyle = '#bbb';
        this.ctx.lineWidth = 1;
        this.roundRect(x, y, w, h, 6);
        this.ctx.fill();
        this.ctx.stroke();

        // Top rail
        const topRailY = y + 4;
        this.ctx.fillStyle = '#f0ebe6';
        this.ctx.fillRect(x + 6, topRailY, w - 12, railHeight - 4);
        this.ctx.fillStyle = '#c44';
        this.ctx.fillRect(x + 8, topRailY + 2, 4, 8);
        this.ctx.fillStyle = '#44c';
        this.ctx.fillRect(x + 8, topRailY + railHeight - 14, 4, 8);
        this.ctx.fillStyle = '#222';
        for (let col = 0; col < numCols; col++) {
            const hx = geo.holesStartX + col * HOLE_SPACING;
            this.ctx.beginPath(); this.ctx.arc(hx, topRailY + 6, 1.5, 0, Math.PI * 2); this.ctx.fill();
            this.ctx.beginPath(); this.ctx.arc(hx, topRailY + railHeight - 10, 1.5, 0, Math.PI * 2); this.ctx.fill();
        }

        // Bottom rail
        const bottomRailY = y + h - railHeight;
        this.ctx.fillStyle = '#f0ebe6';
        this.ctx.fillRect(x + 6, bottomRailY, w - 12, railHeight - 4);
        this.ctx.fillStyle = '#c44';
        this.ctx.fillRect(x + 8, bottomRailY + 2, 4, 8);
        this.ctx.fillStyle = '#44c';
        this.ctx.fillRect(x + 8, bottomRailY + railHeight - 14, 4, 8);
        this.ctx.fillStyle = '#222';
        for (let col = 0; col < numCols; col++) {
            const hx = geo.holesStartX + col * HOLE_SPACING;
            this.ctx.beginPath(); this.ctx.arc(hx, bottomRailY + 6, 1.5, 0, Math.PI * 2); this.ctx.fill();
            this.ctx.beginPath(); this.ctx.arc(hx, bottomRailY + railHeight - 10, 1.5, 0, Math.PI * 2); this.ctx.fill();
        }

        // Channel
        this.ctx.fillStyle = '#c8c4bf';
        this.ctx.fillRect(x + 8, geo.channelY, w - 16, channelHeight);

        // Main holes
        this.ctx.fillStyle = '#222';
        for (let row = 0; row < numRowsPerHalf; row++) {
            for (let col = 0; col < numCols; col++) {
                const hx = geo.holesStartX + col * HOLE_SPACING;
                this.ctx.beginPath(); this.ctx.arc(hx, geo.topHalfY + row * HOLE_SPACING, 1.5, 0, Math.PI * 2); this.ctx.fill();
                this.ctx.beginPath(); this.ctx.arc(hx, geo.bottomHalfY + row * HOLE_SPACING, 1.5, 0, Math.PI * 2); this.ctx.fill();
            }
        }

        // Labels
        this.ctx.fillStyle = '#888';
        this.ctx.font = '8px sans-serif';
        this.ctx.textAlign = 'center';
        for (let col = 0; col < numCols; col += 5) {
            this.ctx.fillText(String(col + 1), geo.holesStartX + col * HOLE_SPACING, y + h + 10);
        }
        this.ctx.textAlign = 'right';
        ['A','B','C','D','E'].forEach((l, i) => this.ctx.fillText(l, x - 4, geo.topHalfY + i * HOLE_SPACING + 3));
        ['F','G','H','I','J'].forEach((l, i) => this.ctx.fillText(l, x - 4, geo.bottomHalfY + i * HOLE_SPACING + 3));
    }

    private renderComponent(comp: ComponentIR): void {
        const x = comp.position.x * SCALE, y = comp.position.y * SCALE;
        const pinsPerSide = comp.pinCount / 2;
        const icWidth = (pinsPerSide - 1) * HOLE_SPACING + 8, icHeight = 28, pinLength = 6;

        if (!this.draggables.find(d => d.id === comp.id)) {
            this.draggables.push({ id: comp.id, type: 'component', x, y, width: icWidth, height: icHeight });
        }

        if (this.selectedId === comp.id) {
            this.ctx.strokeStyle = '#0066cc';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([4, 2]);
            this.roundRect(x - 4, y - pinLength - 4, icWidth + 8, icHeight + pinLength * 2 + 8, 4);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }

        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 1;
        this.roundRect(x, y, icWidth, icHeight, 3);
        this.ctx.fill();
        this.ctx.stroke();

        this.ctx.fillStyle = '#333';
        this.ctx.beginPath();
        this.ctx.arc(x, y + icHeight / 2, 4, -Math.PI / 2, Math.PI / 2);
        this.ctx.fill();

        this.ctx.fillStyle = '#555';
        this.ctx.beginPath();
        this.ctx.arc(x + 6, y + 6, 2, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.fillStyle = '#888';
        for (let i = 0; i < pinsPerSide; i++) {
            const px = x + 4 + i * HOLE_SPACING;
            this.ctx.fillRect(px - 1.5, y - pinLength, 3, pinLength);
            this.ctx.beginPath(); this.ctx.arc(px, y - pinLength, 2, 0, Math.PI * 2); this.ctx.fill();
            this.ctx.fillRect(px - 1.5, y + icHeight, 3, pinLength);
            this.ctx.beginPath(); this.ctx.arc(px, y + icHeight + pinLength, 2, 0, Math.PI * 2); this.ctx.fill();
        }

        this.ctx.fillStyle = '#999';
        this.ctx.font = 'bold 9px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(comp.type, x + icWidth / 2, y + icHeight / 2);
        this.ctx.fillStyle = '#666';
        this.ctx.font = '10px sans-serif';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(comp.id, x + icWidth / 2, y + icHeight + pinLength + 4);
    }

    private renderWire(wire: Wire): void {
        const fromX = wire.from.x * SCALE, fromY = wire.from.y * SCALE;
        const toX = wire.to.x * SCALE, toY = wire.to.y * SCALE;
        this.ctx.strokeStyle = wire.color;
        this.ctx.lineWidth = 2;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.beginPath();
        this.ctx.moveTo(fromX, fromY);
        if (wire.waypoints) for (const wp of wire.waypoints) this.ctx.lineTo(wp.x * SCALE, wp.y * SCALE);
        this.ctx.lineTo(toX, toY);
        this.ctx.stroke();
        this.ctx.fillStyle = wire.color;
        this.ctx.beginPath(); this.ctx.arc(fromX, fromY, 3, 0, Math.PI * 2); this.ctx.fill();
        this.ctx.beginPath(); this.ctx.arc(toX, toY, 3, 0, Math.PI * 2); this.ctx.fill();
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
