/**
 * FunctionEditor — редактор функции в отдельном окне
 * Работает как в Unreal Engine Blueprints
 */

import React, { useState, useCallback, useEffect } from 'react';
import type { BlueprintFunction, FunctionParameter } from '../shared/blueprintTypes';
import type { PortDataType } from '../shared/portTypes';

// ============================================
// Типы
// ============================================

interface FunctionEditorProps {
  function: BlueprintFunction;
  onSave: (func: BlueprintFunction) => void;
  onClose: () => void;
  onDelete?: () => void;
}

interface FunctionDialogState {
  name: string;
  nameRu: string;
  description: string;
}

type EditableFunctionParameterField = 'name' | 'nameRu' | 'dataType';

// ============================================
// Стили (inline для избежания конфликтов)
// ============================================

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(17, 17, 27, 0.9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    backdropFilter: 'blur(4px)',
  },
  dialog: {
    background: '#1e1e2e',
    border: '1px solid #313244',
    borderRadius: 8,
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
    maxWidth: 800,
    width: '90%',
    maxHeight: '80vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #313244',
    background: 'linear-gradient(135deg, #1e1e2e, #181825)',
  },
  title: {
    margin: 0,
    color: '#cdd6f4',
    fontSize: 18,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  closeButton: {
    background: 'transparent',
    border: 'none',
    color: '#6c7086',
    fontSize: 24,
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: 4,
    transition: 'all 0.15s',
  },
  content: {
    padding: 20,
    overflow: 'auto',
    flex: 1,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    margin: '0 0 12px 0',
    color: '#cba6f7',
    fontSize: 14,
    fontWeight: 600,
    borderBottom: '1px solid #313244',
    paddingBottom: 8,
  },
  input: {
    width: '100%',
    padding: '8px 12px',
    background: '#11111b',
    border: '1px solid #313244',
    borderRadius: 4,
    color: '#cdd6f4',
    fontSize: 14,
    marginBottom: 8,
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  fieldLabel: {
    color: '#a6adc8',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  textarea: {
    width: '100%',
    minHeight: 200,
    padding: 12,
    background: '#11111b',
    border: '1px solid #313244',
    borderRadius: 4,
    color: '#cdd6f4',
    fontSize: 13,
    fontFamily: '"Fira Code", "Consolas", monospace',
    resize: 'vertical',
    lineHeight: 1.6,
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderTop: '1px solid #313244',
    background: 'rgba(17, 17, 27, 0.5)',
  },
  button: {
    padding: '8px 16px',
    borderRadius: 4,
    fontSize: 14,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  parametersContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  parameterRow: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    padding: 8,
    background: '#11111b',
    border: '1px solid #313244',
    borderRadius: 4,
  },
  parameterInput: {
    flex: 1,
    padding: '6px 8px',
    background: '#1e1e2e',
    border: '1px solid #313244',
    borderRadius: 3,
    color: '#cdd6f4',
    fontSize: 12,
  },
  parameterNamesColumn: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  parameterNameField: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  parameterFieldLabel: {
    color: '#a6adc8',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  parameterInputSecondary: {
    flex: 1,
    padding: '6px 8px',
    background: '#1a1a2a',
    border: '1px solid #313244',
    borderRadius: 3,
    color: '#cdd6f4',
    fontSize: 12,
  },
  parameterSelect: {
    padding: '6px 8px',
    background: '#1e1e2e',
    border: '1px solid #313244',
    borderRadius: 3,
    color: '#cdd6f4',
    fontSize: 12,
  },
  parameterButton: {
    padding: '6px 12px',
    borderRadius: 3,
    fontSize: 12,
    background: '#313244',
    border: '1px solid #585b70',
    color: '#cdd6f4',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  dangerButton: {
    background: 'transparent',
    border: '1px solid #f38ba8',
    color: '#f38ba8',
  },
};

// ============================================
// Типы данных
// ============================================

const dataTypeOptions: { value: PortDataType; label: string; labelRu: string }[] = [
  { value: 'int32', label: 'Integer', labelRu: 'Целое число' },
  { value: 'float', label: 'Float', labelRu: 'Дробное число' },
  { value: 'bool', label: 'Boolean', labelRu: 'Логическое' },
  { value: 'string', label: 'String', labelRu: 'Строка' },
  { value: 'vector', label: 'Vector', labelRu: 'Вектор' },
  { value: 'pointer', label: 'Pointer', labelRu: 'Указатель' },
  { value: 'class', label: 'Class', labelRu: 'Класс' },
  { value: 'any', label: 'Any', labelRu: 'Любой' },
];

// ============================================
// Основной компонент
// ============================================

export const FunctionEditor: React.FC<FunctionEditorProps> = ({
  function: func,
  onSave,
  onClose,
  onDelete,
}) => {
  const [dialogState, setDialogState] = useState<FunctionDialogState>({
    name: func.name,
    nameRu: func.nameRu || func.name,
    description: func.description || '',
  });

  const [parameters, setParameters] = useState<FunctionParameter[]>(() => (
    func.parameters ? func.parameters.map(p => ({ ...p })) : []
  ));
  
  // Локальное тело функции (исходник) хранится в properties FunctionEntry node
  const [body, setBody] = useState<string>(() => {
    const entry = func.graph.nodes.find(n => n.type === 'FunctionEntry');
    return (entry && entry.properties && (entry.properties as Record<string, unknown>).body as string) || '';
  });

  const [hoveredButton, setHoveredButton] = useState<string | null>(null);

  // Обработчики
  const handleInputChange = useCallback((field: keyof FunctionDialogState, value: string) => {
    setDialogState(prev => ({ ...prev, [field]: value }));
  }, []);

  const updateParameter = useCallback((paramId: string, field: EditableFunctionParameterField, value: string | PortDataType) => {
    setParameters(prev => prev.map((parameter) => {
      if (parameter.id !== paramId) {
        return parameter;
      }

      if (field === 'name') {
        const nextName = typeof value === 'string' ? value : parameter.name;
        const shouldSyncRuName =
          parameter.nameRu.trim().length === 0 ||
          parameter.nameRu === parameter.name ||
          parameter.nameRu === 'NewParam' ||
          /^Параметр\s+\d+$/u.test(parameter.nameRu) ||
          /^Результат\s+\d+$/u.test(parameter.nameRu);

        return shouldSyncRuName
          ? { ...parameter, name: nextName, nameRu: nextName }
          : { ...parameter, name: nextName };
      }

      if (field === 'nameRu') {
        return {
          ...parameter,
          nameRu: typeof value === 'string' ? value : parameter.nameRu,
        };
      }

      return {
        ...parameter,
        dataType: value as PortDataType,
      };
    }));
  }, []);

  const addParameter = useCallback((direction: 'input' | 'output') => {
    const sameDirectionParams = parameters.filter((parameter) => parameter.direction === direction).length;
    const nextIndex = sameDirectionParams + 1;
    const defaultCodeName = direction === 'input' ? `param_${nextIndex}` : `result_${nextIndex}`;
    const defaultRuName = direction === 'input' ? `Параметр ${nextIndex}` : `Результат ${nextIndex}`;

    const newParam: FunctionParameter = {
      id: `param-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      name: defaultCodeName,
      nameRu: defaultRuName,
      dataType: 'int32',
      direction,
    } as FunctionParameter;
    setParameters(prev => [...prev, newParam]);
  }, [parameters]);

  const removeParameter = useCallback((paramId: string) => {
    setParameters(prev => prev.filter(p => p.id !== paramId));
  }, []);

  const handleSave = useCallback(() => {
    try {
      // Построим граф узлов обновлённой функции: синхронизируем порты в FunctionEntry/FunctionReturn
      const nodes = func.graph.nodes.map(n => ({ ...n }));
      const entryNode = nodes.find(n => n.type === 'FunctionEntry');
      const returnNode = nodes.find(n => n.type === 'FunctionReturn');

      let inputIndex = 0;
      let outputIndex = 0;
      const normalizedParameters = parameters.map((parameter) => {
        const normalizedName = parameter.name.trim();
        const normalizedNameRu = parameter.nameRu.trim();

        if (parameter.direction === 'input') {
          inputIndex += 1;
          const fallbackName = `param_${inputIndex}`;
          const codeName = normalizedName || fallbackName;
          const displayName = normalizedNameRu || codeName;
          return {
            ...parameter,
            name: codeName,
            nameRu: displayName,
          };
        }

        outputIndex += 1;
        const fallbackName = `result_${outputIndex}`;
        const codeName = normalizedName || fallbackName;
        const displayName = normalizedNameRu || codeName;
        return {
          ...parameter,
          name: codeName,
          nameRu: displayName,
        };
      });

      // Сбор входных и выходных параметров
      const inputParams = normalizedParameters.filter(p => p.direction === 'input');
      const outputParams = normalizedParameters.filter(p => p.direction === 'output');

      if (entryNode) {
        // Сохраняем только стандартный exec-out + параметры как выходные порты
        const execPorts = entryNode.outputs.filter(o => o.dataType === 'execution');
        const paramPorts = inputParams.map((p, i) => ({
          id: `${entryNode.id}-${p.id}`,
          name: p.name,
          nameRu: p.nameRu,
          dataType: p.dataType,
          direction: 'output' as const,
          index: i + execPorts.length,
          connected: false,
        }));
        entryNode.outputs = [...execPorts, ...paramPorts];
        // Сохраним тело функции в свойствах entryNode
        entryNode.properties = { ...(entryNode.properties || {}), body };
      }

      if (returnNode) {
        const execPorts = returnNode.inputs.filter(o => o.dataType === 'execution');
        const paramPorts = outputParams.map((p, i) => ({
          id: `${returnNode.id}-${p.id}`,
          name: p.name,
          nameRu: p.nameRu,
          dataType: p.dataType,
          direction: 'input' as const,
          index: i + execPorts.length,
          connected: false,
        }));
        returnNode.inputs = [...execPorts, ...paramPorts];
      }

      const updatedFunction: BlueprintFunction = {
        ...func,
        name: dialogState.name,
        nameRu: dialogState.nameRu,
        description: dialogState.description || undefined,
        parameters: normalizedParameters.map((parameter) => ({ ...parameter })),
        graph: {
          ...func.graph,
          nodes,
        }
      };

      onSave(updatedFunction);
    } catch (error) {
      console.error('Error saving function:', error);
    }
  }, [func, dialogState, parameters, body, onSave]);

  const handleDelete = useCallback(() => {
    if (window.confirm('Вы действительно хотите удалить эту функцию?')) {
      onDelete?.();
    }
  }, [onDelete]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  }, [onClose, handleSave]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Параметры для рендера
  const inputs = parameters.filter(p => p.direction === 'input');
  const outputs = parameters.filter(p => p.direction === 'output');

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
        {/* Заголовок */}
        <div style={styles.header}>
          <h2 style={styles.title}>
            ⚙️ Редактор функции: {func.nameRu || func.name}
          </h2>
          <button
            style={styles.closeButton}
            onClick={onClose}
            onMouseEnter={() => setHoveredButton('close')}
            onMouseLeave={() => setHoveredButton(null)}
          >
            ×
          </button>
        </div>

        {/* Контент */}
        <div style={styles.content}>
          {/* Основная информация */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>📝 Основная информация</h3>
            <div style={styles.fieldGroup}>
              <label style={styles.fieldLabel}>EN (Code)</label>
              <input
                style={styles.input}
                placeholder="Название функции (EN)"
                value={dialogState.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
              />
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.fieldLabel}>RU (Display)</label>
              <input
                style={styles.input}
                placeholder="Название функции (RU)"
                value={dialogState.nameRu}
                onChange={(e) => handleInputChange('nameRu', e.target.value)}
              />
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.fieldLabel}>Description</label>
              <input
                style={styles.input}
                placeholder="Описание функции"
                value={dialogState.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
              />
            </div>
          </div>

          {/* Параметры */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>📥 Входные параметры</h3>
            <div style={styles.parametersContainer}>
              {inputs.map((param) => (
                <div key={param.id} style={styles.parameterRow}>
                  <div style={styles.parameterNamesColumn}>
                    <div style={styles.parameterNameField}>
                      <label style={styles.parameterFieldLabel}>EN (Code)</label>
                      <input
                        style={styles.parameterInput}
                        placeholder="Имя в коде (EN/C++)"
                        value={param.name}
                        onChange={(e) => updateParameter(param.id, 'name', e.target.value)}
                      />
                    </div>
                    <div style={styles.parameterNameField}>
                      <label style={styles.parameterFieldLabel}>RU (Display)</label>
                      <input
                        style={styles.parameterInputSecondary}
                        placeholder="Имя в графе (RU)"
                        value={param.nameRu}
                        onChange={(e) => updateParameter(param.id, 'nameRu', e.target.value)}
                      />
                    </div>
                  </div>
                  <select
                    style={styles.parameterSelect}
                    value={param.dataType}
                    onChange={(e) => updateParameter(param.id, 'dataType', e.target.value as PortDataType)}
                  >
                    {dataTypeOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.labelRu} ({opt.label})
                      </option>
                    ))}
                  </select>
                  <button
                    style={styles.parameterButton}
                    onClick={() => removeParameter(param.id)}
                  >
                    🗑️
                  </button>
                </div>
              ))}
              <button
                style={styles.parameterButton}
                onClick={() => addParameter('input')}
              >
                ➕ Добавить входной параметр
              </button>
            </div>
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>📤 Выходные параметры</h3>
            <div style={styles.parametersContainer}>
              {outputs.map((param) => (
                <div key={param.id} style={styles.parameterRow}>
                  <div style={styles.parameterNamesColumn}>
                    <div style={styles.parameterNameField}>
                      <label style={styles.parameterFieldLabel}>EN (Code)</label>
                      <input
                        style={styles.parameterInput}
                        placeholder="Имя в коде (EN/C++)"
                        value={param.name}
                        onChange={(e) => updateParameter(param.id, 'name', e.target.value)}
                      />
                    </div>
                    <div style={styles.parameterNameField}>
                      <label style={styles.parameterFieldLabel}>RU (Display)</label>
                      <input
                        style={styles.parameterInputSecondary}
                        placeholder="Имя в графе (RU)"
                        value={param.nameRu}
                        onChange={(e) => updateParameter(param.id, 'nameRu', e.target.value)}
                      />
                    </div>
                  </div>
                  <select
                    style={styles.parameterSelect}
                    value={param.dataType}
                    onChange={(e) => updateParameter(param.id, 'dataType', e.target.value as PortDataType)}
                  >
                    {dataTypeOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.labelRu} ({opt.label})
                      </option>
                    ))}
                  </select>
                  <button
                    style={styles.parameterButton}
                    onClick={() => removeParameter(param.id)}
                  >
                    🗑️
                  </button>
                </div>
              ))}
              <button
                style={styles.parameterButton}
                onClick={() => addParameter('output')}
              >
                ➕ Добавить выходной параметр
              </button>
            </div>
          </div>

          {/* Тело функции */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>🔧 Тело функции</h3>
            <textarea
              style={styles.textarea}
              placeholder={`if (condition) {
  // ${func.name}
  return result;
}`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              spellCheck={false}
            />
            <div style={{ color: '#6c7086', fontSize: '12px', marginTop: '8px' }}>
              💡 Подсказка: Здесь можно написать код функции или оставить пустым для автоматической генерации
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <div>
            {onDelete && (
              <button
                style={{ ...styles.button, ...styles.dangerButton }}
                onMouseEnter={() => setHoveredButton('delete')}
                onMouseLeave={() => setHoveredButton(null)}
                onClick={handleDelete}
              >
                🗑️ Удалить функцию
              </button>
            )}
          </div>
          <div>
            <button
              style={styles.button}
              onClick={onClose}
            >
              Отмена
            </button>
            <button
              style={{
                ...styles.button,
                ...(hoveredButton === 'save'
                  ? { backgroundColor: '#74c7ec', borderColor: '#74c7ec' }
                  : {}),
              }}
              onMouseEnter={() => setHoveredButton('save')}
              onMouseLeave={() => setHoveredButton(null)}
              onClick={handleSave}
            >
              💾 Сохранить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
