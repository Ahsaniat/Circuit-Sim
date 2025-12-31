#include "circuit_ir.h"
#include <sstream>
#include <iomanip>

namespace circuitsim {

std::string CircuitIR::toJSON() const {
    std::ostringstream json;
    json << std::fixed << std::setprecision(2);
    
    json << "{\n";
    
    // Metadata
    json << "  \"width\": " << totalWidth << ",\n";
    json << "  \"height\": " << totalHeight << ",\n";
    
    // Components
    json << "  \"components\": [\n";
    for (size_t i = 0; i < components.size(); ++i) {
        const auto& c = components[i];
        json << "    {\n";
        json << "      \"id\": \"" << c.id << "\",\n";
        json << "      \"type\": \"" << c.type << "\",\n";
        json << "      \"pinCount\": " << c.pinCount << ",\n";
        json << "      \"position\": {\"x\": " << c.position.x << ", \"y\": " << c.position.y << "},\n";
        json << "      \"size\": {\"width\": " << c.width << ", \"height\": " << c.height << "}\n";
        json << "    }";
        if (i < components.size() - 1) json << ",";
        json << "\n";
    }
    json << "  ],\n";
    
    // Boards
    json << "  \"boards\": [\n";
    for (size_t i = 0; i < boards.size(); ++i) {
        const auto& b = boards[i];
        json << "    {\n";
        json << "      \"id\": \"" << b.id << "\",\n";
        json << "      \"type\": \"" << b.type << "\",\n";
        json << "      \"rows\": " << b.rows << ",\n";
        json << "      \"columns\": " << b.columns << ",\n";
        json << "      \"position\": {\"x\": " << b.position.x << ", \"y\": " << b.position.y << "},\n";
        json << "      \"size\": {\"width\": " << b.width << ", \"height\": " << b.height << "}\n";
        json << "    }";
        if (i < boards.size() - 1) json << ",";
        json << "\n";
    }
    json << "  ],\n";
    
    // Wires
    json << "  \"wires\": [\n";
    for (size_t i = 0; i < wires.size(); ++i) {
        const auto& w = wires[i];
        json << "    {\n";
        json << "      \"from\": {\"component\": \"" << w.from.componentId 
             << "\", \"pin\": " << w.from.pinNumber 
             << ", \"x\": " << w.from.position.x << ", \"y\": " << w.from.position.y << "},\n";
        json << "      \"to\": {\"component\": \"" << w.to.componentId 
             << "\", \"pin\": " << w.to.pinNumber 
             << ", \"x\": " << w.to.position.x << ", \"y\": " << w.to.position.y << "},\n";
        json << "      \"color\": \"" << w.color << "\"";
        
        if (!w.waypoints.empty()) {
            json << ",\n      \"waypoints\": [";
            for (size_t j = 0; j < w.waypoints.size(); ++j) {
                json << "{\"x\": " << w.waypoints[j].x << ", \"y\": " << w.waypoints[j].y << "}";
                if (j < w.waypoints.size() - 1) json << ", ";
            }
            json << "]";
        }
        json << "\n    }";
        if (i < wires.size() - 1) json << ",";
        json << "\n";
    }
    json << "  ]\n";
    
    json << "}";
    
    return json.str();
}

} // namespace circuitsim
