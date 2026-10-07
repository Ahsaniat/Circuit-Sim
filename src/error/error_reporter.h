#ifndef CIRCUITSIM_ERROR_REPORTER_H
#define CIRCUITSIM_ERROR_REPORTER_H

#include "../lexer/token.h"
#include <string>
#include <vector>

namespace circuitsim {

struct Error {
    std::string message;
    SourceLocation location;
    std::string phase; // "lexer", "parser", "semantic"
    
    Error(const std::string& msg, SourceLocation loc, const std::string& p)
        : message(msg), location(loc), phase(p) {}
};

class ErrorReporter {
public:
    void report(const std::string& phase, const std::string& message, SourceLocation loc);
    void clear();
    
    bool hasErrors() const { return !errors_.empty(); }
    const std::vector<Error>& getErrors() const { return errors_; }
    
    std::string formatErrors() const;

private:
    // Upper bound so a recovery bug can never grow the error list without
    // limit; the compile has already failed at this point either way.
    static constexpr size_t MAX_ERRORS = 200;
    std::vector<Error> errors_;
};

} // namespace circuitsim

#endif // CIRCUITSIM_ERROR_REPORTER_H
