import React, { useCallback, useMemo } from 'react';
import type {
  BlueprintClass,
  BlueprintClassMember,
  BlueprintClassMethod,
  BlueprintGraphState,
} from '../shared/blueprintTypes';
import { VARIABLE_DATA_TYPES } from '../shared/blueprintTypes';
import type { PortDataType } from '../shared/portTypes';
import { getTranslation } from '../shared/translations';

interface ClassPanelProps {
  graphState: BlueprintGraphState;
  onClassesChange: (classes: BlueprintClass[]) => void;
  displayLanguage: 'ru' | 'en';
}

const createId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const dataTypes = VARIABLE_DATA_TYPES.filter((type): type is PortDataType => type !== 'execution');

export const ClassPanel: React.FC<ClassPanelProps> = ({
  graphState,
  onClassesChange,
  displayLanguage,
}) => {
  const translate = useCallback(
    (key: Parameters<typeof getTranslation>[1], fallback: string): string =>
      getTranslation(displayLanguage, key, undefined, fallback),
    [displayLanguage],
  );

  const classes = useMemo(() => graphState.classes ?? [], [graphState.classes]);

  const updateClass = useCallback((classId: string, updater: (target: BlueprintClass) => BlueprintClass) => {
    onClassesChange(classes.map((item) => (item.id === classId ? updater(item) : item)));
  }, [classes, onClassesChange]);

  const handleCreateClass = useCallback(() => {
    const nextIndex = classes.length + 1;
    const newClass: BlueprintClass = {
      id: createId('class'),
      name: `NewClass${nextIndex}`,
      members: [],
      methods: [],
    };
    onClassesChange([...classes, newClass]);
  }, [classes, onClassesChange]);

  const handleRenameClass = useCallback((classId: string, name: string) => {
    const safeName = name.trim();
    if (!safeName) {
      return;
    }
    updateClass(classId, (target) => ({ ...target, name: safeName }));
  }, [updateClass]);

  const handleDeleteClass = useCallback((classId: string) => {
    onClassesChange(classes.filter((item) => item.id !== classId));
  }, [classes, onClassesChange]);

  const handleAddMember = useCallback((classId: string) => {
    updateClass(classId, (target) => {
      const newMember: BlueprintClassMember = {
        id: createId('member'),
        name: `field${target.members.length + 1}`,
        dataType: 'int32',
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
      const newMethod: BlueprintClassMethod = {
        id: createId('method'),
        name: `method${target.methods.length + 1}`,
        returnType: 'any',
        params: [],
        access: 'public',
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

  return (
    <section className="class-panel" data-testid="class-panel">
      <div className="class-panel__header">
        <h3>{translate('panel.classes.title', 'Классы')}</h3>
        <button type="button" onClick={handleCreateClass}>
          + {translate('panel.classes.create', 'Класс')}
        </button>
      </div>

      <div className="class-panel__list">
        {classes.length === 0 && (
          <p className="class-panel__empty">{translate('panel.classes.empty', 'Пока нет классов')}</p>
        )}

        {classes.map((item) => (
          <article className="class-panel__item" key={item.id}>
            <div className="class-panel__row">
              <input
                aria-label={translate('panel.classes.name', 'Имя класса')}
                defaultValue={item.name}
                onBlur={(event) => handleRenameClass(item.id, event.currentTarget.value)}
              />
              <button type="button" onClick={() => handleDeleteClass(item.id)}>
                {translate('panel.classes.delete', 'Удалить')}
              </button>
            </div>

            <div className="class-panel__block">
              <div className="class-panel__row class-panel__block-title">
                <strong>{translate('panel.classes.fields', 'Поля')}</strong>
                <button type="button" onClick={() => handleAddMember(item.id)}>
                  + {translate('panel.classes.field.add', 'Поле')}
                </button>
              </div>
              {item.members.map((member) => (
                <div className="class-panel__row" key={member.id}>
                  <input
                    aria-label={translate('panel.classes.field.name', 'Имя поля')}
                    defaultValue={member.name}
                    onBlur={(event) => handleUpdateMember(item.id, member.id, { name: event.currentTarget.value.trim() || member.name })}
                  />
                  <select
                    aria-label={translate('panel.classes.field.type', 'Тип поля')}
                    value={member.dataType}
                    onChange={(event) => handleUpdateMember(item.id, member.id, { dataType: event.currentTarget.value as PortDataType })}
                  >
                    {dataTypes.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => handleDeleteMember(item.id, member.id)}>
                    {translate('panel.classes.field.delete', 'Удалить поле')}
                  </button>
                </div>
              ))}
            </div>

            <div className="class-panel__block">
              <div className="class-panel__row class-panel__block-title">
                <strong>{translate('panel.classes.methods', 'Методы')}</strong>
                <button type="button" onClick={() => handleAddMethod(item.id)}>
                  + {translate('panel.classes.method.add', 'Метод')}
                </button>
              </div>
              {item.methods.map((method) => (
                <div className="class-panel__row" key={method.id}>
                  <input
                    aria-label={translate('panel.classes.method.name', 'Имя метода')}
                    defaultValue={method.name}
                    onBlur={(event) => handleUpdateMethod(item.id, method.id, { name: event.currentTarget.value.trim() || method.name })}
                  />
                  <select
                    aria-label={translate('panel.classes.method.returnType', 'Возвращаемый тип')}
                    value={method.returnType}
                    onChange={(event) => handleUpdateMethod(item.id, method.id, { returnType: event.currentTarget.value as PortDataType })}
                  >
                    <option value="any">any</option>
                    {dataTypes.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => handleDeleteMethod(item.id, method.id)}>
                    {translate('panel.classes.method.delete', 'Удалить метод')}
                  </button>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
