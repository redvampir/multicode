import type {
  BlueprintFunction,
  BlueprintGraphState,
  BlueprintNode,
  BlueprintVariable,
  UeMacroBinding,
  UeMacroTargetKind,
  UeMacroType,
} from '../../shared/blueprintTypes';
import { renderUeMacroString } from '../../shared/blueprintTypes';
import { getCppType, getDefaultValue, toValidIdentifier } from '../types';
import { CodeGenErrorCode, type CodeGenError } from '../types';
import {
  buildClassModelFromGraph,
  type ClassModelField,
  type ClassModelMethod,
} from '../model/classModel';
import type {
  GeneratedUserFunctionSource,
  GraphVariableStorageDescriptor,
} from '../CppCodeGenerator';
import { UeMacroStrategy } from './ueMacroStrategy';

const UE_UNSUPPORTED_NODE_TYPES = new Set([
  'Parallel',
]);

const UE_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const UE_RESERVED_KEYWORDS = new Set([
  'class', 'struct', 'enum', 'template', 'typename', 'this', 'new', 'delete', 'virtual', 'override',
]);

const DEFAULT_TOP_LEVEL_FUNCTION_MACRO = 'UFUNCTION(BlueprintCallable, Category = "MultiCode")';
const DEFAULT_TOP_LEVEL_PROPERTY_MACRO = 'UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "MultiCode")';

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

const resolveVariableIdentifierCandidate = (variable: BlueprintVariable): string =>
  (typeof variable.codeName === 'string' && variable.codeName.trim().length > 0
    ? variable.codeName
    : variable.name);

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
    const error = validateNamedEntity(resolveVariableIdentifierCandidate(varEntity), 'Имя переменной', varEntity.id);
    if (error) {
      errors.push(error);
    }
  }

  for (const func of graph.functions ?? []) {
    const fnEntity = func as BlueprintFunction;
    const error = validateNamedEntity(fnEntity.name, 'Имя функции', fnEntity.id);
    if (error) {
      errors.push(error);
    }
  }

  for (const classModel of buildClassModelFromGraph(graph, 'ue')) {
    const error = validateNamedEntity(classModel.name, 'Имя класса', classModel.id);
    if (error) {
      errors.push(error);
    }
  }

  return errors;
};

const resolveCppType = (
  dataType: ClassModelField['dataType'] | ClassModelMethod['returnType'],
  typeName?: string,
): string => {
  const resolvedTypeName = typeof typeName === 'string' ? typeName.trim() : '';
  if ((dataType === 'class' || dataType === 'pointer') && resolvedTypeName.length > 0) {
    return resolvedTypeName;
  }

  return getCppType(dataType);
};

const resolveBoundMacroString = (
  macros: UeMacroBinding[],
  targetId: string,
  targetKind: UeMacroTargetKind,
  macroType: UeMacroType,
  fallback: string,
): string => {
  const binding = macros.find(
    (macro) =>
      macro.targetId === targetId &&
      macro.targetKind === targetKind &&
      macro.macroType === macroType,
  );

  return binding ? renderUeMacroString(binding) : fallback;
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

const formatTopLevelVariableField = (
  descriptor: GraphVariableStorageDescriptor,
  macros: UeMacroBinding[],
): string[] => {
  const propertyMacro = resolveBoundMacroString(
    macros,
    descriptor.variableId,
    'variable',
    'UPROPERTY',
    DEFAULT_TOP_LEVEL_PROPERTY_MACRO,
  );

  return [
    `    ${propertyMacro}`,
    `    ${descriptor.cppType} ${descriptor.identifier} = ${descriptor.initializer};`,
  ];
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

const formatTopLevelFunctionDeclaration = (
  func: BlueprintFunction,
  source: GeneratedUserFunctionSource,
  macros: UeMacroBinding[],
): string[] => {
  const lines: string[] = [];
  for (const comment of source.comments) {
    lines.push(`    ${comment}`);
  }
  if (source.resultTypeDeclaration) {
    lines.push(`    ${source.resultTypeDeclaration}`);
  }

  const functionMacro = resolveBoundMacroString(
    macros,
    func.id,
    'function',
    'UFUNCTION',
    DEFAULT_TOP_LEVEL_FUNCTION_MACRO,
  );
  lines.push(`    ${functionMacro}`);
  lines.push(`    ${source.signature};`);
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

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const resolveResultTypeAliasName = (resultTypeDeclaration?: string): string | null => {
  if (!resultTypeDeclaration) {
    return null;
  }

  const match = resultTypeDeclaration.match(/^\s*using\s+([A-Za-z_]\w*)\s*=/);
  return match?.[1] ?? null;
};

const qualifyTopLevelFunctionSignature = (
  signature: string,
  className: string,
  resultTypeAliasName: string | null,
): string => {
  const openingParenIndex = signature.indexOf('(');
  if (openingParenIndex < 0) {
    return signature;
  }

  const beforeParen = signature.slice(0, openingParenIndex).trimEnd();
  const afterParen = signature.slice(openingParenIndex);
  const lastSpaceIndex = beforeParen.lastIndexOf(' ');
  if (lastSpaceIndex < 0) {
    return signature;
  }

  let returnType = beforeParen.slice(0, lastSpaceIndex).trim();
  const methodName = beforeParen.slice(lastSpaceIndex + 1).trim();
  if (!methodName) {
    return signature;
  }

  if (resultTypeAliasName) {
    returnType = returnType.replace(
      new RegExp(`^${escapeRegex(resultTypeAliasName)}\\b`),
      `${className}::${resultTypeAliasName}`,
    );
  }

  return `${returnType} ${className}::${methodName}${afterParen}`;
};

const formatTopLevelFunctionDefinition = (
  className: string,
  source: GeneratedUserFunctionSource,
): string[] => {
  const resultTypeAliasName = resolveResultTypeAliasName(source.resultTypeDeclaration);
  const qualifiedSignature = qualifyTopLevelFunctionSignature(
    source.signature,
    className,
    resultTypeAliasName,
  );

  return [
    ...source.comments,
    `${qualifiedSignature} {`,
    ...source.bodyLines,
    '}',
    '',
  ];
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

  render(
    graph: BlueprintGraphState,
    eventGraphBody: string,
    topLevelVariables: GraphVariableStorageDescriptor[],
    topLevelFunctions: Array<{ func: BlueprintFunction; source: GeneratedUserFunctionSource }>,
  ): string {
    const macroLayout = this.macroStrategy.resolve(graph);
    const classModel = buildClassModelFromGraph(graph, 'ue')[0];
    const macros: UeMacroBinding[] = Array.isArray(graph.ueMacros) ? graph.ueMacros : [];

    const bodyLines = eventGraphBody
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);

    const ueClassName = macroLayout.className;

    const reflectedMembers = classModel?.fields.flatMap(formatField) ?? [];
    const reflectedMethods = classModel?.methods.flatMap(formatMethodDeclaration) ?? [];
    const reflectedMethodDefinitions = classModel?.methods.flatMap((method) => formatMethodDefinition(ueClassName, method)) ?? [];
    const topLevelReflectedMembers = topLevelVariables.flatMap((descriptor) => formatTopLevelVariableField(descriptor, macros));
    const topLevelReflectedMethods = topLevelFunctions.flatMap(({ func, source }) =>
      formatTopLevelFunctionDeclaration(func, source, macros),
    );
    const topLevelReflectedMethodDefinitions = topLevelFunctions.flatMap(({ source }) =>
      formatTopLevelFunctionDefinition(ueClassName, source),
    );

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
      ...topLevelReflectedMembers,
      ...reflectedMethods,
      ...topLevelReflectedMethods,
      `    ${macroLayout.executeMethodMacro}`,
      '    void ExecuteGraph();',
      '};',
      '',
      ...reflectedMethodDefinitions,
      ...topLevelReflectedMethodDefinitions,
      `void ${ueClassName}::ExecuteGraph() {`,
      ...bodyLines.map((line) => `    ${line}`),
      '}',
      '',
    ].join('\n');
  }
}
