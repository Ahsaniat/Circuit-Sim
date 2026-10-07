# CircuitSim Documentation

Reference documentation for the DSL, the architecture and the algorithms
behind CircuitSim. All documents here are versioned with the code; local
working records (audit and bug reports, implementation summaries) are
intentionally not tracked.

| Document | Contents |
| :--- | :--- |
| [LANGUAGE_REFERENCE.md](LANGUAGE_REFERENCE.md) | Complete DSL syntax: components, boards, `def`, `map`, values |
| [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) | Compiler pipeline, geometry system, renderer and data flow |
| [IMPLEMENTATION.md](IMPLEMENTATION.md) | Deep dive into each module and how they cooperate |
| [component-library.md](component-library.md) | Component categories, footprints, shipped vs planned |
| [algorithms.md](algorithms.md) | Complexity analysis of snap, routing and placement |
| [observability.md](observability.md) | Logging schema and monitoring guidance |
| [decision-records.md](decision-records.md) | Architecture decision records (ADRs) |

## Screenshots

| File | Shows |
| :--- | :--- |
| [screenshots/app-editor.png](screenshots/app-editor.png) | Dark theme with the DSL editor and rendered breadboard |
| [screenshots/dark-canvas.png](screenshots/dark-canvas.png) | Theme-aware canvas in dark mode |
| [screenshots/light-canvas.png](screenshots/light-canvas.png) | Theme-aware canvas in light mode |
| [screenshots/inline-error.png](screenshots/inline-error.png) | Inline compile diagnostics and error panel |
