import { describe, expect, it } from 'vitest';
import { compile } from '../compiler/compiler';
import { BreadboardGeometry } from '../geometry/BreadboardGeometry';
import { extractNetlist } from '../simulation/Netlist';
import { CircuitIR } from '../types';
import { runErc } from './Erc';

function analyze(source: string, mutate?: (ir: CircuitIR, geo: BreadboardGeometry) => void) {
    const ir = compile(source);
    const geometries = new Map<string, BreadboardGeometry>();
    for (const board of ir.boards) {
        geometries.set(board.id, new BreadboardGeometry(board.position.x, board.position.y));
    }
    const geo = geometries.get('B1');
    if (mutate && geo) mutate(ir, geo);
    const netlist = extractNetlist(ir, geometries);
    return { ir, netlist, issues: runErc(ir, netlist) };
}

function driveTo(ir: CircuitIR, geo: BreadboardGeometry, wireIndex: number, col: number, rail: string): void {
    const hole = geo.getHolePosition(col, rail);
    ir.wires[wireIndex].from.x = hole.x;
    ir.wires[wireIndex].from.y = hole.y;
}

describe('ERC: short circuits', () => {
    it('reports a net driven both high and low', () => {
        const { issues } = analyze(
            `@resistor R1 330\n@board B1 breadboard_830\nmap (\n (B1 pin 1 -> R1 pin 1)\n (B1 pin 2 -> R1 pin 1)\n)\n`,
            (ir, geo) => {
                driveTo(ir, geo, 0, 3, 'TOP+');
                driveTo(ir, geo, 1, 4, 'TOP-');
            }
        );
        expect(issues.some(i => i.severity === 'error' && /Short circuit/.test(i.message))).toBe(true);
    });
});

describe('ERC: power', () => {
    it('warns when IC power pins are unconnected', () => {
        const { issues } = analyze(
            `@AND A1 7408\n@board B1 breadboard_830\nmap (\n (B1 pin 1 -> A1 pin 1)\n)\n`
        );
        expect(issues.some(i => i.severity === 'warning' && i.componentId === 'A1' && /power pins/.test(i.message))).toBe(true);
    });

    it('reports when there is no power source at all', () => {
        const { issues } = analyze(`@AND A1 7408\n@board B1 breadboard_830\n`);
        expect(issues.some(i => i.severity === 'info' && /No power source/.test(i.message))).toBe(true);
    });
});

describe('ERC: components', () => {
    it('warns about an LED without a series resistor', () => {
        const { issues } = analyze(
            `@battery BAT1 9V\n@led LED1 red\n@board B1 breadboard_830\n` +
            `map (\n (BAT1 pin 1 -> LED1 pin 1)\n (BAT1 pin 2 -> LED1 pin 2)\n)\n`
        );
        expect(issues.some(i => i.severity === 'warning' && i.componentId === 'LED1' && /series resistor/.test(i.message))).toBe(true);
    });

    it('warns about unconnected two-pin components', () => {
        const { issues } = analyze(`@resistor R1 330\n@board B1 breadboard_830\n`);
        expect(issues.some(i => i.severity === 'warning' && i.componentId === 'R1' && /unconnected/.test(i.message))).toBe(true);
    });

    it('passes a clean battery + resistor + LED circuit', () => {
        const { issues } = analyze(
            `@battery BAT1 9V\n@resistor R1 330\n@led LED1 red\n@board B1 breadboard_830\n` +
            `map (\n (BAT1 pin 1 -> R1 pin 1)\n (R1 pin 2 -> LED1 pin 1)\n (BAT1 pin 2 -> LED1 pin 2)\n)\n`
        );
        expect(issues.filter(i => i.severity === 'error')).toHaveLength(0);
        expect(issues.filter(i => i.severity === 'warning')).toHaveLength(0);
    });

    it('lists unsupported components for simulation', () => {
        const { ir, netlist } = analyze(`@comp T1 555\n@board B1 breadboard_830\n`);
        const issues = runErc(ir, netlist, new Set(['T1']));
        expect(issues.some(i => i.severity === 'info' && i.componentId === 'T1')).toBe(true);
    });
});
