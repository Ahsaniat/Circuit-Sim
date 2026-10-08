import { describe, expect, it } from 'vitest';
import { compile } from '../compiler/compiler';
import { BreadboardGeometry } from './BreadboardGeometry';
import { componentPinHole } from './PinGeometry';
import { normalizeRotation, pinsAligned, planRotation } from './rotation';

function setup(source: string) {
    const ir = compile(source);
    return { ir, geo: new BreadboardGeometry(0, 0) };
}

describe('normalizeRotation', () => {
    it('normalizes to 0/90/180/270', () => {
        expect(normalizeRotation(90)).toBe(90);
        expect(normalizeRotation(-90)).toBe(270);
        expect(normalizeRotation(450)).toBe(90);
        expect(normalizeRotation(0)).toBe(0);
    });
});

describe('planRotation', () => {
    it('rotates a resistor so its pins span rows in one column', () => {
        const { ir, geo } = setup(`@resistor R1 330\n@board B1 breadboard_830\n`);
        const comp = ir.components[0];
        const position = planRotation(comp, geo, 90);
        expect(position).not.toBeNull();

        comp.rotation = 90;
        comp.position = position!;
        expect(pinsAligned(comp, geo)).toBe(true);

        const pin1 = componentPinHole(comp, 1, geo)!;
        const pin2 = componentPinHole(comp, 2, geo)!;
        expect(pin1.col).toBe(pin2.col);
        expect(Math.abs(pin1.row.charCodeAt(0) - pin2.row.charCodeAt(0))).toBe(2);
    });

    it('rotates an LED to horizontal', () => {
        const { ir, geo } = setup(`@led LED1 red\n@board B1 breadboard_830\n`);
        const comp = ir.components[0];
        const position = planRotation(comp, geo, 90);
        expect(position).not.toBeNull();
        comp.rotation = 90;
        comp.position = position!;
        expect(pinsAligned(comp, geo)).toBe(true);
    });

    it('rejects 90 degrees for a straddling IC but allows 180', () => {
        const { ir, geo } = setup(`@AND A1 7408\n@board B1 breadboard_830\n`);
        const comp = ir.components[0];
        expect(planRotation(comp, geo, 90)).toBeNull();

        const position = planRotation(comp, geo, 180);
        expect(position).not.toBeNull();
        comp.rotation = 180;
        expect(pinsAligned(comp, geo)).toBe(true);

        // Pin 1 moves to the mirrored column in the other row.
        const before = componentPinHole({ ...comp, rotation: 0 }, 1, geo)!;
        const after = componentPinHole(comp, 1, geo)!;
        expect(after.row).not.toBe(before.row);
    });

    it('returns null when no hole can host the rotated part', () => {
        const { ir, geo } = setup(`@resistor R1 330\n@board B1 breadboard_830\n`);
        const comp = ir.components[0];
        // Far outside the board: pin 1 cannot snap anywhere.
        comp.position = { x: -500, y: -500 };
        expect(planRotation(comp, geo, 90)).toBeNull();
    });
});
