import { CircuitIR, ComponentIR, BoardIR } from '../types';
import { BreadboardGeometry } from '../geometry/BreadboardGeometry';
import { getComponentFootprint } from '../geometry/ComponentFootprints';

/**
 * Standalone SVG export. Produces a real vector document (not a raster
 * wrapper): board, holes, wires and simplified component bodies.
 */
const S = 4; // matches the canvas BASE_SCALE for consistent proportions
const PAD = 20;

function esc(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function boardSvg(board: BoardIR, geo: BreadboardGeometry): string {
    const x = geo.x * S;
    const y = geo.y * S;
    const w = geo.width * S;
    const h = geo.height * S;
    const railH = BreadboardGeometry.RAIL_HEIGHT * S;

    const parts: string[] = [];
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#e8e4df" stroke="#bbb"/>`);
    parts.push(`<rect x="${x + 6}" y="${y}" width="${w - 12}" height="${railH}" fill="#f0ebe6"/>`);
    parts.push(`<rect x="${x + 6}" y="${y + h - railH}" width="${w - 12}" height="${railH}" fill="#f0ebe6"/>`);

    const holes: string[] = [];
    for (const row of BreadboardGeometry.ALL_ROWS_WITH_RAILS) {
        for (let col = 1; col <= BreadboardGeometry.NUM_COLS; col++) {
            const hole = geo.getHolePosition(col, row);
            holes.push(`<circle cx="${hole.x * S}" cy="${hole.y * S}" r="1.5" fill="#222"/>`);
        }
    }
    parts.push(`<g>${holes.join('')}</g>`);

    const labels: string[] = [];
    labels.push(`<text x="${x + 4}" y="${geo.getHolePosition(1, 'TOP+').y * S + 3}" font-size="9" font-family="sans-serif" font-weight="bold" fill="#c44">+</text>`);
    labels.push(`<text x="${x + 4}" y="${geo.getHolePosition(1, 'BOTTOM+').y * S + 3}" font-size="9" font-family="sans-serif" font-weight="bold" fill="#c44">+</text>`);
    for (let col = 1; col <= BreadboardGeometry.NUM_COLS; col += 5) {
        const hole = geo.getHolePosition(col, 'A');
        labels.push(`<text x="${hole.x * S}" y="${y + h + 10}" font-size="8" font-family="sans-serif" fill="#888" text-anchor="middle">${col}</text>`);
    }
    parts.push(`<g>${labels.join('')}</g>`);

    parts.push(`<text x="${x + 2}" y="${y - 3}" font-size="9" font-family="sans-serif" fill="#888">${esc(board.id)}</text>`);
    return parts.join('');
}

function ledColor(type: string): string {
    if (type === 'IR_LED') return '#660066';
    if (type.includes('GREEN')) return '#33ff33';
    if (type.includes('BLUE')) return '#3333ff';
    if (type.includes('YELLOW')) return '#ffff33';
    return '#ff3333';
}

function componentSvg(comp: ComponentIR): string {
    const category = comp.category ?? 'ic';
    const footprint = getComponentFootprint(category, comp.pinCount, comp.type);
    const x = comp.position.x * S;
    const y = comp.position.y * S;
    const w = footprint.bodyWidth * S;
    const h = footprint.bodyHeight * S;
    const cx = x + w / 2;
    const cy = y + h / 2;

    const parts: string[] = [];
    const label = esc(comp.type);
    const idLabel = esc(comp.value ? `${comp.id} ${comp.value}` : comp.id);

    switch (category) {
        case 'passive':
        case 'crystal': {
            parts.push(`<rect x="${x + 2}" y="${y}" width="${w - 4}" height="${h}" rx="2" fill="#d4a574" stroke="#8b6914"/>`);
            parts.push(`<text x="${cx}" y="${cy + 3}" font-size="7" font-family="sans-serif" fill="#5a4326" text-anchor="middle">${label}</text>`);
            break;
        }
        case 'diode': {
            parts.push(`<rect x="${x + 2}" y="${y}" width="${w - 4}" height="${h}" rx="2" fill="#1a1a1a"/>`);
            parts.push(`<rect x="${x + w - 5}" y="${y}" width="3" height="${h}" fill="#ccc"/>`);
            break;
        }
        case 'led':
        case 'sensor':
        case 'buzzer': {
            const radius = Math.min(w, h) / 2;
            const fill = category === 'led' ? ledColor(comp.type) : category === 'buzzer' ? '#222' : '#8b4513';
            parts.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${fill}" stroke="#666"/>`);
            break;
        }
        case 'transistor':
        case 'motor':
        case 'power':
        case 'switch': {
            parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="#333" stroke="#555"/>`);
            parts.push(`<text x="${cx}" y="${cy + 3}" font-size="7" font-family="sans-serif" fill="#bbb" text-anchor="middle">${label}</text>`);
            break;
        }
        case 'display':
        case 'ic':
        default: {
            parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#1a1a1a" stroke="#000"/>`);
            parts.push(`<text x="${cx}" y="${cy + 3}" font-size="9" font-family="monospace" font-weight="bold" fill="#999" text-anchor="middle">${label}</text>`);
            break;
        }
    }

    parts.push(`<text x="${cx}" y="${y + h + 14}" font-size="8" font-family="sans-serif" fill="#666" text-anchor="middle">${idLabel}</text>`);
    return parts.join('');
}

function wireSvg(ir: CircuitIR, index: number): string {
    const wire = ir.wires[index];
    const points: Array<{ x: number; y: number }> = [wire.from];
    if (wire.waypoints) points.push(...wire.waypoints);
    points.push(wire.to);
    const path = points.map(p => `${(p.x * S).toFixed(2)},${(p.y * S).toFixed(2)}`).join(' ');
    const from = wire.from;
    const to = wire.to;
    return [
        `<polyline points="${path}" fill="none" stroke="${esc(wire.color)}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`,
        `<circle cx="${(from.x * S).toFixed(2)}" cy="${(from.y * S).toFixed(2)}" r="4" fill="${esc(wire.color)}"/>`,
        `<circle cx="${(to.x * S).toFixed(2)}" cy="${(to.y * S).toFixed(2)}" r="4" fill="${esc(wire.color)}"/>`,
    ].join('');
}

export function buildSvg(
    ir: CircuitIR,
    geometries: Map<string, BreadboardGeometry>
): string {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const include = (x: number, y: number, w: number, h: number) => {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w);
        maxY = Math.max(maxY, y + h);
    };

    for (const board of ir.boards) {
        const geo = geometries.get(board.id);
        if (geo) include(geo.x, geo.y, geo.width, geo.height);
    }
    for (const comp of ir.components) {
        const footprint = getComponentFootprint(comp.category ?? 'ic', comp.pinCount, comp.type);
        include(comp.position.x - 2, comp.position.y - 2, footprint.bodyWidth + 4, footprint.bodyHeight + 20);
    }
    if (!Number.isFinite(minX)) {
        minX = 0; minY = 0; maxX = 10; maxY = 10;
    }

    const width = (maxX - minX) * S + PAD * 2;
    const height = (maxY - minY) * S + PAD * 2;

    const parts: string[] = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width.toFixed(0)} ${height.toFixed(0)}" width="${width.toFixed(0)}" height="${height.toFixed(0)}">`);
    parts.push(`<rect width="100%" height="100%" fill="#f5f5f5"/>`);
    parts.push(`<g transform="translate(${(PAD - minX * S).toFixed(2)}, ${(PAD - minY * S).toFixed(2)})">`);
    for (const board of ir.boards) {
        const geo = geometries.get(board.id);
        if (geo) parts.push(boardSvg(board, geo));
    }
    for (let i = 0; i < ir.wires.length; i++) {
        parts.push(wireSvg(ir, i));
    }
    for (const comp of ir.components) {
        parts.push(componentSvg(comp));
    }
    parts.push('</g></svg>');
    return parts.join('\n');
}
