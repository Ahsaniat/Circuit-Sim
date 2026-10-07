# CircuitSim Documentation

Reference documentation for the DSL, the architecture and the algorithms
behind CircuitSim. All documents here are versioned with the code; local
working records (audit and bug reports, implementation summaries) are
intentionally not tracked.

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
| [screenshots/simulation-led.png](screenshots/simulation-led.png) | Simulation overlay on a battery + LED circuit |
| [screenshots/erc-diagnostics.png](screenshots/erc-diagnostics.png) | ERC problems under the editor and in the status bar |
| [screenshots/net-highlight.png](screenshots/net-highlight.png) | Net highlighting on wire hover |
| [screenshots/icons-and-drag.png](screenshots/icons-and-drag.png) | Tabler Icons palette, BOM/Share toolbar, dragged wire |
| [screenshots/inline-error.png](screenshots/inline-error.png) | Inline compile diagnostics in the editor |
| [screenshots/dark-canvas.png](screenshots/dark-canvas.png) | Theme-aware canvas in dark mode |
| [screenshots/light-canvas.png](screenshots/light-canvas.png) | Theme-aware canvas in light mode |
| [screenshots/app-editor.png](screenshots/app-editor.png) | Early editor screenshot (pre-CodeMirror) |
