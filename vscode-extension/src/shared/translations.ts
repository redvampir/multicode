export type Locale = 'ru' | 'en';

export type TranslationKey =
  | 'app.title'
  | 'app.subtitle'
  | 'toolbar.new'
  | 'toolbar.save'
  | 'toolbar.load'
  | 'toolbar.generate'
  | 'toolbar.validate'
  | 'toolbar.unsaved'
  | 'toolbar.languageSwitch'
  | 'toolbar.targetPlatform'
  | 'toolbar.copyId'
  | 'toolbar.copyId.ok'
  | 'toolbar.copyId.fallback'
  | 'toolbar.newGraph'
  | 'toolbar.loadGraph'
  | 'toolbar.saveGraph'
  | 'toolbar.validateGraph'
  | 'toolbar.calculateLayout'
  | 'toolbar.generateGraph'
  | 'overview.title'
  | 'overview.nodes'
  | 'overview.edges'
  | 'overview.language'
  | 'overview.synced'
  | 'inspector.title'
  | 'graph.id'
  | 'graph.name'
  | 'graph.language'
  | 'graph.stats'
  | 'graph.updated'
  | 'form.graphTitle'
  | 'form.rename'
  | 'form.targetLanguage'
  | 'form.newNode'
  | 'form.nodeType'
  | 'form.connection'
  | 'form.addNode'
  | 'form.connect'
  | 'form.source'
  | 'form.target'
  | 'form.placeholder.graph'
  | 'form.placeholder.node'
  | 'form.placeholder.newNode'
  | 'form.placeholder.edge'
  | 'layout.title'
  | 'layout.algorithm'
  | 'layout.algorithm.dagre'
  | 'layout.algorithm.klay'
  | 'layout.rankDir'
  | 'layout.rank.lr'
  | 'layout.rank.rl'
  | 'layout.rank.tb'
  | 'layout.rank.bt'
  | 'layout.nodeSep'
  | 'layout.edgeSep'
  | 'layout.spacing'
  | 'toasts.saved'
  | 'toasts.loaded'
  | 'toasts.generated'
  | 'toasts.validationOk'
  | 'toasts.graphReset'
  | 'toasts.nodeAdded'
  | 'toasts.connectionCreated'
  | 'toasts.nodesDeleted'
  | 'toast.close'
  | 'search.placeholder'
  | 'search.hint'
  | 'search.results'
  | 'search.noResults'
  | 'search.prev'
  | 'search.next'
  | 'search.clear'
  | 'search.type.node'
  | 'search.type.edge'
  | 'context.copy'
  | 'context.duplicate'
  | 'context.paste'
  | 'context.delete'
  | 'context.group'
  | 'context.alignGrid'
  | 'errors.connectionExists'
  | 'errors.connectionSelf'
  | 'errors.connectionMissing'
  | 'errors.graphSave'
  | 'errors.graphLoad'
  | 'palette.title'
  | 'palette.hint'
  | 'palette.close'
  | 'palette.node.function'
  | 'palette.node.branch'
  | 'palette.node.switch'
  | 'palette.node.sequence'
  | 'palette.node.variable'
  | 'palette.node.comment'
  | 'translation.title'
  | 'translation.direction'
  | 'translation.translate'
  | 'translation.translating'
  | 'minimap.alt'
  | 'node.copySuffix'
  | 'node.defaultName'
  | 'nodeType.Start'
  | 'nodeType.End'
  | 'nodeType.Function'
  | 'nodeType.Variable'
  | 'nodeType.Custom'
  | 'tooltip.newGraph'
  | 'tooltip.loadGraph'
  | 'tooltip.saveGraph'
  | 'tooltip.validateGraph'
  | 'tooltip.generateCode'
  | 'tooltip.calculateLayout'
  | 'tooltip.copyId';

type TranslationMap = Record<TranslationKey, string>;

const translations: Record<Locale, TranslationMap> = {
  ru: {
    'app.title': 'MultiCode · Визуальные графы',
    'app.subtitle': 'Создавайте узлы и связи — состояние хранится внутри расширения.',
    'toolbar.new': 'Новый',
    'toolbar.save': 'Сохранить',
    'toolbar.load': 'Загрузить',
    'toolbar.generate': 'Сгенерировать код',
    'toolbar.validate': 'Проверить',
    'toolbar.unsaved': 'Есть несохранённые изменения',
    'toolbar.languageSwitch': 'Язык интерфейса',
    'toolbar.targetPlatform': 'Целевая платформа: {language}',
    'toolbar.copyId': 'ID графа в буфер',
    'toolbar.copyId.ok': 'ID графа скопирован',
    'toolbar.copyId.fallback': 'Не удалось записать в буфер',
    'toolbar.newGraph': 'Новый граф',
    'toolbar.loadGraph': 'Загрузить',
    'toolbar.saveGraph': 'Сохранить',
    'toolbar.validateGraph': 'Проверить',
    'toolbar.calculateLayout': 'Пересчитать',
    'toolbar.generateGraph': 'Генерировать код',
    'overview.title': 'Сводка графа',
    'overview.nodes': 'Узлы',
    'overview.edges': 'Связи',
    'overview.language': 'Язык',
    'overview.synced': 'Синхронизировано',
    'inspector.title': 'Инспектор',
    'graph.id': 'ID',
    'graph.name': 'Имя',
    'graph.language': 'Язык',
    'graph.stats': 'Узлы / Связи',
    'graph.updated': 'Обновлено',
    'form.graphTitle': 'Название графа',
    'form.rename': 'Переименовать',
    'form.targetLanguage': 'Целевой язык',
    'form.newNode': 'Имя узла',
    'form.nodeType': 'Тип узла',
    'form.connection': 'Создать связь',
    'form.addNode': 'Добавить узел',
    'form.connect': 'Соединить',
    'form.source': 'Источник',
    'form.target': 'Цель',
    'form.placeholder.graph': 'Без названия',
    'form.placeholder.node': 'Имя узла',
    'form.placeholder.newNode': 'Новый узел',
    'form.placeholder.edge': 'Метка связи',
    'layout.title': 'Настройки расположения',
    'layout.algorithm': 'Алгоритм',
    'layout.algorithm.dagre': 'Dagre (иерархический)',
    'layout.algorithm.klay': 'Klay (слоистый)',
    'layout.rankDir': 'Направление рангов',
    'layout.rank.lr': 'Слева направо',
    'layout.rank.rl': 'Справа налево',
    'layout.rank.tb': 'Сверху вниз',
    'layout.rank.bt': 'Снизу вверх',
    'layout.nodeSep': 'Шаг между узлами',
    'layout.edgeSep': 'Шаг между рёбрами',
    'layout.spacing': 'Масштаб сетки',
    'toasts.saved': 'Граф сохранён',
    'toasts.loaded': 'Граф загружен',
    'toasts.generated': 'Код сгенерирован',
    'toasts.validationOk': 'Ошибок не найдено',
    'toasts.graphReset': 'Граф сброшен',
    'toasts.nodeAdded': 'Узел "{name}" добавлен',
    'toasts.connectionCreated': 'Связь создана',
    'toasts.nodesDeleted': '{count} узлов удалено',
    'toast.close': 'Закрыть уведомление',
    'search.placeholder': 'Поиск узла или связи',
    'search.hint': 'Ctrl+F — фокус на поиск, Enter — следующее, Shift+Enter — предыдущее',
    'search.results': 'Совпадений: {count}',
    'search.noResults': 'Ничего не найдено',
    'search.prev': 'Назад',
    'search.next': 'Вперёд',
    'search.clear': 'Очистить',
    'search.type.node': 'Узел',
    'search.type.edge': 'Связь',
    'context.copy': 'Копировать',
    'context.duplicate': 'Дублировать',
    'context.paste': 'Вставить',
    'context.delete': 'Удалить',
    'context.group': 'Сгруппировать',
    'context.alignGrid': 'Выровнять по сетке',
    'errors.connectionExists': 'Такая связь уже есть',
    'errors.connectionSelf': 'Связь с самим собой запрещена',
    'errors.connectionMissing': 'Укажите оба узла для связи',
    'errors.graphSave': 'Не удалось сохранить граф',
    'errors.graphLoad': 'Не удалось загрузить граф',
    'palette.title': 'Быстрое добавление',
    'palette.hint': '(A / двойной клик)',
    'palette.close': 'Закрыть',
    'palette.node.function': 'Функция',
    'palette.node.branch': 'Ветвление',
    'palette.node.switch': 'Переключатель',
    'palette.node.sequence': 'Последовательность',
    'palette.node.variable': 'Переменная',
    'palette.node.comment': 'Комментарий',
    'translation.title': 'Перевод графа',
    'translation.direction': 'Направление',
    'translation.translate': 'Перевести',
    'translation.translating': 'Перевод...',
    'minimap.alt': 'Миникарта',
    'node.copySuffix': '(копия)',
    'node.defaultName': 'Узел {number}',
    'nodeType.Start': 'Начало',
    'nodeType.End': 'Конец',
    'nodeType.Function': 'Функция',
    'nodeType.Variable': 'Переменная',
    'nodeType.Custom': 'Пользовательский',
    'tooltip.newGraph': 'Создать новый граф',
    'tooltip.loadGraph': 'Загрузить граф из файла',
    'tooltip.saveGraph': 'Сохранить граф в файл',
    'tooltip.validateGraph': 'Проверить граф на ошибки',
    'tooltip.generateCode': 'Сгенерировать код из графа',
    'tooltip.calculateLayout': 'Пересчитать расположение узлов',
    'tooltip.copyId': 'Скопировать ID графа в буфер обмена'
  },
  en: {
    'app.title': 'MultiCode · Visual Graph',
    'app.subtitle': 'Add nodes and links — state is stored inside the extension.',
    'toolbar.new': 'New',
    'toolbar.save': 'Save',
    'toolbar.load': 'Load',
    'toolbar.generate': 'Generate code',
    'toolbar.validate': 'Validate',
    'toolbar.unsaved': 'Unsaved changes',
    'toolbar.languageSwitch': 'Interface language',
    'toolbar.targetPlatform': 'Target platform: {language}',
    'toolbar.copyId': 'Copy graph ID',
    'toolbar.copyId.ok': 'Graph ID copied',
    'toolbar.copyId.fallback': 'Failed to copy to clipboard',
    'toolbar.newGraph': 'New graph',
    'toolbar.loadGraph': 'Load',
    'toolbar.saveGraph': 'Save',
    'toolbar.validateGraph': 'Validate',
    'toolbar.calculateLayout': 'Recalculate',
    'toolbar.generateGraph': 'Generate code',
    'overview.title': 'Graph overview',
    'overview.nodes': 'Nodes',
    'overview.edges': 'Edges',
    'overview.language': 'Language',
    'overview.synced': 'Synced',
    'inspector.title': 'Inspector',
    'graph.id': 'ID',
    'graph.name': 'Name',
    'graph.language': 'Language',
    'graph.stats': 'Nodes / Connections',
    'graph.updated': 'Updated',
    'form.graphTitle': 'Graph title',
    'form.rename': 'Rename',
    'form.targetLanguage': 'Target language',
    'form.newNode': 'New node name',
    'form.nodeType': 'Node type',
    'form.connection': 'Create connection',
    'form.addNode': 'Add node',
    'form.connect': 'Connect',
    'form.source': 'Source',
    'form.target': 'Target',
    'form.placeholder.graph': 'Untitled',
    'form.placeholder.node': 'Node name',
    'form.placeholder.newNode': 'New node',
    'form.placeholder.edge': 'Connection label',
    'layout.title': 'Layout settings',
    'layout.algorithm': 'Algorithm',
    'layout.algorithm.dagre': 'Dagre (hierarchical)',
    'layout.algorithm.klay': 'Klay (layered)',
    'layout.rankDir': 'Rank direction',
    'layout.rank.lr': 'Left to right',
    'layout.rank.rl': 'Right to left',
    'layout.rank.tb': 'Top to bottom',
    'layout.rank.bt': 'Bottom to top',
    'layout.nodeSep': 'Node separation',
    'layout.edgeSep': 'Edge separation',
    'layout.spacing': 'Spacing scale',
    'toasts.saved': 'Graph saved',
    'toasts.loaded': 'Graph loaded',
    'toasts.generated': 'Code generated',
    'toasts.validationOk': 'No validation errors',
    'toasts.graphReset': 'Graph reset',
    'toasts.nodeAdded': 'Node "{name}" added',
    'toasts.connectionCreated': 'Connection created',
    'toasts.nodesDeleted': '{count} nodes removed',
    'toast.close': 'Close notification',
    'search.placeholder': 'Search nodes or edges',
    'search.hint': 'Ctrl+F — focus search, Enter — next, Shift+Enter — previous',
    'search.results': 'Matches: {count}',
    'search.noResults': 'No results',
    'search.prev': 'Previous',
    'search.next': 'Next',
    'search.clear': 'Clear',
    'search.type.node': 'Node',
    'search.type.edge': 'Edge',
    'context.copy': 'Copy',
    'context.duplicate': 'Duplicate',
    'context.paste': 'Paste',
    'context.delete': 'Delete',
    'context.group': 'Group selection',
    'context.alignGrid': 'Align to grid',
    'errors.connectionExists': 'Connection already exists',
    'errors.connectionSelf': 'Cannot connect node to itself',
    'errors.connectionMissing': 'Select existing nodes',
    'errors.graphSave': 'Failed to save graph',
    'errors.graphLoad': 'Failed to load graph',
    'palette.title': 'Quick Add',
    'palette.hint': '(A / double-click)',
    'palette.close': 'Close',
    'palette.node.function': 'Function',
    'palette.node.branch': 'Branch',
    'palette.node.switch': 'Switch',
    'palette.node.sequence': 'Sequence',
    'palette.node.variable': 'Variable',
    'palette.node.comment': 'Comment',
    'translation.title': 'Graph Translation',
    'translation.direction': 'Direction',
    'translation.translate': 'Translate',
    'translation.translating': 'Translating...',
    'minimap.alt': 'Minimap',
    'node.copySuffix': '(copy)',
    'node.defaultName': 'Node {number}',
    'nodeType.Start': 'Start',
    'nodeType.End': 'End',
    'nodeType.Function': 'Function',
    'nodeType.Variable': 'Variable',
    'nodeType.Custom': 'Custom',
    'tooltip.newGraph': 'Create new graph',
    'tooltip.loadGraph': 'Load graph from file',
    'tooltip.saveGraph': 'Save graph to file',
    'tooltip.validateGraph': 'Validate graph',
    'tooltip.generateCode': 'Generate code from graph',
    'tooltip.calculateLayout': 'Recalculate node layout',
    'tooltip.copyId': 'Copy graph ID to clipboard'
  }
};

export const getTranslation = (
  locale: Locale,
  key: TranslationKey,
  replacements?: Record<string, string>,
  fallbackText?: string
): string => {
  const lang = translations[locale] ?? translations.ru;
  let text = lang[key] ?? translations.ru[key] ?? fallbackText ?? key;
  if (replacements) {
    Object.entries(replacements).forEach(([token, value]) => {
      text = text.replace(`{${token}}`, value);
    });
  }
  return text;
};
