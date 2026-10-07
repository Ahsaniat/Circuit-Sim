import { describe, expect, it } from 'vitest';
import { compile } from './compiler';

const TWO_BOARDS = `@board B1 breadboard_830
@board B2 breadboard_830

@resistor R1 330
@led LED1 red
@resistor R2 330
@led LED2 red

B1.map (
    (R1 pin 1 -> LED1 pin 1)
)

B2.map (
    (R2 pin 1 -> LED2 pin 1)
)
`;

describe('board-scoped map blocks', () => {
    it('assigns referenced components to the scoped board', () => {
        const ir = compile(TWO_BOARDS);
        const boardOf = (id: string) => ir.components.find(c => c.id === id)?.boardId;
        expect(boardOf('R1')).toBe('B1');
        expect(boardOf('LED1')).toBe('B1');
        expect(boardOf('R2')).toBe('B2');
        expect(boardOf('LED2')).toBe('B2');
    });

    it('places components within their own board bounds', () => {
        const ir = compile(TWO_BOARDS);
        const b1 = ir.boards[0];
        const b2 = ir.boards[1];
        const r1 = ir.components.find(c => c.id === 'R1')!;
        const r2 = ir.components.find(c => c.id === 'R2')!;
        expect(r1.position.x).toBeGreaterThanOrEqual(b1.position.x);
        expect(r1.position.x).toBeLessThanOrEqual(b1.position.x + b1.size.width);
        expect(r2.position.x).toBeGreaterThanOrEqual(b2.position.x);
        expect(r2.position.x).toBeLessThanOrEqual(b2.position.x + b2.size.width);
    });

    it('accepts the B1 map (...) form without a dot', () => {
        const ir = compile(`@board B1 breadboard_830\n@board B2 breadboard_830\n@resistor R1 330\nB1 map (\n (R1 pin 1 -> B1 pin 5)\n)\n`);
        expect(ir.components[0].boardId).toBe('B1');
    });

    it('rejects an unknown board scope', () => {
        expect(() => compile(`@comp A1 7408\nB9.map (\n (A1 pin 1 -> A1 pin 2)\n)\n`)).toThrowError(
            /Unknown board: 'B9'/
        );
    });

    it('rejects two scoped maps claiming the same component', () => {
        expect(() =>
            compile(
                `@board B1 breadboard_830\n@board B2 breadboard_830\n@comp A1 7408\n` +
                `B1.map (\n (A1 pin 1 -> A1 pin 2)\n)\nB2.map (\n (A1 pin 3 -> A1 pin 4)\n)\n`
            )
        ).toThrowError(/referenced by both 'B1.map' and 'B2.map'/);
    });
});

describe('place statements', () => {
    it('places components explicitly', () => {
        const ir = compile(
            `@board B1 breadboard_830\n@board B2 breadboard_830\n@resistor R1 330\n@resistor R2 330\nplace R1, R2 on B2\n`
        );
        expect(ir.components.find(c => c.id === 'R1')?.boardId).toBe('B2');
        expect(ir.components.find(c => c.id === 'R2')?.boardId).toBe('B2');
    });

    it('is authoritative over scoped map references', () => {
        const ir = compile(
            `@board B1 breadboard_830\n@board B2 breadboard_830\n@resistor R1 330\n` +
            `place R1 on B2\nB1.map (\n (R1 pin 1 -> B1 pin 5)\n)\n`
        );
        // Explicit placement wins; the B1.map reference becomes a cross-board wire.
        expect(ir.components[0].boardId).toBe('B2');
        expect(ir.wires).toHaveLength(1);
    });

    it('rejects conflicting place statements', () => {
        expect(() =>
            compile(
                `@board B1 breadboard_830\n@board B2 breadboard_830\n@resistor R1 330\n` +
                `place R1 on B1\nplace R1 on B2\n`
            )
        ).toThrowError(/already placed on 'B1'/);
    });

    it('rejects placing an unknown component', () => {
        expect(() => compile(`@board B1 breadboard_830\nplace GHOST on B1\n`)).toThrowError(
            /Undefined component: 'GHOST'/
        );
    });

    it('rejects placing on an unknown board', () => {
        expect(() => compile(`@resistor R1 330\nplace R1 on B9\n`)).toThrowError(/Unknown board: 'B9'/);
    });
});

describe('cross-board connections', () => {
    it('routes a global map wire between two boards', () => {
        const ir = compile(
            TWO_BOARDS +
            `\nmap (\n (R1 pin 2 -> R2 pin 2)\n)\n`
        );
        const crossWire = ir.wires.find(w => w.from.component === 'R1' && w.to.component === 'R2');
        expect(crossWire).toBeDefined();
        const b1 = ir.boards[0];
        const b2 = ir.boards[1];
        expect(crossWire!.from.x).toBeLessThan(b1.position.x + b1.size.width);
        expect(crossWire!.to.x).toBeGreaterThan(b2.position.x);
    });

    it('defaults unscoped components to the first board', () => {
        const ir = compile(`@board B1 breadboard_830\n@board B2 breadboard_830\n@resistor R1 330\n@resistor R2 330\n`);
        expect(ir.components.every(c => c.boardId === 'B1')).toBe(true);
    });
});

describe('lexer strictness', () => {
    it('rejects stray characters', () => {
        expect(() => compile(`@resistor R1 330;\n`)).toThrowError(/Unexpected character ';'/);
    });

    it('rejects a lone dash', () => {
        expect(() => compile(`@resistor R1 -330\n`)).toThrowError(/Unexpected character '-'/);
    });
});
