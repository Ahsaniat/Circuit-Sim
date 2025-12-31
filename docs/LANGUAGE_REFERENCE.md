# CircuitSim Language Reference

CircuitSim is a domain-specific language for describing electronic circuits with real IC components and breadboard layouts.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Components](#components)
3. [Boards](#boards)
4. [Custom IC Definitions](#custom-ic-definitions)
5. [Pin Mapping](#pin-mapping)
6. [Built-in Components](#built-in-components)
7. [Comments](#comments)
8. [Examples](#examples)

---

## Quick Start

```
@comp A1 7408
@board B1 breadboard_830

map (
    (A1 pin 3 -> B1 pin 5)
)
```

This creates a 7408 AND gate IC named `A1` on a breadboard `B1`, connecting pin 3 of the IC to column 5 on the breadboard.

---

## Components

### Syntax

```
@comp <identifier> <component_type>
```

### Parameters

| Parameter | Description |
|-----------|-------------|
| `identifier` | User-defined name for the component (e.g., `A1`, `U1`, `IC1`) |
| `component_type` | IC part number (e.g., `7408`, `555`, `74161`) |

### Example

```
@comp A1 7408    // 7408 quad AND gate, labeled A1
@comp U2 7432    // 7432 quad OR gate, labeled U2
@comp T1 555     // 555 timer IC
```

### Notes

- Identifiers must start with a letter and can contain letters, numbers, and underscores
- Each identifier must be unique within the circuit
- Components are automatically placed on the breadboard straddling the center channel

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

### Example

```
@board B1 breadboard_830
```

### Breadboard Layout

```
     1   2   3   4   5  ...  63
   +-----------------------------+
   |  + Power Rail (Red)         |
   +-----------------------------+
 A |  o   o   o   o   o  ...  o  |
 B |  o   o   o   o   o  ...  o  |  Top Half
 C |  o   o   o   o   o  ...  o  |  (rows A-E connected vertically)
 D |  o   o   o   o   o  ...  o  |
 E |  o   o   o   o   o  ...  o  |
   +=============================+  Center Channel
 F |  o   o   o   o   o  ...  o  |
 G |  o   o   o   o   o  ...  o  |  Bottom Half
 H |  o   o   o   o   o  ...  o  |  (rows F-J connected vertically)
 I |  o   o   o   o   o  ...  o  |
 J |  o   o   o   o   o  ...  o  |
   +-----------------------------+
   |  - Power Rail (Blue)        |
   +-----------------------------+
```

- Holes in the same column within each half are electrically connected
- The center channel separates the two halves
- ICs straddle the center channel with pins in rows E and F

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

### Pin Numbering Convention

For DIP (Dual In-line Package) ICs, pins are numbered counter-clockwise starting from pin 1:

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
| `7420` | Dual 4-input NAND gate | 14 |
| `7432` | Quad 2-input OR gate | 14 |
| `7447` | BCD to 7-segment decoder | 16 |
| `7474` | Dual D flip-flop | 14 |
| `7486` | Quad 2-input XOR gate | 14 |
| `7490` | Decade counter | 14 |
| `74138` | 3-to-8 line decoder | 16 |
| `74139` | Dual 2-to-4 line decoder | 16 |
| `74151` | 8-to-1 multiplexer | 16 |
| `74153` | Dual 4-to-1 multiplexer | 16 |
| `74161` | 4-bit binary counter | 16 |
| `74164` | 8-bit shift register | 14 |
| `74173` | 4-bit D register | 16 |
| `74181` | 4-bit ALU | 24 |
| `74245` | Octal bus transceiver | 20 |
| `74373` | Octal transparent latch | 20 |
| `74374` | Octal D flip-flop | 20 |

### Timer ICs

| Part Number | Description | Pins |
|-------------|-------------|------|
| `555` | Timer IC | 8 |
| `NE555` | Timer IC (alternate) | 8 |

### Operational Amplifiers

| Part Number | Description | Pins |
|-------------|-------------|------|
| `741` | General purpose op-amp | 8 |
| `LM741` | General purpose op-amp | 8 |
| `LM358` | Dual op-amp | 8 |

---

## Comments

Single-line comments start with `//`:

```
// This is a comment
@comp A1 7408  // Inline comment
```

---

## Examples

### Example 1: Simple AND Gate Circuit

```
// Two AND gates with outputs connected to breadboard
@comp A1 7408
@board B1 breadboard_830

map (
    (A1 pin 3 -> B1 pin 20)   // Gate 1 output
    (A1 pin 6 -> B1 pin 25)   // Gate 2 output
)
```

### Example 2: Two-IC Logic Circuit

```
// AND gate feeding OR gate
@comp AND1 7408
@comp OR1 7432
@board B1 breadboard_830

map (
    (AND1 pin 3 -> OR1 pin 1)   // AND output to OR input
    (AND1 pin 6 -> OR1 pin 2)   // Another AND output to OR
    (OR1 pin 3 -> B1 pin 30)    // Final output
)
```

### Example 3: 555 Timer Astable Mode

```
@comp T1 555
@board B1 breadboard_830

map (
    (T1 pin 3 -> B1 pin 40)    // Output
    (T1 pin 2 -> T1 pin 6)     // Trigger to threshold (astable)
)
```

### Example 4: Counter Circuit

```
@comp CNT1 74161
@comp DEC1 7447
@board B1 breadboard_830

map (
    // Counter outputs to decoder inputs
    (CNT1 pin 14 -> DEC1 pin 7)   // QA
    (CNT1 pin 13 -> DEC1 pin 1)   // QB
    (CNT1 pin 12 -> DEC1 pin 2)   // QC
    (CNT1 pin 11 -> DEC1 pin 6)   // QD
)
```

---

## Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `Duplicate component declaration` | Same identifier used twice | Use unique identifiers |
| `Unknown component type` | IC part number not recognized | Check spelling or define custom IC |
| `Undefined component` | Reference to undeclared component | Declare component with `@comp` first |
| `Invalid pin number` | Pin number exceeds IC's pin count | Check IC datasheet for valid pins |
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
echo "@comp A1 7408" | circuitsim --json-only
```
