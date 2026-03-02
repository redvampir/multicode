#pragma once

#include <string_view>


namespace ContosoData
{
void print_status(std::string_view message);
bool starts_with_token(std::string_view value, std::string_view token);
int count_words(std::string_view text);
}

