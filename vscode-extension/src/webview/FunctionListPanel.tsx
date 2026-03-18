/**
 * Панель списка функций (как в UE Blueprints)
 * Отображает список пользовательских функций с возможностью:
 * - Создания новой функции
 * - Редактирования существующей
 * - Удаления функции
 * - Переключения между EventGraph и функциями
 */

import React, { useState, useCallback, useMemo } from 'react';
import type { 
  BlueprintFunction, 
  BlueprintGraphState,
} from '../shared/blueprintTypes';
import { createUserFunction, removeFunctionParameter } from '../shared/blueprintTypes';
import { FunctionEditor } from './FunctionEditor';

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
  /** Добавить узел вызова функции в EventGraph */
  onCreateFunctionCallNode?: (functionId: string) => void;
  /** Свернута ли секция */
  collapsed: boolean;
  /** Переключить состояние сворачивания */
  onToggleCollapsed: () => void;
}

export const FunctionListPanel: React.FC<FunctionListPanelProps> = ({
  graphState,
  onFunctionsChange,
  onSelectFunction,
  activeFunctionId,
  displayLanguage,
  onCreateFunctionCallNode,
  collapsed,
  onToggleCollapsed,
}) => {
  const isRu = displayLanguage === 'ru';
  const [editingFunction, setEditingFunction] = useState<BlueprintFunction | null>(null);
  
  // Обернём functions в useMemo для оптимизации
  const functions = useMemo(() => graphState.functions || [], [graphState.functions]);
  const [expandedFunctions, setExpandedFunctions] = useState<Set<string>>(new Set());
  
  // === Обработчики для функций ===
  
  const handleCreateFunction = useCallback(() => {
    const usedNames = new Set<string>();
    for (const func of functions) {
      if (func.name) {
        usedNames.add(func.name);
      }
      if (func.nameRu) {
        usedNames.add(func.nameRu);
      }
    }

    let suffix = functions.length + 1;
    // Делаем имя предсказуемым и гарантированно уникальным в пределах графа.
    // `name` используется как "кодовое" (и в EN режиме UI), `nameRu` — для RU режима.
    while (
      usedNames.has(`newFunction${suffix}`) ||
      usedNames.has(`Новая функция ${suffix}`)
    ) {
      suffix += 1;
    }

    const newFunc = createUserFunction(`newFunction${suffix}`, `Новая функция ${suffix}`);
    onFunctionsChange([...functions, newFunc]);
    setExpandedFunctions((prev) => new Set(prev).add(newFunc.id));
    onSelectFunction(newFunc.id);
  }, [functions, onFunctionsChange, onSelectFunction]);
  
  const handleEditFunction = useCallback((func: BlueprintFunction) => {
    // Open the visual FunctionEditor for this function
    setEditingFunction(func);
  }, []);

  // Handler invoked by visual FunctionEditor when user saves changes
  const handleEditorSave = useCallback((updatedFunc: BlueprintFunction) => {
    const updatedFunctions = functions.map(f => f.id === updatedFunc.id ? updatedFunc : f);
    onFunctionsChange(updatedFunctions);
    setEditingFunction(null);
  }, [functions, onFunctionsChange]);
  
  const handleDeleteFunction = useCallback((funcId: string) => {
    // Если удаляемая функция активна — переключаемся на EventGraph
    if (activeFunctionId === funcId) {
      onSelectFunction(null);
    }
    const updatedFunctions = functions.filter(f => f.id !== funcId);
    onFunctionsChange(updatedFunctions);
  }, [functions, activeFunctionId, onFunctionsChange, onSelectFunction]);
  
  // Управление параметрами делаем через FunctionEditor (как отдельное окно).
  
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
  // dataTypeOptions removed - not used in component
  
  return (
    <div className="function-list-panel">
      <div className="function-list-header">
        <div className="panel-header-title">
          <button
            className="panel-collapse-btn"
            onClick={onToggleCollapsed}
            title={isRu ? 'Свернуть или развернуть секцию' : 'Collapse or expand section'}
            data-testid="functions-section-toggle"
            aria-label={isRu ? 'Переключить секцию функций' : 'Toggle functions section'}
          >
            {collapsed ? '▶' : '▼'}
          </button>
          <h3>{isRu ? 'Функции' : 'Functions'}</h3>
        </div>
        <button 
          className="btn-add-function" 
          onClick={handleCreateFunction}
          title={isRu ? 'Создать функцию' : 'Create Function'}
        >
          + {isRu ? 'Функция' : 'Function'}
        </button>
      </div>

      {!collapsed && (
        <div className="function-list">
        {/* EventGraph — всегда первый */}
        <div 
          className={`function-item ${activeFunctionId === null ? 'active' : ''}`}
          onClick={() => onSelectFunction(null)}
        >
          <span className="function-icon">📊</span>
          <span className="function-name">{isRu ? 'Граф событий' : 'EventGraph'}</span>
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
                  {onCreateFunctionCallNode && (
                    <button
                      className="btn-icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCreateFunctionCallNode(func.id);
                      }}
                      title={isRu ? 'Добавить вызов в граф событий' : 'Add call node to EventGraph'}
                      data-testid={`function-call-add-${func.id}`}
                    >
                      ↗
                    </button>
                  )}
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
                        onClick={(e) => { e.stopPropagation(); handleEditFunction(func); }}
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
                        onClick={(e) => { e.stopPropagation(); handleEditFunction(func); }}
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

        </div>
      )}
      
      {/* Редактор функции */}
      {editingFunction && (
        <FunctionEditor
          function={editingFunction}
          onSave={handleEditorSave}
          onClose={() => setEditingFunction(null)}
          onDelete={() => handleDeleteFunction(editingFunction.id)}
        />
      )}
    </div>
  );
};

export default FunctionListPanel;
