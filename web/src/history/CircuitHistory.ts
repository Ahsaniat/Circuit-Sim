/**
 * Generic snapshot history for undo/redo.
 *
 * The circuit IR is small enough that full snapshots are simpler and safer
 * than a command log; every entry is an independent deep copy.
 */
export class CircuitHistory<T> {
    private past: T[] = [];
    private future: T[] = [];
    private limit: number;

    constructor(limit = 100) {
        this.limit = limit;
    }

    reset(): void {
        this.past = [];
        this.future = [];
    }

    push(snapshot: T): void {
        this.past.push(snapshot);
        if (this.past.length > this.limit) {
            this.past.shift();
        }
        this.future = [];
    }

    undo(current: T): T | null {
        const previous = this.past.pop();
        if (!previous) return null;
        this.future.push(current);
        return previous;
    }

    redo(current: T): T | null {
        const next = this.future.pop();
        if (!next) return null;
        this.past.push(current);
        return next;
    }

    get canUndo(): boolean {
        return this.past.length > 0;
    }

    get canRedo(): boolean {
        return this.future.length > 0;
    }

    get depth(): number {
        return this.past.length;
    }
}
