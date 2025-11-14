import type { GraphEdge, GraphEdgeKind, GraphState } from './graphState';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export const validateGraphState = (state: GraphState): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!state.nodes.length) {
    return {
      ok: false,
      errors: ['Graph must contain at least one node.'],
      warnings
    };
  }

  const startNodes = state.nodes.filter((node) => node.type === 'Start');
  if (startNodes.length === 0) {
    errors.push('Graph must contain a Start node.');
  } else if (startNodes.length > 1) {
    errors.push('Only one Start node is allowed.');
  }

  const endNodes = state.nodes.filter((node) => node.type === 'End');
  if (!endNodes.length) {
    errors.push('Graph must contain at least one End node.');
  }

  const nodeMap = new Map(state.nodes.map((node) => [node.id, node]));
  const executionEdges: GraphEdge[] = [];
  const dataEdges: GraphEdge[] = [];

  state.edges.forEach((edge, index) => {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) {
      errors.push(`Edge #${index + 1} references missing nodes.`);
      return;
    }

    if (edge.source === edge.target) {
      errors.push(`Edge ${edge.id} creates a self-loop.`);
      return;
    }

    const kind: GraphEdgeKind = edge.kind ?? 'execution';
    if (kind === 'execution') {
      executionEdges.push(edge);
      if (source.type === 'End') {
        errors.push(
          `Execution edge ${edge.source} -> ${edge.target} cannot start from End node "${source.label}".`
        );
      }
      if (target.type === 'Start') {
        errors.push(
          `Execution edge ${edge.source} -> ${edge.target} cannot target Start node "${target.label}".`
        );
      }
    } else {
      dataEdges.push(edge);
      if (source.type === 'Start' || target.type === 'Start') {
        errors.push(`Data edge ${edge.source} -> ${edge.target} cannot involve Start nodes.`);
      }
      if (source.type === 'End') {
        errors.push(`Data edge ${edge.source} -> ${edge.target} cannot originate from End nodes.`);
      }
    }
  });

  if (state.nodes.length > 1 && !executionEdges.length) {
    errors.push('Graph does not contain execution flow connections.');
  }

  const seenEdges = new Set<string>();
  state.edges.forEach((edge) => {
    const signature = `${edge.source}->${edge.target}:${edge.kind ?? 'execution'}`;
    if (seenEdges.has(signature)) {
      warnings.push(`Duplicate edge ${edge.source} -> ${edge.target} (${edge.kind ?? 'execution'}).`);
    } else {
      seenEdges.add(signature);
    }
  });

  const startNode = startNodes.length === 1 ? startNodes[0] : null;
  if (startNode) {
    const incomingStart = executionEdges.some((edge) => edge.target === startNode.id);
    if (incomingStart) {
      errors.push('Start node cannot have incoming execution edges.');
    }
    const outgoingStart = executionEdges.filter((edge) => edge.source === startNode.id).length;
    if (!outgoingStart) {
      warnings.push('Start node has no outgoing execution edges.');
    }
  }

  if (endNodes.length) {
    endNodes.forEach((node) => {
      const outgoing = executionEdges.some((edge) => edge.source === node.id);
      if (outgoing) {
        errors.push(`End node "${node.label}" cannot have outgoing execution edges.`);
      }
      const incoming = executionEdges.some((edge) => edge.target === node.id);
      if (!incoming) {
        warnings.push(`End node "${node.label}" has no incoming execution edges.`);
      }
    });
  }

  if (startNode && executionEdges.length) {
    const reachable = traverse(startNode.id, state);
    const unreachable = state.nodes.filter(
      (node) => node.type !== 'Start' && !reachable.has(node.id)
    );
    if (unreachable.length) {
      errors.push(`Unreachable nodes: ${unreachable.map((node) => node.label).join(', ')}.`);
    }
  }

  const cycle = detectCycle(state);
  if (cycle) {
    errors.push(`Execution cycle detected: ${cycle.join(' -> ')}`);
  }

  dataEdges.forEach((edge) => {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) {
      return;
    }
    if (source.type === 'Variable' && target.type === 'Variable') {
      warnings.push(`Data edge ${edge.source} -> ${edge.target} connects two Variable nodes.`);
    }
  });

  return {
    ok: errors.length === 0,
    errors,
    warnings
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
