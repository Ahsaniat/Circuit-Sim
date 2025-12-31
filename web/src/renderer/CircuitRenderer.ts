import { CircuitIR, ComponentIR, BoardIR, Wire } from '../types';

const SCALE = 4;
const PADDING = 20;
const HOLE_SPACING = 2.54 * SCALE;

interface BoardGeometry {
    x: number;
    y: number;
    width: number;
    height: number;
    holesStartX: number;
    holesStartY: number;
    topHalfY: number;
    bottomHalfY: number;
    channelY: number;
    numCols: number;
}

export class CircuitRenderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private circuitIR: CircuitIR | null = null;
    private boardGeometry: Map<string, BoardGeometry> = new Map();

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to get 2D context');
        this.ctx = ctx;
        this.resize();
        window.addEventListener('resize', () => this.resize());
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
        
        if (this.circuitIR) {
            this.render(this.circuitIR);
        }
    }

    render(ir: CircuitIR): void {
        this.circuitIR = ir;
        this.boardGeometry.clear();
        this.clear();
        
        this.ctx.save();
        this.ctx.translate(PADDING, PADDING);
        
        for (const board of ir.boards) {
            this.renderBoard(board);
        }
        
        for (const comp of ir.components) {
            this.renderComponent(comp);
        }
        
        for (const wire of ir.wires) {
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
        const x = board.position.x * SCALE;
        const y = board.position.y * SCALE;
        
        const numCols = 63;
        const numRowsPerHalf = 5;
        const railHeight = 24;
        const channelHeight = 14;
        const holeMargin = 18;
        // const railHoleRows = 2;
        
        const w = holeMargin * 2 + numCols * HOLE_SPACING;
        const h = railHeight + holeMargin + numRowsPerHalf * HOLE_SPACING + channelHeight + 
                  numRowsPerHalf * HOLE_SPACING + holeMargin + railHeight;

        const geo: BoardGeometry = {
            x, y, width: w, height: h,
            holesStartX: x + holeMargin,
            holesStartY: y + railHeight + holeMargin,
            topHalfY: y + railHeight + holeMargin,
            bottomHalfY: y + railHeight + holeMargin + numRowsPerHalf * HOLE_SPACING + channelHeight,
            channelY: y + railHeight + holeMargin + numRowsPerHalf * HOLE_SPACING,
            numCols
        };
        this.boardGeometry.set(board.id, geo);

        // Board background
        this.ctx.fillStyle = '#e8e4df';
        this.ctx.strokeStyle = '#bbb';
        this.ctx.lineWidth = 1;
        this.roundRect(x, y, w, h, 6);
        this.ctx.fill();
        this.ctx.stroke();

        // Top power rail area
        const topRailY = y + 4;
        this.ctx.fillStyle = '#f0ebe6';
        this.ctx.fillRect(x + 6, topRailY, w - 12, railHeight - 4);
        
        // Top rail: + (red) and - (blue) lines
        this.ctx.strokeStyle = '#c44';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(x + 12, topRailY + 6);
        this.ctx.lineTo(x + w - 12, topRailY + 6);
        this.ctx.stroke();
        
        this.ctx.strokeStyle = '#44c';
        this.ctx.beginPath();
        this.ctx.moveTo(x + 12, topRailY + railHeight - 10);
        this.ctx.lineTo(x + w - 12, topRailY + railHeight - 10);
        this.ctx.stroke();
        
        // Top rail holes (+ row and - row)
        this.ctx.fillStyle = '#222';
        for (let col = 0; col < numCols; col++) {
            const hx = geo.holesStartX + col * HOLE_SPACING;
            // + row
            this.ctx.beginPath();
            this.ctx.arc(hx, topRailY + 6, 1.5, 0, Math.PI * 2);
            this.ctx.fill();
            // - row
            this.ctx.beginPath();
            this.ctx.arc(hx, topRailY + railHeight - 10, 1.5, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        // + and - labels for top rail
        this.ctx.fillStyle = '#c44';
        this.ctx.font = 'bold 10px sans-serif';
        this.ctx.textAlign = 'left';
        this.ctx.fillText('+', x + 4, topRailY + 9);
        this.ctx.fillStyle = '#44c';
        this.ctx.fillText('-', x + 4, topRailY + railHeight - 7);

        // Bottom power rail area
        const bottomRailY = y + h - railHeight;
        this.ctx.fillStyle = '#f0ebe6';
        this.ctx.fillRect(x + 6, bottomRailY, w - 12, railHeight - 4);
        
        // Bottom rail: + and - lines
        this.ctx.strokeStyle = '#c44';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(x + 12, bottomRailY + 6);
        this.ctx.lineTo(x + w - 12, bottomRailY + 6);
        this.ctx.stroke();
        
        this.ctx.strokeStyle = '#44c';
        this.ctx.beginPath();
        this.ctx.moveTo(x + 12, bottomRailY + railHeight - 10);
        this.ctx.lineTo(x + w - 12, bottomRailY + railHeight - 10);
        this.ctx.stroke();
        
        // Bottom rail holes
        this.ctx.fillStyle = '#222';
        for (let col = 0; col < numCols; col++) {
            const hx = geo.holesStartX + col * HOLE_SPACING;
            this.ctx.beginPath();
            this.ctx.arc(hx, bottomRailY + 6, 1.5, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.beginPath();
            this.ctx.arc(hx, bottomRailY + railHeight - 10, 1.5, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        // + and - labels for bottom rail
        this.ctx.fillStyle = '#c44';
        this.ctx.font = 'bold 10px sans-serif';
        this.ctx.fillText('+', x + 4, bottomRailY + 9);
        this.ctx.fillStyle = '#44c';
        this.ctx.fillText('-', x + 4, bottomRailY + railHeight - 7);

        // Center channel
        this.ctx.fillStyle = '#c8c4bf';
        this.ctx.fillRect(x + 8, geo.channelY, w - 16, channelHeight);

        // Draw main holes - Top half (rows A-E)
        this.ctx.fillStyle = '#222';
        for (let row = 0; row < numRowsPerHalf; row++) {
            for (let col = 0; col < numCols; col++) {
                const hx = geo.holesStartX + col * HOLE_SPACING;
                const hy = geo.topHalfY + row * HOLE_SPACING;
                this.ctx.beginPath();
                this.ctx.arc(hx, hy, 1.5, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }
        
        // Bottom half (rows F-J)
        for (let row = 0; row < numRowsPerHalf; row++) {
            for (let col = 0; col < numCols; col++) {
                const hx = geo.holesStartX + col * HOLE_SPACING;
                const hy = geo.bottomHalfY + row * HOLE_SPACING;
                this.ctx.beginPath();
                this.ctx.arc(hx, hy, 1.5, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }

        // Column numbers (every 5)
        this.ctx.fillStyle = '#888';
        this.ctx.font = '8px sans-serif';
        this.ctx.textAlign = 'center';
        for (let col = 0; col < numCols; col += 5) {
            const hx = geo.holesStartX + col * HOLE_SPACING;
            this.ctx.fillText(String(col + 1), hx, y + h + 10);
        }

        // Row labels
        this.ctx.textAlign = 'right';
        const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
        for (let row = 0; row < 5; row++) {
            const hy = geo.topHalfY + row * HOLE_SPACING;
            this.ctx.fillText(rowLabels[row], x - 4, hy + 3);
        }
        for (let row = 0; row < 5; row++) {
            const hy = geo.bottomHalfY + row * HOLE_SPACING;
            this.ctx.fillText(rowLabels[5 + row], x - 4, hy + 3);
        }
    }

    private renderComponent(comp: ComponentIR): void {
        const x = comp.position.x * SCALE;
        const y = comp.position.y * SCALE;
        
        // IC is horizontal: width is along pins, height is IC body
        const pinsPerSide = comp.pinCount / 2;
        const icWidth = (pinsPerSide - 1) * HOLE_SPACING + 8;
        const icHeight = 28; // 7 base units * 4
        const pinLength = 6; // 1.5 base units * 4

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

        // Pins - top row (pins 1 to N/2, left to right)
        // Pin tip should reach exactly to the hole (y - pinLength)
        this.ctx.fillStyle = '#888';
        for (let i = 0; i < pinsPerSide; i++) {
            const px = x + 4 + i * HOLE_SPACING;
            // Draw pin from body top going up to hole
            this.ctx.fillRect(px - 1.5, y - pinLength, 3, pinLength);
            // Draw small circle at pin tip (hole connection point)
            this.ctx.beginPath();
            this.ctx.arc(px, y - pinLength, 2, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        // Pins - bottom row (pins N to N/2+1, left to right)
        for (let i = 0; i < pinsPerSide; i++) {
            const px = x + 4 + i * HOLE_SPACING;
            // Draw pin from body bottom going down to hole
            this.ctx.fillRect(px - 1.5, y + icHeight, 3, pinLength);
            // Draw small circle at pin tip
            this.ctx.beginPath();
            this.ctx.arc(px, y + icHeight + pinLength, 2, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // IC label
        this.ctx.fillStyle = '#999';
        this.ctx.font = 'bold 9px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(comp.type, x + icWidth / 2, y + icHeight / 2);
        
        // Component ID below
        this.ctx.fillStyle = '#666';
        this.ctx.font = '10px sans-serif';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(comp.id, x + icWidth / 2, y + icHeight + pinLength + 4);
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

        if (wire.waypoints && wire.waypoints.length > 0) {
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
