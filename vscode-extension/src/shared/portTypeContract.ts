/**
 * Совместимость со старыми импортами.
 * Source of truth перенесён в dataTypeCategoryRegistry.ts.
 */
export {
  NODE_CATEGORIES,
  NodeCategorySchema,
  PORT_DATA_TYPES,
  PortDataTypeSchema,
  isNodeCategory,
  isPortDataType,
} from './dataTypeCategoryRegistry';

export type { NodeCategory, PortDataType } from './dataTypeCategoryRegistry';
