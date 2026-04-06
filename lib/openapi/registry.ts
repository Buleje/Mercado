import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

export const registry = new OpenAPIRegistry();

/**
 * Registra un Zod schema en el registry de OpenAPI con el nombre dado.
 * Úsalo antes de referenciarlo en endpoints para que aparezca en #/components/schemas.
 */
export function registerSchema<T extends z.ZodTypeAny>(
  name: string,
  schema: T
): T {
  registry.register(name, schema);
  return schema;
}
