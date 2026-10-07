import { describe, expect, it } from 'vitest';
import { componentSummary, outputPins, pinFunction, pinInfo } from './PinDatabase';

describe('PinDatabase', () => {
    it('knows gate pin functions', () => {
        expect(pinFunction('7408', 3)).toBe('1Y');
        expect(pinFunction('7408', 14)).toBe('VCC');
        expect(pinFunction('7400', 7)).toBe('GND');
        expect(pinFunction('7404', 1)).toBe('1A');
        expect(pinFunction('555', 2)).toBe('TRIG');
        expect(pinFunction('LM741', 6)).toBe('OUT');
    });

    it('reports directions', () => {
        expect(pinInfo('7408', 3)?.dir).toBe('output');
        expect(pinInfo('7408', 1)?.dir).toBe('input');
        expect(pinInfo('7408', 7)?.dir).toBe('ground');
    });

    it('lists output pins for contention checks', () => {
        expect(outputPins('7408').sort((a, b) => a - b)).toEqual([3, 6, 8, 11]);
        expect(outputPins('7404').sort((a, b) => a - b)).toEqual([2, 4, 6, 8, 10, 12]);
        expect(outputPins('UNKNOWN')).toEqual([]);
    });

    it('provides summaries', () => {
        expect(componentSummary('7408')).toContain('AND');
        expect(componentSummary('NOT_A_CHIP')).toBeUndefined();
    });

    it('returns nothing for unknown pins', () => {
        expect(pinFunction('7408', 99)).toBeUndefined();
        expect(pinFunction('NOT_A_CHIP', 1)).toBeUndefined();
    });
});
