import { describe, expect, it } from 'vitest';
import { parseResistance, resistorBandColors } from './resistorBands';

const BLACK = '#111111';
const BROWN = '#7B3F00';
const RED = '#E53935';
const ORANGE = '#FB8C00';
const YELLOW = '#FDD835';
const GREEN = '#43A047';
const VIOLET = '#8E24AA';
const GOLD = '#FFD700';

describe('parseResistance', () => {
    it('parses plain, kilo and mega values', () => {
        expect(parseResistance('330')).toBe(330);
        expect(parseResistance('10k')).toBe(10000);
        expect(parseResistance('4.7k')).toBeCloseTo(4700);
        expect(parseResistance('1M')).toBe(1e6);
    });

    it('rejects nonsense', () => {
        expect(parseResistance('red')).toBeNull();
        expect(parseResistance('')).toBeNull();
        expect(parseResistance('0')).toBeNull();
    });
});

describe('resistorBandColors', () => {
    it('decodes common four-band codes', () => {
        expect(resistorBandColors('330')).toEqual([ORANGE, ORANGE, BROWN, GOLD]);
        expect(resistorBandColors('10k')).toEqual([BROWN, BLACK, ORANGE, GOLD]);
        expect(resistorBandColors('4.7k')).toEqual([YELLOW, VIOLET, RED, GOLD]);
        expect(resistorBandColors('1M')).toEqual([BROWN, BLACK, GREEN, GOLD]);
        expect(resistorBandColors('100')).toEqual([BROWN, BLACK, BROWN, GOLD]);
    });

    it('handles sub-ten-ohm values with gold and silver multipliers', () => {
        expect(resistorBandColors('4.7')).toEqual([YELLOW, VIOLET, GOLD, GOLD]);
        expect(resistorBandColors('0.47')).toEqual([YELLOW, VIOLET, '#C0C0C0', GOLD]);
    });

    it('falls back for missing or invalid values', () => {
        const fallback = resistorBandColors(undefined);
        expect(fallback).toHaveLength(4);
        expect(resistorBandColors('banana')).toEqual(fallback);
    });
});
