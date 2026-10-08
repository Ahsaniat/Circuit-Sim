import { HolePosition } from './BreadboardGeometry';
import { BreadboardGeometry } from './BreadboardGeometry';
import { ComponentIR } from '../types';
import { getComponentFootprint, getICPinCounts } from './ComponentFootprints';

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
        const { bottom, top, topOffset } = getICPinCounts(comp.pinCount);
        const startCol = geo.getICStartColumn(comp.position.x);
        for (let i = 0; i < bottom; i++) {
            // Bottom pins: 1..ceil(N/2) in row F
            if (pinNumber === i + 1) {
                return geo.getHolePosition(startCol + i, 'F');
            }
        }
        for (let i = 0; i < top; i++) {
            // Top pins: N..ceil(N/2)+1 in row E (right-aligned for odd counts)
            if (pinNumber === comp.pinCount - i) {
                return geo.getHolePosition(startCol + topOffset + i, 'E');
            }
        }
        return null;
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
