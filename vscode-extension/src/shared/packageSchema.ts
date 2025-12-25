/**
 * Zod-схемы для валидации пакетов MultiCode
 * Соответствуют JSON Schema из schemas/multicode-package.schema.json
 */

import { z } from 'zod';

// ============================================
// Базовые типы
// ============================================

/** Типы данных портов */
export const PortDataTypeSchema = z.enum([
  'execution',
  'bool',
  'int32',
  'int64',
  'float',
  'double',
  'string',
  'vector',
  'object',
  'array',
  'any',
]);

export type PortDataType = z.infer<typeof PortDataTypeSchema>;

/** Категории узлов */
export const NodeCategorySchema = z.enum([
  'flow',
  'function',
  'variable',
  'math',
  'comparison',
  'logic',
  'io',
  'string',
  'array',
  'object',
  'other',
]);

export type NodeCategory = z.infer<typeof NodeCategorySchema>;

// ============================================
// Порты
// ============================================

/** Определение порта */
export const PortDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Port ID must be kebab-case'),
  name: z.string(),
  nameRu: z.string().optional(),
  dataType: PortDataTypeSchema,
  typeName: z.string().optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  hidden: z.boolean().default(false),
  multi: z.boolean().default(false),
});

export type PortDefinition = z.infer<typeof PortDefinitionSchema>;

// ============================================
// Свойства узла
// ============================================

/** Вариант enum-свойства */
export const PropertyEnumOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  labelRu: z.string().optional(),
});

/** Определение свойства узла */
export const PropertyDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z][a-zA-Z0-9]*$/, 'Property ID must be camelCase'),
  name: z.string(),
  nameRu: z.string().optional(),
  type: z.enum(['string', 'number', 'boolean', 'enum', 'color', 'code']),
  default: z.any().optional(),
  enum: z.array(PropertyEnumOptionSchema).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  multiline: z.boolean().optional(),
  language: z.string().optional(),
});

export type PropertyDefinition = z.infer<typeof PropertyDefinitionSchema>;

// ============================================
// Кодогенерация
// ============================================

/** Шаблон кодогенерации для одного языка */
export const CodegenTargetSchema = z.object({
  template: z.string(),
  includes: z.array(z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
  before: z.string().optional(),
  after: z.string().optional(),
  wrapBody: z.boolean().default(false),
});

export type CodegenTarget = z.infer<typeof CodegenTargetSchema>;

/** Шаблоны кодогенерации для всех языков */
export const CodegenSchema = z.object({
  cpp: CodegenTargetSchema.optional(),
  rust: CodegenTargetSchema.optional(),
  python: CodegenTargetSchema.optional(),
});

export type Codegen = z.infer<typeof CodegenSchema>;

// ============================================
// Определение узла
// ============================================

/** Полное определение узла */
export const NodeDefinitionSchema = z.object({
  type: z.string().regex(/^[A-Z][a-zA-Z0-9]*$/, 'Node type must be PascalCase'),
  label: z.string().min(1),
  labelRu: z.string().min(1),
  category: NodeCategorySchema,
  description: z.string().optional(),
  descriptionRu: z.string().optional(),
  headerColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  icon: z.string().optional(),
  dynamicPorts: z.boolean().default(false),
  deprecated: z.boolean().default(false),
  deprecatedMessage: z.string().optional(),
  inputs: z.array(PortDefinitionSchema),
  outputs: z.array(PortDefinitionSchema),
  properties: z.array(PropertyDefinitionSchema).optional(),
  codegen: CodegenSchema.optional(),
});

export type NodeDefinition = z.infer<typeof NodeDefinitionSchema>;

// ============================================
// Категория пакета
// ============================================

/** Пользовательская категория */
export const PackageCategorySchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  label: z.string(),
  labelRu: z.string(),
  icon: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  parent: z.string().optional(),
});

export type PackageCategory = z.infer<typeof PackageCategorySchema>;

// ============================================
// Пользовательский тип порта
// ============================================

/** Пользовательский тип порта */
export const CustomPortTypeSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string(),
  nameRu: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  icon: z.string().optional(),
  compatibleWith: z.array(z.string()).optional(),
  cppType: z.string().optional(),
  rustType: z.string().optional(),
});

export type CustomPortType = z.infer<typeof CustomPortTypeSchema>;

// ============================================
// Сниппет
// ============================================

/** Сниппет (шаблон графа) */
export const SnippetSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameRu: z.string().optional(),
  description: z.string().optional(),
  descriptionRu: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  graph: z.object({}).passthrough(), // Граф - произвольный объект
});

export type Snippet = z.infer<typeof SnippetSchema>;

// ============================================
// Тема
// ============================================

/** Цветовая тема */
export const ThemeSchema = z.object({
  id: z.string(),
  name: z.string(),
  colors: z.record(z.string().regex(/^#[0-9A-Fa-f]{6}$/)),
});

export type Theme = z.infer<typeof ThemeSchema>;

// ============================================
// Contributes (дополнительные вклады)
// ============================================

export const ContributesSchema = z.object({
  portTypes: z.array(CustomPortTypeSchema).optional(),
  themes: z.array(ThemeSchema).optional(),
  snippets: z.array(SnippetSchema).optional(),
});

export type Contributes = z.infer<typeof ContributesSchema>;

// ============================================
// Автор пакета
// ============================================

export const AuthorSchema = z.union([
  z.string(),
  z.object({
    name: z.string(),
    email: z.string().email().optional(),
    url: z.string().url().optional(),
  }),
]);

export type Author = z.infer<typeof AuthorSchema>;

// ============================================
// Репозиторий
// ============================================

export const RepositorySchema = z.union([
  z.string().url(),
  z.object({
    type: z.enum(['git', 'svn', 'mercurial']),
    url: z.string().url(),
    directory: z.string().optional(),
  }),
]);

export type Repository = z.infer<typeof RepositorySchema>;

// ============================================
// Полный пакет
// ============================================

/** Манифест пакета MultiCode */
export const PackageManifestSchema = z.object({
  $schema: z.string().optional(),
  name: z.string().regex(/^@?[a-z][a-z0-9-]*(\/[a-z][a-z0-9-]*)?$/, 'Package name must be npm-style'),
  version: z.string().regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/, 'Version must be SemVer'),
  displayName: z.string().min(1),
  displayNameRu: z.string().optional(),
  description: z.string().optional(),
  descriptionRu: z.string().optional(),
  author: AuthorSchema.optional(),
  license: z.string().optional(),
  homepage: z.string().url().optional(),
  repository: RepositorySchema.optional(),
  bugs: z.union([
    z.string().url(),
    z.object({
      url: z.string().url().optional(),
      email: z.string().email().optional(),
    }),
  ]).optional(),
  keywords: z.array(z.string()).optional(),
  engines: z.object({
    multicode: z.string().optional(),
    vscode: z.string().optional(),
  }).optional(),
  dependencies: z.record(z.string()).optional(),
  categories: z.array(PackageCategorySchema).optional(),
  nodes: z.array(NodeDefinitionSchema).min(1),
  contributes: ContributesSchema.optional(),
});

export type PackageManifest = z.infer<typeof PackageManifestSchema>;

// ============================================
// Хелперы валидации
// ============================================

/**
 * Валидировать манифест пакета
 * @throws ZodError при невалидных данных
 */
export function validatePackageManifest(data: unknown): PackageManifest {
  return PackageManifestSchema.parse(data);
}

/**
 * Безопасная валидация манифеста
 * @returns Result с данными или ошибками
 */
export function safeValidatePackageManifest(data: unknown): {
  success: boolean;
  data?: PackageManifest;
  errors?: z.ZodError;
} {
  const result = PackageManifestSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

/**
 * Валидировать определение узла
 */
export function validateNodeDefinition(data: unknown): NodeDefinition {
  return NodeDefinitionSchema.parse(data);
}
