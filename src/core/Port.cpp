// Copyright (c) 2025 МультиКод Team. MIT License.

#include "visprog/core/Port.hpp"

#include <algorithm>
#include <cctype>
#include <memory>
#include <stdexcept>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace {

using visprog::core::DataType;

constexpr auto whitespace_chars = " \t\n\r\f\v";

[[nodiscard]] auto trim(std::string_view value) noexcept -> std::string_view {
    const auto first = value.find_first_not_of(whitespace_chars);
    if (first == std::string_view::npos) {
        return {};
    }

    const auto last = value.find_last_not_of(whitespace_chars);
    return value.substr(first, last - first + 1);
}

[[nodiscard]] constexpr auto is_generic_type_name(std::string_view name) noexcept -> bool {
    return name.empty() || name == "*" || name == "void" || name == "auto" || name == "any";
}

enum class TokenKind {
    Identifier,
    Symbol,
};

struct Token {
    std::string value;
    TokenKind kind;
};

struct TypeExpression;

struct TypeSegment {
    std::string key;
    std::shared_ptr<TypeExpression> value;
};

struct TypeExpression {
    std::string head;
    std::vector<TypeSegment> arguments;
};

[[nodiscard]] constexpr auto is_identifier_char(char ch) noexcept -> bool {
    const auto code = static_cast<unsigned char>(ch);
    const bool is_digit = code >= static_cast<unsigned char>('0') && code <= static_cast<unsigned char>('9');
    const bool is_upper = code >= static_cast<unsigned char>('A') && code <= static_cast<unsigned char>('Z');
    const bool is_lower = code >= static_cast<unsigned char>('a') && code <= static_cast<unsigned char>('z');
    return is_digit || is_upper || is_lower || ch == '_' || ch == '.';
}

[[nodiscard]] auto to_lower_ascii(std::string value) -> std::string {
    std::transform(value.begin(), value.end(), value.begin(), [](unsigned char ch) {
        return static_cast<char>(std::tolower(ch));
    });
    return value;
}

[[nodiscard]] auto tokenize(std::string_view value) -> std::vector<Token> {
    std::vector<Token> tokens;
    std::string current;
    current.reserve(value.size());

    auto flush_identifier = [&]() {
        if (current.empty()) {
            return;
        }
        tokens.push_back(Token{to_lower_ascii(current), TokenKind::Identifier});
        current.clear();
    };

    for (std::size_t index = 0; index < value.size(); ++index) {
        const auto ch = value[index];

        if (std::isspace(static_cast<unsigned char>(ch)) != 0) {
            flush_identifier();
            continue;
        }

        if (is_identifier_char(ch)) {
            current.push_back(ch);
            continue;
        }

        if (ch == ':' && index + 1 < value.size() && value[index + 1] == ':') {
            current.append("::");
            ++index;
            continue;
        }

        flush_identifier();

        switch (ch) {
            case '<':
            case '>':
            case ',':
            case '=':
            case '(':
            case ')':
            case '[':
            case ']':
            case '*':
                tokens.push_back(Token{std::string(1, ch), TokenKind::Symbol});
                break;
            default:
                break;
        }
    }

    flush_identifier();

    return tokens;
}

[[nodiscard]] auto serialize_expression(const TypeExpression& expression) -> std::string;

[[nodiscard]] auto serialize_segments(const std::vector<TypeSegment>& segments) -> std::string {
    std::vector<std::string> positional;
    positional.reserve(segments.size());
    std::vector<std::pair<std::string, std::string>> named;
    named.reserve(segments.size());

    for (const auto& segment : segments) {
        if (segment.value == nullptr) {
            continue;
        }

        const auto serialized = serialize_expression(*segment.value);

        if (segment.key.empty()) {
            positional.push_back(serialized);
        } else {
            named.emplace_back(segment.key, serialized);
        }
    }

    std::sort(named.begin(), named.end(), [](const auto& lhs_pair, const auto& rhs_pair) {
        return lhs_pair.first < rhs_pair.first;
    });

    std::string result;
    auto append_value = [&result](const std::string& value) {
        if (!result.empty()) {
            result.append(", ");
        }
        result.append(value);
    };

    for (const auto& value : positional) {
        append_value(value);
    }

    for (const auto& [key, value] : named) {
        append_value(key + '=' + value);
    }

    return result;
}

[[nodiscard]] auto serialize_expression(const TypeExpression& expression) -> std::string {
    if (expression.arguments.empty()) {
        return expression.head;
    }

    const auto serialized_arguments = serialize_segments(expression.arguments);
    if (expression.head.empty()) {
        std::string result{"<"};
        result.append(serialized_arguments);
        result.push_back('>');
        return result;
    }

    std::string result = expression.head;
    result.push_back('<');
    result.append(serialized_arguments);
    result.push_back('>');
    return result;
}

class TypeNameParser {
public:
    explicit TypeNameParser(std::vector<Token> tokens) noexcept
        : tokens_(std::move(tokens)) {}

    [[nodiscard]] auto parse() -> std::vector<TypeSegment> {
        return parse_segments(std::string_view{});
    }

private:
    [[nodiscard]] auto parse_segments(std::string_view closing_symbol) -> std::vector<TypeSegment> {
        std::vector<TypeSegment> segments;

        while (!tokens_.empty() && index_ < tokens_.size()) {
            if (!closing_symbol.empty() && is_symbol(closing_symbol)) {
                ++index_;
                break;
            }

            const auto segment_start = index_;
            auto segment = parse_segment();

            if (index_ == segment_start) {
                if (index_ < tokens_.size()) {
                    ++index_;
                }
                continue;
            }

            segments.push_back(std::move(segment));

            if (is_symbol(",")) {
                ++index_;
                continue;
            }

            if (!closing_symbol.empty() && is_symbol(closing_symbol)) {
                ++index_;
                break;
            }
        }

        return segments;
    }

    [[nodiscard]] auto parse_segment() -> TypeSegment {
        TypeSegment segment;

        if (index_ < tokens_.size() && tokens_[index_].kind == TokenKind::Identifier) {
            if (index_ + 1 < tokens_.size() && tokens_[index_ + 1].kind == TokenKind::Symbol &&
                tokens_[index_ + 1].value == "=") {
                segment.key = tokens_[index_].value;
                index_ += 2;
            }
        }

        segment.value = parse_expression();
        return segment;
    }

    [[nodiscard]] auto parse_expression() -> std::shared_ptr<TypeExpression> {
        auto expression = std::make_shared<TypeExpression>();

        if (index_ < tokens_.size() && tokens_[index_].kind == TokenKind::Identifier) {
            expression->head = tokens_[index_].value;
            ++index_;
        }

        if (index_ < tokens_.size() && tokens_[index_].kind == TokenKind::Symbol) {
            const auto symbol = tokens_[index_].value;
            if (symbol == "<" || symbol == "(" || symbol == "[") {
                ++index_;
                const auto closing_symbol = symbol == "<" ? std::string_view{">"}
                                        : symbol == "(" ? std::string_view{")"}
                                                         : std::string_view{"]"};
                expression->arguments = parse_segments(closing_symbol);
            }
        }

        return expression;
    }

    [[nodiscard]] auto is_symbol(std::string_view value) const noexcept -> bool {
        return index_ < tokens_.size() && tokens_[index_].kind == TokenKind::Symbol && tokens_[index_].value == value;
    }

    std::vector<Token> tokens_;
    std::size_t index_{0};
};

[[nodiscard]] auto normalize_type_name(std::string_view value) -> std::string {
    const auto trimmed = trim(value);
    if (trimmed.empty()) {
        return {};
    }

    auto tokens = tokenize(trimmed);
    if (tokens.empty()) {
        return to_lower_ascii(std::string(trimmed));
    }

    TypeNameParser parser{std::move(tokens)};
    const auto segments = parser.parse();
    if (segments.empty()) {
        return to_lower_ascii(std::string(trimmed));
    }

    return serialize_segments(segments);
}

[[nodiscard]] auto are_type_names_compatible(std::string_view lhs, std::string_view rhs) noexcept -> bool {
    const auto lhs_trimmed = trim(lhs);
    const auto rhs_trimmed = trim(rhs);

    if (lhs_trimmed == rhs_trimmed) {
        return true;
    }

    if (is_generic_type_name(lhs_trimmed) || is_generic_type_name(rhs_trimmed)) {
        return true;
    }

    const auto lhs_normalized = normalize_type_name(lhs_trimmed);
    const auto rhs_normalized = normalize_type_name(rhs_trimmed);

    return lhs_normalized == rhs_normalized;
}

[[nodiscard]] constexpr auto requires_type_name(DataType type) noexcept -> bool {
    switch (type) {
        case DataType::Pointer:
        case DataType::Reference:
        case DataType::Array:
        case DataType::Vector:
        case DataType::Map:
        case DataType::Set:
        case DataType::Struct:
        case DataType::Class:
        case DataType::Enum:
        case DataType::Template:
            return true;
        default:
            return false;
    }
}

[[nodiscard]] constexpr auto allows_generic_type_name(DataType type) noexcept -> bool {
    switch (type) {
        case DataType::Pointer:
        case DataType::Reference:
        case DataType::Template:
            return true;
        default:
            return false;
    }
}

[[nodiscard]] constexpr auto is_signed_integral(DataType type) noexcept -> bool {
    switch (type) {
        case DataType::Int8:
        case DataType::Int16:
        case DataType::Int32:
        case DataType::Int64:
            return true;
        default:
            return false;
    }
}

[[nodiscard]] constexpr auto is_unsigned_integral(DataType type) noexcept -> bool {
    switch (type) {
        case DataType::UInt8:
        case DataType::UInt16:
        case DataType::UInt32:
        case DataType::UInt64:
            return true;
        default:
            return false;
    }
}

[[nodiscard]] constexpr auto is_integral(DataType type) noexcept -> bool {
    return is_signed_integral(type) || is_unsigned_integral(type) || type == DataType::Bool || type == DataType::Char;
}

[[nodiscard]] constexpr auto is_floating_point(DataType type) noexcept -> bool {
    return type == DataType::Float || type == DataType::Double;
}

[[nodiscard]] constexpr auto is_numeric(DataType type) noexcept -> bool {
    return is_integral(type) || is_floating_point(type);
}

[[nodiscard]] constexpr auto is_string_like(DataType type) noexcept -> bool {
    return type == DataType::String || type == DataType::StringView;
}

[[nodiscard]] constexpr auto is_pointer_like(DataType type) noexcept -> bool {
    return type == DataType::Pointer || type == DataType::Reference;
}

[[nodiscard]] constexpr auto is_container(DataType type) noexcept -> bool {
    switch (type) {
        case DataType::Array:
        case DataType::Vector:
        case DataType::Map:
        case DataType::Set:
            return true;
        default:
            return false;
    }
}

[[nodiscard]] constexpr auto is_user_defined(DataType type) noexcept -> bool {
    return type == DataType::Struct || type == DataType::Class || type == DataType::Enum;
}

[[nodiscard]] constexpr auto is_numeric_widening(DataType from, DataType to) noexcept -> bool {
    switch (from) {
        case DataType::Int8:
            return to == DataType::Int16 || to == DataType::Int32 || to == DataType::Int64;
        case DataType::Int16:
            return to == DataType::Int32 || to == DataType::Int64;
        case DataType::Int32:
            return to == DataType::Int64;
        case DataType::UInt8:
            return to == DataType::UInt16 || to == DataType::UInt32 || to == DataType::UInt64;
        case DataType::UInt16:
            return to == DataType::UInt32 || to == DataType::UInt64;
        case DataType::UInt32:
            return to == DataType::UInt64;
        default:
            return false;
    }
}

[[nodiscard]] constexpr auto is_integral_to_floating(DataType from, DataType to) noexcept -> bool {
    if (!is_integral(from)) {
        return false;
    }

    return to == DataType::Float || to == DataType::Double;
}

[[nodiscard]] constexpr auto is_float_promotion(DataType from, DataType to) noexcept -> bool {
    return from == DataType::Float && to == DataType::Double;
}

[[nodiscard]] auto is_pointer_compatible(DataType from_type,
                                          std::string_view from_name,
                                          DataType to_type,
                                          std::string_view to_name) noexcept -> bool {
    if (!is_pointer_like(from_type) || !is_pointer_like(to_type)) {
        return false;
    }

    return are_type_names_compatible(from_name, to_name);
}

[[nodiscard]] auto is_container_compatible(DataType from_type,
                                            std::string_view from_name,
                                            DataType to_type,
                                            std::string_view to_name) noexcept -> bool {
    if (!is_container(from_type) || !is_container(to_type)) {
        return false;
    }

    if (from_type != to_type) {
        return false;
    }

    return are_type_names_compatible(from_name, to_name);
}

[[nodiscard]] auto is_user_defined_compatible(DataType from_type,
                                              std::string_view from_name,
                                              DataType to_type,
                                              std::string_view to_name) noexcept -> bool {
    if (!is_user_defined(from_type) || !is_user_defined(to_type)) {
        return false;
    }

    if (from_type != to_type) {
        return false;
    }

    return are_type_names_compatible(from_name, to_name);
}

}  // namespace

namespace visprog::core {

auto Port::generate_unique_id() noexcept -> PortId {
    return PortId{next_id_.fetch_add(1, std::memory_order_relaxed)};
}

Port::Port(PortId id,
           PortDirection direction,
           DataType data_type,
           std::string name) noexcept
    : id_(id)
    , direction_(direction)
    , data_type_(data_type)
    , name_(std::move(name))
    , type_name_() {
}

auto Port::set_type_name(std::string type_name) -> bool {
    if (!requires_type_name(data_type_)) {
        throw std::invalid_argument(
            "Port::set_type_name: data type '" + std::string(to_string(data_type_)) +
            "' does not support custom type names");
    }

    const auto trimmed = trim(type_name);
    if (trimmed.empty()) {
        type_name_.clear();
        return true;
    }

    auto normalized = normalize_type_name(trimmed);
    if (normalized.empty()) {
        type_name_.clear();
        return true;
    }

    if (is_generic_type_name(normalized) && !allows_generic_type_name(data_type_)) {
        throw std::invalid_argument(
            "Port::set_type_name: universal marker '" + normalized +
            "' is not allowed for data type '" + std::string(to_string(data_type_)) + "'");
    }

    type_name_ = std::move(normalized);
    return true;
}

auto Port::can_connect_to(const Port& other) const noexcept -> bool {
    // Cannot connect to itself
    if (id_ == other.id_) {
        return false;
    }
    
    // Direction check: Output → Input or InOut ↔ any
    const bool direction_ok = 
        (is_output() && other.is_input()) ||
        (is_input() && other.is_output()) ||
        (direction_ == PortDirection::InOut) ||
        (other.direction_ == PortDirection::InOut);
    
    if (!direction_ok) {
        return false;
    }
    
    // Type compatibility check

    // Execution ports can only connect to execution ports
    if (is_execution() || other.is_execution()) {
        return is_execution() == other.is_execution();
    }

    // Any type can connect to anything (custom nodes)
    if (data_type_ == DataType::Any || other.data_type_ == DataType::Any) {
        return true;
    }
    
    // Auto type can connect to anything
    if (data_type_ == DataType::Auto || other.data_type_ == DataType::Auto) {
        return true;
    }
    
    // Void ports can only connect to void ports
    if (data_type_ == DataType::Void || other.data_type_ == DataType::Void) {
        return data_type_ == other.data_type_;
    }

    // Exact type match
    if (data_type_ == other.data_type_) {
        if (requires_type_name(data_type_)) {
            return are_type_names_compatible(type_name_, other.type_name_);
        }
        return true;
    }

    // Template placeholders allow compatible matches by name
    if (data_type_ == DataType::Template || other.data_type_ == DataType::Template) {
        return are_type_names_compatible(type_name_, other.type_name_);
    }

    // Pointer and reference conversions (including pointer <-> reference)
    if (is_pointer_compatible(data_type_, type_name_, other.data_type_, other.type_name_)) {
        return true;
    }

    if (is_pointer_compatible(other.data_type_, other.type_name_, data_type_, type_name_)) {
        return true;
    }

    // Container compatibility (element/key types must match)
    if (is_container_compatible(data_type_, type_name_, other.data_type_, other.type_name_)) {
        return true;
    }

    if (is_container_compatible(other.data_type_, other.type_name_, data_type_, type_name_)) {
        return true;
    }

    // User-defined types must have matching identifiers
    if (is_user_defined_compatible(data_type_, type_name_, other.data_type_, other.type_name_)) {
        return true;
    }

    if (is_user_defined_compatible(other.data_type_, other.type_name_, data_type_, type_name_)) {
        return true;
    }

    // Numeric promotions (integral widening, integral -> floating, float -> double)
    if (is_numeric_widening(data_type_, other.data_type_) ||
        is_integral_to_floating(data_type_, other.data_type_) ||
        is_float_promotion(data_type_, other.data_type_)) {
        return true;
    }

    // Allow float interchange (Float <-> Double)
    if (is_floating_point(data_type_) && is_floating_point(other.data_type_)) {
        return true;
    }

    // String-like conversions (String <-> StringView and any type -> string)
    if (is_string_like(data_type_) && is_string_like(other.data_type_)) {
        return true;
    }

    if (is_string_like(other.data_type_)) {
        return true;
    }

    // Numeric to bool conversions are allowed only towards bool targets
    if (other.data_type_ == DataType::Bool && is_numeric(data_type_)) {
        return true;
    }

    // No compatible conversion found
    return false;
}

}  // namespace visprog::core
