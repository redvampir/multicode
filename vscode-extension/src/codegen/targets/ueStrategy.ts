import type {
  BlueprintFunction,
  BlueprintGraphState,
  BlueprintNode,
  BlueprintVariable,
} from '../../shared/blueprintTypes';
import { getCppType, getDefaultValue, toValidIdentifier } from '../types';
import { CodeGenErrorCode, type CodeGenError } from '../types';
import { buildClassModelFromGraph, type ClassModelMethod, type ClassModelField } from '../model/classModel';
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

const resolveCppType = (dataType: ClassModelField['dataType'] | ClassModelMethod['returnType'], typeName?: string): string => {
  const resolvedTypeName = typeof typeName === 'string' ? typeName.trim() : '';
  if ((dataType === 'class' || dataType === 'pointer') && resolvedTypeName.length > 0) {
    return resolvedTypeName;
  }

  return getCppType(dataType);
};

const formatField = (field: ClassModelField): string[] => {
  const lines: string[] = [];
  const propertyMacro = field.extensions?.ue?.propertyMacro;
  if (propertyMacro) {
    lines.push(`    ${propertyMacro}`);
  }

  const fieldType = resolveCppType(field.dataType, field.typeName);
  const fieldName = toValidIdentifier(field.name || 'member');
  lines.push(`    ${fieldType} ${fieldName};`);
  return lines;
};

const formatMethodDeclaration = (method: ClassModelMethod): string[] => {
  const lines: string[] = [];
  const functionMacro = method.extensions?.ue?.functionMacro;
  if (functionMacro) {
    lines.push(`    ${functionMacro}`);
  }

  const methodName = toValidIdentifier(method.name || 'Execute');
  const returnType = resolveCppType(method.returnType, method.returnTypeName);
  const params = method.params
    .map((param, index) => {
      const paramType = resolveCppType(param.dataType, param.typeName);
      const paramName = toValidIdentifier(param.name || `arg_${index}`);
      return `${paramType} ${paramName}`;
    })
    .join(', ');

  lines.push(`    ${returnType} ${methodName}(${params});`);
  return lines;
};

const formatMethodDefinition = (className: string, method: ClassModelMethod): string[] => {
  const methodName = toValidIdentifier(method.name || 'Execute');
  const returnType = resolveCppType(method.returnType, method.returnTypeName);
  const params = method.params
    .map((param, index) => {
      const paramType = resolveCppType(param.dataType, param.typeName);
      const paramName = toValidIdentifier(param.name || `arg_${index}`);
      return `${paramType} ${paramName}`;
    })
    .join(', ');

  const lines = [`${returnType} ${className}::${methodName}(${params}) {`];
  if (returnType !== 'void') {
    lines.push(`    return ${getDefaultValue(method.returnType)};`);
  }
  lines.push('}');
  lines.push('');
  return lines;
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
    const classModel = buildClassModelFromGraph(graph, 'ue')[0];

    const bodyLines = generatedBody
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);

    const ueClassName = macroLayout.className;

    const reflectedMembers = classModel?.fields.flatMap(formatField) ?? [];
    const reflectedMethods = classModel?.methods.flatMap(formatMethodDeclaration) ?? [];
    const reflectedMethodDefinitions = classModel?.methods.flatMap((method) => formatMethodDefinition(ueClassName, method)) ?? [];

    return [
      '// Сгенерировано MultiCode (target: ue)',
      `// Граф: ${graph.name}`,
      '#pragma once',
      '#include "CoreMinimal.h"',
      '#include "UObject/NoExportTypes.h"',
      '#include <iostream>',
      `#include "${macroLayout.generatedHeaderName}"`,
      '',
      macroLayout.classMacro,
      `class ${ueClassName} : public UObject {`,
      `    ${macroLayout.generatedBodyMacro}`,
      'public:',
      ...reflectedMembers,
      ...reflectedMethods,
      `    ${macroLayout.executeMethodMacro}`,
      '    void ExecuteGraph();',
      '};',
      '',
      ...reflectedMethodDefinitions,
      `void ${ueClassName}::ExecuteGraph() {`,
      ...bodyLines.map((line) => `    ${line}`),
      '}',
      '',
    ].join('\n');
  }
}
