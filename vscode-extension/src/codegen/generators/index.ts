/**
 * Экспорт всех генераторов узлов
 */

// Базовые интерфейсы и классы
export {
  INodeGenerator,
  GeneratorHelpers,
  NodeGenerationResult,
  NodeGeneratorRegistry,
  BaseNodeGenerator,
  GeneratorCategory,
} from './base';

// Генераторы по категориям
export { createControlFlowGenerators } from './controlFlow';
export { createMathLogicGenerators } from './mathLogic';
export { createVariableGenerators } from './variables';
export { createIOGenerators } from './io';
export { createOtherGenerators } from './other';
export { createFunctionGenerators, FunctionEntryNodeGenerator, FunctionAwareContext } from './functions';

// Генератор на основе шаблонов из пакетов
export { 
  TemplateNodeGenerator, 
  createPackageGenerators,
  NodeDefinitionWithCodegen,
  NodeDefinitionGetter,
} from './template';

// Функция для создания реестра со всеми генераторами
import { NodeGeneratorRegistry } from './base';
import { createControlFlowGenerators } from './controlFlow';
import { createMathLogicGenerators } from './mathLogic';
import { createVariableGenerators } from './variables';
import { createIOGenerators } from './io';
import { createOtherGenerators } from './other';
import { createFunctionGenerators } from './functions';

/**
 * Создать реестр со всеми стандартными генераторами
 */
export function createDefaultRegistry(): NodeGeneratorRegistry {
  const registry = new NodeGeneratorRegistry();
  
  // Регистрируем все генераторы
  const allGenerators = [
    ...createControlFlowGenerators(),
    ...createMathLogicGenerators(),
    ...createVariableGenerators(),
    ...createIOGenerators(),
    ...createOtherGenerators(),
    ...createFunctionGenerators(),
  ];
  
  for (const generator of allGenerators) {
    registry.register(generator);
  }
  
  return registry;
}

import type { BlueprintNodeType } from '../../shared/blueprintTypes';
import { createPackageGenerators, NodeDefinitionGetter } from './template';

/**
 * Создать реестр с генераторами из пакетов
 * 
 * Приоритет: сначала шаблонные генераторы из пакетов, затем стандартные.
 * Это позволяет пакетам переопределять генераторы для стандартных узлов.
 * 
 * @param getNodeDefinition Функция для получения определения узла из реестра пакетов
 * @param packageNodeTypes Типы узлов из пакетов
 */
export function createRegistryWithPackages(
  getNodeDefinition: NodeDefinitionGetter,
  packageNodeTypes: BlueprintNodeType[]
): NodeGeneratorRegistry {
  const registry = new NodeGeneratorRegistry();
  
  // Сначала регистрируем стандартные генераторы
  const standardGenerators = [
    ...createControlFlowGenerators(),
    ...createMathLogicGenerators(),
    ...createVariableGenerators(),
    ...createIOGenerators(),
    ...createOtherGenerators(),
    ...createFunctionGenerators(),
  ];
  
  for (const generator of standardGenerators) {
    registry.register(generator);
  }
  
  // Затем генераторы из пакетов (перезаписывают стандартные при наличии шаблона)
  const packageGenerators = createPackageGenerators(getNodeDefinition, packageNodeTypes);
  
  for (const generator of packageGenerators) {
    registry.register(generator);
  }
  
  return registry;
}
