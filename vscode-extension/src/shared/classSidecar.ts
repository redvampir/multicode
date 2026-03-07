import { z } from 'zod';
import { blueprintClassSchema } from './messages';

const CLASS_SIDECAR_SCHEMA_VERSION = 1;

export type BlueprintClassSidecar = z.infer<typeof blueprintClassSchema>;

const classSidecarSchema = z.object({
  schemaVersion: z.number().int().positive(),
  version: z.number().int().positive(),
  savedAt: z.string(),
  data: blueprintClassSchema,
});

export type SerializedClassSidecar = z.infer<typeof classSidecarSchema>;

export const serializeClassSidecar = (classItem: BlueprintClassSidecar): SerializedClassSidecar => ({
  schemaVersion: CLASS_SIDECAR_SCHEMA_VERSION,
  version: CLASS_SIDECAR_SCHEMA_VERSION,
  savedAt: new Date().toISOString(),
  data: classItem,
});

export const parseClassSidecar = (
  data: unknown
): ReturnType<typeof classSidecarSchema.safeParse> => classSidecarSchema.safeParse(data);

export const deserializeClassSidecar = (input: unknown): BlueprintClassSidecar => {
  const parsed = parseClassSidecar(input);
  if (parsed.success) {
    return parsed.data.data;
  }

  const legacy = blueprintClassSchema.safeParse(input);
  if (legacy.success) {
    return legacy.data;
  }

  throw new Error('Invalid class sidecar format');
};
