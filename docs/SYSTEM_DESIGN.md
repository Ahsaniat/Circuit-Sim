# CircuitSim System Design- Prototype

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CircuitSim                                │
├─────────────────────────────────────────────────────────────────┤
│  Source File (.csim)                                            										     │
│       │                                                         								   │
│       ▼                                                         								│
│  ┌─────────┐    ┌────────┐    ┌──────────┐    ┌─────────────┐  │
│  │  Lexer  │───▶│ Parser │───▶│ Semantic │───▶│ IR Generator│  │
│  │         │    │        │    │ Analyzer │    │             │  │
│  └─────────┘    └────────┘    └──────────┘    └─────────────┘  │
│       │              │              │               │           │
│       │         Token Stream       AST         Circuit IR       │
│       │                                             │           │
│       │                                             ▼           │
│       │                                    ┌─────────────────┐  │
│       │                                    │ Renderer Engine │  │
│       │                                    │    (WebGL)      │  │
│       │                                    └─────────────────┘  │
│       │                                             │           │
│       ▼                                             ▼           │
│   Error Reporter                            Visual Output       │
└─────────────────────────────────────────────────────────────────┘
```

## Module Breakdown

### 1. Lexer (Tokenizer)
**Purpose:** Convert source text into tokens

**Token Types:**
- `KEYWORD`: @comp, @board, def, map
- `IDENTIFIER`: Variable names (A1, B1, IC_NAME)
- `TYPE`: input, output, gnd, vcc
- `NUMBER`: Pin numbers
- `OPERATOR`: ->, ,
- `DELIMITER`: (, ), {, }
- `COMPONENT_TYPE`: 7408, breadboard_830, etc.
- `COMMENT`: // single line
- `NEWLINE`, `EOF`

**Files:**
- `src/lexer/lexer.h`
- `src/lexer/lexer.cpp`
- `src/lexer/token.h`

### 2. Parser
**Purpose:** Build AST from token stream

**Grammar (EBNF):**
```ebnf
program        = { statement } ;
statement      = comp_decl | board_decl | ic_def | map_block ;
comp_decl      = "@comp" IDENTIFIER COMPONENT_TYPE ;
board_decl     = "@board" IDENTIFIER BOARD_TYPE ;
ic_def         = "def" IDENTIFIER "(" pin_list ")" ;
pin_list       = pin_decl { "," pin_decl } ;
pin_decl       = IDENTIFIER "->" TYPE ;
map_block      = "map" "(" { connection } ")" ;
connection     = "(" pin_ref "->" pin_ref_list ")" ;
pin_ref        = IDENTIFIER "pin" NUMBER ;
pin_ref_list   = pin_ref { "," pin_ref } ;
```

**Files:**
- `src/parser/parser.h`
- `src/parser/parser.cpp`
- `src/parser/ast.h`

### 3. Semantic Analyzer
**Purpose:** Validate AST, type checking, symbol resolution

**Checks:**
- Component/board declared before use
- Pin numbers valid for component type
- Type compatibility (input->output, not output->output)
- No duplicate declarations
- Pin conflict detection on boards

**Files:**
- `src/semantic/analyzer.h`
- `src/semantic/analyzer.cpp`
- `src/semantic/symbol_table.h`

### 4. IR Generator
**Purpose:** Transform validated AST into renderable circuit representation

**Circuit IR Structure:**
```cpp
struct CircuitIR {
    vector<Component> components;
    vector<Board> boards;
    vector<Connection> connections;
    vector<Wire> wires;  // Resolved physical paths
};
```

**Files:**
- `src/ir/circuit_ir.h`
- `src/ir/ir_generator.cpp`

### 5. Component Library
**Purpose:** Store predefined IC definitions, pinouts, dimensions

**Structure:**
```cpp
struct ICDefinition {
    string name;           // "7408"
    string description;    // "Quad 2-input AND gate"
    int pin_count;         // 14
    vector<PinDef> pins;   // Pin definitions with types
    Dimensions size;       // Physical dimensions
};
```

**Files:**
- `src/components/component_lib.h`
- `src/components/ic_defs.cpp`
- `src/components/board_defs.cpp`

### 6. Renderer (WebGL)
**Purpose:** Visual output of circuit

**Why WebGL over OpenGL:**
- Cross-platform via browser
- Easier distribution (no native builds)
- Modern tooling (TypeScript, bundlers)

**Approach:**
- C++ backend compiles to WASM via Emscripten
- WebGL frontend renders circuit
- Communication via JSON IR

**Files:**
- `src/renderer/` (C++ side, WASM bindings)
- `web/src/renderer/` (TypeScript/WebGL)

## Directory Structure

```
CircuitSim/
├── src/
│   ├── lexer/
│   │   ├── lexer.h
│   │   ├── lexer.cpp
│   │   └── token.h
│   ├── parser/
│   │   ├── parser.h
│   │   ├── parser.cpp
│   │   └── ast.h
│   ├── semantic/
│   │   ├── analyzer.h
│   │   ├── analyzer.cpp
│   │   └── symbol_table.h
│   ├── ir/
│   │   ├── circuit_ir.h
│   │   └── ir_generator.cpp
│   ├── components/
│   │   ├── component_lib.h
│   │   ├── ic_defs.cpp
│   │   └── board_defs.cpp
│   ├── error/
│   │   ├── error_reporter.h
│   │   └── error_reporter.cpp
│   └── main.cpp
├── web/
│   ├── src/
│   │   ├── renderer/
│   │   ├── ui/
│   │   └── main.ts
│   ├── index.html
│   └── package.json
├── tests/
│   ├── lexer_test.cpp
│   ├── parser_test.cpp
│   └── test_circuits/
├── CMakeLists.txt
├── PLAN.md
└── SYSTEM_DESIGN.md
```

## Potential Shortcomings & Mitigations

| Issue | Risk | Mitigation |
|-------|------|------------|
| Complex wire routing on breadboard | High | Start with simple left-to-right routing; implement A* pathfinding later |
| Pin conflict detection | Medium | Track occupied pins per board row; error on conflict |
| Custom IC validation | Medium | Require all pins defined; validate against usage |
| Large circuit performance | Low | Use instanced rendering; lazy evaluation |
| Cross-platform WASM | Medium | Abstract platform-specific code; test on multiple browsers |

## Development Phases

### Phase 1: Core Language (COMPLETE)
- [x] Lexer implementation
- [x] Parser implementation
- [x] Basic AST structure
- [x] Error reporting

### Phase 2: Semantic Analysis (COMPLETE)
- [x] Symbol table
- [x] Type checking
- [x] Validation rules
- [x] Built-in IC library (74xx series, 555, op-amps)
- [x] Pin conflict detection

### Phase 3: IR Generation (COMPLETE)
- [x] Circuit IR structure
- [x] Connection resolution
- [x] Wire path calculation
- [x] JSON export
- [x] Component/board layout

### Phase 4: Rendering (COMPLETE)
- [x] Canvas setup
- [x] Component rendering (DIP ICs with pins)
- [x] Wire rendering (colored connections)
- [x] Board rendering (breadboard with holes)
- [x] Basic UI (code editor, compile button)

### Phase 5: Polish (COMPLETE)
- [x] TypeScript compiler (browser-native)
- [x] Live compilation in browser
- [x] Error display
- [x] Keyboard shortcuts (Ctrl+Enter)

## Checkpoint: All Phases Complete

## Build System

**C++ Backend:**
- CMake for build configuration
- C++17 standard
- Emscripten for WASM compilation

**Web Frontend:**
- TypeScript
- Vite for bundling
- No heavy frameworks (vanilla + WebGL)

## API Design

**Compiler Interface:**
```cpp
class Compiler {
public:
    Result<CircuitIR> compile(const string& source);
    vector<Error> getErrors();
};
```

**Output Format (JSON IR for renderer):**
```json
{
  "components": [
    {"id": "A1", "type": "7408", "position": [0, 0]}
  ],
  "boards": [
    {"id": "B1", "type": "breadboard_830"}
  ],
  "wires": [
    {"from": {"comp": "A1", "pin": 3}, "to": {"comp": "O1", "pin": 1}}
  ]
}
```

---

**Approval Required:** Please review this design before I proceed with Phase 1 implementation.
