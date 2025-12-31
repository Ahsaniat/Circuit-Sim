#include <iostream>
#include <fstream>
#include <sstream>
#include "compiler.h"

using namespace circuitsim;

std::string readFile(const std::string& path) {
    std::ifstream file(path);
    if (!file.is_open()) {
        std::cerr << "Error: Could not open file: " << path << std::endl;
        return "";
    }
    std::stringstream buffer;
    buffer << file.rdbuf();
    return buffer.str();
}

void printUsage(const char* prog) {
    std::cerr << "Usage: " << prog << " [options] [file.csim]\n";
    std::cerr << "Options:\n";
    std::cerr << "  --json-only    Output only JSON (no debug info)\n";
    std::cerr << "  --help         Show this help\n";
}

int main(int argc, char* argv[]) {
    std::string source;
    bool jsonOnly = false;
    std::string inputFile;
    
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--json-only") {
            jsonOnly = true;
        } else if (arg == "--help") {
            printUsage(argv[0]);
            return 0;
        } else if (arg[0] != '-') {
            inputFile = arg;
        }
    }
    
    if (!inputFile.empty()) {
        source = readFile(inputFile);
        if (source.empty()) return 1;
    } else {
        // Read from stdin if no file provided
        std::stringstream buffer;
        buffer << std::cin.rdbuf();
        source = buffer.str();
        
        if (source.empty()) {
            // Use demo input
            source = R"(
@comp A1 7408
@comp O1 7432
@board B1 breadboard_830

map (
    (A1 pin 3 -> O1 pin 1, B1 pin 5)
    (A1 pin 6 -> O1 pin 2)
    (O1 pin 3 -> B1 pin 10)
)
)";
            if (!jsonOnly) {
                std::cerr << "No input provided. Using demo circuit.\n";
            }
        }
    }
    
    Compiler compiler;
    CompileResult result = compiler.compile(source);
    
    if (!result.success) {
        std::cerr << result.errors;
        return 1;
    }
    
    if (jsonOnly) {
        std::cout << result.json << std::endl;
    } else {
        std::cout << "Compilation successful.\n\n";
        std::cout << result.json << std::endl;
    }
    
    return 0;
}
