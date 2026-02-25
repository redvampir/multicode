/**
 * Панель списка переменных (как в UE Blueprints)
 * Отображает список переменных графа с возможностью:
 * - Создания новой переменной
 * - Редактирования существующей (тип, значение по умолчанию)
 * - Удаления переменной
 * - Drag & Drop для создания GetVariable/SetVariable узлов
 */

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { logger, LOG_CATEGORIES } from "../shared/debugLogger";
import type {
  BlueprintVariable,
  BlueprintGraphState,
  VariableCategory,
  VectorElementType,
} from "../shared/blueprintTypes";
import {
  createVariable,
  normalizePointerMeta,
  VARIABLE_TYPE_COLORS,
  VARIABLE_TYPE_LABELS,
  VARIABLE_DATA_TYPES,
} from "../shared/blueprintTypes";
import type { PortDataType } from "../shared/portTypes";
import type { ResolvedVariableValues } from "./variableValueResolver";
import {
  resolveVariableCodeName,
  sanitizeVariableCodeName,
} from "./variableCodeName";
import {
  formatVectorInput,
  parseArrayInput,
  parseVectorInput,
  supportsArrayDataType,
} from "../shared/vectorValue";

interface VariableListPanelProps {
  /** Текущее состояние графа */
  graphState: BlueprintGraphState;
  /** Колбэк при изменении списка переменных */
  onVariablesChange: (variables: BlueprintVariable[]) => void;
  /** Колбэк для создания GetVariable узла */
  onCreateGetVariable: (variable: BlueprintVariable) => void;
  /** Колбэк для создания SetVariable узла */
  onCreateSetVariable: (variable: BlueprintVariable) => void;
  /** Язык отображения */
  displayLanguage: "ru" | "en";
  /** Свернута ли секция */
  collapsed: boolean;
  /** Переключить состояние сворачивания */
  onToggleCollapsed: () => void;
  /** Вычисленные текущие значения переменных (preview) */
  resolvedVariableValues?: ResolvedVariableValues;
}

interface EditDialogState {
  isOpen: boolean;
  mode: "create" | "edit";
  variable: Partial<BlueprintVariable>;
  editId: string | null;
  codeNameManual: boolean;
}

const initialDialogState: EditDialogState = {
  isOpen: false,
  mode: "create",
  variable: {
    name: "",
    nameRu: "",
    codeName: "",
    dataType: "bool",
    vectorElementType: "double",
    defaultValue: false,
    category: "default",
    description: "",
    isArray: false,
    arrayRank: 0,
    isPrivate: false,
  },
  editId: null,
  codeNameManual: false,
};

const isPortDataType = (value: unknown): value is PortDataType =>
  value === "execution" ||
  value === "bool" ||
  value === "int32" ||
  value === "int64" ||
  value === "float" ||
  value === "double" ||
  value === "string" ||
  value === "vector" ||
  value === "pointer" ||
  value === "class" ||
  value === "array" ||
  value === "any";

const isVariableCategory = (value: unknown): value is VariableCategory =>
  value === "default" || value === "input" || value === "output" || value === "local";

const VECTOR_ELEMENT_TYPES: VectorElementType[] = [
  "int32",
  "int64",
  "float",
  "double",
  "bool",
  "string",
];

const VARIABLE_PANEL_DATA_TYPES: PortDataType[] = VARIABLE_DATA_TYPES.filter(
  (type): type is PortDataType => type !== "pointer",
);

const isVectorElementType = (value: unknown): value is VectorElementType =>
  typeof value === "string" && VECTOR_ELEMENT_TYPES.includes(value as VectorElementType);

const toVectorElementType = (value: unknown): VectorElementType =>
  isVectorElementType(value) ? value : "double";

const toSafeDataType = (value: unknown): PortDataType =>
  isPortDataType(value) ? value : "any";

const toSafeCategory = (value: unknown): VariableCategory =>
  isVariableCategory(value) ? value : "default";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getDefaultValueForDataType = (
  dataType: PortDataType,
  arrayRank: number,
): BlueprintVariable["defaultValue"] => {
  if (arrayRank > 0) {
    return [];
  }

  switch (dataType) {
    case "bool":
      return false;
    case "int32":
    case "int64":
      return 0;
    case "float":
    case "double":
      return 0.0;
    case "string":
      return "";
    case "vector":
      return [];
    case "pointer":
    case "class":
    case "array":
    case "any":
    case "execution":
    default:
      return null;
  }
};

const getVariableColor = (dataType: PortDataType, arrayRank: number): string =>
  VARIABLE_TYPE_COLORS[arrayRank > 0 ? "array" : dataType];

const areValueTreesEqual = (left: unknown, right: unknown): boolean => {
  if (left === right) {
    return true;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false;
    }
    return left.every((item, index) => areValueTreesEqual(item, right[index]));
  }

  return false;
};

const MAX_ARRAY_RANK = 3;

const normalizeArrayRank = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  const rank = Math.trunc(value);
  if (rank <= 0) {
    return 0;
  }
  return Math.min(rank, MAX_ARRAY_RANK);
};

const resolveArrayRank = (
  variableLike: Partial<BlueprintVariable> | null | undefined,
  dataType: PortDataType,
): number => {
  if (!supportsArrayDataType(dataType)) {
    return 0;
  }

  const directRank = normalizeArrayRank(variableLike?.arrayRank);
  if (directRank > 0) {
    return directRank;
  }

  return variableLike?.isArray === true ? 1 : 0;
};

const normalizeVariable = (
  variable: unknown,
  index: number,
): BlueprintVariable | null => {
  if (!isRecord(variable)) {
    return null;
  }

  const safeId =
    typeof variable.id === "string" && variable.id.trim().length > 0
      ? variable.id.trim()
      : `legacy_var_${index + 1}`;
  const safeDataType = toSafeDataType(variable.dataType);
  const safeCategory = toSafeCategory(variable.category);
  const safeName =
    typeof variable.name === "string" && variable.name.trim().length > 0
      ? variable.name.trim()
      : `var_${index + 1}`;
  const safeNameRu =
    typeof variable.nameRu === "string" && variable.nameRu.trim().length > 0
      ? variable.nameRu.trim()
      : safeName;
  const safeVectorElementType =
    safeDataType === "vector"
      ? toVectorElementType(variable.vectorElementType)
      : undefined;
  const safePointerMeta =
    safeDataType === "pointer"
      ? normalizePointerMeta(variable.pointerMeta)
      : undefined;
  const safeArrayRank = resolveArrayRank(variable as Partial<BlueprintVariable>, safeDataType);
  let normalizedDefaultValue: BlueprintVariable["defaultValue"] | undefined;

  if (safeArrayRank > 0) {
    const parsedArray = parseArrayInput(variable.defaultValue, safeDataType, {
      vectorElementType: safeVectorElementType ?? "double",
      arrayRank: safeArrayRank,
      allowLegacyCsv: true,
    });
    if (parsedArray.ok) {
      normalizedDefaultValue = parsedArray.value;
    } else {
      logger.warn(
        LOG_CATEGORIES.WEBVIEW_ERROR,
        "VariableListPanel: invalid array default value, fallback to empty array",
        {
          variableId: safeId,
          dataType: safeDataType,
          arrayRank: safeArrayRank,
          error: parsedArray.error,
        },
      );
      normalizedDefaultValue = [];
    }
  } else if (safeDataType === "vector") {
    const parsedVector = parseVectorInput(variable.defaultValue, safeVectorElementType ?? "double", {
      allowLegacyCsv: true,
    });
    if (parsedVector.ok) {
      normalizedDefaultValue = parsedVector.value;
    } else {
      logger.warn(
        LOG_CATEGORIES.WEBVIEW_ERROR,
        "VariableListPanel: invalid vector default value, fallback to empty array",
        {
          variableId: safeId,
          error: parsedVector.error,
        },
      );
      normalizedDefaultValue = [];
    }
  } else {
    normalizedDefaultValue =
      typeof variable.defaultValue === "string" ||
      typeof variable.defaultValue === "number" ||
      typeof variable.defaultValue === "boolean" ||
      variable.defaultValue === null
        ? variable.defaultValue
        : undefined;
  }

  return {
    id: safeId,
    name: safeName,
    nameRu: safeNameRu,
    codeName: typeof variable.codeName === "string" ? variable.codeName : undefined,
    dataType: safeDataType,
    pointerMeta: safePointerMeta,
    vectorElementType: safeVectorElementType,
    defaultValue: normalizedDefaultValue,
    category: safeCategory,
    description: typeof variable.description === "string" ? variable.description : undefined,
    isArray: safeArrayRank > 0,
    arrayRank: safeArrayRank,
    isPrivate: typeof variable.isPrivate === "boolean" ? variable.isPrivate : false,
    color:
      typeof variable.color === "string" && variable.color.trim().length > 0
        ? variable.color
        : getVariableColor(safeDataType, safeArrayRank),
    createdAt: typeof variable.createdAt === "string" ? variable.createdAt : undefined,
  };
};

const areVariablesEquivalent = (
  left: unknown,
  right: BlueprintVariable,
): boolean => {
  if (!isRecord(left)) {
    return false;
  }

  const leftDataType = toSafeDataType(left.dataType);
  const rightDataType = toSafeDataType(right.dataType);
  const leftPointerMeta = leftDataType === "pointer"
    ? normalizePointerMeta(left.pointerMeta)
    : undefined;
  const rightPointerMeta = rightDataType === "pointer"
    ? normalizePointerMeta(right.pointerMeta)
    : undefined;
  const pointerMetaEquivalent =
    leftPointerMeta?.mode === rightPointerMeta?.mode &&
    leftPointerMeta?.pointeeDataType === rightPointerMeta?.pointeeDataType &&
    leftPointerMeta?.pointeeVectorElementType === rightPointerMeta?.pointeeVectorElementType &&
    leftPointerMeta?.targetVariableId === rightPointerMeta?.targetVariableId;
  const leftDefaultValue = left.defaultValue;
  const rightDefaultValue = right.defaultValue;
  const defaultValuesEquivalent = areValueTreesEqual(leftDefaultValue, rightDefaultValue);

  return left.id === right.id &&
    left.name === right.name &&
    left.nameRu === right.nameRu &&
    left.codeName === right.codeName &&
    leftDataType === rightDataType &&
    left.vectorElementType === right.vectorElementType &&
    pointerMetaEquivalent &&
    defaultValuesEquivalent &&
    left.category === right.category &&
    left.description === right.description &&
    left.isArray === right.isArray &&
    left.arrayRank === right.arrayRank &&
    left.isPrivate === right.isPrivate &&
    left.color === right.color &&
    left.createdAt === right.createdAt;
};

export const VariableListPanel: React.FC<VariableListPanelProps> = ({
  graphState,
  onVariablesChange,
  onCreateGetVariable,
  onCreateSetVariable,
  displayLanguage,
  collapsed,
  onToggleCollapsed,
  resolvedVariableValues,
}) => {
  const isRu = displayLanguage === "ru";
  const rawVariables = useMemo<unknown[]>(
    () => (Array.isArray(graphState.variables) ? (graphState.variables as unknown[]) : []),
    [graphState.variables],
  );
  const variables = useMemo(() => {
    const normalizedVariables = rawVariables
      .map((variable, index) => normalizeVariable(variable, index))
      .filter((variable): variable is BlueprintVariable => variable !== null);

    return normalizedVariables;
  }, [rawVariables]);
  const [dialog, setDialog] = useState<EditDialogState>(initialDialogState);
  const [nameValidationError, setNameValidationError] = useState<string | null>(null);
  const [vectorDefaultDraft, setVectorDefaultDraft] = useState<string>("[]");
  const [vectorDefaultError, setVectorDefaultError] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<
    Set<VariableCategory>
  >(new Set(["default", "input", "output", "local"]));

  const resolveDialogCodeName = useCallback(
    (preferredCodeName: unknown, fallbackNames: unknown[], excludeId?: string) =>
      resolveVariableCodeName({
        preferredCodeName,
        fallbackNames,
        variables,
        excludeId,
      }),
    [variables],
  );

  const parseDialogCollectionDraft = useCallback(
    (
      rawValue: unknown,
      dataType: PortDataType,
      arrayRank: number,
      elementType: VectorElementType,
    ) => {
      try {
        if (arrayRank > 0) {
          return parseArrayInput(rawValue, dataType, {
            vectorElementType: elementType,
            arrayRank,
            allowLegacyCsv: true,
          });
        }

        if (dataType === "vector") {
          return parseVectorInput(rawValue, elementType, { allowLegacyCsv: true });
        }

        return {
          ok: true as const,
          value: rawValue as BlueprintVariable["defaultValue"],
          source: "array" as const,
        };
      } catch (error) {
        logger.error(
          LOG_CATEGORIES.WEBVIEW_ERROR,
          "VariableListPanel: parseDialogCollectionDraft failed",
          {
            dataType,
            arrayRank,
            error: error instanceof Error ? error.message : String(error),
          },
        );
        return {
          ok: false as const,
          error: "Unexpected parser error",
        };
      }
    },
    [],
  );

  const collectionInputErrorText = useCallback(
    (details?: string): string =>
      isRu
        ? `Некорректный JSON-массив${details ? ` (${details})` : ""}`
        : `Invalid JSON array${details ? ` (${details})` : ""}`,
    [isRu],
  );

  // Миграция legacy-данных: нормализуем category/dataType/name/color.
  useEffect(() => {
    if (rawVariables.length !== variables.length) {
      logger.warn(
        LOG_CATEGORIES.WEBVIEW_ERROR,
        "VariableListPanel: detected invalid variable entries, normalizing list",
        {
          rawCount: rawVariables.length,
          normalizedCount: variables.length,
        },
      );
      onVariablesChange(variables);
      return;
    }

    const needsMigration = rawVariables.some((rawVariable, index) =>
      !areVariablesEquivalent(rawVariable, variables[index]),
    );
    if (needsMigration) {
      onVariablesChange(variables);
    }
  }, [rawVariables, variables, onVariablesChange]);

  // === Обработчики диалога ===
  const handleOpenCreate = useCallback(() => {
    setDialog({
      ...initialDialogState,
      isOpen: true,
      mode: "create",
      codeNameManual: false,
    });
    setVectorDefaultDraft("[]");
    setVectorDefaultError(null);
    setNameValidationError(null);
  }, []);

  const handleOpenEdit = useCallback((variable: BlueprintVariable) => {
    const resolvedCodeName = resolveDialogCodeName(
      variable.codeName,
      [variable.name, variable.nameRu],
      variable.id,
    );
    const arrayRank = resolveArrayRank(variable, variable.dataType);
    const vectorElementType = variable.dataType === "vector"
      ? toVectorElementType(variable.vectorElementType)
      : "double";
    const parsedCollectionDefault = parseDialogCollectionDraft(
      variable.defaultValue,
      variable.dataType,
      arrayRank,
      vectorElementType,
    );
    const normalizedCollectionDefault =
      variable.dataType === "vector" || arrayRank > 0
        ? parsedCollectionDefault.ok
          ? parsedCollectionDefault.value
          : []
        : variable.defaultValue;

    setDialog({
      isOpen: true,
      mode: "edit",
      variable: {
        ...variable,
        codeName: resolvedCodeName,
        isArray: arrayRank > 0,
        arrayRank,
        vectorElementType: variable.dataType === "vector" ? vectorElementType : undefined,
        defaultValue: normalizedCollectionDefault,
      },
      editId: variable.id,
      codeNameManual: typeof variable.codeName === "string" && variable.codeName.trim().length > 0,
    });
    setVectorDefaultDraft(
      (variable.dataType === "vector" || arrayRank > 0)
        ? formatVectorInput(normalizedCollectionDefault)
        : "[]",
    );
    setVectorDefaultError(
      !parsedCollectionDefault.ok
        ? collectionInputErrorText(parsedCollectionDefault.error)
        : null,
    );
    setNameValidationError(null);
  }, [collectionInputErrorText, parseDialogCollectionDraft, resolveDialogCodeName]);

  const handleCloseDialog = useCallback(() => {
    setDialog(initialDialogState);
    setVectorDefaultDraft("[]");
    setVectorDefaultError(null);
    setNameValidationError(null);
  }, []);

  const handleDialogChange = useCallback(
    (field: keyof BlueprintVariable, value: unknown) => {
      setDialog((prev) => {
        if (field === "codeName") {
          return {
            ...prev,
            codeNameManual: true,
            variable: {
              ...prev.variable,
              codeName: sanitizeVariableCodeName(value),
            },
          };
        }

        const nextVariable: Partial<BlueprintVariable> = {
          ...prev.variable,
          [field]: value,
        };

        if (field === "arrayRank") {
          const currentDataType = isPortDataType(nextVariable.dataType) ? nextVariable.dataType : "any";
          const normalizedRank = supportsArrayDataType(currentDataType)
            ? normalizeArrayRank(value)
            : 0;
          nextVariable.arrayRank = normalizedRank;
          nextVariable.isArray = normalizedRank > 0;
        }

        if (field === "isArray") {
          const currentDataType = isPortDataType(nextVariable.dataType) ? nextVariable.dataType : "any";
          const currentRank = normalizeArrayRank(nextVariable.arrayRank);
          const enabled = Boolean(value) && supportsArrayDataType(currentDataType);
          const nextRank = enabled ? Math.max(1, currentRank) : 0;
          nextVariable.arrayRank = nextRank;
          nextVariable.isArray = nextRank > 0;
        }

        if ((field === "name" || field === "nameRu") && !prev.codeNameManual) {
          nextVariable.codeName = resolveDialogCodeName(
            undefined,
            [nextVariable.name, nextVariable.nameRu],
            prev.editId ?? undefined,
          );
        }

        if (field === "name") {
          setNameValidationError(null);
        }

        return {
          ...prev,
          variable: nextVariable,
        };
      });
    },
    [resolveDialogCodeName],
  );

  const handleSaveVariable = useCallback(() => {
    try {
      const { mode, variable, editId } = dialog;
      const nextDataType = isPortDataType(variable.dataType) ? variable.dataType : undefined;
      const nextCategory = isVariableCategory(variable.category) ? variable.category : undefined;
      const resolvedDataType = nextDataType ?? "bool";
      const trimmedName = typeof variable.name === "string" ? variable.name.trim() : "";
      const trimmedNameRu =
        typeof variable.nameRu === "string" && variable.nameRu.trim().length > 0
          ? variable.nameRu.trim()
          : trimmedName;

      if (!trimmedName) {
        setNameValidationError(isRu ? "Введите имя переменной" : "Enter variable name");
        return;
      }

      const resolvedArrayRank = resolveArrayRank(variable, resolvedDataType);
      const resolvedVectorElementType = toVectorElementType(variable.vectorElementType);
      const resolveDefaultValue = (): BlueprintVariable["defaultValue"] | null => {
        if (!(resolvedDataType === "vector" || resolvedArrayRank > 0)) {
          return variable.defaultValue;
        }

        const parsed = parseDialogCollectionDraft(
          vectorDefaultDraft,
          resolvedDataType,
          resolvedArrayRank,
          resolvedVectorElementType,
        );
        if (!parsed.ok) {
          setVectorDefaultError(collectionInputErrorText(parsed.error));
          return null;
        }

        const normalizedDraft = formatVectorInput(parsed.value);
        setVectorDefaultDraft(normalizedDraft);
        setVectorDefaultError(null);
        setNameValidationError(null);
        return parsed.value;
      };

      const resolvedDefaultValue = resolveDefaultValue();
      if (resolvedDefaultValue === null) {
        return;
      }

      if (mode === "create") {
        const createDataType: PortDataType = resolvedDataType;
        const createArrayRank = resolvedArrayRank;
        const createCategory: VariableCategory = nextCategory ?? "default";
        const createVectorElementType: VectorElementType | undefined =
          createDataType === "vector"
            ? resolvedVectorElementType
            : undefined;
        const codeName = resolveDialogCodeName(
          variable.codeName,
          [trimmedName, trimmedNameRu],
        );
        const newVar = createVariable(
          trimmedName,
          createDataType,
          {
            nameRu: trimmedNameRu || trimmedName,
            codeName,
            vectorElementType: createVectorElementType,
            defaultValue: resolvedDefaultValue,
            category: createCategory,
            description: variable.description,
            isArray: createArrayRank > 0,
            arrayRank: createArrayRank,
            isPrivate: variable.isPrivate,
            color: getVariableColor(createDataType, createArrayRank),
          },
        );
        logger.action(
          LOG_CATEGORIES.VARIABLE_CREATE,
          `Variable created: ${newVar.name}`,
          {
            id: newVar.id,
            dataType: newVar.dataType,
            codeName: newVar.codeName,
            defaultValue: newVar.defaultValue,
            category: newVar.category,
          },
        );
        onVariablesChange([...variables, newVar]);
      } else if (mode === "edit" && editId) {
        const updatedVars = variables.map((v) => {
          if (v.id === editId) {
            const editedDataType = nextDataType ?? v.dataType;
            const editedArrayRank = resolveArrayRank({
              ...v,
              ...variable,
              dataType: editedDataType,
            }, editedDataType);
            const editedVectorElementType: VectorElementType | undefined =
              editedDataType === "vector"
                ? toVectorElementType(variable.vectorElementType ?? v.vectorElementType ?? resolvedVectorElementType)
                : undefined;
            const editedCategory = nextCategory ?? v.category;
            const updatedName = trimmedName || v.name;
            const updatedNameRu = trimmedNameRu || v.nameRu || updatedName;
            const updatedCodeName = resolveDialogCodeName(
              variable.codeName ?? v.codeName,
              [updatedName, updatedNameRu],
              editId,
            );
            const updated = {
              ...v,
              name: updatedName,
              nameRu: updatedNameRu,
              codeName: updatedCodeName,
              dataType: editedDataType,
              vectorElementType: editedVectorElementType,
              defaultValue: editedDataType === "vector" || editedArrayRank > 0 ? resolvedDefaultValue : variable.defaultValue,
              category: editedCategory,
              description: variable.description ?? v.description,
              isArray: editedArrayRank > 0,
              arrayRank: editedArrayRank,
              isPrivate: variable.isPrivate ?? v.isPrivate,
              color: getVariableColor(editedDataType, editedArrayRank),
            };
            logger.action(
              LOG_CATEGORIES.VARIABLE_UPDATE,
              `Variable updated: ${updated.name}`,
              {
                id: updated.id,
                changes: {
                  dataType: updated.dataType,
                  codeName: updated.codeName,
                  defaultValue: updated.defaultValue,
                },
              },
            );
            return updated;
          }
          return v;
        });
        onVariablesChange(updatedVars);
      }

      handleCloseDialog();
    } catch (error) {
      logger.error(
        LOG_CATEGORIES.WEBVIEW_ERROR,
        "VariableListPanel: handleSaveVariable crashed",
        {
          mode: dialog.mode,
          dataType: dialog.variable.dataType,
          arrayRank: dialog.variable.arrayRank,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      setVectorDefaultError(collectionInputErrorText("Unexpected save error"));
    }
  }, [
    dialog,
    handleCloseDialog,
    isRu,
    onVariablesChange,
    parseDialogCollectionDraft,
    resolveDialogCodeName,
    vectorDefaultDraft,
    collectionInputErrorText,
    variables,
  ]);

  const handleDeleteVariable = useCallback(
    (varId: string) => {
      // confirm() не работает в webview sandbox - удаляем сразу
      const deletedVar = variables.find((v: BlueprintVariable) => v.id === varId);
      logger.action(
        LOG_CATEGORIES.VARIABLE_DELETE,
        `Variable deleted: ${deletedVar?.name || varId}`,
        { id: varId },
      );
      const newVariables = variables.filter((v: BlueprintVariable) => v.id !== varId);
      onVariablesChange(newVariables);
    },
    [onVariablesChange, variables],
  );

  const toggleCategory = useCallback((category: VariableCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const visibleVariables = useMemo(
    () => variables.filter((variable) => variable.dataType !== "pointer"),
    [variables],
  );

  // === Группировка по категориям ===
  const groupedVariables = useMemo(() => {
    const groups: Record<VariableCategory, BlueprintVariable[]> = {
      default: [],
      input: [],
      output: [],
      local: [],
    };
    for (const v of visibleVariables) {
      groups[v.category].push(v);
    }
    return groups;
  }, [visibleVariables]);

  const categoryLabels: Record<VariableCategory, { en: string; ru: string }> = {
    default: { en: "Variables", ru: "Переменные" },
    input: { en: "Input", ru: "Входы" },
    output: { en: "Output", ru: "Выходы" },
    local: { en: "Local", ru: "Локальные" },
  };

  // === Drag handlers для создания узлов ===
  const handleDragStart = useCallback(
    (
      e: React.DragEvent,
      variable: BlueprintVariable,
      nodeType: "get" | "set",
    ) => {
      console.log('[VariableListPanel] Drag start:', variable.id, nodeType);
      e.dataTransfer.setData(
        "application/variable",
        JSON.stringify({ variable, nodeType }),
      );
      // Также добавляем text/plain для совместимости
      e.dataTransfer.setData("text/plain", variable.id);
      e.dataTransfer.effectAllowed = "all";
    },
    [],
  );

  // === Получение значения по умолчанию в строковом виде ===
  const formatValueDisplay = useCallback((value: unknown): string => {
    if (value === null || value === undefined) {
      return isRu ? "(нет)" : "(none)";
    }
    if (typeof value === "boolean") {
      return value
        ? isRu
          ? "Истина"
          : "True"
        : isRu
          ? "Ложь"
          : "False";
    }
    if (Array.isArray(value)) {
      return formatVectorInput(value);
    }
    return String(value);
  }, [isRu]);

  const getDefaultValueDisplay = useCallback((variable: BlueprintVariable): string =>
    formatValueDisplay(variable.defaultValue), [formatValueDisplay]
  );

  const getCurrentValueDisplay = useCallback((variable: BlueprintVariable): string => {
    const resolved = resolvedVariableValues?.[variable.id];
    if (!resolved) {
      return formatValueDisplay(variable.defaultValue);
    }
    if (resolved.status === "ambiguous") {
      return "~";
    }
    if (resolved.status === "unknown") {
      return "?";
    }
    return formatValueDisplay(resolved.currentValue);
  }, [formatValueDisplay, resolvedVariableValues]);

  const getVariableTypeDisplay = useCallback((variable: BlueprintVariable): string => {
    const arrayRank = resolveArrayRank(variable, variable.dataType);
    const arraySuffix = "[]".repeat(arrayRank);
    const baseLabel = isRu
      ? VARIABLE_TYPE_LABELS[variable.dataType].ru
      : VARIABLE_TYPE_LABELS[variable.dataType].en;
    if (variable.dataType !== "vector") {
      return `${baseLabel}${arraySuffix}`;
    }

    const elementType = isVectorElementType(variable.vectorElementType)
      ? variable.vectorElementType
      : "double";
    const elementLabel = isRu
      ? VARIABLE_TYPE_LABELS[elementType].ru
      : VARIABLE_TYPE_LABELS[elementType].en;
    const vectorLabel = `${baseLabel}<${elementLabel}>`;
    return `${vectorLabel}${arraySuffix}`;
  }, [isRu]);

  const getArrayInputHint = useCallback((
    dataType: PortDataType,
    arrayRank: number,
    vectorElementType: VectorElementType,
    example: string,
  ): { title: string; signature: string; example: string } => {
    const baseSignature = dataType === "vector"
      ? `vector<${vectorElementType}>`
      : dataType;
    const signature = `${baseSignature}${"[]".repeat(arrayRank)}`;

    const title = isRu
      ? `Формат: JSON-массив ${arrayRank}D`
      : `Format: ${arrayRank}D JSON array`;

    return {
      title,
      signature,
      example,
    };
  }, [isRu]);

  // === Ввод значения по умолчанию ===
  const renderDefaultValueInputUnsafe = () => {
    const dataType = isPortDataType(dialog.variable.dataType)
      ? dialog.variable.dataType
      : "bool";
    const value = dialog.variable.defaultValue;
    const arrayRank = resolveArrayRank(dialog.variable, dataType);
    const isArrayMode = arrayRank > 0;
    const vectorElementType = toVectorElementType(dialog.variable.vectorElementType);

    if (isArrayMode) {
      const scalarRankOnePlaceholder = dataType === "string"
        ? "[\"alpha\", \"beta\", \"gamma\"]"
        : dataType === "bool"
          ? "[true, false, true]"
          : dataType === "int32" || dataType === "int64"
            ? "[1, 2, 3, 4]"
            : "[1.25, 2.5, 3.75]";
      const scalarRankTwoPlaceholder = dataType === "string"
        ? "[[\"a\", \"b\"], [\"c\"]]"
        : dataType === "bool"
          ? "[[true, false], [false, true]]"
          : dataType === "int32" || dataType === "int64"
            ? "[[1, 2], [3, 4]]"
            : "[[1.25, 2.5], [3.75]]";
      const scalarRankThreePlaceholder = dataType === "string"
        ? "[[[\"a\"], [\"b\"]], [[\"c\"]]]"
        : dataType === "bool"
          ? "[[[true], [false]], [[true]]]"
          : dataType === "int32" || dataType === "int64"
            ? "[[[1], [2]], [[3], [4]]]"
            : "[[[1.25], [2.5]], [[3.75]]]";

      const vectorRankOnePlaceholder = vectorElementType === "string"
        ? "[[\"red\", \"green\"], [\"blue\"]]"
        : vectorElementType === "bool"
          ? "[[true, false], [false, true]]"
          : vectorElementType === "int32" || vectorElementType === "int64"
            ? "[[1, 2], [3, 4]]"
            : "[[1.25, 2.5], [3.75]]";
      const vectorRankTwoPlaceholder = vectorElementType === "string"
        ? "[[[\"red\"], [\"green\"]], [[\"blue\"]]]"
        : vectorElementType === "bool"
          ? "[[[true], [false]], [[true]]]"
          : vectorElementType === "int32" || vectorElementType === "int64"
            ? "[[[1], [2]], [[3], [4]]]"
            : "[[[1.25], [2.5]], [[3.75]]]";

      const placeholder = dataType === "vector"
        ? arrayRank >= 2
          ? vectorRankTwoPlaceholder
          : vectorRankOnePlaceholder
        : arrayRank >= 3
          ? scalarRankThreePlaceholder
          : arrayRank === 2
            ? scalarRankTwoPlaceholder
            : scalarRankOnePlaceholder;
      const arrayHint = getArrayInputHint(dataType, arrayRank, vectorElementType, placeholder);

      return (
        <>
            <textarea
              value={vectorDefaultDraft}
            onChange={(e) => {
              setVectorDefaultDraft(e.target.value);
              if (vectorDefaultError) {
                setVectorDefaultError(null);
              }
            }}
            onBlur={() => {
              try {
                const parsed = parseDialogCollectionDraft(
                  vectorDefaultDraft,
                  dataType,
                  arrayRank,
                  vectorElementType,
                );
                if (!parsed.ok) {
                  setVectorDefaultError(collectionInputErrorText(parsed.error));
                  return;
                }
                handleDialogChange("defaultValue", parsed.value);
                setVectorDefaultDraft(formatVectorInput(parsed.value));
                setVectorDefaultError(null);
              } catch (error) {
                logger.error(
                  LOG_CATEGORIES.WEBVIEW_ERROR,
                  "VariableListPanel: failed to commit array default value",
                  {
                    dataType,
                    arrayRank,
                    error: error instanceof Error ? error.message : String(error),
                  },
                );
                setVectorDefaultError(collectionInputErrorText("Unexpected commit error"));
              }
            }}
            className="variable-textarea"
            placeholder={placeholder}
            rows={2}
            />
          {vectorDefaultError && (
            <div style={{ color: "#f38ba8", fontSize: 12, marginTop: 6 }}>
              {vectorDefaultError}
            </div>
          )}
          {!vectorDefaultError && (
            <div className="variable-input-hint" role="note">
              <div className="variable-input-hint-title">{arrayHint.title}</div>
              <div className="variable-input-hint-signature">
                {isRu ? "Тип:" : "Type:"} <code>{arrayHint.signature}</code>
              </div>
              <div className="variable-input-hint-example">
                {isRu ? "Пример:" : "Example:"} <code>{arrayHint.example}</code>
              </div>
            </div>
          )}
        </>
      );
    }

    switch (dataType) {
      case "bool":
        return (
          <label className="variable-checkbox">
            <input
              type="checkbox"
              checked={value === true}
              onChange={(e) =>
                handleDialogChange("defaultValue", e.target.checked)
              }
            />
            {isRu ? "Истина" : "True"}
          </label>
        );
      case "int32":
      case "int64":
        return (
          <input
            type="number"
            step="1"
            value={typeof value === "number" ? value : 0}
            onChange={(e) =>
              handleDialogChange(
                "defaultValue",
                parseInt(e.target.value, 10) || 0,
              )
            }
            className="variable-input"
          />
        );
      case "float":
      case "double":
        return (
          <input
            type="number"
            step="0.1"
            value={typeof value === "number" ? value : 0}
            onChange={(e) =>
              handleDialogChange(
                "defaultValue",
                parseFloat(e.target.value) || 0,
              )
            }
            className="variable-input"
          />
        );
      case "string":
        return (
          <input
            type="text"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => handleDialogChange("defaultValue", e.target.value)}
            className="variable-input"
            placeholder={isRu ? "Текст..." : "Text..."}
          />
        );
      case "vector":
      {
        const placeholder = vectorElementType === "string"
          ? "[\"red\", \"green\", \"blue\"]"
          : vectorElementType === "bool"
            ? "[true, false, true]"
            : vectorElementType === "int32" || vectorElementType === "int64"
              ? "[1, 2, 3, 4]"
              : "[1.25, 2.5, 3.75]";

        return (
          <>
          <textarea
            value={vectorDefaultDraft}
            onChange={(e) => {
              setVectorDefaultDraft(e.target.value);
              if (vectorDefaultError) {
                setVectorDefaultError(null);
              }
            }}
            onBlur={() => {
              try {
                const parsed = parseDialogCollectionDraft(
                  vectorDefaultDraft,
                  "vector",
                  0,
                  vectorElementType,
                );
                if (!parsed.ok) {
                  setVectorDefaultError(collectionInputErrorText(parsed.error));
                  return;
                }
                handleDialogChange("defaultValue", parsed.value);
                setVectorDefaultDraft(formatVectorInput(parsed.value));
                setVectorDefaultError(null);
              } catch (error) {
                logger.error(
                  LOG_CATEGORIES.WEBVIEW_ERROR,
                  "VariableListPanel: failed to commit vector default value",
                  {
                    vectorElementType,
                    error: error instanceof Error ? error.message : String(error),
                  },
                );
                setVectorDefaultError(collectionInputErrorText("Unexpected commit error"));
              }
            }}
            className="variable-textarea"
            placeholder={placeholder}
            rows={2}
          />
          {vectorDefaultError && (
            <div style={{ color: "#f38ba8", fontSize: 12, marginTop: 6 }}>
              {vectorDefaultError}
            </div>
          )}
          </>
        );
      }
      default:
        return (
          <span className="variable-value-na">
            {isRu ? "Недоступно" : "N/A"}
          </span>
        );
    }
  };

  const renderDefaultValueInput = () => {
    try {
      return renderDefaultValueInputUnsafe();
    } catch (error) {
      logger.error(
        LOG_CATEGORIES.WEBVIEW_ERROR,
        "VariableListPanel: renderDefaultValueInput crashed",
        {
          mode: dialog.mode,
          dataType: dialog.variable.dataType,
          arrayRank: dialog.variable.arrayRank,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return (
        <span className="variable-value-na">
          {isRu ? "Ошибка отображения поля" : "Failed to render input"}
        </span>
      );
    }
  };

  return (
    <div className="variable-list-panel">
      <div className="variable-list-header">
        <div className="panel-header-title">
          <button
            className="panel-collapse-btn"
            onClick={onToggleCollapsed}
            title={isRu ? "Свернуть или развернуть секцию" : "Collapse or expand section"}
            data-testid="variables-section-toggle"
            aria-label={isRu ? "Переключить секцию переменных" : "Toggle variables section"}
          >
            {collapsed ? "▶" : "▼"}
          </button>
          <h3>{isRu ? "Переменные" : "Variables"}</h3>
        </div>
        <button
          className="btn-add-variable"
          onClick={handleOpenCreate}
          title={isRu ? "Создать переменную" : "Create Variable"}
        >
          + {isRu ? "Переменная" : "Variable"}
        </button>
      </div>

      {!collapsed && (
        <div className="variable-list">
        {(["default", "input", "output", "local"] as VariableCategory[]).map(
          (category) => {
            const vars = groupedVariables[category];
            if (vars.length === 0 && category !== "default") return null;

            const isExpanded = expandedCategories.has(category);
            const label = isRu
              ? categoryLabels[category].ru
              : categoryLabels[category].en;

            return (
              <div key={category} className="variable-category">
                <div
                  className="category-header"
                  onClick={() => toggleCategory(category)}
                >
                  <span className="category-expand">
                    {isExpanded ? "▼" : "▶"}
                  </span>
                  <span className="category-name">{label}</span>
                  <span className="category-count">({vars.length})</span>
                </div>

                {isExpanded && (
                  <div className="category-items">
                    {vars.map((variable) => {
                      const variableArrayRank = resolveArrayRank(variable, variable.dataType);
                      const variableArraySuffix = "[]".repeat(variableArrayRank);
                      return (
                      <div
                        key={variable.id}
                        className="variable-item"
                        style={{
                          borderLeftColor:
                            variable.color ||
                            VARIABLE_TYPE_COLORS[variable.dataType],
                        }}
                      >
                        <div className="variable-info">
                          <span
                            className="variable-color"
                            style={{
                              backgroundColor:
                                variable.color ||
                                VARIABLE_TYPE_COLORS[variable.dataType],
                            }}
                          />
                          <span className="variable-name">
                            {isRu ? variable.nameRu : variable.name}
                            {variableArraySuffix}
                          </span>
                          <span
                            className="variable-type"
                            data-type={variable.dataType}
                          >
                            {getVariableTypeDisplay(variable)}
                          </span>
                        </div>

                        <div className="variable-value">
                          = {getDefaultValueDisplay(variable)}
                        </div>
                        <div className="variable-value variable-current-value">
                          {isRu ? "Текущее:" : "Current:"} {getCurrentValueDisplay(variable)}
                        </div>

                        <div className="variable-actions">
                          {/* Drag для Get */}
                          <button
                            className="btn-drag"
                            draggable
                            onDragStart={(e) =>
                              handleDragStart(e, variable, "get")
                            }
                            onClick={() => onCreateGetVariable(variable)}
                            title={
                              isRu
                                ? "Получить (перетащи или кликни)"
                                : "Get (drag or click)"
                            }
                          >
                            📤
                          </button>
                          {/* Drag для Set */}
                          <button
                            className="btn-drag"
                            draggable
                            onDragStart={(e) =>
                              handleDragStart(e, variable, "set")
                            }
                            onClick={() => onCreateSetVariable(variable)}
                            title={
                              isRu
                                ? "Установить (перетащи или кликни)"
                                : "Set (drag or click)"
                            }
                          >
                            📥
                          </button>
                          <button
                            className="btn-icon"
                            onClick={() => handleOpenEdit(variable)}
                            title={isRu ? "Редактировать" : "Edit"}
                          >
                            ✏️
                          </button>
                          <button
                            className="btn-icon btn-danger"
                            onClick={() => handleDeleteVariable(variable.id)}
                            title={isRu ? "Удалить" : "Delete"}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                      );
                    })}

                    {vars.length === 0 && (
                      <div className="no-variables">
                        {isRu ? "Нет переменных" : "No variables"}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          },
        )}
        </div>
      )}

      {/* Диалог создания/редактирования переменной */}
      {dialog.isOpen && (
        <div className="variable-dialog-overlay" onClick={handleCloseDialog}>
          <div className="variable-dialog" onClick={(e) => e.stopPropagation()}>
            <h4>
              {dialog.mode === "create"
                ? isRu
                  ? "Новая переменная"
                  : "New Variable"
                : isRu
                  ? "Редактирование переменной"
                  : "Edit Variable"}
            </h4>

            <div className="dialog-field">
              <label>{isRu ? "Имя (латиница)" : "Name (latin)"}</label>
              <input
                type="text"
                value={dialog.variable.name || ""}
                onChange={(e) => handleDialogChange("name", e.target.value)}
                placeholder={isRu ? "my_variable" : "my_variable"}
                className="variable-input"
              />
              {nameValidationError && (
                <div style={{ color: "#f38ba8", fontSize: 12, marginTop: 6 }}>
                  {nameValidationError}
                </div>
              )}
            </div>

            <div className="dialog-field">
              <label>{isRu ? "Имя (RU)" : "Name (RU)"}</label>
              <input
                type="text"
                value={dialog.variable.nameRu || ""}
                onChange={(e) => handleDialogChange("nameRu", e.target.value)}
                placeholder={isRu ? "Моя переменная" : "My Variable"}
                className="variable-input"
              />
            </div>

            <div className="dialog-field">
              <label>{isRu ? "Имя в коде (латиница)" : "Code name (Latin)"}</label>
              <input
                type="text"
                value={dialog.variable.codeName || ""}
                onChange={(e) => handleDialogChange("codeName", e.target.value)}
                placeholder={isRu ? "my_variable" : "my_variable"}
                className="variable-input"
              />
            </div>

            <div className="dialog-field">
              <label>{isRu ? "Тип данных" : "Data Type"}</label>
              <select
                value={dialog.variable.dataType || "bool"}
                onChange={(e) => {
                  const nextType = e.target.value;
                  if (!isPortDataType(nextType)) {
                    return;
                  }
                  const currentArrayRank = resolveArrayRank(
                    dialog.variable,
                    isPortDataType(dialog.variable.dataType) ? dialog.variable.dataType : "any",
                  );
                  const nextArrayRank = supportsArrayDataType(nextType) ? currentArrayRank : 0;

                  handleDialogChange("dataType", nextType);
                  handleDialogChange("arrayRank", nextArrayRank);
                  if (nextType === "vector" && !isVectorElementType(dialog.variable.vectorElementType)) {
                    handleDialogChange("vectorElementType", "double");
                  }

                  handleDialogChange(
                    "defaultValue",
                    getDefaultValueForDataType(nextType, nextArrayRank),
                  );

                  if (nextType === "vector" || nextArrayRank > 0) {
                    setVectorDefaultDraft("[]");
                  }
                  setVectorDefaultError(null);
                }}
                className="variable-select"
              >
                {VARIABLE_PANEL_DATA_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {isRu
                      ? VARIABLE_TYPE_LABELS[type].ru
                      : VARIABLE_TYPE_LABELS[type].en}
                  </option>
                ))}
              </select>
            </div>

            {(dialog.variable.dataType === "vector") && (
              <div className="dialog-field">
                <label>{isRu ? "Тип элементов вектора" : "Vector element type"}</label>
                <select
                  value={
                    isVectorElementType(dialog.variable.vectorElementType)
                      ? dialog.variable.vectorElementType
                      : "double"
                  }
                  onChange={(e) => {
                    const nextElementType = e.target.value;
                    if (!isVectorElementType(nextElementType)) {
                      return;
                    }
                    handleDialogChange("vectorElementType", nextElementType);
                    const arrayRank = resolveArrayRank(dialog.variable, "vector");
                    const parsed = parseDialogCollectionDraft(
                      vectorDefaultDraft,
                      "vector",
                      arrayRank,
                      nextElementType,
                    );
                    if (!parsed.ok) {
                      setVectorDefaultError(collectionInputErrorText(parsed.error));
                      return;
                    }
                    handleDialogChange("defaultValue", parsed.value);
                    setVectorDefaultDraft(formatVectorInput(parsed.value));
                    setVectorDefaultError(null);
                  }}
                  className="variable-select"
                >
                  {VECTOR_ELEMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {isRu
                        ? VARIABLE_TYPE_LABELS[type].ru
                        : VARIABLE_TYPE_LABELS[type].en}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="dialog-field">
              <label>{isRu ? "Значение по умолчанию" : "Default Value"}</label>
              {renderDefaultValueInput()}
            </div>

            <div className="dialog-field">
              <label>{isRu ? "Категория" : "Category"}</label>
              <select
                value={dialog.variable.category || "default"}
                onChange={(e) => {
                  const nextCategory = e.target.value;
                  if (isVariableCategory(nextCategory)) {
                    handleDialogChange("category", nextCategory);
                  }
                }}
                className="variable-select"
              >
                {(
                  ["default", "input", "output", "local"] as VariableCategory[]
                ).map((cat) => (
                  <option key={cat} value={cat}>
                    {isRu ? categoryLabels[cat].ru : categoryLabels[cat].en}
                  </option>
                ))}
              </select>
            </div>

            <div className="dialog-field">
              <label>{isRu ? "Описание" : "Description"}</label>
              <textarea
                value={dialog.variable.description || ""}
                onChange={(e) =>
                  handleDialogChange("description", e.target.value)
                }
                placeholder={
                  isRu ? "Описание переменной..." : "Variable description..."
                }
                className="variable-textarea"
                rows={2}
              />
            </div>

            <div className="dialog-field dialog-checkboxes">
              <label className="variable-checkbox">
                <input
                  type="checkbox"
                  checked={resolveArrayRank(
                    dialog.variable,
                    isPortDataType(dialog.variable.dataType) ? dialog.variable.dataType : "any",
                  ) > 0}
                  disabled={!supportsArrayDataType(isPortDataType(dialog.variable.dataType) ? dialog.variable.dataType : "any")}
                  onChange={(e) => {
                    const currentDataType = isPortDataType(dialog.variable.dataType)
                      ? dialog.variable.dataType
                      : "any";
                    if (!supportsArrayDataType(currentDataType)) {
                      return;
                    }

                    const currentRank = resolveArrayRank(dialog.variable, currentDataType);
                    const nextIsArray = e.target.checked;
                    const nextRank = nextIsArray ? Math.max(1, currentRank) : 0;
                    handleDialogChange("arrayRank", nextRank);
                    handleDialogChange(
                      "defaultValue",
                      getDefaultValueForDataType(currentDataType, nextRank),
                    );
                    if (nextIsArray || currentDataType === "vector") {
                      setVectorDefaultDraft("[]");
                    }
                    setVectorDefaultError(null);
                  }}
                />
                {isRu ? "Массив" : "Array"}
              </label>
              {supportsArrayDataType(isPortDataType(dialog.variable.dataType) ? dialog.variable.dataType : "any") &&
                resolveArrayRank(
                  dialog.variable,
                  isPortDataType(dialog.variable.dataType) ? dialog.variable.dataType : "any",
                ) > 0 && (
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#a6adc8", fontSize: 12 }}>
                    {isRu ? "Уровень" : "Rank"}
                  </span>
                  <select
                    value={resolveArrayRank(
                      dialog.variable,
                      isPortDataType(dialog.variable.dataType) ? dialog.variable.dataType : "any",
                    )}
                    onChange={(e) => {
                      const currentDataType = isPortDataType(dialog.variable.dataType)
                        ? dialog.variable.dataType
                        : "any";
                      const nextRank = normalizeArrayRank(Number(e.target.value));
                      handleDialogChange("arrayRank", nextRank);
                      handleDialogChange(
                        "defaultValue",
                        getDefaultValueForDataType(currentDataType, nextRank),
                      );
                      setVectorDefaultDraft("[]");
                      setVectorDefaultError(null);
                    }}
                    className="variable-select"
                    style={{ minWidth: 90 }}
                  >
                    <option value={1}>1D</option>
                    <option value={2}>2D</option>
                    <option value={3}>3D</option>
                  </select>
                </label>
              )}
              <label className="variable-checkbox">
                <input
                  type="checkbox"
                  checked={dialog.variable.isPrivate || false}
                  onChange={(e) =>
                    handleDialogChange("isPrivate", e.target.checked)
                  }
                />
                {isRu ? "Приватная" : "Private"}
              </label>
            </div>

            <div className="dialog-actions">
              <button className="btn-cancel" onClick={handleCloseDialog}>
                {isRu ? "Отмена" : "Cancel"}
              </button>
              <button className="btn-save" onClick={handleSaveVariable}>
                {isRu ? "Сохранить" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VariableListPanel;
