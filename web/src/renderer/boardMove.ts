import { CircuitIR } from '../types';

/**
 * Translate the elements owned by a board when the board itself is dragged.
 *
 * Components move with their assigned board. Wire endpoints move
 * individually, because a cross-board jumper has one endpoint on each
 * board; moving the whole wire because one side moved would tear it off the
 * other side's pins. Waypoints are only translated when both endpoints move
 * together; otherwise they are cleared so the wire re-routes directly.
 */
export function translateBoardElements(
    ir: CircuitIR,
    boardId: string,
    dx: number,
    dy: number
): void {
    const boardIds = new Set(ir.boards.map(board => board.id));
    const firstBoardId = ir.boards[0]?.id;

    const ownerOf = (symbolId: string): string | undefined => {
        const comp = ir.components.find(c => c.id === symbolId);
        if (comp) {
            return comp.boardId && boardIds.has(comp.boardId) ? comp.boardId : firstBoardId;
        }
        if (boardIds.has(symbolId)) return symbolId;
        return firstBoardId;
    };

    for (const comp of ir.components) {
        const owner = comp.boardId && boardIds.has(comp.boardId) ? comp.boardId : firstBoardId;
        if (owner !== boardId) continue;
        comp.position.x += dx;
        comp.position.y += dy;
    }

    for (const wire of ir.wires) {
        const fromMoves = ownerOf(wire.from.component) === boardId;
        const toMoves = ownerOf(wire.to.component) === boardId;
        if (!fromMoves && !toMoves) continue;

        if (fromMoves) {
            wire.from.x += dx;
            wire.from.y += dy;
        }
        if (toMoves) {
            wire.to.x += dx;
            wire.to.y += dy;
        }

        if (fromMoves && toMoves) {
            if (wire.waypoints) {
                for (const waypoint of wire.waypoints) {
                    waypoint.x += dx;
                    waypoint.y += dy;
                }
            }
        } else {
            // Endpoints no longer share a coordinate frame.
            wire.waypoints = undefined;
        }
    }
}
