import { describe, expect, it } from 'vitest';
import { compile } from '../compiler/compiler';
import { buildBomCsv } from './Bom';

const SOURCE = `@resistor R1 330\n@resistor R2 330\n@resistor R3 10k\n@AND A1 7408\n@led LED1 red\n@board B1 breadboard_830\n`;

describe('buildBomCsv', () => {
    it('emits a header row', () => {
        const csv = buildBomCsv(compile(SOURCE));
        expect(csv.split('\n')[0]).toBe('Type,Value,Quantity,References,Description');
    });

    it('groups identical parts and lists references', () => {
        const csv = buildBomCsv(compile(SOURCE));
        expect(csv).toContain('RES,330,2,R1 R2,');
        expect(csv).toContain('RES,10k,1,R3,');
    });

    it('includes IC descriptions from the pin database', () => {
        const csv = buildBomCsv(compile(SOURCE));
        expect(csv).toContain('7408,,1,A1,Quad 2-input AND');
    });

    it('escapes values containing commas', () => {
        const ir = compile(SOURCE);
        ir.components[0].value = '1k,5%';
        const csv = buildBomCsv(ir);
        expect(csv).toContain('"1k,5%"');
    });
});
