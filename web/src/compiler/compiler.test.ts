import { describe, expect, it } from 'vitest';
import { compile, CompileError } from './compiler';
import { BreadboardGeometry } from '../geometry/BreadboardGeometry';
import { componentPinHole } from '../geometry/PinGeometry';

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

    it('supports the 74HC family and friends', () => {
        const cases: Array<[string, number]> = [
            ['74HC00', 14], ['74HC02', 14], ['74HC04', 14], ['74HC08', 14],
            ['74HC10', 14], ['74HC11', 14], ['74HC14', 14], ['74HC20', 14],
            ['74HC21', 14], ['74HC27', 14], ['74HC32', 14], ['74HC73', 14],
            ['74HC74', 14], ['74HC86', 14], ['74HC93', 14], ['74HC132', 14],
            ['74HC75', 16], ['74HC283', 16], ['74HC595', 16], ['74HC4017', 16],
            ['CD4511', 16], ['PCF8574', 16],
            ['556', 14],
            ['LM393', 8], ['LM339', 14],
        ];
        for (const [type, pins] of cases) {
            const ir = compile(`@comp U1 ${type}\n${BOARD}`);
            expect(ir.components[0].type, type).toBe(type);
            expect(ir.components[0].pinCount, type).toBe(pins);
        }
    });
});

describe('wires', () => {
    it('routes a declared connection between two components', () => {
        const ir = compile(`@resistor R1 330\n@led LED1 red\n${BOARD}\nmap (\n (R1 pin 2 -> LED1 pin 1)\n)\n`);
        expect(ir.wires).toHaveLength(1);
        expect(ir.wires[0].from.component).toBe('R1');
        expect(ir.wires[0].to.component).toBe('LED1');
    });

    it('places batteries across the power rail and routes their wires along it', () => {
        const ir = compile(`@battery BAT1 9V\n@resistor R1 330\n${BOARD}\nmap (\n (BAT1 pin 1 -> R1 pin 1)\n)\n`);
        const geo = new BreadboardGeometry(0, 0);
        const bat = ir.components.find(c => c.id === 'BAT1')!;
        const pin1 = componentPinHole(bat, 1, geo)!;
        const pin2 = componentPinHole(bat, 2, geo)!;

        // + on the positive rail of the top pair, − one rail gap below.
        expect(pin1.row).toBe('TOP+');
        expect(pin2.row).toBe('TOP-');
        expect(pin2.col).toBe(pin1.col);
        // The body hangs six columns left of the pins, so the pins start
        // at least three body lengths in and never overhang the board.
        expect(pin1.col).toBeGreaterThanOrEqual(9);

        const wire = ir.wires[0];
        expect(geo.getRowAtY(wire.from.y)).toBe('TOP+');
    });
});

describe('multi-board layouts', () => {
    const twoBoards = `@resistor R1 330\n@led LED1 red\n@board B1 breadboard_830\n@board B2 breadboard_830\nmap (\n (R1 pin 2 -> LED1 pin 1)\n)\n`;

    it('lays boards out side by side without overlap', () => {
        const ir = compile(twoBoards);
        expect(ir.boards).toHaveLength(2);
        const [b1, b2] = ir.boards;
        expect(b2.position.x).toBeGreaterThanOrEqual(b1.position.x + b1.size.width);
    });

    it('assigns components and wires to the placement board', () => {
        const ir = compile(twoBoards);
        for (const comp of ir.components) {
            expect(comp.boardId).toBe('B1');
        }
        for (const wire of ir.wires) {
            expect(wire.boardId).toBe('B1');
        }
    });

    it('does not register every component on every board', () => {
        const ir = compile(twoBoards);
        expect(ir.components).toHaveLength(2);
        // Only board B1 owns the components; B2 must remain empty.
        expect(ir.components.filter(c => c.boardId === 'B2')).toHaveLength(0);
    });
});

describe('robustness: prototype-chain names', () => {
    it('rejects prototype keys as component types with a clean diagnostic', () => {
        for (const type of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
            try {
                compile(`@board B1 breadboard_830\n@comp X ${type}\n`);
                expect.unreachable(`compile should throw for '${type}'`);
            } catch (err) {
                expect(err).toBeInstanceOf(CompileError);
                expect((err as CompileError).message).toContain(`Unknown component type: '${type}'`);
            }
        }
    });

    it('rejects prototype keys as directives', () => {
        try {
            compile('@constructor R1 330\n');
            expect.unreachable('compile should throw');
        } catch (err) {
            expect(err).toBeInstanceOf(CompileError);
            expect((err as CompileError).message).toContain("Unknown directive '@constructor'");
        }
    });

    it('caps custom IC pin counts', () => {
        const pins = Array.from({ length: 65 }, (_, i) => `P${i} -> input`).join(', ');
        try {
            compile(`def BigIC (${pins})\n@board B1 breadboard_830\n`);
            expect.unreachable('compile should throw');
        } catch (err) {
            expect(err).toBeInstanceOf(CompileError);
            expect((err as CompileError).message).toContain('64-pin limit');
        }
    });
});
