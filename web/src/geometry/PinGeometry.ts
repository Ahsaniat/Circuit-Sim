import { HolePosition } from './BreadboardGeometry';
import { BreadboardGeometry } from './BreadboardGeometry';
import { ComponentIR } from '../types';
import { getComponentFootprint } from './ComponentFootprints';

/**
 * Pin-to-hole geometry, shared by the netlist extractor, the renderer and
 * the interaction layer. A component pin is placed on the hole it occupies.
 */
export function componentPinHole(
    comp: ComponentIR,
    pinNumber: number,
    geo: BreadboardGeometry
): HolePosition | null {
    const footprint = getComponentFootprint(comp.category ?? 'ic', comp.pinCount, comp.type);

    if (footprint.straddlesChannel) {
        // Straddling footprints declare their own rows (DIP: E/F, push
        // button: legs in both rows); column order follows the footprint.
        const pin = footprint.pins.find(p => p.number === pinNumber);
        if (!pin) return null;
        const startCol = geo.getICStartColumn(comp.position.x);
        const sameRow = footprint.pins.filter(p => p.targetRow === pin.targetRow);
        const index = sameRow.indexOf(pin);
        if (index < 0) return null;
        return geo.getHolePosition(startCol + index, pin.targetRow);
    }

    const pin = footprint.pins.find(p => p.number === pinNumber);
    if (!pin) return null;
    const x = comp.position.x + pin.offsetX;
    const y = comp.position.y + pin.offsetY;
    const col = geo.getColumnAtX(x);
    const row = geo.getRowAtY(y);
    if (col <= 0 || !row) return null;
    return geo.getHolePosition(col, row);
}

/** All pin holes of a component, keyed by pin number. */
export function componentPinHoles(
    comp: ComponentIR,
    geo: BreadboardGeometry
): Map<number, HolePosition> {
    const holes = new Map<number, HolePosition>();
    for (let pin = 1; pin <= comp.pinCount; pin++) {
        const hole = componentPinHole(comp, pin, geo);
        if (hole) holes.set(pin, hole);
    }
    return holes;
}
