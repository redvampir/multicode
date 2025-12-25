/**
 * Blueprints-style типы данных для портов
 * Цветовая схема вдохновлена Unreal Engine Blueprints
 */

export type PortDataType =
  | 'execution'   // Поток выполнения (белый)
  | 'bool'        // Логический (красный)
  | 'int32'       // 32-бит целое (cyan)
  | 'int64'       // 64-бит целое (cyan)
  | 'float'       // Вещественное (зелёный)
  | 'double'      // Двойная точность (зелёный)
  | 'string'      // Строка (пурпурный/розовый)
  | 'vector'      // Вектор (жёлтый)
  | 'object'      // Объект/класс (синий)
  | 'array'       // Массив (оранжевый)
  | 'any';        // Wildcard (серый)

export type PortDirection = 'input' | 'output';

export interface PortDefinition {
  id: string;
  name: string;
  dataType: PortDataType;
  direction: PortDirection;
  /** Для сложных типов: "Vector<int>", "MyClass*" */
  typeName?: string;
  /** Значение по умолчанию (для input-портов) */
  defaultValue?: string | number | boolean;
  /** Порт можно скрыть (не показывать если не подключён) */
  hidden?: boolean;
}

/** Цветовая схема типов данных (Blueprints-style) */
export const PORT_TYPE_COLORS: Record<PortDataType, { main: string; light: string; dark: string }> = {
  execution: { main: '#FFFFFF', light: '#FFFFFF', dark: '#E0E0E0' },
  bool:      { main: '#E53935', light: '#EF5350', dark: '#C62828' },
  int32:     { main: '#00BCD4', light: '#26C6DA', dark: '#00ACC1' },
  int64:     { main: '#00838F', light: '#0097A7', dark: '#006064' },
  float:     { main: '#8BC34A', light: '#9CCC65', dark: '#7CB342' },
  double:    { main: '#689F38', light: '#7CB342', dark: '#558B2F' },
  string:    { main: '#E91E63', light: '#EC407A', dark: '#D81B60' },
  vector:    { main: '#FFC107', light: '#FFCA28', dark: '#FFB300' },
  object:    { main: '#2196F3', light: '#42A5F5', dark: '#1E88E5' },
  array:     { main: '#FF9800', light: '#FFA726', dark: '#FB8C00' },
  any:       { main: '#9E9E9E', light: '#BDBDBD', dark: '#757575' },
};

/** Иконки для типов (опционально, для UI) */
export const PORT_TYPE_ICONS: Record<PortDataType, string> = {
  execution: '▶',
  bool:      '◉',
  int32:     '#',
  int64:     '##',
  float:     '~',
  double:    '~~',
  string:    '"',
  vector:    '↗',
  object:    '◆',
  array:     '[]',
  any:       '*',
};

/** Проверка совместимости типов для соединения */
export function areTypesCompatible(from: PortDataType, to: PortDataType): boolean {
  // Одинаковые типы всегда совместимы
  if (from === to) return true;
  
  // Any совместим со всем (кроме execution)
  if ((from === 'any' || to === 'any') && from !== 'execution' && to !== 'execution') {
    return true;
  }
  
  // Execution только с execution
  if (from === 'execution' || to === 'execution') {
    return from === to;
  }
  
  // Неявные преобразования числовых типов
  const numericTypes: PortDataType[] = ['int32', 'int64', 'float', 'double'];
  if (numericTypes.includes(from) && numericTypes.includes(to)) {
    return true;
  }
  
  // Bool может конвертироваться в числа
  if (from === 'bool' && numericTypes.includes(to)) {
    return true;
  }
  
  // Всё может конвертироваться в string
  if (to === 'string') {
    return true;
  }
  
  return false;
}

/** Получить читаемое имя типа */
export function getTypeDisplayName(type: PortDataType): string {
  const names: Record<PortDataType, string> = {
    execution: 'Exec',
    bool:      'Boolean',
    int32:     'Integer',
    int64:     'Integer64',
    float:     'Float',
    double:    'Double',
    string:    'String',
    vector:    'Vector',
    object:    'Object',
    array:     'Array',
    any:       'Wildcard',
  };
  return names[type];
}
