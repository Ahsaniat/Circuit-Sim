import { CircuitIR } from '../types';
import { componentSummary } from '../components/PinDatabase';
import { dict } from '../util/dict';

/**
 * Bill of materials export. Groups identical parts (same type and value)
 * and lists their references, the way a parts order would be assembled.
 */

const CATEGORY_LABELS: Record<string, string> = dict({
    ic: 'Integrated circuit',
    passive: 'Passive',
    diode: 'Diode',
    transistor: 'Transistor',
    led: 'LED',
    sensor: 'Sensor',
    switch: 'Switch',
    display: 'Display',
    buzzer: 'Buzzer',
    motor: 'Motor',
    power: 'Power',
    crystal: 'Crystal',
});

function csvCell(value: string): string {
    if (/[",\n]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

function description(type: string, category: string | undefined): string {
    return componentSummary(type) ?? (category ? CATEGORY_LABELS[category] ?? category : '');
}

export function buildBomCsv(ir: CircuitIR): string {
    interface Group {
        type: string;
        value: string;
        category?: string;
        refs: string[];
    }
    const groups = new Map<string, Group>();
    for (const comp of ir.components) {
        const key = `${comp.type}|${comp.value ?? ''}`;
        let group = groups.get(key);
        if (!group) {
            group = { type: comp.type, value: comp.value ?? '', category: comp.category, refs: [] };
            groups.set(key, group);
        }
        group.refs.push(comp.id);
    }

    const rows: string[] = ['Type,Value,Quantity,References,Description'];
    const sorted = [...groups.values()].sort((a, b) =>
        a.type === b.type ? a.value.localeCompare(b.value) : a.type.localeCompare(b.type)
    );
    for (const group of sorted) {
        group.refs.sort();
        rows.push([
            csvCell(group.type),
            csvCell(group.value),
            String(group.refs.length),
            csvCell(group.refs.join(' ')),
            csvCell(description(group.type, group.category)),
        ].join(','));
    }
    return rows.join('\n') + '\n';
}
