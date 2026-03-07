import { describe, expect, it } from 'vitest';
import { createNode, type BlueprintClass, type BlueprintGraphState } from '../shared/blueprintTypes';
import {
  createClassNodeFromInsertRequest,
  rebindClassNodesInBlueprintState,
} from './classNodeFactory';

const createClassFixture = (): BlueprintClass => ({
  id: 'class-player',
  name: 'Player',
  nameRu: 'Игрок',
  members: [
    {
      id: 'member-score',
      name: 'score',
      nameRu: 'Очки',
      dataType: 'int32',
      access: 'private',
    },
    {
      id: 'member-total',
      name: 'total',
      nameRu: 'Итого',
      dataType: 'int32',
      access: 'public',
      isStatic: true,
    },
  ],
  methods: [
    {
      id: 'method-jump',
      name: 'Jump',
      nameRu: 'Прыжок',
      returnType: 'bool',
      params: [
        {
          id: 'param-height',
          name: 'height',
          nameRu: 'Высота',
          dataType: 'float',
        },
      ],
      access: 'public',
      isStatic: false,
      isConst: false,
      isVirtual: false,
      isOverride: false,
    },
    {
      id: 'ctor-with-name',
      name: 'Player',
      nameRu: 'Игрок',
      methodKind: 'constructor',
      returnType: 'execution',
      params: [
        {
          id: 'param-seed',
          name: 'seed',
          nameRu: 'Сид',
          dataType: 'int32',
        },
      ],
      access: 'public',
      isStatic: false,
      isConst: false,
      isVirtual: false,
      isOverride: false,
    },
    {
      id: 'method-make',
      name: 'Make',
      nameRu: 'Создать',
      returnType: 'class',
      params: [],
      access: 'public',
      isStatic: true,
      isConst: false,
      isVirtual: false,
      isOverride: false,
    },
  ],
});

describe('classNodeFactory', () => {
  it('creates constructor node with class binding metadata', () => {
    const classItem = createClassFixture();
    const node = createClassNodeFromInsertRequest(
      [classItem],
      { kind: 'constructor', classId: classItem.id },
      { x: 120, y: 80 },
      'ru'
    );

    expect(node).not.toBeNull();
    expect(node?.type).toBe('ClassConstructorCall');
    expect(node?.properties?.classId).toBe(classItem.id);
    expect(node?.outputs.some((port) => port.id.endsWith('-instance') && port.classId === classItem.id)).toBe(true);
  });

  it('creates method/static/get/set and constructor-overload nodes with expected ports', () => {
    const classItem = createClassFixture();

    const methodNode = createClassNodeFromInsertRequest(
      [classItem],
      { kind: 'method', classId: classItem.id, methodId: 'method-jump' },
      { x: 0, y: 0 },
      'ru'
    );
    expect(methodNode?.inputs.some((port) => port.id.endsWith('-arg-param-height'))).toBe(true);

    const staticNode = createClassNodeFromInsertRequest(
      [classItem],
      { kind: 'static-method', classId: classItem.id, methodId: 'method-make' },
      { x: 0, y: 0 },
      'en'
    );
    expect(staticNode?.type).toBe('StaticMethodCall');

    const getNode = createClassNodeFromInsertRequest(
      [classItem],
      { kind: 'get-member', classId: classItem.id, memberId: 'member-score' },
      { x: 0, y: 0 },
      'ru'
    );
    expect(getNode?.outputs.find((port) => port.id.endsWith('-value'))?.dataType).toBe('int32');

    const setNode = createClassNodeFromInsertRequest(
      [classItem],
      { kind: 'set-member', classId: classItem.id, memberId: 'member-score' },
      { x: 0, y: 0 },
      'ru'
    );
    expect(setNode?.inputs.find((port) => port.id.endsWith('-value'))?.dataType).toBe('int32');

    const staticGetNode = createClassNodeFromInsertRequest(
      [classItem],
      { kind: 'static-get-member', classId: classItem.id, memberId: 'member-total' },
      { x: 0, y: 0 },
      'ru'
    );
    expect(staticGetNode?.type).toBe('StaticGetMember');

    const staticSetNode = createClassNodeFromInsertRequest(
      [classItem],
      { kind: 'static-set-member', classId: classItem.id, memberId: 'member-total' },
      { x: 0, y: 0 },
      'ru'
    );
    expect(staticSetNode?.type).toBe('StaticSetMember');

    const ctorOverloadNode = createClassNodeFromInsertRequest(
      [classItem],
      { kind: 'constructor-overload', classId: classItem.id, methodId: 'ctor-with-name' },
      { x: 0, y: 0 },
      'ru'
    );
    expect(ctorOverloadNode?.type).toBe('ConstructorOverloadCall');
    expect(ctorOverloadNode?.inputs.some((port) => port.id.endsWith('-arg-param-seed'))).toBe(true);

    const baseMethodNode = createClassNodeFromInsertRequest(
      [{ ...classItem, baseClasses: ['ActorBase'] }],
      { kind: 'call-base-method', classId: classItem.id, methodId: 'method-jump', baseClassName: 'ActorBase' },
      { x: 0, y: 0 },
      'ru'
    );
    expect(baseMethodNode?.type).toBe('CallBaseMethod');
    expect(baseMethodNode?.properties?.baseClassName).toBe('ActorBase');

    const castNode = createClassNodeFromInsertRequest(
      [classItem],
      { kind: 'cast-dynamic', classId: classItem.id },
      { x: 0, y: 0 },
      'ru'
    );
    expect(castNode?.type).toBe('CastDynamic');

    const makeUniqueNode = createClassNodeFromInsertRequest(
      [classItem],
      { kind: 'make-unique', classId: classItem.id, methodId: 'ctor-with-name' },
      { x: 0, y: 0 },
      'ru'
    );
    expect(makeUniqueNode?.type).toBe('MakeUnique');
    expect(makeUniqueNode?.inputs.some((port) => port.id.endsWith('-arg-param-seed'))).toBe(true);

    const deleteNode = createClassNodeFromInsertRequest(
      [classItem],
      { kind: 'delete-object', classId: classItem.id },
      { x: 0, y: 0 },
      'ru'
    );
    expect(deleteNode?.type).toBe('DeleteObject');

    const addressNode = createClassNodeFromInsertRequest(
      [classItem],
      { kind: 'address-of-member', classId: classItem.id, memberId: 'member-score' },
      { x: 0, y: 0 },
      'ru'
    );
    expect(addressNode?.type).toBe('AddressOfMember');

    const initListNode = createClassNodeFromInsertRequest(
      [classItem],
      { kind: 'init-list-ctor', classId: classItem.id, methodId: 'ctor-with-name' },
      { x: 0, y: 0 },
      'ru'
    );
    expect(initListNode?.type).toBe('InitListCtor');
  });

  it('rebinds legacy arg-index ports to param-id ports and rewrites edge handles', () => {
    const classItem = createClassFixture();
    const oldMethodNode = createNode('ClassMethodCall', { x: 200, y: 100 }, 'call-1');
    oldMethodNode.properties = {
      classId: classItem.id,
      methodId: 'method-jump',
    };
    oldMethodNode.inputs = [
      { id: 'call-1-exec-in', name: '', dataType: 'execution', direction: 'input', index: 0, connected: true },
      { id: 'call-1-target', name: 'Target', dataType: 'class', direction: 'input', index: 1, connected: true },
      { id: 'call-1-arg-0', name: 'Arg 1', dataType: 'any', direction: 'input', index: 2, connected: true },
    ];

    const graph: BlueprintGraphState = {
      id: 'graph-rebind',
      name: 'Rebind',
      language: 'cpp',
      displayLanguage: 'ru',
      nodes: [oldMethodNode],
      edges: [
        {
          id: 'edge-arg',
          sourceNode: 'source-node',
          sourcePort: 'source-port',
          targetNode: 'call-1',
          targetPort: 'call-1-arg-0',
          kind: 'data',
          dataType: 'float',
        },
      ],
      classes: [classItem],
      updatedAt: new Date().toISOString(),
      functions: [],
      variables: [],
    };

    const result = rebindClassNodesInBlueprintState(graph, [classItem], 'ru');
    const reboundNode = result.graph.nodes[0];
    const reboundEdge = result.graph.edges[0];

    expect(reboundNode.inputs.some((port) => port.id.endsWith('-arg-param-height'))).toBe(true);
    expect(reboundEdge.targetPort).toBe('call-1-arg-param-height');
  });

  it('marks class nodes as broken when class binding is missing', () => {
    const node = createNode('ClassConstructorCall', { x: 0, y: 0 }, 'ctor-missing');
    node.properties = {
      classId: 'class-missing',
    };

    const graph: BlueprintGraphState = {
      id: 'graph-broken',
      name: 'Broken',
      language: 'cpp',
      displayLanguage: 'ru',
      nodes: [node],
      edges: [],
      classes: [],
      updatedAt: new Date().toISOString(),
      functions: [],
      variables: [],
    };

    const result = rebindClassNodesInBlueprintState(graph, [], 'ru');
    expect(result.changed).toBe(true);
    expect(result.brokenNodeIds).toContain('ctor-missing');
    expect((result.graph.nodes[0].properties as Record<string, unknown>)?.broken).toBe(true);
  });
});
