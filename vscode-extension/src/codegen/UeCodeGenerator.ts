import { CppCodeGenerator } from './CppCodeGenerator';
import type {
  CodeGenError,
  CodeGenerationResult,
  CodeGenOptions,
  ICodeGenerator,
} from './types';
import type { BlueprintGraphState, BlueprintNodeType } from '../shared/blueprintTypes';
import type { NodeDefinitionGetter } from './generators/template';
import { createRegistryWithPackages } from './generators';
import { UeCodegenStrategy } from './targets/ueStrategy';

export class UeCodeGenerator implements ICodeGenerator {
  private readonly cppGenerator: CppCodeGenerator;

  private readonly strategy: UeCodegenStrategy;

  constructor(cppGenerator?: CppCodeGenerator, strategy?: UeCodegenStrategy) {
    this.cppGenerator = cppGenerator ?? new CppCodeGenerator();
    this.strategy = strategy ?? new UeCodegenStrategy();
  }

  static withPackages(
    getNodeDefinition: NodeDefinitionGetter,
    packageNodeTypes: BlueprintNodeType[]
  ): UeCodeGenerator {
    const registry = createRegistryWithPackages(getNodeDefinition, packageNodeTypes, 'ue');
    return new UeCodeGenerator(new CppCodeGenerator(registry));
  }

  getLanguage() {
    return 'ue' as const;
  }

  getSupportedNodeTypes(): BlueprintNodeType[] {
    return this.cppGenerator.getSupportedNodeTypes();
  }

  canGenerate(graph: BlueprintGraphState): { canGenerate: boolean; errors: CodeGenError[] } {
    const baseValidation = this.cppGenerator.canGenerate(graph);
    const ueErrors = this.strategy.validate(graph);
    return {
      canGenerate: baseValidation.canGenerate && ueErrors.length === 0,
      errors: [...baseValidation.errors, ...ueErrors],
    };
  }

  generate(graph: BlueprintGraphState, options?: Partial<CodeGenOptions>): CodeGenerationResult {
    const validation = this.canGenerate(graph);
    if (!validation.canGenerate) {
      return {
        success: false,
        code: '',
        errors: validation.errors,
        warnings: [],
        sourceMap: [],
        stats: {
          nodesProcessed: 0,
          linesOfCode: 0,
          generationTimeMs: 0,
        },
      };
    }

    const cppResult = this.cppGenerator.generate(graph, {
      ...options,
      includeHeaders: false,
      generateMainWrapper: false,
      generateClassDeclarations: false,
    });

    if (!cppResult.success) {
      return cppResult;
    }

    const transformedCode = this.strategy.render(graph, cppResult.code);
    return {
      ...cppResult,
      code: transformedCode,
    };
  }
}
