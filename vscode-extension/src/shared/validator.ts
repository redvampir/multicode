import type { GraphEdge, GraphEdgeKind, GraphState } from './graphState';
import type { ValidationIssue, ValidationResult } from './messages';

export type { ValidationIssue, ValidationResult } from './messages';

export const validateGraphState = (state: GraphState): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const issues: ValidationIssue[] = [];

  const pushIssue = (
    severity: ValidationIssue['severity'],
    message: string,
    targets?: { nodes?: string[]; edges?: string[] }
  ): void => {
    if (severity === 'error') {
      errors.push(message);
    } else {
      warnings.push(message);
    }
    issues.push({
      severity,
      message,
      nodes: targets?.nodes,
      edges: targets?.edges
    });
  };

  if (!state.nodes.length) {
    const message = 'Graph must contain at least one node.';
    return {
      ok: false,
      errors: [message],
      warnings,
      issues: [{ severity: 'error', message }]
    };
  }

  const startNodes = state.nodes.filter((node) => node.type === 'Start');
  if (startNodes.length === 0) {
    pushIssue('error', 'Graph must contain a Start node.');
  } else if (startNodes.length > 1) {
    pushIssue(
      'error',
      'Only one Start node is allowed.',
      startNodes.length ? { nodes: startNodes.map((node) => node.id) } : undefined
    );
  }

  const endNodes = state.nodes.filter((node) => node.type === 'End');
  if (!endNodes.length) {
    pushIssue('error', 'Graph must contain at least one End node.');
  }

  const nodeMap = new Map(state.nodes.map((node) => [node.id, node]));
  const executionEdges: GraphEdge[] = [];
  const dataEdges: GraphEdge[] = [];

  state.edges.forEach((edge, index) => {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) {
      pushIssue('error', `Edge #${index + 1} references missing nodes.`, { edges: [edge.id] });
      return;
    }

    if (edge.source === edge.target) {
      pushIssue('error', `Edge ${edge.id} creates a self-loop.`, { edges: [edge.id] });
      return;
    }

    const kind: GraphEdgeKind = edge.kind ?? 'execution';
    if (kind === 'execution') {
      executionEdges.push(edge);
      if (source.type === 'End') {
        pushIssue(
          'error',
          `Execution edge ${edge.source} -> ${edge.target} cannot start from End node "${source.label}".`,
          { edges: [edge.id], nodes: [source.id] }
        );
      }
      if (target.type === 'Start') {
        pushIssue(
          'error',
          `Execution edge ${edge.source} -> ${edge.target} cannot target Start node "${target.label}".`,
          { edges: [edge.id], nodes: [target.id] }
        );
      }
    } else {
      dataEdges.push(edge);
      if (source.type === 'Start' || target.type === 'Start') {
        pushIssue(
          'error',
          `Data edge ${edge.source} -> ${edge.target} cannot involve Start nodes.`,
          { edges: [edge.id], nodes: [source.id, target.id] }
        );
      }
      if (source.type === 'End') {
        pushIssue(
          'error',
          `Data edge ${edge.source} -> ${edge.target} cannot originate from End nodes.`,
          { edges: [edge.id], nodes: [source.id] }
        );
      }
    }
  });

  if (state.nodes.length > 1 && !executionEdges.length) {
    pushIssue('error', 'Graph does not contain execution flow connections.');
  }

  const seenEdges = new Set<string>();
  state.edges.forEach((edge) => {
    const signature = `${edge.source}->${edge.target}:${edge.kind ?? 'execution'}`;
    if (seenEdges.has(signature)) {
      pushIssue(
        'warning',
        `Duplicate edge ${edge.source} -> ${edge.target} (${edge.kind ?? 'execution'}).`,
        { edges: [edge.id] }
      );
    } else {
      seenEdges.add(signature);
    }
  });

  const startNode = startNodes.length === 1 ? startNodes[0] : null;
  if (startNode) {
    const incomingStart = executionEdges.some((edge) => edge.target === startNode.id);
    if (incomingStart) {
      pushIssue('error', 'Start node cannot have incoming execution edges.', { nodes: [startNode.id] });
    }
    const outgoingStart = executionEdges.filter((edge) => edge.source === startNode.id).length;
    if (!outgoingStart) {
      pushIssue('warning', 'Start node has no outgoing execution edges.', { nodes: [startNode.id] });
    }
  }

  if (endNodes.length) {
    endNodes.forEach((node) => {
      const outgoing = executionEdges.some((edge) => edge.source === node.id);
      if (outgoing) {
        pushIssue('error', `End node "${node.label}" cannot have outgoing execution edges.`, {
          nodes: [node.id]
        });
      }
      const incoming = executionEdges.some((edge) => edge.target === node.id);
      if (!incoming) {
        pushIssue('warning', `End node "${node.label}" has no incoming execution edges.`, {
          nodes: [node.id]
        });
      }
    });
  }

  if (startNode && executionEdges.length) {
    const reachable = traverse(startNode.id, state);
    const unreachable = state.nodes.filter(
      (node) => node.type !== 'Start' && !reachable.has(node.id)
    );
    if (unreachable.length) {
      pushIssue(
        'error',
        `Unreachable nodes: ${unreachable.map((node) => node.label).join(', ')}.`,
        { nodes: unreachable.map((node) => node.id) }
      );
    }
  }

  const cycle = detectCycle(state);
  if (cycle) {
    pushIssue('error', `Execution cycle detected: ${cycle.join(' -> ')}`, { nodes: cycle });
  }

  dataEdges.forEach((edge) => {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) {
      return;
    }
    if (source.type === 'Variable' && target.type === 'Variable') {
      pushIssue(
        'warning',
        `Data edge ${edge.source} -> ${edge.target} connects two Variable nodes.`,
        { edges: [edge.id], nodes: [source.id, target.id] }
      );
    }
  });

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    issues
  };
};

const traverse = (startId: string, state: GraphState): Set<string> => {
  const visited = new Set<string>();
  const queue: string[] = [startId];

  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    state.edges
      .filter((edge) => (edge.kind ?? 'execution') === 'execution' && edge.source === current)
      .forEach((edge) => queue.push(edge.target));
  }

  return visited;
};

const detectCycle = (state: GraphState): string[] | null => {
  const adjacency = new Map<string, string[]>();
  state.edges
    .filter((edge) => (edge.kind ?? 'execution') === 'execution')
    .forEach((edge) => {
      const list = adjacency.get(edge.source) ?? [];
      list.push(edge.target);
      adjacency.set(edge.source, list);
    });

  const visited = new Set<string>();
  const stack = new Set<string>();

  const dfs = (nodeId: string, path: string[]): string[] | null => {
    if (stack.has(nodeId)) {
      const cycleStart = path.indexOf(nodeId);
      return [...path.slice(cycleStart), nodeId];
    }
    if (visited.has(nodeId)) {
      return null;
    }
    visited.add(nodeId);
    stack.add(nodeId);
    const neighbors = adjacency.get(nodeId) ?? [];
    for (const next of neighbors) {
      const cycle = dfs(next, [...path, nodeId]);
      if (cycle) {
        return cycle;
      }
    }
    stack.delete(nodeId);
    return null;
  };

  for (const node of state.nodes) {
    const cycle = dfs(node.id, []);
    if (cycle) {
      return cycle;
    }
  }
  return null;
};
