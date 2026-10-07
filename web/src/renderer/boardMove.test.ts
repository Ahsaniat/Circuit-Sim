import { describe, expect, it } from 'vitest';
import { compile } from '../compiler/compiler';
import { translateBoardElements } from './boardMove';

const TWO_BOARDS = `@board B1 breadboard_830
@board B2 breadboard_830
@resistor R1 330
@led LED1 red
@resistor R2 330
@led LED2 red
B1.map (
    (R1 pin 1 -> LED1 pin 1)
)
B2.map (
    (R2 pin 2 -> LED2 pin 1)
)
map (
    (R1 pin 2 -> R2 pin 1)
)
`;

const comp = (ir: ReturnType<typeof compile>, id: string) =>
    ir.components.find(c => c.id === id)!;

describe('translateBoardElements', () => {
    it('moves only the components on the dragged board', () => {
        const ir = compile(TWO_BOARDS);
        const r1Before = { ...comp(ir, 'R1').position };
        const r2Before = { ...comp(ir, 'R2').position };
        const led2Before = { ...comp(ir, 'LED2').position };

        translateBoardElements(ir, 'B2', 40, 25);

        expect(comp(ir, 'R2').position).toEqual({ x: r2Before.x + 40, y: r2Before.y + 25 });
        expect(comp(ir, 'LED2').position).toEqual({ x: led2Before.x + 40, y: led2Before.y + 25 });
        expect(comp(ir, 'R1').position).toEqual(r1Before);
    });

    it('moves the endpoint on the dragged board but not the other side of a jumper', () => {
        const ir = compile(TWO_BOARDS);
        const cross = ir.wires.find(w => w.from.component === 'R1' && w.to.component === 'R2')!;
        const fromBefore = { ...cross.from };
        const toBefore = { x: cross.to.x, y: cross.to.y };

        translateBoardElements(ir, 'B2', 40, 25);

        expect(cross.from.x).toBe(fromBefore.x);
        expect(cross.from.y).toBe(fromBefore.y);
        expect(cross.to.x).toBe(toBefore.x + 40);
        expect(cross.to.y).toBe(toBefore.y + 25);
        // The two ends no longer share a coordinate frame, so routing is cleared.
        expect(cross.waypoints).toBeUndefined();
    });

    it('translates both endpoints and waypoints for a wire fully on the board', () => {
        const ir = compile(TWO_BOARDS);
        const local = ir.wires.find(w => w.from.component === 'R2')!;
        const waypointsBefore = local.waypoints?.map(w => ({ ...w })) ?? [];

        translateBoardElements(ir, 'B2', 10, -5);

        expect(local.from.x).toBeGreaterThan(0);
        if (waypointsBefore.length > 0) {
            expect(local.waypoints).toHaveLength(waypointsBefore.length);
            expect(local.waypoints![0].x).toBeCloseTo(waypointsBefore[0].x + 10, 5);
            expect(local.waypoints![0].y).toBeCloseTo(waypointsBefore[0].y - 5, 5);
        }
    });

    it('leaves wires on other boards untouched', () => {
        const ir = compile(TWO_BOARDS);
        const b1Wire = ir.wires.find(w => w.from.component === 'R1' && w.to.component === 'LED1')!;
        const snapshot = { from: { ...b1Wire.from }, to: { ...b1Wire.to } };

        translateBoardElements(ir, 'B2', 100, 100);

        expect(b1Wire.from).toEqual(snapshot.from);
        expect(b1Wire.to).toEqual(snapshot.to);
    });

    it('moves a board-pin endpoint that lives on the dragged board', () => {
        const ir = compile(
            `@board B1 breadboard_830\n@board B2 breadboard_830\n@resistor R1 330\n` +
            `B1.map (\n (R1 pin 1 -> B2 pin 5)\n)\n`
        );
        const wire = ir.wires[0];
        const toBefore = { x: wire.to.x, y: wire.to.y };

        translateBoardElements(ir, 'B2', 30, 15);

        expect(wire.to.x).toBe(toBefore.x + 30);
        expect(wire.to.y).toBe(toBefore.y + 15);
        expect(wire.from.x).toBeLessThan(toBefore.x);
    });
});
