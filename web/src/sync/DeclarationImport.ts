import { compile } from '../compiler/compiler';
import { ComponentIR } from '../types';

/**
 * Build a canvas component from a single palette declaration such as
 * `@resistor R4 330`. The compiler does the parsing so the imported part
 * behaves exactly like one that came from source. Returns null when the
 * declaration does not compile.
 */
export function declarationToComponent(declaration: string): ComponentIR | null {
    const probeBoard = '__canvas_import__';
    try {
        const ir = compile(`@board ${probeBoard} breadboard_830\n${declaration}\n`);
        const comp = ir.components[0];
        if (!comp) return null;
        return {
            ...comp,
            position: { x: 0, y: 0 },
            rotation: 0,
        };
    } catch {
        return null;
    }
}
