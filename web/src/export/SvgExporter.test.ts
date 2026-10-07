import { describe, expect, it } from 'vitest';
import { compile } from '../compiler/compiler';
import { BreadboardGeometry } from '../geometry/BreadboardGeometry';
import { buildSvg } from './SvgExporter';

const SOURCE = `@AND A1 7408\n@resistor R1 330\n@led LED1 red\n@board B1 breadboard_830\nmap (\n (A1 pin 3 -> R1 pin 1)\n (R1 pin 2 -> LED1 pin 1)\n)\n`;

function build(): string {
    const ir = compile(SOURCE);
    const geometries = new Map<string, BreadboardGeometry>();
    for (const board of ir.boards) {
        geometries.set(board.id, new BreadboardGeometry(board.position.x, board.position.y));
    }
    return buildSvg(ir, geometries);
}

describe('buildSvg', () => {
    it('produces a standalone svg document', () => {
        const svg = build();
        expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
        expect(svg.endsWith('</svg>')).toBe(true);
        expect(svg).toContain('viewBox=');
    });

    it('draws the board, holes, components and wires', () => {
        const svg = build();
        expect(svg).toContain('B1');
        expect(svg).toContain('A1');
        expect(svg).toContain('7408');
        expect(svg).toContain('<polyline');
        expect(svg).toContain('<circle');
    });

    it('renders one polyline per wire', () => {
        const svg = build();
        expect(svg.match(/<polyline/g)).toHaveLength(2);
    });

    it('escapes ids and values', () => {
        const ir = compile(SOURCE);
        ir.components[0].id = 'A<1>&"';
        const svg = buildSvg(ir, new Map());
        expect(svg).not.toContain('A<1>');
        expect(svg).toContain('A&lt;1&gt;&amp;&quot;');
    });
});
