import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NodeCategorySchema, PortDataTypeSchema } from './packageSchema';
import { NODE_CATEGORIES, PORT_DATA_TYPES } from './portTypeContract';

type NodeSchema = {
  properties?: { category?: { enum?: string[] } };
  $defs?: { port?: { properties?: { dataType?: { enum?: string[] } } } };
};

const readNodeSchema = (): NodeSchema => {
  const schemaPath = resolve(__dirname, '../../../schemas/node.schema.json');
  return JSON.parse(readFileSync(schemaPath, 'utf-8')) as NodeSchema;
};

describe('portTypeContract consistency', () => {
  it('синхронизирует TS контракт и Zod для dataType/category', () => {
    expect(PortDataTypeSchema.options).toEqual([...PORT_DATA_TYPES]);
    expect(NodeCategorySchema.options).toEqual([...NODE_CATEGORIES]);
  });

  it('синхронизирует JSON Schema и TS контракт для dataType/category', () => {
    const nodeSchema = readNodeSchema();

    expect(nodeSchema.properties?.category?.enum).toEqual([...NODE_CATEGORIES]);
    expect(nodeSchema.$defs?.port?.properties?.dataType?.enum).toEqual([...PORT_DATA_TYPES]);
  });

  it('явно покрывает UE-типы pointer/class/object-reference в schema и zod', () => {
    const nodeSchema = readNodeSchema();
    const schemaDataTypes = nodeSchema.$defs?.port?.properties?.dataType?.enum ?? [];
    const schemaCategories = nodeSchema.properties?.category?.enum ?? [];

    expect(schemaDataTypes).toEqual(expect.arrayContaining(['pointer', 'class', 'object-reference']));
    expect(PortDataTypeSchema.options).toEqual(expect.arrayContaining(['pointer', 'class', 'object-reference']));
    expect(schemaCategories).toEqual(expect.arrayContaining(['pointer', 'class', 'collection']));
    expect(NodeCategorySchema.options).toEqual(expect.arrayContaining(['pointer', 'class', 'collection']));
  });
});
