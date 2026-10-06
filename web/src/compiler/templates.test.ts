import { describe, expect, it } from 'vitest';
import { compile } from './compiler';
import { CIRCUIT_TEMPLATES } from '../ui/Templates';

describe('built-in templates', () => {
    it('ships at least 10 templates', () => {
        expect(CIRCUIT_TEMPLATES.length).toBeGreaterThanOrEqual(10);
    });

    for (const template of CIRCUIT_TEMPLATES) {
        it(`compiles "${template.name}"`, () => {
            const ir = compile(template.code);
            expect(ir.components.length).toBeGreaterThan(0);
        });
    }

    it('every template declares a board', () => {
        for (const template of CIRCUIT_TEMPLATES) {
            expect(template.code).toContain('@board');
        }
    });
});
