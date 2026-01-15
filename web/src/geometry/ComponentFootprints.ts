/**
 * Component Footprints - Unified component placement system
 * 
 * This module defines physical footprints for all component types.
 * A footprint specifies:
 * - Component body dimensions
 * - Pin positions relative to the body
 * - How the component should be placed on a breadboard
 * 
 * All dimensions are in base units (1 base unit = 2.54mm = standard pin spacing)
 */

import { BreadboardGeometry } from './BreadboardGeometry';

export type ComponentCategory = 'ic' | 'passive' | 'diode' | 'led' | 'sensor' | 'transistor' | 'switch' | 'display' | 'buzzer' | 'motor' | 'power' | 'crystal';

export interface PinFootprint {
    /** Pin number (1-indexed) */
    number: number;
    /** X offset from component origin (body top-left) */
    offsetX: number;
    /** Y offset from component origin */
    offsetY: number;
    /** Which breadboard row this pin should connect to ('E', 'F', etc.) */
    targetRow: string;
    /** Label for this pin (e.g., 'E', 'B', 'C' for transistor) */
    label?: string;
}

export interface ComponentFootprint {
    /** Component category */
    category: ComponentCategory;
    /** Body width in base units */
    bodyWidth: number;
    /** Body height in base units */
    bodyHeight: number;
    /** Pin definitions */
    pins: PinFootprint[];
    /** Orientation: 'horizontal' or 'vertical' */
    orientation: 'horizontal' | 'vertical';
    /** Whether component straddles the center channel */
    straddlesChannel: boolean;
}

/**
 * Calculate footprint for an IC chip
 * ICs straddle the center channel with:
 * - Bottom pins (1 to N/2) in row F, left to right
 * - Top pins (N to N/2+1) in row E, left to right (numbered right to left)
 */
export function getICFootprint(pinCount: number): ComponentFootprint {
    const pinsPerSide = Math.floor(pinCount / 2);
    const holeSpacing = BreadboardGeometry.HOLE_SPACING;
    
    // Body width spans the pins plus margins
    const bodyWidth = (pinsPerSide - 1) * holeSpacing + 2;
    
    // Body height: fits between E and F rows with pins extending to reach holes
    const pinLength = 1.5;
    const eToFDistance = holeSpacing + BreadboardGeometry.CHANNEL_HEIGHT;
    const bodyHeight = eToFDistance - 2 * pinLength;
    
    const pins: PinFootprint[] = [];
    const firstPinOffsetX = 1; // First pin is 1 unit from body left edge
    
    // Bottom pins: 1, 2, 3, ..., N/2 (left to right, in row F)
    for (let i = 0; i < pinsPerSide; i++) {
        pins.push({
            number: i + 1,
            offsetX: firstPinOffsetX + i * holeSpacing,
            offsetY: bodyHeight + pinLength,  // Below body
            targetRow: 'F',
            label: `${i + 1}`
        });
    }
    
    // Top pins: N, N-1, N-2, ..., N/2+1 (numbered right to left, physically left to right in row E)
    for (let i = 0; i < pinsPerSide; i++) {
        const pinNumber = pinCount - i;
        pins.push({
            number: pinNumber,
            offsetX: firstPinOffsetX + i * holeSpacing,
            offsetY: -pinLength,  // Above body
            targetRow: 'E',
            label: `${pinNumber}`
        });
    }
    
    return {
        category: 'ic',
        bodyWidth,
        bodyHeight,
        pins,
        orientation: 'horizontal',
        straddlesChannel: true
    };
}

/**
 * Calculate footprint for passive components (resistor, capacitor, inductor)
 * These are horizontal 2-pin components that span multiple columns in one row
 */
export function getPassiveFootprint(spanCols: number = 3): ComponentFootprint {
    const holeSpacing = BreadboardGeometry.HOLE_SPACING;
    const bodyWidth = (spanCols - 1) * holeSpacing;  // Body spans between pins
    const bodyHeight = 2;
    
    return {
        category: 'passive',
        bodyWidth,
        bodyHeight,
        pins: [
            {
                number: 1,
                offsetX: 0,
                offsetY: bodyHeight / 2,
                targetRow: 'D',  // Will be placed in a row
                label: '1'
            },
            {
                number: 2,
                offsetX: bodyWidth,
                offsetY: bodyHeight / 2,
                targetRow: 'D',  // Same row
                label: '2'
            }
        ],
        orientation: 'horizontal',
        straddlesChannel: false
    };
}

/**
 * Calculate footprint for diodes
 * Similar to passive but with cathode marking
 */
export function getDiodeFootprint(spanCols: number = 2): ComponentFootprint {
    const holeSpacing = BreadboardGeometry.HOLE_SPACING;
    const bodyWidth = (spanCols - 1) * holeSpacing;
    const bodyHeight = 2;
    
    return {
        category: 'diode',
        bodyWidth,
        bodyHeight,
        pins: [
            {
                number: 1,  // Anode
                offsetX: 0,
                offsetY: bodyHeight / 2,
                targetRow: 'D',
                label: 'A'
            },
            {
                number: 2,  // Cathode
                offsetX: bodyWidth,
                offsetY: bodyHeight / 2,
                targetRow: 'D',
                label: 'K'
            }
        ],
        orientation: 'horizontal',
        straddlesChannel: false
    };
}

/**
 * Calculate footprint for LEDs
 * Vertical orientation with 2 pins close together
 */
export function getLEDFootprint(): ComponentFootprint {
    const holeSpacing = BreadboardGeometry.HOLE_SPACING;
    const bodySize = 3;
    
    return {
        category: 'led',
        bodyWidth: bodySize,
        bodyHeight: bodySize,
        pins: [
            {
                number: 1,  // Anode (longer leg)
                offsetX: bodySize / 2 - holeSpacing / 2,
                offsetY: bodySize + 2,  // Below body
                targetRow: 'D',
                label: 'A'
            },
            {
                number: 2,  // Cathode (shorter leg, flat side)
                offsetX: bodySize / 2 + holeSpacing / 2,
                offsetY: bodySize + 2,
                targetRow: 'D',
                label: 'K'
            }
        ],
        orientation: 'vertical',
        straddlesChannel: false
    };
}

/**
 * Calculate footprint for sensors (LDR, photodiode)
 * Vertical orientation with 2 pins
 */
export function getSensorFootprint(): ComponentFootprint {
    const holeSpacing = BreadboardGeometry.HOLE_SPACING;
    const bodySize = 4;
    
    return {
        category: 'sensor',
        bodyWidth: bodySize,
        bodyHeight: bodySize,
        pins: [
            {
                number: 1,
                offsetX: bodySize / 2 - holeSpacing / 2,
                offsetY: bodySize + 2,
                targetRow: 'D',
                label: '1'
            },
            {
                number: 2,
                offsetX: bodySize / 2 + holeSpacing / 2,
                offsetY: bodySize + 2,
                targetRow: 'D',
                label: '2'
            }
        ],
        orientation: 'vertical',
        straddlesChannel: false
    };
}

/**
 * Calculate footprint for transistors (TO-92 package)
 * 3 pins in a row: E-B-C (BJT) or S-G-D (MOSFET)
 */
export function getTransistorFootprint(type: 'BJT' | 'MOSFET' = 'BJT'): ComponentFootprint {
    const holeSpacing = BreadboardGeometry.HOLE_SPACING;
    const bodyWidth = 2 * holeSpacing;  // Spans 3 holes
    const bodyHeight = 4;
    
    const labels = type === 'MOSFET' ? ['S', 'G', 'D'] : ['E', 'B', 'C'];
    
    return {
        category: 'transistor',
        bodyWidth,
        bodyHeight,
        pins: [
            {
                number: 1,
                offsetX: 0,
                offsetY: bodyHeight + 2,
                targetRow: 'D',
                label: labels[0]
            },
            {
                number: 2,
                offsetX: holeSpacing,
                offsetY: bodyHeight + 2,
                targetRow: 'D',
                label: labels[1]
            },
            {
                number: 3,
                offsetX: 2 * holeSpacing,
                offsetY: bodyHeight + 2,
                targetRow: 'D',
                label: labels[2]
            }
        ],
        orientation: 'vertical',
        straddlesChannel: false
    };
}

/**
 * Get footprint for any component based on category and pin count
 */
export function getComponentFootprint(category: ComponentCategory, pinCount: number, type?: string): ComponentFootprint {
    switch (category) {
        case 'ic':
            return getICFootprint(pinCount);
        case 'passive':
            return getPassiveFootprint(3);
        case 'diode':
            return getDiodeFootprint(2);
        case 'led':
            return getLEDFootprint();
        case 'sensor':
            return getSensorFootprint();
        case 'transistor':
            const isMOSFET = type === 'NMOS' || type === 'PMOS';
            return getTransistorFootprint(isMOSFET ? 'MOSFET' : 'BJT');
        case 'switch':
            return getSwitchFootprint(type || 'SPST');
        case 'display':
            return getDisplayFootprint(type || '7SEG');
        case 'buzzer':
            return getBuzzerFootprint();
        case 'motor':
            return getMotorFootprint(type || 'DC');
        case 'power':
            return getPowerFootprint(type || 'BATTERY');
        case 'crystal':
            return getCrystalFootprint();
        default:
            return getICFootprint(pinCount);
    }
}

/**
 * Calculate footprint for switches (SPST, SPDT, pushbutton)
 */
export function getSwitchFootprint(type: string): ComponentFootprint {
    const holeSpacing = BreadboardGeometry.HOLE_SPACING;
    
    if (type === 'SPST') {
        return {
            category: 'switch',
            bodyWidth: 2 * holeSpacing,
            bodyHeight: 3,
            pins: [
                { number: 1, offsetX: 0, offsetY: 1.5, targetRow: 'D', label: '1' },
                { number: 2, offsetX: 2 * holeSpacing, offsetY: 1.5, targetRow: 'D', label: '2' }
            ],
            orientation: 'horizontal',
            straddlesChannel: false
        };
    } else if (type === 'SPDT') {
        return {
            category: 'switch',
            bodyWidth: 2 * holeSpacing,
            bodyHeight: 4,
            pins: [
                { number: 1, offsetX: 0, offsetY: 4 + 2, targetRow: 'D', label: 'COM' },
                { number: 2, offsetX: holeSpacing, offsetY: 4 + 2, targetRow: 'D', label: 'NC' },
                { number: 3, offsetX: 2 * holeSpacing, offsetY: 4 + 2, targetRow: 'D', label: 'NO' }
            ],
            orientation: 'vertical',
            straddlesChannel: false
        };
    } else {
        return {
            category: 'switch',
            bodyWidth: holeSpacing,
            bodyHeight: BreadboardGeometry.getICBodyHeight(1.5),
            pins: [
                { number: 1, offsetX: 0, offsetY: -1.5, targetRow: 'E', label: '1A' },
                { number: 2, offsetX: holeSpacing, offsetY: -1.5, targetRow: 'E', label: '1B' },
                { number: 3, offsetX: 0, offsetY: BreadboardGeometry.getICBodyHeight(1.5) + 1.5, targetRow: 'F', label: '2A' },
                { number: 4, offsetX: holeSpacing, offsetY: BreadboardGeometry.getICBodyHeight(1.5) + 1.5, targetRow: 'F', label: '2B' }
            ],
            orientation: 'vertical',
            straddlesChannel: true
        };
    }
}

/**
 * Calculate footprint for displays (7-segment)
 */
export function getDisplayFootprint(_type: string): ComponentFootprint {
    const holeSpacing = BreadboardGeometry.HOLE_SPACING;
    const pinsPerSide = 5;
    const bodyWidth = (pinsPerSide - 1) * holeSpacing + 2;
    const pinLength = 1.5;
    const bodyHeight = BreadboardGeometry.getICBodyHeight(pinLength);
    const firstPinOffset = 1;
    
    const pins: PinFootprint[] = [];
    for (let i = 0; i < pinsPerSide; i++) {
        pins.push({
            number: i + 1,
            offsetX: firstPinOffset + i * holeSpacing,
            offsetY: bodyHeight + pinLength,
            targetRow: 'F',
            label: `${i + 1}`
        });
        pins.push({
            number: pinsPerSide + i + 1,
            offsetX: firstPinOffset + i * holeSpacing,
            offsetY: -pinLength,
            targetRow: 'E',
            label: `${pinsPerSide + i + 1}`
        });
    }
    
    return {
        category: 'display',
        bodyWidth,
        bodyHeight,
        pins,
        orientation: 'horizontal',
        straddlesChannel: true
    };
}

/**
 * Calculate footprint for buzzers
 */
export function getBuzzerFootprint(): ComponentFootprint {
    const holeSpacing = BreadboardGeometry.HOLE_SPACING;
    const bodySize = 6;
    
    return {
        category: 'buzzer',
        bodyWidth: bodySize,
        bodyHeight: bodySize,
        pins: [
            { number: 1, offsetX: bodySize / 2 - holeSpacing / 2, offsetY: bodySize + 2, targetRow: 'D', label: '+' },
            { number: 2, offsetX: bodySize / 2 + holeSpacing / 2, offsetY: bodySize + 2, targetRow: 'D', label: '-' }
        ],
        orientation: 'vertical',
        straddlesChannel: false
    };
}

/**
 * Calculate footprint for motors (DC, servo)
 */
export function getMotorFootprint(type: string): ComponentFootprint {
    const holeSpacing = BreadboardGeometry.HOLE_SPACING;
    
    if (type === 'SERVO') {
        return {
            category: 'motor',
            bodyWidth: 2 * holeSpacing,
            bodyHeight: 6,
            pins: [
                { number: 1, offsetX: 0, offsetY: 6 + 2, targetRow: 'D', label: 'GND' },
                { number: 2, offsetX: holeSpacing, offsetY: 6 + 2, targetRow: 'D', label: 'VCC' },
                { number: 3, offsetX: 2 * holeSpacing, offsetY: 6 + 2, targetRow: 'D', label: 'SIG' }
            ],
            orientation: 'vertical',
            straddlesChannel: false
        };
    } else {
        return {
            category: 'motor',
            bodyWidth: 2 * holeSpacing,
            bodyHeight: 4,
            pins: [
                { number: 1, offsetX: 0, offsetY: 2, targetRow: 'D', label: '+' },
                { number: 2, offsetX: 2 * holeSpacing, offsetY: 2, targetRow: 'D', label: '-' }
            ],
            orientation: 'horizontal',
            straddlesChannel: false
        };
    }
}

/**
 * Calculate footprint for power components (battery, regulator)
 */
export function getPowerFootprint(type: string): ComponentFootprint {
    const holeSpacing = BreadboardGeometry.HOLE_SPACING;
    
    if (type === 'REGULATOR') {
        return {
            category: 'power',
            bodyWidth: 2 * holeSpacing,
            bodyHeight: 6,
            pins: [
                { number: 1, offsetX: 0, offsetY: 6 + 2, targetRow: 'D', label: 'IN' },
                { number: 2, offsetX: holeSpacing, offsetY: 6 + 2, targetRow: 'D', label: 'GND' },
                { number: 3, offsetX: 2 * holeSpacing, offsetY: 6 + 2, targetRow: 'D', label: 'OUT' }
            ],
            orientation: 'vertical',
            straddlesChannel: false
        };
    } else {
        return {
            category: 'power',
            bodyWidth: 4,
            bodyHeight: 8,
            pins: [
                { number: 1, offsetX: 2 - holeSpacing / 2, offsetY: 8 + 2, targetRow: 'D', label: '+' },
                { number: 2, offsetX: 2 + holeSpacing / 2, offsetY: 8 + 2, targetRow: 'D', label: '-' }
            ],
            orientation: 'vertical',
            straddlesChannel: false
        };
    }
}

/**
 * Calculate footprint for crystal oscillator
 */
export function getCrystalFootprint(): ComponentFootprint {
    const holeSpacing = BreadboardGeometry.HOLE_SPACING;
    
    return {
        category: 'crystal',
        bodyWidth: holeSpacing,
        bodyHeight: 3,
        pins: [
            { number: 1, offsetX: 0, offsetY: 1.5, targetRow: 'D', label: '1' },
            { number: 2, offsetX: holeSpacing, offsetY: 1.5, targetRow: 'D', label: '2' }
        ],
        orientation: 'horizontal',
        straddlesChannel: false
    };
}

/**
 * Calculate component placement on breadboard
 * Returns the position where the component body top-left corner should be placed
 * so that its pins align with the specified breadboard holes
 */
 
export interface PlacementResult {
    /** Body position (top-left corner) */
    bodyX: number;
    bodyY: number;
    /** Pin positions (absolute coordinates) */
    pinPositions: Map<number, { x: number; y: number; col: number; row: string }>;
    /** Columns occupied by this component */
    occupiedColumns: number[];
}

export function calculatePlacement(
    footprint: ComponentFootprint,
    geo: BreadboardGeometry,
    startCol: number,
    preferredRow?: string
): PlacementResult {
    const pinPositions = new Map<number, { x: number; y: number; col: number; row: string }>();
    const occupiedColumns: number[] = [];
    
    let bodyX: number;
    let bodyY: number;
    
    if (footprint.straddlesChannel) {
        // IC placement - straddles channel with pins in E and F
        // First pin (bottom-left, pin 1) goes to startCol, row F
        const holeF = geo.getHolePosition(startCol, 'F');
        const pin1 = footprint.pins.find(p => p.number === 1)!;
        
        // Body position: pin1.offsetX from body left edge equals holeF.x
        bodyX = holeF.x - pin1.offsetX;
        // Pin1 y position = bodyY + pin1.offsetY = holeF.y
        bodyY = holeF.y - pin1.offsetY;
        
        // Calculate all pin positions
        for (const pin of footprint.pins) {
            const actualCol = startCol + footprint.pins.filter(p => p.targetRow === pin.targetRow).indexOf(pin);
            const hole = geo.getHolePosition(actualCol, pin.targetRow);
            pinPositions.set(pin.number, {
                x: hole.x,
                y: hole.y,
                col: actualCol,
                row: pin.targetRow
            });
            if (!occupiedColumns.includes(actualCol)) {
                occupiedColumns.push(actualCol);
            }
        }
    } else {
        // Non-straddling components (passive, diode, LED, sensor, transistor)
        const row = preferredRow || 'D';
        
        if (footprint.orientation === 'horizontal') {
            // Horizontal component - pins span columns in same row
            // For 2-pin components that span multiple holes, calculate column from offsetX
            const pin1 = footprint.pins[0];
            const hole1 = geo.getHolePosition(startCol, row);
            
            bodyX = hole1.x - pin1.offsetX;
            bodyY = hole1.y - pin1.offsetY;
            
            for (const pin of footprint.pins) {
                // Calculate column based on pin offset from first pin
                const colOffset = Math.round(pin.offsetX / BreadboardGeometry.HOLE_SPACING);
                const col = startCol + colOffset;
                const hole = geo.getHolePosition(col, row);
                pinPositions.set(pin.number, {
                    x: hole.x,
                    y: hole.y,
                    col,
                    row
                });
                if (!occupiedColumns.includes(col)) {
                    occupiedColumns.push(col);
                }
            }
        } else {
            // Vertical component - pins in adjacent columns of same row
            const firstPinCol = startCol;
            const hole1 = geo.getHolePosition(firstPinCol, row);
            const pin1 = footprint.pins[0];
            
            bodyX = hole1.x - pin1.offsetX;
            bodyY = hole1.y - pin1.offsetY;
            
            for (let i = 0; i < footprint.pins.length; i++) {
                const pin = footprint.pins[i];
                const col = firstPinCol + i;
                const hole = geo.getHolePosition(col, row);
                pinPositions.set(pin.number, {
                    x: hole.x,
                    y: hole.y,
                    col,
                    row
                });
                occupiedColumns.push(col);
            }
        }
    }
    
    return { bodyX, bodyY, pinPositions, occupiedColumns };
}
