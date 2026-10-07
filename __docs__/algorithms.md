# Algorithm Complexity Analysis

## Snap System

### SnapManager.findNearestHole()
**Complexity**: O(R × W) where R = 14 rows and W = candidate columns within
the snap radius (typically 3–9).

**Description**: Windowed search. The candidate column is derived from the
pointer position, and only columns that can contain a hole within the radius
are checked, so drag events stay cheap regardless of board width.

**Before**: brute-force scan of all 14 × 63 = 882 holes per pointer move.
**After**: 14 × W distance computations (≤ ~126 at the widest zoom-adapted
radius), measured on every drag event.
**After power rail support**: R=14 (A-J + 4 rail rows) → 882 iterations max

**Rationale**: 
- Simple implementation, no spatial indexing needed
- Small constant (< 1000 holes per board)
- Called only during drag operations (mouse move events)
- Performance acceptable for single-board layouts

**Future optimization**: Could use quadtree or R-tree if multiple boards or performance issues arise.

### SnapManager.snapICComponent()
**Complexity**: O(C) where C = number of columns

**Description**: Linear scan to find nearest column for IC pin 1 placement.

**Analysis**: C=63 → 63 iterations max per IC drag event.

**Rationale**: Only searching a single row (F) for IC pin alignment.

## Component Rendering

### CircuitRenderer.redraw()
**Complexity**: O(B + C + W) where B = boards, C = components, W = wires

**Description**: Linear iteration over all circuit elements for rendering.

**Typical case**: B=1, C=10, W=20 → ~31 draw calls per frame

**Rationale**: Canvas rendering is stateless; must redraw everything each frame. Acceptable for typical circuit sizes.

## Wire Hit Detection

### CircuitRenderer.isPointNearWire()
**Complexity**: O(S) where S = number of wire segments

**Description**: Calculate distance from point to each line segment in wire path.

**Analysis**: Typical wire has 1-3 segments. Max ~10 segments for complex routing.

**Per-segment calculation**: O(1) - perpendicular distance to line segment.

**Rationale**: Precise hit detection required for wire selection/dragging.

## Occupancy Tracking

### CircuitRenderer.rebuildOccupancy()
**Complexity**: O(C × P + W) where C = components, P = avg pins per component, W = wires

**Description**: Rebuild occupancy map by iterating all component pins and wire terminals.

**Typical case**: 10 ICs × 14 pins + 20 wires = 160 occupancy registrations

**Rationale**: Called only after drag completion, not during drag.

## Draggable Element Search

### CircuitRenderer.findElementAt()
**Complexity**: O(W_t + D) where W_t = wire terminals, D = draggables

**Description**: Prioritized search: wire terminals → wires → components → boards

**Analysis**: 
- Wire terminals: O(W) where W = number of wires (check both ends)
- Other draggables: O(D) where D = total draggable elements

**Typical case**: 20 wires × 2 terminals + 11 draggables (1 board + 10 components) = 51 checks

**Rationale**: Priority order ensures small interactive elements are clickable even when overlapping larger elements.
