import { CircuitIR } from '../types';

/**
 * Persistence of manual canvas layout (moved components, dragged wires).
 *
 * The layout is stored as a single-line comment appended to the .csim file:
 *   //!layout: {"v":1,...}
 * The compiler ignores comments, so files stay valid DSL; the app extracts
 * and re-applies the layout after every compile.
 */
export interface CircuitLayout {
    v: 1;
    /** Board positions, so a moved board stays moved after a reload. */
    boards?: Record<string, { x: number; y: number }>;
    components: Record<string, { x: number; y: number; boardId?: string }>;
    wires: Array<{
        from: { x: number; y: number };
        to: { x: number; y: number };
        waypoints?: Array<{ x: number; y: number }>;
    }>;
}

export const LAYOUT_PREFIX = '//!layout:';

export function serializeLayout(ir: CircuitIR): CircuitLayout {
    const boards: NonNullable<CircuitLayout['boards']> = {};
    for (const board of ir.boards) {
        boards[board.id] = { x: board.position.x, y: board.position.y };
    }
    const components: CircuitLayout['components'] = {};
    for (const comp of ir.components) {
        components[comp.id] = {
            x: comp.position.x,
            y: comp.position.y,
            ...(comp.boardId ? { boardId: comp.boardId } : {}),
        };
    }
    const wires = ir.wires.map(wire => ({
        from: { x: wire.from.x, y: wire.from.y },
        to: { x: wire.to.x, y: wire.to.y },
        ...(wire.waypoints && wire.waypoints.length > 0
            ? { waypoints: wire.waypoints.map(wp => ({ x: wp.x, y: wp.y })) }
            : {}),
    }));
    return { v: 1, boards, components, wires };
}

export function layoutToLine(layout: CircuitLayout): string {
    return `${LAYOUT_PREFIX} ${JSON.stringify(layout)}`;
}

/**
 * Split layout metadata out of a .csim source string.
 * Returns the DSL source with layout lines removed plus the parsed layout.
 */
export function extractLayout(code: string): { code: string; layout: CircuitLayout | null } {
    let layout: CircuitLayout | null = null;
    const lines = code.split('\n').filter(line => {
        const trimmed = line.trim();
        if (!trimmed.startsWith(LAYOUT_PREFIX)) return true;
        try {
            const parsed = JSON.parse(trimmed.slice(LAYOUT_PREFIX.length).trim());
            if (parsed && parsed.v === 1 && typeof parsed.components === 'object') {
                layout = parsed as CircuitLayout;
            }
        } catch {
            // Malformed layout metadata is ignored; the DSL stays usable.
        }
        return false;
    });
    return { code: lines.join('\n'), layout };
}

/**
 * Apply a stored layout to freshly compiled IR. Missing components/wires are
 * skipped so a stale layout can never corrupt a circuit.
 */
export function applyLayout(ir: CircuitIR, layout: CircuitLayout): void {
    if (layout.boards) {
        for (const board of ir.boards) {
            const saved = layout.boards[board.id];
            if (saved) {
                board.position = { x: saved.x, y: saved.y };
            }
        }
    }
    for (const comp of ir.components) {
        const saved = layout.components[comp.id];
        if (!saved) continue;
        comp.position = { x: saved.x, y: saved.y };
        if (saved.boardId) comp.boardId = saved.boardId;
    }
    if (layout.wires.length !== ir.wires.length) return;
    for (let i = 0; i < ir.wires.length; i++) {
        const saved = layout.wires[i];
        ir.wires[i].from.x = saved.from.x;
        ir.wires[i].from.y = saved.from.y;
        ir.wires[i].to.x = saved.to.x;
        ir.wires[i].to.y = saved.to.y;
        ir.wires[i].waypoints = saved.waypoints?.map(wp => ({ x: wp.x, y: wp.y }));
    }
}
