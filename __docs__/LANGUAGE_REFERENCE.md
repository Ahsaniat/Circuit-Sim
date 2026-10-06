# CircuitSim Language Reference

CircuitSim is a domain-specific language for describing electronic circuits with real IC components and breadboard layouts.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Component Syntax](#component-syntax)
3. [Boards](#boards)
4. [Pin Mapping](#pin-mapping)
5. [Built-in Components](#built-in-components)
6. [Custom IC Definitions](#custom-ic-definitions)
7. [Comments](#comments)
8. [Examples](#examples)
9. [Canvas Controls](#canvas-controls)

---

## Quick Start

```
// New syntax - use component-specific keywords
@AND A1 7408
@resistor R1 10k
@led D1 red
@board B1 breadboard_830

map (
    (A1 pin 3 -> R1 pin 1)
    (R1 pin 2 -> D1 pin 1)
)
```

Or use the generic syntax:

```
@comp A1 7408
@board B1 breadboard_830

map (
    (A1 pin 3 -> B1 pin 5)
)
```

---

## Component Syntax

CircuitSim supports two syntaxes for declaring components:

### Type-Specific Keywords (Recommended)

Use `@<component_type>` for clearer, self-documenting code:

```
@<component_type> <identifier> [value_or_part_number]
```

| Syntax | Example | Description |
|--------|---------|-------------|
| `@resistor` | `@resistor R1 10k` | Resistor with value |
| `@capacitor` | `@capacitor C1 100uF` | Capacitor with value |
| `@led` | `@led D1 red` | LED (color optional) |
| `@AND` | `@AND A1 7408` | AND gate IC |
| `@npn` | `@npn Q1 2N2222` | NPN transistor |

### Generic Syntax

For custom or unrecognized components:

```
@comp <identifier> <component_type>
```

Example:
```
@comp U1 ATmega328P
@comp IC1 LM7805
```

---

## Passive Components

### Resistors, Capacitors, Inductors

```
@resistor R1 10k       // 10kΩ resistor
@resistor R2 4.7k      // 4.7kΩ resistor
@capacitor C1 100uF    // 100µF capacitor
@capacitor C2 0.1uF    // 100nF capacitor
@inductor L1 10mH      // 10mH inductor
@potentiometer P1 10k  // 10kΩ potentiometer (3 pins)
```

### Diodes

```
@diode D1              // Standard diode
@zener_diode Z1 5.1V   // 5.1V Zener diode
@schottky_diode S1     // Schottky diode
```

### LEDs and Optical Components

```
@led LED1 red          // Red LED
@led LED2 green        // Green LED
@ir_led IR1            // Infrared LED
@photodiode PD1        // Photodiode
@ldr LDR1              // Light Dependent Resistor
```

---

## Transistors

### BJT Transistors

```
@npn Q1 2N2222         // NPN transistor
@npn Q2 BC547          // NPN transistor
@pnp Q3 2N2907         // PNP transistor
```

### MOSFETs

```
@nmos M1 2N7000        // N-channel MOSFET
@pmos M2 IRF9540       // P-channel MOSFET
```

Pin order: 1=Base/Gate, 2=Collector/Drain, 3=Emitter/Source

---

## Logic Gates

### 2-Input Gates (Quad packages, 14 pins)

```
@AND A1 7408           // Quad 2-input AND gate
@AND A2                // Uses default 7408
@OR O1 7432            // Quad 2-input OR gate
@XOR X1 7486           // Quad 2-input XOR gate
@NAND N1 7400          // Quad 2-input NAND gate
@NOR NR1 7402          // Quad 2-input NOR gate
@NOT I1 7404           // Hex inverter (NOT gate)
```

### 3-Input Gates (Triple packages, 14 pins)

```
@AND3 A1 7411          // Triple 3-input AND gate
@NAND3 N1 7410         // Triple 3-input NAND gate
@NOR3 NR1 7427         // Triple 3-input NOR gate
```

### 4-Input Gates (Dual packages, 14 pins)

```
@AND4 A1 7421          // Dual 4-input AND gate
@NAND4 N1 7420         // Dual 4-input NAND gate
```

---

## Multiplexers and Decoders

### Multiplexers

```
@mux_4x1 M1 74153      // Dual 4-to-1 multiplexer
@mux_8x1 M2 74151      // 8-to-1 multiplexer
```

### Decoders and Encoders

```
@decoder_3to8 D1 74138 // 3-to-8 line decoder
@decoder_2to4 D2 74139 // Dual 2-to-4 line decoder
@encoder_8to3 E1 74148 // 8-to-3 priority encoder
```

---

## Shift Registers and Flip-Flops

### Shift Registers

```
@shift_reg_8 SR1 74164          // 8-bit serial-in parallel-out
@shift_reg_8_parallel SR2 74165 // 8-bit parallel-in serial-out
```

### Flip-Flops and Latches

```
@d_flipflop FF1 7474   // Dual D flip-flop
@jk_flipflop FF2 7476  // Dual JK flip-flop
@latch_8 L1 74373      // Octal transparent latch
```

### Counters

```
@counter_4bit C1 74161   // 4-bit binary counter
@counter_decade C2 7490  // Decade counter
```

---

## Boards

### Syntax

```
@board <identifier> <board_type>
```

### Supported Board Types

| Type | Description |
|------|-------------|
| `breadboard_830` | Standard 830-point breadboard (63 columns, 10 rows) |
| `breadboard_400` | Half-size 400-point breadboard |
| `breadboard_170` | Mini 170-point breadboard |

### Breadboard Layout

```
     1   2   3   4   5  ...  63
   +-----------------------------+
   |  + Power Rail               |
   +-----------------------------+
 A |  o   o   o   o   o  ...  o  |
 B |  o   o   o   o   o  ...  o  |  Top Half
 C |  o   o   o   o   o  ...  o  |  (rows A-E shorted)
 D |  o   o   o   o   o  ...  o  |
 E |  o   o   o   o   o  ...  o  |
   +=============================+  Center Channel
 F |  o   o   o   o   o  ...  o  |
 G |  o   o   o   o   o  ...  o  |  Bottom Half
 H |  o   o   o   o   o  ...  o  |  (rows F-J shorted)
 I |  o   o   o   o   o  ...  o  |
 J |  o   o   o   o   o  ...  o  |
   +-----------------------------+
   |  - Power Rail               |
   +-----------------------------+
```

- Holes in the same column within each half are electrically connected
- ICs straddle the center channel with pins in rows E and F

---

## Pin Mapping

### Syntax

```
map (
    (<source> -> <destination>, <destination>, ...)
    (<source> -> <destination>)
    ...
)
```

### Pin Reference

```
<component_id> pin <pin_number>
```

### Examples

```
// Single connection
map (
    (A1 pin 3 -> B1 pin 5)
)

// Multiple destinations from one source
map (
    (A1 pin 3 -> U2 pin 1, U2 pin 2, B1 pin 10)
)

// Multiple connections
map (
    (A1 pin 1 -> B1 pin 5)
    (A1 pin 2 -> B1 pin 6)
    (A1 pin 3 -> U2 pin 1)
    (U2 pin 3 -> B1 pin 15)
)
```

### Pin Numbering for DIP ICs

```
        Notch
          U
    +-----+-----+
  1 |o          | 14
  2 |           | 13
  3 |           | 12
  4 |   7408    | 11
  5 |           | 10
  6 |           | 9
  7 |           | 8
    +-----------+
```

In CircuitSim's horizontal layout:
- Pins 1-7 are on the top row (left to right)
- Pins 8-14 are on the bottom row (right to left)

---

## Built-in Components

### 74xx Series Logic ICs

| Part Number | Description | Pins |
|-------------|-------------|------|
| `7400` | Quad 2-input NAND gate | 14 |
| `7402` | Quad 2-input NOR gate | 14 |
| `7404` | Hex inverter | 14 |
| `7408` | Quad 2-input AND gate | 14 |
| `7410` | Triple 3-input NAND gate | 14 |
| `7411` | Triple 3-input AND gate | 14 |
| `7420` | Dual 4-input NAND gate | 14 |
| `7421` | Dual 4-input AND gate | 14 |
| `7427` | Triple 3-input NOR gate | 14 |
| `7432` | Quad 2-input OR gate | 14 |
| `7447` | BCD to 7-segment decoder | 16 |
| `7474` | Dual D flip-flop | 14 |
| `7476` | Dual JK flip-flop | 16 |
| `7486` | Quad 2-input XOR gate | 14 |
| `7490` | Decade counter | 14 |
| `74138` | 3-to-8 line decoder | 16 |
| `74139` | Dual 2-to-4 line decoder | 16 |
| `74148` | 8-to-3 priority encoder | 16 |
| `74151` | 8-to-1 multiplexer | 16 |
| `74153` | Dual 4-to-1 multiplexer | 16 |
| `74161` | 4-bit binary counter | 16 |
| `74164` | 8-bit shift register (SIPO) | 14 |
| `74165` | 8-bit shift register (PISO) | 16 |
| `74173` | 4-bit D register | 16 |
| `74181` | 4-bit ALU | 24 |
| `74245` | Octal bus transceiver | 20 |
| `74373` | Octal transparent latch | 20 |
| `74374` | Octal D flip-flop | 20 |

### Timer ICs

| Part Number | Description | Pins |
|-------------|-------------|------|
| `555` / `NE555` | Timer IC | 8 |

### Operational Amplifiers

| Part Number | Description | Pins |
|-------------|-------------|------|
| `741` / `LM741` | General purpose op-amp | 8 |
| `LM358` | Dual op-amp | 8 |

---

## Custom IC Definitions

### Syntax

```
def <ic_name> (
    <pin_name> -> <pin_type>,
    <pin_name> -> <pin_type>,
    ...
)
```

### Pin Types

| Type | Description |
|------|-------------|
| `input` | Input pin |
| `output` | Output pin |
| `gnd` | Ground connection |
| `vcc` | Power supply |

### Example

```
def MyGate (
    in1 -> input,
    in2 -> input,
    out1 -> output,
    gnd -> gnd,
    vcc -> vcc
)

@comp G1 MyGate
```

---

## Comments

Single-line comments start with `//`:

```
// This is a comment
@AND A1 7408  // Inline comment
```

---

## Examples

### Example 1: LED with Current Limiting Resistor

```
@AND A1 7408
@resistor R1 330
@led D1 red
@board B1 breadboard_830

map (
    (A1 pin 3 -> R1 pin 1)    // AND gate output to resistor
    (R1 pin 2 -> D1 pin 1)    // Resistor to LED anode
)
```

### Example 2: Logic Gate Chain

```
@AND A1 7408
@OR O1 7432
@NOT I1 7404
@board B1 breadboard_830

map (
    (A1 pin 3 -> O1 pin 1)    // AND output to OR input
    (A1 pin 6 -> O1 pin 2)    // Another AND output
    (O1 pin 3 -> I1 pin 1)    // OR output to inverter
)
```

### Example 3: Transistor Switch

```
@npn Q1 2N2222
@resistor R1 1k
@resistor R2 10k
@led D1 green
@board B1 breadboard_830

map (
    (R2 pin 2 -> Q1 pin 1)    // Base resistor to transistor
    (Q1 pin 2 -> R1 pin 1)    // Collector to LED resistor
    (R1 pin 2 -> D1 pin 1)    // Resistor to LED
)
```

### Example 4: 8-to-1 Multiplexer

```
@mux_8x1 M1 74151
@AND A1 7408
@board B1 breadboard_830

map (
    (A1 pin 3 -> M1 pin 4)    // AND output to mux data input
    (M1 pin 5 -> B1 pin 30)   // Mux output
)
```

### Example 5: Shift Register with LED Display

```
@shift_reg_8 SR1 74164
@resistor R1 330
@resistor R2 330
@led D1 red
@led D2 green
@board B1 breadboard_830

map (
    (SR1 pin 3 -> R1 pin 1)   // Q0 output
    (R1 pin 2 -> D1 pin 1)
    (SR1 pin 4 -> R2 pin 1)   // Q1 output
    (R2 pin 2 -> D2 pin 1)
)
```

---

## Canvas Controls

### Mouse Controls

| Action | Control |
|--------|---------|
| **Zoom** | Mouse wheel (centered on cursor) |
| **Select component** | Left click on component |
| **Drag component** | Click and drag |
| **Drag board** | Click and drag on breadboard (moves all components) |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Compile code |

---

## Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `Duplicate component declaration` | Same identifier used twice | Use unique identifiers |
| `Unknown component type` | Component keyword not recognized | Check spelling or use `@comp` |
| `Undefined component` | Reference to undeclared component | Declare component first |
| `Invalid pin number` | Pin number exceeds component's pin count | Check component datasheet |
| `Expected '(' after map` | Missing parenthesis | Add opening parenthesis |

---

## File Extension

CircuitSim source files use the `.csim` extension:

```
my_circuit.csim
```

---

## Command Line Usage

```bash
# Compile and output JSON
circuitsim circuit.csim

# Output JSON only (no debug info)
circuitsim --json-only circuit.csim

# Read from stdin
echo "@AND A1 7408" | circuitsim --json-only
```
