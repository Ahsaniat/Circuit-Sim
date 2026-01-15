# Architecture Decision Records

## ADR-001: Web-based Circuit Simulator Architecture

**Date**: 2026-01-15
**Status**: Accepted

### Context
CircuitSim is a visual circuit simulator with a domain-specific language. The existing implementation uses TypeScript/Vite for the web frontend with canvas rendering.

### Decision
- Use TypeScript strict mode for type safety
- Canvas-based rendering for circuit visualization
- Geometry-based coordinate system (base units = 2.54mm)
- Snap-to-grid system for component placement

### Consequences
- Strong typing reduces runtime errors
- Canvas provides pixel-perfect control for circuit diagrams
- Snap system improves UX but requires careful coordinate mapping

## ADR-002: Power Rail Snap Support

**Date**: 2026-01-15
**Status**: Proposed

### Context
Wire terminals cannot snap to power rail holes (+ and - rails at top/bottom of breadboard). Only main rows (A-J) are supported in SnapManager.findNearestHole().

### Decision
- Extend BreadboardGeometry to define power rail hole positions
- Add RAIL_ROWS constant for '+' and '-' rows
- Update SnapManager.findNearestHole() to include rail holes
- Update occupancy tracking for rail connections

### Consequences
- Wires can connect to power rails
- Increased complexity in hole position calculations
- Need to handle two power rails per board (top/bottom)

## ADR-003: Component Library Extension

**Date**: 2026-01-15
**Status**: Proposed

### Context
Current component library is limited. Missing: switches, buttons, displays, buzzers, motors, power supply, crystal oscillators, comparators.

### Decision
Add new component categories:
- `switch`: SPST, SPDT, DPDT, pushbutton, slide
- `display`: 7-segment, LCD, OLED
- `buzzer`: active/passive buzzers
- `motor`: DC motor, servo, stepper
- `power`: battery, power supply, voltage regulator
- `crystal`: oscillator footprints
- `opamp`: comparator variants

Each component gets:
- Footprint definition in ComponentFootprints.ts
- Render function in CircuitRenderer.ts
- Compiler support in compiler.ts

### Consequences
- More comprehensive component library
- Better real-world circuit representation
- Larger bundle size (minimal impact)

## ADR-004: Wire Z-Order Rendering

**Date**: 2026-01-15
**Status**: Proposed

### Context
Wires currently render on top of components, obscuring component details.

### Decision
Change rendering order in CircuitRenderer.redraw():
1. Board
2. Snap preview
3. Wires (move before components)
4. Components

### Consequences
- Wires appear under components (better visual hierarchy)
- Component pins remain visible
- Wire terminals still accessible for dragging

## ADR-005: PNG Export Feature

**Date**: 2026-01-15
**Status**: Proposed

### Context
No export functionality exists. Users cannot save circuit diagrams.

### Decision
- Add download button with icon in canvas header
- Use canvas.toBlob() for PNG generation
- Trigger browser download with dynamically created anchor element
- Filename format: `circuit-YYYYMMDD-HHMMSS.png`

### Consequences
- Users can save and share circuit diagrams
- No server-side processing required
- PNG format universally supported
