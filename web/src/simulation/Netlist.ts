import { CircuitIR } from '../types';
import { BreadboardGeometry, HolePosition } from '../geometry/BreadboardGeometry';
import { componentPinHole } from '../geometry/PinGeometry';

/**
 * Netlist extraction: converts physical breadboard placement into electrical
 * nodes.
 *
 * Connectivity rules modelled on a real breadboard:
 *  - the five holes of a column within a half (A–E or F–J) are one node
 *  - each power rail is a bus across all 63 columns
 *  - component pins are tied to the hole they occupy
 *  - wire endpoints are tied to the hole they sit on
 *  - a closed switch shorts its pins (open switches are ignored)
 */

export interface Net {
    id: number;
    /** Net is driven high/low by a rail or battery terminal. */
    power?: 0 | 1;
    /** A net that would be driven both high and low. */
    conflict?: boolean;
    pins: string[];   // "R1:1"
    holes: string[];  // "B1:12:C"
}

export interface Netlist {
    nets: Net[];
    pinNet: Map<string, number>;
    wireNet: number[];
}

class UnionFind {
    private parent = new Map<string, string>();

    find(x: string): string {
        if (!this.parent.has(x)) {
            this.parent.set(x, x);
            return x;
        }
        let root = x;
        while (this.parent.get(root) !== root) {
            root = this.parent.get(root)!;
        }
        // Path compression
        let current = x;
        while (this.parent.get(current) !== root) {
            const next = this.parent.get(current)!;
            this.parent.set(current, root);
            current = next;
        }
        return root;
    }

    union(a: string, b: string): void {
        const ra = this.find(a);
        const rb = this.find(b);
        if (ra !== rb) {
            this.parent.set(ra, rb);
        }
    }
}

function pinKey(componentId: string, pinNumber: number): string {
    return `${componentId}:${pinNumber}`;
}

/**
 * Hole occupied by a component pin, or null when the pin is off-board.
 */
/** Re-exported for tests; the implementation lives in geometry/PinGeometry. */
export const pinHole = componentPinHole;

function wireEndpointHole(
    point: { x: number; y: number },
    geo: BreadboardGeometry
): HolePosition | null {
    const col = geo.getColumnAtX(point.x);
    const row = geo.getRowAtY(point.y);
    if (col <= 0 || !row) return null;
    return geo.getHolePosition(col, row);
}

export function extractNetlist(
    ir: CircuitIR,
    geometries: Map<string, BreadboardGeometry>,
    closedSwitches: Set<string> = new Set()
): Netlist {
    const uf = new UnionFind();
    const holeKey = (boardId: string, hole: HolePosition) => `${boardId}:${hole.col}:${hole.row}`;
    const defaultBoardId = ir.boards[0]?.id;

    // Breadboard wiring: columns within a half, rails across columns.
    for (const board of ir.boards) {
        const geo = geometries.get(board.id);
        if (!geo) continue;
        for (let col = 1; col <= BreadboardGeometry.NUM_COLS; col++) {
            const top = geo.getHolePosition(col, 'A');
            const bottom = geo.getHolePosition(col, 'F');
            for (const row of BreadboardGeometry.TOP_ROWS) {
                uf.union(holeKey(board.id, top), holeKey(board.id, geo.getHolePosition(col, row)));
            }
            for (const row of BreadboardGeometry.BOTTOM_ROWS) {
                uf.union(holeKey(board.id, bottom), holeKey(board.id, geo.getHolePosition(col, row)));
            }
        }
        for (const rail of BreadboardGeometry.RAIL_ROWS) {
            const first = geo.getHolePosition(1, rail);
            for (let col = 2; col <= BreadboardGeometry.NUM_COLS; col++) {
                uf.union(holeKey(board.id, first), holeKey(board.id, geo.getHolePosition(col, rail)));
            }
        }
    }

    // Component pins tie into their holes.
    const pinHoles = new Map<string, HolePosition | null>();
    for (const comp of ir.components) {
        const boardId = comp.boardId ?? defaultBoardId;
        const geo = boardId ? geometries.get(boardId) : undefined;
        for (let pin = 1; pin <= comp.pinCount; pin++) {
            const key = pinKey(comp.id, pin);
            const hole = geo ? pinHole(comp, pin, geo) : null;
            pinHoles.set(key, hole);
            if (hole && boardId) {
                uf.union(`pin:${key}`, holeKey(boardId, hole));
            }
        }
    }

    // Wires tie their endpoints to the holes they touch. Each endpoint is
    // resolved against the board that owns the referenced component, so a
    // jumper between two boards connects the correct holes on each side.
    const componentById = new Map(ir.components.map(comp => [comp.id, comp]));
    const boardIdForSymbol = (id: string): string | undefined => {
        const comp = componentById.get(id);
        if (comp) return comp.boardId ?? defaultBoardId;
        if (ir.boards.some(board => board.id === id)) return id;
        return defaultBoardId;
    };
    const endpointNodes: Array<{ from: string; to: string; fromHole?: string; toHole?: string }> = [];

    ir.wires.forEach((wire, index) => {
        const fromBoard = boardIdForSymbol(wire.from.component);
        const toBoard = boardIdForSymbol(wire.to.component);
        const fromGeo = fromBoard ? geometries.get(fromBoard) : undefined;
        const toGeo = toBoard ? geometries.get(toBoard) : undefined;
        const fromHole = fromGeo ? wireEndpointHole(wire.from, fromGeo) : null;
        const toHole = toGeo ? wireEndpointHole(wire.to, toGeo) : null;
        const fromNode = fromHole && fromBoard ? holeKey(fromBoard, fromHole) : `wire:${index}:from`;
        const toNode = toHole && toBoard ? holeKey(toBoard, toHole) : `wire:${index}:to`;
        endpointNodes.push({
            from: fromNode,
            to: toNode,
            fromHole: fromHole && fromBoard ? holeKey(fromBoard, fromHole) : undefined,
            toHole: toHole && toBoard ? holeKey(toBoard, toHole) : undefined,
        });
        uf.union(fromNode, toNode);
    });

    // Switch state. Tactile push buttons have two internally tied pairs
    // (1-3 and 2-4); pressing ties the pairs together. Other switches short
    // their first two pins when closed.
    for (const comp of ir.components) {
        if (comp.category !== 'switch') continue;
        const closed = closedSwitches.has(comp.id);
        const pin = (n: number) => `pin:${pinKey(comp.id, n)}`;

        if (comp.type === 'PUSHBUTTON') {
            if (comp.pinCount >= 4) {
                uf.union(pin(1), pin(3));
                uf.union(pin(2), pin(4));
                if (closed) uf.union(pin(1), pin(2));
            } else if (closed) {
                uf.union(pin(1), pin(2));
            }
        } else if (closed) {
            uf.union(pin(1), pin(2));
        }
    }

    // Series passives (resistors, inductors) conduct logic levels, so their
    // pins share a net in the digital abstraction.
    for (const comp of ir.components) {
        if (comp.type === 'RES' || comp.type === 'IND') {
            uf.union(`pin:${pinKey(comp.id, 1)}`, `pin:${pinKey(comp.id, 2)}`);
        }
    }

    // Group nodes into nets.
    const rootToNet = new Map<string, number>();
    const nets: Net[] = [];
    const netFor = (node: string): Net => {
        const root = uf.find(node);
        let id = rootToNet.get(root);
        if (id === undefined) {
            id = nets.length;
            rootToNet.set(root, id);
            nets.push({ id, pins: [], holes: [] });
        }
        return nets[id];
    };

    for (const board of ir.boards) {
        const geo = geometries.get(board.id);
        if (!geo) continue;
        for (const rail of BreadboardGeometry.RAIL_ROWS) {
            const net = netFor(holeKey(board.id, geo.getHolePosition(1, rail)));
            const power = rail.includes('+') ? 1 : 0;
            if (net.power !== undefined && net.power !== power) {
                net.conflict = true;
            }
            net.power = power;
            net.holes.push(`${board.id}:rail:${rail}`);
        }
    }

    // Battery terminals drive their nets (+ pin high, - pin low).
    for (const comp of ir.components) {
        if (comp.type !== 'BATTERY') continue;
        const plus = netFor(`pin:${pinKey(comp.id, 1)}`);
        if (plus.power !== undefined && plus.power !== 1) plus.conflict = true;
        plus.power = 1;
        const minus = netFor(`pin:${pinKey(comp.id, 2)}`);
        if (minus.power !== undefined && minus.power !== 0) minus.conflict = true;
        minus.power = 0;
    }

    for (const comp of ir.components) {
        for (let pin = 1; pin <= comp.pinCount; pin++) {
            const key = pinKey(comp.id, pin);
            const net = netFor(`pin:${key}`);
            net.pins.push(key);
            const hole = pinHoles.get(key);
            if (hole) net.holes.push(holeKey(comp.boardId ?? defaultBoardId ?? '', hole));
        }
    }

    // Record wire endpoint holes on their nets as well.
    ir.wires.forEach((_wire, index) => {
        const net = netFor(endpointNodes[index].from);
        const nodes = endpointNodes[index];
        if (nodes.fromHole) net.holes.push(nodes.fromHole);
        if (nodes.toHole) net.holes.push(nodes.toHole);
    });

    const wireNet = ir.wires.map((_wire, index) => netFor(endpointNodes[index].from).id);

    const pinNet = new Map<string, number>();
    for (const comp of ir.components) {
        for (let pin = 1; pin <= comp.pinCount; pin++) {
            const key = pinKey(comp.id, pin);
            pinNet.set(key, netFor(`pin:${key}`).id);
        }
    }

    return { nets, pinNet, wireNet };
}
