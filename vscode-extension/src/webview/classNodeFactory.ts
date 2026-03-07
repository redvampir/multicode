import {
  createNode,
  type BlueprintClass,
  type BlueprintEdge,
  type BlueprintGraphState,
  type BlueprintNode,
  type GraphDisplayLanguage,
  type NodePort,
} from '../shared/blueprintTypes';
import type { PortDataType } from '../shared/portTypes';

export type ClassNodeInsertRequest =
  | { kind: 'constructor'; classId: string }
  | { kind: 'constructor-overload'; classId: string; methodId: string }
  | { kind: 'method'; classId: string; methodId: string }
  | { kind: 'static-method'; classId: string; methodId: string }
  | { kind: 'call-base-method'; classId: string; methodId: string; baseClassName?: string }
  | { kind: 'get-member'; classId: string; memberId: string }
  | { kind: 'set-member'; classId: string; memberId: string }
  | { kind: 'static-get-member'; classId: string; memberId: string }
  | { kind: 'static-set-member'; classId: string; memberId: string }
  | { kind: 'cast-static'; classId: string }
  | { kind: 'cast-dynamic'; classId: string }
  | { kind: 'cast-const'; classId: string }
  | { kind: 'is-type'; classId: string }
  | { kind: 'make-unique'; classId: string; methodId?: string }
  | { kind: 'make-shared'; classId: string; methodId?: string }
  | { kind: 'delete-object'; classId: string }
  | { kind: 'address-of-member'; classId: string; memberId: string }
  | { kind: 'init-list-ctor'; classId: string; methodId?: string };

export const CLASS_NODE_DRAG_MIME = 'application/multicode-class-node';

const CLASS_NODE_TYPES = new Set<BlueprintNode['type']>([
  'ClassConstructorCall',
  'ConstructorOverloadCall',
  'ClassMethodCall',
  'StaticMethodCall',
  'CallBaseMethod',
  'GetMember',
  'SetMember',
  'StaticGetMember',
  'StaticSetMember',
  'CastStatic',
  'CastDynamic',
  'CastConst',
  'IsType',
  'MakeUnique',
  'MakeShared',
  'DeleteObject',
  'AddressOfMember',
  'InitListCtor',
]);

const makePort = (
  nodeId: string,
  localId: string,
  name: string,
  nameRu: string,
  dataType: PortDataType,
  direction: NodePort['direction'],
  index: number,
  metadata?: Pick<NodePort, 'typeName' | 'classId' | 'targetClassId'>
): NodePort => ({
  id: `${nodeId}-${localId}`,
  name,
  nameRu,
  dataType,
  direction,
  index,
  connected: false,
  typeName: metadata?.typeName,
  classId: metadata?.classId,
  targetClassId: metadata?.targetClassId,
});

const classDisplayName = (classItem: BlueprintClass, displayLanguage: GraphDisplayLanguage): string =>
  displayLanguage === 'ru'
    ? classItem.nameRu?.trim() || classItem.name
    : classItem.name;

const fullClassTypeName = (classItem: BlueprintClass): string =>
  classItem.namespace && classItem.namespace.trim().length > 0
    ? `${classItem.namespace.trim()}::${classItem.name}`
    : classItem.name;

const fullPointerTypeName = (classItem: BlueprintClass): string =>
  `${fullClassTypeName(classItem)}*`;

const resolveBaseClassName = (
  classItem: BlueprintClass,
  preferredBaseClassName?: string
): string | null => {
  const trimmedPreferred = preferredBaseClassName?.trim();
  if (trimmedPreferred) {
    return trimmedPreferred;
  }
  const baseClassName = classItem.baseClasses?.find((item) => item.trim().length > 0);
  return baseClassName?.trim() ?? null;
};

const resolveConstructorMethod = (
  classItem: BlueprintClass,
  methodId?: string
) => {
  if (methodId) {
    const selectedMethod = classItem.methods.find((item) => item.id === methodId);
    if ((selectedMethod?.methodKind ?? 'method') === 'constructor') {
      return selectedMethod;
    }
  }
  return classItem.methods.find((item) => (item.methodKind ?? 'method') === 'constructor') ?? null;
};

const buildMethodArgumentPorts = (
  nodeId: string,
  method: BlueprintClass['methods'][number],
  startIndex: number
): NodePort[] =>
  method.params.map((param, index) =>
    makePort(
      nodeId,
      `arg-${param.id}`,
      param.name,
      param.nameRu?.trim() || param.name,
      param.dataType,
      'input',
      startIndex + index,
      {
        typeName: param.typeName,
      },
    ));

const buildInitListMemberPorts = (
  nodeId: string,
  classItem: BlueprintClass
): NodePort[] =>
  classItem.members.map((member, index) =>
    makePort(
      nodeId,
      `init-member-${member.id}`,
      member.name,
      member.nameRu?.trim() || member.name,
      member.dataType,
      'input',
      index,
      {
        typeName: member.typeName,
      },
    ));

const stripBrokenState = (properties: Record<string, unknown> | undefined): Record<string, unknown> => {
  if (!properties) {
    return {};
  }
  const next = { ...properties };
  delete next.broken;
  delete next.brokenReason;
  return next;
};

const markBrokenNode = (
  node: BlueprintNode,
  reasonRu: string,
  reasonEn: string,
  displayLanguage: GraphDisplayLanguage
): BlueprintNode => {
  const reason = displayLanguage === 'ru' ? reasonRu : reasonEn;
  return {
    ...node,
    properties: {
      ...(node.properties ?? {}),
      broken: true,
      brokenReason: reason,
    },
  };
};

export const serializeClassNodeDragPayload = (request: ClassNodeInsertRequest): string =>
  JSON.stringify(request);

export const deserializeClassNodeDragPayload = (value: string): ClassNodeInsertRequest | null => {
  if (!value || value.trim().length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as ClassNodeInsertRequest;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    if (typeof parsed.kind !== 'string' || typeof (parsed as { classId?: unknown }).classId !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const localPortId = (nodeId: string, fullPortId: string): string => {
  const prefix = `${nodeId}-`;
  if (fullPortId.startsWith(prefix)) {
    return fullPortId.slice(prefix.length);
  }
  return fullPortId;
};

const buildClassConstructorNode = (
  classItem: BlueprintClass,
  position: { x: number; y: number },
  displayLanguage: GraphDisplayLanguage,
  nodeId?: string
): BlueprintNode => {
  const baseNode = createNode('ClassConstructorCall', position, nodeId);
  const classLabel = classDisplayName(classItem, displayLanguage);
  const typeName = fullClassTypeName(classItem);
  return {
    ...baseNode,
    label: displayLanguage === 'ru' ? `Создать ${classLabel}` : `Construct ${classItem.name}`,
    inputs: [
      makePort(baseNode.id, 'exec-in', '', '', 'execution', 'input', 0),
    ],
    outputs: [
      makePort(baseNode.id, 'exec-out', '', '', 'execution', 'output', 0),
      makePort(baseNode.id, 'instance', 'Instance', 'Экземпляр', 'class', 'output', 1, {
        classId: classItem.id,
        typeName,
        targetClassId: classItem.id,
      }),
    ],
    properties: {
      classId: classItem.id,
      targetClassName: classItem.name,
      targetClassNameRu: classItem.nameRu ?? classItem.name,
      targetClassTypeName: typeName,
      kind: 'class-constructor',
    },
  };
};

const buildConstructorOverloadNode = (
  classItem: BlueprintClass,
  methodId: string,
  position: { x: number; y: number },
  displayLanguage: GraphDisplayLanguage,
  nodeId?: string
): BlueprintNode | null => {
  const constructorMethod = classItem.methods.find((item) => item.id === methodId);
  if (!constructorMethod) {
    return null;
  }
  if ((constructorMethod.methodKind ?? 'method') !== 'constructor') {
    return null;
  }

  const baseNode = createNode('ConstructorOverloadCall', position, nodeId);
  const classLabel = classDisplayName(classItem, displayLanguage);
  const typeName = fullClassTypeName(classItem);
  const ctorLabel = displayLanguage === 'ru'
    ? constructorMethod.nameRu?.trim() || constructorMethod.name
    : constructorMethod.name;

  return {
    ...baseNode,
    label: displayLanguage === 'ru'
      ? `Создать ${classLabel}::${ctorLabel}`
      : `Construct ${classItem.name}::${constructorMethod.name}`,
    inputs: [
      makePort(baseNode.id, 'exec-in', '', '', 'execution', 'input', 0),
      ...constructorMethod.params.map((param, index) =>
        makePort(
          baseNode.id,
          `arg-${param.id}`,
          param.name,
          param.nameRu?.trim() || param.name,
          param.dataType,
          'input',
          index + 1,
          {
            typeName: param.typeName,
          }
        )),
    ],
    outputs: [
      makePort(baseNode.id, 'exec-out', '', '', 'execution', 'output', 0),
      makePort(baseNode.id, 'instance', 'Instance', 'Экземпляр', 'class', 'output', 1, {
        classId: classItem.id,
        typeName,
        targetClassId: classItem.id,
      }),
    ],
    properties: {
      classId: classItem.id,
      methodId: constructorMethod.id,
      targetClassName: classItem.name,
      targetClassNameRu: classItem.nameRu ?? classItem.name,
      targetMethodName: constructorMethod.name,
      targetMethodNameRu: constructorMethod.nameRu ?? constructorMethod.name,
      targetClassTypeName: typeName,
      kind: 'class-constructor-overload',
    },
  };
};

const buildClassMethodNode = (
  classItem: BlueprintClass,
  methodId: string,
  position: { x: number; y: number },
  displayLanguage: GraphDisplayLanguage,
  nodeId?: string
): BlueprintNode | null => {
  const method = classItem.methods.find((item) => item.id === methodId);
  if (!method) {
    return null;
  }
  const baseNode = createNode('ClassMethodCall', position, nodeId);
  const classLabel = classDisplayName(classItem, displayLanguage);
  const methodLabel = displayLanguage === 'ru' ? method.nameRu?.trim() || method.name : method.name;
  const qualifiedTypeName = fullClassTypeName(classItem);
  const inputs: NodePort[] = [
    makePort(baseNode.id, 'exec-in', '', '', 'execution', 'input', 0),
    makePort(baseNode.id, 'target', 'Target', 'Объект', 'class', 'input', 1, {
      classId: classItem.id,
      typeName: qualifiedTypeName,
      targetClassId: classItem.id,
    }),
    ...method.params.map((param, index) =>
      makePort(
        baseNode.id,
        `arg-${param.id}`,
        param.name,
        param.nameRu?.trim() || param.name,
        param.dataType,
        'input',
        index + 2,
        {
          typeName: param.typeName,
        },
      )),
  ];
  const outputs: NodePort[] = [
    makePort(baseNode.id, 'exec-out', '', '', 'execution', 'output', 0),
    makePort(baseNode.id, 'result', 'Result', 'Результат', method.returnType, 'output', 1, {
      typeName: method.returnTypeName,
    }),
  ];
  return {
    ...baseNode,
    label: `${classLabel}.${methodLabel}`,
    inputs,
    outputs,
    properties: {
      classId: classItem.id,
      methodId: method.id,
      targetClassName: classItem.name,
      targetClassNameRu: classItem.nameRu ?? classItem.name,
      targetMethodName: method.name,
      targetMethodNameRu: method.nameRu ?? method.name,
      kind: 'class-method',
    },
  };
};

const buildStaticMethodNode = (
  classItem: BlueprintClass,
  methodId: string,
  position: { x: number; y: number },
  displayLanguage: GraphDisplayLanguage,
  nodeId?: string
): BlueprintNode | null => {
  const method = classItem.methods.find((item) => item.id === methodId);
  if (!method) {
    return null;
  }
  const baseNode = createNode('StaticMethodCall', position, nodeId);
  const classLabel = classDisplayName(classItem, displayLanguage);
  const methodLabel = displayLanguage === 'ru' ? method.nameRu?.trim() || method.name : method.name;
  const inputs: NodePort[] = [
    makePort(baseNode.id, 'exec-in', '', '', 'execution', 'input', 0),
    ...method.params.map((param, index) =>
      makePort(
        baseNode.id,
        `arg-${param.id}`,
        param.name,
        param.nameRu?.trim() || param.name,
        param.dataType,
        'input',
        index + 1,
        {
          typeName: param.typeName,
        },
      )),
  ];
  const outputs: NodePort[] = [
    makePort(baseNode.id, 'exec-out', '', '', 'execution', 'output', 0),
    makePort(baseNode.id, 'result', 'Result', 'Результат', method.returnType, 'output', 1, {
      typeName: method.returnTypeName,
    }),
  ];
  return {
    ...baseNode,
    label: `${classLabel}::${methodLabel}`,
    inputs,
    outputs,
    properties: {
      classId: classItem.id,
      methodId: method.id,
      targetClassName: classItem.name,
      targetMethodName: method.name,
      targetMethodNameRu: method.nameRu ?? method.name,
      kind: 'class-static-method',
    },
  };
};

const buildCallBaseMethodNode = (
  classItem: BlueprintClass,
  methodId: string,
  baseClassName: string | undefined,
  position: { x: number; y: number },
  displayLanguage: GraphDisplayLanguage,
  nodeId?: string
): BlueprintNode | null => {
  const method = classItem.methods.find((item) => item.id === methodId);
  const resolvedBaseClassName = resolveBaseClassName(classItem, baseClassName);
  if (!method || !resolvedBaseClassName) {
    return null;
  }
  if ((method.methodKind ?? 'method') !== 'method' || method.isStatic === true) {
    return null;
  }
  const baseNode = createNode('CallBaseMethod', position, nodeId);
  const classLabel = classDisplayName(classItem, displayLanguage);
  const methodLabel = displayLanguage === 'ru' ? method.nameRu?.trim() || method.name : method.name;
  const inputs: NodePort[] = [
    makePort(baseNode.id, 'exec-in', '', '', 'execution', 'input', 0),
    makePort(baseNode.id, 'target', 'Target', 'Объект', 'class', 'input', 1, {
      classId: classItem.id,
      typeName: fullClassTypeName(classItem),
      targetClassId: classItem.id,
    }),
    ...buildMethodArgumentPorts(baseNode.id, method, 2),
  ];
  const outputs: NodePort[] = [
    makePort(baseNode.id, 'exec-out', '', '', 'execution', 'output', 0),
    makePort(baseNode.id, 'result', 'Result', 'Результат', method.returnType, 'output', 1, {
      typeName: method.returnTypeName,
    }),
  ];
  return {
    ...baseNode,
    label: displayLanguage === 'ru'
      ? `${classLabel}.${methodLabel} через ${resolvedBaseClassName}`
      : `${classItem.name}.${method.name} via ${resolvedBaseClassName}`,
    inputs,
    outputs,
    properties: {
      classId: classItem.id,
      methodId: method.id,
      baseClassName: resolvedBaseClassName,
      targetClassName: classItem.name,
      targetClassNameRu: classItem.nameRu ?? classItem.name,
      targetMethodName: method.name,
      targetMethodNameRu: method.nameRu ?? method.name,
      kind: 'class-call-base-method',
    },
  };
};

const buildGetMemberNode = (
  classItem: BlueprintClass,
  memberId: string,
  position: { x: number; y: number },
  displayLanguage: GraphDisplayLanguage,
  nodeId?: string
): BlueprintNode | null => {
  const member = classItem.members.find((item) => item.id === memberId);
  if (!member) {
    return null;
  }
  const baseNode = createNode('GetMember', position, nodeId);
  const classLabel = classDisplayName(classItem, displayLanguage);
  const memberLabel = displayLanguage === 'ru' ? member.nameRu?.trim() || member.name : member.name;
  const qualifiedTypeName = fullClassTypeName(classItem);
  return {
    ...baseNode,
    label: displayLanguage === 'ru' ? `${classLabel}.${memberLabel}` : `${classItem.name}.${member.name}`,
    inputs: [
      makePort(baseNode.id, 'target', 'Target', 'Объект', 'class', 'input', 0, {
        classId: classItem.id,
        typeName: qualifiedTypeName,
        targetClassId: classItem.id,
      }),
    ],
    outputs: [
      makePort(baseNode.id, 'value', member.name, member.nameRu ?? member.name, member.dataType, 'output', 0, {
        typeName: member.typeName,
      }),
    ],
    properties: {
      classId: classItem.id,
      memberId: member.id,
      targetClassName: classItem.name,
      targetMemberName: member.name,
      targetMemberNameRu: member.nameRu ?? member.name,
      kind: 'class-get-member',
    },
  };
};

const buildSetMemberNode = (
  classItem: BlueprintClass,
  memberId: string,
  position: { x: number; y: number },
  displayLanguage: GraphDisplayLanguage,
  nodeId?: string
): BlueprintNode | null => {
  const member = classItem.members.find((item) => item.id === memberId);
  if (!member) {
    return null;
  }
  const baseNode = createNode('SetMember', position, nodeId);
  const classLabel = classDisplayName(classItem, displayLanguage);
  const memberLabel = displayLanguage === 'ru' ? member.nameRu?.trim() || member.name : member.name;
  const qualifiedTypeName = fullClassTypeName(classItem);
  return {
    ...baseNode,
    label: displayLanguage === 'ru' ? `${classLabel}.${memberLabel} =` : `${classItem.name}.${member.name} =`,
    inputs: [
      makePort(baseNode.id, 'exec-in', '', '', 'execution', 'input', 0),
      makePort(baseNode.id, 'target', 'Target', 'Объект', 'class', 'input', 1, {
        classId: classItem.id,
        typeName: qualifiedTypeName,
        targetClassId: classItem.id,
      }),
      makePort(baseNode.id, 'value', member.name, member.nameRu ?? member.name, member.dataType, 'input', 2, {
        typeName: member.typeName,
      }),
    ],
    outputs: [
      makePort(baseNode.id, 'exec-out', '', '', 'execution', 'output', 0),
      makePort(baseNode.id, 'value', member.name, member.nameRu ?? member.name, member.dataType, 'output', 1, {
        typeName: member.typeName,
      }),
    ],
    properties: {
      classId: classItem.id,
      memberId: member.id,
      targetClassName: classItem.name,
      targetMemberName: member.name,
      targetMemberNameRu: member.nameRu ?? member.name,
      kind: 'class-set-member',
    },
  };
};

const buildStaticGetMemberNode = (
  classItem: BlueprintClass,
  memberId: string,
  position: { x: number; y: number },
  displayLanguage: GraphDisplayLanguage,
  nodeId?: string
): BlueprintNode | null => {
  const member = classItem.members.find((item) => item.id === memberId);
  if (!member) {
    return null;
  }
  const baseNode = createNode('StaticGetMember', position, nodeId);
  const classLabel = classDisplayName(classItem, displayLanguage);
  const memberLabel = displayLanguage === 'ru' ? member.nameRu?.trim() || member.name : member.name;
  return {
    ...baseNode,
    label: displayLanguage === 'ru' ? `${classLabel}::${memberLabel}` : `${classItem.name}::${member.name}`,
    inputs: [],
    outputs: [
      makePort(baseNode.id, 'value', member.name, member.nameRu ?? member.name, member.dataType, 'output', 0, {
        typeName: member.typeName,
      }),
    ],
    properties: {
      classId: classItem.id,
      memberId: member.id,
      targetClassName: classItem.name,
      targetClassNameRu: classItem.nameRu ?? classItem.name,
      targetMemberName: member.name,
      targetMemberNameRu: member.nameRu ?? member.name,
      kind: 'class-static-get-member',
    },
  };
};

const buildStaticSetMemberNode = (
  classItem: BlueprintClass,
  memberId: string,
  position: { x: number; y: number },
  displayLanguage: GraphDisplayLanguage,
  nodeId?: string
): BlueprintNode | null => {
  const member = classItem.members.find((item) => item.id === memberId);
  if (!member) {
    return null;
  }
  const baseNode = createNode('StaticSetMember', position, nodeId);
  const classLabel = classDisplayName(classItem, displayLanguage);
  const memberLabel = displayLanguage === 'ru' ? member.nameRu?.trim() || member.name : member.name;
  return {
    ...baseNode,
    label: displayLanguage === 'ru' ? `${classLabel}::${memberLabel} =` : `${classItem.name}::${member.name} =`,
    inputs: [
      makePort(baseNode.id, 'exec-in', '', '', 'execution', 'input', 0),
      makePort(baseNode.id, 'value', member.name, member.nameRu ?? member.name, member.dataType, 'input', 1, {
        typeName: member.typeName,
      }),
    ],
    outputs: [
      makePort(baseNode.id, 'exec-out', '', '', 'execution', 'output', 0),
      makePort(baseNode.id, 'value', member.name, member.nameRu ?? member.name, member.dataType, 'output', 1, {
        typeName: member.typeName,
      }),
    ],
    properties: {
      classId: classItem.id,
      memberId: member.id,
      targetClassName: classItem.name,
      targetClassNameRu: classItem.nameRu ?? classItem.name,
      targetMemberName: member.name,
      targetMemberNameRu: member.nameRu ?? member.name,
      kind: 'class-static-set-member',
    },
  };
};

const buildPointerCastNode = (
  nodeType: 'CastStatic' | 'CastDynamic' | 'CastConst',
  classItem: BlueprintClass,
  position: { x: number; y: number },
  displayLanguage: GraphDisplayLanguage,
  nodeId?: string
): BlueprintNode => {
  const baseNode = createNode(nodeType, position, nodeId);
  const classLabel = classDisplayName(classItem, displayLanguage);
  const pointerTypeName = fullPointerTypeName(classItem);
  const labelPrefix = nodeType === 'CastStatic'
    ? 'static_cast'
    : nodeType === 'CastDynamic'
      ? 'dynamic_cast'
      : 'const_cast';
  return {
    ...baseNode,
    label: `${labelPrefix}<${classLabel}>`,
    inputs: [
      makePort(baseNode.id, 'value', 'Value', 'Значение', 'pointer', 'input', 0),
    ],
    outputs: [
      makePort(baseNode.id, 'result', 'Result', 'Результат', 'pointer', 'output', 0, {
        typeName: pointerTypeName,
        targetClassId: classItem.id,
      }),
    ],
    properties: {
      classId: classItem.id,
      targetClassName: classItem.name,
      targetClassNameRu: classItem.nameRu ?? classItem.name,
      targetClassTypeName: fullClassTypeName(classItem),
      targetPointerTypeName: pointerTypeName,
      kind: nodeType,
    },
  };
};

const buildIsTypeNode = (
  classItem: BlueprintClass,
  position: { x: number; y: number },
  displayLanguage: GraphDisplayLanguage,
  nodeId?: string
): BlueprintNode => {
  const baseNode = createNode('IsType', position, nodeId);
  const classLabel = classDisplayName(classItem, displayLanguage);
  return {
    ...baseNode,
    label: displayLanguage === 'ru' ? `Это ${classLabel}?` : `Is ${classItem.name}?`,
    inputs: [
      makePort(baseNode.id, 'value', 'Value', 'Значение', 'pointer', 'input', 0),
    ],
    outputs: [
      makePort(baseNode.id, 'result', 'Result', 'Результат', 'bool', 'output', 0),
    ],
    properties: {
      classId: classItem.id,
      targetClassName: classItem.name,
      targetClassNameRu: classItem.nameRu ?? classItem.name,
      targetClassTypeName: fullClassTypeName(classItem),
      targetPointerTypeName: fullPointerTypeName(classItem),
      kind: 'class-is-type',
    },
  };
};

const buildOwnershipFactoryNode = (
  nodeType: 'MakeUnique' | 'MakeShared',
  classItem: BlueprintClass,
  methodId: string | undefined,
  position: { x: number; y: number },
  displayLanguage: GraphDisplayLanguage,
  nodeId?: string
): BlueprintNode => {
  const constructorMethod = resolveConstructorMethod(classItem, methodId);
  const baseNode = createNode(nodeType, position, nodeId);
  const classLabel = classDisplayName(classItem, displayLanguage);
  const smartPointerTypeName = nodeType === 'MakeUnique'
    ? `std::unique_ptr<${fullClassTypeName(classItem)}>`
    : `std::shared_ptr<${fullClassTypeName(classItem)}>`;
  return {
    ...baseNode,
    label: nodeType === 'MakeUnique'
      ? (displayLanguage === 'ru' ? `unique_ptr ${classLabel}` : `make_unique ${classItem.name}`)
      : (displayLanguage === 'ru' ? `shared_ptr ${classLabel}` : `make_shared ${classItem.name}`),
    inputs: constructorMethod ? buildMethodArgumentPorts(baseNode.id, constructorMethod, 0) : [],
    outputs: [
      makePort(baseNode.id, 'result', 'Result', 'Результат', 'pointer', 'output', 0, {
        typeName: smartPointerTypeName,
        targetClassId: classItem.id,
      }),
    ],
    properties: {
      classId: classItem.id,
      methodId: constructorMethod?.id,
      targetClassName: classItem.name,
      targetClassNameRu: classItem.nameRu ?? classItem.name,
      targetClassTypeName: fullClassTypeName(classItem),
      smartPointerTypeName,
      kind: nodeType,
    },
  };
};

const buildDeleteObjectNode = (
  classItem: BlueprintClass,
  position: { x: number; y: number },
  displayLanguage: GraphDisplayLanguage,
  nodeId?: string
): BlueprintNode => {
  const baseNode = createNode('DeleteObject', position, nodeId);
  const classLabel = classDisplayName(classItem, displayLanguage);
  return {
    ...baseNode,
    label: displayLanguage === 'ru' ? `delete ${classLabel}` : `delete ${classItem.name}`,
    inputs: [
      makePort(baseNode.id, 'exec-in', '', '', 'execution', 'input', 0),
      makePort(baseNode.id, 'target', 'Target', 'Указатель', 'pointer', 'input', 1, {
        typeName: fullPointerTypeName(classItem),
        targetClassId: classItem.id,
      }),
    ],
    outputs: [
      makePort(baseNode.id, 'exec-out', '', '', 'execution', 'output', 0),
    ],
    properties: {
      classId: classItem.id,
      targetClassName: classItem.name,
      targetClassNameRu: classItem.nameRu ?? classItem.name,
      targetPointerTypeName: fullPointerTypeName(classItem),
      kind: 'class-delete-object',
    },
  };
};

const buildAddressOfMemberNode = (
  classItem: BlueprintClass,
  memberId: string,
  position: { x: number; y: number },
  displayLanguage: GraphDisplayLanguage,
  nodeId?: string
): BlueprintNode | null => {
  const member = classItem.members.find((item) => item.id === memberId);
  if (!member) {
    return null;
  }
  const baseNode = createNode('AddressOfMember', position, nodeId);
  const classLabel = classDisplayName(classItem, displayLanguage);
  const memberLabel = displayLanguage === 'ru' ? member.nameRu?.trim() || member.name : member.name;
  return {
    ...baseNode,
    label: member.isStatic === true
      ? `&${classLabel}::${memberLabel}`
      : `&${classLabel}.${memberLabel}`,
    inputs: member.isStatic === true
      ? []
      : [
          makePort(baseNode.id, 'target', 'Target', 'Объект', 'class', 'input', 0, {
            classId: classItem.id,
            typeName: fullClassTypeName(classItem),
            targetClassId: classItem.id,
          }),
        ],
    outputs: [
      makePort(baseNode.id, 'result', 'Result', 'Результат', 'pointer', 'output', 0, {
        typeName: member.typeName ? `${member.typeName}*` : undefined,
        targetClassId: classItem.id,
      }),
    ],
    properties: {
      classId: classItem.id,
      memberId: member.id,
      targetClassName: classItem.name,
      targetClassNameRu: classItem.nameRu ?? classItem.name,
      targetMemberName: member.name,
      targetMemberNameRu: member.nameRu ?? member.name,
      isStaticMember: member.isStatic === true,
      kind: 'class-address-of-member',
    },
  };
};

const buildInitListCtorNode = (
  classItem: BlueprintClass,
  methodId: string | undefined,
  position: { x: number; y: number },
  displayLanguage: GraphDisplayLanguage,
  nodeId?: string
): BlueprintNode => {
  const constructorMethod = resolveConstructorMethod(classItem, methodId);
  const baseNode = createNode('InitListCtor', position, nodeId);
  const classLabel = classDisplayName(classItem, displayLanguage);
  const typeName = fullClassTypeName(classItem);
  const inputPorts = constructorMethod
    ? buildMethodArgumentPorts(baseNode.id, constructorMethod, 0)
    : buildInitListMemberPorts(baseNode.id, classItem);
  return {
    ...baseNode,
    label: displayLanguage === 'ru' ? `${classLabel}{...}` : `${classItem.name}{...}`,
    inputs: inputPorts,
    outputs: [
      makePort(baseNode.id, 'instance', 'Instance', 'Экземпляр', 'class', 'output', 0, {
        classId: classItem.id,
        typeName,
        targetClassId: classItem.id,
      }),
    ],
    properties: {
      classId: classItem.id,
      methodId: constructorMethod?.id,
      initMode: constructorMethod ? 'constructor' : 'members',
      targetClassName: classItem.name,
      targetClassNameRu: classItem.nameRu ?? classItem.name,
      targetClassTypeName: typeName,
      kind: 'class-init-list-ctor',
    },
  };
};

export const createClassNodeFromInsertRequest = (
  classes: BlueprintClass[],
  request: ClassNodeInsertRequest,
  position: { x: number; y: number },
  displayLanguage: GraphDisplayLanguage,
  nodeId?: string
): BlueprintNode | null => {
  const classItem = classes.find((item) => item.id === request.classId);
  if (!classItem) {
    return null;
  }

  switch (request.kind) {
    case 'constructor':
      return buildClassConstructorNode(classItem, position, displayLanguage, nodeId);
    case 'constructor-overload':
      return buildConstructorOverloadNode(classItem, request.methodId, position, displayLanguage, nodeId);
    case 'method':
      return buildClassMethodNode(classItem, request.methodId, position, displayLanguage, nodeId);
    case 'static-method':
      return buildStaticMethodNode(classItem, request.methodId, position, displayLanguage, nodeId);
    case 'call-base-method':
      return buildCallBaseMethodNode(classItem, request.methodId, request.baseClassName, position, displayLanguage, nodeId);
    case 'get-member':
      return buildGetMemberNode(classItem, request.memberId, position, displayLanguage, nodeId);
    case 'set-member':
      return buildSetMemberNode(classItem, request.memberId, position, displayLanguage, nodeId);
    case 'static-get-member':
      return buildStaticGetMemberNode(classItem, request.memberId, position, displayLanguage, nodeId);
    case 'static-set-member':
      return buildStaticSetMemberNode(classItem, request.memberId, position, displayLanguage, nodeId);
    case 'cast-static':
      return buildPointerCastNode('CastStatic', classItem, position, displayLanguage, nodeId);
    case 'cast-dynamic':
      return buildPointerCastNode('CastDynamic', classItem, position, displayLanguage, nodeId);
    case 'cast-const':
      return buildPointerCastNode('CastConst', classItem, position, displayLanguage, nodeId);
    case 'is-type':
      return buildIsTypeNode(classItem, position, displayLanguage, nodeId);
    case 'make-unique':
      return buildOwnershipFactoryNode('MakeUnique', classItem, request.methodId, position, displayLanguage, nodeId);
    case 'make-shared':
      return buildOwnershipFactoryNode('MakeShared', classItem, request.methodId, position, displayLanguage, nodeId);
    case 'delete-object':
      return buildDeleteObjectNode(classItem, position, displayLanguage, nodeId);
    case 'address-of-member':
      return buildAddressOfMemberNode(classItem, request.memberId, position, displayLanguage, nodeId);
    case 'init-list-ctor':
      return buildInitListCtorNode(classItem, request.methodId, position, displayLanguage, nodeId);
    default:
      return null;
  }
};

const buildLegacyArgAliasMap = (classItem: BlueprintClass, node: BlueprintNode): Map<string, string> => {
  const aliasMap = new Map<string, string>();
  const props = (node.properties ?? {}) as Record<string, unknown>;
  const methodId = typeof props.methodId === 'string' ? props.methodId : '';
  const method = classItem.methods.find((item) => item.id === methodId);
  if (!method) {
    return aliasMap;
  }
  method.params.forEach((param, index) => {
    aliasMap.set(`arg-${index}`, `arg-${param.id}`);
  });
  return aliasMap;
};

const remapNodeEdgePorts = (
  nodeId: string,
  edges: BlueprintEdge[],
  oldToNewLocalPort: Map<string, string>
): { edges: BlueprintEdge[]; changed: boolean } => {
  let changed = false;
  const nextEdges = edges.map((edge) => {
    let nextEdge = edge;
    if (edge.sourceNode === nodeId) {
      const sourceLocal = localPortId(nodeId, edge.sourcePort);
      const mapped = oldToNewLocalPort.get(sourceLocal);
      if (mapped && mapped !== sourceLocal) {
        nextEdge = {
          ...nextEdge,
          sourcePort: `${nodeId}-${mapped}`,
        };
        changed = true;
      }
    }
    if (edge.targetNode === nodeId) {
      const targetLocal = localPortId(nodeId, edge.targetPort);
      const mapped = oldToNewLocalPort.get(targetLocal);
      if (mapped && mapped !== targetLocal) {
        nextEdge = {
          ...nextEdge,
          targetPort: `${nodeId}-${mapped}`,
        };
        changed = true;
      }
    }
    return nextEdge;
  });
  return { edges: nextEdges, changed };
};

const copyPortRuntimeState = (
  nodeId: string,
  oldPorts: NodePort[],
  newPorts: NodePort[],
  legacyAlias: Map<string, string>
): { ports: NodePort[]; changed: boolean; oldToNewLocal: Map<string, string> } => {
  const oldByLocal = new Map<string, NodePort>();
  oldPorts.forEach((port) => {
    oldByLocal.set(localPortId(nodeId, port.id), port);
  });

  const oldToNewLocal = new Map<string, string>();
  newPorts.forEach((port) => {
    const currentLocal = localPortId(nodeId, port.id);
    oldToNewLocal.set(currentLocal, currentLocal);
  });
  legacyAlias.forEach((nextLocal, oldLocal) => {
    oldToNewLocal.set(oldLocal, nextLocal);
  });

  let changed = false;
  const ports = newPorts.map((port) => {
    const currentLocal = localPortId(nodeId, port.id);
    const oldLocalCandidates = [currentLocal];
    for (const [legacyLocal, mappedLocal] of legacyAlias.entries()) {
      if (mappedLocal === currentLocal) {
        oldLocalCandidates.push(legacyLocal);
      }
    }
    const oldPort = oldLocalCandidates
      .map((candidate) => oldByLocal.get(candidate))
      .find((item): item is NodePort => Boolean(item));
    if (!oldPort) {
      changed = true;
      return port;
    }
    if (port.connected !== oldPort.connected || port.value !== oldPort.value) {
      changed = true;
    }
    return {
      ...port,
      connected: oldPort.connected,
      value: oldPort.value,
    };
  });
  return { ports, changed, oldToNewLocal };
};

export interface RebindClassNodesResult {
  nodes: BlueprintNode[];
  edges: BlueprintEdge[];
  changed: boolean;
  brokenNodeIds: string[];
}

export const rebindClassNodesInGraphData = (
  nodes: BlueprintNode[],
  edges: BlueprintEdge[],
  classes: BlueprintClass[],
  displayLanguage: GraphDisplayLanguage
): RebindClassNodesResult => {
  let changed = false;
  let nextEdges = edges;
  const brokenNodeIds: string[] = [];

  const nextNodes = nodes.map((node) => {
    if (!CLASS_NODE_TYPES.has(node.type)) {
      return node;
    }
    const props = (node.properties ?? {}) as Record<string, unknown>;
    const classId = typeof props.classId === 'string' ? props.classId : '';
    const classItem = classes.find((item) => item.id === classId);
    if (!classItem) {
      changed = true;
      brokenNodeIds.push(node.id);
      return markBrokenNode(
        node,
        `Класс не найден: ${classId || 'unknown'}`,
        `Class not found: ${classId || 'unknown'}`,
        displayLanguage
      );
    }

    let rebuiltNode: BlueprintNode | null = null;
    const insertRequest: ClassNodeInsertRequest | null = (() => {
      switch (node.type) {
        case 'ClassConstructorCall':
          return { kind: 'constructor', classId };
        case 'ConstructorOverloadCall':
          if (typeof props.methodId === 'string' && props.methodId.trim().length > 0) {
            return { kind: 'constructor-overload', classId, methodId: props.methodId };
          }
          return null;
        case 'ClassMethodCall':
          if (typeof props.methodId === 'string' && props.methodId.trim().length > 0) {
            return { kind: 'method', classId, methodId: props.methodId };
          }
          return null;
        case 'StaticMethodCall':
          if (typeof props.methodId === 'string' && props.methodId.trim().length > 0) {
            return { kind: 'static-method', classId, methodId: props.methodId };
          }
          return null;
        case 'CallBaseMethod':
          if (typeof props.methodId === 'string' && props.methodId.trim().length > 0) {
            return {
              kind: 'call-base-method',
              classId,
              methodId: props.methodId,
              baseClassName: typeof props.baseClassName === 'string' ? props.baseClassName : undefined,
            };
          }
          return null;
        case 'GetMember':
          if (typeof props.memberId === 'string' && props.memberId.trim().length > 0) {
            return { kind: 'get-member', classId, memberId: props.memberId };
          }
          return null;
        case 'SetMember':
          if (typeof props.memberId === 'string' && props.memberId.trim().length > 0) {
            return { kind: 'set-member', classId, memberId: props.memberId };
          }
          return null;
        case 'StaticGetMember':
          if (typeof props.memberId === 'string' && props.memberId.trim().length > 0) {
            return { kind: 'static-get-member', classId, memberId: props.memberId };
          }
          return null;
        case 'StaticSetMember':
          if (typeof props.memberId === 'string' && props.memberId.trim().length > 0) {
            return { kind: 'static-set-member', classId, memberId: props.memberId };
          }
          return null;
        case 'CastStatic':
          return { kind: 'cast-static', classId };
        case 'CastDynamic':
          return { kind: 'cast-dynamic', classId };
        case 'CastConst':
          return { kind: 'cast-const', classId };
        case 'IsType':
          return { kind: 'is-type', classId };
        case 'MakeUnique':
          return {
            kind: 'make-unique',
            classId,
            methodId: typeof props.methodId === 'string' ? props.methodId : undefined,
          };
        case 'MakeShared':
          return {
            kind: 'make-shared',
            classId,
            methodId: typeof props.methodId === 'string' ? props.methodId : undefined,
          };
        case 'DeleteObject':
          return { kind: 'delete-object', classId };
        case 'AddressOfMember':
          if (typeof props.memberId === 'string' && props.memberId.trim().length > 0) {
            return { kind: 'address-of-member', classId, memberId: props.memberId };
          }
          return null;
        case 'InitListCtor':
          return {
            kind: 'init-list-ctor',
            classId,
            methodId: typeof props.methodId === 'string' ? props.methodId : undefined,
          };
        default:
          return null;
      }
    })();

    if (!insertRequest) {
      changed = true;
      brokenNodeIds.push(node.id);
      return markBrokenNode(
        node,
        'Узел класса не настроен: отсутствуют classId/memberId/methodId.',
        'Class node is not configured: missing classId/memberId/methodId.',
        displayLanguage
      );
    }

    rebuiltNode = createClassNodeFromInsertRequest(classes, insertRequest, node.position, displayLanguage, node.id);
    if (!rebuiltNode) {
      changed = true;
      brokenNodeIds.push(node.id);
      return markBrokenNode(
        node,
        'Связанный элемент класса не найден, проверьте методы/поля.',
        'Bound class entity is not found, verify methods/members.',
        displayLanguage
      );
    }

    const legacyAlias =
      node.type === 'ClassMethodCall' ||
      node.type === 'StaticMethodCall' ||
      node.type === 'ConstructorOverloadCall' ||
      node.type === 'CallBaseMethod' ||
      node.type === 'MakeUnique' ||
      node.type === 'MakeShared' ||
      node.type === 'InitListCtor'
        ? buildLegacyArgAliasMap(classItem, node)
        : new Map<string, string>();
    const inputState = copyPortRuntimeState(node.id, node.inputs, rebuiltNode.inputs, legacyAlias);
    const outputState = copyPortRuntimeState(node.id, node.outputs, rebuiltNode.outputs, legacyAlias);
    const remappedEdges = remapNodeEdgePorts(node.id, nextEdges, inputState.oldToNewLocal);
    const remappedEdgesByOutput = remapNodeEdgePorts(node.id, remappedEdges.edges, outputState.oldToNewLocal);
    nextEdges = remappedEdgesByOutput.edges;

    const nextNode: BlueprintNode = {
      ...rebuiltNode,
      comment: node.comment,
      size: node.size,
      customLabel: node.customLabel,
      properties: {
        ...stripBrokenState(node.properties as Record<string, unknown> | undefined),
        ...(rebuiltNode.properties ?? {}),
      },
      inputs: inputState.ports,
      outputs: outputState.ports,
    };

    if (
      inputState.changed ||
      outputState.changed ||
      remappedEdges.changed ||
      remappedEdgesByOutput.changed ||
      nextNode.label !== node.label
    ) {
      changed = true;
    }

    return nextNode;
  });

  return { nodes: nextNodes, edges: nextEdges, changed, brokenNodeIds };
};

export const rebindClassNodesInBlueprintState = (
  graphState: BlueprintGraphState,
  classes: BlueprintClass[],
  displayLanguage: GraphDisplayLanguage
): { graph: BlueprintGraphState; changed: boolean; brokenNodeIds: string[] } => {
  const rootRebind = rebindClassNodesInGraphData(graphState.nodes, graphState.edges, classes, displayLanguage);
  let changed = rootRebind.changed;
  const brokenNodeIds = [...rootRebind.brokenNodeIds];

  const nextFunctions = (graphState.functions ?? []).map((func) => {
    const functionRebind = rebindClassNodesInGraphData(
      func.graph.nodes,
      func.graph.edges,
      classes,
      displayLanguage
    );
    if (functionRebind.changed) {
      changed = true;
      brokenNodeIds.push(...functionRebind.brokenNodeIds);
      return {
        ...func,
        graph: {
          ...func.graph,
          nodes: functionRebind.nodes,
          edges: functionRebind.edges,
        },
        updatedAt: new Date().toISOString(),
      };
    }
    return func;
  });

  if (!changed && classes === graphState.classes) {
    return { graph: graphState, changed: false, brokenNodeIds };
  }

  return {
    graph: {
      ...graphState,
      classes,
      nodes: rootRebind.nodes,
      edges: rootRebind.edges,
      functions: nextFunctions,
      updatedAt: new Date().toISOString(),
      dirty: true,
    },
    changed: true,
    brokenNodeIds,
  };
};

export const isClassNodeType = (type: BlueprintNode['type']): boolean => CLASS_NODE_TYPES.has(type);
