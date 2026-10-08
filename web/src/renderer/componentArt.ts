import resistorUrl from '../assets/components/resistor.svg';
import diodeUrl from '../assets/components/diode.svg';
import capacitorUrl from '../assets/components/capacitor.svg';
import ledUrl from '../assets/components/led.svg';
import transistorUrl from '../assets/components/transistor.svg';
import pushButtonUrl from '../assets/components/push_button.svg';
import batteryUrl from '../assets/components/battery_9v.svg';
import motorUrl from '../assets/components/motor.svg';
import icUrl from '../assets/components/ic_74HC11.svg';

/**
 * User-authored component artwork.
 *
 * Each entry maps the SVG's viewBox onto a component's footprint: `pins`
 * lists the pin endpoints in viewBox coordinates, indexed by pin number
 * (pins[0] is pin 1). `scaleFrom` chooses the axis whose pin span defines
 * the scale ('both' allows per-axis fitting for parts whose pin grid spans
 * two axes), and `rotate` pre-rotates artwork whose pins run vertically
 * while the footprint's pins run horizontally.
 */
export interface ArtPin {
    x: number;
    y: number;
}

export interface ComponentArt {
    url: string;
    width: number;
    height: number;
    pins: ArtPin[];
    rotate: 0 | 90 | 180 | -90;
    scaleFrom: 'x' | 'y' | 'both';
}

export const COMPONENT_ART: Record<string, ComponentArt> = {
    RES: {
        url: resistorUrl,
        width: 96,
        height: 34,
        pins: [{ x: 3, y: 17 }, { x: 93, y: 17 }],
        rotate: 0,
        scaleFrom: 'x',
    },
    DIODE: {
        url: diodeUrl,
        width: 96,
        height: 34,
        pins: [{ x: 3, y: 17 }, { x: 93, y: 17 }],
        rotate: 0,
        scaleFrom: 'x',
    },
    ZENER: {
        url: diodeUrl,
        width: 96,
        height: 34,
        pins: [{ x: 3, y: 17 }, { x: 93, y: 17 }],
        rotate: 0,
        scaleFrom: 'x',
    },
    SCHOTTKY: {
        url: diodeUrl,
        width: 96,
        height: 34,
        pins: [{ x: 3, y: 17 }, { x: 93, y: 17 }],
        rotate: 0,
        scaleFrom: 'x',
    },
    CAP: {
        url: capacitorUrl,
        width: 60,
        height: 66,
        pins: [{ x: 20, y: 62 }, { x: 41, y: 62 }],
        rotate: 0,
        scaleFrom: 'x',
    },
    LED: {
        url: ledUrl,
        width: 55,
        height: 72,
        pins: [{ x: 17.5, y: 68 }, { x: 38.75, y: 68 }],
        rotate: 0,
        scaleFrom: 'x',
    },
    IR_LED: {
        url: ledUrl,
        width: 55,
        height: 72,
        pins: [{ x: 17.5, y: 68 }, { x: 38.75, y: 68 }],
        rotate: 0,
        scaleFrom: 'x',
    },
    NPN: {
        url: transistorUrl,
        width: 80,
        height: 92,
        pins: [{ x: 18.75, y: 88 }, { x: 39.75, y: 88 }, { x: 61.25, y: 88 }],
        rotate: 0,
        scaleFrom: 'x',
    },
    PNP: {
        url: transistorUrl,
        width: 80,
        height: 92,
        pins: [{ x: 18.75, y: 88 }, { x: 39.75, y: 88 }, { x: 61.25, y: 88 }],
        rotate: 0,
        scaleFrom: 'x',
    },
    NMOS: {
        url: transistorUrl,
        width: 80,
        height: 92,
        pins: [{ x: 18.75, y: 88 }, { x: 39.75, y: 88 }, { x: 61.25, y: 88 }],
        rotate: 0,
        scaleFrom: 'x',
    },
    PMOS: {
        url: transistorUrl,
        width: 80,
        height: 92,
        pins: [{ x: 18.75, y: 88 }, { x: 39.75, y: 88 }, { x: 61.25, y: 88 }],
        rotate: 0,
        scaleFrom: 'x',
    },
    PUSHBUTTON: {
        url: pushButtonUrl,
        width: 72,
        height: 74,
        pins: [
            { x: 15.4, y: 5.6 },
            { x: 57.2, y: 5.6 },
            { x: 15.4, y: 68.5 },
            { x: 57.2, y: 68.5 },
        ],
        rotate: 0,
        scaleFrom: 'both',
    },
    BATTERY: {
        url: batteryUrl,
        width: 484,
        height: 226,
        // Local coordinates (viewBox origin is 336,270)
        pins: [{ x: 106.8, y: 63.5 }, { x: 106.8, y: 157.3 }],
        rotate: -90,
        scaleFrom: 'y',
    },
    DC: {
        url: motorUrl,
        width: 212,
        height: 180,
        pins: [{ x: 85.5, y: 175 }, { x: 126.5, y: 175 }],
        rotate: 0,
        scaleFrom: 'x',
    },
    '7411': {
        url: icUrl,
        width: 165,
        height: 62,
        pins: [
            // Bottom row, left to right: pins 1..7
            { x: 20.95, y: 62 }, { x: 41.85, y: 62 }, { x: 62.75, y: 62 },
            { x: 83.65, y: 62 }, { x: 104.55, y: 62 }, { x: 125.45, y: 62 },
            { x: 146.35, y: 62 },
            // Top row, left to right: pins 8..14 (DIP numbering runs right to left)
            { x: 146.35, y: 0 }, { x: 125.45, y: 0 }, { x: 104.55, y: 0 },
            { x: 83.65, y: 0 }, { x: 62.75, y: 0 }, { x: 41.85, y: 0 },
            { x: 20.95, y: 0 },
        ],
        rotate: 0,
        scaleFrom: 'both',
    },
};

export function artFor(type: string): ComponentArt | undefined {
    return COMPONENT_ART[type];
}

export interface ArtTransform {
    translateX: number;
    translateY: number;
    scaleX: number;
    scaleY: number;
    rotate: number;
}

/**
 * Compute the canvas transform that maps the artwork's pin 1 and pin 2 onto
 * their holes. Pure function so the mapping is unit-testable.
 */
export function computeArtTransform(
    art: ComponentArt,
    holes: Array<{ x: number; y: number } | undefined>
): ArtTransform | null {
    const p1 = art.pins[0];
    const p2 = art.pins[1];
    const h1 = holes[0];
    const h2 = holes[1];
    if (!p1 || !p2 || !h1 || !h2) return null;

    const theta = (art.rotate * Math.PI) / 180;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const rotatePoint = (p: ArtPin) => ({
        x: p.x * cos - p.y * sin,
        y: p.x * sin + p.y * cos,
    });

    let svgMinX = Infinity, svgMaxX = -Infinity, svgMinY = Infinity, svgMaxY = -Infinity;
    for (const pin of art.pins) {
        const r = rotatePoint(pin);
        svgMinX = Math.min(svgMinX, r.x);
        svgMaxX = Math.max(svgMaxX, r.x);
        svgMinY = Math.min(svgMinY, r.y);
        svgMaxY = Math.max(svgMaxY, r.y);
    }
    let holeMinX = Infinity, holeMaxX = -Infinity, holeMinY = Infinity, holeMaxY = -Infinity;
    for (const hole of holes) {
        if (!hole) continue;
        holeMinX = Math.min(holeMinX, hole.x);
        holeMaxX = Math.max(holeMaxX, hole.x);
        holeMinY = Math.min(holeMinY, hole.y);
        holeMaxY = Math.max(holeMaxY, hole.y);
    }
    const svgW = svgMaxX - svgMinX;
    const svgH = svgMaxY - svgMinY;
    const holeW = holeMaxX - holeMinX;
    const holeH = holeMaxY - holeMinY;

    let scaleX: number;
    let scaleY: number;
    if (art.scaleFrom === 'both' && svgW > 0 && svgH > 0 && holeW > 0 && holeH > 0) {
        scaleX = holeW / svgW;
        scaleY = holeH / svgH;
    } else {
        let uniform = 0;
        if (svgW > 0 && holeW > 0) {
            uniform = holeW / svgW;
        } else if (svgH > 0 && holeH > 0) {
            uniform = holeH / svgH;
        } else {
            return null;
        }
        scaleX = uniform;
        scaleY = uniform;
    }

    const rotated = rotatePoint(p1);
    return {
        translateX: h1.x - scaleX * rotated.x,
        translateY: h1.y - scaleY * rotated.y,
        scaleX,
        scaleY,
        rotate: theta,
    };
}
