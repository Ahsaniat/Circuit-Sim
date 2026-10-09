import { describe, expect, it } from 'vitest';
import { applyCanvasEdits, CanvasEditBuffer, type CanvasEdit } from './CanvasEdits';

const SOURCE = `// Demo circuit
@battery BAT1 9V
@resistor R1 330
@led LED1 red
@board B1 breadboard_830

B1.map (
    (BAT1 pin 1 -> R1 pin 1, LED1 pin 1)
    (R1 pin 2 -> LED1 pin 2)
    (BAT1 pin 2 -> LED1 pin 2)
)
`;

describe('applyCanvasEdits: additions', () => {
    it('inserts a new declaration after the last one, before the map', () => {
        const { code, applied, failed } = applyCanvasEdits(SOURCE, [
            { kind: 'add', id: 'R2', declaration: '@resistor R2 10k' },
        ]);
        expect(failed).toHaveLength(0);
        expect(applied).toHaveLength(1);
        const lines = code.split('\n');
        const index = lines.findIndex(line => line.includes('@resistor R2 10k'));
        expect(index).toBeGreaterThan(0);
        expect(lines[index - 1]).toContain('@board B1');
        expect(code.indexOf('@resistor R2 10k')).toBeLessThan(code.indexOf('B1.map'));
    });

    it('rejects text that is not a declaration', () => {
        const { failed } = applyCanvasEdits(SOURCE, [
            { kind: 'add', id: 'X', declaration: 'not a component' },
        ]);
        expect(failed).toHaveLength(1);
    });
});

describe('applyCanvasEdits: removals', () => {
    it('removes the declaration and every connection of the component', () => {
        const { code, failed } = applyCanvasEdits(SOURCE, [{ kind: 'remove', id: 'R1' }]);
        expect(failed).toHaveLength(0);
        expect(code).not.toContain('@resistor R1 330');
        expect(code).toContain('(BAT1 pin 1 -> LED1 pin 1)');
        expect(code).not.toContain('R1 pin');
    });

    it('fails cleanly when the declaration does not exist', () => {
        const { code, failed } = applyCanvasEdits(SOURCE, [{ kind: 'remove', id: 'GHOST' }]);
        expect(failed).toHaveLength(1);
        expect(code).toBe(SOURCE);
    });

    it('keeps the remaining destinations when a component is removed', () => {
        const { code } = applyCanvasEdits(SOURCE, [{ kind: 'remove', id: 'LED1' }]);
        expect(code).toContain('(BAT1 pin 1 -> R1 pin 1)');
        expect(code).not.toContain('LED1');
    });

    it('removes whole entries without leaving whitespace-only lines', () => {
        const { code } = applyCanvasEdits(SOURCE, [{ kind: 'remove', id: 'R1' }]);
        expect(code).not.toMatch(/\n[ \t]+\n/);
    });
});

describe('applyCanvasEdits: disconnects', () => {
    it('drops one destination from a multi-destination entry', () => {
        const { code, failed } = applyCanvasEdits(SOURCE, [
            { kind: 'disconnect', from: { component: 'BAT1', pin: 1 }, to: { component: 'LED1', pin: 1 } },
        ]);
        expect(failed).toHaveLength(0);
        expect(code).toContain('(BAT1 pin 1 -> R1 pin 1)');
        expect(code).not.toContain('LED1 pin 1)');
    });

    it('matches the reverse spelling of a connection', () => {
        const { code, failed } = applyCanvasEdits(SOURCE, [
            { kind: 'disconnect', from: { component: 'LED1', pin: 2 }, to: { component: 'R1', pin: 2 } },
        ]);
        expect(failed).toHaveLength(0);
        expect(code).not.toContain('(R1 pin 2 -> LED1 pin 2)');
    });

    it('reports a reason when the connection is not in the source', () => {
        const { failed } = applyCanvasEdits(SOURCE, [
            { kind: 'disconnect', from: { component: 'R1', pin: 1 }, to: { component: 'R1', pin: 2 } },
        ]);
        expect(failed).toHaveLength(1);
    });
});

describe('applyCanvasEdits: rewires', () => {
    it('replaces the old connection with the new one', () => {
        const { code, failed } = applyCanvasEdits(SOURCE, [{
            kind: 'rewire',
            oldFrom: { component: 'R1', pin: 2 },
            oldTo: { component: 'LED1', pin: 2 },
            newFrom: { component: 'R1', pin: 2 },
            newTo: { component: 'LED1', pin: 1 },
        }]);
        expect(failed).toHaveLength(0);
        expect(code).not.toContain('(R1 pin 2 -> LED1 pin 2)');
        expect(code).toContain('(R1 pin 2 -> LED1 pin 1)');
    });

    it('fails without changing anything when the old connection is missing', () => {
        const { code, failed } = applyCanvasEdits(SOURCE, [{
            kind: 'rewire',
            oldFrom: { component: 'R1', pin: 1 },
            oldTo: { component: 'LED1', pin: 1 },
            newFrom: { component: 'R1', pin: 1 },
            newTo: { component: 'R1', pin: 2 },
        }]);
        expect(failed).toHaveLength(1);
        expect(code).toBe(SOURCE);
    });
});

describe('applyCanvasEdits: comments and malformed input', () => {
    it('ignores map blocks inside line comments', () => {
        const source = `@resistor R1 330\n@led LED1 red\n// map (nothing here)\nmap (\n    (R1 pin 2 -> LED1 pin 1)\n)\n`;
        const { code, failed } = applyCanvasEdits(source, [
            { kind: 'disconnect', from: { component: 'R1', pin: 2 }, to: { component: 'LED1', pin: 1 } },
        ]);
        expect(failed).toHaveLength(0);
        expect(code).toContain('// map (nothing here)');
        expect(code).not.toContain('(R1 pin 2 -> LED1 pin 1)');
    });

    it('refuses to touch malformed entries that mention the component', () => {
        const source = `@resistor R1 330\n@led LED1 red\nmap (\n    (R1 pin 2 -> LED1)\n)\n`;
        const { failed } = applyCanvasEdits(source, [{ kind: 'remove', id: 'R1' }]);
        expect(failed).toHaveLength(1);
    });
});

describe('CanvasEditBuffer', () => {
    it('cancels a pending add when the component is removed again', () => {
        const buffer = new CanvasEditBuffer();
        buffer.recordAdd('R2', '@resistor R2 10k');
        expect(buffer.count).toBe(1);
        buffer.recordRemove('R2');
        expect(buffer.count).toBe(0);
    });

    it('keeps a remove for a component that came from the source', () => {
        const buffer = new CanvasEditBuffer();
        buffer.recordRemove('R1');
        expect(buffer.all).toEqual([{ kind: 'remove', id: 'R1' }]);
    });

    it('cancels a rewire when the wire is dragged back', () => {
        const buffer = new CanvasEditBuffer();
        const a = { component: 'R1', pin: 2 };
        const b = { component: 'LED1', pin: 2 };
        const c = { component: 'LED1', pin: 1 };
        buffer.recordRewire(a, b, a, c);
        buffer.recordRewire(a, c, a, b);
        expect(buffer.count).toBe(0);
    });

    it('updates the pending rewire across several drags', () => {
        const buffer = new CanvasEditBuffer();
        const a = { component: 'R1', pin: 2 };
        const b = { component: 'LED1', pin: 2 };
        const c = { component: 'LED1', pin: 1 };
        const d = { component: 'R2', pin: 1 };
        buffer.recordRewire(a, b, a, c);
        buffer.recordRewire(a, c, a, d);
        expect(buffer.all).toEqual([{
            kind: 'rewire',
            oldFrom: a,
            oldTo: b,
            newFrom: a,
            newTo: d,
        }]);
    });

    it('turns a deleted rewired wire into a disconnect of the original connection', () => {
        const buffer = new CanvasEditBuffer();
        const a = { component: 'R1', pin: 2 };
        const b = { component: 'LED1', pin: 2 };
        const c = { component: 'LED1', pin: 1 };
        buffer.recordRewire(a, b, a, c);
        buffer.recordDisconnect(a, c);
        expect(buffer.all).toEqual([{ kind: 'disconnect', from: a, to: b }]);
    });

    it('drops pending edits that mention a removed component', () => {
        const buffer = new CanvasEditBuffer();
        buffer.recordRewire(
            { component: 'R1', pin: 2 },
            { component: 'LED1', pin: 2 },
            { component: 'R1', pin: 2 },
            { component: 'LED1', pin: 1 }
        );
        buffer.recordRemove('LED1');
        expect(buffer.all).toEqual([{ kind: 'remove', id: 'LED1' }]);
    });

    it('round-trips through all() and restore()', () => {
        const buffer = new CanvasEditBuffer();
        buffer.recordRemove('R1');
        const edits: CanvasEdit[] = buffer.all;
        const restored = new CanvasEditBuffer();
        restored.restore(edits);
        expect(restored.all).toEqual(edits);
    });
});
