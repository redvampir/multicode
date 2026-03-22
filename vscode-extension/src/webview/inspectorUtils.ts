import type { GraphState } from '../shared/graphState';
import type { ValidationIssue, ValidationResult } from '../shared/validator';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const resolveGraphNodeDisplayName = (
  graph: GraphState,
  node: GraphState['nodes'][number]
): string => {
  const directLabel = node.label.trim();
  if (directLabel.length > 0) {
    return directLabel;
  }

  if (!isRecord(node.blueprintNode)) {
    return node.id;
  }

  const blueprintNode = node.blueprintNode;
  const customLabel = typeof blueprintNode.customLabel === 'string' ? blueprintNode.customLabel.trim() : '';
  if (customLabel.length > 0) {
    return customLabel;
  }

  const blueprintLabel = typeof blueprintNode.label === 'string' ? blueprintNode.label.trim() : '';
  if (blueprintLabel.length > 0) {
    return blueprintLabel;
  }

  const properties = isRecord(blueprintNode.properties) ? blueprintNode.properties : undefined;
  const variableNameRu = typeof properties?.nameRu === 'string' ? properties.nameRu.trim() : '';
  const variableNameEn = typeof properties?.name === 'string' ? properties.name.trim() : '';
  const variableName = variableNameRu || variableNameEn;
  const nodeType = typeof blueprintNode.type === 'string' ? blueprintNode.type : node.type;

  if (variableName.length > 0) {
    if (nodeType === 'GetVariable') {
      return `${graph.displayLanguage === 'ru' ? 'Получить' : 'Get'}: ${variableName}`;
    }
    if (nodeType === 'SetVariable') {
      return `${graph.displayLanguage === 'ru' ? 'Установить' : 'Set'}: ${variableName}`;
    }
    return variableName;
  }

  return nodeType || node.id;
};

export const buildValidationIssues = (validation?: ValidationResult): ValidationIssue[] => {
  if (!validation) {
    return [];
  }

  if (validation.issues?.length) {
    return validation.issues;
  }

  return [
    ...validation.errors.map((message) => ({
      severity: 'error' as const,
      message,
      nodes: undefined,
      edges: undefined,
    })),
    ...validation.warnings.map((message) => ({
      severity: 'warning' as const,
      message,
      nodes: undefined,
      edges: undefined,
    })),
  ];
};

export const filterValidationIssuesBySelection = (
  issues: ValidationIssue[],
  nodeIds?: string[],
  edgeIds?: string[]
): ValidationIssue[] => {
  const hasNodeFilter = Boolean(nodeIds?.length);
  const hasEdgeFilter = Boolean(edgeIds?.length);
  if (!hasNodeFilter && !hasEdgeFilter) {
    return issues;
  }

  const nodeIdSet = new Set(nodeIds ?? []);
  const edgeIdSet = new Set(edgeIds ?? []);

  return issues.filter((issue) => {
    const hasNodeMatch = issue.nodes?.some((nodeId) => nodeIdSet.has(nodeId)) ?? false;
    const hasEdgeMatch = issue.edges?.some((edgeId) => edgeIdSet.has(edgeId)) ?? false;
    return hasNodeMatch || hasEdgeMatch;
  });
};
