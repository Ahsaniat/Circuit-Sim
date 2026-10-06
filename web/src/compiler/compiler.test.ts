import { describe, expect, it } from 'vitest';
import { compile, CompileError } from './compiler';

const BOARD = '@board B1 breadboard_830\n';

describe('lexer: component values', () => {
    it('preserves plain numeric values', () => {
        const ir = compile(`@resistor R1 330\n${BOARD}`);
        expect(ir.components[0].value).toBe('330');
    });

    it('preserves kilo and mega suffixes', () => {
        expect(compile(`@resistor R1 10k\n${BOARD}`).components[0].value).toBe('10k');
        expect(compile(`@resistor R1 1M\n${BOARD}`).components[0].value).toBe('1M');
    });

    it('preserves decimal values with suffixes', () => {
        expect(compile(`@resistor R1 4.7k\n${BOARD}`).components[0].value).toBe('4.7k');
    });

    it('preserves unit suffixes', () => {
        expect(compile(`@capacitor C1 100uF\n${BOARD}`).components[0].value).toBe('100uF');
        expect(compile(`@crystal Y1 16MHz\n${BOARD}`).components[0].value).toBe('16MHz');
    });

    it('preserves alphanumeric part numbers', () => {
        expect(compile(`@npn Q1 2N2222\n${BOARD}`).components[0].value).toBe('2N2222');
    });
});

describe('lexer/parser: strict errors', () => {
    it('rejects unknown directives with location', () => {
        try {
            compile('@resistr R1 330\n');
            expect.unreachable('compile should throw');
        } catch (err) {
            expect(err).toBeInstanceOf(CompileError);
            expect((err as CompileError).message).toContain("Unknown directive '@resistr'");
            expect((err as CompileError).line).toBe(1);
            expect((err as CompileError).column).toBe(1);
        }
    });

    it('rejects stray tokens instead of discarding them', () => {
        expect(() => compile('this is not a circuit\n')).toThrowError(/Unexpected token/);
    });
});

describe('component keywords', () => {
    const cases: Array<[string, string, number, string]> = [
        ['@resistor R1 10k', 'R1', 2, 'passive'],
        ['@capacitor C1 100uF', 'C1', 2, 'passive'],
        ['@diode D1 1N4148', 'D1', 2, 'diode'],
        ['@led LED1 red', 'LED1', 2, 'led'],
        ['@npn Q1 2N2222', 'Q1', 3, 'transistor'],
        ['@AND A1 7408', 'A1', 14, 'ic'],
        ['@switch_spst SW1 SPST', 'SW1', 2, 'switch'],
        ['@switch_spdt SW2 SPDT', 'SW2', 3, 'switch'],
        ['@pushbutton BTN1 PUSHBUTTON', 'BTN1', 4, 'switch'],
        ['@display_7seg DSP1 7SEG', 'DSP1', 10, 'display'],
        ['@buzzer BZ1 ACTIVE', 'BZ1', 2, 'buzzer'],
        ['@passive_buzzer BZ2 PASSIVE', 'BZ2', 2, 'buzzer'],
        ['@motor_dc M1 DC', 'M1', 2, 'motor'],
        ['@servo S1 SERVO', 'S1', 3, 'motor'],
        ['@battery BAT1 9V', 'BAT1', 2, 'power'],
        ['@regulator VR1 LM7805', 'VR1', 3, 'power'],
        ['@crystal Y1 16MHz', 'Y1', 2, 'crystal'],
    ];

    for (const [source, id, pinCount, category] of cases) {
        it(`compiles ${source.split(' ')[0]}`, () => {
            const ir = compile(`${source}\n${BOARD}`);
            const comp = ir.components.find(c => c.id === id);
            expect(comp).toBeDefined();
            expect(comp!.pinCount).toBe(pinCount);
            expect(comp!.category).toBe(category);
        });
    }

    it('maps variant tokens to renderer types', () => {
        expect(compile(`@pushbutton BTN1 PUSHBUTTON\n${BOARD}`).components[0].type).toBe('PUSHBUTTON');
        expect(compile(`@servo S1 SERVO\n${BOARD}`).components[0].type).toBe('SERVO');
        expect(compile(`@regulator VR1 LM7805\n${BOARD}`).components[0].type).toBe('REGULATOR');
        expect(compile(`@switch_spdt SW2 SPDT\n${BOARD}`).components[0].type).toBe('SPDT');
    });
});

describe('wires', () => {
    it('routes a declared connection between two components', () => {
        const ir = compile(`@resistor R1 330\n@led LED1 red\n${BOARD}\nmap (\n (R1 pin 2 -> LED1 pin 1)\n)\n`);
        expect(ir.wires).toHaveLength(1);
        expect(ir.wires[0].from.component).toBe('R1');
        expect(ir.wires[0].to.component).toBe('LED1');
    });
});
