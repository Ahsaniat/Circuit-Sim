# CircuitSim

A code-to-circuit simulator with a domain-specific language for describing electronic circuits using real IC components and breadboard layouts.

## Features

- **DSL for Circuits**: Write circuit descriptions in a simple, readable syntax
- **Real IC Support**: Built-in library of 74xx series, 555 timers, op-amps
- **Breadboard Layout**: Automatic component placement with proper pin alignment
- **Visual Output**: Canvas-based rendering with colored wire routing
- **Live Compilation**: Instant feedback in the browser

## Quick Start

### Web Interface

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### Command Line

```bash
cd build
cmake ..
make
./circuitsim circuit.csim
```

## Language Overview

```
// Declare components
@AND A1 7408        // 7408 AND gate IC
@OR O1 7432        // 7432 OR gate IC
@board B1 breadboard_830

// Define connections
map (
    (A1 pin 3 -> O1 pin 1)    // Connect AND output to OR input
    (A1 pin 6 -> O1 pin 2)
    (O1 pin 3 -> B1 pin 30)   // Final output to breadboard
)
```

See [docs/LANGUAGE_REFERENCE.md](docs/LANGUAGE_REFERENCE.md) for complete documentation.

## Project Structure

```
CircuitSim/
├── src/                 # C++ compiler
│   ├── lexer/          # Tokenizer
│   ├── parser/         # Parser + AST
│   ├── semantic/       # Type checking
│   └── ir/             # IR generation
├── web/                # Web interface
│   └── src/
│       ├── compiler/   # TypeScript compiler
│       └── renderer/   # Canvas rendering
├── docs/               # Documentation
└── tests/              # Test circuits
```

## Built-in Components

| Category | Components |
|----------|------------|
| Logic Gates | 7400, 7402, 7404, 7408, 7410, 7420, 7432, 7486 |
| Flip-flops | 7474, 74373, 74374 |
| Counters | 7490, 74161 |
| Decoders | 7447, 74138, 74139 |
| Multiplexers | 74151, 74153 |
| Timers | 555, NE555 |
| Op-amps | 741, LM741, LM358 |

## Build Requirements

- C++17 compiler (GCC, Clang, MSVC)
- CMake 3.16+
- Node.js 18+ (for web interface)

## License

MIT
