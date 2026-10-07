import { describe, expect, it } from 'vitest';
import { compile } from './compiler';
import { outputPins, pinFunction, registerCustomIC } from '../components/PinDatabase';

describe('custom IC definitions', () => {
    const DEF = `def MyIC (\n  A -> input,\n  B -> input,\n  Y -> output,\n  GND -> gnd\n)\n`;

    it('compiles a component using a custom IC', () => {
        const ir = compile(`${DEF}@comp M1 MyIC\n@board B1 breadboard_830\nmap (\n (M1 pin 1 -> M1 pin 3)\n)\n`);
        expect(ir.components[0].pinCount).toBe(4);
        expect(ir.customICs?.[0].name).toBe('MyIC');
        expect(ir.customICs?.[0].pins.map(p => p.name)).toEqual(['A', 'B', 'Y', 'GND']);
    });

    it('validates pin ranges against the definition', () => {
        expect(() => compile(`${DEF}@comp M1 MyIC\nmap (\n (M1 pin 5 -> M1 pin 1)\n)\n`)).toThrowError(
            /Invalid pin number 5/
        );
    });

    it('rejects redefining a built-in IC', () => {
        expect(() => compile(`def 7408 (\n  A -> input\n)\n`)).toThrowError(/Cannot redefine built-in IC/);
    });

    it('rejects duplicate definitions', () => {
        expect(() => compile(`${DEF}${DEF}`)).toThrowError(/Duplicate IC definition/);
    });

    it('rejects an unknown pin type', () => {
        expect(() => compile(`def Bad (\n  A -> banana\n)\n`)).toThrowError(/Expected pin type/);
    });

    it('rejects a definition with no pins', () => {
        expect(() => compile(`def Empty (\n)\n`)).toThrowError(/at least one pin/);
    });

    it('feeds custom pins into the pin database', () => {
        registerCustomIC('MyIC', [
            { name: 'A', type: 'input' },
            { name: 'B', type: 'input' },
            { name: 'Y', type: 'output' },
            { name: 'GND', type: 'gnd' },
        ]);
        expect(pinFunction('MyIC', 3)).toBe('Y');
        expect(outputPins('MyIC')).toEqual([3]);
    });
});
