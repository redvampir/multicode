import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  NODE_CATEGORIES,
  NodeCategorySchema,
  PORT_DATA_TYPES,
  PortDataTypeSchema,
} from './dataTypeCategoryRegistry';
import { blueprintClassMemberSchema } from './messages';
import {
  NodeCategorySchema as PackageNodeCategorySchema,
  PortDataTypeSchema as PackagePortDataTypeSchema,
} from './packageSchema';

type NodeSchema = {
  properties?: { category?: { enum?: string[] } };
  $defs?: { port?: { properties?: { dataType?: { enum?: string[] } } } };
};

type PackageSchema = {
  properties?: { nodes?: { items?: { $ref?: string } } };
};

const readJson = <T>(relativePath: string): T => {
  const schemaPath = resolve(__dirname, `../../../${relativePath}`);
  return JSON.parse(readFileSync(schemaPath, 'utf-8')) as T;
};

describe('dataType/category contract consistency', () => {
  it('синхронизирует единый реестр и Zod-схемы пакета', () => {
    expect(PackagePortDataTypeSchema.options).toEqual([...PORT_DATA_TYPES]);
    expect(PackageNodeCategorySchema.options).toEqual([...NODE_CATEGORIES]);
  });

  it('синхронизирует Zod-схемы IPC с единым реестром', () => {
    const memberDataType = blueprintClassMemberSchema.shape.dataType;

    expect(PortDataTypeSchema.options).toEqual([...PORT_DATA_TYPES]);
    expect(NodeCategorySchema.options).toEqual([...NODE_CATEGORIES]);
    expect(memberDataType).toBe(PortDataTypeSchema);
  });

  it('валидирует JSON Schema в schemas/ против единого реестра', () => {
    const nodeSchema = readJson<NodeSchema>('schemas/node.schema.json');
    const packageSchema = readJson<PackageSchema>('schemas/multicode-package.schema.json');

    expect(nodeSchema.properties?.category?.enum).toEqual([...NODE_CATEGORIES]);
    expect(nodeSchema.$defs?.port?.properties?.dataType?.enum).toEqual([...PORT_DATA_TYPES]);
    expect(packageSchema.properties?.nodes?.items?.$ref).toBe('node.schema.json');
  });

  it('явно покрывает UE-типы pointer/class/object-reference в schema и zod', () => {
    const nodeSchema = readJson<NodeSchema>('schemas/node.schema.json');
    const schemaDataTypes = nodeSchema.$defs?.port?.properties?.dataType?.enum ?? [];
    const schemaCategories = nodeSchema.properties?.category?.enum ?? [];

    expect(schemaDataTypes).toEqual(expect.arrayContaining(['pointer', 'class', 'object-reference']));
    expect(PortDataTypeSchema.options).toEqual(expect.arrayContaining(['pointer', 'class', 'object-reference']));
    expect(schemaCategories).toEqual(expect.arrayContaining(['pointer', 'class', 'collection']));
    expect(NodeCategorySchema.options).toEqual(expect.arrayContaining(['pointer', 'class', 'collection']));
  });
});
