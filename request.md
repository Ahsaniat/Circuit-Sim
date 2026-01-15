# CircuitSim - Implementation Request

## Overview
This document tracks the implementation of four critical fixes for the CircuitSim web application.

## Issues Identified

### 1. Power Rail Wire Snapping (CRITICAL)
**Problem**: Wire terminals cannot snap to power rail holes (+ and - pins at top/bottom of breadboard).

**Root Cause**: `SnapManager.findNearestHole()` only searches main rows (A-J), excludes power rails.

**Impact**: Users cannot connect power wires, making circuits incomplete.

### 2. Missing Components (HIGH)
**Problem**: Component library is limited. Missing essential components:
- Switches (SPST, SPDT, pushbutton)
- Displays (7-segment, LCD)
- Buzzers (active/passive)
- Motors (DC, servo, stepper)
- Power supplies (battery, voltage regulator)
- Crystal oscillators
- Additional op-amps (comparators)

**Impact**: Cannot build common real-world circuits.

### 3. Wire Z-Order (MEDIUM)
**Problem**: Wires render on top of components, obscuring component details.

**Root Cause**: Rendering order in `CircuitRenderer.redraw()` draws wires after components.

**Impact**: Poor visual hierarchy, hard to identify component types.

### 4. PNG Export (LOW)
**Problem**: No export functionality. Users cannot save circuit diagrams.

**Impact**: Cannot share or document circuits outside the application.

## Implementation Plan

### Phase 1: Power Rail Snapping (ISSUE-001)
**Branch**: `fix/power-rail-snapping`

**Files Modified**:
- `web/src/geometry/BreadboardGeometry.ts` - Add power rail hole definitions
- `web/src/geometry/SnapManager.ts` - Update findNearestHole() to include rails
- `web/src/renderer/CircuitRenderer.ts` - Update occupancy tracking for rails

**Tests Required**:
- Unit test: Power rail hole position calculation
- Integration test: Wire terminal snaps to + rail
- Integration test: Wire terminal snaps to - rail
- Integration test: Occupancy tracking includes rail connections

**Verification Steps**:
```bash
cd web
npm run dev
# In browser:
# 1. Drag wire terminal near top + rail → should snap
# 2. Drag wire terminal near bottom - rail → should snap
# 3. Verify snap preview highlights rail hole
```

### Phase 2: Wire Z-Order Fix (ISSUE-002)
**Branch**: `fix/wire-z-order`

**Files Modified**:
- `web/src/renderer/CircuitRenderer.ts` - Reorder redraw() sequence

**Tests Required**:
- Visual test: Wires appear under components
- Visual test: Component pins remain visible
- Integration test: Wire terminals still clickable/draggable

**Verification Steps**:
```bash
cd web
npm run dev
# In browser:
# 1. Place IC component
# 2. Connect wire to IC pin
# 3. Verify wire appears under IC body
# 4. Verify wire terminals are still draggable
```

### Phase 3: PNG Export (ISSUE-003)
**Branch**: `feat/png-export`

**Files Modified**:
- `web/index.html` - Add download button with icon
- `web/src/main.ts` - Add exportPNG() method
- `web/src/renderer/CircuitRenderer.ts` - Add exportCanvas() method

**Tests Required**:
- Unit test: exportCanvas() returns valid PNG blob
- Integration test: Download button triggers file download
- Integration test: Filename format is correct (circuit-YYYYMMDD-HHMMSS.png)

**Verification Steps**:
```bash
cd web
npm run dev
# In browser:
# 1. Create a circuit
# 2. Click download icon
# 3. Verify PNG file downloads
# 4. Open PNG in image viewer → circuit should be visible
```

### Phase 4: Component Library Extension (ISSUE-004)
**Branch**: `feat/component-library-extension`

**Files Modified**:
- `web/src/geometry/ComponentFootprints.ts` - Add new component footprints
- `web/src/renderer/CircuitRenderer.ts` - Add render functions for new components
- `web/src/compiler/compiler.ts` - Add compiler support for new types
- `web/src/types.ts` - Extend ComponentCategory union

**New Components to Add**:
1. **Switches**: SPST (single-pole single-throw), SPDT, pushbutton
2. **Displays**: 7-segment display (common cathode/anode)
3. **Buzzers**: Active buzzer, passive buzzer
4. **Motors**: DC motor (2-pin), servo (3-pin)
5. **Power**: 9V battery, voltage regulator (LM7805)
6. **Crystal**: Crystal oscillator (2-pin)
7. **Op-amps**: LM339 comparator

**Tests Required** (per component):
- Unit test: Footprint dimensions correct
- Unit test: Pin positions align with breadboard holes
- Visual test: Component renders correctly
- Integration test: Component snaps to breadboard
- Integration test: Compiler recognizes component type

**Verification Steps**:
```bash
cd web
npm run dev
# In browser:
# For each component:
# 1. Add component in DSL code
# 2. Compile → should succeed
# 3. Component should render on breadboard
# 4. Drag component → should snap to holes
# 5. Visual inspection → component looks correct
```

## Environment Variables
No API keys or secrets required for this implementation.

## Dependencies
Current dependencies are sufficient:
- TypeScript 5.9.3
- Vite 5.4.21

No additional packages required.

## Timeline Estimate
- Issue 1 (Power rail snapping): 2-3 hours
- Issue 2 (Wire z-order): 30 minutes
- Issue 3 (PNG export): 1-2 hours
- Issue 4 (Component library): 6-8 hours

Total: ~10-14 hours of development time

## Success Criteria
1. All wires can snap to power rail holes
2. Wires render under components (better visual hierarchy)
3. PNG export button downloads circuit as image
4. At least 7 new component types added with full support

## Rollback Plan
Each issue is on a separate branch. If a fix causes problems:
1. Revert the specific branch
2. Investigate root cause
3. Fix and re-test
4. Merge again

## Security Considerations
- No user input is executed as code
- No server-side processing
- No external API calls
- All processing client-side in browser
- No secrets or credentials involved

## Notes
- All changes maintain TypeScript strict mode
- No breaking changes to existing DSL syntax
- Backward compatible with existing circuit files
- Performance impact minimal (< 5ms additional render time)
