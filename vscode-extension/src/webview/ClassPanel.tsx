import React, { useCallback, useMemo, useState } from 'react';
import type {
  BlueprintClass,
  BlueprintClassMember,
  BlueprintClassMethod,
  BlueprintGraphState,
} from '../shared/blueprintTypes';
import { VARIABLE_DATA_TYPES } from '../shared/blueprintTypes';
import type { PortDataType } from '../shared/portTypes';
import { getTranslation } from '../shared/translations';
import type { ClassStorageStatus, ClassStorageStatusItem } from '../shared/messages';
import { ClassEditor } from './ClassEditor';
import {
  CLASS_NODE_DRAG_MIME,
  serializeClassNodeDragPayload,
  type ClassNodeInsertRequest,
} from './classNodeFactory';

interface ClassPanelProps {
  graphState: BlueprintGraphState;
  onClassesChange: (classes: BlueprintClass[]) => void;
  displayLanguage: 'ru' | 'en';
  classStorageStatus?: ClassStorageStatus;
  classNodesAdvancedEnabled?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onInsertClassNode?: (request: ClassNodeInsertRequest) => void;
  onOpenClassEditor?: (classId: string) => void;
  onOpenClassSidecar?: (classId: string) => void;
  onOpenGraphMulticode?: () => void;
  onReloadClassStorage?: (classId?: string) => void;
  onRepairClassStorage?: (classId?: string) => void;
}

const createId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const dataTypes = VARIABLE_DATA_TYPES.filter((type): type is PortDataType => type !== 'execution');

const normalizeCodeName = (value: string, fallback: string): string => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const normalizeDisplayName = (value: string, fallback: string): string => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

export const ClassPanel: React.FC<ClassPanelProps> = ({
  graphState,
  onClassesChange,
  displayLanguage,
  classStorageStatus,
  classNodesAdvancedEnabled = false,
  collapsed = false,
  onToggleCollapsed,
  onInsertClassNode,
  onOpenClassEditor,
  onOpenClassSidecar,
  onOpenGraphMulticode,
  onReloadClassStorage,
  onRepairClassStorage,
}) => {
  const isRu = displayLanguage === 'ru';
  const translate = useCallback(
    (key: Parameters<typeof getTranslation>[1], fallback: string): string =>
      getTranslation(displayLanguage, key, undefined, fallback),
    [displayLanguage]
  );

  const classes = useMemo(() => graphState.classes ?? [], [graphState.classes]);
  const classStorageItemsById = useMemo(() => {
    const map = new Map<string, ClassStorageStatusItem>();
    for (const item of classStorageStatus?.classItems ?? []) {
      map.set(item.classId, item);
    }
    return map;
  }, [classStorageStatus?.classItems]);
  const isSidecarMode = classStorageStatus?.mode === 'sidecar';
  const canOpenGraphMulticode = Boolean(classStorageStatus?.graphFilePath?.trim());
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState<'all' | 'problem' | 'changed'>('all');

  const getStatusLabel = useCallback((status: ClassStorageStatusItem['status']): string => {
    if (isRu) {
      switch (status) {
        case 'ok':
          return 'готово';
        case 'missing':
          return 'нет';
        case 'failed':
          return 'ошибка';
        case 'fallbackEmbedded':
          return 'в графе';
        case 'dirty':
          return 'изменено';
        case 'conflict':
          return 'конфликт';
        case 'unbound':
        default:
          return 'не привязано';
      }
    }

    switch (status) {
      case 'ok':
        return 'ok';
      case 'missing':
        return 'missing';
      case 'failed':
        return 'failed';
      case 'fallbackEmbedded':
        return 'fallback';
      case 'dirty':
        return 'dirty';
      case 'conflict':
        return 'conflict';
      case 'unbound':
      default:
        return 'unbound';
    }
  }, [isRu]);

  const updateClass = useCallback((classId: string, updater: (target: BlueprintClass) => BlueprintClass) => {
    onClassesChange(classes.map((item) => (item.id === classId ? updater(item) : item)));
  }, [classes, onClassesChange]);

  const handleCreateClass = useCallback(() => {
    const nextIndex = classes.length + 1;
    const newClass: BlueprintClass = {
      id: createId('class'),
      name: `NewClass${nextIndex}`,
      nameRu: `Новый класс ${nextIndex}`,
      classType: 'class',
      baseClasses: [],
      headerIncludes: [],
      sourceIncludes: [],
      forwardDecls: [],
      members: [],
      methods: [],
    };
    onClassesChange([...classes, newClass]);
  }, [classes, onClassesChange]);

  const handleDeleteClass = useCallback((classId: string) => {
    onClassesChange(classes.filter((item) => item.id !== classId));
    if (editingClassId === classId) {
      setEditingClassId(null);
    }
  }, [classes, editingClassId, onClassesChange]);

  const handleAddMember = useCallback((classId: string) => {
    updateClass(classId, (target) => {
      const nextIndex = target.members.length + 1;
      const newMember: BlueprintClassMember = {
        id: createId('member'),
        name: `field_${nextIndex}`,
        nameRu: `Поле ${nextIndex}`,
        dataType: 'int32',
        isStatic: false,
        access: 'private',
      };
      return { ...target, members: [...target.members, newMember] };
    });
  }, [updateClass]);

  const handleDeleteMember = useCallback((classId: string, memberId: string) => {
    updateClass(classId, (target) => ({
      ...target,
      members: target.members.filter((member) => member.id !== memberId),
    }));
  }, [updateClass]);

  const handleUpdateMember = useCallback((classId: string, memberId: string, patch: Partial<BlueprintClassMember>) => {
    updateClass(classId, (target) => ({
      ...target,
      members: target.members.map((member) => (member.id === memberId ? { ...member, ...patch } : member)),
    }));
  }, [updateClass]);

  const handleAddMethod = useCallback((classId: string) => {
    updateClass(classId, (target) => {
      const nextIndex = target.methods.length + 1;
      const newMethod: BlueprintClassMethod = {
        id: createId('method'),
        name: `method_${nextIndex}`,
        nameRu: `Метод ${nextIndex}`,
        methodKind: 'method',
        returnType: 'any',
        params: [],
        access: 'public',
        isStatic: false,
        isConst: false,
        isNoexcept: false,
        isPureVirtual: false,
        isVirtual: false,
        isOverride: false,
      };
      return { ...target, methods: [...target.methods, newMethod] };
    });
  }, [updateClass]);

  const handleDeleteMethod = useCallback((classId: string, methodId: string) => {
    updateClass(classId, (target) => ({
      ...target,
      methods: target.methods.filter((method) => method.id !== methodId),
    }));
  }, [updateClass]);

  const handleUpdateMethod = useCallback((classId: string, methodId: string, patch: Partial<BlueprintClassMethod>) => {
    updateClass(classId, (target) => ({
      ...target,
      methods: target.methods.map((method) => (method.id === methodId ? { ...method, ...patch } : method)),
    }));
  }, [updateClass]);

  const handleOpenClassEditor = useCallback((classId: string) => {
    setEditingClassId(classId);
    onOpenClassEditor?.(classId);
  }, [onOpenClassEditor]);

  const editingClass = useMemo(
    () => classes.find((item) => item.id === editingClassId) ?? null,
    [classes, editingClassId]
  );

  const isProblemStatus = useCallback((status: ClassStorageStatusItem['status']): boolean => (
    status === 'missing' || status === 'failed' || status === 'fallbackEmbedded' || status === 'conflict'
  ), []);

  const visibleClasses = useMemo(() => {
    if (classFilter === 'all') {
      return classes;
    }
    return classes.filter((item) => {
      const storageItem = classStorageItemsById.get(item.id);
      const status = storageItem?.status ?? 'unbound';
      if (classFilter === 'problem') {
        return isProblemStatus(status);
      }
      return status === 'dirty';
    });
  }, [classFilter, classStorageItemsById, classes, isProblemStatus]);

  const visibleStorageItems = useMemo(() => {
    const items = classStorageStatus?.classItems ?? [];
    if (classFilter === 'all') {
      return items;
    }
    return items.filter((item) => {
      if (classFilter === 'problem') {
        return isProblemStatus(item.status);
      }
      return item.status === 'dirty';
    });
  }, [classFilter, classStorageStatus?.classItems, isProblemStatus]);

  const handleClassDragStart = useCallback((
    event: React.DragEvent<HTMLElement>,
    request: ClassNodeInsertRequest
  ) => {
    event.dataTransfer.setData(CLASS_NODE_DRAG_MIME, serializeClassNodeDragPayload(request));
    event.dataTransfer.effectAllowed = 'copyMove';
  }, []);

  return (
    <section className="class-list-panel" data-testid="class-panel">
      <div className="class-list-header">
        <div className="panel-header-title">
          <button
            type="button"
            className="panel-collapse-btn"
            onClick={onToggleCollapsed}
            title={isRu ? 'Свернуть или развернуть секцию' : 'Collapse or expand section'}
            data-testid="classes-section-toggle"
            aria-label={isRu ? 'Переключить секцию классов' : 'Toggle classes section'}
          >
            {collapsed ? '▶' : '▼'}
          </button>
          <h3>{translate('panel.classes.title', 'Классы')}</h3>
          <span className={`class-advanced-chip ${classNodesAdvancedEnabled ? 'class-advanced-chip--enabled' : ''}`}>
            {isRu ? (classNodesAdvancedEnabled ? 'РАСШИР.' : 'БАЗОВЫЕ') : (classNodesAdvancedEnabled ? 'ADVANCED' : 'CORE')}
          </span>
        </div>
        <button type="button" className="btn-add-class" onClick={handleCreateClass}>
          + {translate('panel.classes.create', 'Класс')}
        </button>
      </div>

      {!collapsed && (
        <div className="class-list">
          <div className="class-filter-row" role="tablist" aria-label={isRu ? 'Фильтр классов' : 'Class filter'}>
            <button type="button" className={`class-filter-btn ${classFilter === 'all' ? 'active' : ''}`} onClick={() => setClassFilter('all')}>{isRu ? 'Все' : 'All'}</button>
            <button type="button" className={`class-filter-btn ${classFilter === 'problem' ? 'active' : ''}`} onClick={() => setClassFilter('problem')}>{isRu ? 'Проблемные' : 'Issues'}</button>
            <button type="button" className={`class-filter-btn ${classFilter === 'changed' ? 'active' : ''}`} onClick={() => setClassFilter('changed')}>{isRu ? 'Изменённые' : 'Changed'}</button>
          </div>

          <div className="class-files-section">
            <div className="class-files-section-header">
              <strong>{isRu ? 'Файлы классов' : 'Class files'}</strong>
              <span className="class-files-mode-chip">{isRu ? (isSidecarMode ? 'ВНЕШНИЕ' : 'В ГРАФЕ') : (isSidecarMode ? 'SIDECAR' : 'EMBEDDED')}</span>
            </div>
            <div className="class-files-actions">
              <button type="button" className="btn-add-class-subitem" onClick={() => onOpenGraphMulticode?.()} disabled={!onOpenGraphMulticode || !canOpenGraphMulticode}>{isRu ? 'Открыть граф' : 'Open graph'}</button>
              <button type="button" className="btn-add-class-subitem" onClick={() => onReloadClassStorage?.()} disabled={!onReloadClassStorage || !isSidecarMode}>{isRu ? 'Перечитать' : 'Reload'}</button>
              <button type="button" className="btn-add-class-subitem" onClick={() => onRepairClassStorage?.()} disabled={!onRepairClassStorage || !isSidecarMode}>{isRu ? 'Починить привязки' : 'Repair'}</button>
            </div>
            {isSidecarMode ? (
              <div className="class-files-list">
                {visibleStorageItems.length === 0 && (
                  <div className="class-section-empty">{isRu ? 'Нет файлов классов для текущего фильтра' : 'No class sidecar entries for current filter'}</div>
                )}
                {visibleStorageItems.map((storageItem) => {
                  const canOpenSidecar = Boolean(storageItem.filePath?.trim());
                  const storageLabel = getStatusLabel(storageItem.status);
                  const storageReason = storageItem.reason?.trim() || '';
                  return (
                    <div className="class-file-item" key={`file-${storageItem.classId}`}>
                      <div className="class-file-item-head">
                        <span className="class-file-item-name">{storageItem.className || storageItem.classId}</span>
                        <span className={`class-storage-chip class-storage-chip--${storageItem.status}`}>{storageLabel}</span>
                      </div>
                      <div className="class-file-item-path" title={storageReason || (isRu ? 'Состояние файла класса' : 'Class sidecar status')}>
                        {storageItem.bindingFile || storageItem.filePath || '—'}
                      </div>
                      {storageReason && <div className="class-file-item-reason">{storageReason}</div>}
                      <div className="class-file-item-actions">
                        <button type="button" className="btn-add-class-subitem" onClick={() => onOpenClassSidecar?.(storageItem.classId)} disabled={!onOpenClassSidecar || !canOpenSidecar}>{isRu ? 'Открыть' : 'Open'}</button>
                        <button type="button" className="btn-add-class-subitem" onClick={() => onReloadClassStorage?.(storageItem.classId)} disabled={!onReloadClassStorage}>{isRu ? 'Перечитать' : 'Reload'}</button>
                        <button type="button" className="btn-add-class-subitem" onClick={() => onRepairClassStorage?.(storageItem.classId)} disabled={!onRepairClassStorage}>{isRu ? 'Починить' : 'Repair'}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="class-section-empty">{isRu ? 'Внешние файлы классов отключены, данные хранятся в графе.' : 'Sidecar mode is off, classes are stored in graph.'}</div>
            )}
          </div>

          {visibleClasses.length === 0 && <p className="no-classes">{translate('panel.classes.empty', 'Пока нет классов')}</p>}

          {visibleClasses.map((item) => {
            const storageItem = classStorageItemsById.get(item.id);
            const storageLabel = getStatusLabel(storageItem?.status ?? 'unbound');
            const storageReason = storageItem?.reason?.trim() || '';
            const canOpenSidecar = Boolean(storageItem?.filePath?.trim());
            const hasBaseClass = Array.isArray(item.baseClasses) && item.baseClasses.some((baseClass) => baseClass.trim().length > 0);
            return (
              <article className="class-item class-item-v2" key={item.id}>
                <div className="class-item-header class-item-header-v2">
                  <div className="class-row-fields class-row-fields-header">
                    <input className="class-input" aria-label={translate('panel.classes.name', 'Имя класса')} value={item.name} onChange={(event) => updateClass(item.id, (target) => ({ ...target, name: normalizeCodeName(event.currentTarget.value, target.name) }))} placeholder={isRu ? 'Кодовое имя' : 'Code name'} />
                    <input className="class-input class-input-secondary" aria-label={isRu ? 'Отображаемое имя класса' : 'Class RU name'} value={item.nameRu ?? item.name} onChange={(event) => updateClass(item.id, (target) => ({ ...target, nameRu: normalizeDisplayName(event.currentTarget.value, target.name) }))} placeholder={isRu ? 'Отображаемое имя' : 'RU name'} />
                  </div>
                  <div className="class-storage-row">
                    <span className={`class-storage-chip class-storage-chip--${storageItem?.status ?? 'unbound'}`} title={storageReason || (isRu ? 'Статус хранения класса' : 'Class storage status')} data-testid={`class-storage-chip-${item.id}`}>{storageLabel}</span>
                    {isSidecarMode && <button type="button" className="btn-add-class-subitem" onClick={() => onOpenClassSidecar?.(item.id)} disabled={!onOpenClassSidecar || !canOpenSidecar}>{isRu ? 'Файл' : 'Sidecar'}</button>}
                    <button type="button" className="btn-add-class-subitem" onClick={() => onOpenGraphMulticode?.()} disabled={!onOpenGraphMulticode || !canOpenGraphMulticode}>{isRu ? 'Граф' : 'Graph'}</button>
                    <button type="button" className="btn-add-class-subitem" onClick={() => onReloadClassStorage?.(item.id)} disabled={!onReloadClassStorage}>{isRu ? 'Перечитать' : 'Reload'}</button>
                    <button type="button" className="btn-add-class-subitem" onClick={() => onRepairClassStorage?.(item.id)} disabled={!onRepairClassStorage}>{isRu ? 'Починить' : 'Repair'}</button>
                  </div>
                  <div className="class-row-actions class-row-actions-header">
                    <button type="button" className="btn-add-class-subitem" onClick={() => onInsertClassNode?.({ kind: 'constructor', classId: item.id })} title={isRu ? 'Добавить узел конструктора' : 'Insert constructor node'} disabled={!onInsertClassNode}>{isRu ? '+Констр' : '+Ctor'}</button>
                    <button type="button" className="btn-add-class-subitem" onClick={() => handleOpenClassEditor(item.id)} title={isRu ? 'Открыть расширенный редактор' : 'Open full editor'}>{isRu ? 'Редактор' : 'Editor'}</button>
                    <button type="button" className="btn-class-remove" onClick={() => handleDeleteClass(item.id)} title={translate('panel.classes.delete', 'Удалить')}>×</button>
                  </div>
                </div>

                {classNodesAdvancedEnabled && (
                  <div className="class-section class-section-advanced">
                    <div className="class-section-header">
                      <strong>{isRu ? 'Расширенные узлы классов' : 'Advanced class nodes'}</strong>
                      <span className="class-section-empty">{isRu ? 'Точечные C++ операции' : 'Targeted C++ operations'}</span>
                    </div>
                    <div className="class-row-actions class-row-actions-advanced">
                      <button type="button" className="btn-add-class-subitem" onClick={() => onInsertClassNode?.({ kind: 'init-list-ctor', classId: item.id })} disabled={!onInsertClassNode} title={isRu ? 'Создать brace-init узел' : 'Insert brace-init constructor node'}>+Init</button>
                      <button type="button" className="btn-add-class-subitem" onClick={() => onInsertClassNode?.({ kind: 'make-unique', classId: item.id })} disabled={!onInsertClassNode} title={isRu ? 'Создать std::make_unique узел' : 'Insert std::make_unique node'}>+Unique</button>
                      <button type="button" className="btn-add-class-subitem" onClick={() => onInsertClassNode?.({ kind: 'make-shared', classId: item.id })} disabled={!onInsertClassNode} title={isRu ? 'Создать std::make_shared узел' : 'Insert std::make_shared node'}>+Shared</button>
                      <button type="button" className="btn-add-class-subitem" onClick={() => onInsertClassNode?.({ kind: 'cast-static', classId: item.id })} disabled={!onInsertClassNode} title={isRu ? 'Создать static_cast узел' : 'Insert static_cast node'}>+Cast</button>
                      <button type="button" className="btn-add-class-subitem" onClick={() => onInsertClassNode?.({ kind: 'cast-dynamic', classId: item.id })} disabled={!onInsertClassNode} title={isRu ? 'Создать dynamic_cast узел' : 'Insert dynamic_cast node'}>+Dyn</button>
                      <button type="button" className="btn-add-class-subitem" onClick={() => onInsertClassNode?.({ kind: 'cast-const', classId: item.id })} disabled={!onInsertClassNode} title={isRu ? 'Создать const_cast узел' : 'Insert const_cast node'}>+Const</button>
                      <button type="button" className="btn-add-class-subitem" onClick={() => onInsertClassNode?.({ kind: 'is-type', classId: item.id })} disabled={!onInsertClassNode} title={isRu ? 'Создать узел проверки типа' : 'Insert is-type node'}>+Is</button>
                      <button type="button" className="btn-add-class-subitem btn-add-class-subitem-danger" onClick={() => onInsertClassNode?.({ kind: 'delete-object', classId: item.id })} disabled={!onInsertClassNode} title={isRu ? 'Опасная операция raw delete для pointer' : 'Dangerous raw delete pointer node'}>+Delete</button>
                    </div>
                  </div>
                )}

                <div className="class-section">
                  <div className="class-section-header">
                    <strong>{translate('panel.classes.fields', 'Поля')}</strong>
                    <button type="button" className="btn-add-class-subitem" onClick={() => handleAddMember(item.id)}>+ {translate('panel.classes.field.add', 'Поле')}</button>
                  </div>
                  <div className="class-section-list">
                    {item.members.length === 0 && <div className="class-section-empty">{isRu ? 'Нет полей' : 'No fields'}</div>}
                    {item.members.map((member) => (
                      <div className="class-row class-row-v2" key={member.id} draggable={Boolean(onInsertClassNode)} onDragStart={(event) => handleClassDragStart(event, member.isStatic ? { kind: 'static-get-member', classId: item.id, memberId: member.id } : { kind: 'get-member', classId: item.id, memberId: member.id })}>
                        <div className="class-row-fields">
                          <input className="class-input" aria-label={translate('panel.classes.field.name', 'Имя поля')} value={member.name} onChange={(event) => handleUpdateMember(item.id, member.id, { name: normalizeCodeName(event.currentTarget.value, member.name) })} placeholder={isRu ? 'Кодовое имя' : 'Code name'} />
                          <input className="class-input class-input-secondary" aria-label={isRu ? 'Отображаемое имя поля' : 'Field RU name'} value={member.nameRu ?? member.name} onChange={(event) => handleUpdateMember(item.id, member.id, { nameRu: normalizeDisplayName(event.currentTarget.value, member.name) })} placeholder={isRu ? 'Отображаемое имя' : 'RU name'} />
                          <select className="class-select" aria-label={translate('panel.classes.field.type', 'Тип поля')} value={member.dataType} onChange={(event) => handleUpdateMember(item.id, member.id, { dataType: event.currentTarget.value as PortDataType })}>
                            {dataTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                          </select>
                        </div>
                        <div className="class-row-actions">
                          <button type="button" className="btn-add-class-subitem" onClick={() => onInsertClassNode?.({ kind: 'get-member', classId: item.id, memberId: member.id })} disabled={!onInsertClassNode}>+Get</button>
                          <button type="button" className="btn-add-class-subitem" onClick={() => onInsertClassNode?.({ kind: 'set-member', classId: item.id, memberId: member.id })} disabled={!onInsertClassNode}>+Set</button>
                          <button type="button" className="btn-add-class-subitem" onClick={() => onInsertClassNode?.({ kind: 'static-get-member', classId: item.id, memberId: member.id })} disabled={!onInsertClassNode || member.isStatic !== true}>+SGet</button>
                          <button type="button" className="btn-add-class-subitem" onClick={() => onInsertClassNode?.({ kind: 'static-set-member', classId: item.id, memberId: member.id })} disabled={!onInsertClassNode || member.isStatic !== true}>+SSet</button>
                          {classNodesAdvancedEnabled && <button type="button" className="btn-add-class-subitem" onClick={() => onInsertClassNode?.({ kind: 'address-of-member', classId: item.id, memberId: member.id })} disabled={!onInsertClassNode} title={isRu ? 'Создать узел адреса поля' : 'Insert address-of-member node'}>+Addr</button>}
                          <button type="button" className="btn-class-remove" onClick={() => handleDeleteMember(item.id, member.id)} title={translate('panel.classes.field.delete', 'Удалить поле')}>×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="class-section">
                  <div className="class-section-header">
                    <strong>{translate('panel.classes.methods', 'Методы')}</strong>
                    <button type="button" className="btn-add-class-subitem" onClick={() => handleAddMethod(item.id)}>+ {translate('panel.classes.method.add', 'Метод')}</button>
                  </div>
                  <div className="class-section-list">
                    {item.methods.length === 0 && <div className="class-section-empty">{isRu ? 'Нет методов' : 'No methods'}</div>}
                    {item.methods.map((method) => (
                      <div className="class-row class-row-v2" key={method.id} draggable={Boolean(onInsertClassNode)} onDragStart={(event) => handleClassDragStart(event, (method.methodKind ?? 'method') === 'constructor' ? { kind: 'constructor-overload', classId: item.id, methodId: method.id } : method.isStatic === true ? { kind: 'static-method', classId: item.id, methodId: method.id } : { kind: 'method', classId: item.id, methodId: method.id })}>
                        <div className="class-row-fields">
                          <input className="class-input" aria-label={translate('panel.classes.method.name', 'Имя метода')} value={method.name} onChange={(event) => handleUpdateMethod(item.id, method.id, { name: normalizeCodeName(event.currentTarget.value, method.name) })} placeholder={isRu ? 'Кодовое имя' : 'Code name'} />
                          <input className="class-input class-input-secondary" aria-label={isRu ? 'Отображаемое имя метода' : 'Method RU name'} value={method.nameRu ?? method.name} onChange={(event) => handleUpdateMethod(item.id, method.id, { nameRu: normalizeDisplayName(event.currentTarget.value, method.name) })} placeholder={isRu ? 'Отображаемое имя' : 'RU name'} />
                          <select className="class-select" aria-label={translate('panel.classes.method.returnType', 'Возвращаемый тип')} value={method.returnType} onChange={(event) => handleUpdateMethod(item.id, method.id, { returnType: event.currentTarget.value as PortDataType })}>
                            {dataTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                          </select>
                        </div>
                        <div className="class-row-actions">
                          <label className="class-flag-toggle">
                            <input type="checkbox" checked={method.isStatic === true} onChange={(event) => handleUpdateMethod(item.id, method.id, { isStatic: event.currentTarget.checked })} />
                            <span>static</span>
                          </label>
                          <button type="button" className="btn-add-class-subitem" onClick={() => onInsertClassNode?.({ kind: 'method', classId: item.id, methodId: method.id })} disabled={!onInsertClassNode || (method.methodKind ?? 'method') !== 'method'}>+Call</button>
                          <button type="button" className="btn-add-class-subitem" onClick={() => onInsertClassNode?.({ kind: 'constructor-overload', classId: item.id, methodId: method.id })} disabled={!onInsertClassNode || (method.methodKind ?? 'method') !== 'constructor'}>+Ctor</button>
                          <button type="button" className="btn-add-class-subitem" onClick={() => onInsertClassNode?.({ kind: 'static-method', classId: item.id, methodId: method.id })} disabled={!onInsertClassNode || method.isStatic !== true || (method.methodKind ?? 'method') !== 'method'}>+Static</button>
                          {classNodesAdvancedEnabled && (
                            <>
                              <button type="button" className="btn-add-class-subitem" onClick={() => onInsertClassNode?.({ kind: 'call-base-method', classId: item.id, methodId: method.id, baseClassName: item.baseClasses?.find((baseClass) => baseClass.trim().length > 0) })} disabled={!onInsertClassNode || !hasBaseClass || method.isStatic === true || (method.methodKind ?? 'method') !== 'method'} title={isRu ? 'Вызвать реализацию базового класса' : 'Insert call-base-method node'}>+Base</button>
                              <span className="class-advanced-chip class-advanced-chip--inline">{isRu ? 'advanced' : 'advanced'}</span>
                            </>
                          )}
                          <button type="button" className="btn-class-remove" onClick={() => handleDeleteMethod(item.id, method.id)} title={translate('panel.classes.method.delete', 'Удалить метод')}>×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editingClass && (
        <ClassEditor
          classItem={editingClass}
          displayLanguage={displayLanguage}
          onSave={(nextClass) => {
            onClassesChange(classes.map((item) => (item.id === nextClass.id ? nextClass : item)));
            setEditingClassId(null);
          }}
          onClose={() => setEditingClassId(null)}
          onDelete={() => handleDeleteClass(editingClass.id)}
        />
      )}
    </section>
  );
};

export default ClassPanel;
