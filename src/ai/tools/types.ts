import { z } from 'zod';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType<unknown>;
  execute: (
    userId: string,
    input: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
}

function readDef(schema: z.ZodType<unknown>): Record<string, unknown> | undefined {
  return (schema as unknown as Record<string, unknown>)._def as Record<string, unknown> | undefined;
}

function typeName(schema: z.ZodType<unknown>): string | undefined {
  const def = readDef(schema);
  return (def?.type ?? def?.typeName) as string | undefined;
}

function hasShape(schema: z.ZodType<unknown>): boolean {
  const def = readDef(schema);
  return typeof def?.shape === 'object' && def.shape !== null;
}

export function toJsonSchema(
  schema: z.ZodType<unknown>,
): Record<string, unknown> {
  const tName = typeName(schema);

  if (tName === 'ZodObject' || hasShape(schema)) {
    const def = readDef(schema);
    const shape = (def?.shape ?? {}) as Record<string, z.ZodType<unknown>>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = toJsonSchema(value);
      const childType = typeName(value);
      if (childType !== 'ZodOptional' && childType !== 'ZodDefault') {
        required.push(key);
      }
    }
    return { type: 'object', properties, required };
  }

  if (tName === 'ZodString') {
    const result: Record<string, unknown> = { type: 'string' };
    const schemaRecord = schema as unknown as Record<string, unknown>;
    const description = schemaRecord.description as string | undefined;
    if (description) result.description = description;
    return result;
  }

  if (tName === 'ZodNumber') {
    return { type: 'number' };
  }

  if (tName === 'ZodEnum') {
    const values = (schema as unknown as { values: Record<string, string> })
      .values;
    const enumValues = Object.values(values);
    return { type: 'string', enum: enumValues };
  }

  if (tName === 'ZodOptional') {
    const def = readDef(schema);
    const inner = def?.innerType as z.ZodType<unknown> | undefined;
    if (inner) return toJsonSchema(inner);
  }

  if (tName === 'ZodDefault') {
    const def = readDef(schema);
    const inner = def?.innerType as z.ZodType<unknown> | undefined;
    if (inner) return toJsonSchema(inner);
  }

  if (tName === 'ZodEffects') {
    const def = readDef(schema);
    const inner = def?.innerType as z.ZodType<unknown> | undefined;
    if (inner) return toJsonSchema(inner);
    const ref = def?.schema as z.ZodType<unknown> | undefined;
    if (ref) return toJsonSchema(ref);
  }

  return { type: 'string' };
}
