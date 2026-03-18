import type {
  BlueprintClass,
  BlueprintClassMethodKind,
  BlueprintClassAccess,
  BlueprintClassMember,
  BlueprintClassMethod,
  BlueprintClassMethodParameter,
  BlueprintGraphState,
  BlueprintVariableDefaultValue,
  UeMacroBinding,
} from '../../shared/blueprintTypes';
import { renderUeMacroString } from '../../shared/blueprintTypes';
import type { PortDataType } from '../../shared/portTypes';

export type CodegenTarget = 'cpp' | 'ue';

export interface UeClassMetadata {
  classMacro?: string;
  generatedBodyMacro?: string;
  propertyMacro?: string;
  functionMacro?: string;
}

export interface ClassIrUeExtension {
  ue?: UeClassMetadata;
}

export interface ClassModelParameter {
  id: string;
  name: string;
  nameRu?: string;
  dataType: PortDataType;
  typeName?: string;
}

export interface ClassModelField {
  id: string;
  name: string;
  nameRu?: string;
  dataType: PortDataType;
  typeName?: string;
  isStatic: boolean;
  access: BlueprintClassAccess;
  defaultValue?: BlueprintVariableDefaultValue;
  extensions?: ClassIrUeExtension;
}

export interface ClassModelMethod {
  id: string;
  name: string;
  nameRu?: string;
  methodKind: BlueprintClassMethodKind;
  isConst: boolean;
  isStatic: boolean;
  isNoexcept: boolean;
  isPureVirtual: boolean;
  returnType: PortDataType;
  returnTypeName?: string;
  params: ClassModelParameter[];
  access: BlueprintClassAccess;
  isVirtual: boolean;
  isOverride: boolean;
  extensions?: ClassIrUeExtension;
}

export interface ClassModel {
  id: string;
  name: string;
  nameRu?: string;
  classType: 'class' | 'struct';
  namespace?: string;
  baseClasses: string[];
  headerIncludes: string[];
  sourceIncludes: string[];
  forwardDecls: string[];
  fields: ClassModelField[];
  methods: ClassModelMethod[];
  extensions?: ClassIrUeExtension;
}

const mapParameter = (param: BlueprintClassMethodParameter): ClassModelParameter => ({
  id: param.id,
  name: param.name,
  nameRu: param.nameRu,
  dataType: param.dataType,
  typeName: param.typeName,
});

const mapField = (member: BlueprintClassMember): ClassModelField => ({
  id: member.id,
  name: member.name,
  nameRu: member.nameRu,
  dataType: member.dataType,
  typeName: member.typeName,
  isStatic: member.isStatic ?? false,
  access: member.access,
  defaultValue: member.defaultValue,
});

const mapMethod = (method: BlueprintClassMethod): ClassModelMethod => ({
  id: method.id,
  name: method.name,
  nameRu: method.nameRu,
  methodKind: method.methodKind ?? 'method',
  isConst: method.isConst ?? false,
  isStatic: method.isStatic ?? false,
  isNoexcept: method.isNoexcept ?? false,
  isPureVirtual: method.isPureVirtual ?? false,
  returnType: method.returnType,
  returnTypeName: method.returnTypeName,
  params: method.params.map(mapParameter),
  access: method.access,
  isVirtual: method.isVirtual ?? false,
  isOverride: method.isOverride ?? false,
});

const mapClass = (blueprintClass: BlueprintClass): ClassModel => ({
  id: blueprintClass.id,
  name: blueprintClass.name,
  nameRu: blueprintClass.nameRu,
  classType: blueprintClass.classType ?? 'class',
  namespace: blueprintClass.namespace,
  baseClasses: (blueprintClass.baseClasses ?? []).map((item) => item.trim()).filter((item) => item.length > 0),
  headerIncludes: (blueprintClass.headerIncludes ?? []).map((item) => item.trim()).filter((item) => item.length > 0),
  sourceIncludes: (blueprintClass.sourceIncludes ?? []).map((item) => item.trim()).filter((item) => item.length > 0),
  forwardDecls: (blueprintClass.forwardDecls ?? []).map((item) => item.trim()).filter((item) => item.length > 0),
  fields: blueprintClass.members.map(mapField),
  methods: blueprintClass.methods.map(mapMethod),
});

const withUeExtension = (classModel: ClassModel, macros: UeMacroBinding[]): ClassModel => {
  const classBinding = macros.find(m => m.targetId === classModel.id && m.macroType === 'UCLASS');
  const classMacro = classBinding ? renderUeMacroString(classBinding) : 'UCLASS(BlueprintType)';

  return {
    ...classModel,
    fields: classModel.fields.map((field) => {
      const fieldBinding = macros.find(m => m.targetId === field.id && m.macroType === 'UPROPERTY');
      const propertyMacro = fieldBinding
        ? renderUeMacroString(fieldBinding)
        : 'UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "MultiCode")';
      return {
        ...field,
        extensions: {
          ...field.extensions,
          ue: { propertyMacro },
        },
      };
    }),
    methods: classModel.methods.map((method) => {
      const methodBinding = macros.find(m => m.targetId === method.id && m.macroType === 'UFUNCTION');
      const functionMacro = methodBinding
        ? renderUeMacroString(methodBinding)
        : 'UFUNCTION(BlueprintCallable, Category = "MultiCode")';
      return {
        ...method,
        extensions: {
          ...method.extensions,
          ue: { functionMacro },
        },
      };
    }),
    extensions: {
      ...classModel.extensions,
      ue: {
        classMacro,
        generatedBodyMacro: 'GENERATED_BODY()',
      },
    },
  };
};

export const buildClassModelFromGraph = (
  graph: BlueprintGraphState,
  target: CodegenTarget
): ClassModel[] => {
  const sourceClasses: BlueprintClass[] = Array.isArray(graph.classes) ? graph.classes : [];
  const baseModels = sourceClasses.map(mapClass);

  if (target !== 'ue') {
    return baseModels;
  }

  const macros: UeMacroBinding[] = Array.isArray(graph.ueMacros) ? graph.ueMacros : [];
  return baseModels.map((model) => withUeExtension(model, macros));
};
