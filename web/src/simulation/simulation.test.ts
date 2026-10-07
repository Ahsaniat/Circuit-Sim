import { describe, expect, it } from 'vitest';
import { compile } from '../compiler/compiler';
import { BreadboardGeometry } from '../geometry/BreadboardGeometry';
import { CircuitIR } from '../types';
import { extractNetlist, pinHole } from './Netlist';
import { simulate } from './Simulator';

function buildIr(source: string): { ir: CircuitIR; geometries: Map<string, BreadboardGeometry> } {
    const ir = compile(source);
    const geometries = new Map<string, BreadboardGeometry>();
    for (const board of ir.boards) {
        geometries.set(board.id, new BreadboardGeometry(board.position.x, board.position.y));
    }
    return { ir, geometries };
}

function drive(wire: { from: { x: number; y: number } }, geo: BreadboardGeometry, col: number, rail: string): void {
    const hole = geo.getHolePosition(col, rail);
    wire.from.x = hole.x;
    wire.from.y = hole.y;
}

describe('pinHole', () => {
    it('maps IC pins to rows E and F', () => {
        const { ir, geometries } = buildIr(`@AND A1 7408\n@board B1 breadboard_830\n`);
        const geo = geometries.get('B1')!;
        const comp = ir.components[0];
        const pin1 = pinHole(comp, 1, geo);
        const pin14 = pinHole(comp, 14, geo);
        expect(pin1?.row).toBe('F');
        expect(pin14?.row).toBe('E');
        expect(pin1?.col).toBe(pin14?.col);
    });

    it('maps two-pin components across their span', () => {
        const { ir, geometries } = buildIr(`@resistor R1 330\n@board B1 breadboard_830\n`);
        const geo = geometries.get('B1')!;
        const comp = ir.components[0];
        const pin1 = pinHole(comp, 1, geo);
        const pin2 = pinHole(comp, 2, geo);
        expect(pin1).not.toBeNull();
        expect(pin2).not.toBeNull();
        // A resistor spans three holes (pin at each end).
        expect(pin2!.col).toBe(pin1!.col + 2);
    });
});

describe('simulation: AND gate', () => {
    function andGate(a: 0 | 1, b: 0 | 1): string {
        const { ir, geometries } = buildIr(
            `@AND A1 7408\n@board B1 breadboard_830\nmap (\n (B1 pin 1 -> A1 pin 1)\n (B1 pin 2 -> A1 pin 2)\n)\n`
        );
        const geo = geometries.get('B1')!;
        drive(ir.wires[0], geo, 3, a === 1 ? 'TOP+' : 'TOP-');
        drive(ir.wires[1], geo, 4, b === 1 ? 'TOP+' : 'TOP-');
        const netlist = extractNetlist(ir, geometries);
        const result = simulate(ir, netlist);
        const out = result.netValues[netlist.pinNet.get('A1:3')!];
        return String(out);
    }

    it('implements the truth table', () => {
        expect(andGate(0, 0)).toBe('0');
        expect(andGate(0, 1)).toBe('0');
        expect(andGate(1, 0)).toBe('0');
        expect(andGate(1, 1)).toBe('1');
    });
});

describe('simulation: NAND and NOT', () => {
    it('inverts through a 7400', () => {
        const { ir, geometries } = buildIr(
            `@NAND NA1 7400\n@board B1 breadboard_830\nmap (\n (B1 pin 1 -> NA1 pin 1)\n (B1 pin 2 -> NA1 pin 2)\n)\n`
        );
        const geo = geometries.get('B1')!;
        drive(ir.wires[0], geo, 3, 'TOP+');
        drive(ir.wires[1], geo, 4, 'TOP+');
        const netlist = extractNetlist(ir, geometries);
        const result = simulate(ir, netlist);
        expect(result.netValues[netlist.pinNet.get('NA1:3')!]).toBe(0);
    });

    it('reports X for a floating input', () => {
        const { ir, geometries } = buildIr(
            `@AND A1 7408\n@board B1 breadboard_830\nmap (\n (B1 pin 1 -> A1 pin 1)\n)\n`
        );
        const geo = geometries.get('B1')!;
        drive(ir.wires[0], geo, 3, 'TOP+');
        const netlist = extractNetlist(ir, geometries);
        const result = simulate(ir, netlist);
        expect(result.netValues[netlist.pinNet.get('A1:3')!]).toBe('X');
    });
});

describe('simulation: indicators', () => {
    it('lights an LED driven high with cathode grounded', () => {
        const { ir, geometries } = buildIr(
            `@AND A1 7408\n@led LED1 red\n@board B1 breadboard_830\n` +
            `map (\n (B1 pin 1 -> A1 pin 1)\n (B1 pin 2 -> A1 pin 2)\n (A1 pin 3 -> LED1 pin 1)\n (B1 pin 3 -> LED1 pin 2)\n)\n`
        );
        const geo = geometries.get('B1')!;
        drive(ir.wires[0], geo, 3, 'TOP+');
        drive(ir.wires[1], geo, 4, 'TOP+');
        drive(ir.wires[3], geo, 5, 'TOP-');
        const netlist = extractNetlist(ir, geometries);
        const result = simulate(ir, netlist);
        expect(result.litLeds.has('LED1')).toBe(true);
    });

    it('leaves the LED dark when the gate output is low', () => {
        const { ir, geometries } = buildIr(
            `@AND A1 7408\n@led LED1 red\n@board B1 breadboard_830\n` +
            `map (\n (B1 pin 1 -> A1 pin 1)\n (B1 pin 2 -> A1 pin 2)\n (A1 pin 3 -> LED1 pin 1)\n (B1 pin 3 -> LED1 pin 2)\n)\n`
        );
        const geo = geometries.get('B1')!;
        drive(ir.wires[0], geo, 3, 'TOP+');
        drive(ir.wires[1], geo, 4, 'TOP-');
        drive(ir.wires[3], geo, 5, 'TOP-');
        const netlist = extractNetlist(ir, geometries);
        const result = simulate(ir, netlist);
        expect(result.litLeds.has('LED1')).toBe(false);
    });
});

describe('simulation: power sources', () => {
    it('drives nets from a battery', () => {
        const { ir, geometries } = buildIr(
            `@battery BAT1 9V\n@resistor R1 330\n@board B1 breadboard_830\nmap (\n (BAT1 pin 1 -> R1 pin 1)\n)\n`
        );
        const netlist = extractNetlist(ir, geometries);
        const result = simulate(ir, netlist);
        expect(result.netValues[netlist.pinNet.get('R1:1')!]).toBe(1);
        expect(result.netValues[netlist.pinNet.get('BAT1:2')!]).toBe(0);
    });

    it('flags nets driven both high and low as a conflict', () => {
        const { ir, geometries } = buildIr(
            `@resistor R1 330\n@board B1 breadboard_830\nmap (\n (B1 pin 1 -> R1 pin 1)\n)\n`
        );
        const geo = geometries.get('B1')!;
        drive(ir.wires[0], geo, 3, 'TOP+');
        const netlist = extractNetlist(ir, geometries);
        const net = netlist.nets[netlist.pinNet.get('R1:1')!];
        expect(net.power).toBe(1);
    });

    it('reports unsupported ICs', () => {
        const { ir, geometries } = buildIr(`@comp T1 555\n@board B1 breadboard_830\n`);
        const netlist = extractNetlist(ir, geometries);
        const result = simulate(ir, netlist);
        expect(result.unsupported.has('T1')).toBe(true);
    });
});
