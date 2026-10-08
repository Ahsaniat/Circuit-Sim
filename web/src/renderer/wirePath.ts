import { Position } from '../types';

/**
 * Wire path helpers.
 *
 * Wires are drawn as orthogonal polylines with rounded corners, matching
 * the breadboard-editor convention (TinkerCAD-style). When a wire has no
 * stored waypoints - for example after a board was dragged - a simple
 * orthogonal fallback is derived so a wire is never drawn diagonally.
 */

/** Orthogonal fallback route between two points. */
export function orthogonalFallback(from: Position, to: Position): Position[] {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) < 0.01 || Math.abs(dy) < 0.01) {
        return [];
    }
    // Run along the longer axis first: short drop at the destination looks
    // tidier than a long diagonal-ish horizontal run across the board.
    if (Math.abs(dx) >= Math.abs(dy)) {
        return [{ x: to.x, y: from.y }];
    }
    return [{ x: from.x, y: to.y }];
}

/** Full point list for a wire, applying the orthogonal fallback when needed. */
export function wirePoints(
    from: Position,
    waypoints: Position[] | undefined,
    to: Position
): Position[] {
    const middle = waypoints && waypoints.length > 0 ? waypoints : orthogonalFallback(from, to);
    return [from, ...middle, to];
}

/**
 * Corner radius in canvas units, clamped so adjacent segments never
 * overlap: a corner can never be rounded by more than half of either
 * neighbouring segment.
 */
export function cornerRadius(
    previous: Position,
    corner: Position,
    next: Position,
    requested: number
): number {
    const first = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const second = Math.hypot(next.x - corner.x, next.y - corner.y);
    return Math.max(0, Math.min(requested, first / 2, second / 2));
}
