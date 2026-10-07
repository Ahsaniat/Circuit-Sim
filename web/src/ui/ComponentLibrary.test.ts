import { describe, expect, it } from 'vitest';
import { filterCategories } from './ComponentLibrary';

const CATEGORIES = [
    {
        name: 'Passive',
        icon: '',
        entries: [
            { keyword: 'resistor', label: 'Resistor', description: '2-pin resistor', example: '@resistor R1 10k' },
            { keyword: 'capacitor', label: 'Capacitor', description: '2-pin capacitor', example: '@capacitor C1 100uF' },
        ],
    },
    {
        name: 'Switches',
        icon: '',
        entries: [
            { keyword: 'pushbutton', label: 'Push Button', description: 'Momentary tactile switch', example: '@pushbutton BTN1 PUSHBUTTON' },
        ],
    },
];

describe('filterCategories', () => {
    it('returns everything for an empty query', () => {
        expect(filterCategories(CATEGORIES, '')).toHaveLength(2);
        expect(filterCategories(CATEGORIES, '   ')).toHaveLength(2);
    });

    it('matches labels case-insensitively', () => {
        const result = filterCategories(CATEGORIES, 'RESIST');
        expect(result).toHaveLength(1);
        expect(result[0].entries).toHaveLength(1);
        expect(result[0].entries[0].label).toBe('Resistor');
    });

    it('matches descriptions', () => {
        const result = filterCategories(CATEGORIES, 'tactile');
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Switches');
    });

    it('matches keywords and examples', () => {
        expect(filterCategories(CATEGORIES, 'pushbutton')).toHaveLength(1);
        expect(filterCategories(CATEGORIES, '100uF')).toHaveLength(1);
    });

    it('drops categories with no matches', () => {
        const result = filterCategories(CATEGORIES, 'nonexistent-xyz');
        expect(result).toHaveLength(0);
    });
});
