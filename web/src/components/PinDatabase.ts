/**
 * Pin function database for common ICs. Used by tooltips, ERC and future
 * netlist tooling. Only entries that are confidently known are included;
 * unknown pins simply have no function reported.
 */

export type PinDirection = 'input' | 'output' | 'power' | 'ground' | 'passive' | 'nc';

export interface PinInfo {
    fn: string;
    dir: PinDirection;
}

export const IC_SUMMARIES: Record<string, string> = {
    '7400': 'Quad 2-input NAND',
    '7402': 'Quad 2-input NOR',
    '7404': 'Hex inverter',
    '7408': 'Quad 2-input AND',
    '7410': 'Triple 3-input NAND',
    '7411': 'Triple 3-input AND',
    '7420': 'Dual 4-input NAND',
    '7421': 'Dual 4-input AND',
    '7427': 'Triple 3-input NOR',
    '7432': 'Quad 2-input OR',
    '7474': 'Dual D flip-flop',
    '7476': 'Dual JK flip-flop',
    '7486': 'Quad 2-input XOR',
    '7490': 'Decade counter',
    '7447': 'BCD to 7-segment decoder',
    '74138': '3-to-8 line decoder',
    '74139': 'Dual 2-to-4 decoder',
    '74148': '8-to-3 priority encoder',
    '74151': '8-to-1 multiplexer',
    '74153': 'Dual 4-to-1 multiplexer',
    '74161': '4-bit binary counter',
    '74164': '8-bit shift register',
    '74165': '8-bit parallel-in shift register',
    '74373': 'Octal D latch',
    '74374': 'Octal D flip-flop',
    '555': 'Timer',
    'NE555': 'Timer',
    '556': 'Dual timer',
    '741': 'Op-amp',
    'LM741': 'Op-amp',
    'LM358': 'Dual op-amp',
    'LM393': 'Dual comparator',
    'LM339': 'Quad comparator',
    '74HC00': 'Quad 2-input NAND (HC)',
    '74HC02': 'Quad 2-input NOR (HC)',
    '74HC04': 'Hex inverter (HC)',
    '74HC08': 'Quad 2-input AND (HC)',
    '74HC10': 'Triple 3-input NAND (HC)',
    '74HC11': 'Triple 3-input AND (HC)',
    '74HC14': 'Hex inverter, Schmitt (HC)',
    '74HC20': 'Dual 4-input NAND (HC)',
    '74HC21': 'Dual 4-input AND (HC)',
    '74HC27': 'Triple 3-input NOR (HC)',
    '74HC32': 'Quad 2-input OR (HC)',
    '74HC73': 'Dual JK flip-flop (HC)',
    '74HC74': 'Dual D flip-flop (HC)',
    '74HC86': 'Quad 2-input XOR (HC)',
    '74HC93': '4-bit binary counter (HC)',
    '74HC132': 'Quad NAND, Schmitt (HC)',
    '74HC75': '4-bit latch (HC)',
    '74HC283': '4-bit binary adder (HC)',
    '74HC595': '8-bit shift register, output latch (HC)',
    '74HC4017': 'Decade counter / decoder (HC)',
    'CD4511': 'BCD to 7-segment decoder',
    'PCF8574': 'I2C I/O expander',
};

function gate14(fn: (n: number) => string, dirs: Array<[number[], PinDirection]>): Record<number, PinInfo> {
    const pins: Record<number, PinInfo> = {};
    for (const [numbers, dir] of dirs) {
        for (const n of numbers) pins[n] = { fn: fn(n), dir };
    }
    pins[7] = { fn: 'GND', dir: 'ground' };
    pins[14] = { fn: 'VCC', dir: 'power' };
    return pins;
}

const quad2 = (prefix: string): Record<number, PinInfo> => {
    const pins: Record<number, PinInfo> = {};
    const gates = [
        { a: 1, b: 2, y: 3 },
        { a: 4, b: 5, y: 6 },
        { a: 9, b: 10, y: 8 },
        { a: 12, b: 13, y: 11 },
    ];
    gates.forEach((g, i) => {
        pins[g.a] = { fn: `${prefix}${i + 1}A`, dir: 'input' };
        pins[g.b] = { fn: `${prefix}${i + 1}B`, dir: 'input' };
        pins[g.y] = { fn: `${prefix}${i + 1}Y`, dir: 'output' };
    });
    pins[7] = { fn: 'GND', dir: 'ground' };
    pins[14] = { fn: 'VCC', dir: 'power' };
    return pins;
};

export const IC_PINS: Record<string, Record<number, PinInfo>> = {
    '7400': quad2(''),
    '7408': quad2(''),
    '7432': quad2(''),
    '7486': quad2(''),
    '7402': {
        1: { fn: '1Y', dir: 'output' }, 2: { fn: '1A', dir: 'input' }, 3: { fn: '1B', dir: 'input' },
        4: { fn: '2Y', dir: 'output' }, 5: { fn: '2A', dir: 'input' }, 6: { fn: '2B', dir: 'input' },
        7: { fn: 'GND', dir: 'ground' },
        8: { fn: '3A', dir: 'input' }, 9: { fn: '3B', dir: 'input' }, 10: { fn: '3Y', dir: 'output' },
        11: { fn: '4A', dir: 'input' }, 12: { fn: '4B', dir: 'input' }, 13: { fn: '4Y', dir: 'output' },
        14: { fn: 'VCC', dir: 'power' },
    },
    '7404': {
        1: { fn: '1A', dir: 'input' }, 2: { fn: '1Y', dir: 'output' },
        3: { fn: '2A', dir: 'input' }, 4: { fn: '2Y', dir: 'output' },
        5: { fn: '3A', dir: 'input' }, 6: { fn: '3Y', dir: 'output' },
        7: { fn: 'GND', dir: 'ground' },
        8: { fn: '4Y', dir: 'output' }, 9: { fn: '4A', dir: 'input' },
        10: { fn: '5Y', dir: 'output' }, 11: { fn: '5A', dir: 'input' },
        12: { fn: '6Y', dir: 'output' }, 13: { fn: '6A', dir: 'input' },
        14: { fn: 'VCC', dir: 'power' },
    },
    '7410': gate14(
        n => ({ 1: '1A', 2: '1B', 3: '2A', 4: '2B', 5: '2C', 6: '2Y', 8: '3Y', 9: '3A', 10: '3B', 11: '3C', 12: '1Y', 13: '1C' }[n] ?? String(n)),
        [
            [[1, 2, 13], 'input'], [[12], 'output'],
            [[3, 4, 5], 'input'], [[6], 'output'],
            [[9, 10, 11], 'input'], [[8], 'output'],
        ]
    ),
    '7411': gate14(
        n => ({ 1: '1A', 2: '1B', 3: '2A', 4: '2B', 5: '2C', 6: '2Y', 8: '3Y', 9: '3A', 10: '3B', 11: '3C', 12: '1Y', 13: '1C' }[n] ?? String(n)),
        [
            [[1, 2, 13], 'input'], [[12], 'output'],
            [[3, 4, 5], 'input'], [[6], 'output'],
            [[9, 10, 11], 'input'], [[8], 'output'],
        ]
    ),
    '7427': gate14(
        n => ({ 1: '1A', 2: '1B', 3: '2A', 4: '2B', 5: '2C', 6: '2Y', 8: '3Y', 9: '3A', 10: '3B', 11: '3C', 12: '1Y', 13: '1C' }[n] ?? String(n)),
        [
            [[1, 2, 13], 'input'], [[12], 'output'],
            [[3, 4, 5], 'input'], [[6], 'output'],
            [[9, 10, 11], 'input'], [[8], 'output'],
        ]
    ),
    '7420': gate14(
        n => ({ 1: '1A', 2: '1B', 4: '1C', 5: '1D', 6: '1Y', 8: '2Y', 9: '2A', 10: '2B', 12: '2C', 13: '2D' }[n] ?? String(n)),
        [
            [[1, 2, 4, 5], 'input'], [[6], 'output'],
            [[9, 10, 12, 13], 'input'], [[8], 'output'],
        ]
    ),
    '7421': gate14(
        n => ({ 1: '1A', 2: '1B', 4: '1C', 5: '1D', 6: '1Y', 8: '2Y', 9: '2A', 10: '2B', 12: '2C', 13: '2D' }[n] ?? String(n)),
        [
            [[1, 2, 4, 5], 'input'], [[6], 'output'],
            [[9, 10, 12, 13], 'input'], [[8], 'output'],
        ]
    ),
    '7474': {
        1: { fn: '1CLR', dir: 'input' }, 2: { fn: '1D', dir: 'input' },
        3: { fn: '1CLK', dir: 'input' }, 4: { fn: '1PRE', dir: 'input' },
        5: { fn: '1Q', dir: 'output' }, 6: { fn: '1Q̅', dir: 'output' },
        7: { fn: 'GND', dir: 'ground' },
        8: { fn: '2Q̅', dir: 'output' }, 9: { fn: '2Q', dir: 'output' },
        10: { fn: '2PRE', dir: 'input' }, 11: { fn: '2CLK', dir: 'input' },
        12: { fn: '2D', dir: 'input' }, 13: { fn: '2CLR', dir: 'input' },
        14: { fn: 'VCC', dir: 'power' },
    },
    '555': {
        1: { fn: 'GND', dir: 'ground' }, 2: { fn: 'TRIG', dir: 'input' },
        3: { fn: 'OUT', dir: 'output' }, 4: { fn: 'RESET', dir: 'input' },
        5: { fn: 'CTRL', dir: 'input' }, 6: { fn: 'THRESH', dir: 'input' },
        7: { fn: 'DISCH', dir: 'output' }, 8: { fn: 'VCC', dir: 'power' },
    },
    'NE555': {
        1: { fn: 'GND', dir: 'ground' }, 2: { fn: 'TRIG', dir: 'input' },
        3: { fn: 'OUT', dir: 'output' }, 4: { fn: 'RESET', dir: 'input' },
        5: { fn: 'CTRL', dir: 'input' }, 6: { fn: 'THRESH', dir: 'input' },
        7: { fn: 'DISCH', dir: 'output' }, 8: { fn: 'VCC', dir: 'power' },
    },
    '741': {
        1: { fn: 'OFFSET N1', dir: 'input' }, 2: { fn: 'IN-', dir: 'input' },
        3: { fn: 'IN+', dir: 'input' }, 4: { fn: 'V-', dir: 'ground' },
        5: { fn: 'OFFSET N2', dir: 'input' }, 6: { fn: 'OUT', dir: 'output' },
        7: { fn: 'V+', dir: 'power' }, 8: { fn: 'NC', dir: 'nc' },
    },
    'LM741': {
        1: { fn: 'OFFSET N1', dir: 'input' }, 2: { fn: 'IN-', dir: 'input' },
        3: { fn: 'IN+', dir: 'input' }, 4: { fn: 'V-', dir: 'ground' },
        5: { fn: 'OFFSET N2', dir: 'input' }, 6: { fn: 'OUT', dir: 'output' },
        7: { fn: 'V+', dir: 'power' }, 8: { fn: 'NC', dir: 'nc' },
    },
    'LM358': {
        1: { fn: 'OUT1', dir: 'output' }, 2: { fn: 'IN1-', dir: 'input' },
        3: { fn: 'IN1+', dir: 'input' }, 4: { fn: 'GND', dir: 'ground' },
        5: { fn: 'IN2+', dir: 'input' }, 6: { fn: 'IN2-', dir: 'input' },
        7: { fn: 'OUT2', dir: 'output' }, 8: { fn: 'VCC', dir: 'power' },
    },
};

const CUSTOM_IC_PINS = new Map<string, Record<number, PinInfo>>();

/** Register pins from a `def` declaration so tooltips/ERC know them. */
export function registerCustomIC(name: string, pins: Array<{ name: string; type: string }>): void {
    const map: Record<number, PinInfo> = {};
    const dirFor = (type: string): PinDirection => {
        switch (type) {
            case 'input': return 'input';
            case 'output': return 'output';
            case 'gnd': return 'ground';
            default: return 'power';
        }
    };
    pins.forEach((pin, index) => {
        map[index + 1] = { fn: pin.name, dir: dirFor(pin.type) };
    });
    CUSTOM_IC_PINS.set(name, map);
}

export function pinInfo(type: string, pin: number): PinInfo | undefined {
    return CUSTOM_IC_PINS.get(type)?.[pin] ?? IC_PINS[type]?.[pin];
}

export function pinFunction(type: string, pin: number): string | undefined {
    return pinInfo(type, pin)?.fn;
}

export function componentSummary(type: string): string | undefined {
    return CUSTOM_IC_PINS.has(type) ? 'Custom IC' : IC_SUMMARIES[type];
}

/** Pins that drive the net (for contention checks). */
export function outputPins(type: string): number[] {
    const pins = CUSTOM_IC_PINS.get(type) ?? IC_PINS[type];
    if (!pins) return [];
    return Object.entries(pins)
        .filter(([, info]) => info.dir === 'output')
        .map(([pin]) => parseInt(pin, 10));
}
