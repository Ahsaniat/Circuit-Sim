#include "error_reporter.h"
#include <sstream>

namespace circuitsim {

void ErrorReporter::report(const std::string& phase, const std::string& message, SourceLocation loc) {
    if (errors_.size() >= MAX_ERRORS) return;
    errors_.emplace_back(message, loc, phase);
}

void ErrorReporter::clear() {
    errors_.clear();
}

std::string ErrorReporter::formatErrors() const {
    std::ostringstream oss;
    for (const auto& err : errors_) {
        oss << "[" << err.phase << "] "
            << "Line " << err.location.line 
            << ", Col " << err.location.column 
            << ": " << err.message << "\n";
    }
    return oss.str();
}

} // namespace circuitsim
