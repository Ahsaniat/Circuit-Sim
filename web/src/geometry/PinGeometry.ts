import { HolePosition } from './BreadboardGeometry';
import { BreadboardGeometry } from './BreadboardGeometry';
import { ComponentIR } from '../types';
import { getComponentFootprint } from './ComponentFootprints';
import { normalizeRotation, rotateOffset } from './rotation';

/**
 * Pin-to-hole geometry, shared by the netlist extractor, the renderer and
 * the interaction layer. A component pin is placed on the hole it occupies,
 * honouring the component's rotation.
 */
export function componentPinHole(
    comp: ComponentIR,
    pinNumber: number,
    geo: BreadboardGeometry
): HolePosition | null {
    const footprint = getComponentFootprint(comp.category ?? 'ic', comp.pinCount, comp.type);
    const rotation = normalizeRotation(comp.rotation ?? 0);

    if (footprint.straddlesChannel) {
        // Straddling footprints declare their own rows (DIP: E/F, push
        // button: legs in both rows); column order follows the footprint.
        const pin = footprint.pins.find(p => p.number === pinNumber);
        if (!pin) return null;
        const startCol = geo.getICStartColumn(comp.position.x);
        const sameRow = footprint.pins.filter(p => p.targetRow === pin.targetRow);
        const index = sameRow.indexOf(pin);
        if (index < 0) return null;
        const base = geo.getHolePosition(startCol + index, pin.targetRow);
        if (rotation === 0) return base;
        if (rotation !== 180) return null;
        // 180 degrees mirrors each hole around the body centre.
        const centerX = comp.position.x + footprint.bodyWidth / 2;
        const centerY = comp.position.y + footprint.bodyHeight / 2;
        const x = 2 * centerX - base.x;
        const y = 2 * centerY - base.y;
        const col = geo.getColumnAtX(x);
        const row = geo.getRowAtY(y);
        if (col <= 0 || !row) return null;
        const hole = geo.getHolePosition(col, row);
        if (Math.abs(hole.x - x) > 0.05 || Math.abs(hole.y - y) > 0.05) return null;
        return hole;
    }

    const pin = footprint.pins.find(p => p.number === pinNumber);
    if (!pin) return null;
    const offset = rotateOffset(
        { x: pin.offsetX, y: pin.offsetY },
        { x: footprint.bodyWidth / 2, y: footprint.bodyHeight / 2 },
        rotation
    );
    const x = comp.position.x + offset.x;
    const y = comp.position.y + offset.y;
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
