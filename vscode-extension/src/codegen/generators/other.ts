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
    new FallbackNodeGenerator(),
  ];
}
