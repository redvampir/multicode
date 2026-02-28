# UE pre-release check-list

## Мигратор схемы

- [ ] Legacy граф (`version=1/2`, без `schemaVersion`) открывается без ошибок.
- [ ] После десериализации выставляется целевая `graphVersion=3`.
- [ ] Отсутствующие UE-поля (`classes[].extensions.ue.*`) не приводят к падению и получают безопасные defaults.

## Экспорт

- [ ] Режим `legacy` формирует документ без `schemaVersion` (контракт `version=2`).
- [ ] Режим `modern` формирует документ с `schemaVersion=3`.
- [ ] Sidecar `.multicode` сохраняется в формате согласно `multicode.graphExport.compatibilityMode`.

## Совместимость

- [ ] Legacy-графы открываются в Blueprint и не ломают Classic-представление.
- [ ] Сценарий «загрузить UE-граф → сохранить → загрузить снова» сохраняет UE-метаданные без деградации.

## Регрессии и автотесты

- [ ] Пройден набор `serializer.test.ts`.
- [ ] Пройден набор `graphSnapshot.test.ts`.
- [ ] Regression-фикстуры схемы актуальны и покрывают: open legacy / legacy export / UE round-trip.
