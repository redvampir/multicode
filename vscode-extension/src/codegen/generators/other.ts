/**
 * Генераторы для прочих узлов
 * 
 * Comment, Reroute и другие вспомогательные узлы
 */

import type { BlueprintNode, BlueprintNodeType } from '../../shared/blueprintTypes';
import type { CodeGenContext } from '../types';
import { CodeGenErrorCode } from '../types';
import {
  BaseNodeGenerator,
  GeneratorHelpers,
  NodeGenerationResult,
} from './base';

const formatLiteral = (value: unknown): string => {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '0';
  }
  if (typeof value === 'string') {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return '{}';
};

const resolveInputExpression = (
  node: BlueprintNode,
  portId: string,
  fallback: string,
  helpers: GeneratorHelpers
): string => {
  const resolved = resolveOptionalInputExpression(node, portId, helpers);
  return resolved ?? fallback;
};

const resolveOptionalInputExpression = (
  node: BlueprintNode,
  portId: string,
  helpers: GeneratorHelpers
): string | null => {
  const connected = helpers.getInputExpression(node, portId);
  if (connected !== null) {
    return connected;
  }

  const port = node.inputs.find((candidate) => candidate.id === portId);
  if (port?.value !== undefined) {
    return formatLiteral(port.value);
  }
  if (port?.defaultValue !== undefined) {
    return formatLiteral(port.defaultValue);
  }

  return null;
};

export class StringConcatNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['StringConcat'];

  generate(): NodeGenerationResult {
    return this.noop();
  }

  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    const leftExpr = resolveInputExpression(node, 'a', '""', helpers);
    const rightExpr = resolveInputExpression(node, 'b', '""', helpers);
    return `([&]() { const std::string multicode_left = ${leftExpr}; const std::string multicode_right = ${rightExpr}; return multicode_left + multicode_right; })()`;
  }
}

export class StringLengthNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['StringLength'];

  generate(): NodeGenerationResult {
    return this.noop();
  }

  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    const valueExpr = resolveInputExpression(node, 'value', '""', helpers);
    return `([&]() { const std::string multicode_value = ${valueExpr}; return static_cast<int>(multicode_value.size()); })()`;
  }
}

export class SubstringNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Substring'];

  generate(): NodeGenerationResult {
    return this.noop();
  }

  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    const valueExpr = resolveInputExpression(node, 'value', '""', helpers);
    const startExpr = resolveInputExpression(node, 'start', '0', helpers);
    const lengthExpr = resolveInputExpression(node, 'length', '0', helpers);
    return `([&]() { const std::string multicode_value = ${valueExpr}; const int multicode_start = static_cast<int>(${startExpr}); const int multicode_length = static_cast<int>(${lengthExpr}); if (multicode_start < 0 || multicode_length <= 0 || multicode_start >= static_cast<int>(multicode_value.size())) { return std::string{}; } const std::size_t multicode_offset = static_cast<std::size_t>(multicode_start); const std::size_t multicode_count = static_cast<std::size_t>(multicode_length); return multicode_value.substr(multicode_offset, multicode_count); })()`;
  }
}

export class ContainsNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Contains'];

  generate(): NodeGenerationResult {
    return this.noop();
  }

  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    const valueExpr = resolveInputExpression(node, 'value', '""', helpers);
    const searchExpr = resolveInputExpression(node, 'search', '""', helpers);
    return `([&]() { const std::string multicode_value = ${valueExpr}; const std::string multicode_search = ${searchExpr}; return multicode_value.find(multicode_search) != std::string::npos; })()`;
  }
}

export class SplitNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Split'];

  generate(): NodeGenerationResult {
    return this.noop();
  }

  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    const valueExpr = resolveInputExpression(node, 'value', '""', helpers);
    const delimiterExpr = resolveInputExpression(node, 'delimiter', '" "', helpers);
    return `([&]() { const std::string multicode_value = ${valueExpr}; const std::string multicode_delimiter = ${delimiterExpr}; std::vector<std::string> multicode_parts; if (multicode_delimiter.empty()) { multicode_parts.reserve(multicode_value.size()); for (char multicode_char : multicode_value) { multicode_parts.emplace_back(1, multicode_char); } return multicode_parts; } std::size_t multicode_start = 0; while (multicode_start <= multicode_value.size()) { const std::size_t multicode_pos = multicode_value.find(multicode_delimiter, multicode_start); if (multicode_pos == std::string::npos) { multicode_parts.push_back(multicode_value.substr(multicode_start)); break; } multicode_parts.push_back(multicode_value.substr(multicode_start, multicode_pos - multicode_start)); multicode_start = multicode_pos + multicode_delimiter.size(); } return multicode_parts; })()`;
  }
}

export class TrimNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Trim'];

  generate(): NodeGenerationResult {
    return this.noop();
  }

  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    const valueExpr = resolveInputExpression(node, 'value', '""', helpers);
    return `([&]() { const std::string multicode_value = ${valueExpr}; const std::size_t multicode_begin = multicode_value.find_first_not_of(" \\t\\n\\r\\f\\v"); if (multicode_begin == std::string::npos) { return std::string{}; } const std::size_t multicode_end = multicode_value.find_last_not_of(" \\t\\n\\r\\f\\v"); return multicode_value.substr(multicode_begin, multicode_end - multicode_begin + 1); })()`;
  }
}

/**
 * Comment — комментарий в коде
 */
export class CommentNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Comment'];
  
  generate(
    node: BlueprintNode,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    const lines: string[] = [];
    
    const text = node.comment ?? node.label;
    if (text) {
      // Многострочные комментарии
      const commentLines = text.split('\n');
      for (const line of commentLines) {
        lines.push(`${ind}// ${line}`);
      }
    }
    
    return this.code(lines, false); // Comment не имеет execution flow
  }
}

/**
 * Reroute — просто передаёт данные, не генерирует код
 */
export class RerouteNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Reroute'];
  
  generate(): NodeGenerationResult {
    return this.noop();
  }
  
  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    // Просто проксируем входное выражение
    return helpers.getInputExpression(node, 'in') ?? '0';
  }
}

export class ArrayGetNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['ArrayGet'];

  generate(): NodeGenerationResult {
    return this.noop();
  }

  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    const arrayExpr = resolveInputExpression(node, 'array', 'std::vector<int>{}', helpers);
    const indexExpr = resolveInputExpression(node, 'index', '0', helpers);
    const fallbackExpr = 'MulticodeValue{}';
    const safeMode = context.options.includeSourceMarkers;

    if (safeMode) {
      return `([&]() { const auto multicode_array = ${arrayExpr}; using MulticodeArray = std::decay_t<decltype(multicode_array)>; using MulticodeValue = typename MulticodeArray::value_type; const int multicode_index = static_cast<int>(${indexExpr}); if (multicode_index < 0 || multicode_index >= static_cast<int>(multicode_array.size())) { return ${fallbackExpr}; } return multicode_array[static_cast<std::size_t>(multicode_index)]; })()`;
    }

    return `(${arrayExpr}[static_cast<std::size_t>(${indexExpr})])`;
  }
}

export class ArraySetNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['ArraySet'];

  generate(): NodeGenerationResult {
    return this.noop();
  }

  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    const arrayExpr = resolveInputExpression(node, 'array', 'std::vector<int>{}', helpers);
    const indexExpr = resolveInputExpression(node, 'index', '0', helpers);
    const valueExpr = resolveInputExpression(node, 'value', '0', helpers);
    const safeMode = context.options.includeSourceMarkers;

    if (safeMode) {
      return `([&]() { auto multicode_array = ${arrayExpr}; const int multicode_index = static_cast<int>(${indexExpr}); if (multicode_index < 0 || multicode_index >= static_cast<int>(multicode_array.size())) { return multicode_array; } multicode_array[static_cast<std::size_t>(multicode_index)] = ${valueExpr}; return multicode_array; })()`;
    }

    return `([&]() { auto multicode_array = ${arrayExpr}; multicode_array[static_cast<std::size_t>(${indexExpr})] = ${valueExpr}; return multicode_array; })()`;
  }
}

export class ArrayPushBackNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['ArrayPushBack'];

  generate(): NodeGenerationResult {
    return this.noop();
  }

  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    const arrayExpr = resolveInputExpression(node, 'array', 'std::vector<int>{}', helpers);
    const valueExpr = resolveInputExpression(node, 'value', '0', helpers);
    return `([&]() { auto multicode_array = ${arrayExpr}; multicode_array.push_back(${valueExpr}); return multicode_array; })()`;
  }
}

export class MakeArrayNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['MakeArray'];

  generate(): NodeGenerationResult {
    return this.noop();
  }

  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    const itemExpressions = node.inputs
      .filter((input) => /item-\d+$/i.test(input.id))
      .sort((left, right) => left.index - right.index || left.id.localeCompare(right.id))
      .map((input) => resolveOptionalInputExpression(node, input.id, helpers))
      .filter((input): input is string => input !== null);

    if (itemExpressions.length === 0) {
      return 'std::vector<int>{}';
    }

    return `(std::vector{${itemExpressions.join(', ')}})`;
  }
}

export class ArraySizeNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['ArraySize'];

  generate(): NodeGenerationResult {
    return this.noop();
  }

  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    const arrayExpr = resolveInputExpression(node, 'array', 'std::vector<int>{}', helpers);
    return `([&]() { const auto multicode_array = ${arrayExpr}; return static_cast<int>(multicode_array.size()); })()`;
  }
}

export class ArrayClearNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['ArrayClear'];

  generate(): NodeGenerationResult {
    return this.noop();
  }

  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    const arrayExpr = resolveInputExpression(node, 'array', 'std::vector<int>{}', helpers);
    return `([&]() { auto multicode_array = ${arrayExpr}; multicode_array.clear(); return multicode_array; })()`;
  }
}

export class RandomFromArrayNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['RandomFromArray'];

  generate(): NodeGenerationResult {
    return this.noop();
  }

  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    const arrayExpr = resolveInputExpression(node, 'array', 'std::vector<int>{}', helpers);
    return `([&]() { const auto multicode_array = ${arrayExpr}; using MulticodeValue = std::decay_t<decltype(multicode_array[0])>; if (multicode_array.empty()) { if constexpr (std::is_convertible_v<MulticodeValue, const char*>) { return ""; } else { return MulticodeValue{}; } } static thread_local std::mt19937 multicode_rng(std::random_device{}()); std::uniform_int_distribution<int> multicode_dist(0, static_cast<int>(multicode_array.size()) - 1); return multicode_array[static_cast<std::size_t>(multicode_dist(multicode_rng))]; })()`;
  }
}


export class MakeExpectedNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['MakeExpected'];

  generate(): NodeGenerationResult {
    return this.noop();
  }

  getOutputExpression(
    node: BlueprintNode,
    _portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    const valueExpr = resolveInputExpression(node, 'value', '0', helpers);
    const errorExpr = resolveInputExpression(node, 'error', '"error"', helpers);
    const hasValueExpr = resolveInputExpression(node, 'has-value', 'true', helpers);
    return `((static_cast<bool>(${hasValueExpr})) ? std::expected<decltype(${valueExpr}), decltype(${errorExpr})>{${valueExpr}} : std::expected<decltype(${valueExpr}), decltype(${errorExpr})>{std::unexpected(${errorExpr})})`;
  }
}

export class ExpectedHasValueNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['ExpectedHasValue'];

  generate(): NodeGenerationResult {
    return this.noop();
  }

  getOutputExpression(node: BlueprintNode, _portId: string, _context: CodeGenContext, helpers: GeneratorHelpers): string {
    const expectedExpr = resolveInputExpression(node, 'expected', 'std::expected<int, std::string>{0}', helpers);
    return `(${expectedExpr}.has_value())`;
  }
}

export class ExpectedValueNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['ExpectedValue'];

  generate(): NodeGenerationResult {
    return this.noop();
  }

  getOutputExpression(node: BlueprintNode, _portId: string, context: CodeGenContext, helpers: GeneratorHelpers): string {
    const expectedExpr = resolveInputExpression(node, 'expected', 'std::expected<int, std::string>{0}', helpers);
    const safeMode = context.options.includeSourceMarkers;
    if (safeMode) {
      return `([&]() { const auto multicode_expected = ${expectedExpr}; if (!multicode_expected.has_value()) { return typename std::decay_t<decltype(multicode_expected)>::value_type{}; } return multicode_expected.value(); })()`;
    }
    return `(${expectedExpr}.value())`;
  }
}

export class ExpectedErrorNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['ExpectedError'];

  generate(): NodeGenerationResult {
    return this.noop();
  }

  getOutputExpression(node: BlueprintNode, _portId: string, _context: CodeGenContext, helpers: GeneratorHelpers): string {
    const expectedExpr = resolveInputExpression(node, 'expected', 'std::expected<int, std::string>{std::unexpected(std::string{})}', helpers);
    return `(${expectedExpr}.error())`;
  }
}

export class MakeOptionalNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['MakeOptional'];

  generate(): NodeGenerationResult {
    return this.noop();
  }

  getOutputExpression(node: BlueprintNode, _portId: string, _context: CodeGenContext, helpers: GeneratorHelpers): string {
    const valueExpr = resolveInputExpression(node, 'value', '0', helpers);
    const hasValueExpr = resolveInputExpression(node, 'has-value', 'true', helpers);
    return `((static_cast<bool>(${hasValueExpr})) ? std::optional<decltype(${valueExpr})>{${valueExpr}} : std::optional<decltype(${valueExpr})>{std::nullopt})`;
  }
}

export class OptionalHasValueNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['OptionalHasValue'];

  generate(): NodeGenerationResult {
    return this.noop();
  }

  getOutputExpression(node: BlueprintNode, _portId: string, _context: CodeGenContext, helpers: GeneratorHelpers): string {
    const optionalExpr = resolveInputExpression(node, 'optional', 'std::optional<int>{}', helpers);
    return `(${optionalExpr}.has_value())`;
  }
}

export class OptionalValueOrNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['OptionalValueOr'];

  generate(): NodeGenerationResult {
    return this.noop();
  }

  getOutputExpression(node: BlueprintNode, _portId: string, context: CodeGenContext, helpers: GeneratorHelpers): string {
    const optionalExpr = resolveInputExpression(node, 'optional', 'std::optional<int>{}', helpers);
    const fallbackExpr = resolveInputExpression(node, 'fallback', '0', helpers);
    const safeMode = context.options.includeSourceMarkers;
    if (safeMode) {
      return `([&]() { const auto multicode_optional = ${optionalExpr}; if (!multicode_optional.has_value()) { return ${fallbackExpr}; } return multicode_optional.value(); })()`;
    }
    return `(${optionalExpr}.value_or(${fallbackExpr}))`;
  }
}

export class MakeVariantNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['MakeVariant'];

  generate(): NodeGenerationResult {
    return this.noop();
  }

  getOutputExpression(node: BlueprintNode, _portId: string, _context: CodeGenContext, helpers: GeneratorHelpers): string {
    const valueExpr = resolveInputExpression(node, 'value', '0', helpers);
    return `(std::variant<decltype(${valueExpr})>{${valueExpr}})`;
  }
}

export class HoldsAlternativeNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['HoldsAlternative'];

  generate(): NodeGenerationResult {
    return this.noop();
  }

  getOutputExpression(node: BlueprintNode, _portId: string, _context: CodeGenContext, helpers: GeneratorHelpers): string {
    const variantExpr = resolveInputExpression(node, 'variant', 'std::variant<int>{0}', helpers);
    const indexExpr = resolveInputExpression(node, 'index', '0', helpers);
    return `((${variantExpr}.index()) == static_cast<std::size_t>(${indexExpr}))`;
  }
}

export class VisitVariantNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['VisitVariant'];

  generate(): NodeGenerationResult {
    return this.noop();
  }

  getOutputExpression(node: BlueprintNode, _portId: string, _context: CodeGenContext, helpers: GeneratorHelpers): string {
    const variantExpr = resolveInputExpression(node, 'variant', 'std::variant<int>{0}', helpers);
    return `(std::visit([](const auto& multicode_value) { return multicode_value; }, ${variantExpr}))`;
  }
}

export class FormatNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Format'];

  generate(): NodeGenerationResult {
    return this.noop();
  }

  getOutputExpression(node: BlueprintNode, _portId: string, _context: CodeGenContext, helpers: GeneratorHelpers): string {
    const formatExpr = resolveInputExpression(node, 'format', '"{}"', helpers);
    const argInputs = node.inputs
      .filter((input) => input.id.startsWith('arg-'))
      .sort((a, b) => a.id.localeCompare(b.id));

    const argExpressions = argInputs
      .map((input) => resolveInputExpression(node, input.id, '0', helpers))
      .join(', ');

    if (argExpressions.length === 0) {
      return `(std::format(${formatExpr}))`;
    }

    return `(std::format(${formatExpr}, ${argExpressions}))`;
  }
}

/**
 * Fallback генератор для неподдерживаемых типов узлов
 */
export class FallbackNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Custom', 'Function', 'FunctionCall', 'Event'];
  
  generate(
    node: BlueprintNode,
    context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const supportedTypes = this.getSupportedTypesText(context);
    const nodeLabel = node.label?.trim() || '—';
    const message = `Неподдерживаемый узел для C++ генератора: id=${node.id}, type=${node.type}, label="${nodeLabel}". Поддерживаемые типы: ${supportedTypes}. Подсказка: проверьте поддерживаемые типы узлов.`;
    const messageEn = `Unsupported node for C++ generator: id=${node.id}, type=${node.type}, label="${nodeLabel}". Supported types: ${supportedTypes}. Hint: check supported node types.`;

    helpers.addError(node.id, CodeGenErrorCode.UNIMPLEMENTED_NODE_TYPE, message, messageEn);

    return this.code([], true);
  }

  private getSupportedTypesText(context: CodeGenContext): string {
    const supportedTypes = context.supportedNodeTypes
      ?.map(type => type.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    if (!supportedTypes || supportedTypes.length === 0) {
      return 'см. Документы/Архитектура/VisualEditor.md';
    }

    return supportedTypes.join(', ');
  }
}

/**
 * Фабричная функция для создания прочих генераторов
 */
export function createOtherGenerators(): BaseNodeGenerator[] {
  return [
    new CommentNodeGenerator(),
    new RerouteNodeGenerator(),
    new StringConcatNodeGenerator(),
    new StringLengthNodeGenerator(),
    new SubstringNodeGenerator(),
    new ContainsNodeGenerator(),
    new SplitNodeGenerator(),
    new TrimNodeGenerator(),
    new MakeArrayNodeGenerator(),
    new ArrayGetNodeGenerator(),
    new ArraySetNodeGenerator(),
    new ArrayPushBackNodeGenerator(),
    new ArraySizeNodeGenerator(),
    new ArrayClearNodeGenerator(),
    new RandomFromArrayNodeGenerator(),
    new MakeExpectedNodeGenerator(),
    new ExpectedHasValueNodeGenerator(),
    new ExpectedValueNodeGenerator(),
    new ExpectedErrorNodeGenerator(),
    new MakeOptionalNodeGenerator(),
    new OptionalHasValueNodeGenerator(),
    new OptionalValueOrNodeGenerator(),
    new MakeVariantNodeGenerator(),
    new HoldsAlternativeNodeGenerator(),
    new VisitVariantNodeGenerator(),
    new FormatNodeGenerator(),
    new FallbackNodeGenerator(),
  ];
}
