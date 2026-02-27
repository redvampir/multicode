import React, { useMemo, useState, useCallback } from 'react';
import type {
  BlueprintGraphState,
  BlueprintVariable,
  PointerMeta,
  PointerMode,
  PointerPointeeDataType,
  VectorElementType,
} from '../shared/blueprintTypes';
import {
  createVariable,
  normalizePointerMeta,
  VARIABLE_TYPE_COLORS,
  VARIABLE_TYPE_LABELS,
} from '../shared/blueprintTypes';
import { getTranslation, type TranslationKey } from '../shared/translations';
import { parseVectorInput } from '../shared/vectorValue';
import { resolveVariableCodeName, sanitizeVariableCodeName } from './variableCodeName';

interface PointerReferencePanelProps {
  graphState: BlueprintGraphState;
  onVariablesChange: (variables: BlueprintVariable[]) => void;
  onCreateGetVariable?: (variable: BlueprintVariable) => void;
  onCreateSetVariable?: (variable: BlueprintVariable) => void;
  onRequestAttachToNode?: (pointerVariableId: string) => void;
  attachModePointerId?: string | null;
  displayLanguage: 'ru' | 'en';
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

interface PointerDialogState {
  isOpen: boolean;
  mode: 'create' | 'edit';
  editId: string | null;
  codeNameManual: boolean;
  variable: {
    name: string;
    nameRu: string;
    codeName: string;
    isPrivate: boolean;
    pointerMeta: PointerMeta;
    defaultValueDraft: string;
  };
}

type PointerVariableItem = BlueprintVariable & {
  pointerMeta: PointerMeta;
  color: string;
};

const POINTER_MODES: PointerMode[] = [
  'shared',
  'unique',
  'weak',
  'raw',
  'reference',
  'const_reference',
];

const POINTER_POINTEE_TYPES: PointerPointeeDataType[] = [
  'bool',
  'int32',
  'int64',
  'float',
  'double',
  'string',
  'vector',
  'class',
  'array',
];

const VECTOR_ELEMENT_TYPES: VectorElementType[] = [
  'int32',
  'int64',
  'float',
  'double',
  'bool',
  'string',
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isPointerVariable = (variable: BlueprintVariable): boolean =>
  variable.dataType === 'pointer';

const pointerModeLabel = (mode: PointerMode, isRu: boolean): string => {
  if (isRu) {
    switch (mode) {
      case 'shared':
        return 'Общий';
      case 'unique':
        return 'Уникальный';
      case 'weak':
        return 'Слабый';
      case 'raw':
        return 'Сырой';
      case 'reference':
        return 'Ссылка';
      case 'const_reference':
        return 'Конст. ссылка';
      default:
        return mode;
    }
  }

  switch (mode) {
    case 'shared':
      return 'Shared';
    case 'unique':
      return 'Unique';
    case 'weak':
      return 'Weak';
    case 'raw':
      return 'Raw';
    case 'reference':
      return 'Reference';
    case 'const_reference':
      return 'Const reference';
    default:
      return mode;
  }
};

const getPointeeDefaultValue = (pointerMeta: PointerMeta): BlueprintVariable['defaultValue'] => {
  switch (pointerMeta.pointeeDataType) {
    case 'bool':
      return false;
    case 'int32':
    case 'int64':
    case 'float':
    case 'double':
      return 0;
    case 'string':
      return '';
    case 'vector':
      return [];
    case 'class':
    case 'array':
    default:
      return null;
  }
};

const formatDefaultDraft = (
  pointerMeta: PointerMeta,
  value: BlueprintVariable['defaultValue'] | undefined
): string => {
  const resolved = value ?? getPointeeDefaultValue(pointerMeta);
  if (resolved === null || resolved === undefined) {
    return '';
  }
  if (Array.isArray(resolved)) {
    return JSON.stringify(resolved);
  }
  if (typeof resolved === 'boolean') {
    return resolved ? 'true' : 'false';
  }
  return String(resolved);
};

const parseDefaultDraft = (
  draft: string,
  pointerMeta: PointerMeta
): { ok: true; value: BlueprintVariable['defaultValue'] } | { ok: false; error: string } => {
  const trimmed = draft.trim();

  if (pointerMeta.mode === 'reference' || pointerMeta.mode === 'const_reference' || pointerMeta.mode === 'weak') {
    return { ok: true, value: null };
  }

  if (pointerMeta.pointeeDataType === 'vector') {
    const parsed = parseVectorInput(trimmed.length > 0 ? trimmed : '[]', pointerMeta.pointeeVectorElementType ?? 'double', {
      allowLegacyCsv: true,
    });
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }
    return { ok: true, value: parsed.value };
  }

  switch (pointerMeta.pointeeDataType) {
    case 'bool': {
      if (trimmed.length === 0) {
        return { ok: true, value: false };
      }
      const normalized = trimmed.toLowerCase();
      if (normalized === 'true' || normalized === '1') {
        return { ok: true, value: true };
      }
      if (normalized === 'false' || normalized === '0') {
        return { ok: true, value: false };
      }
      return { ok: false, error: 'Expected boolean' };
    }
    case 'int32':
    case 'int64': {
      if (trimmed.length === 0) {
        return { ok: true, value: 0 };
      }
      const parsed = Number(trimmed.replace(',', '.'));
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
        return { ok: false, error: 'Expected integer' };
      }
      return { ok: true, value: parsed };
    }
    case 'float':
    case 'double': {
      if (trimmed.length === 0) {
        return { ok: true, value: 0 };
      }
      const parsed = Number(trimmed.replace(',', '.'));
      if (!Number.isFinite(parsed)) {
        return { ok: false, error: 'Expected number' };
      }
      return { ok: true, value: parsed };
    }
    case 'string':
      return { ok: true, value: trimmed };
    case 'class':
    case 'array':
    default:
      return { ok: true, value: null };
  }
};

const resolveTargetShape = (
  variable: BlueprintVariable
): {
  dataType: PointerPointeeDataType | null;
  vectorElementType?: VectorElementType;
  pointerMode?: PointerMode;
  isPointer: boolean;
} => {
  if (variable.dataType === 'pointer') {
    const pointerMeta = normalizePointerMeta(variable.pointerMeta);
    return {
      dataType: pointerMeta.pointeeDataType,
      vectorElementType: pointerMeta.pointeeVectorElementType,
      pointerMode: pointerMeta.mode,
      isPointer: true,
    };
  }

  if (
    variable.dataType === 'execution' ||
    variable.dataType === 'any'
  ) {
    return {
      dataType: null,
      isPointer: false,
    };
  }

  return {
    dataType: variable.dataType,
    vectorElementType: variable.vectorElementType,
    isPointer: false,
  };
};

const isTargetCompatible = (
  target: BlueprintVariable,
  pointerMeta: PointerMeta
): boolean => {
  const targetShape = resolveTargetShape(target);
  if (!targetShape.dataType) {
    return false;
  }

  if (pointerMeta.mode === 'weak') {
    if (
      !targetShape.isPointer ||
      (targetShape.pointerMode !== 'shared' && targetShape.pointerMode !== 'unique')
    ) {
      return false;
    }
  } else if (targetShape.isPointer) {
    return false;
  }

  if (targetShape.dataType !== pointerMeta.pointeeDataType) {
    return false;
  }

  if (pointerMeta.pointeeDataType === 'vector') {
    const left = pointerMeta.pointeeVectorElementType ?? 'double';
    const right = targetShape.vectorElementType ?? 'double';
    if (left !== right) {
      return false;
    }
  }

  return true;
};

const isSelectableTarget = (
  target: BlueprintVariable,
  pointerMeta: PointerMeta
): boolean => {
  if (pointerMeta.mode === 'weak') {
    if (target.dataType !== 'pointer') {
      return false;
    }
    const meta = normalizePointerMeta(target.pointerMeta);
    return meta.mode === 'shared' || meta.mode === 'unique';
  }
  return target.dataType !== 'pointer';
};

const alignPointerMetaToTarget = (
  pointerMeta: PointerMeta,
  target: BlueprintVariable
): PointerMeta => {
  const targetShape = resolveTargetShape(target);
  if (!targetShape.dataType) {
    return normalizePointerMeta({
      ...pointerMeta,
      targetVariableId: target.id,
    });
  }

  return normalizePointerMeta({
    ...pointerMeta,
    pointeeDataType: targetShape.dataType,
    pointeeVectorElementType:
      targetShape.dataType === 'vector'
        ? targetShape.vectorElementType ?? 'double'
        : undefined,
    targetVariableId: target.id,
  });
};

const initialDialogState = (isRu: boolean): PointerDialogState => ({
  isOpen: false,
  mode: 'create',
  editId: null,
  codeNameManual: false,
  variable: {
    name: '',
    nameRu: '',
    codeName: '',
    isPrivate: false,
    pointerMeta: {
      mode: 'unique',
      pointeeDataType: 'double',
      pointeeVectorElementType: undefined,
      targetVariableId: undefined,
    },
    defaultValueDraft: isRu ? '0' : '0',
  },
});

export const PointerReferencePanel: React.FC<PointerReferencePanelProps> = ({
  graphState,
  onVariablesChange,
  onCreateGetVariable,
  onCreateSetVariable,
  onRequestAttachToNode,
  attachModePointerId,
  displayLanguage,
  collapsed,
  onToggleCollapsed,
}) => {
  const isRu = displayLanguage === 'ru';
  const translate = useCallback(
    (key: TranslationKey, fallback: string, replacements?: Record<string, string>) =>
      getTranslation(displayLanguage, key, replacements ?? {}, fallback),
    [displayLanguage]
  );
  const [dialog, setDialog] = useState<PointerDialogState>(initialDialogState(isRu));
  const [dialogError, setDialogError] = useState<string | null>(null);

  const toPointerVariableItem = useCallback((variable: BlueprintVariable): PointerVariableItem => ({
    ...variable,
    pointerMeta: normalizePointerMeta(variable.pointerMeta),
    color: variable.color ?? VARIABLE_TYPE_COLORS.pointer,
  }), []);

  const allVariables = useMemo<BlueprintVariable[]>(
    () =>
      (Array.isArray(graphState.variables) ? graphState.variables : []).filter(
        (value): value is BlueprintVariable => isRecord(value) && typeof value.id === 'string'
      ),
    [graphState.variables]
  );

  const pointerVariables = useMemo<PointerVariableItem[]>(
    () =>
      allVariables
        .filter(isPointerVariable)
        .map(toPointerVariableItem),
    [allVariables, toPointerVariableItem]
  );

  const mergePointerVariables = useCallback(
    (nextPointerVariables: BlueprintVariable[]): BlueprintVariable[] => {
      const pointerMap = new Map(nextPointerVariables.map((item) => [item.id, item]));
      const merged: BlueprintVariable[] = [];

      for (const variable of allVariables) {
        if (!isPointerVariable(variable)) {
          merged.push(variable);
          continue;
        }

        const nextPointer = pointerMap.get(variable.id);
        if (nextPointer) {
          merged.push(nextPointer);
          pointerMap.delete(variable.id);
        }
      }

      for (const pointerVariable of nextPointerVariables) {
        if (!allVariables.some((existing) => existing.id === pointerVariable.id)) {
          merged.push(pointerVariable);
        }
      }

      return merged;
    },
    [allVariables]
  );

  const openCreateDialog = useCallback(() => {
    setDialog(initialDialogState(isRu));
    setDialog((prev) => ({
      ...prev,
      isOpen: true,
      variable: {
        ...prev.variable,
        codeName: resolveVariableCodeName({
          variables: allVariables,
          fallbackNames: ['ptr'],
        }),
      },
    }));
    setDialogError(null);
  }, [allVariables, isRu]);

  const openEditDialog = useCallback(
    (variable: BlueprintVariable) => {
      const pointerMeta = normalizePointerMeta(variable.pointerMeta);
      setDialog({
        isOpen: true,
        mode: 'edit',
        editId: variable.id,
        codeNameManual: true,
        variable: {
          name: variable.name,
          nameRu: variable.nameRu,
          codeName:
            variable.codeName ??
            resolveVariableCodeName({
              variables: allVariables,
              fallbackNames: [variable.name, variable.nameRu, 'ptr'],
              excludeId: variable.id,
            }),
          isPrivate: variable.isPrivate === true,
          pointerMeta,
          defaultValueDraft: formatDefaultDraft(pointerMeta, variable.defaultValue),
        },
      });
      setDialogError(null);
    },
    [allVariables]
  );

  const closeDialog = useCallback(() => {
    setDialog(initialDialogState(isRu));
    setDialogError(null);
  }, [isRu]);

  const updateDialogVariable = useCallback(
    (patch: Partial<PointerDialogState['variable']>) => {
      setDialog((prev) => {
        const nextVariable = { ...prev.variable, ...patch };

        if (!prev.codeNameManual && (patch.name !== undefined || patch.nameRu !== undefined)) {
          nextVariable.codeName = resolveVariableCodeName({
            variables: allVariables,
            fallbackNames: [nextVariable.name, nextVariable.nameRu, 'ptr'],
            excludeId: prev.editId ?? undefined,
          });
        }

        return {
          ...prev,
          variable: nextVariable,
        };
      });
      setDialogError(null);
    },
    [allVariables]
  );

  const handleCodeNameChange = useCallback(
    (value: string) => {
      setDialog((prev) => ({
        ...prev,
        codeNameManual: true,
        variable: {
          ...prev.variable,
          codeName: value,
        },
      }));
      setDialogError(null);
    },
    []
  );

  const availableTargets = useMemo(() => {
    const editId = dialog.editId;
    const pointerMeta = normalizePointerMeta(dialog.variable.pointerMeta);
    return allVariables.filter((variable) => {
      if (editId && variable.id === editId) {
        return false;
      }
      return isSelectableTarget(variable, pointerMeta);
    });
  }, [allVariables, dialog.editId, dialog.variable.pointerMeta]);

  const validateDialog = useCallback((): { ok: true; variable: BlueprintVariable } | { ok: false } => {
    const trimmedName = dialog.variable.name.trim();
    const trimmedNameRu = dialog.variable.nameRu.trim();
    if (trimmedName.length === 0 && trimmedNameRu.length === 0) {
      setDialogError(isRu ? 'Укажите имя переменной.' : 'Provide variable name.');
      return { ok: false };
    }

    const pointerMeta = normalizePointerMeta(dialog.variable.pointerMeta);
    const resolvedName = trimmedName.length > 0 ? trimmedName : trimmedNameRu;
    const resolvedNameRu = trimmedNameRu.length > 0 ? trimmedNameRu : resolvedName;
    const resolvedCodeName = resolveVariableCodeName({
      variables: allVariables,
      preferredCodeName: sanitizeVariableCodeName(dialog.variable.codeName),
      fallbackNames: [resolvedName, resolvedNameRu, 'ptr'],
      excludeId: dialog.editId ?? undefined,
    });

    const requiresTarget =
      pointerMeta.mode === 'reference' ||
      pointerMeta.mode === 'const_reference' ||
      pointerMeta.mode === 'weak';
    if (requiresTarget && !pointerMeta.targetVariableId) {
      setDialogError(
        isRu
          ? 'Для выбранного режима требуется привязка к переменной.'
          : 'Selected mode requires target variable.'
      );
      return { ok: false };
    }

    if (pointerMeta.targetVariableId) {
      const target = allVariables.find((item) => item.id === pointerMeta.targetVariableId);
      if (!target || !isTargetCompatible(target, pointerMeta)) {
        setDialogError(
          isRu
            ? 'Несовместимая привязка: выберите подходящую переменную.'
            : 'Incompatible target binding: select a compatible variable.'
        );
        return { ok: false };
      }
    }

    const parsedDefault = parseDefaultDraft(dialog.variable.defaultValueDraft, pointerMeta);
    if (!parsedDefault.ok) {
      setDialogError(
        isRu
          ? `Некорректное значение по умолчанию (${parsedDefault.error})`
          : `Invalid default value (${parsedDefault.error})`
      );
      return { ok: false };
    }

    const normalized: BlueprintVariable = createVariable(resolvedName, 'pointer', {
      nameRu: resolvedNameRu,
      codeName: resolvedCodeName,
      category: 'default',
      isPrivate: dialog.variable.isPrivate,
      color: VARIABLE_TYPE_COLORS.pointer,
      defaultValue: parsedDefault.value,
      pointerMeta,
    });

    if (dialog.mode === 'edit' && dialog.editId) {
      normalized.id = dialog.editId;
      normalized.createdAt = pointerVariables.find((variable) => variable.id === dialog.editId)?.createdAt;
    }

    return { ok: true, variable: normalized };
  }, [allVariables, dialog, isRu, pointerVariables]);

  const submitDialog = useCallback(() => {
    const validation = validateDialog();
    if (!validation.ok) {
      return;
    }

    let nextPointerVariables: PointerVariableItem[] = pointerVariables;
    const savedPointerVariable = toPointerVariableItem(validation.variable);

    // weak_ptr требует shared_ptr на цели. Если выбран unique_ptr, автоматически апгрейдим цель.
    const savedPointerMeta = savedPointerVariable.pointerMeta;
    if (savedPointerMeta.mode === 'weak' && savedPointerMeta.targetVariableId) {
      const targetId = savedPointerMeta.targetVariableId;
      const target = pointerVariables.find((variable) => variable.id === targetId);
      if (target) {
        const targetMeta = target.pointerMeta;
        if (targetMeta.mode === 'unique') {
          nextPointerVariables = nextPointerVariables.map((variable) => {
            if (variable.id !== targetId) {
              return variable;
            }
            return {
              ...variable,
              pointerMeta: normalizePointerMeta({
                ...targetMeta,
                mode: 'shared',
              }),
            };
          });
        }
      }
    }

    if (dialog.mode === 'create') {
      nextPointerVariables = [...nextPointerVariables, savedPointerVariable];
    } else if (dialog.mode === 'edit' && dialog.editId) {
      nextPointerVariables = nextPointerVariables.map((variable) =>
        variable.id === dialog.editId ? savedPointerVariable : variable
      );
    }

    onVariablesChange(mergePointerVariables(nextPointerVariables));

    closeDialog();
  }, [
    closeDialog,
    dialog.editId,
    dialog.mode,
    mergePointerVariables,
    onVariablesChange,
    pointerVariables,
    toPointerVariableItem,
    validateDialog,
  ]);

  const removePointerVariable = useCallback(
    (variableId: string) => {
      const nextPointerVariables = pointerVariables.filter((variable) => variable.id !== variableId);
      onVariablesChange(mergePointerVariables(nextPointerVariables));
    },
    [mergePointerVariables, onVariablesChange, pointerVariables]
  );

  const detachPointerVariable = useCallback(
    (pointerVariableId: string) => {
      const nextPointerVariables = pointerVariables.map((variable) => {
        if (variable.id !== pointerVariableId) {
          return variable;
        }

        const pointerMeta = normalizePointerMeta(variable.pointerMeta);
        const requiresTarget =
          pointerMeta.mode === 'weak' ||
          pointerMeta.mode === 'reference' ||
          pointerMeta.mode === 'const_reference';
        if (requiresTarget) {
          return variable;
        }

        return {
          ...variable,
          pointerMeta: normalizePointerMeta({
            ...pointerMeta,
            targetVariableId: undefined,
          }),
        };
      });

      onVariablesChange(mergePointerVariables(nextPointerVariables));
    },
    [mergePointerVariables, onVariablesChange, pointerVariables]
  );

  const weakTargetUpgradeHint = useMemo(() => {
    const pointerMeta = normalizePointerMeta(dialog.variable.pointerMeta);
    if (pointerMeta.mode !== 'weak' || !pointerMeta.targetVariableId) {
      return null;
    }

    const target = allVariables.find((item) => item.id === pointerMeta.targetVariableId);
    if (!target || target.dataType !== 'pointer') {
      return null;
    }

    const targetMeta = normalizePointerMeta(target.pointerMeta);
    if (targetMeta.mode !== 'unique') {
      return null;
    }

    const targetName = displayLanguage === 'ru'
      ? (target.nameRu || target.name || target.codeName || target.id)
      : (target.name || target.nameRu || target.codeName || target.id);

    return translate(
      'panel.pointers.weakAutoUpgrade',
      'weak_ptr требует shared_ptr. При сохранении указатель "{name}" будет автоматически переведён в shared.',
      { name: targetName }
    );
  }, [allVariables, dialog.variable.pointerMeta, displayLanguage, translate]);

  return (
    <div className="pointer-list-panel">
      <div className="pointer-list-header">
        <div className="panel-header-title">
          <button
            type="button"
            className="panel-collapse-btn"
            onClick={onToggleCollapsed}
            title={isRu ? 'Свернуть/развернуть секцию' : 'Collapse/expand section'}
            data-testid="pointers-section-toggle"
          >
            {collapsed ? '▶' : '▼'}
          </button>
          <h3>{isRu ? 'Указатели и ссылки' : 'Pointers & References'}</h3>
        </div>
        <button
          type="button"
          className="btn-add-pointer"
          title={isRu ? 'Создать указатель/ссылку' : 'Create pointer/reference'}
          onClick={openCreateDialog}
        >
          {isRu ? '+ Указатель' : '+ Pointer'}
        </button>
      </div>

      {!collapsed && (
        <div className="pointer-list">
          {pointerVariables.length === 0 && (
            <div className="no-pointers">
              {isRu ? 'Нет указателей и ссылок' : 'No pointers or references'}
            </div>
          )}

          {pointerVariables.map((variable) => {
            const pointerMeta = normalizePointerMeta(variable.pointerMeta);
            const target = pointerMeta.targetVariableId
              ? allVariables.find((item) => item.id === pointerMeta.targetVariableId)
              : undefined;
            const displayName = isRu ? (variable.nameRu || variable.name) : (variable.name || variable.nameRu);
            const targetName = target
              ? (isRu ? (target.nameRu || target.name) : (target.name || target.nameRu))
              : null;
            const targetLabel = (() => {
              if (pointerMeta.mode === 'shared' || pointerMeta.mode === 'unique') {
                return isRu ? 'Источник:' : 'Source:';
              }
              return isRu ? 'Цель:' : 'Target:';
            })();
            const attachActive = attachModePointerId === variable.id;
            const requiresTarget =
              pointerMeta.mode === 'weak' ||
              pointerMeta.mode === 'reference' ||
              pointerMeta.mode === 'const_reference';
            const canDetach = Boolean(pointerMeta.targetVariableId) && !requiresTarget;

            return (
              <div key={variable.id} className="pointer-item">
                <div className="pointer-item-top">
                  <span className="pointer-name">{displayName}</span>
                  <span className="pointer-mode-badge">{pointerModeLabel(pointerMeta.mode, isRu)}</span>
                </div>
                <div className="pointer-item-meta">
                  <span className="pointer-meta-type">
                    {isRu ? 'Тип:' : 'Type:'} {isRu
                      ? VARIABLE_TYPE_LABELS[pointerMeta.pointeeDataType].ru
                      : VARIABLE_TYPE_LABELS[pointerMeta.pointeeDataType].en}
                  </span>
                  {targetName && (
                    <span className="pointer-meta-target">
                      {targetLabel} {targetName}
                    </span>
                  )}
                </div>
                <div className="pointer-actions">
                  <button
                    type="button"
                    className={`btn-icon ${attachActive ? 'active' : ''}`}
                    title={
                      attachActive
                        ? (isRu ? 'Отменить прикрепление' : 'Cancel attach')
                        : (isRu ? 'Прикрепить на графе (клик по ноде переменной)' : 'Attach on graph (click variable node)')
                    }
                    onClick={() => onRequestAttachToNode?.(variable.id)}
                    data-testid={`pointer-attach-${variable.id}`}
                  >
                    📌
                  </button>
                  <button
                    type="button"
                    className="btn-icon"
                    title={
                      canDetach
                        ? (isRu ? 'Открепить от переменной' : 'Detach from variable')
                        : requiresTarget
                          ? (isRu ? 'Для этого режима требуется привязка' : 'This mode requires binding')
                          : (isRu ? 'Нет привязки для открепления' : 'No binding to detach')
                    }
                    disabled={!canDetach}
                    onClick={() => detachPointerVariable(variable.id)}
                    data-testid={`pointer-detach-${variable.id}`}
                  >
                    🔓
                  </button>
                  <button
                    type="button"
                    className="btn-icon"
                    title={isRu ? 'Создать Get узел' : 'Create Get node'}
                    onClick={() => onCreateGetVariable?.(variable)}
                  >
                    📤
                  </button>
                  <button
                    type="button"
                    className="btn-icon"
                    title={isRu ? 'Создать Set узел' : 'Create Set node'}
                    onClick={() => onCreateSetVariable?.(variable)}
                    disabled={pointerMeta.mode === 'const_reference'}
                  >
                    📥
                  </button>
                  <button
                    type="button"
                    className="btn-icon"
                    title={isRu ? 'Редактировать' : 'Edit'}
                    onClick={() => openEditDialog(variable)}
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    className="btn-icon btn-danger"
                    title={isRu ? 'Удалить' : 'Delete'}
                    onClick={() => removePointerVariable(variable.id)}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dialog.isOpen && (
        <div className="pointer-dialog-overlay" onClick={closeDialog}>
          <div className="pointer-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="pointer-dialog-header">
              <h3>{dialog.mode === 'create'
                ? (isRu ? 'Новый указатель/ссылка' : 'New Pointer/Reference')
                : (isRu ? 'Редактировать указатель/ссылку' : 'Edit Pointer/Reference')}</h3>
            </div>
            <div className="pointer-dialog-body">
              <label className="pointer-dialog-label">
                {isRu ? 'Имя (латиница)' : 'Name (Latin)'}
                <input
                  className="pointer-dialog-input"
                  value={dialog.variable.name}
                  onChange={(event) => updateDialogVariable({ name: event.target.value })}
                />
              </label>

              <label className="pointer-dialog-label">
                {isRu ? 'Имя (RU)' : 'Name (RU)'}
                <input
                  className="pointer-dialog-input"
                  value={dialog.variable.nameRu}
                  onChange={(event) => updateDialogVariable({ nameRu: event.target.value })}
                />
              </label>

              <label className="pointer-dialog-label">
                {isRu ? 'Имя в коде (латиница)' : 'Code name (Latin)'}
                <input
                  className="pointer-dialog-input"
                  value={dialog.variable.codeName}
                  onChange={(event) => handleCodeNameChange(event.target.value)}
                />
              </label>

              <label className="pointer-dialog-label">
                {isRu ? 'Режим' : 'Mode'}
                <select
                  className="pointer-dialog-select"
                  value={dialog.variable.pointerMeta.mode}
                  onChange={(event) => {
                    const mode = event.target.value as PointerMode;
                    updateDialogVariable({
                      pointerMeta: normalizePointerMeta({
                        ...dialog.variable.pointerMeta,
                        mode,
                        targetVariableId: undefined,
                      }),
                    });
                  }}
                >
                  {POINTER_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {pointerModeLabel(mode, isRu)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="pointer-dialog-label">
                {isRu ? 'Тип данных объекта' : 'Pointee data type'}
                <select
                  className="pointer-dialog-select"
                  value={dialog.variable.pointerMeta.pointeeDataType}
                  onChange={(event) => {
                    const pointeeDataType = event.target.value as PointerPointeeDataType;
                    updateDialogVariable({
                      pointerMeta: normalizePointerMeta({
                        ...dialog.variable.pointerMeta,
                        pointeeDataType,
                        pointeeVectorElementType:
                          pointeeDataType === 'vector'
                            ? dialog.variable.pointerMeta.pointeeVectorElementType ?? 'double'
                            : undefined,
                        targetVariableId: undefined,
                      }),
                      defaultValueDraft: formatDefaultDraft(
                        normalizePointerMeta({
                          ...dialog.variable.pointerMeta,
                          pointeeDataType,
                          pointeeVectorElementType:
                            pointeeDataType === 'vector'
                              ? dialog.variable.pointerMeta.pointeeVectorElementType ?? 'double'
                              : undefined,
                        }),
                        undefined
                      ),
                    });
                  }}
                >
                  {POINTER_POINTEE_TYPES.map((dataType) => (
                    <option key={dataType} value={dataType}>
                      {isRu ? VARIABLE_TYPE_LABELS[dataType].ru : VARIABLE_TYPE_LABELS[dataType].en}
                    </option>
                  ))}
                </select>
              </label>

              {dialog.variable.pointerMeta.pointeeDataType === 'vector' && (
                <label className="pointer-dialog-label">
                  {isRu ? 'Тип элементов' : 'Vector element type'}
                  <select
                    className="pointer-dialog-select"
                    value={dialog.variable.pointerMeta.pointeeVectorElementType ?? 'double'}
                    onChange={(event) => {
                      const nextElementType = event.target.value as VectorElementType;
                      updateDialogVariable({
                        pointerMeta: normalizePointerMeta({
                          ...dialog.variable.pointerMeta,
                          pointeeVectorElementType: nextElementType,
                          targetVariableId: undefined,
                        }),
                      });
                    }}
                  >
                    {VECTOR_ELEMENT_TYPES.map((vectorType) => (
                      <option key={vectorType} value={vectorType}>
                        {isRu ? VARIABLE_TYPE_LABELS[vectorType].ru : VARIABLE_TYPE_LABELS[vectorType].en}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="pointer-dialog-label">
                {(dialog.variable.pointerMeta.mode === 'shared' || dialog.variable.pointerMeta.mode === 'unique')
                  ? (isRu ? 'Инициализировать из переменной' : 'Initialize from variable')
                  : (dialog.variable.pointerMeta.mode === 'weak'
                    ? translate(
                        'panel.pointers.weakTargetLabel',
                        isRu ? 'Цель (умный указатель)' : 'Target (smart pointer)'
                      )
                    : (isRu ? 'Привязка к переменной' : 'Bind to variable'))}
                <select
                  className="pointer-dialog-select"
                  value={dialog.variable.pointerMeta.targetVariableId ?? ''}
                  onChange={(event) => {
                    const targetId = event.target.value || undefined;
                    if (!targetId) {
                      updateDialogVariable({
                        pointerMeta: normalizePointerMeta({
                          ...dialog.variable.pointerMeta,
                          targetVariableId: undefined,
                        }),
                      });
                      return;
                    }

                    const target = allVariables.find((item) => item.id === targetId);
                    if (!target) {
                      return;
                    }

                    updateDialogVariable({
                      pointerMeta: alignPointerMetaToTarget(dialog.variable.pointerMeta, target),
                    });
                  }}
                >
                  <option value="">{isRu ? '— Не выбрано —' : '— None —'}</option>
                  {availableTargets.map((target) => (
                    <option key={target.id} value={target.id}>
                      {isRu ? (target.nameRu || target.name) : (target.name || target.nameRu)}
                    </option>
                  ))}
                </select>
              </label>

              {weakTargetUpgradeHint && (
                <div className="pointer-dialog-hint">
                  {weakTargetUpgradeHint}
                </div>
              )}

              {(dialog.variable.pointerMeta.mode === 'shared' || dialog.variable.pointerMeta.mode === 'unique') &&
                !dialog.variable.pointerMeta.targetVariableId && (
                  <label className="pointer-dialog-label">
                    {isRu ? 'Значение по умолчанию' : 'Default value'}
                    <input
                      className="pointer-dialog-input"
                      value={dialog.variable.defaultValueDraft}
                      onChange={(event) => updateDialogVariable({ defaultValueDraft: event.target.value })}
                      placeholder={
                        dialog.variable.pointerMeta.pointeeDataType === 'vector'
                          ? '[1, 2, 3]'
                          : isRu
                            ? 'Введите значение'
                            : 'Enter value'
                      }
                    />
                  </label>
                )}

              <label className="pointer-dialog-checkbox">
                <input
                  type="checkbox"
                  checked={dialog.variable.isPrivate}
                  onChange={(event) => updateDialogVariable({ isPrivate: event.target.checked })}
                />
                <span>{isRu ? 'Приватная' : 'Private'}</span>
              </label>

              {dialogError && <div className="pointer-dialog-error">{dialogError}</div>}
            </div>
            <div className="pointer-dialog-actions">
              <button type="button" className="pointer-dialog-btn" onClick={closeDialog}>
                {isRu ? 'Отмена' : 'Cancel'}
              </button>
              <button type="button" className="pointer-dialog-btn primary" onClick={submitDialog}>
                {isRu ? 'Сохранить' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PointerReferencePanel;
