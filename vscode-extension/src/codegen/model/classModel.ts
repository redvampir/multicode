import type {
  BlueprintClass,
  BlueprintClassAccess,
  BlueprintClassMember,
  BlueprintClassMethod,
  BlueprintClassMethodParameter,
  BlueprintGraphState,
  BlueprintVariableDefaultValue,
} from '../../shared/blueprintTypes';
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
  dataType: PortDataType;
  typeName?: string;
}

export interface ClassModelField {
  id: string;
  name: string;
  dataType: PortDataType;
  typeName?: string;
  access: BlueprintClassAccess;
  defaultValue?: BlueprintVariableDefaultValue;
  extensions?: ClassIrUeExtension;
}

export interface ClassModelMethod {
  id: string;
  name: string;
  isConst: boolean;
  isStatic: boolean;
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
  namespace?: string;
  fields: ClassModelField[];
  methods: ClassModelMethod[];
  extensions?: ClassIrUeExtension;
}

const mapParameter = (param: BlueprintClassMethodParameter): ClassModelParameter => ({
  id: param.id,
  name: param.name,
  dataType: param.dataType,
  typeName: param.typeName,
});

const mapField = (member: BlueprintClassMember): ClassModelField => ({
  id: member.id,
  name: member.name,
  dataType: member.dataType,
  typeName: member.typeName,
  access: member.access,
  defaultValue: member.defaultValue,
});

const mapMethod = (method: BlueprintClassMethod): ClassModelMethod => ({
  id: method.id,
  name: method.name,
  isConst: method.isConst ?? false,
  isStatic: method.isStatic ?? false,
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
  namespace: blueprintClass.namespace,
  fields: blueprintClass.members.map(mapField),
  methods: blueprintClass.methods.map(mapMethod),
});

const withUeExtension = (classModel: ClassModel): ClassModel => ({
  ...classModel,
  fields: classModel.fields.map((field) => ({
    ...field,
    extensions: {
      ...field.extensions,
      ue: {
        propertyMacro: 'UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "MultiCode")',
      },
    },
  })),
  methods: classModel.methods.map((method) => ({
    ...method,
    extensions: {
      ...method.extensions,
      ue: {
        functionMacro: 'UFUNCTION(BlueprintCallable, Category = "MultiCode")',
      },
    },
  })),
  extensions: {
    ...classModel.extensions,
    ue: {
      classMacro: 'UCLASS(BlueprintType)',
      generatedBodyMacro: 'GENERATED_BODY()',
    },
  },
});

export const buildClassModelFromGraph = (
  graph: BlueprintGraphState,
  target: CodegenTarget
): ClassModel[] => {
  const sourceClasses: BlueprintClass[] = Array.isArray(graph.classes) ? graph.classes : [];
  const baseModels = sourceClasses.map(mapClass);

  if (target !== 'ue') {
    return baseModels;
  }

  return baseModels.map(withUeExtension);
};
