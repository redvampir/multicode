import type { BlueprintGraphState } from '../../shared/blueprintTypes';
import { toValidIdentifier } from '../types';
import { buildClassModelFromGraph } from '../model/classModel';

const toUeIdentifier = (name: string): string => {
  const sanitized = toValidIdentifier(name).replace(/^[a-z]/, (ch) => ch.toUpperCase());
  return sanitized.length > 0 ? sanitized : 'MulticodeGraph';
};

export interface UeMacroLayout {
  className: string;
  generatedHeaderName: string;
  classMacro: string;
  generatedBodyMacro: string;
  executeMethodMacro: string;
}

export class UeMacroStrategy {
  resolve(graph: BlueprintGraphState): UeMacroLayout {
    const classes = buildClassModelFromGraph(graph, 'ue');
    const graphBaseName = toUeIdentifier(graph.name);
    const className = classes[0]?.name?.trim().length
      ? `U${toUeIdentifier(classes[0].name)}Generated`
      : `U${graphBaseName}Generated`;
    const generatedHeaderName = `${graphBaseName}Generated.generated.h`;
    const ueMeta = classes[0]?.extensions?.ue;

    return {
      className,
      generatedHeaderName,
      classMacro: ueMeta?.classMacro ?? 'UCLASS(BlueprintType)',
      generatedBodyMacro: ueMeta?.generatedBodyMacro ?? 'GENERATED_BODY()',
      executeMethodMacro: 'UFUNCTION(BlueprintCallable, Category = "MultiCode")',
    };
  }
}
