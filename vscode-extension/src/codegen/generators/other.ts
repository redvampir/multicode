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

  return fallback;
};

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
    new ArrayGetNodeGenerator(),
    new ArraySetNodeGenerator(),
    new ArrayPushBackNodeGenerator(),
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
