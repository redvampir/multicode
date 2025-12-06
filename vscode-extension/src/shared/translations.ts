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
  | 'toolbar.newGraph'
  | 'toolbar.loadGraph'
  | 'toolbar.saveGraph'
  | 'toolbar.validateGraph'
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
  | 'toasts.saved'
  | 'toasts.loaded'
  | 'toasts.generated'
  | 'toasts.validationOk'
  | 'toasts.graphReset'
  | 'toasts.nodeAdded'
  | 'toasts.connectionCreated'
  | 'toasts.nodesDeleted'
  | 'toast.close'
  | 'errors.connectionExists'
  | 'errors.connectionSelf'
  | 'errors.connectionMissing'
  | 'errors.graphSave'
  | 'errors.graphLoad';

type TranslationMap = Record<TranslationKey, string>;

const translations: Record<Locale, TranslationMap> = {
  ru: {
    'app.title': 'MultiCode · визуальный граф',
    'app.subtitle': 'Добавляйте узлы и связи — состояние хранится внутри расширения.',
    'toolbar.new': 'Новый',
    'toolbar.save': 'Сохранить',
    'toolbar.load': 'Загрузить',
    'toolbar.generate': 'Сгенерировать код',
    'toolbar.validate': 'Валидировать',
    'toolbar.unsaved': 'Есть несохранённые изменения',
    'toolbar.languageSwitch': 'Язык интерфейса',
    'toolbar.targetPlatform': 'Целевая платформа: {language}',
    'toolbar.newGraph': 'Новый граф',
    'toolbar.loadGraph': 'Загрузить',
    'toolbar.saveGraph': 'Сохранить',
    'toolbar.validateGraph': 'Проверить',
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
    'graph.stats': 'Узлов / соединений',
    'graph.updated': 'Обновлено',
    'form.graphTitle': 'Название графа',
    'form.rename': 'Переименовать',
    'form.targetLanguage': 'Целевой язык',
    'form.newNode': 'Название нового узла',
    'form.nodeType': 'Тип узла',
    'form.connection': 'Создать соединение',
    'form.addNode': 'Добавить узел',
    'form.connect': 'Соединить',
    'form.source': 'Источник',
    'form.target': 'Цель',
    'form.placeholder.graph': 'Без имени',
    'form.placeholder.node': 'Имя узла',
    'form.placeholder.newNode': 'Новый узел',
    'form.placeholder.edge': 'Метка соединения',
    'toasts.saved': 'Граф сохранён',
    'toasts.loaded': 'Граф загружен',
    'toasts.generated': 'Код отправлен в Output',
    'toasts.validationOk': 'Граф прошёл валидацию',
    'toasts.graphReset': 'Новый граф создан',
    'toasts.nodeAdded': 'Узел "{name}" добавлен',
    'toasts.connectionCreated': 'Соединение создано',
    'toasts.nodesDeleted': '{count} узлов удалено',
    'toast.close': 'Закрыть уведомление',
    'errors.connectionExists': 'Такое соединение уже существует',
    'errors.connectionSelf': 'Нельзя соединить узел с самим собой',
    'errors.connectionMissing': 'Выберите существующие узлы',
    'errors.graphSave': 'Не удалось сохранить граф',
    'errors.graphLoad': 'Не удалось загрузить граф'
  },
  en: {
    'app.title': 'MultiCode · visual graph',
    'app.subtitle': 'Add nodes and links — state is stored inside the extension.',
    'toolbar.new': 'New',
    'toolbar.save': 'Save',
    'toolbar.load': 'Load',
    'toolbar.generate': 'Generate Code',
    'toolbar.validate': 'Validate',
    'toolbar.unsaved': 'Unsaved changes',
    'toolbar.languageSwitch': 'Interface language',
    'toolbar.targetPlatform': 'Target platform: {language}',
    'toolbar.newGraph': 'New graph',
    'toolbar.loadGraph': 'Load',
    'toolbar.saveGraph': 'Save',
    'toolbar.validateGraph': 'Validate',
    'toolbar.generateGraph': 'Generate code',
    'overview.title': 'Graph summary',
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
    'form.graphTitle': 'Graph name',
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
    'toasts.saved': 'Graph saved',
    'toasts.loaded': 'Graph loaded',
    'toasts.generated': 'Code sent to Output',
    'toasts.validationOk': 'Graph validated successfully',
    'toasts.graphReset': 'New graph created',
    'toasts.nodeAdded': 'Node "{name}" added',
    'toasts.connectionCreated': 'Connection created',
    'toasts.nodesDeleted': '{count} nodes removed',
    'toast.close': 'Close notification',
    'errors.connectionExists': 'Connection already exists',
    'errors.connectionSelf': 'Cannot connect node to itself',
    'errors.connectionMissing': 'Select existing nodes',
    'errors.graphSave': 'Failed to save graph',
    'errors.graphLoad': 'Failed to load graph'
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
