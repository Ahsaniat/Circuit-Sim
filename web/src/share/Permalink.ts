/**
 * Shareable permalinks. The circuit source is compressed into the URL hash
 * as base64url so links work without any backend.
 */

export function encodeShareHash(code: string): string {
    const bytes = new TextEncoder().encode(code);
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeShareHash(hash: string): string | null {
    try {
        const base64 = hash.replace(/-/g, '+').replace(/_/g, '/');
        const binary = atob(base64);
        const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
        return new TextDecoder().decode(bytes);
    } catch {
        return null;
    }
}

export const SHARE_HASH_PREFIX = '#circuit=';

export function buildShareUrl(baseUrl: string, code: string): string {
    const base = baseUrl.split('#')[0];
    return `${base}${SHARE_HASH_PREFIX}${encodeShareHash(code)}`;
}

/** Extract shared circuit code from a location hash, or null. */
export function readShareHash(hash: string): string | null {
    if (!hash.startsWith(SHARE_HASH_PREFIX)) return null;
    return decodeShareHash(hash.slice(SHARE_HASH_PREFIX.length));
}
