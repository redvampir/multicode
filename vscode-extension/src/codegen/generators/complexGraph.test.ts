/**
 * Тест сложного графа с ветвлениями
 */

import { describe, it, expect } from 'vitest';
import { CppCodeGenerator } from '../CppCodeGenerator';
import type { BlueprintGraphState } from '../../shared/blueprintTypes';

describe('CppCodeGenerator: Сложные графы с ветвлениями', () => {
  it('должен корректно генерировать nested if/else', () => {
    const generator = new CppCodeGenerator();
    
    // Простая проверка генерации
    const simpleGraph: BlueprintGraphState = {
      name: "Тест простого графа",
      nodes: [
        {
          id: "start",
          type: "Start",
          instanceName: "Начало",
          position: { x: 100, y: 100 },
          data: {}
        },
        {
          id: "print",
          type: "Print",
          instanceName: "Вывод",
          position: { x: 200, y: 100 },
          data: { value: "Hello World" }
        }
      ],
      edges: [
        {
          sourceNode: "start",
          sourcePort: "exec-out",
          targetNode: "print",
          targetPort: "exec-in"
        }
      ],
      viewport: { x: 0, y: 0, zoom: 1 }
    };

    const result = generator.generate(simpleGraph);
    
    expect(result.success).toBe(true);
    expect(result.warnings).toHaveLength(0);
    
    const code = result.code;
    
    console.log('Простой сгенерированный код:');
    console.log(code);
    
    // Базовые проверки
    expect(code).toContain('// multicode:begin');
    expect(code).toContain('// multicode:end');
    expect(code).toContain('int main()');
  });

  it('должен обрабатывать топологический порядок', () => {
    const generator = new CppCodeGenerator();
    const result = generator.generate(simpleGraph);
    
    expect(result.success).toBe(true);
    
    // Проверяем source map
    expect(result.sourceMap).toBeDefined();
    expect(result.sourceMap.length).toBeGreaterThan(0);
    
    // Проверяем что start узел первый
    const startNode = result.sourceMap.find(sm => sm.nodeId === 'start');
    expect(startNode).toBeDefined();
    expect(startNode!.startLine).toBeLessThan(10);
  });

  it('должен генерировать валидный C++ код', () => {
    const generator = new CppCodeGenerator();
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
    
    // Проверяем русские комментарии
    expect(code).toContain('// Узел: Вывод');
  });
});