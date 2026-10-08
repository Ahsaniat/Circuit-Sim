import { describe, expect, it } from 'vitest';
import { COMPONENT_ART, computeArtTransform, artDisplaySize, artFor, ComponentArt } from './componentArt';

/** Apply a computed transform the same way the canvas does. */
function apply(
    art: ComponentArt,
    holes: Array<{ x: number; y: number } | undefined>,
    pinIndex: number,
    extraRotation = 0
) {
    const transform = computeArtTransform(art, holes, extraRotation)!;
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

    it('maps artwork with an extra component rotation', () => {
        const art = COMPONENT_ART.RES;
        // Vertical holes: the horizontal artwork must rotate 90 degrees.
        const holes = [{ x: 0, y: 0 }, { x: 0, y: 20.32 }];
        for (let pin = 0; pin < 2; pin++) {
            const mapped = apply(art, holes, pin, 90);
            expect(mapped.x).toBeCloseTo(holes[pin].x, 4);
            expect(mapped.y).toBeCloseTo(holes[pin].y, 4);
        }
    });

    it('never explodes at 270 degrees, even with skewed hole positions', () => {
        // Regression: rotating the battery to 270 degrees and dragging it
        // near the power rail produced a scale of ~1e14 because rotated
        // trig spans are not exactly zero.
        const holes = [{ x: 617.44, y: 6 }, { x: 616.06, y: 0.57 }];
        const transform = computeArtTransform(COMPONENT_ART.BATTERY, holes, 270);
        expect(transform).not.toBeNull();
        expect(transform!.scaleX).toBeGreaterThan(0);
        expect(transform!.scaleX).toBeLessThan(1);
        expect(Number.isFinite(transform!.translateX)).toBe(true);
        expect(Number.isFinite(transform!.translateY)).toBe(true);
    });

    it('returns null when the two holes are the same point', () => {
        const holes = [{ x: 5, y: 5 }, { x: 5, y: 5 }];
        expect(computeArtTransform(COMPONENT_ART.RES, holes, 0)).toBeNull();
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

    it('shares the DIP-14 artwork across all 14-pin IC types', () => {
        const dip = COMPONENT_ART['7411'];
        for (const type of ['74HC00', '74HC08', '74HC74', 'LM339', '556', '7490']) {
            expect(artFor(type), type).toBe(dip);
        }
        expect(dip.pins).toHaveLength(14);
        expect(dip.label).toBeDefined();
    });

    it('maps 8/16/20/24-pin ICs to generated DIP artwork', () => {
        expect(artFor('555')!.pins).toHaveLength(8);
        expect(artFor('LM393')!.pins).toHaveLength(8);
        expect(artFor('74HC595')!.pins).toHaveLength(16);
        expect(artFor('CD4511')!.pins).toHaveLength(16);
        expect(artFor('74373')!.pins).toHaveLength(20);
        expect(artFor('74181')!.pins).toHaveLength(24);
    });

    it('maps every DIP-8 pin onto its hole', () => {
        const art = artFor('555')!;
        const holes = Array.from({ length: 8 }, (_, index) => {
            const pin = index + 1;
            return pin <= 4
                ? { x: (pin - 1) * 10.16, y: 24.16 }
                : { x: (8 - pin) * 10.16, y: 0 };
        });
        for (let pin = 1; pin <= 8; pin++) {
            const mapped = apply(art, holes, pin - 1);
            expect(mapped.x).toBeCloseTo(holes[pin - 1]!.x, 4);
            expect(mapped.y).toBeCloseTo(holes[pin - 1]!.y, 4);
        }
    });
});

describe('artDisplaySize', () => {
    it('sizes a horizontal part from its pin span', () => {
        const size = artDisplaySize(COMPONENT_ART.RES, 5.08, 0)!;
        // The artwork is 96 wide for a 90-unit pin span.
        expect(size.width).toBeCloseTo((96 / 90) * 5.08, 4);
        expect(size.height).toBeCloseTo((34 / 90) * 5.08, 4);
    });

    it('swaps dimensions for pre-rotated artwork', () => {
        const size = artDisplaySize(COMPONENT_ART.BATTERY, 2.54, 0)!;
        // Battery artwork is 484x226 with a 93.8-unit vertical pin span.
        const scale = 2.54 / 93.8;
        expect(size.width).toBeCloseTo(226 * scale, 4);
        expect(size.height).toBeCloseTo(484 * scale, 4);
    });

    it('fits both axes for two-axis pin grids', () => {
        const size = artDisplaySize(COMPONENT_ART['7411'], 15.24, 6.04)!;
        expect(size.width).toBeCloseTo(165 * (15.24 / 125.4), 3);
        expect(size.height).toBeCloseTo(62 * (6.04 / 62), 3);
    });

    it('reserves more room for large parts than for small ones', () => {
        const resistor = artDisplaySize(COMPONENT_ART.RES, 5.08, 0)!;
        const capacitor = artDisplaySize(COMPONENT_ART.CAP, 5.08, 0)!;
        expect(capacitor.width).toBeGreaterThan(resistor.width * 2);
    });
});
