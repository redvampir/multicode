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
} from "../shared/blueprintTypes";
import {
  createVariable,
  VARIABLE_TYPE_COLORS,
  VARIABLE_TYPE_LABELS,
  VARIABLE_DATA_TYPES,
} from "../shared/blueprintTypes";
import type { PortDataType } from "../shared/portTypes";
import type { ResolvedVariableValues } from "./variableValueResolver";

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
}

const initialDialogState: EditDialogState = {
  isOpen: false,
  mode: "create",
  variable: {
    name: "",
    nameRu: "",
    dataType: "bool",
    defaultValue: false,
    category: "default",
    description: "",
    isArray: false,
    isPrivate: false,
  },
  editId: null,
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
  const variables = useMemo(
    () => graphState.variables || [],
    [graphState.variables],
  );
  const [dialog, setDialog] = useState<EditDialogState>(initialDialogState);
  const [expandedCategories, setExpandedCategories] = useState<
    Set<VariableCategory>
  >(new Set(["default", "input", "output", "local"]));

  // Миграция: добавляем цвета для переменных без color (старые данные)
  useEffect(() => {
    const needsMigration = variables.some(v => !v.color);
    if (needsMigration) {
      const migratedVariables = variables.map(v => {
        if (!v.color) {
          return {
            ...v,
            color: VARIABLE_TYPE_COLORS[v.dataType],
          };
        }
        return v;
      });
      onVariablesChange(migratedVariables);
    }
  }, [variables, onVariablesChange]);

  // === Обработчики диалога ===
  const handleOpenCreate = useCallback(() => {
    setDialog({
      ...initialDialogState,
      isOpen: true,
      mode: "create",
    });
  }, []);

  const handleOpenEdit = useCallback((variable: BlueprintVariable) => {
    setDialog({
      isOpen: true,
      mode: "edit",
      variable: { ...variable },
      editId: variable.id,
    });
  }, []);

  const handleCloseDialog = useCallback(() => {
    setDialog(initialDialogState);
  }, []);

  const handleDialogChange = useCallback(
    (field: keyof BlueprintVariable, value: unknown) => {
      setDialog((prev) => ({
        ...prev,
        variable: {
          ...prev.variable,
          [field]: value,
        },
      }));
    },
    [],
  );

  const handleSaveVariable = useCallback(() => {
    const { mode, variable, editId } = dialog;
    const nextDataType = isPortDataType(variable.dataType) ? variable.dataType : undefined;
    const nextCategory = isVariableCategory(variable.category) ? variable.category : undefined;

    if (!variable.name?.trim()) {
      alert(isRu ? "Введите имя переменной" : "Enter variable name");
      return;
    }

    if (mode === "create") {
      const createDataType: PortDataType = nextDataType ?? "bool";
      const createCategory: VariableCategory = nextCategory ?? "default";
      const newVar = createVariable(
        variable.name,
        createDataType,
        {
          nameRu: variable.nameRu || variable.name,
          defaultValue: variable.defaultValue,
          category: createCategory,
          description: variable.description,
          isArray: variable.isArray,
          isPrivate: variable.isPrivate,
          color: VARIABLE_TYPE_COLORS[createDataType],
        },
      );
      logger.action(
        LOG_CATEGORIES.VARIABLE_CREATE,
        `Variable created: ${newVar.name}`,
        {
          id: newVar.id,
          dataType: newVar.dataType,
          defaultValue: newVar.defaultValue,
          category: newVar.category,
        },
      );
      onVariablesChange([...variables, newVar]);
    } else if (mode === "edit" && editId) {
      const updatedVars = variables.map((v) => {
        if (v.id === editId) {
          const editedDataType = nextDataType ?? v.dataType;
          const editedCategory = nextCategory ?? v.category;
          const updated = {
            ...v,
            name: variable.name?.replace(/[^a-zA-Z0-9_]/g, "_") || v.name,
            nameRu: variable.nameRu || v.nameRu,
            dataType: editedDataType,
            defaultValue: variable.defaultValue,
            category: editedCategory,
            description: variable.description ?? v.description,
            isArray: variable.isArray ?? v.isArray,
            isPrivate: variable.isPrivate ?? v.isPrivate,
            color:
              VARIABLE_TYPE_COLORS[
                editedDataType
              ],
          };
          logger.action(
            LOG_CATEGORIES.VARIABLE_UPDATE,
            `Variable updated: ${updated.name}`,
            {
              id: updated.id,
              changes: {
                dataType: updated.dataType,
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
  }, [dialog, isRu, onVariablesChange, variables, handleCloseDialog]);

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

  // === Группировка по категориям ===
  const groupedVariables = useMemo(() => {
    const groups: Record<VariableCategory, BlueprintVariable[]> = {
      default: [],
      input: [],
      output: [],
      local: [],
    };
    for (const v of variables) {
      groups[v.category].push(v);
    }
    return groups;
  }, [variables]);

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
      // Вектор: отображаем как "X, Y, Z"
      return value.join(', ');
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

  // === Ввод значения по умолчанию ===
  const renderDefaultValueInput = () => {
    const dataType = isPortDataType(dialog.variable.dataType)
      ? dialog.variable.dataType
      : "bool";
    const value = dialog.variable.defaultValue;

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
        // Отображаем как строку "X,Y,Z", но храним как массив [X, Y, Z]
        const vectorStr = Array.isArray(value)
          ? value.join(',')
          : (typeof value === "string" ? value : "0,0,0");

        return (
          <input
            type="text"
            value={vectorStr}
            onChange={(e) => {
              const parts = e.target.value.split(',').map(s => parseFloat(s.trim()) || 0);
              const vectorArray = [parts[0] || 0, parts[1] || 0, parts[2] || 0];
              handleDialogChange("defaultValue", vectorArray);
            }}
            className="variable-input"
            placeholder="X,Y,Z"
          />
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
                    {vars.map((variable) => (
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
                            {variable.isArray && "[]"}
                          </span>
                          <span
                            className="variable-type"
                            data-type={variable.dataType}
                          >
                            {isRu
                              ? VARIABLE_TYPE_LABELS[variable.dataType].ru
                              : VARIABLE_TYPE_LABELS[variable.dataType].en}
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
                    ))}

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
              <label>{isRu ? "Тип данных" : "Data Type"}</label>
              <select
                value={dialog.variable.dataType || "bool"}
                onChange={(e) => {
                  const nextType = e.target.value;
                  if (!isPortDataType(nextType)) {
                    return;
                  }
                  handleDialogChange("dataType", nextType);
                  // Сброс значения по умолчанию при смене типа
                  const defaults: Partial<Record<PortDataType, unknown>> = {
                    bool: false,
                    int32: 0,
                    int64: 0,
                    float: 0.0,
                    double: 0.0,
                    string: "",
                    vector: "0,0,0",
                    pointer: null,
                    class: null,
                    array: null,
                    any: null,
                    execution: null,
                  };
                  handleDialogChange("defaultValue", defaults[nextType] ?? null);
                }}
                className="variable-select"
              >
                {VARIABLE_DATA_TYPES.map((type: PortDataType) => (
                  <option key={type} value={type}>
                    {isRu
                      ? VARIABLE_TYPE_LABELS[type].ru
                      : VARIABLE_TYPE_LABELS[type].en}
                  </option>
                ))}
              </select>
            </div>

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
                  checked={dialog.variable.isArray || false}
                  onChange={(e) =>
                    handleDialogChange("isArray", e.target.checked)
                  }
                />
                {isRu ? "Массив" : "Array"}
              </label>
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
