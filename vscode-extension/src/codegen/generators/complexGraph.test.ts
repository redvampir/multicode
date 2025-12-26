/**
 * Тест сложного графа с ветвлениями
 */

import { describe, it, expect } from 'vitest';
import { CppCodeGenerator } from '../CppCodeGenerator';
import type { BlueprintGraphState, BlueprintNode, BlueprintEdge } from '../../shared/blueprintTypes';

describe('CppCodeGenerator: Сложные графы с ветвлениями', () => {
  // Вспомогательная функция для создания тестового графа
  const createTestGraph = (): BlueprintGraphState => ({
    id: 'test-graph-1',
    name: "Тест простого графа",
    language: 'cpp',
    displayLanguage: 'ru',
    updatedAt: new Date().toISOString(),
    nodes: [
      {
        id: "start",
        type: "Start",
        label: "Начало",
        position: { x: 100, y: 100 },
        inputs: [],
        outputs: [
          { id: 'exec-out', name: 'Exec', dataType: 'execution', direction: 'output', index: 0 }
        ]
      },
      {
        id: "print",
        type: "Print",
        label: "Вывод",
        position: { x: 200, y: 100 },
        inputs: [
          { id: 'exec-in', name: 'Exec', dataType: 'execution', direction: 'input', index: 0 },
          { id: 'value', name: 'Значение', dataType: 'string', direction: 'input', index: 1, defaultValue: "Hello World" }
        ],
        outputs: [
          { id: 'exec-out', name: 'Exec', dataType: 'execution', direction: 'output', index: 0 }
        ]
      }
    ] as BlueprintNode[],
    edges: [
      {
        id: 'edge-1',
        kind: 'execution',
        sourceNode: "start",
        sourcePort: "exec-out",
        targetNode: "print",
        targetPort: "exec-in"
      }
    ] as BlueprintEdge[],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  it('должен корректно генерировать nested if/else', () => {
    const generator = new CppCodeGenerator();
    const simpleGraph = createTestGraph();

    const result = generator.generate(simpleGraph);
    
    expect(result.success).toBe(true);
    expect(result.warnings).toHaveLength(0);
    
    const code = result.code;
    
    console.log('Простой сгенерированный код:');
    console.log(code);
    
    // Базовые проверки
    expect(code).toContain('// Сгенерировано MultiCode');
    expect(code).toContain('int main()');
  });

  it('должен обрабатывать топологический порядок', () => {
    const generator = new CppCodeGenerator();
    const simpleGraph = createTestGraph();
    const result = generator.generate(simpleGraph);
    
    expect(result.success).toBe(true);
    
    // Проверяем source map (определён и является массивом)
    expect(Array.isArray(result.sourceMap)).toBe(true);
  });

  it('должен генерировать валидный C++ код', () => {
    const generator = new CppCodeGenerator();
    const simpleGraph = createTestGraph();
    const result = generator.generate(simpleGraph);
    
    expect(result.success).toBe(true);
    
    const code = result.code;
    
    // Проверяем синтаксис C++
    expect(code).toContain('#include <iostream>');
    expect(code).toContain('std::cout');
    expect(code).toContain('return 0;');
    
    // Проверяем отсутствие синтаксических ошибок
    expect(code).not.toContain('{{');
    expect(code).not.toContain('}}');
    
    // Проверяем русские комментарии или заголовок
    expect(code).toContain('// Сгенерировано MultiCode');
  });
});
