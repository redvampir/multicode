import React, { useCallback, useMemo, useState } from 'react';
import type {
  BlueprintGraphState,
  UeMacroBinding,
  UeMacroType,
  UeMacroTargetKind,
} from '../shared/blueprintTypes';
import {
  createUeMacroBinding,
  renderUeMacroString,
  UE_MACRO_TYPES,
  UE_MACRO_LABELS,
  UE_MACRO_COLORS,
  UE_MACRO_SPECIFIERS,
} from '../shared/blueprintTypes';
import { getTranslation } from '../shared/translations';

// ─── Интерфейсы ─────────────────────────────────────────────

export interface UeMacroPanelProps {
  graphState: BlueprintGraphState;
  onUeMacrosChange: (macros: UeMacroBinding[]) => void;
  /** Сейчас активен режим привязки для этого макроса? */
  attachModeId?: string | null;
  /** Запросить attach-режим */
  onRequestAttach?: (macroId: string) => void;
  /** Отмена attach-режима */
  onCancelAttach?: () => void;
  displayLanguage: 'ru' | 'en';
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

interface MacroDialogState {
  isOpen: boolean;
  mode: 'create' | 'edit';
  editId: string | null;
  macroType: UeMacroType;
  specifiers: string[];
  category: string;
  name: string;
  nameRu: string;
  metaEntries: Array<{ key: string; value: string }>;
}

const INITIAL_DIALOG: MacroDialogState = {
  isOpen: false,
  mode: 'create',
  editId: null,
  macroType: 'UCLASS',
  specifiers: ['BlueprintType'],
  category: 'MultiCode',
  name: '',
  nameRu: '',
  metaEntries: [],
};

// ─── Хелперы ────────────────────────────────────────────────

/** Найти название целевой сущности по ID */
function resolveTargetLabel(
  graphState: BlueprintGraphState,
  targetId?: string,
  targetKind?: UeMacroTargetKind,
  lang: 'ru' | 'en' = 'ru',
): string | null {
  if (!targetId) return null;

  if (targetKind === 'class') {
    const cls = graphState.classes?.find((c) => c.id === targetId);
    return cls ? (lang === 'ru' && cls.nameRu ? cls.nameRu : cls.name) : null;
  }
  if (targetKind === 'function') {
    const fn = graphState.functions?.find((f) => f.id === targetId);
    return fn ? (lang === 'ru' ? fn.nameRu : fn.name) : null;
  }
  if (targetKind === 'variable') {
    const v = graphState.variables?.find((vr) => vr.id === targetId);
    return v ? (lang === 'ru' ? v.nameRu : v.name) : null;
  }
  if (targetKind === 'method') {
    for (const cls of graphState.classes ?? []) {
      const m = cls.methods.find((mt) => mt.id === targetId);
      if (m) return lang === 'ru' && m.nameRu ? m.nameRu : m.name;
    }
  }
  if (targetKind === 'member') {
    for (const cls of graphState.classes ?? []) {
      const f = cls.members.find((mb) => mb.id === targetId);
      if (f) return lang === 'ru' && f.nameRu ? f.nameRu : f.name;
    }
  }
  return null;
}

const targetKindLabel = (kind: UeMacroTargetKind, lang: 'ru' | 'en'): string => {
  const key = `panel.ueMacros.target${kind[0].toUpperCase()}${kind.slice(1)}` as Parameters<typeof getTranslation>[1];
  return getTranslation(lang, key);
};

// ─── Компонент ──────────────────────────────────────────────

export const UeMacroPanel: React.FC<UeMacroPanelProps> = ({
  graphState,
  onUeMacrosChange,
  attachModeId,
  onRequestAttach,
  onCancelAttach,
  displayLanguage: lang,
  collapsed = false,
  onToggleCollapsed,
}) => {
  const t = useCallback(
    (key: Parameters<typeof getTranslation>[1]) => getTranslation(lang, key),
    [lang],
  );

  const macros = useMemo(() => graphState.ueMacros ?? [], [graphState.ueMacros]);
  const isUeTarget = graphState.language === 'ue';

  const [dialog, setDialog] = useState<MacroDialogState>(INITIAL_DIALOG);

  // ─── CRUD ─────────────────────────────────────────

  const openCreateDialog = useCallback((macroType: UeMacroType) => {
    const label = UE_MACRO_LABELS[macroType];
    const defaultSpecs = macroType === 'UCLASS' ? ['BlueprintType']
      : macroType === 'UFUNCTION' ? ['BlueprintCallable']
      : macroType === 'UPROPERTY' ? ['EditAnywhere', 'BlueprintReadWrite']
      : ['BlueprintType'];
    setDialog({
      isOpen: true,
      mode: 'create',
      editId: null,
      macroType,
      specifiers: defaultSpecs,
      category: 'MultiCode',
      name: label.en,
      nameRu: label.ru,
      metaEntries: [],
    });
  }, []);

  const openEditDialog = useCallback((macro: UeMacroBinding) => {
    setDialog({
      isOpen: true,
      mode: 'edit',
      editId: macro.id,
      macroType: macro.macroType,
      specifiers: [...macro.specifiers],
      category: macro.category,
      name: macro.name,
      nameRu: macro.nameRu,
      metaEntries: macro.meta
        ? Object.entries(macro.meta).map(([key, value]) => ({ key, value }))
        : [],
    });
  }, []);

  const closeDialog = useCallback(() => setDialog(INITIAL_DIALOG), []);

  const saveDialog = useCallback(() => {
    const metaObj: Record<string, string> = {};
    for (const { key, value } of dialog.metaEntries) {
      const k = key.trim();
      if (k) metaObj[k] = value;
    }

    if (dialog.mode === 'create') {
      const binding = createUeMacroBinding(dialog.macroType, {
        name: dialog.name || UE_MACRO_LABELS[dialog.macroType].en,
        nameRu: dialog.nameRu || UE_MACRO_LABELS[dialog.macroType].ru,
        specifiers: dialog.specifiers,
        category: dialog.category,
        meta: Object.keys(metaObj).length > 0 ? metaObj : undefined,
      });
      onUeMacrosChange([...macros, binding]);
    } else if (dialog.editId) {
      onUeMacrosChange(
        macros.map((m) =>
          m.id === dialog.editId
            ? {
                ...m,
                name: dialog.name,
                nameRu: dialog.nameRu,
                specifiers: dialog.specifiers,
                category: dialog.category,
                meta: Object.keys(metaObj).length > 0 ? metaObj : undefined,
              }
            : m,
        ),
      );
    }
    closeDialog();
  }, [dialog, macros, onUeMacrosChange, closeDialog]);

  const deleteMacro = useCallback(
    (id: string) => onUeMacrosChange(macros.filter((m) => m.id !== id)),
    [macros, onUeMacrosChange],
  );

  const detachMacro = useCallback(
    (id: string) =>
      onUeMacrosChange(
        macros.map((m) => (m.id === id ? { ...m, targetId: undefined, targetKind: undefined } : m)),
      ),
    [macros, onUeMacrosChange],
  );

  const toggleSpecifier = useCallback(
    (spec: string) =>
      setDialog((prev) => ({
        ...prev,
        specifiers: prev.specifiers.includes(spec)
          ? prev.specifiers.filter((s) => s !== spec)
          : [...prev.specifiers, spec],
      })),
    [],
  );

  // ─── Preview строки макроса ───────────────────────

  const dialogPreview = useMemo(() => {
    const metaObj: Record<string, string> = {};
    for (const { key, value } of dialog.metaEntries) {
      const k = key.trim();
      if (k) metaObj[k] = value;
    }
    return renderUeMacroString({
      id: '',
      name: '',
      nameRu: '',
      macroType: dialog.macroType,
      specifiers: dialog.specifiers,
      category: dialog.category,
      meta: Object.keys(metaObj).length > 0 ? metaObj : undefined,
    });
  }, [dialog.macroType, dialog.specifiers, dialog.category, dialog.metaEntries]);

  // ─── Рендер ───────────────────────────────────────

  return (
    <div className="bp-panel bp-ue-macro-panel">
      {/* Заголовок секции */}
      <div
        className="bp-panel-header"
        onClick={onToggleCollapsed}
        data-testid="ue-macros-section-toggle"
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        <span className="bp-panel-collapse-icon">{collapsed ? '▶' : '▼'}</span>
        <span className="bp-panel-title">{t('panel.ueMacros.title')}</span>
        {!isUeTarget && (
          <span
            className="bp-ue-macro-badge-disabled"
            title={t('panel.ueMacros.ueOnly')}
            style={{
              fontSize: '0.7em',
              color: '#888',
              marginLeft: 6,
              fontStyle: 'italic',
            }}
          >
            UE
          </span>
        )}

        {/* Кнопки создания макросов */}
        {!collapsed && isUeTarget && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {UE_MACRO_TYPES.map((mt) => (
              <button
                key={mt}
                className="bp-btn bp-btn-sm"
                style={{
                  backgroundColor: UE_MACRO_COLORS[mt],
                  color: '#fff',
                  fontSize: '0.7em',
                  padding: '2px 6px',
                  borderRadius: 3,
                  border: 'none',
                  cursor: 'pointer',
                }}
                title={`${t('panel.ueMacros.create')} ${mt}`}
                onClick={(e) => {
                  e.stopPropagation();
                  openCreateDialog(mt);
                }}
              >
                {mt}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Attach-баннер */}
      {attachModeId && (
        <div
          className="bp-ue-macro-attach-banner"
          style={{
            background: '#1E88E5',
            color: '#fff',
            padding: '6px 10px',
            fontSize: '0.85em',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{t('panel.ueMacros.attachBanner')}</span>
          <button
            className="bp-btn bp-btn-sm"
            style={{ color: '#fff', background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer' }}
            onClick={onCancelAttach}
          >
            {t('panel.ueMacros.attachCancel')}
          </button>
        </div>
      )}

      {/* Список макросов */}
      {!collapsed && (
        <div className="bp-ue-macro-list" style={{ padding: '4px 8px' }}>
          {macros.length === 0 && (
            <div style={{ color: '#888', fontSize: '0.85em', padding: '8px 0' }}>
              <div>{t('panel.ueMacros.empty')}</div>
              <div style={{ fontSize: '0.8em', marginTop: 4 }}>
                {t('panel.ueMacros.emptyHint')}
              </div>
            </div>
          )}

          {macros.map((macro) => {
            const targetLabel = resolveTargetLabel(graphState, macro.targetId, macro.targetKind, lang);
            const macroStr = renderUeMacroString(macro);
            const isAttaching = attachModeId === macro.id;

            return (
              <div
                key={macro.id}
                className={`bp-ue-macro-item ${isAttaching ? 'bp-ue-macro-item--attaching' : ''}`}
                style={{
                  borderLeft: `3px solid ${UE_MACRO_COLORS[macro.macroType]}`,
                  padding: '6px 8px',
                  marginBottom: 4,
                  background: isAttaching ? 'rgba(30, 136, 229, 0.15)' : 'rgba(255,255,255,0.03)',
                  borderRadius: 3,
                }}
              >
                {/* Заголовок макроса */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      fontWeight: 600,
                      color: UE_MACRO_COLORS[macro.macroType],
                      fontSize: '0.85em',
                    }}
                  >
                    {macro.macroType}
                  </span>
                  <span style={{ fontSize: '0.8em', color: '#ccc' }}>
                    {lang === 'ru' ? macro.nameRu : macro.name}
                  </span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                    <button
                      className="bp-btn bp-btn-xs"
                      title={t('panel.ueMacros.attach')}
                      onClick={() => onRequestAttach?.(macro.id)}
                      style={{ fontSize: '0.75em', cursor: 'pointer' }}
                    >
                      📌
                    </button>
                    <button
                      className="bp-btn bp-btn-xs"
                      title={lang === 'ru' ? 'Редактировать' : 'Edit'}
                      onClick={() => openEditDialog(macro)}
                      style={{ fontSize: '0.75em', cursor: 'pointer' }}
                    >
                      ✏️
                    </button>
                    <button
                      className="bp-btn bp-btn-xs"
                      title={t('panel.ueMacros.delete')}
                      onClick={() => deleteMacro(macro.id)}
                      style={{ fontSize: '0.75em', cursor: 'pointer' }}
                    >
                      🗑
                    </button>
                  </div>
                </div>

                {/* Привязка */}
                <div style={{ fontSize: '0.75em', marginTop: 3, color: '#aaa' }}>
                  {macro.targetId && macro.targetKind ? (
                    <span>
                      → {targetKindLabel(macro.targetKind, lang)}:{' '}
                      <strong style={{ color: '#ddd' }}>{targetLabel || macro.targetId}</strong>
                      <button
                        className="bp-btn bp-btn-xs"
                        onClick={() => detachMacro(macro.id)}
                        style={{ marginLeft: 6, fontSize: '0.8em', cursor: 'pointer' }}
                        title={t('panel.ueMacros.detach')}
                      >
                        ✕
                      </button>
                    </span>
                  ) : (
                    <span style={{ fontStyle: 'italic' }}>{t('panel.ueMacros.noTarget')}</span>
                  )}
                </div>

                {/* Превью макроса */}
                <div
                  style={{
                    fontSize: '0.7em',
                    marginTop: 3,
                    color: '#8a8',
                    fontFamily: 'monospace',
                    wordBreak: 'break-all',
                  }}
                >
                  {macroStr}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Диалог создания/редактирования ─────────────── */}
      {dialog.isOpen && (
        <div
          className="bp-ue-macro-dialog-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={closeDialog}
        >
          <div
            className="bp-ue-macro-dialog"
            style={{
              background: '#1e1e2e',
              borderRadius: 8,
              padding: 20,
              minWidth: 400,
              maxWidth: 540,
              maxHeight: '80vh',
              overflowY: 'auto',
              border: `2px solid ${UE_MACRO_COLORS[dialog.macroType]}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 12px', color: UE_MACRO_COLORS[dialog.macroType] }}>
              {dialog.mode === 'create'
                ? `${t('panel.ueMacros.create')} ${dialog.macroType}`
                : `${dialog.macroType} — ${lang === 'ru' ? dialog.nameRu : dialog.name}`}
            </h3>

            {/* Тип макроса (только при создании) */}
            {dialog.mode === 'create' && (
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: '0.85em', color: '#aaa' }}>{t('panel.ueMacros.type')}</label>
                <select
                  value={dialog.macroType}
                  onChange={(e) => {
                    const mt = e.target.value as UeMacroType;
                    setDialog((prev) => ({
                      ...prev,
                      macroType: mt,
                      specifiers: mt === 'UCLASS' ? ['BlueprintType']
                        : mt === 'UFUNCTION' ? ['BlueprintCallable']
                        : mt === 'UPROPERTY' ? ['EditAnywhere', 'BlueprintReadWrite']
                        : ['BlueprintType'],
                      name: UE_MACRO_LABELS[mt].en,
                      nameRu: UE_MACRO_LABELS[mt].ru,
                    }));
                  }}
                  style={{ width: '100%', padding: 6, marginTop: 4 }}
                >
                  {UE_MACRO_TYPES.map((mt) => (
                    <option key={mt} value={mt}>{mt}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Имена */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.85em', color: '#aaa' }}>Name (EN)</label>
                <input
                  value={dialog.name}
                  onChange={(e) => setDialog((prev) => ({ ...prev, name: e.target.value }))}
                  style={{ width: '100%', padding: 6, marginTop: 4 }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.85em', color: '#aaa' }}>Имя (RU)</label>
                <input
                  value={dialog.nameRu}
                  onChange={(e) => setDialog((prev) => ({ ...prev, nameRu: e.target.value }))}
                  style={{ width: '100%', padding: 6, marginTop: 4 }}
                />
              </div>
            </div>

            {/* Category */}
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: '0.85em', color: '#aaa' }}>{t('panel.ueMacros.category')}</label>
              <input
                value={dialog.category}
                onChange={(e) => setDialog((prev) => ({ ...prev, category: e.target.value }))}
                style={{ width: '100%', padding: 6, marginTop: 4 }}
                placeholder='MultiCode'
              />
            </div>

            {/* Спецификаторы */}
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: '0.85em', color: '#aaa' }}>{t('panel.ueMacros.specifiers')}</label>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 4,
                  marginTop: 6,
                  maxHeight: 160,
                  overflowY: 'auto',
                }}
              >
                {UE_MACRO_SPECIFIERS[dialog.macroType].map((spec) => {
                  const active = dialog.specifiers.includes(spec);
                  return (
                    <button
                      key={spec}
                      onClick={() => toggleSpecifier(spec)}
                      style={{
                        padding: '3px 8px',
                        fontSize: '0.78em',
                        borderRadius: 3,
                        border: active
                          ? `1px solid ${UE_MACRO_COLORS[dialog.macroType]}`
                          : '1px solid #555',
                        background: active ? UE_MACRO_COLORS[dialog.macroType] + '30' : 'transparent',
                        color: active ? '#fff' : '#aaa',
                        cursor: 'pointer',
                      }}
                    >
                      {active ? '✓ ' : ''}{spec}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Мета-аргументы */}
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: '0.85em', color: '#aaa' }}>{t('panel.ueMacros.meta')}</label>
              {dialog.metaEntries.map((entry, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <input
                    value={entry.key}
                    placeholder={t('panel.ueMacros.metaKey')}
                    onChange={(e) => {
                      const updated = [...dialog.metaEntries];
                      updated[idx] = { ...updated[idx], key: e.target.value };
                      setDialog((prev) => ({ ...prev, metaEntries: updated }));
                    }}
                    style={{ flex: 1, padding: 4, fontSize: '0.85em' }}
                  />
                  <input
                    value={entry.value}
                    placeholder={t('panel.ueMacros.metaValue')}
                    onChange={(e) => {
                      const updated = [...dialog.metaEntries];
                      updated[idx] = { ...updated[idx], value: e.target.value };
                      setDialog((prev) => ({ ...prev, metaEntries: updated }));
                    }}
                    style={{ flex: 1, padding: 4, fontSize: '0.85em' }}
                  />
                  <button
                    onClick={() => {
                      const updated = dialog.metaEntries.filter((_, i) => i !== idx);
                      setDialog((prev) => ({ ...prev, metaEntries: updated }));
                    }}
                    style={{ cursor: 'pointer', fontSize: '0.8em' }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  setDialog((prev) => ({
                    ...prev,
                    metaEntries: [...prev.metaEntries, { key: '', value: '' }],
                  }))
                }
                className="bp-btn bp-btn-sm"
                style={{ marginTop: 4, fontSize: '0.8em', cursor: 'pointer' }}
              >
                + meta
              </button>
            </div>

            {/* Превью */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: '0.85em', color: '#aaa' }}>{t('panel.ueMacros.preview')}</label>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: '0.85em',
                  color: UE_MACRO_COLORS[dialog.macroType],
                  background: '#111',
                  padding: '8px 10px',
                  borderRadius: 4,
                  marginTop: 4,
                  wordBreak: 'break-all',
                }}
              >
                {dialogPreview}
              </div>
            </div>

            {/* Кнопки */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                className="bp-btn"
                onClick={closeDialog}
                style={{ padding: '6px 16px', cursor: 'pointer' }}
              >
                {lang === 'ru' ? 'Отмена' : 'Cancel'}
              </button>
              <button
                className="bp-btn"
                onClick={saveDialog}
                style={{
                  padding: '6px 16px',
                  background: UE_MACRO_COLORS[dialog.macroType],
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                {dialog.mode === 'create'
                  ? (lang === 'ru' ? 'Создать' : 'Create')
                  : (lang === 'ru' ? 'Сохранить' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
