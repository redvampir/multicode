// Сгенерировано MultiCode (target: ue)
// Граф: TargetMatrixGraph
#pragma once
#include "CoreMinimal.h"
#include "UObject/NoExportTypes.h"
#include <iostream>
#include "TargetmatrixgraphGenerated.generated.h"

UCLASS(BlueprintType)
class UPlayerstateGenerated : public UObject {
    GENERATED_BODY()
public:
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "MultiCode")
    int health;
    UFUNCTION(BlueprintCallable, Category = "MultiCode")
    int gethealth();
    UFUNCTION(BlueprintCallable, Category = "MultiCode")
    void ExecuteGraph();
};

int UPlayerstateGenerated::gethealth() {
    return 0;
}

void UPlayerstateGenerated::ExecuteGraph() {
    // Начало
    // Вывод
    std::cout << "Hello UE" << std::endl;
}
