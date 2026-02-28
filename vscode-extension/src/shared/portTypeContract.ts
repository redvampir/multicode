/**
 * Единый контракт типовой системы портов и категорий узлов.
 * Этот модуль является source of truth для TS-типов, Zod и JSON Schema.
 */

export const PORT_DATA_TYPES = [
  'execution',
  'bool',
  'int32',
  'int64',
  'float',
  'double',
  'string',
  'vector',
  'pointer',
  'class',
  'object-reference',
  'array',
  'any',
] as const;

export type PortDataType = (typeof PORT_DATA_TYPES)[number];

export const NODE_CATEGORIES = [
  'flow',
  'function',
  'variable',
  'math',
  'comparison',
  'logic',
  'io',
  'string',
  'array',
  'pointer',
  'class',
  'collection',
  'other',
] as const;

export type NodeCategory = (typeof NODE_CATEGORIES)[number];

const PORT_DATA_TYPE_SET = new Set<string>(PORT_DATA_TYPES);
const NODE_CATEGORY_SET = new Set<string>(NODE_CATEGORIES);

export const isPortDataType = (value: unknown): value is PortDataType =>
  typeof value === 'string' && PORT_DATA_TYPE_SET.has(value);

export const isNodeCategory = (value: unknown): value is NodeCategory =>
  typeof value === 'string' && NODE_CATEGORY_SET.has(value);
