import { describe, expect, it } from 'vitest';
import type { GraphState } from './graphState';
import { migrateFromBlueprintFormat, migrateToBlueprintFormat } from './blueprintTypes';
import {
  injectOrReplaceMulticodeGraphSnapshot,
  removeMulticodeGraphSnapshot,
  tryExtractMulticodeGraphSnapshot,
} from './graphSnapshot';

const makeGraphState = (): GraphState => ({
  id: 'graph-test',
  name: 'Snapshot Test',
  language: 'cpp',
  displayLanguage: 'ru',
  nodes: [
    {
      id: 'node-start',
      label: 'Start',
      type: 'Start',
      blueprintNode: {
        id: 'node-start',
        label: 'Начало',
        type: 'Start',
        position: { x: 100, y: 100 },
        inputs: [],
        outputs: [{ id: 'node-start-exec-out', dataType: 'execution' }],
      },
    },
    {
      id: 'node-end',
      label: 'End',
      type: 'End',
      blueprintNode: {
        id: 'node-end',
        label: 'Конец',
        type: 'End',
        position: { x: 400, y: 100 },
        inputs: [{ id: 'node-end-exec-in', dataType: 'execution' }],
        outputs: [],
      },
    },
  ],
  edges: [
    {
      id: 'edge-1',
      source: 'node-start',
      target: 'node-end',
      kind: 'execution',
      blueprintEdge: {
        id: 'edge-1',
        sourceNode: 'node-start',
        sourcePort: 'node-start-exec-out',
        targetNode: 'node-end',
        targetPort: 'node-end-exec-in',
        kind: 'execution',
      },
    },
  ],
  updatedAt: '2026-02-23T00:00:00.000Z',
  dirty: true,
  variables: [],
  functions: [],
});

describe('graphSnapshot', () => {
  it('вставляет snapshot-блок после @multicode:graph', () => {
    const source = [
      '// Сгенерировано MultiCode',
      '// @multicode:graph id=graph-test file=.multicode/graph-test.multicode',
      '',
      '#include <iostream>',
      '',
      'int main() {',
      '    return 0;',
      '}',
      '',
    ].join('\n');

    const next = injectOrReplaceMulticodeGraphSnapshot(source, makeGraphState());
    const lines = next.split('\n');
    const graphLineIndex = lines.findIndex((line) => line.includes('@multicode:graph'));
    expect(graphLineIndex).toBeGreaterThanOrEqual(0);
    expect(lines[graphLineIndex + 1]).toContain('@multicode:snapshot begin');
    expect(next).toContain('@multicode:snapshot end');
  });

  it('вставляет snapshot-блок после блока @multicode:class', () => {
    const source = [
      '// @multicode:graph id=graph-test file=.multicode/graph-test.multicode',
      '// @multicode:class id=class-a file=.multicode/classes/class-a.multicode',
      '// @multicode:class id=class-b file=.multicode/classes/class-b.multicode',
      '',
      'int main() {',
      '    return 0;',
      '}',
      '',
    ].join('\n');

    const next = injectOrReplaceMulticodeGraphSnapshot(source, makeGraphState());
    const lines = next.split('\n');
    const graphLineIndex = lines.findIndex((line) => line.includes('@multicode:graph'));
    const classBIndex = lines.findIndex((line) => line.includes('@multicode:class id=class-b'));
    const snapshotBeginIndex = lines.findIndex((line) => line.includes('@multicode:snapshot begin'));

    expect(graphLineIndex).toBeGreaterThanOrEqual(0);
    expect(classBIndex).toBeGreaterThan(graphLineIndex);
    expect(snapshotBeginIndex).toBe(classBIndex + 1);
  });

  it('заменяет существующий snapshot-блок без дубликатов', () => {
    const sourceWithOldSnapshot = [
      '// @multicode:graph id=graph-test file=.multicode/graph-test.multicode',
      '// @multicode:snapshot begin format=graph-state-v1 encoding=base64',
      '// @multicode:snapshot chunk Zm9v',
      '// @multicode:snapshot end',
      '',
      'int main() {',
      '    return 0;',
      '}',
      '',
    ].join('\n');

    const next = injectOrReplaceMulticodeGraphSnapshot(sourceWithOldSnapshot, makeGraphState());
    const beginMatches = next.match(/@multicode:snapshot begin/g) ?? [];
    const endMatches = next.match(/@multicode:snapshot end/g) ?? [];
    expect(beginMatches).toHaveLength(1);
    expect(endMatches).toHaveLength(1);
  });

  it('восстанавливает GraphState из snapshot-блока', () => {
    const code = injectOrReplaceMulticodeGraphSnapshot(
      '// @multicode:graph id=graph-test file=.multicode/graph-test.multicode\n\nint main() { return 0; }\n',
      makeGraphState()
    );
    const restored = tryExtractMulticodeGraphSnapshot(code);
    expect(restored).not.toBeNull();
    expect(restored?.id).toBe('graph-test');
    expect(restored?.nodes.length).toBe(2);
    expect(restored?.dirty).toBe(false);
    expect(restored?.integrationBindings).toEqual([]);
    expect(restored?.symbolLocalization).toEqual({});
  });

  it('нормализует legacy snapshot v1 без новых полей', () => {
    const legacySerialized = {
      version: 1,
      savedAt: '2026-02-20T00:00:00.000Z',
      data: makeGraphState(),
    };
    const payload = Buffer.from(JSON.stringify(legacySerialized), 'utf8').toString('base64');
    const code = [
      '// @multicode:snapshot begin format=graph-state-v1 encoding=base64',
      `// @multicode:snapshot chunk ${payload}`,
      '// @multicode:snapshot end',
    ].join('\n');

    const restored = tryExtractMulticodeGraphSnapshot(code);
    expect(restored).not.toBeNull();
    expect(restored?.graphVersion).toBe(3);
    expect(restored?.integrationBindings).toEqual([]);
    expect(restored?.symbolLocalization).toEqual({});
  });


  it('сохраняет classes при round-trip Blueprint ↔ Classic', () => {
    const blueprint = migrateToBlueprintFormat(makeGraphState());
    blueprint.classes = [
      {
        id: 'class-player',
        name: 'Player',
        nameRu: 'Player',
        classType: 'class',
        namespace: undefined,
        baseClasses: [],
        headerIncludes: [],
        sourceIncludes: [],
        forwardDecls: [],
        members: [
          {
            id: 'member-health',
            name: 'health',
            nameRu: 'health',
            dataType: 'int32',
            typeName: undefined,
            isStatic: false,
            access: 'private',
            defaultValue: 100,
          },
        ],
        methods: [
          {
            id: 'method-attack',
            name: 'Attack',
            nameRu: 'Attack',
            methodKind: 'method',
            returnType: 'bool',
            returnTypeName: undefined,
            params: [
              {
                id: 'param-damage',
                name: 'damage',
                nameRu: 'damage',
                dataType: 'int32',
                typeName: undefined,
              },
            ],
            access: 'public',
            isConst: false,
            isStatic: false,
            isNoexcept: false,
            isPureVirtual: false,
            isVirtual: false,
            isOverride: false,
          },
        ],
      },
    ];

    const restored = migrateToBlueprintFormat(migrateFromBlueprintFormat(blueprint));

    expect(restored.classes).toEqual(blueprint.classes);
  });

  it('возвращает null для невалидного snapshot', () => {
    const code = [
      '// @multicode:snapshot begin format=graph-state-v1 encoding=base64',
      '// @multicode:snapshot chunk ###INVALID###',
      '// @multicode:snapshot end',
    ].join('\n');
    expect(tryExtractMulticodeGraphSnapshot(code)).toBeNull();
  });

  it('удаляет snapshot-блок полностью', () => {
    const source = [
      '// Сгенерировано MultiCode',
      '// @multicode:graph id=graph-test file=.multicode/graph-test.multicode',
      '// @multicode:snapshot begin format=graph-state-v1 encoding=base64',
      '// @multicode:snapshot chunk Zm9v',
      '// @multicode:snapshot end',
      '',
      '#include <iostream>',
      'int main() {',
      '    return 0;',
      '}',
      '',
    ].join('\n');

    const next = removeMulticodeGraphSnapshot(source);
    expect(next).not.toContain('@multicode:snapshot begin');
    expect(next).not.toContain('@multicode:snapshot chunk');
    expect(next).not.toContain('@multicode:snapshot end');
    expect(next).toContain('// @multicode:graph id=graph-test file=.multicode/graph-test.multicode');
  });

  it('после удаления snapshot код остаётся совместимым с повторной вставкой', () => {
    const withSnapshot = injectOrReplaceMulticodeGraphSnapshot(
      [
        '// @multicode:graph id=graph-test file=.multicode/graph-test.multicode',
        '',
        'int main() { return 0; }',
      ].join('\n'),
      makeGraphState()
    );

    const cleaned = removeMulticodeGraphSnapshot(withSnapshot);
    expect(cleaned).not.toContain('@multicode:snapshot begin');

    const reinserted = injectOrReplaceMulticodeGraphSnapshot(cleaned, makeGraphState());
    const beginMatches = reinserted.match(/@multicode:snapshot begin/g) ?? [];
    expect(beginMatches).toHaveLength(1);
  });
});
