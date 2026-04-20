/**
 * Registration: GET /api/ai/status
 *
 * Schema espejado desde app/api/ai/status/route.ts
 * NOTE: mirror of inline schema in route file (sin Zod — devuelve shape directo)
 * NO modificar el route.ts original — solo registrar aquí.
 */
import { z } from "zod";
import { registerEndpoint } from "../registry";
import { ErrorResponseSchema } from "../common";

// NOTE: mirror of inline schema in route file
const AIProviderSchema = z
  .object({
    id:         z.string().openapi({ example: "openai" }),
    name:       z.string().openapi({ example: "OpenAI GPT-4" }),
    configured: z.boolean(),
  })
  .openapi("AIProvider");

const AIStatusResponseSchema = z
  .object({
    activeProvider:     z.string().nullable().openapi({ example: "openai", description: "ID del proveedor activo o null" }),
    activeProviderName: z.string().nullable().openapi({ example: "OpenAI GPT-4" }),
    hasAI:              z.boolean().openapi({ description: "true si algún proveedor está configurado" }),
    providers:          z.array(AIProviderSchema),
  })
  .openapi("AIStatusResponse");

// Endpoint público — no requiere auth
registerEndpoint({
  method:  "get",
  path:    "/ai/status",
  summary: "Proveedores de IA configurados (usado por LiveChatWidget)",
  tags:    ["AI"],
  responses: {
    200: { description: "Estado de los proveedores de IA", schema: AIStatusResponseSchema },
  },
  security: "none",
});
