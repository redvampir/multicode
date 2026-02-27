/**
 * HelpPanel — панель справки/документации
 */

import React from 'react';

export interface HelpPanelProps {
  locale: 'ru' | 'en';
  onClose: () => void;
}

const HelpPanel: React.FC<HelpPanelProps> = ({ locale, onClose }) => {
  const content = locale === 'ru' ? HELP_CONTENT_RU : HELP_CONTENT_EN;

  return (
    <div className="help-panel-overlay" onClick={onClose}>
      <div className="help-panel-content" onClick={(e) => e.stopPropagation()}>
        <div className="help-panel-header">
          <h2>{content.title}</h2>
          <button className="help-panel-close" onClick={onClose} title={locale === 'ru' ? 'Закрыть (ESC)' : 'Close (ESC)'}>
            ✕
          </button>
        </div>
        <div className="help-panel-body">
          {content.sections.map((section, idx) => (
            <div key={idx} className="help-section">
              <h3>{section.title}</h3>
              {section.items.map((item, itemIdx) => (
                <div key={itemIdx} className="help-item">
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HelpPanel;

/** Контент справки на русском */
const HELP_CONTENT_RU = {
  title: '📚 Справка MultiCode Visual Programming',
  sections: [
    {
      title: 'Основы',
      items: [
        {
          title: 'Что такое MultiCode?',
          description: 'Визуальное программирование в стиле Blueprint (Unreal Engine). Создавайте программы, соединяя узлы.',
        },
        {
          title: 'Узлы',
          description: 'Узлы — основные блоки программы. Каждый узел выполняет одну задачу: ветвление, цикл, вывод и т.д.',
        },
        {
          title: 'Связи',
          description: 'Белые ромбы — поток выполнения (execution flow). Цветные круги — данные (int, string, bool).',
        },
      ],
    },
    {
      title: 'Управление',
      items: [
        {
          title: 'Добавить узел',
          description: 'Нажмите кнопку "➕ Добавить узел" или перетащите узел из палитры на холст.',
        },
        {
          title: 'Соединить узлы',
          description: 'Перетащите от выходного порта (справа) к входному порту (слева).',
        },
        {
          title: 'Удалить узел',
          description: 'Выберите узел и нажмите Delete/Backspace.',
        },
        {
          title: 'Переименовать узел',
          description: 'Двойной клик по заголовку узла → введите новое имя → Enter.',
        },
      ],
    },
    {
      title: 'Горячие клавиши',
      items: [
        {
          title: 'H',
          description: 'Показать/скрыть горячие клавиши.',
        },
        {
          title: 'Ctrl+S',
          description: 'Сохранить граф.',
        },
        {
          title: 'Ctrl+G',
          description: 'Сгенерировать код (C++/Rust).',
        },
        {
          title: 'Delete/Backspace',
          description: 'Удалить выбранный узел/связь.',
        },
      ],
    },
    {
      title: 'Типы узлов',
      items: [
        {
          title: 'Начало (Start)',
          description: 'Точка входа в программу. С него начинается выполнение.',
        },
        {
          title: 'Конец (End)',
          description: 'Завершает выполнение программы.',
        },
        {
          title: 'Ветвление (Branch)',
          description: 'Условный переход: если условие истинно → True, иначе → False.',
        },
        {
          title: 'Цикл For',
          description: 'Цикл с индексом: настраиваются начало, граница, шаг и направление (вверх/вниз/авто).',
        },
        {
          title: 'Цикл While',
          description: 'Цикл с условием. Выполняется, пока условие истинно.',
        },
        {
          title: 'Вывод (Print)',
          description: 'Выводит строку в консоль.',
        },
        {
          title: 'Переменная',
          description: 'Хранит значение. Поддерживает int, float, string, bool.',
        },
        {
          title: 'Операции',
          description: 'Арифметика (+, -, *, /), логика (И, ИЛИ, НЕ), сравнение (=, <, >).',
        },
      ],
    },
    {
      title: 'Языки генерации',
      items: [
        {
          title: 'C++',
          description: 'Генерация кода на C++ (std::cout, for, if).',
        },
        {
          title: 'Rust (скоро)',
          description: 'Планируется поддержка Rust.',
        },
        {
          title: 'Assembly (в будущем)',
          description: 'Низкоуровневая генерация кода.',
        },
      ],
    },
  ],
};

/** Контент справки на английском */
const HELP_CONTENT_EN = {
  title: '📚 MultiCode Visual Programming Help',
  sections: [
    {
      title: 'Basics',
      items: [
        {
          title: 'What is MultiCode?',
          description: 'Visual programming in Blueprint style (Unreal Engine). Create programs by connecting nodes.',
        },
        {
          title: 'Nodes',
          description: 'Nodes are the building blocks of a program. Each node performs one task: branching, loops, output, etc.',
        },
        {
          title: 'Connections',
          description: 'White diamonds — execution flow. Colored circles — data (int, string, bool).',
        },
      ],
    },
    {
      title: 'Controls',
      items: [
        {
          title: 'Add Node',
          description: 'Click "➕ Add Node" button or drag a node from the palette onto the canvas.',
        },
        {
          title: 'Connect Nodes',
          description: 'Drag from an output port (right side) to an input port (left side).',
        },
        {
          title: 'Delete Node',
          description: 'Select a node and press Delete/Backspace.',
        },
        {
          title: 'Rename Node',
          description: 'Double-click on the node header → enter new name → press Enter.',
        },
      ],
    },
    {
      title: 'Hotkeys',
      items: [
        {
          title: 'H',
          description: 'Show/hide hotkeys.',
        },
        {
          title: 'Ctrl+S',
          description: 'Save graph.',
        },
        {
          title: 'Ctrl+G',
          description: 'Generate code (C++/Rust).',
        },
        {
          title: 'Delete/Backspace',
          description: 'Delete selected node/connection.',
        },
      ],
    },
    {
      title: 'Node Types',
      items: [
        {
          title: 'Start',
          description: 'Entry point of the program. Execution starts here.',
        },
        {
          title: 'End',
          description: 'Terminates program execution.',
        },
        {
          title: 'Branch',
          description: 'Conditional jump: if condition is true → True, otherwise → False.',
        },
        {
          title: 'For Loop',
          description: 'Indexed loop with configurable start, bound, step, and direction (up/down/auto).',
        },
        {
          title: 'While Loop',
          description: 'Loop with a condition. Executes while the condition is true.',
        },
        {
          title: 'Print',
          description: 'Outputs a string to the console.',
        },
        {
          title: 'Variable',
          description: 'Stores a value. Supports int, float, string, bool.',
        },
        {
          title: 'Operations',
          description: 'Arithmetic (+, -, *, /), logic (AND, OR, NOT), comparison (=, <, >).',
        },
      ],
    },
    {
      title: 'Code Generation Languages',
      items: [
        {
          title: 'C++',
          description: 'Code generation in C++ (std::cout, for, if).',
        },
        {
          title: 'Rust (coming soon)',
          description: 'Rust support is planned.',
        },
        {
          title: 'Assembly (future)',
          description: 'Low-level code generation.',
        },
      ],
    },
  ],
};
