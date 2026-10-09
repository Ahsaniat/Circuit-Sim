![CI](https://github.com/Ahsaniat/Circuit-Sim/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![C++](https://img.shields.io/badge/C%2B%2B-17-00599C?logo=cplusplus&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)

# CircuitSim

**Write a circuit in code, then watch it land on a breadboard.** CircuitSim is a small domain-specific language for electronic circuits built around real 74xx chips. The compiler resolves IC pinouts and places every part on a virtual 830-point breadboard. Press Simulate and the solver lights the LEDs. An electrical rule check reports wiring mistakes before you reach for real hardware.

![CircuitSim simulating a battery + LED circuit with live wire states](__docs__/screenshots/hero-simulation.png)

## What it does

**Compile a DSL.** Declare components and the connections between them in a readable syntax. The compiler resolves IC pinouts, places each part on the breadboard and routes the wires. Several breadboards can sit side by side, joined by jumper wires.

**Simulate the result.** Toggle Simulate and the canvas comes alive. Wires turn green for logic high and blue for logic low. LEDs glow, and buzzers show sound arcs. A circuit that oscillates is reported instead of hanging the page.

**Catch mistakes early.** The ERC panel sits under the editor. Shorted nets and disconnected IC power pins show up immediately, and so does a missing power source. An LED without its series resistor gets flagged too.

**Work visually.** Drag components and wires; they snap to holes with magnetic feedback. Press `R` to rotate a part: its pins stay on holes and attached wires follow. Click switches and buttons while simulating to press them. Undo and redo, autosave, fit-to-view, panning and touch gestures are all supported.

**Share and export.** Save the whole circuit as a PNG or as vector SVG. The BOM exports as grouped CSV, and a permalink encodes the circuit in the URL.

## Quick start

```bash
# 1. Clone
git clone https://github.com/Ahsaniat/Circuit-Sim.git
cd Circuit-Sim

# 2. Build the C++ compiler and run its tests
cmake -S . -B build -DBUILD_TESTS=ON -DCMAKE_BUILD_TYPE=Release
cmake --build build -j1                      # -j1 keeps low-memory machines happy
ctest --test-dir build --output-on-failure

# 3. Compile a circuit from the CLI
./build/circuitsim tests/conformance/led-basic.ok.csim

# 4. Run the web app
cd web
npm ci
npm run dev        # http://localhost:5173
```

| Command | What it does |
| :--- | :--- |
| `npm run dev` | Start the Vite dev server with hot reload |
| `npm test` | Run the Vitest suite (compiler, geometry, simulation, ERC, exports) |
| `npm run typecheck` | TypeScript strict check |
| `npm run build` | Typecheck and produce a production bundle in `web/dist` |
| `ctest --test-dir build` | Run the C++ compiler test suite |

## The language

```csim
// Battery + LED with current-limiting resistor
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

| Concept | Syntax | Notes |
| :--- | :--- | :--- |
| Component | `@keyword ID [value]` | Values keep their units: `10k`, `4.7k`, `100uF`, `16MHz` |
| Board | `@board ID breadboard_830` | 830, 400 and 170-point breadboards; several boards sit side by side |
| Connection | `(SRC pin N -> DST pin M, ...)` | Multiple destinations per source; cross-board jumpers allowed |
| Board scoping | `B1.map ( ... )` | Components first referenced in the block are placed on B1 |
| Explicit placement | `place R1, LED1 on B2` | Authoritative over scoped maps |
| Custom IC | `def MyIC (A -> input, B -> output)` | Pin names and directions feed tooltips and ERC |
| Comments | `// ...` | Layout metadata is stored in a trailing `//!layout:` comment |

**Full syntax, every keyword and the board/wiring rules live in the
[Language Reference](__docs__/LANGUAGE_REFERENCE.md).**

<details>
<summary><b>Component keywords</b></summary>

| Category | Keywords |
| :--- | :--- |
| Logic gates | `@AND` `@OR` `@NOT` `@NAND` `@NOR` `@XOR` `@AND3` `@NAND3` `@NOR3` `@AND4` `@NAND4` |
| MSI | `@mux_4x1` `@mux_8x1` `@decoder_3to8` `@decoder_2to4` `@encoder_8to3` `@shift_reg_8` `@d_flipflop` `@jk_flipflop` `@latch_8` `@counter_4bit` `@counter_decade` |
| Passives | `@resistor` `@capacitor` `@inductor` `@potentiometer` |
| Diodes & LEDs | `@diode` `@zener_diode` `@schottky_diode` `@led` `@ir_led` `@photodiode` `@ldr` |
| Transistors | `@npn` `@pnp` `@nmos` `@pmos` |
| Switches | `@switch_spst` `@switch_spdt` `@pushbutton` |
| Displays & audio | `@display_7seg` `@buzzer` `@passive_buzzer` |
| Motors & power | `@motor_dc` `@servo` `@battery` `@regulator` `@crystal` |
| Generic | `@comp ID 7408` for any built-in IC number |

</details>

## Simulation and ERC

The simulator builds an electrical netlist from the physical placement. Column halves, full-width power rails, pins, wires, closed switches and battery terminals all become nodes. It then evaluates the netlist to a fixed point using four values: `0`, `1`, `X` for an unknown or conflicting net, and `Z` for floating.

| Status | Components |
| :--- | :--- |
| Fully modelled | 7400, 7402, 7404, 7408, 7410, 7411, 7420, 7421, 7427, 7432, 7486 gates, LEDs, buzzers, resistors, inductors, switches (open), batteries |
| Reported as unsupported | 555 timer, counters, flip-flops, op-amps, displays (shown in ERC, outputs treated as unknown) |

## Screenshots

**ERC diagnostics.** Problems appear under the editor and in the status bar.

![ERC diagnostics panel](__docs__/screenshots/erc-diagnostics.png)

**Net highlighting.** Hover a wire and its whole electrical net lights up.

![Net highlighting](__docs__/screenshots/net-highlight.png)

**Simulation.** Wires turn green for logic high and blue for logic low, and the LED lights up when current flows.

![Simulation overlay on a battery + LED circuit](__docs__/screenshots/simulation-led.png)

**Two boards.** A battery on the first board powers both LEDs through cross-board jumper wires.

![Two breadboards with cross-board jumpers](__docs__/screenshots/two-boards-simulation.png)

**Colour-coded jumpers.** Wire colours stay readable across both boards.

![Two boards with colour-coded jumper wires](__docs__/screenshots/tinkercad-style-wires.png)

**Boards on the move.** Drag a board and its components travel with it while the jumper wires follow.

![A board being dragged with its wires following](__docs__/screenshots/moved-board-wires-follow.png)

**Wire routing.** Drag a wire and it snaps back to the nearest holes.

![A wire being dragged](__docs__/screenshots/icons-and-drag.png)

**Parts worth browsing.** Hover any component for its name and a short description.

![Component showcase with a hover tooltip](__docs__/screenshots/components-showcase.png)

**Inline diagnostics.** A typo is underlined in the editor, and the message appears in a toast and the error panel.

![Inline compile diagnostics in the editor](__docs__/screenshots/inline-error.png)

**Light theme.** The canvas follows the theme through CSS custom properties.

![Light theme](__docs__/screenshots/light-canvas.png)

**Dark theme.** The same circuit with the dark palette.

![Dark theme canvas](__docs__/screenshots/dark-canvas.png)

**Editor and canvas.** The CodeMirror editor sits beside the rendered breadboard.

![Editor and canvas with a compiled voltage-regulator circuit](__docs__/screenshots/app-editor.png)

## Architecture

The dependency arrow points one way. The UI depends on the compiler and the simulation engine, never the reverse.

| Layer | Location | Responsibility |
| :--- | :--- | :--- |
| DSL compiler (C++) | `src/lexer` `src/parser` `src/semantic` `src/ir` | CLI compiler with diagnostics and JSON IR |
| DSL compiler (web) | `web/src/compiler` | Browser compiler with the same grammar and error semantics |
| Geometry | `web/src/geometry` | Breadboard coordinates, footprints, magnetic snapping |
| Simulation | `web/src/simulation` | Netlist extraction and digital fixed-point solver |
| ERC | `web/src/erc` | Electrical rule checks |
| Rendering | `web/src/renderer` | Canvas scene, interaction, exports |
| UI | `web/src/ui` | CodeMirror editor, palette, panels, theme |

<details>
<summary><b>Compiler pipeline</b></summary>

```
source → lexer → parser → semantic validation → IR generation → JSON / canvas scene
```

Both compilers run against the same fixtures in `tests/conformance/`. Files ending in `.ok.csim` must compile; files ending in `.err.csim` must fail. That keeps the two implementations honest without two test suites drifting apart.

</details>

## Development

| Task | Command |
| :--- | :--- |
| Watch mode tests | `npm run test:watch` (in `web/`) |
| C++ tests | `cmake --build build -j1 && ctest --test-dir build` |
| Memory watcher (local) | `nohup scripts/dev/memwatch.sh &` writes `logs/memwatch.log` |

Every push and pull request runs the C++ build and its tests, the TypeScript typecheck, the web test suite and a production build.

## Roadmap

Not implemented yet, and tracked honestly: simulation models for the 555, counters and flip-flops; SPICE netlist export; offline or PWA install; guided lessons; a visual editor for custom ICs. The ERC panel lists every IC that currently lacks a model.

## License

MIT. See [LICENSE](LICENSE) for the full text. Bundled third-party assets and their licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
