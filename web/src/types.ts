import type { ComponentCategory } from './geometry/ComponentFootprints';

export type { ComponentCategory };

export interface Position {
    x: number;
    y: number;
}

export interface PinPosition {
    component: string;
    pin: number;
    x: number;
    y: number;
}

export interface Wire {
    from: PinPosition;
    to: PinPosition;
    color: string;
    waypoints?: Position[];
    /** Board this wire belongs to (defaults to the first board). */
    boardId?: string;
}

export interface ComponentIR {
    id: string;
    type: string;
    pinCount: number;
    position: Position;
    size: { width: number; height: number };
    category?: ComponentCategory;
    value?: string;  // For resistors (10k), capacitors (100uF), etc.
    /** Board this component is placed on (defaults to the first board). */
    boardId?: string;
}

export interface BoardIR {
    id: string;
    type: string;
    rows: number;
    columns: number;
    position: Position;
    size: { width: number; height: number };
}

export interface CircuitIR {
    width: number;
    height: number;
    components: ComponentIR[];
    boards: BoardIR[];
    wires: Wire[];
}
