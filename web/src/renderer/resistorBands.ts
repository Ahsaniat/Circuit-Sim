/**
 * Resistor colour codes.
 *
 * Values keep their DSL spelling (`330`, `4.7k`, `1M`) and are decoded into
 * the classic four-band code: two significant digits, a multiplier and a
 * gold tolerance band.
 */

const DIGIT_COLORS = [
    '#111111', // 0 black
    '#7B3F00', // 1 brown
    '#E53935', // 2 red
    '#FB8C00', // 3 orange
    '#FDD835', // 4 yellow
    '#43A047', // 5 green
    '#1E88E5', // 6 blue
    '#8E24AA', // 7 violet
    '#9E9E9E', // 8 grey
    '#F5F5F5', // 9 white
];

const MULTIPLIER_EXTRA: Record<string, string> = {
    '-1': '#FFD700', // gold  x0.1
    '-2': '#C0C0C0', // silver x0.01
};

const TOLERANCE_GOLD = '#FFD700';

const FALLBACK = ['#7B3F00', '#111111', '#E53935', TOLERANCE_GOLD];

export function parseResistance(value: string): number | null {
    const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*([kKmMrR]?)/);
    if (!match) return null;
    let ohms = parseFloat(match[1]);
    if (!Number.isFinite(ohms)) return null;
    switch (match[2].toLowerCase()) {
        case 'k': ohms *= 1e3; break;
        case 'm': ohms *= 1e6; break;
        case 'r': break;
    }
    return ohms > 0 ? ohms : null;
}

export function resistorBandColors(value: string | undefined): string[] {
    if (!value) return FALLBACK;
    const ohms = parseResistance(value);
    if (!ohms) return FALLBACK;

    // Express the value as two significant digits times a power of ten.
    let exponent = Math.floor(Math.log10(ohms)) - 1;
    let significant = Math.round(ohms / 10 ** exponent);
    if (significant >= 100) {
        significant = Math.round(significant / 10);
        exponent += 1;
    }
    if (significant < 10) {
        significant *= 10;
        exponent -= 1;
    }

    const first = Math.floor(significant / 10);
    const second = significant % 10;
    const multiplier = exponent in MULTIPLIER_EXTRA
        ? MULTIPLIER_EXTRA[String(exponent)]
        : DIGIT_COLORS[Math.min(Math.max(exponent, 0), 9)];

    return [DIGIT_COLORS[first], DIGIT_COLORS[second], multiplier, TOLERANCE_GOLD];
}
