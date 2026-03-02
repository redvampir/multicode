// Сгенерировано MultiCode
// Граф: Untitled Graph
// Дата: 02.03.2026, 10:39:41
// @multicode:graph id=graph-1771817389591 file=.multicode/graph-1771817389591.multicode

#include <future>
#include <iostream>
#include <memory>
#include <string>
#include <vector>

int newFunction1(int Summa_1, int Summ_2) {
    int znachenie_1 = 0;
    int znachenie_2 = 0;

    znachenie_1 = Summa_1;
    znachenie_2 = Summ_2;
    return (znachenie_2 + znachenie_1);
}

int main() {
    int var_32 = 32;
    int proverka = 1;
    std::unique_ptr<int> test = std::make_unique<int>(var_32);

    auto parallel_future_node1772164235953yzibr9lxt_0 = std::async(std::launch::async, [&]() {
        auto result_s88gju = newFunction1(0, 0);
        return 0;
    });
    auto parallel_future_node1772164235953yzibr9lxt_1 = std::async(std::launch::async, [&]() {
        std::cout << "Паралельно один" << std::endl;
    });
    parallel_future_node1772164235953yzibr9lxt_0.get();
    parallel_future_node1772164235953yzibr9lxt_1.get();
    std::cout << "Паралельно два" << std::endl;
    return 0;
}

