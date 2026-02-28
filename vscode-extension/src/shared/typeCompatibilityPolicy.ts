import type { PortDataType } from './portTypeContract';

export const TYPE_COMPATIBILITY_POLICY_VERSION = '2.0.0';

export interface PortTypeCompatibilityDescriptor {
  dataType: PortDataType;
  typeName?: string;
  classId?: string;
  targetClassId?: string;
  /** Единый идентификатор конкретного типа порта (например UE class path) */
  typeId?: string;
  /** Версия policy, с которой был сериализован порт */
  compatibilityPolicyVersion?: string;
}

export interface TypeHierarchyRegistry {
  policyVersion: string;
  /** child -> parents */
  inheritance: Record<string, readonly string[]>;
}

export interface CompatibilityPolicyContext {
  hierarchy?: TypeHierarchyRegistry;
}

export type CompatibilityReasonCode =
  | 'ok'
  | 'base-type-mismatch'
  | 'type-id-missing'
  | 'unknown-type'
  | 'hierarchy-cycle'
  | 'hierarchy-invalid'
  | 'unsafe-downcast'
  | 'class-mismatch';

export interface TypeCompatibilityDiagnostic {
  code: CompatibilityReasonCode;
  messageRu: string;
  messageEn: string;
  details?: Record<string, string>;
}

export interface TypeCompatibilityResult {
  compatible: boolean;
  reason: CompatibilityReasonCode;
  diagnostic: TypeCompatibilityDiagnostic;
}

const OBJECT_REFERENCE_TYPES = new Set<PortDataType>(['pointer', 'class', 'object-reference']);

const normalizeTypeIdentity = (value: string | undefined): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const resolveTypeId = (port: PortTypeCompatibilityDescriptor): string | undefined =>
  normalizeTypeIdentity(port.typeId)
  ?? (port.dataType === 'class' ? normalizeTypeIdentity(port.classId) : undefined)
  ?? (port.dataType === 'pointer' || port.dataType === 'object-reference' ? normalizeTypeIdentity(port.targetClassId) : undefined)
  ?? normalizeTypeIdentity(port.typeName);

const directBaseCompatibility = (sourceType: PortDataType, targetType: PortDataType): boolean => {
  if (sourceType === 'execution' || targetType === 'execution') {
    return false;
  }

  if (sourceType === targetType) {
    return true;
  }

  if (sourceType === 'any' || targetType === 'any') {
    return true;
  }

  return OBJECT_REFERENCE_TYPES.has(sourceType) && OBJECT_REFERENCE_TYPES.has(targetType);
};

const makeDiagnostic = (
  code: CompatibilityReasonCode,
  messageRu: string,
  messageEn: string,
  details?: Record<string, string>
): TypeCompatibilityDiagnostic => ({ code, messageRu, messageEn, details });


const isReachable = (
  fromTypeId: string,
  toTypeId: string,
  inheritance: Record<string, readonly string[]>,
): boolean => {
  const stack = [fromTypeId];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === toTypeId) {
      return true;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    const parents = inheritance[current] ?? [];
    for (const parentTypeId of parents) {
      const normalized = normalizeTypeIdentity(parentTypeId);
      if (!normalized) {
        continue;
      }
      stack.push(normalized);
    }
  }
  return false;
};

const findHierarchyPath = (
  sourceTypeId: string,
  targetTypeId: string,
  inheritance: Record<string, readonly string[]>
): { path: string[] | null; cycleDetected: boolean; invalidGraph: boolean } => {
  const stack: string[] = [sourceTypeId];
  const visited = new Set<string>();
  const inPath = new Set<string>();
  const parent = new Map<string, string | null>([[sourceTypeId, null]]);
  let cycleDetected = false;
  let invalidGraph = false;

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    inPath.add(current);

    const parents = inheritance[current];
    if (!parents) {
      inPath.delete(current);
      continue;
    }

    for (const rawParent of parents) {
      const parentTypeId = normalizeTypeIdentity(rawParent);
      if (!parentTypeId) {
        invalidGraph = true;
        continue;
      }
      if (parentTypeId === current || inPath.has(parentTypeId)) {
        cycleDetected = true;
      }
      if (!parent.has(parentTypeId)) {
        parent.set(parentTypeId, current);
      }
      if (parentTypeId === targetTypeId) {
        const path = [targetTypeId];
        let cursor: string | null = current;
        while (cursor) {
          path.push(cursor);
          cursor = parent.get(cursor) ?? null;
        }
        const formsCycle = isReachable(targetTypeId, sourceTypeId, inheritance);
        return { path: path.reverse(), cycleDetected: cycleDetected || formsCycle, invalidGraph };
      }
      stack.push(parentTypeId);
    }

    inPath.delete(current);
  }

  return { path: null, cycleDetected, invalidGraph };
};

export const evaluateTypeCompatibility = (
  sourcePort: PortTypeCompatibilityDescriptor,
  targetPort: PortTypeCompatibilityDescriptor,
  context?: CompatibilityPolicyContext
): TypeCompatibilityResult => {
  if (!directBaseCompatibility(sourcePort.dataType, targetPort.dataType)) {
    return {
      compatible: false,
      reason: 'base-type-mismatch',
      diagnostic: makeDiagnostic(
        'base-type-mismatch',
        `Базовые типы несовместимы: ${sourcePort.dataType} → ${targetPort.dataType}`,
        `Base types are incompatible: ${sourcePort.dataType} -> ${targetPort.dataType}`,
      ),
    };
  }

  const involvesObjectReferences =
    OBJECT_REFERENCE_TYPES.has(sourcePort.dataType) || OBJECT_REFERENCE_TYPES.has(targetPort.dataType);

  if (!involvesObjectReferences) {
    return { compatible: true, reason: 'ok', diagnostic: makeDiagnostic('ok', 'Совместимо', 'Compatible') };
  }

  const sourceTypeId = resolveTypeId(sourcePort);
  const targetTypeId = resolveTypeId(targetPort);

  if (!sourceTypeId || !targetTypeId) {
    return {
      compatible: true,
      reason: 'type-id-missing',
      diagnostic: makeDiagnostic(
        'type-id-missing',
        'Отсутствует typeId у object-reference порта, применён fallback совместимости',
        'Object-reference typeId is missing, fallback compatibility applied'
      ),
    };
  }

  if (sourceTypeId === targetTypeId) {
    return { compatible: true, reason: 'ok', diagnostic: makeDiagnostic('ok', 'Совместимо', 'Compatible') };
  }

  const hierarchy = context?.hierarchy;
  if (!hierarchy) {
    return {
      compatible: false,
      reason: 'class-mismatch',
      diagnostic: makeDiagnostic(
        'class-mismatch',
        `Типы object-reference несовместимы: ${sourceTypeId} → ${targetTypeId}`,
        `Object-reference types are incompatible: ${sourceTypeId} -> ${targetTypeId}`,
        { sourceTypeId, targetTypeId }
      ),
    };
  }

  const sourceKnown = Object.prototype.hasOwnProperty.call(hierarchy.inheritance, sourceTypeId);
  const targetKnown = Object.prototype.hasOwnProperty.call(hierarchy.inheritance, targetTypeId);
  if (!sourceKnown || !targetKnown) {
    return {
      compatible: false,
      reason: 'unknown-type',
      diagnostic: makeDiagnostic(
        'unknown-type',
        `Тип не найден в реестре иерархии: ${!sourceKnown ? sourceTypeId : targetTypeId}`,
        `Type is missing in hierarchy registry: ${!sourceKnown ? sourceTypeId : targetTypeId}`,
        { sourceTypeId, targetTypeId, policyVersion: hierarchy.policyVersion }
      ),
    };
  }

  const traversal = findHierarchyPath(sourceTypeId, targetTypeId, hierarchy.inheritance);
  if (traversal.invalidGraph) {
    return {
      compatible: false,
      reason: 'hierarchy-invalid',
      diagnostic: makeDiagnostic(
        'hierarchy-invalid',
        'Иерархия типов повреждена: найдены пустые parent typeId',
        'Type hierarchy is invalid: empty parent typeId entries found',
        { policyVersion: hierarchy.policyVersion }
      ),
    };
  }

  if (traversal.cycleDetected) {
    return {
      compatible: false,
      reason: 'hierarchy-cycle',
      diagnostic: makeDiagnostic(
        'hierarchy-cycle',
        'Иерархия типов содержит цикл',
        'Type hierarchy contains a cycle',
        { policyVersion: hierarchy.policyVersion }
      ),
    };
  }

  if (!traversal.path) {
    return {
      compatible: false,
      reason: 'unsafe-downcast',
      diagnostic: makeDiagnostic(
        'unsafe-downcast',
        `Запрещён downcast: ${sourceTypeId} не наследуется от ${targetTypeId}`,
        `Downcast is not allowed: ${sourceTypeId} is not derived from ${targetTypeId}`,
        { sourceTypeId, targetTypeId, policyVersion: hierarchy.policyVersion }
      ),
    };
  }

  return {
    compatible: true,
    reason: 'ok',
    diagnostic: makeDiagnostic(
      'ok',
      `Совместимо по иерархии: ${traversal.path.join(' → ')}`,
      `Compatible by hierarchy: ${traversal.path.join(' -> ')}`,
      { sourceTypeId, targetTypeId, policyVersion: hierarchy.policyVersion }
    ),
  };
};

export const formatCompatibilityDiagnostic = (
  result: TypeCompatibilityResult,
  locale: 'ru' | 'en'
): string => (locale === 'ru' ? result.diagnostic.messageRu : result.diagnostic.messageEn);

export const canDirectlyConnectDataPortsByPolicy = (
  sourceType: PortDataType,
  targetType: PortDataType
): boolean => directBaseCompatibility(sourceType, targetType);
