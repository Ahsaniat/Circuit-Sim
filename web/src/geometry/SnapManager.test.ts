import { describe, expect, it } from 'vitest';
import { BreadboardGeometry } from './BreadboardGeometry';
import { SnapManager } from './SnapManager';

const geo = new BreadboardGeometry(0, 0);
const snap = new SnapManager(geo);

describe('SnapManager.findNearestHole', () => {
    it('snaps a point near a main hole to that hole', () => {
        const target = geo.getHolePosition(10, 'C');
        const result = snap.snapPosition({ x: target.x + 0.4, y: target.y + 0.4 });
        expect(result.snapped).toBe(true);
        expect(result.x).toBeCloseTo(target.x, 5);
        expect(result.y).toBeCloseTo(target.y, 5);
        expect(result.row).toBe('C');
        expect(result.col).toBe(10);
    });

    it('snaps a point near a power rail hole to that rail', () => {
        for (const row of BreadboardGeometry.RAIL_ROWS) {
            const target = geo.getHolePosition(22, row);
            const result = snap.snapPosition({ x: target.x + 0.3, y: target.y });
            expect(result.snapped).toBe(true);
            expect(result.row).toBe(row);
        }
    });

    it('does not snap when outside SNAP_RADIUS', () => {
        const target = geo.getHolePosition(10, 'C');
        // Midpoint between four holes: distance to each is sqrt(2) * spacing/2,
        // which exceeds SNAP_RADIUS.
        const half = BreadboardGeometry.HOLE_SPACING / 2;
        const result = snap.snapPosition({ x: target.x + half, y: target.y + half });
        expect(result.snapped).toBe(false);
    });

    it('accepts a custom radius so callers can adapt to zoom', () => {
        const target = geo.getHolePosition(10, 'C');
        const half = BreadboardGeometry.HOLE_SPACING / 2;
        const point = { x: target.x + half, y: target.y };
        expect(snap.snapPosition(point).snapped).toBe(false);
        expect(snap.snapPosition(point, 1.5).snapped).toBe(true);
    });

    it('finds holes near the board edges', () => {
        for (const col of [1, 2, 62, 63]) {
            const target = geo.getHolePosition(col, 'E');
            const result = snap.snapPosition({ x: target.x + 0.3, y: target.y + 0.3 });
            expect(result.snapped).toBe(true);
            expect(result.col).toBe(col);
        }
    });

    it('does not snap for points far outside the board', () => {
        expect(snap.snapPosition({ x: -100, y: -100 }).snapped).toBe(false);
        expect(snap.snapPosition({ x: 1000, y: 1000 }).snapped).toBe(false);
    });
});

describe('SnapManager.snapICComponent', () => {
    it('snaps an IC so pin 1 lands on the requested row F column', () => {
        const bodyHeight = BreadboardGeometry.getICBodyHeight(1.5);
        const holeF = geo.getHolePosition(15, 'F');
        // Place the body so pin 1 is a little off the hole, then snap.
        const bodyPos = { x: holeF.x - 1 + 0.4, y: holeF.y - bodyHeight - 1.5 + 0.4 };
        const result = snap.snapICComponent(bodyPos, 7, 1, 1.5);
        expect(result.snapped).toBe(true);
        expect(result.snapCol).toBe(15);
    });
});

describe('SnapManager.getConnectedComponents', () => {
    it('ties all rows of a column together within the same half', () => {
        snap.clearOccupancy();
        snap.registerPinOccupancy(10, 'C', 'R1', 1);
        snap.registerPinOccupancy(10, 'A', 'R2', 1);
        snap.registerPinOccupancy(11, 'C', 'R3', 1);

        const connected = snap.getConnectedComponents(10, 'E');
        const ids = connected.map(o => o.componentId).sort();
        expect(ids).toEqual(['R1', 'R2']);
    });

    it('treats power rails as full-width buses', () => {
        snap.clearOccupancy();
        snap.registerWireOccupancy(5, 'TOP+', 0, 'from');
        snap.registerWireOccupancy(40, 'TOP+', 1, 'from');
        snap.registerWireOccupancy(40, 'BOTTOM+', 2, 'from');

        const connected = snap.getConnectedComponents(1, 'TOP+');
        const ids = connected.map(o => o.componentId).sort();
        expect(ids).toEqual(['wire_0', 'wire_1']);
    });
});
