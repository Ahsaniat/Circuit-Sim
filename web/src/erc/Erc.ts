import { CircuitIR, ComponentIR } from '../types';
import { Netlist } from '../simulation/Netlist';

/**
 * Electrical Rule Check. Operates on the extracted netlist and reports
 * problems a real breadboard build would suffer from.
 */

export type ErcSeverity = 'error' | 'warning' | 'info';

export interface ErcIssue {
    severity: ErcSeverity;
    message: string;
    componentId?: string;
}

/** DIP power pin pairs by pin count: [positive, ground]. */
const DIP_POWER_PINS: Record<number, [number, number]> = {
    8: [8, 4],
    14: [14, 7],
    16: [16, 8],
    20: [20, 10],
    24: [24, 12],
};

function pinsOnNet(netlist: Netlist, netId: number): string[] {
    return netlist.nets[netId]?.pins ?? [];
}

function componentOfPin(pinKey: string): string {
    return pinKey.split(':')[0];
}

export function runErc(ir: CircuitIR, netlist: Netlist, unsupported: Set<string> = new Set()): ErcIssue[] {
    const issues: ErcIssue[] = [];
    const seen = new Set<string>();
    const add = (issue: ErcIssue): void => {
        const key = `${issue.severity}:${issue.message}`;
        if (seen.has(key)) return;
        seen.add(key);
        issues.push(issue);
    };

    const byId = new Map<string, ComponentIR>();
    for (const comp of ir.components) byId.set(comp.id, comp);

    // 1. Short circuits: a net driven both high and low.
    for (const net of netlist.nets) {
        if (net.conflict) {
            add({
                severity: 'error',
                message: 'Short circuit: a net is driven both high and low (check power rail wiring)',
            });
        }
    }

    // 2. IC power pins not connected to any driven net.
    for (const comp of ir.components) {
        if (comp.category !== 'ic') continue;
        const pair = DIP_POWER_PINS[comp.pinCount];
        if (!pair) continue;
        const vccNet = netlist.pinNet.get(`${comp.id}:${pair[0]}`);
        const gndNet = netlist.pinNet.get(`${comp.id}:${pair[1]}`);
        const powered = [vccNet, gndNet].some(netId =>
            netId !== undefined && netlist.nets[netId]?.power !== undefined
        );
        if (!powered) {
            add({
                severity: 'warning',
                message: `${comp.id}: IC power pins (${pair[0]}/VCC, ${pair[1]}/GND) are not connected to a power source`,
                componentId: comp.id,
            });
        }
    }

    // 3. LEDs without a series resistor on either side.
    for (const comp of ir.components) {
        if (comp.category !== 'led') continue;
        const nets = [netlist.pinNet.get(`${comp.id}:1`), netlist.pinNet.get(`${comp.id}:2`)];
        const hasResistor = nets.some(netId =>
            netId !== undefined && pinsOnNet(netlist, netId).some(pin => byId.get(componentOfPin(pin))?.type === 'RES')
        );
        if (!hasResistor) {
            add({
                severity: 'warning',
                message: `${comp.id}: LED has no series resistor; add one to limit current`,
                componentId: comp.id,
            });
        }
    }

    // 4. Floating two-pin components (nothing else on either net).
    for (const comp of ir.components) {
        if (comp.pinCount !== 2) continue;
        if (!['passive', 'led', 'diode'].includes(comp.category ?? '')) continue;
        const connected = [1, 2].some(pin => {
            const netId = netlist.pinNet.get(`${comp.id}:${pin}`);
            if (netId === undefined) return false;
            const net = netlist.nets[netId];
            // Other component pins on the net, or a wire landing on it.
            const hasOtherPins = net.pins.some(p => !p.startsWith(`${comp.id}:`));
            return hasOtherPins || netlist.wireNet.includes(netId);
        });
        if (!connected) {
            add({
                severity: 'warning',
                message: `${comp.id}: unconnected component`,
                componentId: comp.id,
            });
        }
    }

    // 5. No power source actually wired into the circuit.
    const powerInUse = netlist.nets.some(net =>
        net.power !== undefined &&
        (net.pins.length > 0 || netlist.wireNet.includes(net.id))
    );
    if (!powerInUse) {
        add({
            severity: 'info',
            message: 'No power source found: connect a battery or wire the power rails',
        });
    }

    // 6. Components without a simulation model.
    for (const id of unsupported) {
        add({
            severity: 'info',
            message: `${id}: no simulation model yet; outputs are treated as unknown`,
            componentId: id,
        });
    }

    return issues;
}
