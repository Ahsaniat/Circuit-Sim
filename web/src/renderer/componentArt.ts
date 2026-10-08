import resistorUrl from '../assets/components/resistor.svg';
import diodeUrl from '../assets/components/diode.svg';
import capacitorUrl from '../assets/components/capacitor.svg';
import ledUrl from '../assets/components/led.svg';
import transistorUrl from '../assets/components/transistor.svg';
import pushButtonUrl from '../assets/components/push_button.svg';
import batteryUrl from '../assets/components/battery_9v.svg';
import motorUrl from '../assets/components/motor.svg';
import icUrl from '../assets/components/ic_74HC11.svg';
import dip8Url from '../assets/components/ic_dip8.svg';
import dip16Url from '../assets/components/ic_dip16.svg';
import dip20Url from '../assets/components/ic_dip20.svg';
import dip24Url from '../assets/components/ic_dip24.svg';

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

export interface ArtLabel {
    /** Label centre in viewBox coordinates. */
    x: number;
    y: number;
    /** Area of the printed label to cover before drawing the real type. */
    coverWidth: number;
    coverHeight: number;
    coverColor?: string;
}

export interface ComponentArt {
    url: string;
    width: number;
    height: number;
    pins: ArtPin[];
    rotate: 0 | 90 | 180 | -90;
    scaleFrom: 'x' | 'y' | 'both';
    label?: ArtLabel;
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
        width: 226,
        height: 484,
        // Upright battery; pin 1 is '+' and pin 2 is '−' at the polarity marks.
        pins: [{ x: 68.7, y: 106.8 }, { x: 162.5, y: 106.8 }],
        rotate: 0,
        scaleFrom: 'x',
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
        label: { x: 83.75, y: 31.5, coverWidth: 80, coverHeight: 18, coverColor: '#333333' },
    },
};

/**
 * Every 14-pin DIP shares the same package artwork; the printed type is
 * covered and the real type is drawn by the renderer.
 */
const DIP14_TYPES = [
    // Classic 74xx
    '7400', '7402', '7404', '7408', '7410', '7411', '7420', '7421',
    '7427', '7432', '7486', '7474', '7490', '74164',
    // 74HC family and friends
    '74HC00', '74HC02', '74HC04', '74HC08', '74HC10', '74HC11', '74HC14',
    '74HC20', '74HC21', '74HC27', '74HC32', '74HC73', '74HC74', '74HC86',
    '74HC93', '74HC132', '556', 'LM339',
];
for (const type of DIP14_TYPES) {
    COMPONENT_ART[type] = COMPONENT_ART['7411'];
}

/**
 * Generated DIP packages in the same visual language as the DIP-14 art
 * (body, notch, pin-1 dot, top/bottom pin rows). The printed label area is
 * covered so the renderer can draw the real component type.
 */
function makeDipArt(url: string, pinCount: number): ComponentArt {
    const per = pinCount / 2;
    const firstCenter = 20.95;
    const spacing = 20.9;
    const centers = Array.from({ length: per }, (_, i) => firstCenter + i * spacing);
    const pins: ArtPin[] = [];
    for (let pin = 1; pin <= pinCount; pin++) {
        // Bottom row: 1..per left to right; top row: pinCount..per+1 left to right.
        pins.push(pin <= per
            ? { x: centers[pin - 1], y: 62 }
            : { x: centers[pinCount - pin], y: 0 });
    }
    const bodyX = 8.75;
    const bodyW = (per - 1) * spacing + 24.4;
    return {
        url,
        width: bodyX + bodyW + 6.25,
        height: 62,
        pins,
        rotate: 0,
        scaleFrom: 'both',
        label: {
            x: bodyX + bodyW / 2,
            y: 31,
            coverWidth: bodyW - 12,
            coverHeight: 18,
            coverColor: '#333333',
        },
    };
}

const DIP8_TYPES = ['555', 'NE555', '741', 'LM741', 'LM358', 'LM393'];
const DIP16_TYPES = [
    '7447', '7476', '74138', '74139', '74148', '74151', '74153', '74161',
    '74165', '74173', '74HC75', '74HC283', '74HC595', '74HC4017', 'CD4511',
    'PCF8574',
];
const DIP20_TYPES = ['74245', '74373', '74374'];
const DIP24_TYPES = ['74181'];

const dip8Art = makeDipArt(dip8Url, 8);
const dip16Art = makeDipArt(dip16Url, 16);
const dip20Art = makeDipArt(dip20Url, 20);
const dip24Art = makeDipArt(dip24Url, 24);
for (const type of DIP8_TYPES) COMPONENT_ART[type] = dip8Art;
for (const type of DIP16_TYPES) COMPONENT_ART[type] = dip16Art;
for (const type of DIP20_TYPES) COMPONENT_ART[type] = dip20Art;
for (const type of DIP24_TYPES) COMPONENT_ART[type] = dip24Art;

export function artFor(type: string): ComponentArt | undefined {
    return COMPONENT_ART[type];
}

/**
 * Rendered size of the artwork in base units, derived from the footprint's
 * pin span. Used by the compiler to reserve enough room so large parts do
 * not overlap their neighbours.
 */
export function artDisplaySize(
    art: ComponentArt,
    footprintSpanX: number,
    footprintSpanY: number
): { width: number; height: number } | null {
    const theta = (art.rotate * Math.PI) / 180;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);

    // Pin spans in the rotated frame
    let pinMinX = Infinity, pinMaxX = -Infinity, pinMinY = Infinity, pinMaxY = -Infinity;
    for (const pin of art.pins) {
        const x = pin.x * cos - pin.y * sin;
        const y = pin.x * sin + pin.y * cos;
        pinMinX = Math.min(pinMinX, x); pinMaxX = Math.max(pinMaxX, x);
        pinMinY = Math.min(pinMinY, y); pinMaxY = Math.max(pinMaxY, y);
    }
    const pinW = pinMaxX - pinMinX;
    const pinH = pinMaxY - pinMinY;

    // Full artwork bounds in the rotated frame
    const corners = [
        { x: 0, y: 0 },
        { x: art.width, y: 0 },
        { x: art.width, y: art.height },
        { x: 0, y: art.height },
    ].map(p => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }));
    const artW = Math.max(...corners.map(c => c.x)) - Math.min(...corners.map(c => c.x));
    const artH = Math.max(...corners.map(c => c.y)) - Math.min(...corners.map(c => c.y));

    let scaleX = 0;
    let scaleY = 0;
    if (art.scaleFrom === 'both' && pinW > 0 && pinH > 0 && footprintSpanX > 0 && footprintSpanY > 0) {
        scaleX = footprintSpanX / pinW;
        scaleY = footprintSpanY / pinH;
    } else {
        let uniform = 0;
        if (pinW > 0 && footprintSpanX > 0) {
            uniform = footprintSpanX / pinW;
        } else if (pinH > 0 && footprintSpanY > 0) {
            uniform = footprintSpanY / pinH;
        } else {
            return null;
        }
        scaleX = uniform;
        scaleY = uniform;
    }

    return { width: artW * scaleX, height: artH * scaleY };
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
 * their holes. `extraRotation` is the component's own rotation in degrees.
 * Pure function so the mapping is unit-testable.
 */
export function computeArtTransform(
    art: ComponentArt,
    holes: Array<{ x: number; y: number } | undefined>,
    extraRotation = 0
): ArtTransform | null {
    const p1 = art.pins[0];
    const p2 = art.pins[1];
    const h1 = holes[0];
    const h2 = holes[1];
    if (!p1 || !p2 || !h1 || !h2) return null;

    const theta = ((art.rotate + extraRotation) * Math.PI) / 180;
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
