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
