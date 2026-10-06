# CircuitSim Implementation Documentation

This document provides a comprehensive overview of the CircuitSim implementation, covering the architecture, module design, and how all components work together to transform circuit description code into an interactive visual representation.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Backend: C++ Compiler](#backend-c-compiler)
   - [Lexer](#lexer)
   - [Parser](#parser)
   - [Semantic Analyzer](#semantic-analyzer)
   - [IR Generator](#ir-generator)
3. [Frontend: TypeScript/Canvas Renderer](#frontend-typescriptcanvas-renderer)
   - [Geometry System](#geometry-system)
   - [Component Footprints](#component-footprints)
   - [Snap Manager](#snap-manager)
   - [Circuit Renderer](#circuit-renderer)
   - [TypeScript Compiler](#typescript-compiler)
4. [Data Flow](#data-flow)
5. [Key Algorithms](#key-algorithms)
   - [Component Placement](#component-placement)
   - [Wire Routing](#wire-routing)
   - [Magnetic Snap System](#magnetic-snap-system)
6. [File Structure](#file-structure)
7. [Build and Run](#build-and-run)

---

## Architecture Overview

CircuitSim follows a traditional compiler pipeline with a visual rendering backend:

```
Source Code (.csim)
       |
       v
+-------------+     +----------+     +------------+     +--------------+
|   Lexer     | --> |  Parser  | --> |  Semantic  | --> | IR Generator |
| (Tokenize)  |     |  (AST)   |     |  Analyzer  |     |   (Layout)   |
+-------------+     +----------+     +------------+     +--------------+
       |                                                       |
   Token Stream                                           Circuit IR
                                                               |
                                                               v
                                                    +------------------+
                                                    | Canvas Renderer  |
                                                    |  (Interactive)   |
                                                    +------------------+
                                                               |
                                                               v
                                                      Visual Output
```

The system has two parallel implementations:

1. **C++ Backend**: Full compiler compiled to WebAssembly (WASM) for potential native performance
2. **TypeScript Frontend**: Browser-native compiler and renderer for immediate interactivity

Currently, the TypeScript compiler is used in the web application for its simplicity and ease of debugging.

---

## Backend: C++ Compiler

Located in `src/`, the C++ compiler implements the full language specification.

### Lexer

**Files**: `src/lexer/lexer.h`, `src/lexer/lexer.cpp`, `src/lexer/token.h`

The lexer converts source text into a stream of tokens. It handles:

**Token Types**:
```cpp
enum class TokenType {
    // Keywords
    COMP,           // @comp (generic component)
    BOARD,          // @board
    DEF,            // def
    MAP,            // map
    PIN,            // pin
    
    // Component-specific keywords
    RESISTOR,       // @resistor
    CAPACITOR,      // @capacitor
    LED,            // @led
    AND_GATE,       // @AND
    OR_GATE,        // @OR
    NPN,            // @npn
    // ... many more component types
    
    // Types
    TYPE_INPUT, TYPE_OUTPUT, TYPE_GND, TYPE_VCC,
    
    // Literals
    IDENTIFIER, NUMBER, COMPONENT_TYPE,
    
    // Operators and Delimiters
    ARROW,          // ->
    COMMA,          // ,
    LPAREN, RPAREN, // ( )
    
    // Special
    NEWLINE, COMMENT, END_OF_FILE, UNKNOWN
};
```

**Lexer Algorithm**:
1. Skip whitespace and comments
2. Identify token type based on first character
3. For `@` prefix: check if keyword is a known component type
4. For identifiers: check against reserved keywords
5. Track line and column for error reporting

**Example**:
```
Input: "@resistor R1 10k"
Output: [RESISTOR, IDENTIFIER("R1"), IDENTIFIER("10k")]
```

### Parser

**Files**: `src/parser/parser.h`, `src/parser/parser.cpp`, `src/parser/ast.h`

The parser builds an Abstract Syntax Tree (AST) from the token stream.

**AST Node Types**:
```cpp
struct ProgramNode {
    vector<CompDeclNode> components;
    vector<BoardDeclNode> boards;
    vector<ICDefNode> icDefinitions;
    MapBlockNode mapBlock;
};

struct CompDeclNode {
    string identifier;      // "R1", "A1"
    string componentType;   // "7408", "10k"
};

struct ConnectionNode {
    PinRefNode source;
    vector<PinRefNode> destinations;
};

struct PinRefNode {
    string componentId;     // "A1"
    int pinNumber;          // 3
};
```

**Grammar (simplified EBNF)**:
```ebnf
program        = { statement } ;
statement      = comp_decl | board_decl | map_block | ic_def ;
comp_decl      = ("@comp" | "@resistor" | "@AND" | ...) IDENTIFIER [VALUE] ;
board_decl     = "@board" IDENTIFIER BOARD_TYPE ;
map_block      = "map" "(" { connection } ")" ;
connection     = "(" pin_ref "->" pin_ref_list ")" ;
pin_ref        = IDENTIFIER "pin" NUMBER ;
```

### Semantic Analyzer

**Files**: `src/semantic/analyzer.h`, `src/semantic/analyzer.cpp`, `src/semantic/symbol_table.h`

The semantic analyzer validates the AST:

1. **Symbol Resolution**: Ensures all referenced components are declared
2. **Pin Validation**: Checks pin numbers against component pin counts
3. **Duplicate Detection**: Catches duplicate component declarations
4. **Type Compatibility**: Validates connection types

### IR Generator

**Files**: `src/ir/circuit_ir.h`, `src/ir/ir_generator.cpp`

The IR generator transforms the validated AST into a Circuit Intermediate Representation suitable for rendering.

**Circuit IR Structure**:
```cpp
struct CircuitIR {
    int width, height;              // Canvas dimensions
    vector<ComponentIR> components;
    vector<BoardIR> boards;
    vector<Wire> wires;
};

struct ComponentIR {
    string id;
    string type;
    int pinCount;
    Position position;
    Size size;
    ComponentCategory category;     // 'ic', 'passive', 'led', etc.
    optional<string> value;         // "10k", "red"
};

struct Wire {
    PinPosition from;
    PinPosition to;
    string color;
    vector<Position> waypoints;     // For non-direct routing
};
```

---

## Frontend: TypeScript/Canvas Renderer

Located in `web/src/`, the frontend provides the interactive circuit visualization.

### Geometry System

**File**: `web/src/geometry/BreadboardGeometry.ts`

The BreadboardGeometry class is the single source of truth for all breadboard measurements. All values are in "base units" where 1 base unit = 2.54mm (standard IC pin spacing).

**Key Constants**:
```typescript
class BreadboardGeometry {
    static readonly HOLE_SPACING = 2.54;      // Distance between holes
    static readonly NUM_COLS = 63;            // Standard breadboard columns
    static readonly ROWS_PER_HALF = 5;        // Rows A-E and F-J
    static readonly RAIL_HEIGHT = 6;          // Power rail area height
    static readonly CHANNEL_HEIGHT = 3.5;     // Center channel height
    
    static readonly TOP_ROWS = ['A', 'B', 'C', 'D', 'E'];
    static readonly BOTTOM_ROWS = ['F', 'G', 'H', 'I', 'J'];
}
```

**Key Methods**:
```typescript
// Get exact hole position
getHolePosition(col: number, row: string): HolePosition

// Convert coordinates to hole identifiers
getColumnAtX(x: number): number
getRowAtY(y: number): string

// Snap coordinates to nearest hole
snapToColumn(x: number): number
snapToRow(y: number): number

// IC-specific positioning
getICBodyPosition(startCol: number, pinLength: number): Position
```

### Component Footprints

**File**: `web/src/geometry/ComponentFootprints.ts`

Defines physical footprints for all component types, ensuring consistent pin alignment with breadboard holes.

**Footprint Structure**:
```typescript
interface ComponentFootprint {
    category: ComponentCategory;
    bodyWidth: number;
    bodyHeight: number;
    pins: PinFootprint[];
    orientation: 'horizontal' | 'vertical';
    straddlesChannel: boolean;
}

interface PinFootprint {
    number: number;
    offsetX: number;    // Offset from body origin
    offsetY: number;
    targetRow: string;  // Which breadboard row this pin targets
    label?: string;
}
```

**Component Categories and Footprints**:

| Category | Examples | Pin Layout |
|----------|----------|------------|
| `ic` | 7408, 74151, 555 | Straddles channel (E/F rows) |
| `passive` | Resistor, Capacitor | Horizontal, 2 pins in same row |
| `diode` | Standard, Zener, Schottky | Horizontal, 2 pins |
| `led` | LED, IR LED | Vertical, 2 adjacent pins |
| `sensor` | LDR, Photodiode | Vertical, 2 adjacent pins |
| `transistor` | NPN, PNP, MOSFET | Vertical, 3 adjacent pins |

**IC Pin Numbering**:
ICs follow standard DIP package numbering:
- Bottom pins: 1, 2, 3, ..., N/2 (left to right in row F)
- Top pins: N, N-1, N-2, ..., N/2+1 (left to right in row E)

```
         Notch
           U
      +----+----+
   14 |         | 8     <- Row E (top pins)
   13 |         | 9
   12 |  Body   | 10
   11 |         | 11
      +---------+
      =========== Center Channel
      +---------+
    1 |         | 7     <- Row F (bottom pins)
    2 |         | 6
    3 |  7408   | 5
    4 |         | 4
      +---------+
```

### Snap Manager

**File**: `web/src/geometry/SnapManager.ts`

The SnapManager provides the magnetic snap-to-hole functionality, similar to TinkerCAD.

**Key Features**:

1. **Snap Detection**: When a pin approaches within SNAP_RADIUS (1.2 base units) of a hole, it snaps
2. **Occupancy Tracking**: Tracks which holes are occupied by components or wires
3. **Connectivity Information**: Knows which components are electrically connected (same column)

**Key Methods**:
```typescript
// Find nearest hole and check if within snap range
findNearestHole(pos: Position): SnapResult

// Snap a position to nearest hole if within range
snapPosition(pos: Position): SnapResult

// Snap a component by its first pin
snapComponentByPin(bodyPos: Position, pin1Offset: Position): SnapResult

// IC-specific snapping (straddles channel)
snapICComponent(bodyPos: Position, pinsPerSide: number, ...): SnapResult

// Track hole occupancy
registerPinOccupancy(col: number, row: string, componentId: string, pinNumber: number)
registerWireOccupancy(col: number, row: string, wireIndex: number, terminal: 'from' | 'to')
```

**Snap Algorithm**:
1. Calculate distance from position to all breadboard holes
2. Find the nearest hole
3. If distance < SNAP_RADIUS, return snapped position
4. Otherwise, return original position

### Circuit Renderer

**File**: `web/src/renderer/CircuitRenderer.ts`

The renderer draws the circuit on an HTML5 Canvas and handles all user interactions.

**Rendering Pipeline**:
1. Clear canvas with background color
2. Apply pan and zoom transforms
3. Render boards (breadboard background, holes, labels)
4. Render snap preview highlights (during drag)
5. Render components (categorized by type)
6. Render wires

**Component Rendering by Category**:

| Category | Visual Style |
|----------|--------------|
| IC | Black rectangular body with pins, notch indicator, pin 1 dot |
| Resistor | Tan body with color bands |
| Capacitor | Two parallel plates |
| Diode | Black body with cathode band |
| LED | Dome with gradient color |
| Transistor | TO-92 half-cylinder package |
| Sensor | Circular body with appropriate pattern |

**Interaction System**:

The renderer supports:
- **Selection**: Click to select components, wires, or the board
- **Dragging**: Drag selected elements (with snap-to-hole)
- **Wire Terminal Dragging**: Drag individual wire endpoints
- **Zoom**: Mouse wheel zooms centered on cursor
- **Tooltips**: Hover shows component info

**Draggable Element Types**:
```typescript
interface DraggableElement {
    id: string;
    type: 'component' | 'board' | 'wire' | 'wire_terminal';
    x: number;
    y: number;
    width: number;
    height: number;
    parentBoardId?: string;
    wireIndex?: number;
    terminal?: 'from' | 'to';
}
```

**Hit Detection Priority**:
1. Wire terminals (highest - for precise endpoint dragging)
2. Wires (line-segment distance check)
3. Components (bounding box)
4. Boards (bounding box, lowest)

### TypeScript Compiler

**File**: `web/src/compiler/compiler.ts`

A browser-native compiler that mirrors the C++ implementation.

**Component Keyword Mapping**:
```typescript
const COMPONENT_KEYWORDS: Record<string, ComponentInfo> = {
    'resistor': { category: 'passive', defaultType: 'RES', pinCount: 2 },
    'AND': { category: 'ic', defaultType: '7408', pinCount: 14 },
    'npn': { category: 'transistor', defaultType: 'NPN', pinCount: 3 },
    // ... all supported component types
};
```

**Built-in IC Library**:
```typescript
const BUILTIN_ICS: Record<string, number> = {
    '7400': 14, '7408': 14, '7432': 14,     // Basic gates
    '74138': 16, '74151': 16,               // Decoders/mux
    '555': 8, 'LM741': 8,                   // Timer/op-amp
    // ... 50+ IC definitions
};
```

---

## Data Flow

### Compile Flow

```
User Code
    |
    v
Lexer.tokenize()
    |
    +-- Token[] (COMP_TYPE, IDENTIFIER, NUMBER, ...)
    |
    v
Parser.parse()
    |
    +-- ParsedProgram { components[], boards[], connections[] }
    |
    v
IRGenerator.generate()
    |
    +-- CircuitIR { components[], boards[], wires[] }
    |
    v
CircuitRenderer.render()
    |
    +-- Visual Canvas Output
```

### Interaction Flow (Drag Example)

```
MouseDown
    |
    v
getMousePos() -- Convert screen to world coords
    |
    v
findElementAt() -- Hit detection
    |
    +-- Found component/wire/board
    |
    v
Store dragOffset
    |
    v
MouseMove (while dragging)
    |
    v
Calculate new position
    |
    v
snapManager.snapICComponent() or snapPosition()
    |
    +-- Snapped position + preview holes
    |
    v
Update component position in CircuitIR
    |
    v
rebuildDraggables()
    |
    v
redraw()
    |
    v
MouseUp
    |
    v
rebuildOccupancy() -- Update hole tracking
```

---

## Key Algorithms

### Component Placement

The placement algorithm arranges components on the breadboard:

1. **Categorize components**: Separate into straddling (ICs) vs non-straddling
2. **Place ICs first**: They occupy the most space (channel area)
3. **Place passive/discrete components**: Distribute between top and bottom halves
4. **Track occupied columns**: Maintain gaps between components

```typescript
function layoutAndGenerateComponents(components: CompDecl[], ir: CircuitIR) {
    const straddlingComps = [];   // ICs
    const topHalfComps = [];      // Passive in rows A-E
    const bottomHalfComps = [];   // Passive in rows F-J
    
    // Categorize
    for (const comp of components) {
        const footprint = getComponentFootprint(comp.category, pinCount);
        if (footprint.straddlesChannel) {
            straddlingComps.push(comp);
        } else {
            // Alternate between top and bottom
            if (topHalfComps.length <= bottomHalfComps.length) {
                topHalfComps.push(comp);
            } else {
                bottomHalfComps.push(comp);
            }
        }
    }
    
    // Place in order with column tracking
    for (const comp of straddlingComps) placeComponent(comp, 'straddling');
    for (const comp of topHalfComps) placeComponent(comp, 'top', 'C');
    for (const comp of bottomHalfComps) placeComponent(comp, 'bottom', 'H');
}
```

### Wire Routing

Wire routing uses Manhattan-style paths with channel allocation to avoid overlaps:

1. **Direct connection**: If source and destination are close enough
2. **Same-row routing**: Go up/down to a free channel, across, then back
3. **Same-column routing**: Go left/right to a free channel, down, then back
4. **General case**: Z-shaped routing through a horizontal channel

```typescript
function routeWire(from: Position, to: Position, 
                   usedYChannels: number[], 
                   usedXChannels: number[]): Position[] {
    
    const waypoints: Position[] = [];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    
    // Direct connection if very close
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
        return [];
    }
    
    // Same row - route around
    if (Math.abs(dy) < 2) {
        let yChannel = from.y - 3;
        while (usedYChannels.some(y => Math.abs(y - yChannel) < SPACING)) {
            yChannel -= SPACING;
        }
        usedYChannels.push(yChannel);
        
        waypoints.push({ x: from.x, y: yChannel });
        waypoints.push({ x: to.x, y: yChannel });
        return waypoints;
    }
    
    // General Z-route
    let hChannel = (from.y + to.y) / 2;
    // Find unused channel...
    
    waypoints.push({ x: from.x, y: hChannel });
    waypoints.push({ x: to.x, y: hChannel });
    return waypoints;
}
```

### Magnetic Snap System

The snap system ensures components align with breadboard holes:

```typescript
function snapICComponent(bodyPos: Position, pinsPerSide: number, 
                         firstPinOffsetX: number, pinLength: number): SnapResult {
    
    // Calculate where pin 1 would be
    const bodyHeight = E_TO_F_DISTANCE - 2 * pinLength;
    const pin1X = bodyPos.x + firstPinOffsetX;
    const pin1Y = bodyPos.y + bodyHeight + pinLength;
    
    // Find nearest hole in row F for pin 1
    let nearestCol = 1;
    let minDistance = Infinity;
    
    for (let col = 1; col <= NUM_COLS; col++) {
        const hole = geometry.getHolePosition(col, 'F');
        const distance = Math.sqrt(
            (pin1X - hole.x) ** 2 + (pin1Y - hole.y) ** 2
        );
        
        if (distance < minDistance) {
            minDistance = distance;
            nearestCol = col;
        }
    }
    
    // Snap if within threshold
    if (minDistance <= SNAP_RADIUS) {
        const targetHole = geometry.getHolePosition(nearestCol, 'F');
        return {
            bodyX: targetHole.x - firstPinOffsetX,
            bodyY: targetHole.y - bodyHeight - pinLength,
            snapped: true,
            snapCol: nearestCol
        };
    }
    
    return { bodyX: bodyPos.x, bodyY: bodyPos.y, snapped: false };
}
```

---

## File Structure

```
CircuitSim/
|
+-- src/                          # C++ Backend
|   +-- lexer/
|   |   +-- lexer.h              # Lexer class declaration
|   |   +-- lexer.cpp            # Lexer implementation
|   |   +-- token.h              # Token types and structures
|   |
|   +-- parser/
|   |   +-- parser.h             # Parser class declaration
|   |   +-- parser.cpp           # Parser implementation
|   |   +-- ast.h                # AST node definitions
|   |
|   +-- semantic/
|   |   +-- analyzer.h           # Semantic analyzer
|   |   +-- analyzer.cpp
|   |   +-- symbol_table.h       # Symbol table for declarations
|   |
|   +-- ir/
|   |   +-- circuit_ir.h         # IR structure definitions
|   |   +-- ir_generator.cpp     # IR generation logic
|   |
|   +-- components/
|   |   +-- component_lib.h      # Component library
|   |   +-- ic_defs.cpp          # Built-in IC definitions
|   |   +-- board_defs.cpp       # Board type definitions
|   |
|   +-- error/
|   |   +-- error_reporter.h     # Error reporting utilities
|   |   +-- error_reporter.cpp
|   |
|   +-- compiler.h               # Main compiler interface
|   +-- compiler.cpp
|   +-- main.cpp                 # CLI entry point
|
+-- web/                          # TypeScript Frontend
|   +-- src/
|   |   +-- compiler/
|   |   |   +-- compiler.ts      # Browser-native compiler
|   |   |
|   |   +-- geometry/
|   |   |   +-- BreadboardGeometry.ts    # Breadboard measurements
|   |   |   +-- ComponentFootprints.ts   # Component physical specs
|   |   |   +-- SnapManager.ts           # Magnetic snap system
|   |   |
|   |   +-- renderer/
|   |   |   +-- CircuitRenderer.ts       # Canvas rendering + interaction
|   |   |
|   |   +-- types.ts             # TypeScript type definitions
|   |   +-- main.ts              # Application entry point
|   |
|   +-- index.html               # Web page
|   +-- package.json             # NPM dependencies
|   +-- tsconfig.json            # TypeScript configuration
|
+-- docs/
|   +-- LANGUAGE_REFERENCE.md    # Language syntax documentation
|   +-- IMPLEMENTATION.md        # This file
|
+-- tests/
|   +-- test_circuits/           # Example circuit files
|
+-- CMakeLists.txt               # CMake build configuration
+-- PLAN.md                      # Project plan
+-- SYSTEM_DESIGN.md             # System architecture
+-- README.md                    # Project overview
+-- .gitignore                   # Git ignore rules
```

---

## Build and Run

### Prerequisites

- Node.js 18+
- npm or yarn
- (Optional) CMake 3.16+ and Emscripten for C++ WASM build

### Running the Web Application

```bash
cd web
npm install
npm run dev
```

This starts a development server at `http://localhost:5173`.

### Building for Production

```bash
cd web
npm run build
```

Output is in `web/dist/`.

### Building C++ Backend (Optional)

```bash
mkdir build && cd build
cmake ..
make
```

This produces a CLI executable for testing the compiler independently.

### Running Tests

```bash
cd web
npm test
```

---

## Summary

CircuitSim is a domain-specific language and visual tool for electronic circuit design. Key architectural decisions:

1. **Unified Geometry System**: Single source of truth for all measurements prevents misalignment
2. **Component Footprints**: Standardized pin layouts ensure proper breadboard placement
3. **Magnetic Snap**: User-friendly interaction for precise component positioning
4. **Dual Implementation**: C++ for potential native/WASM use, TypeScript for browser simplicity
5. **Manhattan Wire Routing**: Clean, readable wire paths with overlap avoidance

The modular design allows easy extension for new component types, board layouts, or rendering backends.
