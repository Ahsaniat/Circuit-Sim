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
