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
}

export interface ComponentIR {
    id: string;
    type: string;
    pinCount: number;
    position: Position;
    size: { width: number; height: number };
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
