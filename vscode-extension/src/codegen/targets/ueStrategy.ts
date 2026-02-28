import type {
  BlueprintFunction,
  BlueprintGraphState,
  BlueprintNode,
  BlueprintVariable,
} from '../../shared/blueprintTypes';
import { CodeGenErrorCode, type CodeGenError } from '../types';
import { buildClassModelFromGraph } from '../model/classModel';
import { UeMacroStrategy } from './ueMacroStrategy';

const UE_UNSUPPORTED_NODE_TYPES = new Set([
  'Parallel',
]);

const UE_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const UE_RESERVED_KEYWORDS = new Set([
  'class', 'struct', 'enum', 'template', 'typename', 'this', 'new', 'delete', 'virtual', 'override',
]);

const isUeIdentifier = (name: string): boolean =>
  UE_IDENTIFIER_PATTERN.test(name) && !UE_RESERVED_KEYWORDS.has(name.toLowerCase());

const validateIdentifier = (name: string, nodeId: string, entityLabel: string): CodeGenError | undefined => {
  if (isUeIdentifier(name)) {
    return undefined;
  }

  return {
    nodeId,
    code: CodeGenErrorCode.UE_UNSUPPORTED_CONSTRUCT,
    message: `${entityLabel} "${name}" не совместим с UE target: используйте латиницу, цифры и '_' (первый символ — буква или '_')`,
    messageEn: `${entityLabel} "${name}" is incompatible with UE target: use latin letters, digits and '_' (first symbol must be a letter or '_')`,
  };
};

const validateNamedEntity = (
  name: string,
  entityLabel: string,
  nodeId = ''
): CodeGenError | undefined => validateIdentifier(name.trim(), nodeId, entityLabel);

const collectNamedValidationErrors = (
  graph: BlueprintGraphState,
  nodes: BlueprintNode[]
): CodeGenError[] => {
  const errors: CodeGenError[] = [];

  for (const node of nodes) {
    if (node.type !== 'Variable' && node.type !== 'Function' && node.type !== 'ClassMethodCall') {
      continue;
    }

    const nodeLabel = (node.customLabel ?? node.label ?? '').trim();
    if (!nodeLabel) {
      continue;
    }

    const error = validateIdentifier(nodeLabel, node.id, 'Имя узла');
    if (error) {
      errors.push(error);
    }
  }

  for (const variable of graph.variables ?? []) {
    const varEntity = variable as BlueprintVariable;
    const error = validateNamedEntity(varEntity.name, 'Имя переменной');
    if (error) {
      errors.push(error);
    }
  }

  for (const func of graph.functions ?? []) {
    const fnEntity = func as BlueprintFunction;
    const error = validateNamedEntity(fnEntity.name, 'Имя функции');
    if (error) {
      errors.push(error);
    }
  }

  for (const classModel of buildClassModelFromGraph(graph, 'ue')) {
    const error = validateNamedEntity(classModel.name, 'Имя класса');
    if (error) {
      errors.push(error);
    }
  }

  return errors;
};

export class UeCodegenStrategy {
  constructor(private readonly macroStrategy: UeMacroStrategy = new UeMacroStrategy()) {}

  validate(graph: BlueprintGraphState): CodeGenError[] {
    const errors: CodeGenError[] = [];

    for (const node of graph.nodes) {
      if (!UE_UNSUPPORTED_NODE_TYPES.has(node.type)) {
        continue;
      }

      errors.push({
        nodeId: node.id,
        code: CodeGenErrorCode.UE_UNSUPPORTED_CONSTRUCT,
        message: `Узел "${node.type}" пока не поддерживается для target ue`,
        messageEn: `Node "${node.type}" is not supported for target ue yet`,
      });
    }

    errors.push(...collectNamedValidationErrors(graph, graph.nodes));

    return errors;
  }

  render(graph: BlueprintGraphState, generatedBody: string): string {
    const macroLayout = this.macroStrategy.resolve(graph);

    const bodyLines = generatedBody
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);

    return [
      '// Сгенерировано MultiCode (target: ue)',
      `// Граф: ${graph.name}`,
      '#pragma once',
      '#include "CoreMinimal.h"',
      '#include "UObject/NoExportTypes.h"',
      `#include "${macroLayout.generatedHeaderName}"`,
      '',
      macroLayout.classMacro,
      `class ${macroLayout.className} : public UObject {`,
      `    ${macroLayout.generatedBodyMacro}`,
      'public:',
      `    ${macroLayout.methodMacro}`,
      '    void ExecuteGraph();',
      '};',
      '',
      `void ${macroLayout.className}::ExecuteGraph() {`,
      ...bodyLines.map((line) => `    ${line}`),
      '}',
      '',
    ].join('\n');
  }
}
