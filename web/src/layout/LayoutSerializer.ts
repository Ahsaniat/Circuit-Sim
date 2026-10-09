import { CircuitIR } from '../types';
import { normalizeRotation } from '../geometry/rotation';

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
    components: Record<string, { x: number; y: number; boardId?: string; rotation?: number }>;
    wires: Array<{
        from: { x: number; y: number };
        to: { x: number; y: number };
        waypoints?: Array<{ x: number; y: number }>;
    }>;
}

export const LAYOUT_PREFIX = '//!layout:';

/** True for a plain object (not null, not an array). */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A finite number, or null when the value cannot be used as a coordinate. */
function finite(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function own<T>(record: Record<string, T> | undefined, key: string): T | undefined {
    if (!record || !Object.prototype.hasOwnProperty.call(record, key)) return undefined;
    return record[key];
}

function isPoint(value: unknown): value is { x: number; y: number } {
    return isRecord(value) && finite(value.x) !== null && finite(value.y) !== null;
}

export function serializeLayout(ir: CircuitIR): CircuitLayout {
    // Prototype-free maps so ids like '__proto__' are stored as own keys
    // instead of triggering the object prototype setter.
    const boards: NonNullable<CircuitLayout['boards']> = Object.create(null);
    for (const board of ir.boards) {
        boards[board.id] = { x: board.position.x, y: board.position.y };
    }
    const components: CircuitLayout['components'] = Object.create(null);
    for (const comp of ir.components) {
        components[comp.id] = {
            x: comp.position.x,
            y: comp.position.y,
            ...(comp.boardId ? { boardId: comp.boardId } : {}),
            ...(comp.rotation ? { rotation: comp.rotation } : {}),
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
            const parsed: unknown = JSON.parse(trimmed.slice(LAYOUT_PREFIX.length).trim());
            if (
                isRecord(parsed) &&
                parsed.v === 1 &&
                isRecord(parsed.components) &&
                Array.isArray(parsed.wires) &&
                (parsed.boards === undefined || isRecord(parsed.boards))
            ) {
                layout = parsed as unknown as CircuitLayout;
            }
        } catch {
            // Malformed layout metadata is ignored; the DSL stays usable.
        }
        return false;
    });
    return { code: lines.join('\n'), layout };
}

/**
 * Apply a stored layout to freshly compiled IR.
 *
 * Every value is validated before it is copied: a stale, truncated or
 * hand-edited layout must never inject non-finite coordinates, unknown
 * boards or bogus rotations into the scene. Unusable entries are skipped
 * and the compiler's own placement stands.
 */
export function applyLayout(ir: CircuitIR, layout: CircuitLayout): void {
    const boardIds = new Set(ir.boards.map(board => board.id));

    if (layout.boards) {
        for (const board of ir.boards) {
            const saved = own(layout.boards, board.id);
            if (!saved) continue;
            const x = finite(saved.x);
            const y = finite(saved.y);
            if (x !== null && y !== null) {
                board.position = { x, y };
            }
        }
    }

    for (const comp of ir.components) {
        const saved = own(layout.components, comp.id);
        if (!saved) continue;
        const x = finite(saved.x);
        const y = finite(saved.y);
        if (x === null || y === null) continue;
        comp.position = { x, y };
        if (typeof saved.boardId === 'string' && boardIds.has(saved.boardId)) {
            comp.boardId = saved.boardId;
        }
        if (typeof saved.rotation === 'number') {
            comp.rotation = normalizeRotation(saved.rotation);
        }
    }

    if (layout.wires.length !== ir.wires.length) return;
    for (let i = 0; i < ir.wires.length; i++) {
        const saved = layout.wires[i];
        if (!isRecord(saved) || !isPoint(saved.from) || !isPoint(saved.to)) continue;
        const wire = ir.wires[i];
        // Keep the endpoint objects (they carry component/pin references)
        // and only move their coordinates.
        wire.from.x = saved.from.x;
        wire.from.y = saved.from.y;
        wire.to.x = saved.to.x;
        wire.to.y = saved.to.y;
        if (Array.isArray(saved.waypoints)) {
            const waypoints = saved.waypoints.filter(isPoint).map(wp => ({ x: wp.x, y: wp.y }));
            wire.waypoints = waypoints.length > 0 ? waypoints : undefined;
        } else {
            wire.waypoints = undefined;
        }
    }
}
