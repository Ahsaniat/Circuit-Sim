import { ComponentIR, Position } from '../types';
import { BreadboardGeometry } from './BreadboardGeometry';
import { getComponentFootprint } from './ComponentFootprints';

/**
 * Component rotation. A component is drawn rotated about the centre of its
 * footprint, and its pins rotate with it; a rotation is only accepted when
 * every pin still lands exactly on a breadboard hole.
 */

export function normalizeRotation(degrees: number): number {
    return ((Math.round(degrees / 90) * 90) % 360 + 360) % 360;
}

export function rotateOffset(offset: Position, center: Position, degrees: number): Position {
    const radians = (degrees * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const dx = offset.x - center.x;
    const dy = offset.y - center.y;
    return {
        x: center.x + dx * cos - dy * sin,
        y: center.y + dx * sin + dy * cos,
    };
}

function bodyCenter(comp: ComponentIR): Position {
    const footprint = getComponentFootprint(comp.category ?? 'ic', comp.pinCount, comp.type);
    return {
        x: comp.position.x + footprint.bodyWidth / 2,
        y: comp.position.y + footprint.bodyHeight / 2,
    };
}

function isHoleAligned(x: number, y: number, geo: BreadboardGeometry): boolean {
    const col = geo.getColumnAtX(x);
    const row = geo.getRowAtY(y);
    if (col <= 0 || !row) return false;
    const hole = geo.getHolePosition(col, row);
    return Math.abs(hole.x - x) < 0.05 && Math.abs(hole.y - y) < 0.05;
}

/** True when every pin of the component (at its current rotation) is on a hole. */
export function pinsAligned(comp: ComponentIR, geo: BreadboardGeometry): boolean {
    const footprint = getComponentFootprint(comp.category ?? 'ic', comp.pinCount, comp.type);
    const rotation = normalizeRotation(comp.rotation ?? 0);

    if (footprint.straddlesChannel) {
        // Straddling parts only allow 0/180; verify via the shared pin math.
        if (rotation !== 0 && rotation !== 180) return false;
        for (let pin = 1; pin <= comp.pinCount; pin++) {
            const hole = componentPinHoleForRotation(comp, pin, geo, rotation);
            if (!hole) return false;
        }
        return true;
    }

    for (const pin of footprint.pins) {
        const offset = rotateOffset(
            { x: pin.offsetX, y: pin.offsetY },
            { x: footprint.bodyWidth / 2, y: footprint.bodyHeight / 2 },
            rotation
        );
        const x = comp.position.x + offset.x;
        const y = comp.position.y + offset.y;
        if (!isHoleAligned(x, y, geo)) return false;
    }
    return true;
}

/**
 * Plan a rotation: returns the body position that keeps every pin on a
 * hole for the requested angle, or null when that angle is impossible.
 */
export function planRotation(
    comp: ComponentIR,
    geo: BreadboardGeometry,
    requested: number
): Position | null {
    const rotation = normalizeRotation(requested);
    const footprint = getComponentFootprint(comp.category ?? 'ic', comp.pinCount, comp.type);

    if (footprint.straddlesChannel) {
        if (rotation !== 0 && rotation !== 180) return null;
        const candidate: ComponentIR = { ...comp, rotation };
        return pinsAligned(candidate, geo) ? comp.position : null;
    }

    // Snap pin 1 onto the nearest hole, then verify the whole footprint.
    const pin1 = footprint.pins.find(p => p.number === 1);
    if (!pin1) return null;
    const center = { x: footprint.bodyWidth / 2, y: footprint.bodyHeight / 2 };
    const rotated = rotateOffset({ x: pin1.offsetX, y: pin1.offsetY }, center, rotation);
    const desired = { x: comp.position.x + rotated.x, y: comp.position.y + rotated.y };
    const col = geo.getColumnAtX(desired.x);
    const row = geo.getRowAtY(desired.y);
    if (col <= 0 || !row) return null;
    const hole = geo.getHolePosition(col, row);
    const position = { x: hole.x - rotated.x, y: hole.y - rotated.y };

    const candidate: ComponentIR = { ...comp, rotation, position };
    return pinsAligned(candidate, geo) ? position : null;
}

/**
 * Rotation-aware pin hole used by pinsAligned (kept local to avoid a
 * circular import with PinGeometry, which imports this module).
 */
function componentPinHoleForRotation(
    comp: ComponentIR,
    pinNumber: number,
    geo: BreadboardGeometry,
    rotation: number
) {
    const footprint = getComponentFootprint(comp.category ?? 'ic', comp.pinCount, comp.type);
    const pin = footprint.pins.find(p => p.number === pinNumber);
    if (!pin) return null;
    const startCol = geo.getICStartColumn(comp.position.x);
    const sameRow = footprint.pins.filter(p => p.targetRow === pin.targetRow);
    const index = sameRow.indexOf(pin);
    if (index < 0) return null;
    const base = geo.getHolePosition(startCol + index, pin.targetRow);
    if (rotation === 0) return base;
    // 180 degrees: mirror the hole around the body centre.
    const center = bodyCenter(comp);
    const x = 2 * center.x - base.x;
    const y = 2 * center.y - base.y;
    if (!isHoleAligned(x, y, geo)) return null;
    const col = geo.getColumnAtX(x);
    const row = geo.getRowAtY(y);
    if (col <= 0 || !row) return null;
    return geo.getHolePosition(col, row);
}
