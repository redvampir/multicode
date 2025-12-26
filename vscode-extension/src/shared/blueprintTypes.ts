/**
 * Расширенные типы для Blueprints-style графов
 * Совместимы с C++ ядром, но с дополнительной информацией для UI
 */

import { PortDataType, PortDefinition } from './portTypes';

export type GraphLanguage = 'cpp' | 'rust' | 'asm';
export type GraphDisplayLanguage = 'ru' | 'en';

/** 
 * Расширенные типы узлов для Blueprints-style редактора
 * Соответствуют NodeType в C++ ядре
 */
export type BlueprintNodeType =
  // Control Flow
  | 'Start'
  | 'End'
  | 'Branch'         // If/Else
  | 'ForLoop'
  | 'WhileLoop'
  | 'DoWhile'        // Цикл с постусловием
  | 'ForEach'        // Итерация по массиву
  | 'Switch'         // Множественный выбор
  | 'Break'          // Выход из цикла
  | 'Continue'       // Продолжить цикл
  | 'Sequence'       // Последовательное выполнение
  | 'Parallel'       // Параллельное выполнение (многопоток)
  | 'Gate'           // Управляемый шлюз (открыть/закрыть поток)
  | 'DoN'            // Выполнить N раз
  | 'DoOnce'         // Выполнить один раз
  | 'FlipFlop'       // Переключатель A/B
  | 'MultiGate'      // Множественный шлюз (циклический выбор)
  | 'Return'
  // Functions
  | 'Function'
  | 'FunctionCall'
  | 'FunctionEntry'  // Точка входа в пользовательскую функцию
  | 'FunctionReturn' // Возврат из пользовательской функции
  | 'CallUserFunction' // Вызов пользовательской функции
  | 'Event'
  // Variables
  | 'Variable'
  | 'GetVariable'
  | 'SetVariable'
  // Math
  | 'Add'
  | 'Subtract'
  | 'Multiply'
  | 'Divide'
  | 'Modulo'
  // Comparison
  | 'Equal'
  | 'NotEqual'
  | 'Greater'
  | 'Less'
  | 'GreaterEqual'
  | 'LessEqual'
  // Logic
  | 'And'
  | 'Or'
  | 'Not'
  // I/O
  | 'Print'
  | 'Input'
  // Comments & Organization
  | 'Comment'
  | 'Reroute'
  // Custom
  | 'Custom';

export type GraphEdgeKind = 'execution' | 'data';

/** Определение порта на узле (для React Flow) */
export interface NodePort extends PortDefinition {
  /** Позиция на узле (индекс сверху вниз) */
  index: number;
  /** Текущее значение (если задано пользователем) */
  value?: string | number | boolean;
  /** Подключён ли порт */
  connected?: boolean;
}

/** Расширенный узел графа с портами */
export interface BlueprintNode {
  id: string;
  label: string;
  type: BlueprintNodeType;
  position: { x: number; y: number };
  /** Входные порты (слева) */
  inputs: NodePort[];
  /** Выходные порты (справа) */
  outputs: NodePort[];
  /** Свойства узла (для Variable, Function и т.д.) */
  properties?: Record<string, string | number | boolean>;
  /** Комментарий/описание */
  comment?: string;
  /** Размер узла (для Comment nodes) */
  size?: { width: number; height: number };
  /** Пользовательское название (переопределяет label) */
  customLabel?: string;
}

/** Связь между портами */
export interface BlueprintEdge {
  id: string;
  /** ID исходного узла */
  sourceNode: string;
  /** ID исходного порта */
  sourcePort: string;
  /** ID целевого узла */
  targetNode: string;
  /** ID целевого порта */
  targetPort: string;
  /** Тип связи (execution/data) - определяется по типам портов */
  kind: GraphEdgeKind;
  /** Тип данных (для data edges) */
  dataType?: PortDataType;
}

/** Полное состояние Blueprint-графа */
export interface BlueprintGraphState {
  id: string;
  name: string;
  language: GraphLanguage;
  displayLanguage: GraphDisplayLanguage;
  nodes: BlueprintNode[];
  edges: BlueprintEdge[];
  updatedAt: string;
  dirty?: boolean;
  /** Метаданные для редактора */
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
  /** Пользовательские функции (как в UE Blueprints) */
  functions?: BlueprintFunction[];
  /** ID текущей редактируемой функции (null = основной граф EventGraph) */
  activeFunctionId?: string | null;
}

// ============================================
// Типы для пользовательских функций (UE Blueprint-style)
// ============================================

/** Направление параметра функции */
export type FunctionParameterDirection = 'input' | 'output';

/** Параметр пользовательской функции */
export interface FunctionParameter {
  id: string;
  name: string;
  nameRu: string;
  dataType: PortDataType;
  direction: FunctionParameterDirection;
  defaultValue?: string | number | boolean;
  description?: string;
}

/** Пользовательская функция (граф с параметрами) */
export interface BlueprintFunction {
  /** Уникальный ID функции */
  id: string;
  /** Имя функции (для кодогенерации) */
  name: string;
  /** Отображаемое имя (RU) */
  nameRu: string;
  /** Описание функции */
  description?: string;
  /** Параметры функции (входные и выходные) */
  parameters: FunctionParameter[];
  /** Граф функции (узлы и связи) */
  graph: {
    nodes: BlueprintNode[];
    edges: BlueprintEdge[];
  };
  /** Является ли функция чистой (без побочных эффектов) */
  isPure?: boolean;
  /** Цвет категории (для визуального различия) */
  categoryColor?: string;
  /** Дата создания */
  createdAt: string;
  /** Дата обновления */
  updatedAt: string;
}

/** Определение типа узла (шаблон для создания) */
export interface NodeTypeDefinition {
  type: BlueprintNodeType;
  label: string;
  labelRu: string;
  category: 'flow' | 'function' | 'variable' | 'math' | 'comparison' | 'logic' | 'io' | 'other';
  description?: string;
  descriptionRu?: string;
  /** Шаблон входных портов */
  inputs: Omit<NodePort, 'index' | 'connected'>[];
  /** Шаблон выходных портов */
  outputs: Omit<NodePort, 'index' | 'connected'>[];
  /** Можно ли добавлять динамические порты */
  dynamicPorts?: boolean;
  /** Цвет заголовка узла */
  headerColor?: string;
}

// ============================================
// Преобразование между старым и новым форматом
// ============================================

import { GraphState, GraphNode, GraphEdge } from './graphState';

/** Преобразовать старый формат в Blueprint формат */
export function migrateToBlueprintFormat(oldState: GraphState): BlueprintGraphState {
  // Защита от undefined/null
  const safeNodes = oldState?.nodes ?? [];
  const safeEdges = oldState?.edges ?? [];
  
  const nodes: BlueprintNode[] = safeNodes
    .filter(node => node && typeof node === 'object')
    .map(node => ({
      id: node.id ?? `node-${Math.random().toString(36).slice(2)}`,
      label: node.label ?? 'Unnamed',
      type: mapOldNodeType(node.type ?? 'Custom'),
      position: node.position ?? { x: 0, y: 0 },
      inputs: getDefaultInputs(mapOldNodeType(node.type ?? 'Custom')),
      outputs: getDefaultOutputs(mapOldNodeType(node.type ?? 'Custom')),
    }));

  const edges: BlueprintEdge[] = safeEdges
    .filter(edge => edge && typeof edge === 'object' && edge.source && edge.target)
    .map(edge => ({
      id: edge.id ?? `edge-${Math.random().toString(36).slice(2)}`,
      sourceNode: edge.source,
      sourcePort: `${edge.source}-exec-out`, // Default exec port
      targetNode: edge.target,
      targetPort: `${edge.target}-exec-in`,
      kind: edge.kind ?? 'execution',
    }));

  return {
    id: oldState.id,
    name: oldState.name,
    language: oldState.language,
    displayLanguage: oldState.displayLanguage,
    nodes,
    edges,
    updatedAt: oldState.updatedAt,
    dirty: oldState.dirty,
  };
}

function mapOldNodeType(type: string): BlueprintNodeType {
  const mapping: Record<string, BlueprintNodeType> = {
    'Start': 'Start',
    'End': 'End',
    'Function': 'Function',
    'Variable': 'Variable',
    'Custom': 'Custom',
  };
  return mapping[type] ?? 'Custom';
}

function getDefaultInputs(type: BlueprintNodeType): NodePort[] {
  const defaults = NODE_TYPE_DEFINITIONS[type];
  if (!defaults) return [];
  return defaults.inputs.map((p, i) => ({ ...p, index: i, connected: false }));
}

function getDefaultOutputs(type: BlueprintNodeType): NodePort[] {
  const defaults = NODE_TYPE_DEFINITIONS[type];
  if (!defaults) return [];
  return defaults.outputs.map((p, i) => ({ ...p, index: i, connected: false }));
}

// ============================================
// Определения стандартных типов узлов
// ============================================

export const NODE_TYPE_DEFINITIONS: Record<BlueprintNodeType, NodeTypeDefinition> = {
  // === Control Flow ===
  Start: {
    type: 'Start',
    label: 'Event Begin Play',
    labelRu: 'Начало',
    category: 'flow',
    description: 'Entry point of the graph',
    descriptionRu: 'Точка входа в граф',
    headerColor: '#E53935',
    inputs: [],
    outputs: [
      { id: 'exec-out', name: '', dataType: 'execution', direction: 'output' }
    ],
  },
  End: {
    type: 'End',
    label: 'Return',
    labelRu: 'Конец',
    category: 'flow',
    headerColor: '#E53935',
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' }
    ],
    outputs: [],
  },
  Branch: {
    type: 'Branch',
    label: 'Branch',
    labelRu: 'Ветвление',
    category: 'flow',
    description: 'If/Else conditional',
    descriptionRu: 'Условный переход',
    headerColor: '#7C4DFF',
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' },
      { id: 'condition', name: 'Condition', dataType: 'bool', direction: 'input' }
    ],
    outputs: [
      { id: 'true', name: 'True', dataType: 'execution', direction: 'output' },
      { id: 'false', name: 'False', dataType: 'execution', direction: 'output' }
    ],
  },
  ForLoop: {
    type: 'ForLoop',
    label: 'For Loop',
    labelRu: 'Цикл For',
    category: 'flow',
    headerColor: '#7C4DFF',
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' },
      { id: 'first', name: 'First Index', dataType: 'int32', direction: 'input', defaultValue: 0 },
      { id: 'last', name: 'Last Index', dataType: 'int32', direction: 'input', defaultValue: 10 }
    ],
    outputs: [
      { id: 'loop-body', name: 'Loop Body', dataType: 'execution', direction: 'output' },
      { id: 'index', name: 'Index', dataType: 'int32', direction: 'output' },
      { id: 'completed', name: 'Completed', dataType: 'execution', direction: 'output' }
    ],
  },
  WhileLoop: {
    type: 'WhileLoop',
    label: 'While Loop',
    labelRu: 'Цикл While',
    category: 'flow',
    headerColor: '#7C4DFF',
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' },
      { id: 'condition', name: 'Condition', dataType: 'bool', direction: 'input' }
    ],
    outputs: [
      { id: 'loop-body', name: 'Loop Body', dataType: 'execution', direction: 'output' },
      { id: 'completed', name: 'Completed', dataType: 'execution', direction: 'output' }
    ],
  },
  Sequence: {
    type: 'Sequence',
    label: 'Sequence',
    labelRu: 'Последовательность',
    category: 'flow',
    headerColor: '#7C4DFF',
    dynamicPorts: true,
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' }
    ],
    outputs: [
      { id: 'then-0', name: 'Then 0', dataType: 'execution', direction: 'output' },
      { id: 'then-1', name: 'Then 1', dataType: 'execution', direction: 'output' }
    ],
  },
  Parallel: {
    type: 'Parallel',
    label: 'Parallel',
    labelRu: 'Параллельно',
    category: 'flow',
    description: 'Execute multiple branches in parallel (threads)',
    descriptionRu: 'Выполнить несколько веток параллельно (многопоток)',
    headerColor: '#00BCD4',
    dynamicPorts: true,
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' }
    ],
    outputs: [
      { id: 'thread-0', name: 'Thread 0', dataType: 'execution', direction: 'output' },
      { id: 'thread-1', name: 'Thread 1', dataType: 'execution', direction: 'output' },
      { id: 'completed', name: 'All Done', dataType: 'execution', direction: 'output' }
    ],
  },
  Gate: {
    type: 'Gate',
    label: 'Gate',
    labelRu: 'Шлюз',
    category: 'flow',
    description: 'Controllable gate - can be opened/closed to control flow',
    descriptionRu: 'Управляемый шлюз - можно открыть/закрыть для контроля потока',
    headerColor: '#FF9800',
    inputs: [
      { id: 'enter', name: 'Enter', dataType: 'execution', direction: 'input' },
      { id: 'open', name: 'Open', dataType: 'execution', direction: 'input' },
      { id: 'close', name: 'Close', dataType: 'execution', direction: 'input' },
      { id: 'toggle', name: 'Toggle', dataType: 'execution', direction: 'input' }
    ],
    outputs: [
      { id: 'exit', name: 'Exit', dataType: 'execution', direction: 'output' }
    ],
  },
  DoN: {
    type: 'DoN',
    label: 'Do N',
    labelRu: 'Выполнить N раз',
    category: 'flow',
    description: 'Execute N times, then stop',
    descriptionRu: 'Выполнить N раз, затем остановиться',
    headerColor: '#FF9800',
    inputs: [
      { id: 'exec-in', name: 'Enter', dataType: 'execution', direction: 'input' },
      { id: 'n', name: 'N', dataType: 'int32', direction: 'input' },
      { id: 'reset', name: 'Reset', dataType: 'execution', direction: 'input' }
    ],
    outputs: [
      { id: 'exit', name: 'Exit', dataType: 'execution', direction: 'output' },
      { id: 'counter', name: 'Counter', dataType: 'int32', direction: 'output' }
    ],
  },
  DoOnce: {
    type: 'DoOnce',
    label: 'Do Once',
    labelRu: 'Один раз',
    category: 'flow',
    description: 'Execute only once, ignore subsequent calls',
    descriptionRu: 'Выполнить только один раз, игнорировать последующие вызовы',
    headerColor: '#FF9800',
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' },
      { id: 'reset', name: 'Reset', dataType: 'execution', direction: 'input' }
    ],
    outputs: [
      { id: 'completed', name: 'Completed', dataType: 'execution', direction: 'output' }
    ],
  },
  FlipFlop: {
    type: 'FlipFlop',
    label: 'Flip Flop',
    labelRu: 'Переключатель',
    category: 'flow',
    description: 'Alternates between A and B outputs',
    descriptionRu: 'Переключает между выходами A и B',
    headerColor: '#FF9800',
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' }
    ],
    outputs: [
      { id: 'a', name: 'A', dataType: 'execution', direction: 'output' },
      { id: 'b', name: 'B', dataType: 'execution', direction: 'output' },
      { id: 'is-a', name: 'Is A', dataType: 'bool', direction: 'output' }
    ],
  },
  MultiGate: {
    type: 'MultiGate',
    label: 'Multi Gate',
    labelRu: 'Мульти-шлюз',
    category: 'flow',
    description: 'Cycles through multiple outputs sequentially or randomly',
    descriptionRu: 'Циклически переключает между несколькими выходами',
    headerColor: '#FF9800',
    dynamicPorts: true,
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' },
      { id: 'reset', name: 'Reset', dataType: 'execution', direction: 'input' },
      { id: 'is-random', name: 'Random', dataType: 'bool', direction: 'input' },
      { id: 'loop', name: 'Loop', dataType: 'bool', direction: 'input' }
    ],
    outputs: [
      { id: 'out-0', name: 'Out 0', dataType: 'execution', direction: 'output' },
      { id: 'out-1', name: 'Out 1', dataType: 'execution', direction: 'output' },
      { id: 'out-2', name: 'Out 2', dataType: 'execution', direction: 'output' }
    ],
  },
  DoWhile: {
    type: 'DoWhile',
    label: 'Do While',
    labelRu: 'Цикл Do-While',
    category: 'flow',
    description: 'Loop with post-condition (executes at least once)',
    descriptionRu: 'Цикл с постусловием (выполняется минимум один раз)',
    headerColor: '#7C4DFF',
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' },
      { id: 'condition', name: 'Condition', dataType: 'bool', direction: 'input' }
    ],
    outputs: [
      { id: 'loop-body', name: 'Loop Body', dataType: 'execution', direction: 'output' },
      { id: 'completed', name: 'Completed', dataType: 'execution', direction: 'output' }
    ],
  },
  ForEach: {
    type: 'ForEach',
    label: 'For Each',
    labelRu: 'Для каждого',
    category: 'flow',
    description: 'Iterate over array elements',
    descriptionRu: 'Итерация по элементам массива',
    headerColor: '#7C4DFF',
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' },
      { id: 'array', name: 'Array', dataType: 'array', direction: 'input' }
    ],
    outputs: [
      { id: 'loop-body', name: 'Loop Body', dataType: 'execution', direction: 'output' },
      { id: 'element', name: 'Element', dataType: 'any', direction: 'output' },
      { id: 'index', name: 'Index', dataType: 'int32', direction: 'output' },
      { id: 'completed', name: 'Completed', dataType: 'execution', direction: 'output' }
    ],
  },
  Switch: {
    type: 'Switch',
    label: 'Switch',
    labelRu: 'Выбор',
    category: 'flow',
    description: 'Multiple choice based on value',
    descriptionRu: 'Множественный выбор по значению',
    headerColor: '#7C4DFF',
    dynamicPorts: true,
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' },
      { id: 'selection', name: 'Selection', dataType: 'int32', direction: 'input', defaultValue: 0 }
    ],
    outputs: [
      { id: 'case-0', name: 'Case 0', dataType: 'execution', direction: 'output' },
      { id: 'case-1', name: 'Case 1', dataType: 'execution', direction: 'output' },
      { id: 'default', name: 'Default', dataType: 'execution', direction: 'output' }
    ],
  },
  Break: {
    type: 'Break',
    label: 'Break',
    labelRu: 'Прервать',
    category: 'flow',
    description: 'Exit from loop',
    descriptionRu: 'Выход из цикла',
    headerColor: '#E53935',
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' }
    ],
    outputs: [],
  },
  Continue: {
    type: 'Continue',
    label: 'Continue',
    labelRu: 'Продолжить',
    category: 'flow',
    description: 'Skip to next iteration',
    descriptionRu: 'Перейти к следующей итерации',
    headerColor: '#E53935',
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' }
    ],
    outputs: [],
  },
  Return: {
    type: 'Return',
    label: 'Return',
    labelRu: 'Возврат',
    category: 'flow',
    headerColor: '#E53935',
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' },
      { id: 'value', name: 'Return Value', dataType: 'any', direction: 'input' }
    ],
    outputs: [],
  },
  
  // === Functions ===
  Function: {
    type: 'Function',
    label: 'Function',
    labelRu: 'Функция',
    category: 'function',
    headerColor: '#2196F3',
    dynamicPorts: true,
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' }
    ],
    outputs: [
      { id: 'exec-out', name: '', dataType: 'execution', direction: 'output' }
    ],
  },
  FunctionCall: {
    type: 'FunctionCall',
    label: 'Call Function',
    labelRu: 'Вызов функции',
    category: 'function',
    headerColor: '#2196F3',
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' },
      { id: 'target', name: 'Target', dataType: 'object', direction: 'input', hidden: true }
    ],
    outputs: [
      { id: 'exec-out', name: '', dataType: 'execution', direction: 'output' },
      { id: 'return', name: 'Return Value', dataType: 'any', direction: 'output' }
    ],
  },
  Event: {
    type: 'Event',
    label: 'Custom Event',
    labelRu: 'Событие',
    category: 'function',
    headerColor: '#E53935',
    dynamicPorts: true,
    inputs: [],
    outputs: [
      { id: 'exec-out', name: '', dataType: 'execution', direction: 'output' }
    ],
  },
  
  // === User-Defined Functions (UE Blueprint-style) ===
  FunctionEntry: {
    type: 'FunctionEntry',
    label: 'Function Entry',
    labelRu: 'Вход в функцию',
    category: 'function',
    description: 'Entry point of a user-defined function',
    descriptionRu: 'Точка входа в пользовательскую функцию',
    headerColor: '#9C27B0', // Фиолетовый — для функций
    dynamicPorts: true, // Порты генерируются из параметров функции
    inputs: [],
    outputs: [
      { id: 'exec-out', name: '', dataType: 'execution', direction: 'output' }
      // Дополнительные выходы создаются динамически из параметров функции (inputs)
    ],
  },
  FunctionReturn: {
    type: 'FunctionReturn',
    label: 'Return Node',
    labelRu: 'Возврат из функции',
    category: 'function',
    description: 'Return point of a user-defined function',
    descriptionRu: 'Точка возврата из пользовательской функции',
    headerColor: '#9C27B0',
    dynamicPorts: true, // Порты генерируются из параметров функции
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' }
      // Дополнительные входы создаются динамически из return-параметров функции
    ],
    outputs: [],
  },
  CallUserFunction: {
    type: 'CallUserFunction',
    label: 'Call Function',
    labelRu: 'Вызов функции',
    category: 'function',
    description: 'Call a user-defined function',
    descriptionRu: 'Вызов пользовательской функции',
    headerColor: '#9C27B0',
    dynamicPorts: true, // Порты генерируются из сигнатуры функции
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' }
      // Дополнительные входы = input-параметры функции
    ],
    outputs: [
      { id: 'exec-out', name: '', dataType: 'execution', direction: 'output' }
      // Дополнительные выходы = output-параметры функции
    ],
  },
  
  // === Variables ===
  Variable: {
    type: 'Variable',
    label: 'Variable',
    labelRu: 'Переменная',
    category: 'variable',
    headerColor: '#4CAF50',
    inputs: [],
    outputs: [
      { id: 'value', name: 'Value', dataType: 'any', direction: 'output' }
    ],
  },
  GetVariable: {
    type: 'GetVariable',
    label: 'Get',
    labelRu: 'Получить',
    category: 'variable',
    headerColor: '#4CAF50',
    inputs: [],
    outputs: [
      { id: 'value', name: '', dataType: 'any', direction: 'output' }
    ],
  },
  SetVariable: {
    type: 'SetVariable',
    label: 'Set',
    labelRu: 'Установить',
    category: 'variable',
    headerColor: '#4CAF50',
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' },
      { id: 'value', name: '', dataType: 'any', direction: 'input' }
    ],
    outputs: [
      { id: 'exec-out', name: '', dataType: 'execution', direction: 'output' },
      { id: 'value', name: '', dataType: 'any', direction: 'output' }
    ],
  },
  
  // === Math ===
  Add: {
    type: 'Add',
    label: 'Add',
    labelRu: 'Сложение',
    category: 'math',
    headerColor: '#4CAF50',
    inputs: [
      { id: 'a', name: 'A', dataType: 'float', direction: 'input', defaultValue: 0 },
      { id: 'b', name: 'B', dataType: 'float', direction: 'input', defaultValue: 0 }
    ],
    outputs: [
      { id: 'result', name: 'Result', dataType: 'float', direction: 'output' }
    ],
  },
  Subtract: {
    type: 'Subtract',
    label: 'Subtract',
    labelRu: 'Вычитание',
    category: 'math',
    headerColor: '#4CAF50',
    inputs: [
      { id: 'a', name: 'A', dataType: 'float', direction: 'input', defaultValue: 0 },
      { id: 'b', name: 'B', dataType: 'float', direction: 'input', defaultValue: 0 }
    ],
    outputs: [
      { id: 'result', name: 'Result', dataType: 'float', direction: 'output' }
    ],
  },
  Multiply: {
    type: 'Multiply',
    label: 'Multiply',
    labelRu: 'Умножение',
    category: 'math',
    headerColor: '#4CAF50',
    inputs: [
      { id: 'a', name: 'A', dataType: 'float', direction: 'input', defaultValue: 0 },
      { id: 'b', name: 'B', dataType: 'float', direction: 'input', defaultValue: 0 }
    ],
    outputs: [
      { id: 'result', name: 'Result', dataType: 'float', direction: 'output' }
    ],
  },
  Divide: {
    type: 'Divide',
    label: 'Divide',
    labelRu: 'Деление',
    category: 'math',
    headerColor: '#4CAF50',
    inputs: [
      { id: 'a', name: 'A', dataType: 'float', direction: 'input', defaultValue: 0 },
      { id: 'b', name: 'B', dataType: 'float', direction: 'input', defaultValue: 1 }
    ],
    outputs: [
      { id: 'result', name: 'Result', dataType: 'float', direction: 'output' }
    ],
  },
  Modulo: {
    type: 'Modulo',
    label: 'Modulo',
    labelRu: 'Остаток',
    category: 'math',
    headerColor: '#4CAF50',
    inputs: [
      { id: 'a', name: 'A', dataType: 'int32', direction: 'input', defaultValue: 0 },
      { id: 'b', name: 'B', dataType: 'int32', direction: 'input', defaultValue: 1 }
    ],
    outputs: [
      { id: 'result', name: 'Result', dataType: 'int32', direction: 'output' }
    ],
  },
  
  // === Comparison ===
  Equal: {
    type: 'Equal',
    label: '==',
    labelRu: 'Равно',
    category: 'comparison',
    headerColor: '#4CAF50',
    inputs: [
      { id: 'a', name: 'A', dataType: 'any', direction: 'input' },
      { id: 'b', name: 'B', dataType: 'any', direction: 'input' }
    ],
    outputs: [
      { id: 'result', name: 'Result', dataType: 'bool', direction: 'output' }
    ],
  },
  NotEqual: {
    type: 'NotEqual',
    label: '!=',
    labelRu: 'Не равно',
    category: 'comparison',
    headerColor: '#4CAF50',
    inputs: [
      { id: 'a', name: 'A', dataType: 'any', direction: 'input' },
      { id: 'b', name: 'B', dataType: 'any', direction: 'input' }
    ],
    outputs: [
      { id: 'result', name: 'Result', dataType: 'bool', direction: 'output' }
    ],
  },
  Greater: {
    type: 'Greater',
    label: '>',
    labelRu: 'Больше',
    category: 'comparison',
    headerColor: '#4CAF50',
    inputs: [
      { id: 'a', name: 'A', dataType: 'float', direction: 'input' },
      { id: 'b', name: 'B', dataType: 'float', direction: 'input' }
    ],
    outputs: [
      { id: 'result', name: 'Result', dataType: 'bool', direction: 'output' }
    ],
  },
  Less: {
    type: 'Less',
    label: '<',
    labelRu: 'Меньше',
    category: 'comparison',
    headerColor: '#4CAF50',
    inputs: [
      { id: 'a', name: 'A', dataType: 'float', direction: 'input' },
      { id: 'b', name: 'B', dataType: 'float', direction: 'input' }
    ],
    outputs: [
      { id: 'result', name: 'Result', dataType: 'bool', direction: 'output' }
    ],
  },
  GreaterEqual: {
    type: 'GreaterEqual',
    label: '>=',
    labelRu: 'Больше или равно',
    category: 'comparison',
    headerColor: '#4CAF50',
    inputs: [
      { id: 'a', name: 'A', dataType: 'float', direction: 'input' },
      { id: 'b', name: 'B', dataType: 'float', direction: 'input' }
    ],
    outputs: [
      { id: 'result', name: 'Result', dataType: 'bool', direction: 'output' }
    ],
  },
  LessEqual: {
    type: 'LessEqual',
    label: '<=',
    labelRu: 'Меньше или равно',
    category: 'comparison',
    headerColor: '#4CAF50',
    inputs: [
      { id: 'a', name: 'A', dataType: 'float', direction: 'input' },
      { id: 'b', name: 'B', dataType: 'float', direction: 'input' }
    ],
    outputs: [
      { id: 'result', name: 'Result', dataType: 'bool', direction: 'output' }
    ],
  },
  
  // === Logic ===
  And: {
    type: 'And',
    label: 'AND',
    labelRu: 'И',
    category: 'logic',
    headerColor: '#E53935',
    inputs: [
      { id: 'a', name: 'A', dataType: 'bool', direction: 'input' },
      { id: 'b', name: 'B', dataType: 'bool', direction: 'input' }
    ],
    outputs: [
      { id: 'result', name: 'Result', dataType: 'bool', direction: 'output' }
    ],
  },
  Or: {
    type: 'Or',
    label: 'OR',
    labelRu: 'ИЛИ',
    category: 'logic',
    headerColor: '#E53935',
    inputs: [
      { id: 'a', name: 'A', dataType: 'bool', direction: 'input' },
      { id: 'b', name: 'B', dataType: 'bool', direction: 'input' }
    ],
    outputs: [
      { id: 'result', name: 'Result', dataType: 'bool', direction: 'output' }
    ],
  },
  Not: {
    type: 'Not',
    label: 'NOT',
    labelRu: 'НЕ',
    category: 'logic',
    headerColor: '#E53935',
    inputs: [
      { id: 'a', name: '', dataType: 'bool', direction: 'input' }
    ],
    outputs: [
      { id: 'result', name: '', dataType: 'bool', direction: 'output' }
    ],
  },
  
  // === I/O ===
  Print: {
    type: 'Print',
    label: 'Print String',
    labelRu: 'Вывод строки',
    category: 'io',
    headerColor: '#00BCD4',
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' },
      { id: 'string', name: 'In String', dataType: 'string', direction: 'input', defaultValue: '' }
    ],
    outputs: [
      { id: 'exec-out', name: '', dataType: 'execution', direction: 'output' }
    ],
  },
  Input: {
    type: 'Input',
    label: 'Read Input',
    labelRu: 'Ввод',
    category: 'io',
    headerColor: '#00BCD4',
    inputs: [
      { id: 'exec-in', name: '', dataType: 'execution', direction: 'input' },
      { id: 'prompt', name: 'Prompt', dataType: 'string', direction: 'input', defaultValue: '' }
    ],
    outputs: [
      { id: 'exec-out', name: '', dataType: 'execution', direction: 'output' },
      { id: 'value', name: 'Value', dataType: 'string', direction: 'output' }
    ],
  },
  
  // === Comments & Organization ===
  Comment: {
    type: 'Comment',
    label: 'Comment',
    labelRu: 'Комментарий',
    category: 'other',
    headerColor: '#455A64',
    inputs: [],
    outputs: [],
  },
  Reroute: {
    type: 'Reroute',
    label: 'Reroute',
    labelRu: 'Перенаправление',
    category: 'other',
    headerColor: '#9E9E9E',
    inputs: [
      { id: 'in', name: '', dataType: 'any', direction: 'input' }
    ],
    outputs: [
      { id: 'out', name: '', dataType: 'any', direction: 'output' }
    ],
  },
  
  // === Custom ===
  Custom: {
    type: 'Custom',
    label: 'Custom Node',
    labelRu: 'Пользовательский',
    category: 'other',
    headerColor: '#9C27B0',
    dynamicPorts: true,
    inputs: [],
    outputs: [],
  },
};

/** Получить узлы по категории */
export function getNodesByCategory(category: NodeTypeDefinition['category']): NodeTypeDefinition[] {
  return Object.values(NODE_TYPE_DEFINITIONS).filter(def => def.category === category);
}

/** Все категории с локализацией */
export const NODE_CATEGORIES: { id: NodeTypeDefinition['category']; label: string; labelRu: string }[] = [
  { id: 'flow', label: 'Flow Control', labelRu: 'Управление потоком' },
  { id: 'function', label: 'Functions', labelRu: 'Функции' },
  { id: 'variable', label: 'Variables', labelRu: 'Переменные' },
  { id: 'math', label: 'Math', labelRu: 'Математика' },
  { id: 'comparison', label: 'Comparison', labelRu: 'Сравнение' },
  { id: 'logic', label: 'Logic', labelRu: 'Логика' },
  { id: 'io', label: 'Input/Output', labelRu: 'Ввод/Вывод' },
  { id: 'other', label: 'Other', labelRu: 'Прочее' },
];

/** Создать новый узел по типу */
export function createNode(
  type: BlueprintNodeType,
  position: { x: number; y: number },
  id?: string
): BlueprintNode {
  const def = NODE_TYPE_DEFINITIONS[type];
  const nodeId = id ?? `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  return {
    id: nodeId,
    label: def.label,
    type,
    position,
    inputs: def.inputs.map((p, i) => ({
      ...p,
      id: `${nodeId}-${p.id}`,
      index: i,
      connected: false,
    })),
    outputs: def.outputs.map((p, i) => ({
      ...p,
      id: `${nodeId}-${p.id}`,
      index: i,
      connected: false,
    })),
  };
}

/** Создать связь между портами */
export function createEdge(
  sourceNode: string,
  sourcePort: string,
  targetNode: string,
  targetPort: string,
  dataType: PortDataType = 'execution'
): BlueprintEdge {
  return {
    id: `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    sourceNode,
    sourcePort,
    targetNode,
    targetPort,
    kind: dataType === 'execution' ? 'execution' : 'data',
    dataType,
  };
}

/** Создать граф по умолчанию */
export function createDefaultBlueprintState(): BlueprintGraphState {
  const startNode = createNode('Start', { x: 100, y: 200 }, 'node-start');
  const printNode = createNode('Print', { x: 400, y: 200 }, 'node-print');
  const endNode = createNode('End', { x: 700, y: 200 }, 'node-end');
  
  return {
    id: `graph-${Date.now()}`,
    name: 'Новый граф',
    language: 'cpp',
    displayLanguage: 'ru',
    nodes: [startNode, printNode, endNode],
    edges: [
      createEdge('node-start', 'node-start-exec-out', 'node-print', 'node-print-exec-in'),
      createEdge('node-print', 'node-print-exec-out', 'node-end', 'node-end-exec-in'),
    ],
    updatedAt: new Date().toISOString(),
    dirty: false,
  };
}

/** Преобразовать Blueprint формат обратно в старый GraphState (для совместимости) */
export function migrateFromBlueprintFormat(blueprintState: BlueprintGraphState): GraphState {
  const nodes: GraphNode[] = blueprintState.nodes.map(node => ({
    id: node.id,
    label: node.label,
    type: mapBlueprintNodeTypeToOld(node.type),
    position: node.position,
  }));

  const edges: GraphEdge[] = blueprintState.edges.map(edge => ({
    id: edge.id,
    source: edge.sourceNode,
    target: edge.targetNode,
    label: edge.kind === 'execution' ? 'flow' : 'data',
    kind: edge.kind,
  }));

  return {
    id: blueprintState.id,
    name: blueprintState.name,
    language: blueprintState.language,
    displayLanguage: blueprintState.displayLanguage,
    nodes,
    edges,
    updatedAt: blueprintState.updatedAt,
    dirty: blueprintState.dirty,
  };
}

function mapBlueprintNodeTypeToOld(type: BlueprintNodeType): GraphNode['type'] {
  // Маппинг расширенных типов на базовые
  const functionTypes: BlueprintNodeType[] = ['Function', 'FunctionCall', 'Event', 'FunctionEntry', 'FunctionReturn', 'CallUserFunction'];
  const variableTypes: BlueprintNodeType[] = ['Variable', 'GetVariable', 'SetVariable'];
  
  if (type === 'Start') return 'Start';
  if (type === 'End' || type === 'Return') return 'End';
  if (functionTypes.includes(type)) return 'Function';
  if (variableTypes.includes(type)) return 'Variable';
  return 'Custom';
}

// ============================================
// Утилиты для работы с пользовательскими функциями
// ============================================

/** Генерировать уникальный ID */
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/** Создать пустую пользовательскую функцию */
export function createUserFunction(
  name: string,
  nameRu: string,
  description?: string
): BlueprintFunction {
  const funcId = generateId('func');
  const entryNodeId = `${funcId}-entry`;
  const returnNodeId = `${funcId}-return`;
  
  // Создаём узел FunctionEntry
  const entryNode: BlueprintNode = {
    id: entryNodeId,
    label: `${name}`,
    type: 'FunctionEntry',
    position: { x: 100, y: 200 },
    inputs: [],
    outputs: [
      {
        id: `${entryNodeId}-exec-out`,
        name: '',
        dataType: 'execution',
        direction: 'output',
        index: 0,
        connected: false,
      }
    ],
    properties: {
      functionId: funcId,
    },
  };
  
  // Создаём узел FunctionReturn
  const returnNode: BlueprintNode = {
    id: returnNodeId,
    label: 'Return',
    type: 'FunctionReturn',
    position: { x: 500, y: 200 },
    inputs: [
      {
        id: `${returnNodeId}-exec-in`,
        name: '',
        dataType: 'execution',
        direction: 'input',
        index: 0,
        connected: false,
      }
    ],
    outputs: [],
    properties: {
      functionId: funcId,
    },
  };
  
  const now = new Date().toISOString();
  
  return {
    id: funcId,
    name,
    nameRu,
    description,
    parameters: [],
    graph: {
      nodes: [entryNode, returnNode],
      edges: [
        createEdge(entryNodeId, `${entryNodeId}-exec-out`, returnNodeId, `${returnNodeId}-exec-in`),
      ],
    },
    isPure: false,
    categoryColor: '#9C27B0',
    createdAt: now,
    updatedAt: now,
  };
}

/** Добавить входной параметр к функции */
export function addFunctionInputParameter(
  func: BlueprintFunction,
  name: string,
  nameRu: string,
  dataType: PortDataType,
  defaultValue?: string | number | boolean
): BlueprintFunction {
  const paramId = generateId('param');
  const newParam: FunctionParameter = {
    id: paramId,
    name,
    nameRu,
    dataType,
    direction: 'input',
    defaultValue,
  };
  
  // Добавляем параметр
  const newParameters = [...func.parameters, newParam];
  
  // Находим узел FunctionEntry и добавляем выходной порт
  const entryNode = func.graph.nodes.find(n => n.type === 'FunctionEntry');
  if (entryNode) {
    const portIndex = entryNode.outputs.length;
    entryNode.outputs.push({
      id: `${entryNode.id}-${paramId}`,
      name: nameRu || name,
      dataType,
      direction: 'output',
      index: portIndex,
      connected: false,
    });
  }
  
  return {
    ...func,
    parameters: newParameters,
    updatedAt: new Date().toISOString(),
  };
}

/** Добавить выходной параметр к функции */
export function addFunctionOutputParameter(
  func: BlueprintFunction,
  name: string,
  nameRu: string,
  dataType: PortDataType
): BlueprintFunction {
  const paramId = generateId('param');
  const newParam: FunctionParameter = {
    id: paramId,
    name,
    nameRu,
    dataType,
    direction: 'output',
  };
  
  // Добавляем параметр
  const newParameters = [...func.parameters, newParam];
  
  // Находим узел FunctionReturn и добавляем входной порт
  const returnNode = func.graph.nodes.find(n => n.type === 'FunctionReturn');
  if (returnNode) {
    const portIndex = returnNode.inputs.length;
    returnNode.inputs.push({
      id: `${returnNode.id}-${paramId}`,
      name: nameRu || name,
      dataType,
      direction: 'input',
      index: portIndex,
      connected: false,
    });
  }
  
  return {
    ...func,
    parameters: newParameters,
    updatedAt: new Date().toISOString(),
  };
}

/** Удалить параметр из функции */
export function removeFunctionParameter(
  func: BlueprintFunction,
  paramId: string
): BlueprintFunction {
  const param = func.parameters.find(p => p.id === paramId);
  if (!param) return func;
  
  const newParameters = func.parameters.filter(p => p.id !== paramId);
  
  // Удаляем соответствующий порт из узла
  const nodeType = param.direction === 'input' ? 'FunctionEntry' : 'FunctionReturn';
  const targetNode = func.graph.nodes.find(n => n.type === nodeType);
  
  if (targetNode) {
    if (param.direction === 'input') {
      targetNode.outputs = targetNode.outputs.filter(p => !p.id.includes(paramId));
      // Пересчитываем индексы
      targetNode.outputs.forEach((p, i) => { p.index = i; });
    } else {
      targetNode.inputs = targetNode.inputs.filter(p => !p.id.includes(paramId));
      targetNode.inputs.forEach((p, i) => { p.index = i; });
    }
    
    // Удаляем связи, которые использовали этот порт
    const updatedEdges = func.graph.edges.filter(e => {
      const portId = `${targetNode.id}-${paramId}`;
      return e.sourcePort !== portId && e.targetPort !== portId;
    });
    func.graph.edges = updatedEdges;
  }
  
  return {
    ...func,
    parameters: newParameters,
    updatedAt: new Date().toISOString(),
  };
}

/** Создать узел вызова пользовательской функции */
export function createCallUserFunctionNode(
  func: BlueprintFunction,
  position: { x: number; y: number }
): BlueprintNode {
  const nodeId = generateId('call');
  
  // Собираем входные порты (exec + input params)
  const inputs: NodePort[] = [
    {
      id: `${nodeId}-exec-in`,
      name: '',
      dataType: 'execution',
      direction: 'input',
      index: 0,
      connected: false,
    },
    ...func.parameters
      .filter(p => p.direction === 'input')
      .map((p, i) => ({
        id: `${nodeId}-${p.id}`,
        name: p.nameRu || p.name,
        dataType: p.dataType,
        direction: 'input' as const,
        index: i + 1,
        connected: false,
        defaultValue: p.defaultValue,
      })),
  ];
  
  // Собираем выходные порты (exec + output params)
  const outputs: NodePort[] = [
    {
      id: `${nodeId}-exec-out`,
      name: '',
      dataType: 'execution',
      direction: 'output',
      index: 0,
      connected: false,
    },
    ...func.parameters
      .filter(p => p.direction === 'output')
      .map((p, i) => ({
        id: `${nodeId}-${p.id}`,
        name: p.nameRu || p.name,
        dataType: p.dataType,
        direction: 'output' as const,
        index: i + 1,
        connected: false,
      })),
  ];
  
  return {
    id: nodeId,
    label: func.nameRu || func.name,
    type: 'CallUserFunction',
    position,
    inputs,
    outputs,
    properties: {
      functionId: func.id,
      functionName: func.name,
    },
  };
}

/** Обновить все узлы вызова функции при изменении её сигнатуры */
export function updateCallNodesForFunction(
  graphState: BlueprintGraphState,
  func: BlueprintFunction
): BlueprintGraphState {
  const updatedNodes = graphState.nodes.map(node => {
    if (node.type === 'CallUserFunction' && node.properties?.functionId === func.id) {
      // Пересоздаём узел с обновлённой сигнатурой
      const newNode = createCallUserFunctionNode(func, node.position);
      newNode.id = node.id; // Сохраняем тот же ID
      // Сохраняем подключения где возможно
      newNode.inputs.forEach(newPort => {
        const oldPort = node.inputs.find(p => p.name === newPort.name);
        if (oldPort) {
          newPort.connected = oldPort.connected;
          newPort.value = oldPort.value;
        }
      });
      newNode.outputs.forEach(newPort => {
        const oldPort = node.outputs.find(p => p.name === newPort.name);
        if (oldPort) {
          newPort.connected = oldPort.connected;
        }
      });
      return newNode;
    }
    return node;
  });
  
  return {
    ...graphState,
    nodes: updatedNodes,
  };
}

/** Получить функцию по ID */
export function getFunctionById(
  graphState: BlueprintGraphState,
  functionId: string
): BlueprintFunction | undefined {
  return graphState.functions?.find(f => f.id === functionId);
}

/** Получить текущий редактируемый граф (основной или функция) */
export function getActiveGraph(
  graphState: BlueprintGraphState
): { nodes: BlueprintNode[]; edges: BlueprintEdge[] } {
  if (graphState.activeFunctionId) {
    const func = getFunctionById(graphState, graphState.activeFunctionId);
    if (func) {
      return func.graph;
    }
  }
  return { nodes: graphState.nodes, edges: graphState.edges };
}

/** Установить активный граф (основной или функция) */
export function setActiveGraph(
  graphState: BlueprintGraphState,
  functionId: string | null
): BlueprintGraphState {
  return {
    ...graphState,
    activeFunctionId: functionId,
  };
}
