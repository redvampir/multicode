import { describe, expect, it } from 'vitest';
import { createRegistryWithPackages } from './index';
import { TemplateNodeGenerator, type NodeDefinitionGetter } from './template';

describe('createRegistryWithPackages', () => {
  it('позволяет package template переопределить стандартный генератор', () => {
    const getter: NodeDefinitionGetter = (nodeType: string) => {
      if (nodeType === 'Print') {
        return {
          type: 'Print',
          label: 'Print',
          labelRu: 'Вывод',
          category: 'io',
          inputs: [],
          outputs: [],
          _codegen: {
            cpp: {
              template: 'std::cout << "from package" << std::endl;',
            },
          },
        };
      }
      return undefined;
    };

    const registry = createRegistryWithPackages(getter, ['Print']);
    const generator = registry.get('Print');

    expect(generator).toBeInstanceOf(TemplateNodeGenerator);
  });

  it('сохраняет стандартный генератор, если пакет не задаёт шаблон', () => {
    const getter: NodeDefinitionGetter = () => undefined;

    const registry = createRegistryWithPackages(getter, []);
    const generator = registry.get('Input');

    expect(generator).toBeDefined();
    expect(generator).not.toBeInstanceOf(TemplateNodeGenerator);
  });
});
