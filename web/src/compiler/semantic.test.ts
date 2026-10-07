import { describe, expect, it } from 'vitest';
import { compile } from './compiler';

const BOARD = '@board B1 breadboard_830\n';

describe('semantic validation', () => {
    it('rejects duplicate component declarations', () => {
        expect(() => compile('@resistor R1 330\n@resistor R1 1k\n')).toThrowError(/Duplicate component declaration: 'R1'/);
    });

    it('rejects duplicate board declarations', () => {
        expect(() => compile(`@board B1 breadboard_830\n@board B1 breadboard_830\n`)).toThrowError(/Duplicate board declaration: 'B1'/);
    });

    it('rejects a component and board sharing an id', () => {
        expect(() => compile('@resistor B1 330\n@board B1 breadboard_830\n')).toThrowError(
            /Duplicate (component|board) declaration: 'B1'/
        );
    });

    it('rejects unknown component types', () => {
        expect(() => compile('@comp X1 NOT_A_CHIP\n')).toThrowError(/Unknown component type: 'NOT_A_CHIP'/);
    });

    it('rejects undefined components referenced in map', () => {
        expect(() => compile(`@resistor R1 330\n${BOARD}\nmap (\n (R1 pin 2 -> GHOST pin 1)\n)\n`)).toThrowError(
            /Undefined component: 'GHOST'/
        );
    });

    it('rejects out-of-range component pins', () => {
        expect(() => compile(`@AND A1 7408\nmap (\n (A1 pin 15 -> A1 pin 1)\n)\n`)).toThrowError(
            /Invalid pin number 15 for 'A1' \(has 14 pins\)/
        );
    });

    it('rejects out-of-range board pins', () => {
        expect(() => compile(`@comp A1 7408\n${BOARD}\nmap (\n (A1 pin 3 -> B1 pin 831)\n)\n`)).toThrowError(
            /Invalid pin number 831 for 'B1' \(has 830 pins\)/
        );
    });

    it('rejects a board pin used by two connections', () => {
        expect(() =>
            compile(`@comp A1 7408\n${BOARD}\nmap (\n (A1 pin 3 -> B1 pin 5)\n (A1 pin 6 -> B1 pin 5)\n)\n`)
        ).toThrowError(/Pin 5 on board 'B1' is already connected/);
    });

    it('accepts the same component pin in multiple connections', () => {
        const ir = compile(`@comp A1 7408\n${BOARD}\nmap (\n (A1 pin 3 -> B1 pin 5)\n (A1 pin 3 -> B1 pin 6)\n)\n`);
        expect(ir.wires).toHaveLength(2);
    });

    it('reports the location of the offending reference', () => {
        try {
            compile(`@resistor R1 330\n${BOARD}\nmap (\n (R1 pin 2 -> GHOST pin 1)\n)\n`);
            expect.unreachable('compile should throw');
        } catch (err) {
            expect((err as Error).message).toContain('Line 5');
        }
    });

    it('rejects duplicate map blocks', () => {
        expect(() =>
            compile(`@comp A1 7408\nmap (\n (A1 pin 1 -> A1 pin 2)\n)\nmap (\n (A1 pin 3 -> A1 pin 4)\n)\n`)
        ).toThrowError(/Duplicate 'map' block/);
    });

    it('rejects pin numbers with alphanumeric suffixes', () => {
        expect(() => compile(`@comp A1 7408\nmap (\n (A1 pin 2N2222 -> A1 pin 1)\n)\n`)).toThrowError(
            /Invalid pin number '2N2222'/
        );
    });
});
