# CircuitSim Language Reference

The complete guide to the CircuitSim DSL: every statement, every component
keyword and the rules that connect them. The web editor and the C++ CLI
compiler implement the same language and are verified against the same
fixtures in `tests/conformance/`.

## Table of Contents

1. [File structure](#file-structure)
2. [Components](#components)
3. [Boards](#boards)
4. [Wiring with map blocks](#wiring-with-map-blocks)
5. [Choosing a board: scoped maps and place](#choosing-a-board-scoped-maps-and-place)
6. [Cross-board connections](#cross-board-connections)
7. [Custom ICs with def](#custom-ics-with-def)
8. [Comments and layout metadata](#comments-and-layout-metadata)
9. [Simulation coverage](#simulation-coverage)
10. [Electrical rule check](#electrical-rule-check)
11. [Error messages](#error-messages)
12. [Complete examples](#complete-examples)
13. [CLI usage](#cli-usage)
14. [Canvas controls](#canvas-controls)

---

## File structure

A `.csim` file is a sequence of statements. Order does not matter: boards,
components, definitions and wiring can be interleaved freely.

```
@board B1 breadboard_830        // board declaration
@resistor R1 330                // component declaration
def MyIC ( A -> input )         // custom IC definition
place R1 on B1                  // explicit placement
B1.map ( (R1 pin 1 -> B1 pin 5) )  // board-scoped wiring
map ( (R1 pin 2 -> R2 pin 1) )     // global wiring
```

---

## Components

### Type-specific keywords (recommended)

| Category | Keywords |
| :--- | :--- |
| Logic gates | `@AND` `@OR` `@NOT` `@NAND` `@NOR` `@XOR` |
| 3-input gates | `@AND3` `@NAND3` `@NOR3` |
| 4-input gates | `@AND4` `@NAND4` |
| Multiplexers | `@mux_4x1` `@mux_8x1` |
| Decoders / encoders | `@decoder_3to8` `@decoder_2to4` `@encoder_8to3` |
| Registers / flip-flops | `@shift_reg_8` `@shift_reg_8_parallel` `@d_flipflop` `@jk_flipflop` `@latch_8` |
| Counters | `@counter_4bit` `@counter_decade` |
| Passives | `@resistor` `@capacitor` `@inductor` `@potentiometer` |
| Diodes | `@diode` `@zener_diode` `@schottky_diode` |
| LEDs / optical | `@led` `@ir_led` `@photodiode` `@ldr` |
| Transistors | `@npn` `@pnp` `@nmos` `@pmos` |
| Switches | `@switch_spst` `@switch_spdt` `@pushbutton` |
| Displays / audio | `@display_7seg` `@buzzer` `@passive_buzzer` |
| Motors / power | `@motor_dc` `@servo` `@battery` `@regulator` `@crystal` |

### Declaration syntax

```
@keyword ID [value]
```

`ID` must start with a letter or underscore. `value` is optional and keeps
units and part numbers intact: `10k`, `4.7k`, `100uF`, `16MHz`, `2N2222`,
`LM7805`, `red`. For gate keywords the value may also be a 74xx part number:
`@AND A1 7408`.

### Generic syntax

Any built-in IC can be declared with `@comp ID TYPE`:

```
@comp A1 7408      // quad 2-input AND
@comp T1 555       // timer
@comp OA1 LM741    // op-amp
```

### Component values

| Component | Example | Notes |
| :--- | :--- | :--- |
| `@resistor` | `@resistor R1 10k` | Ω, `k`, `M` suffixes preserved |
| `@capacitor` | `@capacitor C1 100uF` | Unit suffix preserved |
| `@inductor` | `@inductor L1 10mH` | Unit suffix preserved |
| `@crystal` | `@crystal Y1 16MHz` | Frequency preserved |
| `@led` | `@led LED1 red` | Colour name preserved |
| `@npn` / `@pnp` | `@npn Q1 2N2222` | Part number preserved |
| `@battery` | `@battery BAT1 9V` | Voltage preserved |

---

## Boards

### Declaration

```
@board ID TYPE
```

| Board type | Connection points |
| :--- | :--- |
| `breadboard_830` | 830 |
| `breadboard_400` | 400 |
| `breadboard_170` | 170 |

Multiple boards are laid out side by side and are electrically independent
unless a jumper wire connects them.

### Board pin numbering

Board pins address a physical hole:

| Pin N | Column | Row |
| :--- | :--- | :--- |
| 1 … 63 | N | D (top half) |
| 64 … 126 | N − 63 | G (bottom half) |

Example: `B1 pin 5` is column 5, row D on board B1. `B1 pin 68` is column 5,
row G.

> **One wire per board pin.** A board pin is a single hole, so two separate
> connections may not use the same `Bx pin N`. To fan a signal out, wire the
> components to each other, or use different pins in the same column
> half — all five rows of a column half are one electrical node.

### Electrical model

| Region | Connectivity |
| :--- | :--- |
| Rows A–E of a column | One node |
| Rows F–J of a column | One node |
| Top/bottom `+` rail | Full-width bus, driven high |
| Top/bottom `−` rail | Full-width bus, driven low |

---

## Wiring with map blocks

```
map (
    (SRC pin N -> DST pin M)
    (SRC pin N -> DST1 pin M1, DST2 pin M2)
)
```

| Element | Meaning |
| :--- | :--- |
| `(A -> B)` | One connection |
| `->` | Direction of the wire (drawn from source to destination) |
| `,` | Several destinations for one source |
| Several `map` blocks | Allowed; their connections are merged |

Wires may reference components, board pins, or both in the same connection.

---

## Choosing a board: scoped maps and place

Components are placed on a board in one of three ways:

| Method | Syntax | Rule |
| :--- | :--- | :--- |
| Default | *(nothing)* | Unreferenced components go to the first declared board |
| Scoped map | `B1.map ( ... )` | Every component the block **first references** is placed on B1 |
| Explicit | `place R1, LED1 on B2` | Authoritative, regardless of statement order |

### Scoped map rules

1. A component referenced by `B1.map` that has no board yet is assigned to B1.
2. If the same component is first referenced by two different scoped maps
   (`B1.map` and `B2.map`) without an explicit `place`, the compiler reports
   an ambiguity error — use `place` to decide.
3. A component already assigned elsewhere may still appear in another scoped
   map; that reference is simply a cross-board wire.
4. `B1 map ( ... )` (without the dot) is accepted as an alias of `B1.map`.

### place rules

1. `place` overrides scoped-map assignment regardless of position in the file.
2. Two `place` statements disagreeing about the board are an error.
3. The board must be declared; the components must exist.

```
@board B1 breadboard_830
@board B2 breadboard_830
@resistor R1 330
@resistor R2 330

place R1 on B1
place R2 on B2
```

---

## Cross-board connections

A wire may connect any two points, including across boards. The compiler
draws it as a jumper and the simulator treats it as a conductor.

```
// component on B1 to component on B2
map ( (R1 pin 2 -> R2 pin 1) )

// component on B1 to a pin on B2
B1.map ( (R1 pin 1 -> B2 pin 5) )

// board pin to board pin (single hole each)
map ( (B1 pin 10 -> B2 pin 10) )
```

To power a second board, jumper from a component on the first board (for
example a battery pin) directly to a component on the second board — see
[Example 2](#example-2-two-boards-with-a-jumper).

---

## Custom ICs with def

```
def NAME (
    pinName -> input,
    pinName -> output,
    pinName -> gnd,
    pinName -> vcc
)

@comp M1 NAME
```

| Pin type | Meaning |
| :--- | :--- |
| `input` | Drives nothing; read by the IC |
| `output` | Drives the net; used for output-contention checks |
| `gnd` | Ground reference |
| `vcc` | Power reference |

Rules: pin count comes from the definition; redefining a built-in IC number
is an error; pin names feed tooltips, ERC and the simulator.

---

## Comments and layout metadata

| Syntax | Purpose |
| :--- | :--- |
| `// text` | Comment, ignored by the compiler |
| `//!layout: {json}` | Canvas layout metadata written by the editor; ignored by the compiler, re-applied on load |

---

## Simulation coverage

The simulator extracts a netlist from the physical layout and evaluates to a
fixed point with values `0`, `1`, `X` (unknown or conflict) and `Z`
(floating).

| Status | Components |
| :--- | :--- |
| Modelled | 7400, 7402, 7404, 7408, 7410, 7411, 7420, 7421, 7427, 7432, 7486, LEDs, buzzers, resistors, inductors, open switches, batteries |
| Reported unsupported | 555, counters, flip-flops, op-amps, displays |

Notes: floating or unknown inputs propagate `X`; series resistors conduct
logic levels; closed switches short their pins (set programmatically);
oscillating circuits are reported as unstable instead of hanging.

---

## Electrical rule check

| Severity | Rule |
| :--- | :--- |
| Error | Net driven both high and low (short circuit) |
| Error | Two outputs driving the same net |
| Warning | IC power pins not connected to a supply |
| Warning | LED without a series resistor |
| Warning | Unconnected two-pin component |
| Info | No wired power source |
| Info | IC without a simulation model |

---

## Error messages

| Message | Cause |
| :--- | :--- |
| `Unknown directive '@x'` | Typo or unsupported `@keyword` |
| `Unexpected token 'x'` | Stray text outside any statement |
| `Unexpected character 'x'` | Character outside the grammar (for example `;`) |
| `Duplicate component declaration` / `Duplicate board declaration` | Same ID twice |
| `Undefined component: 'X'` | Reference to an undeclared ID |
| `Invalid pin number N for 'X'` | Pin outside the component's range |
| `Pin N on board 'X' is already connected` | Two wires on one board pin |
| `Unknown board: 'X'` | Scoped map or `place` names an undeclared board |
| `Component 'X' is referenced by both ...` | Two scoped maps claim the same component |
| `Component 'X' is already placed on 'Y'` | Conflicting `place` statements |
| `Cannot redefine built-in IC` | `def` with a built-in number |
| `Duplicate IC definition` | Two `def` blocks with the same name |
| `Unknown component type` | `@comp` with an undeclared type |

---

## Complete examples

### Example 1: single board, LED indicator

```
@battery BAT1 9V
@resistor R1 330
@led LED1 red
@board B1 breadboard_830

map (
    (BAT1 pin 1 -> R1 pin 1)
    (R1 pin 2 -> LED1 pin 1)
    (BAT1 pin 2 -> LED1 pin 2)
)
```

### Example 2: two boards with a jumper

```
@board B1 breadboard_830
@board B2 breadboard_830

@battery BAT1 9V
@resistor R1 330
@led LED1 red
place BAT1, R1, LED1 on B1

B1.map (
    (BAT1 pin 1 -> R1 pin 1)
    (R1 pin 2 -> LED1 pin 1)
    (BAT1 pin 2 -> LED1 pin 2)
)

@resistor R2 330
@led LED2 red
place R2, LED2 on B2

B2.map (
    (R2 pin 2 -> LED2 pin 1)
)

// Cross-board jumpers: power to B2 and a shared ground
map (
    (BAT1 pin 1 -> R2 pin 1)
    (LED1 pin 2 -> LED2 pin 2)
)
```

### Example 3: logic chain on one board

```
@AND A1 7408
@OR O1 7432
@NOT I1 7404
@board B1 breadboard_830

map (
    (A1 pin 3 -> O1 pin 1)
    (A1 pin 6 -> O1 pin 2)
    (O1 pin 3 -> I1 pin 1)
)
```

### Example 4: custom IC

```
def HalfAdder (
    A -> input,
    B -> input,
    Sum -> output,
    Carry -> output
)

@comp HA1 HalfAdder
@board B1 breadboard_830

map (
    (HA1 pin 1 -> HA1 pin 3)
    (HA1 pin 2 -> HA1 pin 4)
)
```

---

## CLI usage

```bash
# Compile a file to JSON
./build/circuitsim circuit.csim

# JSON only, no informational output
./build/circuitsim --json-only circuit.csim

# Read from stdin
cat circuit.csim | ./build/circuitsim --json-only
```

---

## Canvas controls

| Input | Action |
| :--- | :--- |
| Click + drag | Move a component, wire or board |
| Drag a wire endpoint | Re-route with magnetic snapping |
| Delete / Backspace | Delete the selection |
| Escape | Clear selection |
| Space + drag, middle-drag | Pan |
| Scroll wheel, pinch | Zoom |
| `F` | Fit circuit to view |
| Ctrl + Z / Ctrl + Shift + Z | Undo / redo canvas edits |
| Ctrl + Enter | Compile |
| Ctrl + S / Ctrl + O | Save / open |
| Ctrl + Shift + E | Export PNG |
