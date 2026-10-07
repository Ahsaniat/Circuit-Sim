import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from './compiler';

/**
 * Shared conformance fixtures, also executed by the C++ test suite
 * (tests/cpp/compiler_tests.cpp). File suffix decides the expected outcome:
 * .ok.csim must compile, .err.csim must fail. Keeping one fixture set for
 * both compilers makes divergence visible immediately.
 */
const CONFORMANCE_DIR = fileURLToPath(new URL('../../../tests/conformance', import.meta.url));

const fixtures = readdirSync(CONFORMANCE_DIR)
    .filter(file => file.endsWith('.csim'))
    .sort();

describe('shared conformance fixtures', () => {
    it('ships fixtures', () => {
        expect(fixtures.length).toBeGreaterThan(0);
    });

    for (const fixture of fixtures) {
        it(`${fixture}`, () => {
            const source = readFileSync(join(CONFORMANCE_DIR, fixture), 'utf8');
            const expectSuccess = fixture.includes('.ok.');
            if (expectSuccess) {
                expect(() => compile(source)).not.toThrow();
            } else {
                expect(() => compile(source)).toThrow();
            }
        });
    }
});
