import React, { useCallback, useMemo, useState } from 'react';
import type {
  BlueprintGraphState,
  UeMacroBinding,
  UeMacroTargetKind,
  UeMacroType,
} from '../shared/blueprintTypes';
import {
  createUeMacroBinding,
  renderUeMacroString,
  UE_MACRO_ALLOWED_TARGETS,
  UE_MACRO_COLORS,
  UE_MACRO_LABELS,
  UE_MACRO_SPECIFIERS,
  UE_MACRO_TYPES,
} from '../shared/blueprintTypes';
import { getTranslation } from '../shared/translations';

export interface UeMacroPanelProps {
  graphState: BlueprintGraphState;
  onUeMacrosChange: (macros: UeMacroBinding[]) => void;
  attachModeId?: string | null;
  onRequestAttach?: (macroId: string) => void;
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
  displayName: string;
  metaEntries: Array<{ key: string; value: string }>;
}

const DISPLAY_NAME_META_KEY = 'DisplayName';
const DISPLAY_NAME_META_KEY_NORMALIZED = DISPLAY_NAME_META_KEY.toLowerCase();

const INITIAL_DIALOG: MacroDialogState = {
  isOpen: false,
  mode: 'create',
  editId: null,
  macroType: 'UCLASS',
  specifiers: ['BlueprintType'],
  category: 'MultiCode',
  name: '',
  nameRu: '',
  displayName: '',
  metaEntries: [],
};

const getDefaultSpecifiersForDialog = (macroType: UeMacroType): string[] => {
  if (macroType === 'UCLASS') {
    return ['BlueprintType'];
  }
  if (macroType === 'UFUNCTION') {
    return ['BlueprintCallable'];
  }
  if (macroType === 'UPROPERTY') {
    return ['EditAnywhere', 'BlueprintReadWrite'];
  }
  return ['BlueprintType'];
};

const targetKindLabel = (kind: UeMacroTargetKind, lang: 'ru' | 'en'): string => {
  const key = `panel.ueMacros.target${kind[0].toUpperCase()}${kind.slice(1)}` as Parameters<typeof getTranslation>[1];
  return getTranslation(lang, key);
};

const resolveTargetLabel = (
  graphState: BlueprintGraphState,
  targetId?: string,
  targetKind?: UeMacroTargetKind,
  lang: 'ru' | 'en' = 'ru',
): string | null => {
  if (!targetId || !targetKind) {
    return null;
  }

  if (targetKind === 'class') {
    const cls = graphState.classes?.find((candidate) => candidate.id === targetId);
    if (!cls) {
      return null;
    }
    return lang === 'ru' && cls.nameRu ? cls.nameRu : cls.name;
  }

  if (targetKind === 'function') {
    const func = graphState.functions?.find((candidate) => candidate.id === targetId);
    if (!func) {
      return null;
    }
    return lang === 'ru' && func.nameRu ? func.nameRu : func.name;
  }

  if (targetKind === 'variable') {
    const variable = graphState.variables?.find((candidate) => candidate.id === targetId);
    if (!variable) {
      return null;
    }
    return lang === 'ru' && variable.nameRu ? variable.nameRu : variable.name;
  }

  if (targetKind === 'method') {
    for (const cls of graphState.classes ?? []) {
      const method = cls.methods.find((candidate) => candidate.id === targetId);
      if (!method) {
        continue;
      }
      const ownerName = lang === 'ru' && cls.nameRu ? cls.nameRu : cls.name;
      const methodName = lang === 'ru' && method.nameRu ? method.nameRu : method.name;
      return `${ownerName}::${methodName}`;
    }
    return null;
  }

  for (const cls of graphState.classes ?? []) {
    const member = cls.members.find((candidate) => candidate.id === targetId);
    if (!member) {
      continue;
    }
    const ownerName = lang === 'ru' && cls.nameRu ? cls.nameRu : cls.name;
    const memberName = lang === 'ru' && member.nameRu ? member.nameRu : member.name;
    return `${ownerName}::${memberName}`;
  }

  return null;
};

const getAllowedTargetLabels = (macroType: UeMacroType, lang: 'ru' | 'en'): string[] =>
  UE_MACRO_ALLOWED_TARGETS[macroType].map((kind) => targetKindLabel(kind, lang));

const getDialogDisplayName = (
  meta: Record<string, string> | undefined,
  fallbackNameRu: string,
  fallbackName: string,
): string => {
  const displayName = meta?.[DISPLAY_NAME_META_KEY];
  if (typeof displayName === 'string' && displayName.trim().length > 0) {
    return displayName.trim();
  }
  return fallbackNameRu || fallbackName;
};

const getDialogMetaEntries = (
  meta: Record<string, string> | undefined,
): Array<{ key: string; value: string }> =>
  meta
    ? Object.entries(meta)
        .filter(([key]) => key.trim().toLowerCase() !== DISPLAY_NAME_META_KEY_NORMALIZED)
        .map(([key, value]) => ({ key, value }))
    : [];

const buildDialogMetaObject = (
  displayName: string,
  metaEntries: Array<{ key: string; value: string }>,
): Record<string, string> => {
  const metaObj: Record<string, string> = {
    [DISPLAY_NAME_META_KEY]: displayName.trim(),
  };

  for (const { key, value } of metaEntries) {
    const trimmedKey = key.trim();
    if (trimmedKey.length > 0 && trimmedKey.toLowerCase() !== DISPLAY_NAME_META_KEY_NORMALIZED) {
      metaObj[trimmedKey] = value;
    }
  }

  return metaObj;
};

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
    (key: Parameters<typeof getTranslation>[1], fallback?: string) =>
      getTranslation(lang, key, undefined, fallback),
    [lang],
  );

  const macros = useMemo(() => graphState.ueMacros ?? [], [graphState.ueMacros]);
  const isUeTarget = graphState.language === 'ue';
  const [dialog, setDialog] = useState<MacroDialogState>(INITIAL_DIALOG);

  const activeAttachMacro = useMemo(
    () => macros.find((macro) => macro.id === attachModeId) ?? null,
    [attachModeId, macros],
  );

  const editingMacro = useMemo(
    () => (dialog.mode === 'edit' && dialog.editId ? macros.find((macro) => macro.id === dialog.editId) ?? null : null),
    [dialog.editId, dialog.mode, macros],
  );

  const openCreateDialog = useCallback((macroType: UeMacroType) => {
    const label = UE_MACRO_LABELS[macroType];
    setDialog({
      isOpen: true,
      mode: 'create',
      editId: null,
      macroType,
      specifiers: getDefaultSpecifiersForDialog(macroType),
      category: 'MultiCode',
      name: label.en,
      nameRu: label.ru,
      displayName: label.ru,
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
      displayName: getDialogDisplayName(macro.meta, macro.nameRu, macro.name),
      metaEntries: getDialogMetaEntries(macro.meta),
    });
  }, []);

  const closeDialog = useCallback(() => setDialog(INITIAL_DIALOG), []);

  const saveDialog = useCallback(() => {
    const trimmedDisplayName = dialog.displayName.trim();
    if (!trimmedDisplayName) {
      return;
    }

    const metaObj = buildDialogMetaObject(trimmedDisplayName, dialog.metaEntries);

    if (dialog.mode === 'create') {
      const binding = createUeMacroBinding(dialog.macroType, {
        name: dialog.name || UE_MACRO_LABELS[dialog.macroType].en,
        nameRu: dialog.nameRu || UE_MACRO_LABELS[dialog.macroType].ru,
        specifiers: dialog.specifiers,
        category: dialog.category,
        meta: metaObj,
      });
      onUeMacrosChange([...macros, binding]);
    } else if (dialog.editId) {
      onUeMacrosChange(
        macros.map((macro) =>
          macro.id === dialog.editId
            ? {
                ...macro,
                name: dialog.name,
                nameRu: dialog.nameRu,
                specifiers: dialog.specifiers,
                category: dialog.category,
                meta: metaObj,
              }
            : macro,
        ),
      );
    }

    closeDialog();
  }, [closeDialog, dialog, macros, onUeMacrosChange]);

  const deleteMacro = useCallback(
    (id: string) => onUeMacrosChange(macros.filter((macro) => macro.id !== id)),
    [macros, onUeMacrosChange],
  );

  const detachMacro = useCallback(
    (id: string) =>
      onUeMacrosChange(
        macros.map((macro) =>
          macro.id === id ? { ...macro, targetId: undefined, targetKind: undefined } : macro,
        ),
      ),
    [macros, onUeMacrosChange],
  );

  const toggleSpecifier = useCallback((specifier: string) => {
    setDialog((prev) => ({
      ...prev,
      specifiers: prev.specifiers.includes(specifier)
        ? prev.specifiers.filter((item) => item !== specifier)
        : [...prev.specifiers, specifier],
    }));
  }, []);

  const trimmedDisplayName = dialog.displayName.trim();
  const isDialogValid = trimmedDisplayName.length > 0;

  const dialogPreview = useMemo(() => {
    const metaObj = trimmedDisplayName
      ? buildDialogMetaObject(trimmedDisplayName, dialog.metaEntries)
      : undefined;

    return renderUeMacroString({
      id: '',
      name: '',
      nameRu: '',
      macroType: dialog.macroType,
      specifiers: dialog.specifiers,
      category: dialog.category,
      meta: metaObj,
    });
  }, [dialog.category, dialog.macroType, dialog.metaEntries, dialog.specifiers, trimmedDisplayName]);

  const dialogAllowedTargetLabels = useMemo(
    () => getAllowedTargetLabels(dialog.macroType, lang),
    [dialog.macroType, lang],
  );

  const dialogCurrentTargetLabel = useMemo(
    () =>
      editingMacro
        ? resolveTargetLabel(graphState, editingMacro.targetId, editingMacro.targetKind, lang)
        : null,
    [editingMacro, graphState, lang],
  );

  const attachBannerHint = useMemo(() => {
    if (!activeAttachMacro) {
      return '';
    }

    const targetKinds = getAllowedTargetLabels(activeAttachMacro.macroType, lang).join(', ');
    const macroLabel = lang === 'ru' ? activeAttachMacro.nameRu : activeAttachMacro.name;
    return `${macroLabel}: ${t('panel.ueMacros.allowedTargets', 'Можно привязать к')} ${targetKinds}`;
  }, [activeAttachMacro, lang, t]);

  return (
    <div className="bp-panel bp-ue-macro-panel">
      <div
        className="function-list-header bp-ue-macro-header"
        onClick={onToggleCollapsed}
        data-testid="ue-macros-section-toggle"
      >
        <div className="panel-header-title">
          <button
            type="button"
            className="panel-collapse-btn"
            onClick={(event) => {
              event.stopPropagation();
              onToggleCollapsed?.();
            }}
            title={lang === 'ru' ? 'Свернуть или развернуть секцию' : 'Collapse or expand section'}
            aria-label={lang === 'ru' ? 'Переключить секцию UE-макросов' : 'Toggle UE macros section'}
          >
            {collapsed ? '▶' : '▼'}
          </button>
          <h3>{t('panel.ueMacros.title', 'UE Макросы')}</h3>
        </div>
        {!isUeTarget && (
          <span className="bp-ue-macro-badge-disabled" title={t('panel.ueMacros.ueOnly', 'Доступно только для UE target')}>
            UE
          </span>
        )}
      </div>

      {!collapsed && (
        <>
          {isUeTarget && (
            <div className="bp-ue-macro-toolbar">
              {UE_MACRO_TYPES.map((macroType) => (
                <button
                  key={macroType}
                  type="button"
                  className="bp-ue-macro-create-btn"
                  style={{ ['--ue-macro-accent' as string]: UE_MACRO_COLORS[macroType] } as React.CSSProperties}
                  title={`${t('panel.ueMacros.create', 'Создать')} ${macroType}`}
                  onClick={() => openCreateDialog(macroType)}
                >
                  <span className="bp-ue-macro-create-type">{macroType}</span>
                  <span className="bp-ue-macro-create-label">{lang === 'ru' ? UE_MACRO_LABELS[macroType].ru : UE_MACRO_LABELS[macroType].en}</span>
                </button>
              ))}
            </div>
          )}

          {attachModeId && activeAttachMacro && (
            <div className="bp-ue-macro-attach-banner">
              <div className="bp-ue-macro-attach-copy">
                <strong>{activeAttachMacro.macroType}</strong>
                <span>{attachBannerHint}</span>
              </div>
              <button
                type="button"
                className="bp-ue-macro-inline-btn"
                onClick={onCancelAttach}
              >
                {t('panel.ueMacros.attachCancel', 'Отмена')}
              </button>
            </div>
          )}

          <div className="bp-ue-macro-list">
            {macros.length === 0 && (
              <div className="bp-ue-macro-empty">
                <div className="bp-ue-macro-empty-title">{t('panel.ueMacros.empty', 'Нет UE-макросов')}</div>
                <div className="bp-ue-macro-empty-hint">
                  {t(
                    'panel.ueMacros.emptyHint',
                    'Создайте макрос и привяжите к классу, функции или переменной, чтобы он стал Blueprint-доступным в Unreal Engine',
                  )}
                </div>
              </div>
            )}

            {macros.map((macro) => {
              const targetLabel = resolveTargetLabel(graphState, macro.targetId, macro.targetKind, lang);
              const macroString = renderUeMacroString(macro);
              const isAttaching = attachModeId === macro.id;
              const allowedTargetLabels = getAllowedTargetLabels(macro.macroType, lang);
              const accentStyle = {
                ['--ue-macro-accent' as string]: UE_MACRO_COLORS[macro.macroType],
              } as React.CSSProperties;

              return (
                <article
                  key={macro.id}
                  className={`bp-ue-macro-item ${isAttaching ? 'bp-ue-macro-item--attaching' : ''}`}
                  style={accentStyle}
                >
                  <div className="bp-ue-macro-item-head">
                    <div className="bp-ue-macro-title-block">
                      <span className="bp-ue-macro-type-badge">{macro.macroType}</span>
                      <div className="bp-ue-macro-title-stack">
                        <div className="bp-ue-macro-display-name">
                          {lang === 'ru' ? macro.nameRu : macro.name}
                        </div>
                        <div className="bp-ue-macro-binding-row">
                          {macro.targetId && macro.targetKind ? (
                            <>
                              <span className="bp-ue-macro-binding-label">
                                {t('panel.ueMacros.attachedTo', 'Привязано к')}
                              </span>
                              <span className="bp-ue-macro-target-chip">
                                {targetKindLabel(macro.targetKind, lang)}
                              </span>
                              <span className="bp-ue-macro-target-value">
                                {targetLabel || macro.targetId}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="bp-ue-macro-unbound">
                                {t('panel.ueMacros.noTarget', 'Не привязан')}
                              </span>
                              <span className="bp-ue-macro-binding-label">
                                {t('panel.ueMacros.allowedTargets', 'Можно привязать к')}
                              </span>
                              <div className="bp-ue-macro-allowed-list">
                                {allowedTargetLabels.map((label) => (
                                  <span key={`${macro.id}:${label}`} className="bp-ue-macro-allowed-chip">
                                    {label}
                                  </span>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="bp-ue-macro-actions">
                      <button
                        type="button"
                        className="bp-ue-macro-inline-btn"
                        onClick={() => {
                          if (isAttaching) {
                            onCancelAttach?.();
                            return;
                          }
                          onRequestAttach?.(macro.id);
                        }}
                      >
                        {isAttaching
                          ? t('panel.ueMacros.attachCancel', 'Отмена')
                          : macro.targetId
                            ? t('panel.ueMacros.rebind', 'Перепривязать')
                            : t('panel.ueMacros.attach', 'Привязать')}
                      </button>
                      {macro.targetId && (
                        <button
                          type="button"
                          className="bp-ue-macro-inline-btn"
                          onClick={() => detachMacro(macro.id)}
                        >
                          {t('panel.ueMacros.detach', 'Отвязать')}
                        </button>
                      )}
                      <button
                        type="button"
                        className="bp-ue-macro-inline-btn"
                        onClick={() => openEditDialog(macro)}
                      >
                        {lang === 'ru' ? 'Изменить' : 'Edit'}
                      </button>
                      <button
                        type="button"
                        className="bp-ue-macro-inline-btn bp-ue-macro-inline-btn--danger"
                        onClick={() => deleteMacro(macro.id)}
                      >
                        {lang === 'ru' ? 'Удалить' : 'Delete'}
                      </button>
                    </div>
                  </div>

                  <div className="bp-ue-macro-preview">
                    {macroString}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      {dialog.isOpen && (
        <div className="bp-ue-macro-dialog-overlay" onClick={closeDialog}>
          <div
            className="bp-ue-macro-dialog"
            style={{ ['--ue-macro-accent' as string]: UE_MACRO_COLORS[dialog.macroType] } as React.CSSProperties}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="bp-ue-macro-dialog-header">
              <div>
                <h3>
                  {dialog.mode === 'create'
                    ? `${t('panel.ueMacros.create', 'Создать')} ${dialog.macroType}`
                    : `${dialog.macroType} — ${lang === 'ru' ? dialog.nameRu : dialog.name}`}
                </h3>
                <div className="bp-ue-macro-dialog-subtitle">
                  {editingMacro?.targetId && editingMacro.targetKind
                    ? `${t('panel.ueMacros.attachedTo', 'Привязано к')} ${targetKindLabel(editingMacro.targetKind, lang)}: ${dialogCurrentTargetLabel || editingMacro.targetId}`
                    : `${t('panel.ueMacros.allowedTargets', 'Можно привязать к')}: ${dialogAllowedTargetLabels.join(', ')}`}
                </div>
              </div>
            </div>

            <div className="bp-ue-macro-dialog-body">
              {dialog.mode === 'create' && (
                <div className="bp-ue-macro-field">
                  <label>{t('panel.ueMacros.type', 'Тип макроса')}</label>
                  <select
                    className="bp-ue-macro-input"
                    value={dialog.macroType}
                    onChange={(event) => {
                      const macroType = event.target.value as UeMacroType;
                      setDialog((prev) => ({
                        ...prev,
                        macroType,
                        specifiers: getDefaultSpecifiersForDialog(macroType),
                        name: UE_MACRO_LABELS[macroType].en,
                        nameRu: UE_MACRO_LABELS[macroType].ru,
                        displayName: prev.displayName || UE_MACRO_LABELS[macroType].ru,
                      }));
                    }}
                  >
                    {UE_MACRO_TYPES.map((macroType) => (
                      <option key={macroType} value={macroType}>
                        {macroType}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="bp-ue-macro-form-grid">
                <div className="bp-ue-macro-field">
                  <label>Name (EN)</label>
                  <input
                    className="bp-ue-macro-input"
                    value={dialog.name}
                    onChange={(event) => setDialog((prev) => ({ ...prev, name: event.target.value }))}
                  />
                </div>
                <div className="bp-ue-macro-field">
                  <label>Имя (RU)</label>
                  <input
                    className="bp-ue-macro-input"
                    value={dialog.nameRu}
                    onChange={(event) => setDialog((prev) => ({ ...prev, nameRu: event.target.value }))}
                  />
                </div>
              </div>

              <div className="bp-ue-macro-field">
                <label>{t('panel.ueMacros.category', 'Категория')}</label>
                <input
                  className="bp-ue-macro-input"
                  value={dialog.category}
                  onChange={(event) => setDialog((prev) => ({ ...prev, category: event.target.value }))}
                  placeholder="MultiCode"
                />
              </div>

              <div className="bp-ue-macro-field">
                <label>{t('panel.ueMacros.displayName', 'Отображаемое имя')}</label>
                <input
                  className={`bp-ue-macro-input ${isDialogValid ? '' : 'bp-ue-macro-input--invalid'}`}
                  value={dialog.displayName}
                  onChange={(event) => setDialog((prev) => ({ ...prev, displayName: event.target.value }))}
                  placeholder={lang === 'ru' ? 'Название, которое увидит пользователь в Blueprint' : 'Visible name in Blueprint'}
                  aria-label={t('panel.ueMacros.displayName', 'Отображаемое имя')}
                  aria-invalid={!isDialogValid}
                  required
                />
                <div className={`bp-ue-macro-field-note ${isDialogValid ? '' : 'bp-ue-macro-field-note--error'}`}>
                  {isDialogValid
                    ? t('panel.ueMacros.displayNameHint', 'Будет сохранено как meta=(DisplayName="...")')
                    : t('panel.ueMacros.displayNameRequired', 'Заполните отображаемое имя: оно обязательно и сохранится как meta=(DisplayName="...")')}
                </div>
              </div>

              <div className="bp-ue-macro-field">
                <label>{t('panel.ueMacros.specifiers', 'Спецификаторы')}</label>
                <div className="bp-ue-macro-specifier-grid">
                  {UE_MACRO_SPECIFIERS[dialog.macroType].map((specifier) => {
                    const active = dialog.specifiers.includes(specifier);
                    return (
                      <button
                        key={specifier}
                        type="button"
                        className={`bp-ue-macro-specifier-btn ${active ? 'active' : ''}`}
                        onClick={() => toggleSpecifier(specifier)}
                      >
                        {active ? '✓ ' : ''}
                        {specifier}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bp-ue-macro-field">
                <div className="bp-ue-macro-field-row">
                  <label>{t('panel.ueMacros.meta', 'Дополнительные мета-аргументы')}</label>
                  <button
                    type="button"
                    className="bp-ue-macro-inline-btn"
                    onClick={() =>
                      setDialog((prev) => ({
                        ...prev,
                        metaEntries: [...prev.metaEntries, { key: '', value: '' }],
                      }))
                    }
                  >
                    + meta
                  </button>
                </div>

                <div className="bp-ue-macro-meta-list">
                  {dialog.metaEntries.map((entry, index) => (
                    <div key={`${entry.key}:${index}`} className="bp-ue-macro-meta-row">
                      <input
                        className="bp-ue-macro-input"
                        value={entry.key}
                        placeholder={t('panel.ueMacros.metaKey', 'Ключ (например Tooltip)')}
                        onChange={(event) => {
                          const updated = [...dialog.metaEntries];
                          updated[index] = { ...updated[index], key: event.target.value };
                          setDialog((prev) => ({ ...prev, metaEntries: updated }));
                        }}
                      />
                      <input
                        className="bp-ue-macro-input"
                        value={entry.value}
                        placeholder={t('panel.ueMacros.metaValue', 'Значение')}
                        onChange={(event) => {
                          const updated = [...dialog.metaEntries];
                          updated[index] = { ...updated[index], value: event.target.value };
                          setDialog((prev) => ({ ...prev, metaEntries: updated }));
                        }}
                      />
                      <button
                        type="button"
                        className="bp-ue-macro-inline-btn bp-ue-macro-inline-btn--danger"
                        onClick={() => {
                          const updated = dialog.metaEntries.filter((_, itemIndex) => itemIndex !== index);
                          setDialog((prev) => ({ ...prev, metaEntries: updated }));
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bp-ue-macro-field">
                <label>{t('panel.ueMacros.preview', 'Превью')}</label>
                <div className="bp-ue-macro-preview bp-ue-macro-preview--dialog">
                  {dialogPreview}
                </div>
              </div>
            </div>

            <div className="bp-ue-macro-dialog-actions">
              <button type="button" className="bp-ue-macro-inline-btn" onClick={closeDialog}>
                {lang === 'ru' ? 'Отмена' : 'Cancel'}
              </button>
              <button
                type="button"
                className="bp-ue-macro-inline-btn bp-ue-macro-inline-btn--primary"
                onClick={saveDialog}
                disabled={!isDialogValid}
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
