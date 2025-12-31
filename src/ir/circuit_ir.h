#ifndef CIRCUITSIM_CIRCUIT_IR_H
#define CIRCUITSIM_CIRCUIT_IR_H

#include <string>
#include <vector>
#include <unordered_map>

namespace circuitsim {

struct Position {
    float x;
    float y;
    
    Position(float px = 0, float py = 0) : x(px), y(py) {}
};

struct PinPosition {
    std::string componentId;
    int pinNumber;
    Position position;
    
    PinPosition(const std::string& comp, int pin, Position pos = Position())
        : componentId(comp), pinNumber(pin), position(pos) {}
};

struct Wire {
    PinPosition from;
    PinPosition to;
    std::vector<Position> waypoints; // For routing around obstacles
    std::string color;
    
    Wire(const PinPosition& f, const PinPosition& t)
        : from(f), to(t), color("#333333") {}
};

struct ComponentIR {
    std::string id;
    std::string type;
    Position position;
    int pinCount;
    float width;
    float height;
    
    ComponentIR(const std::string& i, const std::string& t, int pins)
        : id(i), type(t), pinCount(pins), width(0), height(0) {}
};

struct BoardIR {
    std::string id;
    std::string type;
    Position position;
    int rows;
    int columns;
    float width;
    float height;
    
    BoardIR(const std::string& i, const std::string& t)
        : id(i), type(t), rows(0), columns(0), width(0), height(0) {}
};

struct CircuitIR {
    std::vector<ComponentIR> components;
    std::vector<BoardIR> boards;
    std::vector<Wire> wires;
    
    // Metadata
    float totalWidth;
    float totalHeight;
    
    CircuitIR() : totalWidth(0), totalHeight(0) {}
    
    std::string toJSON() const;
};

} // namespace circuitsim

#endif // CIRCUITSIM_CIRCUIT_IR_H
