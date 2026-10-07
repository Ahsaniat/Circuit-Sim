import { describe, expect, it } from 'vitest';
import { BreadboardGeometry } from './BreadboardGeometry';
import { getICFootprint, getICPinCounts } from './ComponentFootprints';

const geo = new BreadboardGeometry(0, 0);
const BOARD_HEIGHT = BreadboardGeometry.BOARD_HEIGHT;
const RAIL_HEIGHT = BreadboardGeometry.RAIL_HEIGHT;

describe('power rail geometry', () => {
    const topRail = ['TOP+', 'TOP-'];
    const bottomRail = ['BOTTOM+', 'BOTTOM-'];

    it('places both top rail holes inside the top rail band', () => {
        for (const row of topRail) {
            const y = geo.getHolePosition(1, row).y;
            expect(y).toBeGreaterThanOrEqual(0);
            expect(y).toBeLessThanOrEqual(RAIL_HEIGHT);
        }
    });

    it('places both bottom rail holes inside the bottom rail band', () => {
        for (const row of bottomRail) {
            const y = geo.getHolePosition(1, row).y;
            expect(y).toBeGreaterThanOrEqual(BOARD_HEIGHT - RAIL_HEIGHT);
            expect(y).toBeLessThanOrEqual(BOARD_HEIGHT);
        }
    });

    it('keeps + and - rail lines apart', () => {
        expect(geo.getHolePosition(1, 'TOP-').y - geo.getHolePosition(1, 'TOP+').y).toBeCloseTo(3, 5);
        expect(geo.getHolePosition(1, 'BOTTOM-').y - geo.getHolePosition(1, 'BOTTOM+').y).toBeCloseTo(3, 5);
    });

    it('does not place rail holes close enough to main rows to be ambiguous', () => {
        const tolerance = BreadboardGeometry.HOLE_SPACING / 2;
        const mainRows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
        for (const rail of [...topRail, ...bottomRail]) {
            const railY = geo.getHolePosition(1, rail).y;
            for (const row of mainRows) {
                expect(Math.abs(railY - geo.getHolePosition(1, row).y)).toBeGreaterThan(tolerance);
            }
        }
    });
});

describe('coordinate mapping', () => {
    it('round-trips columns through getColumnAtX', () => {
        for (const col of [1, 2, 17, 32, 63]) {
            const hole = geo.getHolePosition(col, 'A');
            expect(geo.getColumnAtX(hole.x)).toBe(col);
        }
    });

    it('round-trips rows through getRowAtY', () => {
        for (const row of [...BreadboardGeometry.ALL_ROWS, ...BreadboardGeometry.RAIL_ROWS]) {
            const hole = geo.getHolePosition(1, row);
            expect(geo.getRowAtY(hole.y)).toBe(row);
        }
    });

    it('rejects out-of-range columns', () => {
        expect(geo.getColumnAtX(-1000)).toBe(0);
        expect(geo.getColumnAtX(1000)).toBe(0);
    });
});

describe('IC body placement', () => {
    it('round-trips IC start columns through body position', () => {
        for (const col of [1, 3, 5, 20, 40]) {
            const body = geo.getICBodyPosition(col, 1.5);
            expect(geo.getICStartColumn(body.x)).toBe(col);
        }
    });

    it('positions pin tips exactly on rows E and F', () => {
        const startCol = 7;
        const pinLength = 1.5;
        const body = geo.getICBodyPosition(startCol, pinLength);
        const bodyHeight = BreadboardGeometry.getICBodyHeight(pinLength);

        const rowE = geo.getHolePosition(startCol, 'E');
        const rowF = geo.getHolePosition(startCol, 'F');

        // Top pin tip: bodyY - pinLength should equal row E
        expect(body.y - pinLength).toBeCloseTo(rowE.y, 5);
        // Bottom pin tip: bodyY + bodyHeight + pinLength should equal row F
        expect(body.y + bodyHeight + pinLength).toBeCloseTo(rowF.y, 5);
    });
});

describe('IC pin counts', () => {
    it('splits even counts evenly', () => {
        expect(getICPinCounts(14)).toEqual({ bottom: 7, top: 7, topOffset: 0 });
    });

    it('puts the extra pin on the bottom row for odd counts', () => {
        expect(getICPinCounts(3)).toEqual({ bottom: 2, top: 1, topOffset: 1 });
        expect(getICPinCounts(5)).toEqual({ bottom: 3, top: 2, topOffset: 1 });
    });

    it('generates every pin exactly once, including odd counts', () => {
        for (const pinCount of [2, 3, 4, 5, 8, 10, 14, 16]) {
            const footprint = getICFootprint(pinCount);
            const numbers = footprint.pins.map(p => p.number).sort((a, b) => a - b);
            expect(numbers).toEqual(Array.from({ length: pinCount }, (_, i) => i + 1));
        }
    });

    it('right-aligns the top row for odd pin counts', () => {
        const footprint = getICFootprint(3);
        const topPin = footprint.pins.find(p => p.number === 3)!;
        const bottomPin2 = footprint.pins.find(p => p.number === 2)!;
        expect(topPin.targetRow).toBe('E');
        expect(topPin.offsetX).toBe(bottomPin2.offsetX);
    });
});
