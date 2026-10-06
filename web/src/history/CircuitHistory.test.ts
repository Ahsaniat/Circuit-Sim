import { describe, expect, it } from 'vitest';
import { CircuitHistory } from './CircuitHistory';

describe('CircuitHistory', () => {
    it('undoes and redoes pushed snapshots', () => {
        const history = new CircuitHistory<string>();
        history.push('a');
        history.push('b');

        expect(history.canUndo).toBe(true);
        expect(history.undo('c')).toBe('b');
        expect(history.undo('b')).toBe('a');
        expect(history.undo('a')).toBeNull();
    });

    it('redo restores undone snapshots in order', () => {
        const history = new CircuitHistory<string>();
        history.push('a');
        history.push('b');
        history.undo('c');
        history.undo('b');

        expect(history.canRedo).toBe(true);
        expect(history.redo('a')).toBe('b');
        expect(history.redo('b')).toBe('c');
        expect(history.redo('c')).toBeNull();
    });

    it('a new push clears the redo stack', () => {
        const history = new CircuitHistory<string>();
        history.push('a');
        history.undo('b');
        history.push('c');
        expect(history.canRedo).toBe(false);
    });

    it('enforces the snapshot limit', () => {
        const history = new CircuitHistory<number>(3);
        for (let i = 0; i < 10; i++) history.push(i);
        expect(history.depth).toBe(3);
    });

    it('reset clears both stacks', () => {
        const history = new CircuitHistory<string>();
        history.push('a');
        history.undo('b');
        history.reset();
        expect(history.canUndo).toBe(false);
        expect(history.canRedo).toBe(false);
    });
});
