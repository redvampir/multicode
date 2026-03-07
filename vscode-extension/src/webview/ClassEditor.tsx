import React, { useCallback, useMemo, useState } from 'react';
import type {
  BlueprintClass,
  BlueprintClassAccess,
  BlueprintClassMember,
  BlueprintClassMethod,
  BlueprintClassMethodParameter,
} from '../shared/blueprintTypes';
import { VARIABLE_DATA_TYPES } from '../shared/blueprintTypes';
import type { PortDataType } from '../shared/portTypes';

interface ClassEditorProps {
  classItem: BlueprintClass;
  displayLanguage: 'ru' | 'en';
  onSave: (nextClass: BlueprintClass) => void;
  onClose: () => void;
  onDelete?: () => void;
}

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const parseCsvList = (value: string): string[] => {
  const unique = new Set<string>();
  for (const chunk of value.split(',')) {
    const trimmed = chunk.trim();
    if (trimmed) {
      unique.add(trimmed);
    }
  }
  return Array.from(unique);
};

const stringifyCsvList = (items: string[] | undefined): string =>
  Array.isArray(items) ? items.join(', ') : '';

const ACCESS_OPTIONS: BlueprintClassAccess[] = ['public', 'protected', 'private'];
const TYPE_OPTIONS = VARIABLE_DATA_TYPES.filter((type): type is PortDataType => type !== 'execution');

const style: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(17, 17, 27, 0.88)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    backdropFilter: 'blur(4px)',
  },
  dialog: {
    width: 'min(1160px, 96vw)',
    maxHeight: '92vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#1e1e2e',
    border: '1px solid #313244',
    borderRadius: 10,
    overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '14px 16px',
    borderBottom: '1px solid #313244',
    background: 'linear-gradient(135deg, #1e1e2e 0%, #181825 100%)',
  },
  title: {
    margin: 0,
    color: '#cdd6f4',
    fontSize: 18,
    fontWeight: 700,
  },
  body: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 14,
    padding: 14,
    overflow: 'auto',
  },
  card: {
    border: '1px solid #313244',
    borderRadius: 8,
    background: '#181825',
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    minHeight: 0,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: {
    margin: 0,
    color: '#cba6f7',
    fontSize: 13,
    fontWeight: 700,
  },
  input: {
    width: '100%',
    background: '#11111b',
    color: '#cdd6f4',
    border: '1px solid #45475a',
    borderRadius: 5,
    padding: '7px 8px',
    fontSize: 12,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '1.2fr 1.2fr 0.8fr 0.8fr auto auto',
    gap: 6,
    alignItems: 'center',
    border: '1px solid #313244',
    borderRadius: 6,
    padding: 6,
    background: '#11111b',
    minWidth: 0,
  },
  rowMethod: {
    display: 'block',
    border: '1px solid #313244',
    borderRadius: 6,
    padding: 6,
    background: '#11111b',
    minWidth: 0,
  },
  rowMethodMain: {
    display: 'grid',
    gridTemplateColumns: '1.1fr 1.1fr 0.9fr 0.9fr 0.9fr auto',
    gap: 6,
    alignItems: 'center',
    minWidth: 0,
  },
  rowMethodFlags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  tinyBtn: {
    border: '1px solid #45475a',
    background: '#313244',
    color: '#cdd6f4',
    borderRadius: 4,
    padding: '4px 7px',
    fontSize: 11,
    cursor: 'pointer',
  },
  iconBtn: {
    border: '1px solid #45475a',
    background: '#313244',
    color: '#f38ba8',
    borderRadius: 4,
    width: 26,
    height: 26,
    fontSize: 15,
    cursor: 'pointer',
  },
  methodParams: {
    marginTop: 6,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    borderTop: '1px solid #313244',
    paddingTop: 6,
  },
  paramRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 0.9fr 0.9fr auto',
    gap: 6,
    alignItems: 'center',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderTop: '1px solid #313244',
    padding: '12px 14px',
    background: 'rgba(17, 17, 27, 0.6)',
  },
  btn: {
    border: '1px solid #45475a',
    background: '#313244',
    color: '#cdd6f4',
    borderRadius: 6,
    padding: '7px 12px',
    fontSize: 12,
    cursor: 'pointer',
  },
};

export const ClassEditor: React.FC<ClassEditorProps> = ({
  classItem,
  displayLanguage,
  onSave,
  onClose,
  onDelete,
}) => {
  const isRu = displayLanguage === 'ru';
  const [draft, setDraft] = useState<BlueprintClass>(() => ({
    ...classItem,
    nameRu: classItem.nameRu ?? classItem.name,
    classType: classItem.classType ?? 'class',
    baseClasses: Array.isArray(classItem.baseClasses) ? classItem.baseClasses : [],
    headerIncludes: Array.isArray(classItem.headerIncludes) ? classItem.headerIncludes : [],
    sourceIncludes: Array.isArray(classItem.sourceIncludes) ? classItem.sourceIncludes : [],
    forwardDecls: Array.isArray(classItem.forwardDecls) ? classItem.forwardDecls : [],
    members: classItem.members.map((member) => ({
      ...member,
      nameRu: member.nameRu ?? member.name,
      isStatic: member.isStatic === true,
    })),
    methods: classItem.methods.map((method) => ({
      ...method,
      nameRu: method.nameRu ?? method.name,
      methodKind: method.methodKind ?? 'method',
      isNoexcept: method.isNoexcept === true,
      isPureVirtual: method.isPureVirtual === true,
      params: method.params.map((param) => ({ ...param, nameRu: param.nameRu ?? param.name })),
    })),
  }));

  const sortedAccessOptions = useMemo(
    () =>
      ACCESS_OPTIONS.map((access) => ({
        value: access,
        label: access,
      })),
    [],
  );

  const updateClass = useCallback((patch: Partial<BlueprintClass>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateMember = useCallback((memberId: string, patch: Partial<BlueprintClassMember>) => {
    setDraft((prev) => ({
      ...prev,
      members: prev.members.map((member) => (member.id === memberId ? { ...member, ...patch } : member)),
    }));
  }, []);

  const updateMethod = useCallback((methodId: string, patch: Partial<BlueprintClassMethod>) => {
    setDraft((prev) => ({
      ...prev,
      methods: prev.methods.map((method) => (method.id === methodId ? { ...method, ...patch } : method)),
    }));
  }, []);

  const updateParam = useCallback((methodId: string, paramId: string, patch: Partial<BlueprintClassMethodParameter>) => {
    setDraft((prev) => ({
      ...prev,
      methods: prev.methods.map((method) => {
        if (method.id !== methodId) {
          return method;
        }
        return {
          ...method,
          params: method.params.map((param) => (param.id === paramId ? { ...param, ...patch } : param)),
        };
      }),
    }));
  }, []);

  const addMember = useCallback(() => {
    const nextIndex = draft.members.length + 1;
    setDraft((prev) => ({
      ...prev,
      members: [
        ...prev.members,
        {
          id: makeId('member'),
          name: `field_${nextIndex}`,
          nameRu: `Поле ${nextIndex}`,
          dataType: 'int32',
          isStatic: false,
          access: 'private',
        },
      ],
    }));
  }, [draft.members.length]);

  const addMethod = useCallback(() => {
    const nextIndex = draft.methods.length + 1;
    setDraft((prev) => ({
      ...prev,
      methods: [
        ...prev.methods,
        {
          id: makeId('method'),
          name: `method_${nextIndex}`,
          nameRu: `Метод ${nextIndex}`,
          methodKind: 'method',
          returnType: 'any',
          params: [],
          access: 'public',
          isConst: false,
          isStatic: false,
          isNoexcept: false,
          isPureVirtual: false,
          isVirtual: false,
          isOverride: false,
        },
      ],
    }));
  }, [draft.methods.length]);

  const saveDraft = useCallback(() => {
    const normalizedMembers = draft.members.map((member, index) => {
      const fallbackName = `field_${index + 1}`;
      const codeName = member.name.trim() || fallbackName;
      const ruName = member.nameRu?.trim() || codeName;
      return {
        ...member,
        name: codeName,
        nameRu: ruName,
        isStatic: member.isStatic === true,
      };
    });
    const normalizedMethods = draft.methods.map((method, methodIndex) => {
      const fallbackName = `method_${methodIndex + 1}`;
      const codeName = method.name.trim() || fallbackName;
      const ruName = method.nameRu?.trim() || codeName;
      return {
        ...method,
        name: codeName,
        nameRu: ruName,
        methodKind: method.methodKind ?? 'method',
        isNoexcept: method.isNoexcept === true,
        isPureVirtual: method.isPureVirtual === true,
        params: method.params.map((param, paramIndex) => {
          const paramFallback = `arg_${paramIndex + 1}`;
          const paramCode = param.name.trim() || paramFallback;
          const paramRu = param.nameRu?.trim() || paramCode;
          return {
            ...param,
            name: paramCode,
            nameRu: paramRu,
          };
        }),
      };
    });
    const className = draft.name.trim() || 'NewClass';
    onSave({
      ...draft,
      name: className,
      nameRu: draft.nameRu?.trim() || className,
      classType: draft.classType ?? 'class',
      namespace: draft.namespace?.trim() || undefined,
      baseClasses: Array.from(new Set((draft.baseClasses ?? []).map((item) => item.trim()).filter((item) => item.length > 0))),
      headerIncludes: Array.from(new Set((draft.headerIncludes ?? []).map((item) => item.trim()).filter((item) => item.length > 0))),
      sourceIncludes: Array.from(new Set((draft.sourceIncludes ?? []).map((item) => item.trim()).filter((item) => item.length > 0))),
      forwardDecls: Array.from(new Set((draft.forwardDecls ?? []).map((item) => item.trim()).filter((item) => item.length > 0))),
      members: normalizedMembers,
      methods: normalizedMethods,
    });
  }, [draft, onSave]);

  return (
    <div className="class-editor-overlay" style={style.overlay}>
      <div className="class-editor-dialog" style={style.dialog}>
        <div style={style.header}>
          <h2 style={style.title}>{isRu ? 'Редактор класса' : 'Class Editor'}</h2>
          <button type="button" style={style.iconBtn} onClick={onClose} aria-label={isRu ? 'Закрыть' : 'Close'}>
            ×
          </button>
        </div>
        <div style={style.body}>
          <section style={style.card}>
            <div style={style.cardHeader}>
              <h3 style={style.cardTitle}>{isRu ? 'Основное' : 'General'}</h3>
            </div>
            <label>
              <input
                style={style.input}
                value={draft.name}
                onChange={(event) => updateClass({ name: event.currentTarget.value })}
                placeholder={isRu ? 'Code имя класса' : 'Class code name'}
              />
            </label>
            <label>
              <input
                style={style.input}
                value={draft.nameRu ?? ''}
                onChange={(event) => updateClass({ nameRu: event.currentTarget.value })}
                placeholder={isRu ? 'RU имя класса' : 'Class RU display name'}
              />
            </label>
            <label>
              <select
                style={style.input}
                value={draft.classType ?? 'class'}
                onChange={(event) => updateClass({ classType: event.currentTarget.value as BlueprintClass['classType'] })}
              >
                <option value="class">class</option>
                <option value="struct">struct</option>
              </select>
            </label>
            <label>
              <input
                style={style.input}
                value={draft.namespace ?? ''}
                onChange={(event) => updateClass({ namespace: event.currentTarget.value })}
                placeholder={isRu ? 'Namespace (опционально)' : 'Namespace (optional)'}
              />
            </label>
            <label>
              <input
                style={style.input}
                value={stringifyCsvList(draft.baseClasses)}
                onChange={(event) => updateClass({ baseClasses: parseCsvList(event.currentTarget.value) })}
                placeholder={isRu ? 'Базовые классы: public Foo, Bar' : 'Base classes: public Foo, Bar'}
              />
            </label>
            <label>
              <input
                style={style.input}
                value={stringifyCsvList(draft.forwardDecls)}
                onChange={(event) => updateClass({ forwardDecls: parseCsvList(event.currentTarget.value) })}
                placeholder={isRu ? 'Forward decls: class Foo, struct Bar' : 'Forward decls: class Foo, struct Bar'}
              />
            </label>
            <label>
              <input
                style={style.input}
                value={stringifyCsvList(draft.headerIncludes)}
                onChange={(event) => updateClass({ headerIncludes: parseCsvList(event.currentTarget.value) })}
                placeholder={isRu ? 'Header includes: <string>, "foo.hpp"' : 'Header includes: <string>, "foo.hpp"'}
              />
            </label>
            <label>
              <input
                style={style.input}
                value={stringifyCsvList(draft.sourceIncludes)}
                onChange={(event) => updateClass({ sourceIncludes: parseCsvList(event.currentTarget.value) })}
                placeholder={isRu ? 'Source includes: <algorithm>, "bar.hpp"' : 'Source includes: <algorithm>, "bar.hpp"'}
              />
            </label>
          </section>

          <section style={style.card}>
            <div style={style.cardHeader}>
              <h3 style={style.cardTitle}>{isRu ? 'Поля' : 'Fields'}</h3>
              <button type="button" style={style.tinyBtn} onClick={addMember}>
                + {isRu ? 'Поле' : 'Field'}
              </button>
            </div>
            {draft.members.map((member) => (
              <div key={member.id} style={style.row}>
                <input
                  style={style.input}
                  value={member.name}
                  onChange={(event) => updateMember(member.id, { name: event.currentTarget.value })}
                  placeholder={isRu ? 'code имя' : 'code name'}
                />
                <input
                  style={style.input}
                  value={member.nameRu ?? ''}
                  onChange={(event) => updateMember(member.id, { nameRu: event.currentTarget.value })}
                  placeholder={isRu ? 'RU имя' : 'RU name'}
                />
                <select
                  style={style.input}
                  value={member.dataType}
                  onChange={(event) => updateMember(member.id, { dataType: event.currentTarget.value as PortDataType })}
                >
                  {TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <select
                  style={style.input}
                  value={member.access}
                  onChange={(event) => updateMember(member.id, { access: event.currentTarget.value as BlueprintClassAccess })}
                >
                  {sortedAccessOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <label style={{ color: '#a6adc8', fontSize: 11 }}>
                  <input
                    type="checkbox"
                    checked={member.isStatic === true}
                    onChange={(event) => updateMember(member.id, { isStatic: event.currentTarget.checked })}
                  />{' '}
                  static
                </label>
                <button
                  type="button"
                  style={style.iconBtn}
                  onClick={() => setDraft((prev) => ({ ...prev, members: prev.members.filter((item) => item.id !== member.id) }))}
                >
                  ×
                </button>
              </div>
            ))}
          </section>

          <section style={{ ...style.card, gridColumn: '1 / -1' }}>
            <div style={style.cardHeader}>
              <h3 style={style.cardTitle}>{isRu ? 'Методы' : 'Methods'}</h3>
              <button type="button" style={style.tinyBtn} onClick={addMethod}>
                + {isRu ? 'Метод' : 'Method'}
              </button>
            </div>
            {draft.methods.map((method) => (
              <div key={method.id} style={style.rowMethod}>
                <div style={style.rowMethodMain}>
                  <input
                    style={style.input}
                    value={method.name}
                    onChange={(event) => updateMethod(method.id, { name: event.currentTarget.value })}
                    placeholder={isRu ? 'code имя' : 'code name'}
                  />
                  <input
                    style={style.input}
                    value={method.nameRu ?? ''}
                    onChange={(event) => updateMethod(method.id, { nameRu: event.currentTarget.value })}
                    placeholder={isRu ? 'RU имя' : 'RU name'}
                  />
                  <select
                    style={style.input}
                    value={method.returnType}
                    onChange={(event) => updateMethod(method.id, { returnType: event.currentTarget.value as PortDataType })}
                  >
                    {TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <select
                    style={style.input}
                    value={method.access}
                    onChange={(event) => updateMethod(method.id, { access: event.currentTarget.value as BlueprintClassAccess })}
                  >
                    {sortedAccessOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                  </select>
                  <select
                    style={style.input}
                    value={method.methodKind ?? 'method'}
                    onChange={(event) => updateMethod(method.id, { methodKind: event.currentTarget.value as BlueprintClassMethod['methodKind'] })}
                  >
                    <option value="method">{isRu ? 'method' : 'method'}</option>
                    <option value="constructor">{isRu ? 'constructor' : 'constructor'}</option>
                    <option value="destructor">{isRu ? 'destructor' : 'destructor'}</option>
                  </select>
                  <button
                    type="button"
                    style={style.iconBtn}
                    onClick={() => setDraft((prev) => ({ ...prev, methods: prev.methods.filter((item) => item.id !== method.id) }))}
                  >
                    ×
                  </button>
                </div>
                <div style={style.rowMethodFlags}>
                  <label style={{ color: '#a6adc8', fontSize: 11 }}>
                    <input
                      type="checkbox"
                      checked={method.isStatic === true}
                      onChange={(event) => updateMethod(method.id, { isStatic: event.currentTarget.checked })}
                    />{' '}
                    static
                  </label>
                  <label style={{ color: '#a6adc8', fontSize: 11 }}>
                    <input
                      type="checkbox"
                      checked={method.isConst === true}
                      onChange={(event) => updateMethod(method.id, { isConst: event.currentTarget.checked })}
                    />{' '}
                    const
                  </label>
                  <label style={{ color: '#a6adc8', fontSize: 11 }}>
                    <input
                      type="checkbox"
                      checked={method.isVirtual === true}
                      onChange={(event) => updateMethod(method.id, { isVirtual: event.currentTarget.checked })}
                    />{' '}
                    virtual
                  </label>
                  <label style={{ color: '#a6adc8', fontSize: 11 }}>
                    <input
                      type="checkbox"
                      checked={method.isOverride === true}
                      onChange={(event) => updateMethod(method.id, { isOverride: event.currentTarget.checked })}
                    />{' '}
                    override
                  </label>
                  <label style={{ color: '#a6adc8', fontSize: 11 }}>
                    <input
                      type="checkbox"
                      checked={method.isNoexcept === true}
                      onChange={(event) => updateMethod(method.id, { isNoexcept: event.currentTarget.checked })}
                    />{' '}
                    noexcept
                  </label>
                  <label style={{ color: '#a6adc8', fontSize: 11 }}>
                    <input
                      type="checkbox"
                      checked={method.isPureVirtual === true}
                      onChange={(event) => updateMethod(method.id, { isPureVirtual: event.currentTarget.checked })}
                    />{' '}
                    pure virtual
                  </label>
                </div>
                <div style={style.methodParams}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <strong style={{ color: '#bac2de', fontSize: 12 }}>{isRu ? 'Параметры' : 'Parameters'}</strong>
                    <button
                      type="button"
                      style={style.tinyBtn}
                      onClick={() =>
                        updateMethod(method.id, {
                          params: [
                            ...method.params,
                            {
                              id: makeId('param'),
                              name: `arg_${method.params.length + 1}`,
                              nameRu: `Аргумент ${method.params.length + 1}`,
                              dataType: 'any',
                            },
                          ],
                        })
                      }
                    >
                      + {isRu ? 'Параметр' : 'Param'}
                    </button>
                  </div>
                  {method.params.map((param) => (
                    <div key={param.id} style={style.paramRow}>
                      <input
                        style={style.input}
                        value={param.name}
                        onChange={(event) => updateParam(method.id, param.id, { name: event.currentTarget.value })}
                        placeholder={isRu ? 'code имя' : 'code name'}
                      />
                      <input
                        style={style.input}
                        value={param.nameRu ?? ''}
                        onChange={(event) => updateParam(method.id, param.id, { nameRu: event.currentTarget.value })}
                        placeholder={isRu ? 'RU имя' : 'RU name'}
                      />
                      <select
                        style={style.input}
                        value={param.dataType}
                        onChange={(event) => updateParam(method.id, param.id, { dataType: event.currentTarget.value as PortDataType })}
                      >
                        {TYPE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <input
                        style={style.input}
                        value={param.typeName ?? ''}
                        onChange={(event) => updateParam(method.id, param.id, { typeName: event.currentTarget.value || undefined })}
                        placeholder={isRu ? 'TypeName (опц.)' : 'TypeName (opt.)'}
                      />
                      <button
                        type="button"
                        style={style.iconBtn}
                        onClick={() =>
                          updateMethod(method.id, { params: method.params.filter((entry) => entry.id !== param.id) })
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        </div>
        <div style={style.footer}>
          <div>
            {onDelete && (
              <button
                type="button"
                style={{ ...style.btn, borderColor: '#f38ba8', color: '#f38ba8' }}
                onClick={onDelete}
              >
                {isRu ? 'Удалить класс' : 'Delete class'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={style.btn} onClick={onClose}>
              {isRu ? 'Отмена' : 'Cancel'}
            </button>
            <button
              type="button"
              style={{ ...style.btn, borderColor: '#3f8cff', backgroundColor: '#3f8cff', color: '#fff' }}
              onClick={saveDraft}
            >
              {isRu ? 'Сохранить' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClassEditor;
