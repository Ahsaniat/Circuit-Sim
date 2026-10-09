import { describe, expect, it } from 'vitest';
import { compile } from '../compiler/compiler';
import {
    serializeLayout,
    layoutToLine,
    extractLayout,
    applyLayout,
    LAYOUT_PREFIX,
} from './LayoutSerializer';

const SOURCE = `@resistor R1 330\n@led LED1 red\n@board B1 breadboard_830\nmap (\n (R1 pin 2 -> LED1 pin 1)\n)\n`;

describe('LayoutSerializer', () => {
    it('round-trips component and wire positions', () => {
        const ir = compile(SOURCE);
        ir.components[0].position = { x: 42, y: 7 };
        ir.wires[0].waypoints = [{ x: 1, y: 2 }, { x: 3, y: 4 }];

        const layout = serializeLayout(ir);
        const fresh = compile(SOURCE);
        applyLayout(fresh, layout);

        expect(fresh.components[0].position).toEqual({ x: 42, y: 7 });
        expect(fresh.wires[0].from.x).toBe(ir.wires[0].from.x);
        expect(fresh.wires[0].waypoints).toEqual([{ x: 1, y: 2 }, { x: 3, y: 4 }]);
    });

    it('round-trips board positions', () => {
        const ir = compile(SOURCE);
        ir.boards[0].position = { x: 120, y: 45 };
        const layout = serializeLayout(ir);

        const fresh = compile(SOURCE);
        applyLayout(fresh, layout);
        expect(fresh.boards[0].position).toEqual({ x: 120, y: 45 });
    });

    it('round-trips component rotation', () => {
        const ir = compile(SOURCE);
        ir.components[0].rotation = 90;
        const layout = serializeLayout(ir);

        const fresh = compile(SOURCE);
        applyLayout(fresh, layout);
        expect(fresh.components[0].rotation).toBe(90);
    });

    it('applies layouts saved before board positions existed', () => {
        const ir = compile(SOURCE);
        const layout = serializeLayout(ir);
        delete layout.boards;

        const fresh = compile(SOURCE);
        const before = { ...fresh.boards[0].position };
        applyLayout(fresh, layout);
        expect(fresh.boards[0].position).toEqual(before);
    });

    it('serializes to a single comment line and extracts cleanly', () => {
        const ir = compile(SOURCE);
        const line = layoutToLine(serializeLayout(ir));
        expect(line.startsWith(LAYOUT_PREFIX)).toBe(true);
        expect(line).not.toContain('\n');

        const file = `${SOURCE}\n${line}\n`;
        const { code, layout } = extractLayout(file);
        expect(code).toBe(`${SOURCE}\n`);
        expect(layout).not.toBeNull();
        expect(layout!.components['R1']).toBeDefined();
    });

    it('ignores malformed layout metadata', () => {
        const { code, layout } = extractLayout(`${SOURCE}\n//!layout: {not json}\n`);
        expect(code).toBe(`${SOURCE}\n`);
        expect(layout).toBeNull();
    });

    it('skips stale layout entries for missing components', () => {
        const ir = compile(SOURCE);
        const layout = serializeLayout(ir);
        layout.components['GONE'] = { x: 1, y: 1 };
        const fresh = compile(SOURCE);
        expect(() => applyLayout(fresh, layout)).not.toThrow();
        expect(fresh.components[0].position.x).not.toBe(1);
    });

    it('leaves wires untouched when the wire count changed', () => {
        const ir = compile(SOURCE);
        const layout = serializeLayout(ir);
        layout.wires = [];
        const fresh = compile(SOURCE);
        const before = { ...fresh.wires[0].from };
        applyLayout(fresh, layout);
        expect(fresh.wires[0].from).toEqual(before);
    });
});

describe('LayoutSerializer hardening', () => {
    it('ignores non-finite and malformed component coordinates', () => {
        const ir = compile(SOURCE);
        const before = { ...ir.components[0].position };
        applyLayout(ir, {
            v: 1,
            components: {
                R1: { x: Number.NaN, y: 5 },
                LED1: { x: '9' as unknown as number, y: 5 },
            },
            wires: [],
        });
        expect(ir.components[0].position).toEqual(before);
        expect(Number.isFinite(ir.components[1].position.x)).toBe(true);
    });

    it('normalises stored rotations and ignores unknown boards', () => {
        const ir = compile(SOURCE);
        applyLayout(ir, {
            v: 1,
            components: { R1: { x: 10, y: 10, rotation: 137, boardId: 'NOPE' } },
            wires: [],
        });
        expect(ir.components[0].rotation).toBe(180);
        expect(ir.components[0].boardId).toBe(ir.boards[0].id);
    });

    it('skips malformed wire entries and leaves valid ones alone', () => {
        const ir = compile(SOURCE);
        const before = { ...ir.wires[0].to };
        applyLayout(ir, {
            v: 1,
            components: {},
            wires: [{ from: { x: Number.POSITIVE_INFINITY, y: 0 }, to: { x: 0, y: 0 } }],
        });
        expect(ir.wires[0].to).toEqual(before);
    });

    it('stores and restores prototype-named ids as plain keys', () => {
        const source = `@board B1 breadboard_830\n@resistor __proto__ 330\n`;
        const ir = compile(source);
        ir.components[0].position = { x: 21, y: 12 };
        const line = layoutToLine(serializeLayout(ir));
        const { layout } = extractLayout(`${source}${line}\n`);
        expect(layout).not.toBeNull();
        const fresh = compile(source);
        applyLayout(fresh, layout!);
        expect(fresh.components[0].position).toEqual({ x: 21, y: 12 });
    });

    it('rejects layout metadata whose components are an array', () => {
        const { layout } = extractLayout(`${SOURCE}\n//!layout: {"v":1,"components":[],"wires":[]}\n`);
        expect(layout).toBeNull();
    });
});
