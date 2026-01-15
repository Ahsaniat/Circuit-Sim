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

// Snap threshold in base units (2.54mm per unit)
// If a pin is within this distance of a hole center, it snaps
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
     * Get all components connected to the same electrical node
     * (same column means electrically connected on breadboard)
     */
    getConnectedComponents(col: number, row: string): HoleOccupancy[] {
        const connected: HoleOccupancy[] = [];
        
        // All rows in same half share connectivity within a column
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
     */
    findNearestHole(pos: Position): SnapResult {
        let nearestHole: HolePosition | undefined;
        let minDistance = Infinity;
        
        // Check all main rows
        for (const row of BreadboardGeometry.ALL_ROWS) {
            for (let col = 1; col <= BreadboardGeometry.NUM_COLS; col++) {
                const hole = this.geometry.getHolePosition(col, row);
                const distance = Math.sqrt((pos.x - hole.x) ** 2 + (pos.y - hole.y) ** 2);
                
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestHole = hole;
                }
            }
        }
        
        return {
            snapped: minDistance <= SNAP_RADIUS,
            hole: nearestHole,
            distance: minDistance
        };
    }
    
    /**
     * Snap a position to the nearest hole if within range
     * Returns the snapped position and hole info
     */
    snapPosition(pos: Position): { x: number; y: number; snapped: boolean; col?: number; row?: string } {
        const result = this.findNearestHole(pos);
        
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
    snapComponentByPin(bodyPos: Position, pin1Offset: Position): { 
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
        const snapResult = this.snapPosition(pin1Pos);
        
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
    snapICComponent(bodyPos: Position, _pinsPerSide: number, firstPinOffsetX: number, pinLength: number): {
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
        
        if (minDistance <= SNAP_RADIUS) {
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
