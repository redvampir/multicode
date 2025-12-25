# Система пакетов MultiCode

> **Версия:** 0.5.0
> **Дата:** 2025-12-24
> **Статус:** Фаза 1 завершена (схемы и формат)

## Обзор

Пакеты MultiCode — это способ организации и распространения узлов для визуального программирования. Каждый пакет содержит определения узлов, их категории и шаблоны кодогенерации.

## Структура пакета

```
@multicode/std/
├── package.json          # Манифест пакета
├── README.md             # Документация (опционально)
└── LICENSE               # Лицензия (опционально)
```

Всё определение пакета находится в `package.json`. Схема валидируется через `schemas/multicode-package.schema.json`.

## Манифест пакета (package.json)

### Обязательные поля

| Поле | Тип | Описание |
|------|-----|----------|
| `name` | string | Уникальное имя пакета (`@scope/name` или `name`) |
| `version` | string | Версия в формате SemVer (`1.0.0`) |
| `displayName` | string | Название на английском |
| `nodes` | array | Массив определений узлов |

### Опциональные поля

| Поле | Тип | Описание |
|------|-----|----------|
| `displayNameRu` | string | Название на русском |
| `description` | string | Описание на английском |
| `descriptionRu` | string | Описание на русском |
| `author` | string/object | Автор пакета |
| `license` | string | SPDX идентификатор лицензии |
| `keywords` | string[] | Ключевые слова для поиска |
| `engines` | object | Требования к версиям |
| `dependencies` | object | Зависимости от других пакетов |
| `categories` | array | Пользовательские категории |
| `contributes` | object | Дополнительные вклады |

## Определение узла

Каждый узел описывается объектом со следующими полями:

### Обязательные поля

```json
{
  "type": "Print",
  "label": "Print String",
  "labelRu": "Вывод строки",
  "category": "io",
  "inputs": [...],
  "outputs": [...]
}
```

| Поле | Описание |
|------|----------|
| `type` | Уникальный идентификатор (PascalCase) |
| `label` | Название на английском |
| `labelRu` | Название на русском |
| `category` | Категория: `flow`, `function`, `variable`, `math`, `comparison`, `logic`, `io`, `other` |
| `inputs` | Массив входных портов |
| `outputs` | Массив выходных портов |

### Опциональные поля

| Поле | Описание |
|------|----------|
| `description` | Описание на английском |
| `descriptionRu` | Описание на русском |
| `headerColor` | Цвет заголовка (`#RRGGBB`) |
| `icon` | Иконка (emoji или URL) |
| `dynamicPorts` | Разрешить добавление портов |
| `properties` | Редактируемые свойства |
| `codegen` | Шаблоны кодогенерации |

## Определение порта

```json
{
  "id": "exec-in",
  "name": "",
  "nameRu": "",
  "dataType": "execution",
  "defaultValue": null,
  "hidden": false
}
```

### Типы данных (`dataType`)

| Тип | Описание | Цвет |
|-----|----------|------|
| `execution` | Поток выполнения | Белый |
| `bool` | Логический | Красный |
| `int32` | 32-бит целое | Cyan |
| `int64` | 64-бит целое | Cyan |
| `float` | Вещественное | Зелёный |
| `double` | Двойная точность | Зелёный |
| `string` | Строка | Розовый |
| `vector` | Вектор | Жёлтый |
| `object` | Объект | Синий |
| `array` | Массив | Оранжевый |
| `any` | Любой тип | Серый |

## Кодогенерация

Каждый узел может иметь шаблоны для разных языков:

```json
{
  "codegen": {
    "cpp": {
      "template": "std::cout << {{input.string}} << std::endl;",
      "includes": ["<iostream>"],
      "before": "// Setup code",
      "after": "// Cleanup code"
    }
  }
}
```

### Плейсхолдеры

| Плейсхолдер | Описание |
|-------------|----------|
| `{{input.portId}}` | Значение входного порта |
| `{{output.portId}}` | Имя переменной выходного порта |
| `{{prop.propId}}` | Значение свойства узла |
| `{{node.label}}` | Название узла (EN) |
| `{{node.labelRu}}` | Название узла (RU) |
| `{{node.id}}` | ID узла в графе |

### Поля шаблона

| Поле | Описание |
|------|----------|
| `template` | Основной шаблон кода |
| `includes` | Необходимые `#include` |
| `dependencies` | Зависимости (библиотеки) |
| `before` | Код перед шаблоном |
| `after` | Код после шаблона |
| `wrapBody` | Обернуть в `{}` |

## Свойства узла

Свойства — это редактируемые параметры, отображаемые в инспекторе:

```json
{
  "properties": [
    {
      "id": "varName",
      "name": "Variable Name",
      "nameRu": "Имя переменной",
      "type": "string",
      "default": "myVar"
    },
    {
      "id": "varType",
      "name": "Type",
      "nameRu": "Тип",
      "type": "enum",
      "enum": [
        { "value": "int", "label": "Integer", "labelRu": "Целое" },
        { "value": "float", "label": "Float", "labelRu": "Вещественное" }
      ]
    }
  ]
}
```

### Типы свойств

| Тип | Описание |
|-----|----------|
| `string` | Текстовое поле |
| `number` | Числовое поле (с min/max/step) |
| `boolean` | Чекбокс |
| `enum` | Выпадающий список |
| `color` | Выбор цвета |
| `code` | Редактор кода |

## Пример минимального пакета

```json
{
  "$schema": "../../schemas/multicode-package.schema.json",
  "name": "my-package",
  "version": "1.0.0",
  "displayName": "My Package",
  "displayNameRu": "Мой пакет",
  "nodes": [
    {
      "type": "MyNode",
      "label": "My Node",
      "labelRu": "Мой узел",
      "category": "other",
      "inputs": [
        { "id": "exec-in", "name": "", "dataType": "execution" }
      ],
      "outputs": [
        { "id": "exec-out", "name": "", "dataType": "execution" }
      ],
      "codegen": {
        "cpp": {
          "template": "// My custom node"
        }
      }
    }
  ]
}
```

## Валидация

Для валидации пакета используйте JSON Schema:

```bash
# С помощью ajv-cli
npx ajv validate -s schemas/multicode-package.schema.json -d packages/my-package/package.json
```

---

## План реализации v0.5

### Фаза 1: Формат и схемы ✅
- [x] JSON Schema для пакета (`multicode-package.schema.json`)
- [x] JSON Schema для узла (`node.schema.json`)
- [x] Формат шаблонов кодогенерации
- [x] Пример пакета `@multicode/std`
- [x] Документация формата

### Фаза 2: Загрузчик
- [ ] `PackageLoader` — парсинг и валидация пакетов
- [ ] `PackageRegistry` — хранение и поиск узлов

### Фаза 3: Интеграция
- [ ] Миграция `NODE_TYPE_DEFINITIONS` на формат пакетов
- [ ] Динамическая загрузка в `BlueprintEditor`
- [ ] Интеграция с `CppCodeGenerator`

### Фаза 4: UI
- [ ] Панель управления пакетами

---

## См. также

- [node.schema.json](../../schemas/node.schema.json) — схема узла
- [multicode-package.schema.json](../../schemas/multicode-package.schema.json) — схема пакета
- [packages/std](../../packages/std) — стандартная библиотека
