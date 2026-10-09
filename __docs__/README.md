# CircuitSim Documentation

Reference documentation for the CircuitSim DSL, the geometry system and the
simulation algorithms. Every document here is versioned with the code. Working
records from local development, such as audit findings and bug reports,
intentionally stay untracked.

| Document | Contents |
| :--- | :--- |
| [LANGUAGE_REFERENCE.md](LANGUAGE_REFERENCE.md) | Complete DSL syntax: components, boards, scoped maps, `place`, `def`, wiring rules, errors |
| [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) | Compiler pipeline, geometry system, renderer and data flow |
| [IMPLEMENTATION.md](IMPLEMENTATION.md) | Deep dive into each module and how they cooperate |
| [component-library.md](component-library.md) | Component categories, footprints, shipped vs planned |
| [algorithms.md](algorithms.md) | Complexity analysis of snap, routing and placement |
| [observability.md](observability.md) | Logging schema and monitoring guidance |
| [decision-records.md](decision-records.md) | Architecture decision records (ADRs) |

## Screenshots

| File | Shows |
| :--- | :--- |
| [screenshots/hero-simulation.png](screenshots/hero-simulation.png) | Battery + LED simulation with live wire states (hero image) |
| [screenshots/two-boards-simulation.png](screenshots/two-boards-simulation.png) | Two breadboards with cross-board jumpers, both LEDs lit |
| [screenshots/tinkercad-style-wires.png](screenshots/tinkercad-style-wires.png) | Colour-coded jumper wires across two boards |
| [screenshots/moved-board-wires-follow.png](screenshots/moved-board-wires-follow.png) | A moved board with its components and jumper endpoints following |
| [screenshots/simulation-led.png](screenshots/simulation-led.png) | Simulation overlay on a battery + LED circuit |
| [screenshots/erc-diagnostics.png](screenshots/erc-diagnostics.png) | ERC problems under the editor and in the status bar |
| [screenshots/net-highlight.png](screenshots/net-highlight.png) | Net highlighting on wire hover |
| [screenshots/icons-and-drag.png](screenshots/icons-and-drag.png) | A wire being dragged, with the palette and toolbar in view |
| [screenshots/components-showcase.png](screenshots/components-showcase.png) | Component showcase with a hover tooltip |
| [screenshots/inline-error.png](screenshots/inline-error.png) | Inline compile diagnostics in the editor |
| [screenshots/dark-canvas.png](screenshots/dark-canvas.png) | Theme-aware canvas in dark mode |
| [screenshots/light-canvas.png](screenshots/light-canvas.png) | Theme-aware canvas in light mode |
| [screenshots/app-editor.png](screenshots/app-editor.png) | Editor and canvas with a compiled voltage-regulator circuit |
