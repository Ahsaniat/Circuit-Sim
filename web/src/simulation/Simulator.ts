import { CircuitIR } from '../types';
import { Netlist } from './Netlist';

/**
 * Digital simulation of the extracted netlist.
 *
 * Values are 0, 1, X (unknown/conflict) and Z (floating). Combinational
 * 74xx gate models settle to a fixed point; oscillating circuits are
 * reported as unstable instead of hanging.
 */

export type LogicValue = 0 | 1 | 'X' | 'Z';

export interface SimulationResult {
    netValues: LogicValue[];
    litLeds: Set<string>;
    activeBuzzers: Set<string>;
    /** True when the circuit oscillated past the iteration limit. */
    unstable: boolean;
    iterations: number;
    unsupported: Set<string>;
}

type GateOp = 'AND' | 'OR' | 'XOR' | 'NAND' | 'NOR' | 'NOT';

interface GateDef {
    inputs: number[];
    output: number;
    op: GateOp;
}

/**
 * Pin-level gate maps for the 74xx family. Pins not listed (power, unused
 * gates) are ignored.
 */
const GATE_MODELS: Record<string, GateDef[]> = {
    '7400': quad2('NAND'),
    '7408': quad2('AND'),
    '7432': quad2('OR'),
    '7486': quad2('XOR'),
    '7402': [
        { inputs: [2, 3], output: 1, op: 'NOR' },
        { inputs: [5, 6], output: 4, op: 'NOR' },
        { inputs: [8, 9], output: 10, op: 'NOR' },
        { inputs: [11, 12], output: 13, op: 'NOR' },
    ],
    '7404': [
        { inputs: [1], output: 2, op: 'NOT' },
        { inputs: [3], output: 4, op: 'NOT' },
        { inputs: [5], output: 6, op: 'NOT' },
        { inputs: [9], output: 8, op: 'NOT' },
        { inputs: [11], output: 10, op: 'NOT' },
        { inputs: [13], output: 12, op: 'NOT' },
    ],
    '7410': triple3('NAND'),
    '7411': triple3('AND'),
    '7427': triple3('NOR'),
    '7420': [
        { inputs: [1, 2, 4, 5], output: 6, op: 'NAND' },
        { inputs: [9, 10, 12, 13], output: 8, op: 'NAND' },
    ],
    '7421': [
        { inputs: [1, 2, 4, 5], output: 6, op: 'AND' },
        { inputs: [9, 10, 12, 13], output: 8, op: 'AND' },
    ],
};

function quad2(op: GateOp): GateDef[] {
    return [
        { inputs: [1, 2], output: 3, op },
        { inputs: [4, 5], output: 6, op },
        { inputs: [9, 10], output: 8, op },
        { inputs: [12, 13], output: 11, op },
    ];
}

function triple3(op: GateOp): GateDef[] {
    return [
        { inputs: [1, 2, 13], output: 12, op },
        { inputs: [3, 4, 5], output: 6, op },
        { inputs: [9, 10, 11], output: 8, op },
    ];
}

function evalGate(op: GateOp, inputs: LogicValue[]): LogicValue {
    // A floating or unknown input makes the output unknown.
    if (inputs.some(v => v === 'X' || v === 'Z')) return 'X';
    const bits = inputs as Array<0 | 1>;
    switch (op) {
        case 'AND': return bits.every(b => b === 1) ? 1 : 0;
        case 'NAND': return bits.every(b => b === 1) ? 0 : 1;
        case 'OR': return bits.some(b => b === 1) ? 1 : 0;
        case 'NOR': return bits.some(b => b === 1) ? 0 : 1;
        case 'XOR': {
            const parity = bits.reduce((acc: number, b) => acc ^ b, 0);
            return (parity & 1) as 0 | 1;
        }
        case 'NOT': return bits[0] === 1 ? 0 : 1;
    }
}

export function simulate(ir: CircuitIR, netlist: Netlist): SimulationResult {
    const values: LogicValue[] = new Array(netlist.nets.length).fill('Z');
    const locked = new Set<number>();
    const unsupported = new Set<string>();

    // Seed power nets.
    for (const net of netlist.nets) {
        if (net.conflict) {
            values[net.id] = 'X';
            locked.add(net.id);
        } else if (net.power !== undefined) {
            values[net.id] = net.power;
            locked.add(net.id);
        }
    }

    // Build drivers with resolved net ids.
    interface ResolvedGate {
        inputs: number[];
        output: number;
        op: GateOp;
    }
    const resolved: ResolvedGate[] = [];
    const netOf = (pinKey: string): number | undefined => netlist.pinNet.get(pinKey);
    for (const comp of ir.components) {
        const model = GATE_MODELS[comp.type];
        if (!model) {
            if (comp.category === 'ic') {
                unsupported.add(comp.id);
            }
            continue;
        }
        for (const def of model) {
            const inputs = def.inputs.map(p => netOf(`${comp.id}:${p}`));
            const output = netOf(`${comp.id}:${def.output}`);
            if (inputs.some(i => i === undefined) || output === undefined) continue;
            resolved.push({ inputs: inputs as number[], output, op: def.op });
        }
    }

    let changed = true;
    let iterations = 0;
    const MAX_ITERATIONS = 200;
    while (changed && iterations < MAX_ITERATIONS) {
        changed = false;
        iterations++;
        for (const gate of resolved) {
            if (locked.has(gate.output)) continue;
            const out = evalGate(gate.op, gate.inputs.map(i => values[i]));
            if (values[gate.output] !== out) {
                values[gate.output] = out;
                changed = true;
            }
        }
    }

    const unstable = changed;
    if (unstable) {
        for (const gate of resolved) {
            if (!locked.has(gate.output)) {
                values[gate.output] = 'X';
            }
        }
    }

    // Passive indicators.
    const litLeds = new Set<string>();
    const activeBuzzers = new Set<string>();
    for (const comp of ir.components) {
        if (comp.category === 'led') {
            const anode = netOf(`${comp.id}:1`);
            const cathode = netOf(`${comp.id}:2`);
            if (anode !== undefined && cathode !== undefined &&
                values[anode] === 1 && values[cathode] === 0) {
                litLeds.add(comp.id);
            }
        }
        if (comp.category === 'buzzer') {
            const plus = netOf(`${comp.id}:1`);
            const minus = netOf(`${comp.id}:2`);
            if (plus !== undefined && minus !== undefined &&
                values[plus] === 1 && values[minus] === 0) {
                activeBuzzers.add(comp.id);
            }
        }
    }

    return { netValues: values, litLeds, activeBuzzers, unstable, iterations, unsupported };
}
