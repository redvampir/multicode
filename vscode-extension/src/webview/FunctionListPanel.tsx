/**
 * Панель списка функций (как в UE Blueprints)
 * Отображает список пользовательских функций с возможностью:
 * - Создания новой функции
 * - Редактирования существующей
 * - Удаления функции
 * - Переключения между EventGraph и функциями
 */

import React, { useState, useCallback } from 'react';
import type { 
  BlueprintFunction, 
  BlueprintGraphState,
  FunctionParameter,
} from '../shared/blueprintTypes';
import type { PortDataType } from '../shared/portTypes';
import { 
  createUserFunction, 
  addFunctionInputParameter,
  addFunctionOutputParameter,
  removeFunctionParameter 
} from '../shared/blueprintTypes';

interface FunctionListPanelProps {
  /** Текущее состояние графа */
  graphState: BlueprintGraphState;
  /** Колбэк при изменении списка функций */
  onFunctionsChange: (functions: BlueprintFunction[]) => void;
  /** Колбэк при выборе функции для редактирования */
  onSelectFunction: (functionId: string | null) => void;
  /** ID текущей активной функции (null = EventGraph) */
  activeFunctionId: string | null;
  /** Язык отображения */
  displayLanguage: 'ru' | 'en';
}

/** Диалог создания/редактирования функции */
interface FunctionDialogState {
  isOpen: boolean;
  mode: 'create' | 'edit';
  functionId?: string;
  name: string;
  nameRu: string;
  description: string;
}

/** Диалог добавления параметра */
interface ParameterDialogState {
  isOpen: boolean;
  functionId: string;
  name: string;
  nameRu: string;
  dataType: PortDataType;
  direction: 'input' | 'output';
}

export const FunctionListPanel: React.FC<FunctionListPanelProps> = ({
  graphState,
  onFunctionsChange,
  onSelectFunction,
  activeFunctionId,
  displayLanguage,
}) => {
  const functions = graphState.functions ?? [];
  const isRu = displayLanguage === 'ru';
  
  // Состояние диалога функции
  const [funcDialog, setFuncDialog] = useState<FunctionDialogState>({
    isOpen: false,
    mode: 'create',
    name: '',
    nameRu: '',
    description: '',
  });
  
  // Состояние диалога параметра
  const [paramDialog, setParamDialog] = useState<ParameterDialogState>({
    isOpen: false,
    functionId: '',
    name: '',
    nameRu: '',
    dataType: 'int32',
    direction: 'input',
  });
  
  // Развёрнутые функции (для показа параметров)
  const [expandedFunctions, setExpandedFunctions] = useState<Set<string>>(new Set());
  
  // === Обработчики для функций ===
  
  const handleCreateFunction = useCallback(() => {
    setFuncDialog({
      isOpen: true,
      mode: 'create',
      name: '',
      nameRu: '',
      description: '',
    });
  }, []);
  
  const handleEditFunction = useCallback((func: BlueprintFunction) => {
    setFuncDialog({
      isOpen: true,
      mode: 'edit',
      functionId: func.id,
      name: func.name,
      nameRu: func.nameRu,
      description: func.description ?? '',
    });
  }, []);
  
  const handleSaveFunction = useCallback(() => {
    if (!funcDialog.name.trim()) {
      return; // Валидация: имя обязательно
    }
    
    if (funcDialog.mode === 'create') {
      const newFunc = createUserFunction(
        funcDialog.name.trim(),
        funcDialog.nameRu.trim() || funcDialog.name.trim(),
        funcDialog.description.trim() || undefined
      );
      onFunctionsChange([...functions, newFunc]);
    } else if (funcDialog.functionId) {
      // Редактирование существующей
      const updatedFunctions = functions.map(f => {
        if (f.id === funcDialog.functionId) {
          return {
            ...f,
            name: funcDialog.name.trim(),
            nameRu: funcDialog.nameRu.trim() || funcDialog.name.trim(),
            description: funcDialog.description.trim() || undefined,
            updatedAt: new Date().toISOString(),
          };
        }
        return f;
      });
      onFunctionsChange(updatedFunctions);
    }
    
    setFuncDialog(prev => ({ ...prev, isOpen: false }));
  }, [funcDialog, functions, onFunctionsChange]);
  
  const handleDeleteFunction = useCallback((funcId: string) => {
    // Если удаляемая функция активна — переключаемся на EventGraph
    if (activeFunctionId === funcId) {
      onSelectFunction(null);
    }
    const updatedFunctions = functions.filter(f => f.id !== funcId);
    onFunctionsChange(updatedFunctions);
  }, [functions, activeFunctionId, onFunctionsChange, onSelectFunction]);
  
  // === Обработчики для параметров ===
  
  const handleOpenAddParameter = useCallback((funcId: string, direction: 'input' | 'output') => {
    setParamDialog({
      isOpen: true,
      functionId: funcId,
      name: '',
      nameRu: '',
      dataType: 'int32',
      direction,
    });
  }, []);
  
  const handleSaveParameter = useCallback(() => {
    if (!paramDialog.name.trim()) return;
    
    const func = functions.find(f => f.id === paramDialog.functionId);
    if (!func) return;
    
    let updatedFunc: BlueprintFunction;
    if (paramDialog.direction === 'input') {
      updatedFunc = addFunctionInputParameter(
        func,
        paramDialog.name.trim(),
        paramDialog.nameRu.trim() || paramDialog.name.trim(),
        paramDialog.dataType
      );
    } else {
      updatedFunc = addFunctionOutputParameter(
        func,
        paramDialog.name.trim(),
        paramDialog.nameRu.trim() || paramDialog.name.trim(),
        paramDialog.dataType
      );
    }
    
    const updatedFunctions = functions.map(f => 
      f.id === paramDialog.functionId ? updatedFunc : f
    );
    onFunctionsChange(updatedFunctions);
    setParamDialog(prev => ({ ...prev, isOpen: false }));
  }, [paramDialog, functions, onFunctionsChange]);
  
  const handleDeleteParameter = useCallback((funcId: string, paramId: string) => {
    const func = functions.find(f => f.id === funcId);
    if (!func) return;
    
    const updatedFunc = removeFunctionParameter(func, paramId);
    const updatedFunctions = functions.map(f => 
      f.id === funcId ? updatedFunc : f
    );
    onFunctionsChange(updatedFunctions);
  }, [functions, onFunctionsChange]);
  
  const toggleExpand = useCallback((funcId: string) => {
    setExpandedFunctions(prev => {
      const next = new Set(prev);
      if (next.has(funcId)) {
        next.delete(funcId);
      } else {
        next.add(funcId);
      }
      return next;
    });
  }, []);
  
  // === Рендер ===
  
  const dataTypeOptions: { value: PortDataType; label: string; labelRu: string }[] = [
    { value: 'int32', label: 'Integer', labelRu: 'Целое число' },
    { value: 'float', label: 'Float', labelRu: 'Дробное число' },
    { value: 'bool', label: 'Boolean', labelRu: 'Логическое' },
    { value: 'string', label: 'String', labelRu: 'Строка' },
    { value: 'vector', label: 'Vector', labelRu: 'Вектор' },
    { value: 'object', label: 'Object', labelRu: 'Объект' },
    { value: 'any', label: 'Any', labelRu: 'Любой' },
  ];
  
  return (
    <div className="function-list-panel">
      <div className="function-list-header">
        <h3>{isRu ? 'Функции' : 'Functions'}</h3>
        <button 
          className="btn-add-function" 
          onClick={handleCreateFunction}
          title={isRu ? 'Создать функцию' : 'Create Function'}
        >
          + {isRu ? 'Функция' : 'Function'}
        </button>
      </div>
      
      <div className="function-list">
        {/* EventGraph — всегда первый */}
        <div 
          className={`function-item ${activeFunctionId === null ? 'active' : ''}`}
          onClick={() => onSelectFunction(null)}
        >
          <span className="function-icon">📊</span>
          <span className="function-name">EventGraph</span>
        </div>
        
        {/* Список пользовательских функций */}
        {functions.map(func => {
          const isExpanded = expandedFunctions.has(func.id);
          const isActive = activeFunctionId === func.id;
          const inputParams = func.parameters.filter(p => p.direction === 'input');
          const outputParams = func.parameters.filter(p => p.direction === 'output');
          
          return (
            <div key={func.id} className={`function-item-container ${isActive ? 'active' : ''}`}>
              <div 
                className={`function-item ${isActive ? 'active' : ''}`}
                onClick={() => onSelectFunction(func.id)}
              >
                <span 
                  className="function-expand"
                  onClick={(e) => { e.stopPropagation(); toggleExpand(func.id); }}
                >
                  {isExpanded ? '▼' : '▶'}
                </span>
                <span className="function-icon">ƒ</span>
                <span className="function-name">
                  {isRu ? func.nameRu : func.name}
                </span>
                <div className="function-actions">
                  <button
                    className="btn-icon"
                    onClick={(e) => { e.stopPropagation(); handleEditFunction(func); }}
                    title={isRu ? 'Редактировать' : 'Edit'}
                  >
                    ✏️
                  </button>
                  <button
                    className="btn-icon btn-danger"
                    onClick={(e) => { e.stopPropagation(); handleDeleteFunction(func.id); }}
                    title={isRu ? 'Удалить' : 'Delete'}
                  >
                    🗑️
                  </button>
                </div>
              </div>
              
              {/* Раскрытые параметры */}
              {isExpanded && (
                <div className="function-params">
                  {/* Входные параметры */}
                  <div className="params-section">
                    <div className="params-header">
                      <span>{isRu ? 'Входы' : 'Inputs'}</span>
                      <button
                        className="btn-add-param"
                        onClick={() => handleOpenAddParameter(func.id, 'input')}
                        title={isRu ? 'Добавить вход' : 'Add Input'}
                      >
                        +
                      </button>
                    </div>
                    {inputParams.map(param => (
                      <div key={param.id} className="param-item">
                        <span className="param-type" data-type={param.dataType}>
                          {param.dataType}
                        </span>
                        <span className="param-name">
                          {isRu ? param.nameRu : param.name}
                        </span>
                        <button
                          className="btn-icon btn-danger small"
                          onClick={() => handleDeleteParameter(func.id, param.id)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {inputParams.length === 0 && (
                      <div className="no-params">{isRu ? 'Нет входов' : 'No inputs'}</div>
                    )}
                  </div>
                  
                  {/* Выходные параметры */}
                  <div className="params-section">
                    <div className="params-header">
                      <span>{isRu ? 'Выходы' : 'Outputs'}</span>
                      <button
                        className="btn-add-param"
                        onClick={() => handleOpenAddParameter(func.id, 'output')}
                        title={isRu ? 'Добавить выход' : 'Add Output'}
                      >
                        +
                      </button>
                    </div>
                    {outputParams.map(param => (
                      <div key={param.id} className="param-item">
                        <span className="param-type" data-type={param.dataType}>
                          {param.dataType}
                        </span>
                        <span className="param-name">
                          {isRu ? param.nameRu : param.name}
                        </span>
                        <button
                          className="btn-icon btn-danger small"
                          onClick={() => handleDeleteParameter(func.id, param.id)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {outputParams.length === 0 && (
                      <div className="no-params">{isRu ? 'Нет выходов' : 'No outputs'}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        
        {functions.length === 0 && (
          <div className="no-functions">
            {isRu 
              ? 'Нет функций. Нажмите "+ Функция" чтобы создать.' 
              : 'No functions. Click "+ Function" to create one.'}
          </div>
        )}
      </div>
      
      {/* Диалог создания/редактирования функции */}
      {funcDialog.isOpen && (
        <div className="dialog-overlay" onClick={() => setFuncDialog(prev => ({ ...prev, isOpen: false }))}>
          <div className="dialog" onClick={e => e.stopPropagation()}>
            <h4>
              {funcDialog.mode === 'create' 
                ? (isRu ? 'Новая функция' : 'New Function')
                : (isRu ? 'Редактировать функцию' : 'Edit Function')
              }
            </h4>
            
            <div className="dialog-field">
              <label>{isRu ? 'Имя (для кода)' : 'Name (for code)'}</label>
              <input
                type="text"
                value={funcDialog.name}
                onChange={e => setFuncDialog(prev => ({ ...prev, name: e.target.value }))}
                placeholder="myFunction"
                pattern="[a-zA-Z_][a-zA-Z0-9_]*"
              />
            </div>
            
            <div className="dialog-field">
              <label>{isRu ? 'Отображаемое имя (RU)' : 'Display Name (RU)'}</label>
              <input
                type="text"
                value={funcDialog.nameRu}
                onChange={e => setFuncDialog(prev => ({ ...prev, nameRu: e.target.value }))}
                placeholder={isRu ? 'Моя функция' : 'My Function'}
              />
            </div>
            
            <div className="dialog-field">
              <label>{isRu ? 'Описание' : 'Description'}</label>
              <textarea
                value={funcDialog.description}
                onChange={e => setFuncDialog(prev => ({ ...prev, description: e.target.value }))}
                placeholder={isRu ? 'Описание функции...' : 'Function description...'}
                rows={3}
              />
            </div>
            
            <div className="dialog-actions">
              <button 
                className="btn-cancel"
                onClick={() => setFuncDialog(prev => ({ ...prev, isOpen: false }))}
              >
                {isRu ? 'Отмена' : 'Cancel'}
              </button>
              <button 
                className="btn-save"
                onClick={handleSaveFunction}
                disabled={!funcDialog.name.trim()}
              >
                {funcDialog.mode === 'create' 
                  ? (isRu ? 'Создать' : 'Create')
                  : (isRu ? 'Сохранить' : 'Save')
                }
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Диалог добавления параметра */}
      {paramDialog.isOpen && (
        <div className="dialog-overlay" onClick={() => setParamDialog(prev => ({ ...prev, isOpen: false }))}>
          <div className="dialog" onClick={e => e.stopPropagation()}>
            <h4>
              {paramDialog.direction === 'input'
                ? (isRu ? 'Новый входной параметр' : 'New Input Parameter')
                : (isRu ? 'Новый выходной параметр' : 'New Output Parameter')
              }
            </h4>
            
            <div className="dialog-field">
              <label>{isRu ? 'Имя (для кода)' : 'Name (for code)'}</label>
              <input
                type="text"
                value={paramDialog.name}
                onChange={e => setParamDialog(prev => ({ ...prev, name: e.target.value }))}
                placeholder="paramName"
              />
            </div>
            
            <div className="dialog-field">
              <label>{isRu ? 'Отображаемое имя (RU)' : 'Display Name (RU)'}</label>
              <input
                type="text"
                value={paramDialog.nameRu}
                onChange={e => setParamDialog(prev => ({ ...prev, nameRu: e.target.value }))}
                placeholder={isRu ? 'Параметр' : 'Parameter'}
              />
            </div>
            
            <div className="dialog-field">
              <label>{isRu ? 'Тип данных' : 'Data Type'}</label>
              <select
                value={paramDialog.dataType}
                onChange={e => setParamDialog(prev => ({ 
                  ...prev, 
                  dataType: e.target.value as PortDataType 
                }))}
              >
                {dataTypeOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {isRu ? opt.labelRu : opt.label}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="dialog-actions">
              <button 
                className="btn-cancel"
                onClick={() => setParamDialog(prev => ({ ...prev, isOpen: false }))}
              >
                {isRu ? 'Отмена' : 'Cancel'}
              </button>
              <button 
                className="btn-save"
                onClick={handleSaveParameter}
                disabled={!paramDialog.name.trim()}
              >
                {isRu ? 'Добавить' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FunctionListPanel;
