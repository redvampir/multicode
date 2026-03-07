#include "dep_check_text.hpp"

#include <cctype>
#include <iostream>

namespace ContosoData {

void print_status(std::string_view message) {
    std::cout << message << std::endl;
}

bool starts_with_token(std::string_view value, std::string_view token) {
    return value.starts_with(token);
}

int count_words(std::string_view text) {
    int words = 0;
    bool inWord = false;

    for (char ch : text) {
        const bool isSpace = std::isspace(static_cast<unsigned char>(ch)) != 0;
        if (isSpace) {
            inWord = false;
            continue;
        }
        if (!inWord) {
            inWord = true;
            words += 1;
        }
    }

    return words;
}

} // namespace ContosoData
