// Сгенерировано MultiCode (target: ue)
// Граф: TargetMatrixGraph
#pragma once
#include "CoreMinimal.h"
#include "UObject/NoExportTypes.h"
#include "TargetmatrixgraphGenerated.generated.h"

UCLASS(BlueprintType)
class UTargetmatrixgraphGenerated : public UObject {
    GENERATED_BODY()
public:
    UFUNCTION(BlueprintCallable, Category = "MultiCode")
    void ExecuteGraph();
};

void UTargetmatrixgraphGenerated::ExecuteGraph() {
    // Начало
    // Вывод
    std::cout << "Hello UE" << std::endl;
}
