import { describe, expect, it } from 'vitest';
import { cornerRadius, orthogonalFallback, wirePoints } from './wirePath';

describe('orthogonalFallback', () => {
    it('returns nothing for aligned points', () => {
        expect(orthogonalFallback({ x: 0, y: 5 }, { x: 10, y: 5 })).toEqual([]);
        expect(orthogonalFallback({ x: 5, y: 0 }, { x: 5, y: 10 })).toEqual([]);
    });

    it('bends horizontally first for a wide gap', () => {
        const points = orthogonalFallback({ x: 0, y: 0 }, { x: 40, y: 10 });
        expect(points).toEqual([{ x: 40, y: 0 }]);
    });

    it('bends vertically first for a tall gap', () => {
        const points = orthogonalFallback({ x: 0, y: 0 }, { x: 10, y: 40 });
        expect(points).toEqual([{ x: 0, y: 40 }]);
    });
});

describe('wirePoints', () => {
    it('keeps stored waypoints', () => {
        const from = { x: 0, y: 0 };
        const to = { x: 10, y: 10 };
        const waypoints = [{ x: 5, y: 0 }, { x: 5, y: 10 }];
        expect(wirePoints(from, waypoints, to)).toEqual([from, ...waypoints, to]);
    });

    it('never produces a diagonal when waypoints are missing', () => {
        const points = wirePoints({ x: 0, y: 0 }, undefined, { x: 10, y: 10 });
        expect(points).toHaveLength(3);
        // Every consecutive pair must share an axis.
        for (let i = 1; i < points.length; i++) {
            const a = points[i - 1];
            const b = points[i];
            expect(a.x === b.x || a.y === b.y).toBe(true);
        }
    });

    it('falls back when the waypoint list is empty', () => {
        expect(wirePoints({ x: 0, y: 0 }, [], { x: 10, y: 10 })).toHaveLength(3);
    });
});

describe('cornerRadius', () => {
    it('uses the requested radius when segments are long', () => {
        expect(cornerRadius({ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, 6)).toBe(6);
    });

    it('clamps to half of the shorter segment', () => {
        expect(cornerRadius({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 20 }, 6)).toBe(2);
    });

    it('never returns a negative radius', () => {
        expect(cornerRadius({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, 6)).toBe(0);
    });
});
