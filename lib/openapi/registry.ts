import { OpenAPIRegistry, extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { ErrorResponseSchema } from "./common";

extendZodWithOpenApi(z);

export const openapiRegistry = new OpenAPIRegistry();

// ── Security scheme ───────────────────────────────────────────────────────────
openapiRegistry.registerComponent("securitySchemes", "BearerAuth", {
  type:   "http",
  scheme: "bearer",
});

// ── registerEndpoint ──────────────────────────────────────────────────────────
// Wrapper amigable sobre registry.registerPath().
// Un dev nuevo solo necesita llamar esta función con su schema Zod.

export interface EndpointConfig {
  method:   "get" | "post" | "put" | "patch" | "delete";
  path:     string;
  summary:  string;
  tags?:    string[];
  request?: {
    body?:   z.ZodType;
    query?:  z.ZodObject<z.ZodRawShape>;
    params?: z.ZodObject<z.ZodRawShape>;
  };
  responses: Record<number, { description: string; schema?: z.ZodType }>;
  /** "bearer" = requiere Authorization header. "none" = endpoint público. */
  security?: "bearer" | "none";
}

export function registerEndpoint(config: EndpointConfig): void {
  const { method, path, summary, tags, request, responses, security = "none" } = config;

  // Build request object
  const reqBody = request?.body
    ? {
        body: {
          required: true,
          content:  { "application/json": { schema: request.body } },
        },
      }
    : {};

  const reqQuery  = request?.query  ? { query:  request.query  } : {};
  const reqParams = request?.params ? { params: request.params } : {};

  const requestObj =
    Object.keys({ ...reqBody, ...reqQuery, ...reqParams }).length > 0
      ? { ...reqBody, ...reqQuery, ...reqParams }
      : undefined;

  // Build responses — always inject 400 + 500 with ErrorResponseSchema
  const builtResponses: Record<
    string,
    { description: string; content?: Record<string, { schema: z.ZodType }> }
  > = {};

  for (const [code, resp] of Object.entries(responses)) {
    builtResponses[code] = {
      description: resp.description,
      ...(resp.schema
        ? { content: { "application/json": { schema: resp.schema } } }
        : {}),
    };
  }

  if (!builtResponses["400"]) {
    builtResponses["400"] = {
      description: "Datos inválidos",
      content:     { "application/json": { schema: ErrorResponseSchema } },
    };
  }
  if (!builtResponses["500"]) {
    builtResponses["500"] = {
      description: "Error interno del servidor",
      content:     { "application/json": { schema: ErrorResponseSchema } },
    };
  }
  if (security === "bearer" && !builtResponses["401"]) {
    builtResponses["401"] = {
      description: "No autenticado",
      content:     { "application/json": { schema: ErrorResponseSchema } },
    };
  }

  openapiRegistry.registerPath({
    method,
    path,
    summary,
    tags,
    ...(security === "bearer" ? { security: [{ BearerAuth: [] }] } : {}),
    ...(requestObj ? { request: requestObj } : {}),
    responses: builtResponses,
  });
}

// Legacy helper — mantiene compatibilidad con generator.ts anterior
export function registerSchema<T extends z.ZodTypeAny>(name: string, schema: T): T {
  openapiRegistry.register(name, schema);
  return schema;
}

// Re-export the old `registry` alias for backwards compat
export { openapiRegistry as registry };
