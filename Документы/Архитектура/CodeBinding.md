# Code Binding (Graph ↔ Source)

## Что хочется
- Иметь возможность «пристыковать» визуальный граф к существующему файлу C++/Rust.
- Генератор должен вставлять код в помеченные блоки, не ломая остальной файл.
- Пользователь видит и редактирует и граф, и текст синхронно.

## Что есть
Ничего. Есть только идея и enum `Language` в `Types.hpp`. План ниже описывает минимальный API без фантазий.

## Предлагаемый протокол
```cpp
struct BindingLocation {
    std::filesystem::path file;
    std::string markerBegin; // // multicode:begin main_loop
    std::string markerEnd;
}

struct CodeBinding {
    GraphId graph;
    BindingLocation location;
    Language lang;
};
```

Операции:
1. `CodeBindingRepository::attach(graphId, location)` - проверяет наличие маркеров в файле, сохраняет связь.
2. `CodeBindingRepository::detach(graphId)` - удаляет связь, но файл не трогает.
3. `CodeGenerator::emit(graphId)` - генерирует код и заменяет содержимое между маркерами.

## Минимальные правила для маркеров
```
// multicode:begin <token>
...код, который можно перезаписать...
// multicode:end <token>
```

## План внедрения
1. **Сериализация** - нужно хранить `CodeBinding` рядом с графом (JSON).
2. **UI** - в VS Code добавить команду «Attach to file», которая спрашивает путь и имя токена.
3. **Генерация** - при `Generate Code` проверять наличие binding и писать в файл.

## Ограничения
- Никаких AST/clang-tidy интеграций на первом этапе.
- Если маркеры пропали - команда падает с ошибкой и просит пользователя пересоздать binding.
- Поддерживаем только один binding на граф.
