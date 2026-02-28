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
  | 'toolbar.pointersPanel'
  | 'toolbar.codegenProfile'
  | 'toolbar.codegenProfile.clean'
  | 'toolbar.codegenProfile.learn'
  | 'toolbar.codegenProfile.debug'
  | 'toolbar.codegenProfile.recovery'
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
  | 'toasts.generatedToFile'
  | 'toasts.validationOk'
  | 'toasts.graphReset'
  | 'toasts.nodeAdded'
  | 'toasts.connectionCreated'
  | 'toasts.nodesDeleted'
  | 'toasts.codegenProfileChanged'
  | 'toast.close'
  | 'toast.generation.success'
  | 'toast.generation.error'
  | 'codegen.unsupportedLanguage'
  | 'codegen.supportStatus'
  | 'codegen.support.ready'
  | 'codegen.support.unsupported'
  | 'codegen.registryUnavailable'
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
  | 'hints.title'
  | 'hints.contextDelete'
  | 'hints.deleteKeys'
  | 'hints.copyPaste'
  | 'hints.pan'
  | 'errors.connectionExists'
  | 'errors.connectionSelf'
  | 'errors.connectionMissing'
  | 'errors.graphSave'
  | 'errors.graphLoad'
  | 'errors.codeWriteTargetMissing'
  | 'errors.codeWriteFailed'
  | 'errors.codegenProfileUpdateFailed'
  | 'errors.ipc.validation.webviewMessage'
  | 'errors.ipc.validation.extensionResponse'
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
  | 'tooltip.copyId'
  | 'panel.pointers.title'
  | 'panel.pointers.weakTargetLabel'
  | 'panel.pointers.weakAutoUpgrade'
  | 'panel.classes.title'
  | 'panel.classes.create'
  | 'panel.classes.empty'
  | 'panel.classes.name'
  | 'panel.classes.delete'
  | 'panel.classes.fields'
  | 'panel.classes.field.add'
  | 'panel.classes.field.name'
  | 'panel.classes.field.type'
  | 'panel.classes.field.delete'
  | 'panel.classes.methods'
  | 'panel.classes.method.add'
  | 'panel.classes.method.name'
  | 'panel.classes.method.returnType'
  | 'panel.classes.method.delete'
  | 'toolbar.noFile'
  | 'warnings.graphBindingDuplicateId'
  | 'warnings.graphBindingIdMismatch'
  | 'warnings.graphBindingBrokenFileRecovered'
  | 'warnings.graphBindingRecoveredFromCode'
  | 'warnings.cpp23RequiredForModernStd'
  | 'toolchain.downloadPrompt'
  | 'toolchain.downloading'
  | 'toolchain.extracting'
  | 'toolchain.installOk'
  | 'toolchain.installCancelled'
  | 'toolchain.installFailed'
  | 'toolchain.macosCltRequired';

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
    'toolbar.noFile': 'файл не привязан',
    'toolbar.newGraph': 'Новый граф',
    'toolbar.loadGraph': 'Загрузить',
    'toolbar.saveGraph': 'Сохранить',
    'toolbar.validateGraph': 'Проверить',
    'toolbar.calculateLayout': 'Пересчитать',
    'toolbar.generateGraph': 'Генерировать код',
    'toolbar.pointersPanel': 'Указатели',
    'toolbar.codegenProfile': 'Профиль кода',
    'toolbar.codegenProfile.clean': 'Чистый',
    'toolbar.codegenProfile.learn': 'Учебный',
    'toolbar.codegenProfile.debug': 'Отладка',
    'toolbar.codegenProfile.recovery': 'Восстановление',
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
    'toasts.generatedToFile': 'Код сгенерирован и записан в {file}',
    'toasts.validationOk': 'Ошибок не найдено',
    'toasts.graphReset': 'Граф сброшен',
    'toasts.nodeAdded': 'Узел "{name}" добавлен',
    'toasts.connectionCreated': 'Связь создана',
    'toasts.nodesDeleted': '{count} узлов удалено',
    'toasts.codegenProfileChanged': 'Профиль генерации: {profile}',
    'toast.close': 'Закрыть уведомление',
    'toast.generation.success': 'Код успешно сгенерирован',
    'toast.generation.error': 'Ошибка генерации кода',
    'codegen.unsupportedLanguage': 'Язык {language} пока не поддерживается кодогенератором',
    'codegen.supportStatus': 'Статус поддержки',
    'codegen.support.ready': 'готово',
    'codegen.support.unsupported': 'не поддерживается',
    'codegen.registryUnavailable': 'Реестр пакетов недоступен: предпросмотр использует базовый генератор C++.',
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
    'hints.title': 'Подсказки',
    'hints.contextDelete': 'ПКМ по узлу — меню → Удалить',
    'hints.deleteKeys': 'Delete/Backspace — удалить выделенное',
    'hints.copyPaste': 'Ctrl+C/V/D — копия/вставка/дубликат',
    'hints.pan': 'Средняя кнопка или пробел + перетаскивание — панорама',
    'errors.connectionExists': 'Такая связь уже есть',
    'errors.connectionSelf': 'Связь с самим собой запрещена',
    'errors.connectionMissing': 'Укажите оба узла для связи',
    'errors.graphSave': 'Не удалось сохранить граф',
    'errors.graphLoad': 'Не удалось загрузить граф',
    'errors.codeWriteTargetMissing': 'Нет привязанного файла для записи кода',
    'errors.codeWriteFailed': 'Не удалось записать код в файл: {reason}',
    'errors.codegenProfileUpdateFailed': 'Не удалось изменить профиль генерации',
    'errors.ipc.validation.webviewMessage': 'Некорректное сообщение от webview',
    'errors.ipc.validation.extensionResponse': 'Некорректный IPC-ответ расширения',
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
    'tooltip.calculateLayout': 'Пересчитать расположение узлов (без пересчёта значений)',
    'tooltip.copyId': 'Скопировать ID графа в буфер обмена',
    'panel.pointers.title': 'Указатели и ссылки',
    'panel.pointers.weakTargetLabel': 'Цель (умный указатель)',
    'panel.pointers.weakAutoUpgrade':
      'weak_ptr требует shared_ptr. При сохранении указатель "{name}" будет автоматически переведён в shared.',
    'panel.classes.title': 'Классы',
    'panel.classes.create': 'Класс',
    'panel.classes.empty': 'Пока нет классов',
    'panel.classes.name': 'Имя класса',
    'panel.classes.delete': 'Удалить',
    'panel.classes.fields': 'Поля',
    'panel.classes.field.add': 'Поле',
    'panel.classes.field.name': 'Имя поля',
    'panel.classes.field.type': 'Тип поля',
    'panel.classes.field.delete': 'Удалить поле',
    'panel.classes.methods': 'Методы',
    'panel.classes.method.add': 'Метод',
    'panel.classes.method.name': 'Имя метода',
    'panel.classes.method.returnType': 'Возвращаемый тип',
    'panel.classes.method.delete': 'Удалить метод',
    'warnings.graphBindingDuplicateId': 'Обнаружен дубликат ID графа "{id}" в файлах: {files}',
    'warnings.graphBindingIdMismatch':
      'Несоответствие графа: в коде id={codeId}, в файле ({file}) id={fileId}. Используется id из кода.',
    'warnings.graphBindingBrokenFileRecovered':
      'Файл графа повреждён. Создан новый граф. Резервная копия: {file}',
    'warnings.graphBindingRecoveredFromCode':
      'Файл графа не найден. Схема восстановлена из маркеров в коде ({file}) и сохранена в .multicode.',
    'warnings.cpp23RequiredForModernStd':
      'Для узлов std::expected/std::optional/std::variant/std::format требуется C++23. Выбранный {standard} будет проигнорирован.',

    'toolchain.downloadPrompt':
      'MultiCode нужно скачать и установить C++23 компилятор{sizeHint}, чтобы выполнить программу. Скачать сейчас?',
    'toolchain.downloading': 'Скачивание компилятора...',
    'toolchain.extracting': 'Распаковка компилятора...',
    'toolchain.installOk': 'Компилятор установлен.',
    'toolchain.installCancelled': 'Установка компилятора отменена.',
    'toolchain.installFailed': 'Не удалось установить компилятор: {reason}',
    'toolchain.macosCltRequired':
      'Для компиляции на macOS нужны Xcode Command Line Tools. Сейчас откроется системная установка. После установки попробуйте запустить ещё раз.',
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
    'toolbar.noFile': 'no file bound',
    'toolbar.newGraph': 'New graph',
    'toolbar.loadGraph': 'Load',
    'toolbar.saveGraph': 'Save',
    'toolbar.validateGraph': 'Validate',
    'toolbar.calculateLayout': 'Recalculate',
    'toolbar.generateGraph': 'Generate code',
    'toolbar.pointersPanel': 'Pointers',
    'toolbar.codegenProfile': 'Code profile',
    'toolbar.codegenProfile.clean': 'Clean',
    'toolbar.codegenProfile.learn': 'Learn',
    'toolbar.codegenProfile.debug': 'Debug',
    'toolbar.codegenProfile.recovery': 'Recovery',
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
    'toasts.generatedToFile': 'Code generated and written to {file}',
    'toasts.validationOk': 'No validation errors',
    'toasts.graphReset': 'Graph reset',
    'toasts.nodeAdded': 'Node "{name}" added',
    'toasts.connectionCreated': 'Connection created',
    'toasts.nodesDeleted': '{count} nodes removed',
    'toasts.codegenProfileChanged': 'Code generation profile: {profile}',
    'toast.close': 'Close notification',
    'toast.generation.success': 'Code generated successfully',
    'toast.generation.error': 'Code generation error',
    'codegen.unsupportedLanguage': 'Language {language} is not supported by code generator yet',
    'codegen.supportStatus': 'Support status',
    'codegen.support.ready': 'ready',
    'codegen.support.unsupported': 'unsupported',
    'codegen.registryUnavailable': 'Package registry is unavailable: preview uses the base C++ generator.',
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
    'hints.title': 'Shortcuts',
    'hints.contextDelete': 'Right click on node → menu → Delete',
    'hints.deleteKeys': 'Delete/Backspace — remove selection',
    'hints.copyPaste': 'Ctrl+C/V/D — copy/paste/duplicate',
    'hints.pan': 'Middle mouse or Space + drag — pan view',
    'errors.connectionExists': 'Connection already exists',
    'errors.connectionSelf': 'Cannot connect node to itself',
    'errors.connectionMissing': 'Select existing nodes',
    'errors.graphSave': 'Failed to save graph',
    'errors.graphLoad': 'Failed to load graph',
    'errors.codeWriteTargetMissing': 'No bound file to write generated code',
    'errors.codeWriteFailed': 'Failed to write code to file: {reason}',
    'errors.codegenProfileUpdateFailed': 'Failed to update code generation profile',
    'errors.ipc.validation.webviewMessage': 'Invalid message received from webview',
    'errors.ipc.validation.extensionResponse': 'Invalid IPC response from extension',
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
    'tooltip.calculateLayout': 'Recalculate node layout (does not recalculate values)',
    'tooltip.copyId': 'Copy graph ID to clipboard',
    'panel.pointers.title': 'Pointers & References',
    'panel.pointers.weakTargetLabel': 'Target (smart pointer)',
    'panel.pointers.weakAutoUpgrade':
      'weak_ptr requires shared_ptr. On save, pointer "{name}" will be automatically upgraded to shared.',
    'panel.classes.title': 'Classes',
    'panel.classes.create': 'Class',
    'panel.classes.empty': 'No classes yet',
    'panel.classes.name': 'Class name',
    'panel.classes.delete': 'Delete',
    'panel.classes.fields': 'Fields',
    'panel.classes.field.add': 'Field',
    'panel.classes.field.name': 'Field name',
    'panel.classes.field.type': 'Field type',
    'panel.classes.field.delete': 'Delete field',
    'panel.classes.methods': 'Methods',
    'panel.classes.method.add': 'Method',
    'panel.classes.method.name': 'Method name',
    'panel.classes.method.returnType': 'Return type',
    'panel.classes.method.delete': 'Delete method',
    'warnings.graphBindingDuplicateId': 'Duplicate graph ID "{id}" detected in files: {files}',
    'warnings.graphBindingIdMismatch':
      'Graph mismatch: source id={codeId}, file ({file}) id={fileId}. Using source id.',
    'warnings.graphBindingBrokenFileRecovered':
      'Graph file is corrupted. A new graph was created. Backup: {file}',
    'warnings.graphBindingRecoveredFromCode':
      'Graph file is missing. The graph was restored from code markers ({file}) and saved to .multicode.',
    'warnings.cpp23RequiredForModernStd':
      'Nodes based on std::expected/std::optional/std::variant/std::format require C++23. Selected {standard} will be ignored.',

    'toolchain.downloadPrompt':
      'MultiCode needs to download and install a C++23 compiler{sizeHint} to run your program. Download now?',
    'toolchain.downloading': 'Downloading toolchain...',
    'toolchain.extracting': 'Extracting toolchain...',
    'toolchain.installOk': 'Toolchain installed.',
    'toolchain.installCancelled': 'Toolchain installation cancelled.',
    'toolchain.installFailed': 'Failed to install toolchain: {reason}',
    'toolchain.macosCltRequired':
      'Xcode Command Line Tools are required on macOS. The system installer will open now. After installation, try running again.',
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
