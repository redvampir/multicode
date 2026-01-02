/**
 * FunctionEditor — редактор функции в отдельном окне
 * Работает как в Unreal Engine Blueprints
 */

import React, { useState, useCallback, useEffect } from 'react';
import type { BlueprintFunction } from '../shared/blueprintTypes';
// Для быстрого исправления CI используем гибкий тип для параметров функции
type FunctionParameter = any;
import type { PortDataType } from '../shared/portTypes';

// ============================================
// Типы
// ============================================

interface FunctionEditorProps {
  function: any; // using any to remain compatible with current BlueprintFunction shape
  onSave: (func: any) => void;
  onClose: () => void;
  onDelete?: () => void;
}

interface FunctionDialogState {
  name: string;
  nameRu: string;
  description: string;
  body: string;
}

// ============================================
// Стили (inline для избежания конфликтов)
// ============================================

const styles: any = {
  overlay: 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(17, 17, 27, 0.9); display: flex; align-items: center; justify-content: center; z-index: 10000; backdrop-filter: blur(4px);',
  dialog: 'background: #1e1e2e; border: 1px solid #313244; border-radius: 8px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5); max-width: 800px; width: 90%; max-height: 80vh; overflow: hidden; display: flex; flex-direction: column;',
  header: 'display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #313244; background: linear-gradient(135deg, #1e1e2e, #181825);',
  title: 'margin: 0; color: #cdd6f4; font-size: 18px; font-weight: 600; display: flex; align-items: center; gap: 8px;',
  closeButton: 'background: transparent; border: none; color: #6c7086; font-size: 24px; cursor: pointer; padding: 4px 8px; border-radius: 4px; transition: all 0.15s;',
  content: 'padding: 20px; overflow: auto; flex: 1;',
  section: 'margin-bottom: 24px;',
  sectionTitle: 'margin: 0 0 12px 0; color: #cba6f7; font-size: 14px; font-weight: 600; border-bottom: 1px solid #313244; padding-bottom: 8px;',
  input: 'width: 100%; padding: 8px 12px; background: #11111b; border: 1px solid #313244; border-radius: 4px; color: #cdd6f4; font-size: 14px; margin-bottom: 8px;',
  textarea: 'width: 100%; min-height: 200px; padding: 12px; background: #11111b; border: 1px solid #313244; border-radius: 4px; color: #cdd6f4; font-size: 13px; font-family: "Fira Code", "Consolas", monospace; resize: vertical; line-height: 1.6;',
  footer: 'display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-top: 1px solid #313244; background: rgba(17, 17, 27, 0.5);',
  button: 'padding: 8px 16px; border-radius: 4px; font-size: 14px; cursor: pointer; transition: all 0.15s;',
  parametersContainer: 'display: flex; flex-direction: column; gap: 12px;',
  parameterRow: 'display: flex; gap: 12px; align-items: center; padding: 8px; background: #11111b; border: 1px solid #313244; border-radius: 4px;',
  parameterInput: 'flex: 1; padding: 6px 8px; background: #1e1e2e; border: 1px solid #313244; border-radius: 3px; color: #cdd6f4; font-size: 12px;',
  parameterSelect: 'padding: 6px 8px; background: #1e1e2e; border: 1px solid #313244; border-radius: 3px; color: #cdd6f4; font-size: 12px;',
  parameterButton: 'padding: 6px 12px; border-radius: 3px; font-size: 12px; background: #313244; border: 1px solid #585b70; color: #cdd6f4; cursor: pointer; transition: all 0.15s;',
  dangerButton: 'background: transparent; border: 1px solid #f38ba8; color: #f38ba8;',
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
  { value: 'object', label: 'Object', labelRu: 'Объект' },
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
    body: func.body || '',
  });

  const [hoveredButton, setHoveredButton] = useState<string | null>(null);

  // Обработчики
  const handleInputChange = useCallback((field: keyof FunctionDialogState, value: string) => {
    setDialogState(prev => ({ ...prev, [field]: value }));
  }, []);

  const updateParameter = useCallback((parameterIndex: number, field: keyof FunctionParameter, value: string | PortDataType) => {
    setDialogState(prev => {
      const currentData = prev.body ? JSON.parse(prev.body) : func.graph.nodes[0].data;
      const updatedInputs = [...currentData.inputs];
      updatedInputs[parameterIndex] = { ...updatedInputs[parameterIndex], [field]: value };
      
      const updatedNodes = [...func.graph.nodes];
      updatedNodes[0].data.inputs = updatedInputs;
      
      const updatedFunction = {
        ...func,
        graph: { ...func.graph, nodes: updatedNodes }
      };
      
      return { ...prev, body: JSON.stringify(updatedFunction.graph.nodes[0].data) };
    });
  }, [func, dialogState.body]);

  const addParameter = useCallback((type: 'input' | 'output') => {
    const currentData = dialogState.body ? JSON.parse(dialogState.body) : func.graph.nodes[0].data;
    const newParameter: any = {
      id: `param_${Date.now()}`,
      name: `NewParameter`,
      nameRu: `NewParameter`,
      dataType: 'int32',
      defaultValue: undefined,
      direction: 'input',
    };
    
    if (type === 'input') {
      currentData.inputs.push(newParameter);
    } else {
      currentData.outputs.push(newParameter);
    }
    
    setDialogState(prev => ({
      ...prev,
      body: JSON.stringify(currentData)
    }));
  }, [func, dialogState.body]);

  const removeParameter = useCallback((parameterIndex: number, type: 'input' | 'output') => {
    const currentData = dialogState.body ? JSON.parse(dialogState.body) : func.graph.nodes[0].data;
    
    if (type === 'input') {
      currentData.inputs.splice(parameterIndex, 1);
    } else {
      currentData.outputs.splice(parameterIndex, 1);
    }
    
    setDialogState(prev => ({
      ...prev,
      body: JSON.stringify(currentData)
    }));
  }, [func, dialogState.body]);

  const handleSave = useCallback(() => {
    try {
      const currentData = dialogState.body ? JSON.parse(dialogState.body) : func.graph.nodes[0].data;
      
      const updatedFunction: BlueprintFunction = {
        ...func,
        name: dialogState.name,
        nameRu: dialogState.nameRu,
        description: dialogState.description,
        graph: {
          ...func.graph,
          nodes: [
            { ...func.graph.nodes[0], data: currentData },
            ...func.graph.nodes.slice(1)
          ]
        }
      };
      
      onSave(updatedFunction);
    } catch (error) {
      console.error('Error saving function:', error);
    }
  }, [func, dialogState, onSave]);

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
  }, [handleKeyDown, handleSave]);

  // Получение данных для рендера
  const currentData = dialogState.body ? JSON.parse(dialogState.body) : func.graph.nodes[0].data;
  const inputs = currentData.inputs || [];
  const outputs = currentData.outputs || [];

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
            <input
              style={styles.input}
              placeholder="Название функции (EN)"
              value={dialogState.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
            />
            <input
              style={styles.input}
              placeholder="Название функции (RU)"
              value={dialogState.nameRu}
              onChange={(e) => handleInputChange('nameRu', e.target.value)}
            />
            <input
              style={styles.input}
              placeholder="Описание функции"
              value={dialogState.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
            />
          </div>

          {/* Параметры */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>📥 Входные параметры</h3>
            <div style={styles.parametersContainer}>
              {inputs.map((param: any, index: number) => (
                <div key={param.id} style={styles.parameterRow}>
                  <input
                    style={styles.parameterInput}
                    placeholder="Имя параметра"
                    value={param.name}
                    onChange={(e) => updateParameter(index, 'name', e.target.value)}
                  />
                  <select
                    style={styles.parameterSelect}
                    value={param.dataType}
                    onChange={(e) => updateParameter(index, 'dataType', e.target.value as PortDataType)}
                  >
                    {dataTypeOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.labelRu} ({opt.label})
                      </option>
                    ))}
                  </select>
                  <button
                    style={styles.parameterButton}
                    onClick={() => removeParameter(index, 'input')}
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
              {outputs.map((param: any, index: number) => (
                <div key={param.id} style={styles.parameterRow}>
                  <input
                    style={styles.parameterInput}
                    placeholder="Имя параметра"
                    value={param.name}
                    onChange={(e) => updateParameter(index, 'name', e.target.value)}
                  />
                  <select
                    style={styles.parameterSelect}
                    value={param.dataType}
                    onChange={(e) => updateParameter(index, 'dataType', e.target.value as PortDataType)}
                  >
                    {dataTypeOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.labelRu} ({opt.label})
                      </option>
                    ))}
                  </select>
                  <button
                    style={styles.parameterButton}
                    onClick={() => removeParameter(index, 'output')}
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
              value={dialogState.body}
              onChange={(e) => handleInputChange('body', e.target.value)}
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
              style={{ ...styles.button, ...hoveredButton === 'save' ? { backgroundColor: '#74c7ec', borderColor: '#74c7ec' } : {} }}
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