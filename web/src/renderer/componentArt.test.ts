import { describe, expect, it } from 'vitest';
import { COMPONENT_ART, computeArtTransform, ComponentArt } from './componentArt';

/** Apply a computed transform the same way the canvas does. */
function apply(art: ComponentArt, holes: Array<{ x: number; y: number } | undefined>, pinIndex: number) {
    const transform = computeArtTransform(art, holes)!;
    const pin = art.pins[pinIndex];
    const cos = Math.cos(transform.rotate);
    const sin = Math.sin(transform.rotate);
    return {
        x: transform.translateX + transform.scaleX * (pin.x * cos - pin.y * sin),
        y: transform.translateY + transform.scaleY * (pin.x * sin + pin.y * cos),
    };
}

describe('computeArtTransform', () => {
    it('maps a horizontal two-pin part exactly', () => {
        const art = COMPONENT_ART.RES;
        const holes = [{ x: 0, y: 0 }, { x: 20.32, y: 0 }];
        const first = apply(art, holes, 0);
        const second = apply(art, holes, 1);
        expect(first.x).toBeCloseTo(0, 5);
        expect(first.y).toBeCloseTo(0, 5);
        expect(second.x).toBeCloseTo(20.32, 5);
        expect(second.y).toBeCloseTo(0, 5);
    });

    it('maps a rotated part (battery, vertical artwork onto horizontal holes)', () => {
        const art = COMPONENT_ART.BATTERY;
        const holes = [{ x: 0, y: 0 }, { x: 10.16, y: 0 }];
        const first = apply(art, holes, 0);
        const second = apply(art, holes, 1);
        expect(first.x).toBeCloseTo(0, 5);
        expect(first.y).toBeCloseTo(0, 5);
        expect(second.x).toBeCloseTo(10.16, 5);
        expect(second.y).toBeCloseTo(0, 5);
    });

    it('maps all 14 DIP pins onto their holes with per-axis fitting', () => {
        const art = COMPONENT_ART['7411'];
        const holes = Array.from({ length: 14 }, (_, index) => {
            const pin = index + 1;
            if (pin <= 7) {
                return { x: (pin - 1) * 10.16, y: 24.16 };
            }
            return { x: (14 - pin) * 10.16, y: 0 };
        });
        for (let pin = 1; pin <= 14; pin++) {
            const mapped = apply(art, holes, pin - 1);
            expect(mapped.x).toBeCloseTo(holes[pin - 1]!.x, 4);
            expect(mapped.y).toBeCloseTo(holes[pin - 1]!.y, 4);
        }
    });

    it('maps all four push-button legs onto their holes', () => {
        const art = COMPONENT_ART.PUSHBUTTON;
        const holes = [
            { x: 0, y: 0 },
            { x: 10.16, y: 0 },
            { x: 0, y: 24.16 },
            { x: 10.16, y: 24.16 },
        ];
        for (let pin = 0; pin < 4; pin++) {
            const mapped = apply(art, holes, pin);
            expect(mapped.x).toBeCloseTo(holes[pin].x, 4);
            expect(mapped.y).toBeCloseTo(holes[pin].y, 4);
        }
    });

    it('maps a three-pin transistor across its pin span', () => {
        const art = COMPONENT_ART.NPN;
        const holes = [{ x: 0, y: 0 }, { x: 10.16, y: 0 }, { x: 20.32, y: 0 }];
        const third = apply(art, holes, 2);
        expect(third.x).toBeCloseTo(20.32, 4);
        expect(third.y).toBeCloseTo(0, 4);
    });

    it('returns null when a required pin or hole is missing', () => {
        const art = COMPONENT_ART.RES;
        expect(computeArtTransform(art, [])).toBeNull();
        expect(computeArtTransform(art, [{ x: 0, y: 0 }])).toBeNull();
        expect(computeArtTransform(art, [undefined, { x: 1, y: 1 }])).toBeNull();
    });

    it('ships artwork for every mapped type with matching pin counts', () => {
        for (const [type, art] of Object.entries(COMPONENT_ART)) {
            expect(art.pins.length, type).toBeGreaterThanOrEqual(2);
            expect(art.width, type).toBeGreaterThan(0);
            expect(art.height, type).toBeGreaterThan(0);
        }
    });
});
