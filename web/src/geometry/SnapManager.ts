/**
 * SnapManager - Magnetic snap-to-hole system for breadboard components
 * 
 * This module provides:
 * 1. Snap-to-hole detection: When any pin gets close to a hole, snap it
 * 2. Connectivity tracking: Know which holes are occupied
 * 3. Occupancy map: Track what's connected where for future simulation
 * 
 * Snap behavior (like TinkerCAD):
 * - When dragging, if a pin comes within SNAP_RADIUS of a hole, snap to it
 * - Visual feedback shows snap targets
 * - Released components stay snapped
 */

import { BreadboardGeometry, HolePosition } from './BreadboardGeometry';
import { Position } from '../types';

// Snap threshold in base units (2.54mm per unit). Callers that know the
// current zoom should pass a radius converted from screen pixels instead so
// snapping feels the same at every zoom level.
export const SNAP_RADIUS = 1.2;  // About 3mm - close enough to grab

export interface HoleOccupancy {
    col: number;
    row: string;
    componentId: string;
    pinNumber: number;
    wireIndex?: number;
    terminal?: 'from' | 'to';
}

export interface SnapResult {
    snapped: boolean;
    hole?: HolePosition;
    distance: number;
}

export class SnapManager {
    private geometry: BreadboardGeometry;
    
    // Map of "col:row" -> occupancy info
    private occupancyMap: Map<string, HoleOccupancy[]> = new Map();
    
    constructor(geometry: BreadboardGeometry) {
        this.geometry = geometry;
    }
    
    /**
     * Update geometry reference (when board is moved)
     */
    setGeometry(geometry: BreadboardGeometry): void {
        this.geometry = geometry;
    }
    
    /**
     * Clear all occupancy data
     */
    clearOccupancy(): void {
        this.occupancyMap.clear();
    }
    
    /**
     * Register a component pin as occupying a hole
     */
    registerPinOccupancy(col: number, row: string, componentId: string, pinNumber: number): void {
        const key = `${col}:${row}`;
        if (!this.occupancyMap.has(key)) {
            this.occupancyMap.set(key, []);
        }
        this.occupancyMap.get(key)!.push({ col, row, componentId, pinNumber });
    }
    
    /**
     * Register a wire terminal as occupying a hole
     */
    registerWireOccupancy(col: number, row: string, wireIndex: number, terminal: 'from' | 'to'): void {
        const key = `${col}:${row}`;
        if (!this.occupancyMap.has(key)) {
            this.occupancyMap.set(key, []);
        }
        this.occupancyMap.get(key)!.push({ col, row, componentId: `wire_${wireIndex}`, pinNumber: 0, wireIndex, terminal });
    }
    
    /**
     * Get what's occupying a specific hole
     */
    getHoleOccupancy(col: number, row: string): HoleOccupancy[] {
        return this.occupancyMap.get(`${col}:${row}`) || [];
    }
    
    /**
     * Check if a hole is occupied by any component
     */
    isHoleOccupied(col: number, row: string): boolean {
        return this.occupancyMap.has(`${col}:${row}`);
    }
    
    /**
     * Get all components connected to the same electrical node.
     *
     * Breadboard semantics: main rows A–E and F–J are tied together within
     * a column; power rails are buses that run the full width of the board.
     */
    getConnectedComponents(col: number, row: string): HoleOccupancy[] {
        const connected: HoleOccupancy[] = [];

        if (BreadboardGeometry.RAIL_ROWS.includes(row)) {
            for (let c = 1; c <= BreadboardGeometry.NUM_COLS; c++) {
                connected.push(...this.getHoleOccupancy(c, row));
            }
            return connected;
        }

        const isTopHalf = BreadboardGeometry.TOP_ROWS.includes(row);
        const rowsToCheck = isTopHalf ? BreadboardGeometry.TOP_ROWS : BreadboardGeometry.BOTTOM_ROWS;
        
        for (const r of rowsToCheck) {
            const occupancy = this.getHoleOccupancy(col, r);
            connected.push(...occupancy);
        }
        
        return connected;
    }
    
    /**
     * Find the nearest hole to a given position
     * Returns snap info including whether the position is within snap range
     * Searches main rows (A-J) and power rail rows (TOP+, TOP-, BOTTOM+, BOTTOM-)
     */
    findNearestHole(pos: Position, radius: number = SNAP_RADIUS): SnapResult {
        // Windowed search: only columns that can contain a hole within the
        // radius need checking, which keeps drag events cheap (≤ ~9×14
        // instead of 14×63 distance computations).
        const spacing = BreadboardGeometry.HOLE_SPACING;
        const colGuess = Math.round((pos.x - this.geometry.holesStartX) / spacing) + 1;
        const colSpan = Math.max(1, Math.ceil(radius / spacing) + 1);
        const minCol = Math.max(1, colGuess - colSpan);
        const maxCol = Math.min(BreadboardGeometry.NUM_COLS, colGuess + colSpan);

        let nearestHole: HolePosition | undefined;
        let minDistance = Infinity;

        for (const row of BreadboardGeometry.ALL_ROWS_WITH_RAILS) {
            for (let col = minCol; col <= maxCol; col++) {
                const hole = this.geometry.getHolePosition(col, row);
                const dx = pos.x - hole.x;
                const dy = pos.y - hole.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < minDistance) {
                    minDistance = distance;
                    nearestHole = hole;
                }
            }
        }

        return {
            snapped: minDistance <= radius,
            hole: nearestHole,
            distance: minDistance
        };
    }
    
    /**
     * Snap a position to the nearest hole if within range
     * Returns the snapped position and hole info
     */
    snapPosition(pos: Position, radius: number = SNAP_RADIUS): { x: number; y: number; snapped: boolean; col?: number; row?: string } {
        const result = this.findNearestHole(pos, radius);
        
        if (result.snapped && result.hole) {
            return {
                x: result.hole.x,
                y: result.hole.y,
                snapped: true,
                col: result.hole.col,
                row: result.hole.row
            };
        }
        
        return { x: pos.x, y: pos.y, snapped: false };
    }
    
    /**
     * Snap a component position based on its first pin
     * This ensures the component is placed so pin 1 lands on a hole
     * 
     * @param bodyPos - Current body position (top-left corner)
     * @param pin1Offset - Offset of pin 1 from body position
     * @returns Adjusted body position that snaps pin 1 to nearest hole
     */
    snapComponentByPin(bodyPos: Position, pin1Offset: Position, radius: number = SNAP_RADIUS): { 
        bodyX: number; 
        bodyY: number; 
        snapped: boolean;
        snapCol?: number;
        snapRow?: string;
    } {
        // Calculate where pin 1 would be
        const pin1Pos = {
            x: bodyPos.x + pin1Offset.x,
            y: bodyPos.y + pin1Offset.y
        };
        
        // Find nearest hole for pin 1
        const snapResult = this.snapPosition(pin1Pos, radius);
        
        if (snapResult.snapped) {
            // Adjust body position so pin 1 lands on the snapped hole
            return {
                bodyX: snapResult.x - pin1Offset.x,
                bodyY: snapResult.y - pin1Offset.y,
                snapped: true,
                snapCol: snapResult.col,
                snapRow: snapResult.row
            };
        }
        
        return {
            bodyX: bodyPos.x,
            bodyY: bodyPos.y,
            snapped: false
        };
    }
    
    /**
     * Snap an IC component - special handling because it straddles the channel
     * Pin 1 should snap to row F, and the IC body should be positioned accordingly
     */
    snapICComponent(bodyPos: Position, _pinsPerSide: number, firstPinOffsetX: number, pinLength: number, radius: number = SNAP_RADIUS): {
        bodyX: number;
        bodyY: number;
        snapped: boolean;
        snapCol?: number;
    } {
        const holeSpacing = BreadboardGeometry.HOLE_SPACING;
        
        // Pin 1 is at bodyX + firstPinOffsetX, bodyY + bodyHeight + pinLength
        // We need to find where pin 1 would land
        const eToFDistance = holeSpacing + BreadboardGeometry.CHANNEL_HEIGHT;
        const bodyHeight = eToFDistance - 2 * pinLength;
        
        const pin1X = bodyPos.x + firstPinOffsetX;
        const pin1Y = bodyPos.y + bodyHeight + pinLength;
        
        // Find nearest hole in row F for pin 1
        let nearestCol = 1;
        let minDistance = Infinity;
        
        for (let col = 1; col <= BreadboardGeometry.NUM_COLS; col++) {
            const hole = this.geometry.getHolePosition(col, 'F');
            const distance = Math.sqrt((pin1X - hole.x) ** 2 + (pin1Y - hole.y) ** 2);
            
            if (distance < minDistance) {
                minDistance = distance;
                nearestCol = col;
            }
        }
        
        if (minDistance <= radius) {
            // Snap to this column
            const targetHole = this.geometry.getHolePosition(nearestCol, 'F');
            
            return {
                bodyX: targetHole.x - firstPinOffsetX,
                bodyY: targetHole.y - bodyHeight - pinLength,
                snapped: true,
                snapCol: nearestCol
            };
        }
        
        return {
            bodyX: bodyPos.x,
            bodyY: bodyPos.y,
            snapped: false
        };
    }
    
    /**
     * Get snap preview positions for visual feedback
     * Returns list of holes that would be occupied if component is placed at current position
     */
    getSnapPreview(bodyPos: Position, pinOffsets: Position[]): HolePosition[] {
        const previewHoles: HolePosition[] = [];
        
        for (const offset of pinOffsets) {
            const pinPos = {
                x: bodyPos.x + offset.x,
                y: bodyPos.y + offset.y
            };
            
            const result = this.findNearestHole(pinPos);
            if (result.hole && result.distance <= SNAP_RADIUS * 2) {
                previewHoles.push(result.hole);
            }
        }
        
        return previewHoles;
    }
}
