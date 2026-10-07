import { describe, expect, it } from 'vitest';
import { buildShareUrl, decodeShareHash, encodeShareHash, readShareHash } from './Permalink';

describe('Permalink', () => {
    it('round-trips plain source', () => {
        const code = '@resistor R1 10k\n@board B1 breadboard_830\n';
        expect(decodeShareHash(encodeShareHash(code))).toBe(code);
    });

    it('round-trips unicode and symbols', () => {
        const code = '// résistance Ω ±5%\n@resistor R1 10k\n';
        expect(decodeShareHash(encodeShareHash(code))).toBe(code);
    });

    it('produces URL-safe characters only', () => {
        const encoded = encodeShareHash('////++++====');
        expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('builds a share URL without duplicating the hash', () => {
        const url = buildShareUrl('https://example.com/app#old', 'abc');
        expect(url.startsWith('https://example.com/app#circuit=')).toBe(true);
        expect(url.match(/#/g)).toHaveLength(1);
    });

    it('reads the share hash back', () => {
        const url = buildShareUrl('https://example.com/', '@led LED1 red');
        const hash = url.slice(url.indexOf('#'));
        expect(readShareHash(hash)).toBe('@led LED1 red');
    });

    it('returns null for foreign or malformed hashes', () => {
        expect(readShareHash('#other=1')).toBeNull();
        expect(readShareHash('#circuit=!!!not-base64!!!')).toBeNull();
    });
});
