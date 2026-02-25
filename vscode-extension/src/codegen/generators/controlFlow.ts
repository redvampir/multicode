/**
 * Генераторы для Control Flow узлов
 * 
 * Start, End, Return, Branch, ForLoop, WhileLoop, Sequence
 */

import type { BlueprintNode, BlueprintNodeType, NodePort } from '../../shared/blueprintTypes';
import type { CodeGenContext } from '../types';
import { CodeGenWarningCode } from '../types';
import {
  BaseNodeGenerator,
  GeneratorHelpers,
  NodeGenerationResult,
} from './base';

const buildExecutionAdjacency = (context: CodeGenContext): Map<string, string[]> => {
  const adjacency = new Map<string, string[]>();

  for (const edge of context.graph.edges) {
    if (edge.kind !== 'execution') {
      continue;
    }

    const outgoing = adjacency.get(edge.sourceNode);
    if (outgoing) {
      outgoing.push(edge.targetNode);
    } else {
      adjacency.set(edge.sourceNode, [edge.targetNode]);
    }
  }

  return adjacency;
};

const collectExecutionDistances = (
  startNodeId: string,
  adjacency: Map<string, string[]>,
  excludedNodeIds: Set<string>
): Map<string, number> => {
  const distances = new Map<string, number>();
  const queue: Array<{ nodeId: string; distance: number }> = [{ nodeId: startNodeId, distance: 0 }];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    const { nodeId, distance } = current;
    if (visited.has(nodeId) || excludedNodeIds.has(nodeId)) {
      continue;
    }

    visited.add(nodeId);
    distances.set(nodeId, distance);

    const next = adjacency.get(nodeId);
    if (!next) {
      continue;
    }

    for (const targetNodeId of next) {
      if (!visited.has(targetNodeId)) {
        queue.push({ nodeId: targetNodeId, distance: distance + 1 });
      }
    }
  }

  return distances;
};

const findExecutionMergeNodeId = (
  context: CodeGenContext,
  startNodeIds: string[],
  excludedNodeIds: Set<string>
): string | null => {
  if (startNodeIds.length < 2) {
    return null;
  }

  const uniqueStartIds = Array.from(new Set(startNodeIds));
  if (uniqueStartIds.length < 2) {
    return null;
  }

  const adjacency = buildExecutionAdjacency(context);
  const distances = uniqueStartIds.map((startId) =>
    collectExecutionDistances(startId, adjacency, excludedNodeIds)
  );
  if (distances.length < 2) {
    return null;
  }

  const [firstMap, ...restMaps] = distances;
  const candidates: string[] = [];
  for (const candidateId of firstMap.keys()) {
    if (excludedNodeIds.has(candidateId)) {
      continue;
    }
    if (restMaps.every((distanceMap) => distanceMap.has(candidateId))) {
      candidates.push(candidateId);
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  let bestCandidate: string | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestSum = Number.POSITIVE_INFINITY;

  for (const candidateId of candidates) {
    const distancesForCandidate = distances.map((map) => map.get(candidateId) ?? Number.POSITIVE_INFINITY);
    const maxDistance = Math.max(...distancesForCandidate);
    const sumDistance = distancesForCandidate.reduce((sum, value) => sum + value, 0);

    if (
      maxDistance < bestScore ||
      (maxDistance === bestScore && sumDistance < bestSum)
    ) {
      bestCandidate = candidateId;
      bestScore = maxDistance;
      bestSum = sumDistance;
    }
  }

  return bestCandidate;
};

const extractSwitchCaseValueFromPortId = (portId: string): number | null => {
  const match = portId.match(/case-(\d+)(?:$|[-_])/i);
  if (!match) {
    return null;
  }
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveSwitchCaseValue = (port: BlueprintNode['outputs'][number]): number => {
  if (typeof port.defaultValue === 'number' && Number.isFinite(port.defaultValue)) {
    return Math.max(0, Math.trunc(port.defaultValue));
  }
  return extractSwitchCaseValueFromPortId(port.id) ?? 0;
};

const isSwitchCasePort = (port: BlueprintNode['outputs'][number]): boolean =>
  port.direction === 'output' &&
  port.dataType === 'execution' &&
  extractSwitchCaseValueFromPortId(port.id) !== null;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;

const resolveSwitchInitExpression = (node: BlueprintNode): string | null => {
  const properties = asRecord(node.properties);
  if (!properties || properties.switchInitEnabled !== true) {
    return null;
  }

  const rawInit = properties.switchInit;
  if (typeof rawInit !== 'string') {
    return null;
  }

  const trimmed = rawInit.trim();
  if (!trimmed) {
    return null;
  }

  const sanitized = trimmed.endsWith(';')
    ? trimmed.slice(0, -1).trimEnd()
    : trimmed;
  return sanitized.length > 0 ? sanitized : null;
};

const extractDeclaredIdentifierFromSwitchInit = (switchInitExpr: string): string | null => {
  const trimmed = switchInitExpr.trim();
  if (!trimmed) {
    return null;
  }

  const delimiterCandidates = [trimmed.indexOf('='), trimmed.indexOf('{'), trimmed.indexOf(',')]
    .filter((index) => index >= 0);
  const delimiterIndex = delimiterCandidates.length > 0
    ? Math.min(...delimiterCandidates)
    : trimmed.length;
  const declarationPrefix = trimmed.slice(0, delimiterIndex).trim();
  if (!declarationPrefix) {
    return null;
  }
  // init-выражения вида `foo()`/`obj.method()` не считаем декларацией переменной.
  if (declarationPrefix.includes('(') || declarationPrefix.includes('.') || declarationPrefix.includes('->')) {
    return null;
  }

  const tokens = declarationPrefix.match(/[A-Za-z_]\w*/g);
  if (!tokens || tokens.length < 2) {
    return null;
  }

  const declaredIdentifier = tokens[tokens.length - 1];
  const normalizedPrefix = declarationPrefix.replace(/\s*[*&]+\s*/g, ' ').trim();
  if (!normalizedPrefix.endsWith(declaredIdentifier)) {
    return null;
  }

  return declaredIdentifier;
};

const escapeRegexLiteral = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const containsIdentifier = (source: string, identifier: string): boolean => {
  if (!source || !identifier) {
    return false;
  }
  const identifierRegex = new RegExp(`\\b${escapeRegexLiteral(identifier)}\\b`);
  return identifierRegex.test(source);
};

const matchPortId = (left: string, right: string): boolean => {
  if (left === right) {
    return true;
  }

  const normalizedLeft = left.toLowerCase();
  const normalizedRight = right.toLowerCase();

  return (
    normalizedLeft.endsWith(`-${normalizedRight}`) ||
    normalizedRight.endsWith(`-${normalizedLeft}`) ||
    normalizedLeft.endsWith(`_${normalizedRight}`) ||
    normalizedRight.endsWith(`_${normalizedLeft}`)
  );
};

const resolveSwitchSelectionInputPort = (node: BlueprintNode): NodePort | null => {
  const dataInputs = node.inputs.filter(
    (port) => port.direction === 'input' && port.dataType !== 'execution'
  );
  if (dataInputs.length === 0) {
    return null;
  }

  // Поддержка legacy-имен портов.
  const preferredIds = ['selection', 'value', 'condition'];
  for (const preferredId of preferredIds) {
    const candidate = dataInputs.find((port) => matchPortId(port.id, preferredId));
    if (candidate) {
      return candidate;
    }
  }

  return dataInputs[0] ?? null;
};

const hasIncomingEdgeToPort = (
  node: BlueprintNode,
  context: CodeGenContext,
  portId: string
): boolean =>
  context.graph.edges.some(
    (edge) => edge.targetNode === node.id && matchPortId(edge.targetPort, portId)
  );

const resolveSwitchSelectionExpression = (
  node: BlueprintNode,
  helpers: GeneratorHelpers
): string => {
  const legacyCandidates = ['selection', 'value', 'condition'];
  const dynamicDataInputIds = node.inputs
    .filter((port) => port.direction === 'input' && port.dataType !== 'execution')
    .map((port) => port.id);
  const candidates = Array.from(new Set([...legacyCandidates, ...dynamicDataInputIds]));

  for (const candidate of candidates) {
    const expression = helpers.getInputExpression(node, candidate);
    if (expression !== null) {
      return expression;
    }
  }

  return '0';
};

/**
 * Start — точка входа в граф
 */
export class StartNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Start'];
  
  generate(): NodeGenerationResult {
    // Start не генерирует код, только начинает execution flow
    return this.noop();
  }
}

/**
 * End / Return — завершение выполнения
 */
export class EndNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['End', 'Return'];
  
  generate(
    node: BlueprintNode,
    context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    
    // Для Return с возвращаемым значением
    if (node.type === 'Return') {
      const returnValue = helpers.getInputExpression(node, 'value');
      if (returnValue && returnValue !== '0') {
        return this.code([`${ind}return ${returnValue};`], false);
      }
    }
    
    return this.code([`${ind}return 0;`], false);
  }
}

/**
 * Branch — условный переход (if/else)
 */
export class BranchNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Branch'];
  
  generate(
    node: BlueprintNode,
    context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    const lines: string[] = [];
    const trueNode = helpers.getExecutionTarget(node, 'true');
    const falseNode = helpers.getExecutionTarget(node, 'false');

    const mergeNodeId = trueNode && falseNode
      ? findExecutionMergeNodeId(
          context,
          [trueNode.id, falseNode.id],
          new Set<string>([node.id])
        )
      : null;
    const mergeNode = mergeNodeId
      ? context.graph.nodes.find((candidate) => candidate.id === mergeNodeId) ?? null
      : null;

    const shouldMaskMergeNode =
      mergeNodeId !== null &&
      mergeNode !== null &&
      !context.processedNodes.has(mergeNodeId);

    if (shouldMaskMergeNode && mergeNodeId) {
      context.processedNodes.add(mergeNodeId);
    }
    
    // Получить условие
    const conditionExpr = helpers.getInputExpression(node, 'condition') ?? 'true';
    
    lines.push(`${ind}if (${conditionExpr}) {`);
    
    // True ветка
    helpers.pushIndent();
    if (trueNode) {
      const trueLines = helpers.generateFromNode(trueNode);
      lines.push(...trueLines);
    } else {
      const emptyBranchComment = context.graph.displayLanguage === 'en'
        ? 'Empty branch'
        : 'Пустая ветка';
      lines.push(`${helpers.indent()}// ${emptyBranchComment}`);
      helpers.addWarning(node.id, CodeGenWarningCode.EMPTY_BRANCH, 'Ветка "True" пуста');
    }
    helpers.popIndent();
    
    // False ветка
    if (falseNode) {
      lines.push(`${ind}} else {`);
      helpers.pushIndent();
      const falseLines = helpers.generateFromNode(falseNode);
      lines.push(...falseLines);
      helpers.popIndent();
    }
    
    lines.push(`${ind}}`);

    if (shouldMaskMergeNode && mergeNodeId) {
      context.processedNodes.delete(mergeNodeId);
    }

    if (mergeNode) {
      const mergeLines = helpers.generateFromNode(mergeNode);
      lines.push(...mergeLines);
    }
    
    return this.customExecution(lines);
  }
}

/**
 * ForLoop — цикл с счётчиком
 */
export class ForLoopNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['ForLoop'];
  
  generate(
    node: BlueprintNode,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    const lines: string[] = [];
    
    const firstIndex = helpers.getInputExpression(node, 'first') ?? '0';
    const lastIndex = helpers.getInputExpression(node, 'last') ?? '10';
    
    // Генерируем читаемое имя переменной
    const indexVar = `i_${node.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6)}`;
    
    lines.push(`${ind}for (int ${indexVar} = ${firstIndex}; ${indexVar} <= ${lastIndex}; ${indexVar}++) {`);
    
    // Тело цикла
    helpers.pushIndent();
    const bodyNode = helpers.getExecutionTarget(node, 'loop-body');
    if (bodyNode) {
      // Регистрируем index как переменную для использования внутри цикла
      helpers.declareVariable(`${node.id}-index`, indexVar, 'Index', 'int', node.id);
      
      const bodyLines = helpers.generateFromNode(bodyNode);
      lines.push(...bodyLines);
    }
    helpers.popIndent();
    
    lines.push(`${ind}}`);
    
    // После цикла — completed
    const completedNode = helpers.getExecutionTarget(node, 'completed');
    if (completedNode) {
      const completedLines = helpers.generateFromNode(completedNode);
      lines.push(...completedLines);
    }
    
    return this.customExecution(lines);
  }
  
  getOutputExpression(
    node: BlueprintNode,
    portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    if (portId.includes('index')) {
      const varInfo = helpers.getVariable(`${node.id}-index`);
      return varInfo?.codeName ?? 'i';
    }
    return '0';
  }
}

/**
 * WhileLoop — цикл с условием
 */
export class WhileLoopNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['WhileLoop'];
  
  generate(
    node: BlueprintNode,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    const lines: string[] = [];
    
    const conditionExpr = helpers.getInputExpression(node, 'condition') ?? 'true';
    
    // Предупреждение о бесконечном цикле
    if (conditionExpr === 'true') {
      helpers.addWarning(
        node.id,
        CodeGenWarningCode.INFINITE_LOOP,
        'Условие цикла всегда true — возможен бесконечный цикл'
      );
    }
    
    lines.push(`${ind}while (${conditionExpr}) {`);
    
    helpers.pushIndent();
    const bodyNode = helpers.getExecutionTarget(node, 'loop-body');
    if (bodyNode) {
      const bodyLines = helpers.generateFromNode(bodyNode);
      lines.push(...bodyLines);
    }
    helpers.popIndent();
    
    lines.push(`${ind}}`);
    
    // После цикла
    const completedNode = helpers.getExecutionTarget(node, 'completed');
    if (completedNode) {
      const completedLines = helpers.generateFromNode(completedNode);
      lines.push(...completedLines);
    }
    
    return this.customExecution(lines);
  }
}

/**
 * Sequence — последовательное выполнение нескольких веток
 */
export class SequenceNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Sequence'];
  
  generate(
    node: BlueprintNode,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const lines: string[] = [];
    
    // Найти все then-N выходы и отсортировать
    const thenPorts = node.outputs.filter(p => p.id.includes('then-'));
    thenPorts.sort((a, b) => {
      const aNum = parseInt(a.id.split('-').pop() ?? '0');
      const bNum = parseInt(b.id.split('-').pop() ?? '0');
      return aNum - bNum;
    });
    
    for (const port of thenPorts) {
      // Извлекаем суффикс порта (then-0, then-1, etc.)
      const portSuffix = port.id.split('-').slice(-2).join('-');
      const targetNode = helpers.getExecutionTarget(node, portSuffix);
      if (targetNode) {
        const targetLines = helpers.generateFromNode(targetNode);
        lines.push(...targetLines);
      }
    }
    
    return this.customExecution(lines);
  }
}

/**
 * DoWhile — цикл с постусловием (выполняется минимум 1 раз)
 */
export class DoWhileNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['DoWhile'];
  
  generate(
    node: BlueprintNode,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    const lines: string[] = [];
    
    const conditionExpr = helpers.getInputExpression(node, 'condition') ?? 'true';
    
    lines.push(`${ind}do {`);
    
    helpers.pushIndent();
    const bodyNode = helpers.getExecutionTarget(node, 'loop-body');
    if (bodyNode) {
      const bodyLines = helpers.generateFromNode(bodyNode);
      lines.push(...bodyLines);
    }
    helpers.popIndent();
    
    lines.push(`${ind}} while (${conditionExpr});`);
    
    // После цикла
    const completedNode = helpers.getExecutionTarget(node, 'completed');
    if (completedNode) {
      const completedLines = helpers.generateFromNode(completedNode);
      lines.push(...completedLines);
    }
    
    return this.customExecution(lines);
  }
}

/**
 * ForEach — итерация по элементам массива
 */
export class ForEachNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['ForEach'];
  
  generate(
    node: BlueprintNode,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    const lines: string[] = [];
    
    const arrayExpr = helpers.getInputExpression(node, 'array') ?? 'items';
    
    // Генерируем уникальные имена переменных
    const suffix = node.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6);
    const indexVar = `i_${suffix}`;
    const elemVar = `elem_${suffix}`;
    
    // Range-based for с индексом через счётчик
    lines.push(`${ind}int ${indexVar} = 0;`);
    lines.push(`${ind}for (const auto& ${elemVar} : ${arrayExpr}) {`);
    
    helpers.pushIndent();
    
    // Регистрируем переменные
    helpers.declareVariable(`${node.id}-element`, elemVar, 'Element', 'auto', node.id);
    helpers.declareVariable(`${node.id}-index`, indexVar, 'Index', 'int', node.id);
    
    const bodyNode = helpers.getExecutionTarget(node, 'loop-body');
    if (bodyNode) {
      const bodyLines = helpers.generateFromNode(bodyNode);
      lines.push(...bodyLines);
    }
    
    lines.push(`${helpers.indent()}${indexVar}++;`);
    helpers.popIndent();
    
    lines.push(`${ind}}`);
    
    // После цикла
    const completedNode = helpers.getExecutionTarget(node, 'completed');
    if (completedNode) {
      const completedLines = helpers.generateFromNode(completedNode);
      lines.push(...completedLines);
    }
    
    return this.customExecution(lines);
  }
  
  getOutputExpression(
    node: BlueprintNode,
    portId: string,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): string {
    if (portId.includes('element')) {
      const varInfo = helpers.getVariable(`${node.id}-element`);
      return varInfo?.codeName ?? 'elem';
    }
    if (portId.includes('index')) {
      const varInfo = helpers.getVariable(`${node.id}-index`);
      return varInfo?.codeName ?? 'i';
    }
    return '0';
  }
}

/**
 * Switch — множественный выбор по значению
 */
export class SwitchNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Switch'];
  
  generate(
    node: BlueprintNode,
    context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    const lines: string[] = [];
    
    const switchInitExpr = resolveSwitchInitExpression(node);
    const switchInitIdentifier = switchInitExpr
      ? extractDeclaredIdentifierFromSwitchInit(switchInitExpr)
      : null;
    let selectionExpr = resolveSwitchSelectionExpression(node, helpers);

    // Если включён `switch(init; expr)` и пользователь не подключил вход выбора,
    // по умолчанию переключаемся по объявленной переменной из init (например `k`),
    // иначе получаем "switch (int k{2}; 0)" из defaultValue.
    if (switchInitExpr && switchInitIdentifier) {
      const selectionPort = resolveSwitchSelectionInputPort(node);
      const hasExplicitSelectionValue = selectionPort?.value !== undefined;
      const hasSelectionEdge = selectionPort
        ? hasIncomingEdgeToPort(node, context, selectionPort.id)
        : false;

      if (!hasExplicitSelectionValue && !hasSelectionEdge) {
        selectionExpr = switchInitIdentifier;
      }
    }

    const switchInitUsedInSelection = switchInitIdentifier
      ? containsIdentifier(selectionExpr, switchInitIdentifier)
      : false;
    let switchInitUsedInBranches = false;
    
    lines.push(`${ind}switch (${switchInitExpr ? `${switchInitExpr}; ${selectionExpr}` : selectionExpr}) {`);
    
    // Найти case-выходы и их значения (из port.defaultValue или суффикса id)
    const casePorts = node.outputs
      .filter((port) => isSwitchCasePort(port))
      .map((port) => ({
        port,
        caseValue: resolveSwitchCaseValue(port),
      }))
      .sort((a, b) => {
        if (a.caseValue !== b.caseValue) {
          return a.caseValue - b.caseValue;
        }
        return a.port.id.localeCompare(b.port.id);
      });

    const uniqueCaseEntries: Array<{ portId: string; caseValue: number; targetNode: BlueprintNode | null }> = [];
    const usedCaseValues = new Set<number>();
    for (const { port, caseValue } of casePorts) {
      if (usedCaseValues.has(caseValue)) {
        helpers.addWarning(
          node.id,
          CodeGenWarningCode.EMPTY_BRANCH,
          `Дублирующийся case ${caseValue} в Switch "${node.label}". Ветка пропущена.`
        );
        continue;
      }

      usedCaseValues.add(caseValue);
      uniqueCaseEntries.push({
        portId: port.id,
        caseValue,
        targetNode: helpers.getExecutionTarget(node, port.id),
      });
    }

    const groupedCaseMap = new Map<
      string,
      { targetNode: BlueprintNode | null; caseValues: number[]; firstCaseValue: number }
    >();
    for (const entry of uniqueCaseEntries) {
      const key = entry.targetNode ? `target:${entry.targetNode.id}` : `port:${entry.portId}`;
      const existing = groupedCaseMap.get(key);
      if (!existing) {
        groupedCaseMap.set(key, {
          targetNode: entry.targetNode,
          caseValues: [entry.caseValue],
          firstCaseValue: entry.caseValue,
        });
        continue;
      }

      existing.caseValues.push(entry.caseValue);
      if (entry.caseValue < existing.firstCaseValue) {
        existing.firstCaseValue = entry.caseValue;
      }
    }
    const groupedCases = Array.from(groupedCaseMap.values()).sort(
      (a, b) => a.firstCaseValue - b.firstCaseValue
    );

    const caseTargets = groupedCases
      .map((group) => group.targetNode)
      .filter((target): target is BlueprintNode => Boolean(target));
    const defaultNode = helpers.getExecutionTarget(node, 'default');
    const branchTargetById = new Map<string, BlueprintNode>();
    for (const target of caseTargets) {
      branchTargetById.set(target.id, target);
    }
    if (defaultNode) {
      branchTargetById.set(defaultNode.id, defaultNode);
    }
    const branchTargets = Array.from(branchTargetById.values());
    const mergeNodeId = branchTargets.length > 1
      ? findExecutionMergeNodeId(
          context,
          branchTargets.map((target) => target.id),
          new Set<string>([node.id])
        )
      : null;
    const mergeNode = mergeNodeId
      ? context.graph.nodes.find((candidate) => candidate.id === mergeNodeId) ?? null
      : null;
    const shouldMaskMergeNode =
      mergeNodeId !== null &&
      mergeNode !== null &&
      !context.processedNodes.has(mergeNodeId);
    if (shouldMaskMergeNode && mergeNodeId) {
      context.processedNodes.add(mergeNodeId);
    }
    
    for (const groupedCase of groupedCases) {
      for (const caseValue of groupedCase.caseValues.sort((a, b) => a - b)) {
        lines.push(`${ind}case ${caseValue}:`);
      }

      helpers.pushIndent();
      lines.push(`${helpers.indent()}{`);
      helpers.pushIndent();

      if (groupedCase.targetNode) {
        const targetLines = helpers.generateFromNode(groupedCase.targetNode);
        if (switchInitIdentifier && !switchInitUsedInBranches) {
          switchInitUsedInBranches = targetLines.some((line) =>
            containsIdentifier(line, switchInitIdentifier)
          );
        }
        lines.push(...targetLines);
      }
      lines.push(`${helpers.indent()}break;`);

      helpers.popIndent();
      lines.push(`${helpers.indent()}}`);
      helpers.popIndent();
    }
    
    // Default ветка
    lines.push(`${ind}default:`);
    helpers.pushIndent();
    lines.push(`${helpers.indent()}{`);
    helpers.pushIndent();
    if (defaultNode) {
      const defaultLines = helpers.generateFromNode(defaultNode);
      if (switchInitIdentifier && !switchInitUsedInBranches) {
        switchInitUsedInBranches = defaultLines.some((line) =>
          containsIdentifier(line, switchInitIdentifier)
        );
      }
      lines.push(...defaultLines);
    }
    lines.push(`${helpers.indent()}break;`);
    helpers.popIndent();
    lines.push(`${helpers.indent()}}`);
    helpers.popIndent();
    
    lines.push(`${ind}}`);

    if (shouldMaskMergeNode && mergeNodeId) {
      context.processedNodes.delete(mergeNodeId);
    }

    if (mergeNode) {
      const mergeLines = helpers.generateFromNode(mergeNode);
      lines.push(...mergeLines);
    }

    if (
      switchInitIdentifier &&
      !switchInitUsedInSelection &&
      !switchInitUsedInBranches
    ) {
      helpers.addWarning(
        node.id,
        CodeGenWarningCode.UNUSED_SWITCH_INIT,
        `Переменная "${switchInitIdentifier}" из switch(init; expr) не используется.`
      );
    }
    
    return this.customExecution(lines);
  }
}

/**
 * Break — выход из цикла
 */
export class BreakNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Break'];
  
  generate(
    _node: BlueprintNode,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    return this.code([`${ind}break;`], false);
  }
}

/**
 * Continue — переход к следующей итерации
 */
export class ContinueNodeGenerator extends BaseNodeGenerator {
  readonly nodeTypes: BlueprintNodeType[] = ['Continue'];
  
  generate(
    _node: BlueprintNode,
    _context: CodeGenContext,
    helpers: GeneratorHelpers
  ): NodeGenerationResult {
    const ind = helpers.indent();
    return this.code([`${ind}continue;`], false);
  }
}

/**
 * Фабричная функция для создания всех Control Flow генераторов
 */
export function createControlFlowGenerators(): BaseNodeGenerator[] {
  return [
    new StartNodeGenerator(),
    new EndNodeGenerator(),
    new BranchNodeGenerator(),
    new ForLoopNodeGenerator(),
    new WhileLoopNodeGenerator(),
    new DoWhileNodeGenerator(),
    new ForEachNodeGenerator(),
    new SwitchNodeGenerator(),
    new BreakNodeGenerator(),
    new ContinueNodeGenerator(),
    new SequenceNodeGenerator(),
  ];
}
