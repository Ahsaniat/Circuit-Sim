// Minimal dependency-free test harness for the CircuitSim C++ compiler.
// Build with: cmake -S . -B build -DBUILD_TESTS=ON && cmake --build build
// Run with:   ctest --test-dir build --output-on-failure
#include "compiler.h"

#include <algorithm>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>

using namespace circuitsim;

namespace {

int failures = 0;
int checks = 0;

void check(bool condition, const std::string& label, int line) {
    ++checks;
    if (!condition) {
        ++failures;
        std::cerr << "FAIL (line " << line << "): " << label << "\n";
    }
}

bool contains(const std::string& haystack, const std::string& needle) {
    return haystack.find(needle) != std::string::npos;
}

#define CHECK(cond) check((cond), #cond, __LINE__)
#define CHECK_CONTAINS(haystack, needle) \
    check(contains((haystack), (needle)), std::string("contains \"") + (needle) + "\"", __LINE__)

void testBasicCircuitCompiles() {
    Compiler compiler;
    auto result = compiler.compile(
        "@comp A1 7408\n"
        "@comp O1 7432\n"
        "@board B1 breadboard_830\n"
        "map (\n"
        "  (A1 pin 3 -> O1 pin 1, B1 pin 5)\n"
        "  (A1 pin 6 -> O1 pin 2)\n"
        ")\n");
    CHECK(result.success);
    CHECK_CONTAINS(result.json, "\"7408\"");
    CHECK_CONTAINS(result.json, "\"7432\"");
    CHECK_CONTAINS(result.json, "breadboard_830");
    CHECK_CONTAINS(result.json, "\"wires\"");
}

void testValuesPreserved() {
    Compiler compiler;
    auto result = compiler.compile(
        "@resistor R1 10k\n"
        "@resistor R2 4.7k\n"
        "@capacitor C1 100uF\n"
        "@board B1 breadboard_830\n");
    CHECK(result.success);
    CHECK_CONTAINS(result.json, "resistor:10k");
    CHECK_CONTAINS(result.json, "resistor:4.7k");
    CHECK_CONTAINS(result.json, "capacitor:100uF");
}

void testUnknownDirectiveFails() {
    Compiler compiler;
    auto result = compiler.compile("@notarealdirective X1 123\n");
    CHECK(!result.success);
    CHECK_CONTAINS(result.errors, "Unknown directive");
    CHECK_CONTAINS(result.errors, "@notarealdirective");
}

void testExtendedComponentsCompile() {
    Compiler compiler;
    auto result = compiler.compile(
        "@switch_spst SW1 SPST\n"
        "@pushbutton BTN1 PUSHBUTTON\n"
        "@display_7seg DSP1 7SEG\n"
        "@buzzer BZ1 ACTIVE\n"
        "@motor_dc M1 DC\n"
        "@servo S1 SERVO\n"
        "@battery BAT1 9V\n"
        "@regulator VR1 LM7805\n"
        "@crystal Y1 16MHz\n"
        "@board B1 breadboard_830\n");
    CHECK(result.success);
    CHECK_CONTAINS(result.json, "switch_spst");
    CHECK_CONTAINS(result.json, "display_7seg");
    CHECK_CONTAINS(result.json, "battery");
}

void testDuplicateComponentFails() {
    Compiler compiler;
    auto result = compiler.compile(
        "@comp A1 7408\n"
        "@comp A1 7432\n");
    CHECK(!result.success);
    CHECK_CONTAINS(result.errors, "Duplicate component declaration");
}

void testUndefinedComponentFails() {
    Compiler compiler;
    auto result = compiler.compile(
        "@comp A1 7408\n"
        "map (\n"
        "  (A1 pin 3 -> GHOST pin 1)\n"
        ")\n");
    CHECK(!result.success);
    CHECK_CONTAINS(result.errors, "Undefined component");
    CHECK_CONTAINS(result.errors, "GHOST");
}

void testInvalidPinNumberFails() {
    Compiler compiler;
    auto result = compiler.compile(
        "@comp A1 7408\n"
        "map (\n"
        "  (A1 pin 99 -> A1 pin 1)\n"
        ")\n");
    CHECK(!result.success);
    CHECK_CONTAINS(result.errors, "Invalid pin number");
}

void testBoardPinConflictFails() {
    Compiler compiler;
    auto result = compiler.compile(
        "@comp A1 7408\n"
        "@board B1 breadboard_830\n"
        "map (\n"
        "  (A1 pin 3 -> B1 pin 5)\n"
        "  (A1 pin 6 -> B1 pin 5)\n"
        ")\n");
    CHECK(!result.success);
    CHECK_CONTAINS(result.errors, "already connected");
}

void testCustomICDefinition() {
    Compiler compiler;
    auto result = compiler.compile(
        "def MyIC (\n"
        "  pin1 -> input,\n"
        "  pin2 -> output\n"
        ")\n"
        "@comp M1 MyIC\n"
        "map (\n"
        "  (M1 pin 1 -> M1 pin 2)\n"
        ")\n");
    CHECK(result.success);
}

void testDuplicateMapFails() {
    Compiler compiler;
    auto result = compiler.compile(
        "@comp A1 7408\n"
        "map (\n"
        "  (A1 pin 1 -> A1 pin 2)\n"
        ")\n"
        "map (\n"
        "  (A1 pin 3 -> A1 pin 4)\n"
        ")\n");
    CHECK(!result.success);
    CHECK_CONTAINS(result.errors, "Duplicate 'map' block");
}

void testInvalidPinTokenFails() {
    Compiler compiler;
    auto result = compiler.compile(
        "@comp A1 7408\n"
        "map (\n"
        "  (A1 pin 2N2222 -> A1 pin 1)\n"
        ")\n");
    CHECK(!result.success);
    CHECK_CONTAINS(result.errors, "Invalid pin number");
}

void testHugePinNumberFails() {
    Compiler compiler;
    auto result = compiler.compile(
        "@comp A1 7408\n"
        "map (\n"
        "  (A1 pin 99999999999999999999 -> A1 pin 1)\n"
        ")\n");
    CHECK(!result.success);
    CHECK_CONTAINS(result.errors, "Invalid pin number");
}

void testHighBoardPinCompiles() {
    Compiler compiler;
    auto result = compiler.compile(
        "@comp A1 7408\n"
        "@board B1 breadboard_830\n"
        "map (\n"
        "  (A1 pin 3 -> B1 pin 500)\n"
        ")\n");
    CHECK(result.success);
    CHECK_CONTAINS(result.json, "\"B1\"");
}

// Shared fixtures also executed by the web compiler test suite
// (web/src/compiler/conformance.test.ts). File suffix decides the expected
// outcome: .ok.csim must compile, .err.csim must fail.
void testConformanceFixtures() {
#ifdef CONFORMANCE_DIR
    namespace fs = std::filesystem;
    std::vector<std::string> files;
    for (const auto& entry : fs::directory_iterator(CONFORMANCE_DIR)) {
        if (entry.is_regular_file() && entry.path().extension() == ".csim") {
            files.push_back(entry.path().string());
        }
    }
    std::sort(files.begin(), files.end());
    CHECK(!files.empty());

    for (const auto& path : files) {
        std::ifstream file(path);
        std::stringstream buffer;
        buffer << file.rdbuf();
        Compiler compiler;
        auto result = compiler.compile(buffer.str());
        const bool expectSuccess = path.find(".ok.csim") != std::string::npos;
        check(result.success == expectSuccess,
              "conformance " + fs::path(path).filename().string() +
                  (expectSuccess ? " should compile" : " should fail"),
              __LINE__);
    }
#endif
}

} // namespace

int main() {
    testBasicCircuitCompiles();
    testValuesPreserved();
    testUnknownDirectiveFails();
    testExtendedComponentsCompile();
    testDuplicateComponentFails();
    testUndefinedComponentFails();
    testInvalidPinNumberFails();
    testBoardPinConflictFails();
    testCustomICDefinition();
    testDuplicateMapFails();
    testInvalidPinTokenFails();
    testHugePinNumberFails();
    testHighBoardPinCompiles();
    testConformanceFixtures();

    std::cout << checks << " checks, " << failures << " failures\n";
    return failures == 0 ? 0 : 1;
}
