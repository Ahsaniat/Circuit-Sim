# Component Library Extension

## Overview
This document details the new components being added to CircuitSim.

## Component Categories

### Current Categories (Before Extension)
- `ic`: Integrated circuits (74xx series, 555 timer, op-amps)
- `passive`: Resistors, capacitors, inductors, potentiometers
- `diode`: Standard diodes, Zener, Schottky
- `led`: Light emitting diodes (red, green, blue, yellow, IR)
- `sensor`: LDR, photodiode
- `transistor`: BJT (NPN/PNP), MOSFET (NMOS/PMOS)

### New Categories (Extension)
- `switch`: SPST, SPDT, DPDT, pushbutton, slide switch
- `display`: 7-segment display (common cathode/anode), LCD
- `buzzer`: Active buzzer, passive buzzer
- `motor`: DC motor, servo motor
- `power`: 9V battery, voltage regulator (LM7805, LM7812)
- `crystal`: Crystal oscillator
- `comparator`: LM339 quad comparator

## Component Specifications

### Switches
**SPST (Single Pole Single Throw)**
- Pins: 2
- Footprint: Horizontal, 3-hole span
- Visual: Toggle switch with ON/OFF states

**SPDT (Single Pole Double Throw)**
- Pins: 3
- Footprint: Vertical, 3 adjacent columns
- Visual: Toggle switch with common, NC, NO terminals

**Pushbutton**
- Pins: 4 (2x2 configuration)
- Footprint: Straddles channel (like IC but 2-wide)
- Visual: Round button on rectangular body

### Displays
**7-Segment Display**
- Pins: 10 (8 segments + 2 common)
- Footprint: 2 rows of 5 pins, straddles channel
- Visual: Classic 7-segment rectangle with decimal point

### Buzzers
**Active Buzzer**
- Pins: 2
- Footprint: Vertical, 2 adjacent columns
- Visual: Cylindrical body with + marking

**Passive Buzzer**
- Pins: 2
- Footprint: Vertical, 2 adjacent columns
- Visual: Cylindrical body (no polarity marking)

### Motors
**DC Motor**
- Pins: 2
- Footprint: Horizontal, 3-hole span
- Visual: Cylindrical motor body with shaft

**Servo Motor**
- Pins: 3 (VCC, GND, Signal)
- Footprint: Vertical, 3 adjacent columns
- Visual: Rectangular servo body with wire connections

### Power Components
**9V Battery**
- Pins: 2
- Footprint: Vertical, 2 adjacent columns
- Visual: Rectangular battery with + and - terminals

**Voltage Regulator (LM7805)**
- Pins: 3 (IN, GND, OUT)
- Footprint: TO-220 package, 3 adjacent columns
- Visual: Black TO-220 body with heat sink tab

### Crystal Oscillator
- Pins: 2
- Footprint: Horizontal, 2-hole span
- Visual: Cylindrical metal can

### Comparator (LM339)
- Pins: 14 (DIP package)
- Footprint: IC, straddles channel
- Visual: Standard DIP IC body

## Implementation Checklist

### Phase 1: Footprint Definitions
- [ ] Add switch footprints (SPST, SPDT, pushbutton)
- [ ] Add display footprint (7-segment)
- [ ] Add buzzer footprints (active, passive)
- [ ] Add motor footprints (DC, servo)
- [ ] Add power footprints (battery, regulator)
- [ ] Add crystal footprint
- [ ] Add comparator footprint

### Phase 2: Rendering Functions
- [ ] renderSwitch() - toggle and pushbutton variants
- [ ] renderDisplay() - 7-segment with segments
- [ ] renderBuzzer() - cylindrical body
- [ ] renderMotor() - DC and servo variants
- [ ] renderPower() - battery and regulator
- [ ] renderCrystal() - metal can body
- [ ] renderComparator() - use existing IC renderer

### Phase 3: Compiler Support
- [ ] Add switch types to compiler
- [ ] Add display types to compiler
- [ ] Add buzzer types to compiler
- [ ] Add motor types to compiler
- [ ] Add power types to compiler
- [ ] Add crystal types to compiler
- [ ] Add comparator types to compiler

### Phase 4: Type Definitions
- [ ] Update ComponentCategory union type
- [ ] Add component-specific value types
- [ ] Update compiler type mappings

## Testing Strategy

### Unit Tests
For each component:
1. Footprint dimensions correct
2. Pin positions align with breadboard holes
3. Pin offsets calculated correctly

### Visual Tests
For each component:
1. Component renders at correct position
2. Component visual matches real component
3. Pins align with breadboard holes
4. Labels are readable

### Integration Tests
For each component:
1. Compiler recognizes component type
2. Component snaps to breadboard correctly
3. Wires can connect to component pins
4. Occupancy tracking works correctly

## Example Usage

```
// Switch circuit
@switch SW1 SPST
@led LED1 red
@resistor R1 330
@board B1 breadboard_830

map (
    (SW1 pin 1 -> R1 pin 1)
    (R1 pin 2 -> LED1 pin 1)
)

// 7-segment display
@display DISP1 7SEG_CA
@resistor R1 330
@board B1 breadboard_830

map (
    (DISP1 pin 1 -> R1 pin 1)
)

// Motor control
@motor M1 DC
@transistor Q1 NPN
@board B1 breadboard_830

map (
    (Q1 pin 3 -> M1 pin 1)
)
```

## Performance Impact
- Additional component categories: negligible
- Rendering complexity: O(C) where C = component count (no change)
- Compilation time: < 5ms additional (type checking)
- Bundle size: +5-8 KB (compressed)

## Backward Compatibility
- All existing circuit files work unchanged
- No breaking changes to DSL syntax
- New components are opt-in
