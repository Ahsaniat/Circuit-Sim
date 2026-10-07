import { describe, expect, it } from 'vitest';
import { COMPONENT_CATEGORIES, collectUsedIds, filterCategories, makeUniqueId } from './ComponentLibrary';

describe('collectUsedIds', () => {
    it('collects component, board and def ids', () => {
        const code = `@resistor R1 330\n@board B1 breadboard_830\ndef MyIC (\n  A -> input\n)\n@comp M1 MyIC\n`;
        const ids = collectUsedIds(code);
        expect(ids.has('R1')).toBe(true);
        expect(ids.has('B1')).toBe(true);
        expect(ids.has('M1')).toBe(true);
        expect(ids.has('MyIC')).toBe(true);
    });

    it('ignores comments and map references', () => {
        const ids = collectUsedIds('// @board X9 breadboard_830\n@led LED1 red\nmap (\n (LED1 pin 1 -> B9 pin 1)\n)\n');
        expect(ids.has('LED1')).toBe(true);
        expect(ids.has('X9')).toBe(false);
        expect(ids.has('B9')).toBe(false);
    });
});

describe('makeUniqueId', () => {
    it('leaves an unused id alone', () => {
        expect(makeUniqueId('@board B1 breadboard_830', new Set())).toBe('@board B1 breadboard_830');
    });

    it('increments a taken numeric id', () => {
        expect(makeUniqueId('@board B1 breadboard_830', new Set(['B1']))).toBe('@board B2 breadboard_830');
        expect(makeUniqueId('@resistor R1 10k', new Set(['R1', 'R2']))).toBe('@resistor R3 10k');
    });

    it('appends a number to an id without one', () => {
        expect(makeUniqueId('@led LED red', new Set(['LED']))).toBe('@led LED2 red');
    });

    it('skips over a whole taken range', () => {
        expect(makeUniqueId('@board B1 breadboard_830', new Set(['B1', 'B2', 'B3']))).toBe('@board B4 breadboard_830');
    });

    it('preserves the rest of the declaration', () => {
        expect(makeUniqueId('@pushbutton BTN1 PUSHBUTTON', new Set(['BTN1']))).toBe('@pushbutton BTN2 PUSHBUTTON');
    });
});

describe('category icons', () => {
    it('ships a real SVG for every category', () => {
        expect(COMPONENT_CATEGORIES.length).toBeGreaterThan(0);
        for (const category of COMPONENT_CATEGORIES) {
            expect(category.icon).toContain('<svg');
        }
    });
});

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
