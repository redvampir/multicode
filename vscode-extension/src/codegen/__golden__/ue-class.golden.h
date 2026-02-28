// Сгенерировано MultiCode (target: ue)
// Граф: TargetMatrixGraph
#pragma once
#include "CoreMinimal.h"
#include "UObject/NoExportTypes.h"
#include "TargetmatrixgraphGenerated.generated.h"

UCLASS(BlueprintType)
class UPlayerstateGenerated : public UObject {
    GENERATED_BODY()
public:
    UFUNCTION(BlueprintCallable, Category = "MultiCode")
    void ExecuteGraph();
};

void UPlayerstateGenerated::ExecuteGraph() {
    class playerstate {
    public:
        int gethealth();
    private:
        int health;
    };
    int playerstate::gethealth() {
        return 0;
    }
    // Начало
    // Вывод
    std::cout << "Hello UE" << std::endl;
}
