/**
 * Registration: GET + POST /api/marketplace/stores/{slug}/live-viewers
 *
 * Schema espejado desde app/api/marketplace/stores/[slug]/live-viewers/route.ts
 * NOTE: mirror of inline schema in route file (sin Zod explícito en el route)
 * NO modificar el route.ts original — solo registrar aquí.
 */
import { z } from "zod";
import { registerEndpoint } from "../registry";
import { ErrorResponseSchema } from "../common";

// NOTE: mirror of inline schema in route file
const LiveViewersParamsSchema = z
  .object({
    slug: z.string().openapi({ example: "bodega-san-martin", description: "Slug de la tienda" }),
  });

const LiveViewersResponseSchema = z
  .object({
    recentViewers: z.number().int().min(0).openapi({ example: 7 }),
  })
  .openapi("LiveViewersResponse");

const LiveViewersPostBodySchema = z
  .object({
    sessionId: z.string().optional().openapi({ example: "sess_abc123", description: "ID de sesión único del visitante" }),
  })
  .openapi("LiveViewersPostBody");

const LiveViewersPostResponseSchema = z
  .object({
    ok: z.boolean(),
  })
  .openapi("LiveViewersPostResponse");

// GET — leer conteo de visitantes activos
registerEndpoint({
  method:  "get",
  path:    "/marketplace/stores/{slug}/live-viewers",
  summary: "Obtener cantidad de visitantes activos en la última hora",
  tags:    ["Marketplace", "Stores"],
  request: {
    params: LiveViewersParamsSchema,
  },
  responses: {
    200: { description: "Conteo de visitantes recientes", schema: LiveViewersResponseSchema },
    400: { description: "Slug inválido",                  schema: ErrorResponseSchema },
  },
  security: "none",
});

// POST — registrar visita (fire-and-forget desde cliente)
registerEndpoint({
  method:  "post",
  path:    "/marketplace/stores/{slug}/live-viewers",
  summary: "Registrar visita a tienda (fire-and-forget)",
  tags:    ["Marketplace", "Stores"],
  request: {
    params: LiveViewersParamsSchema,
    body:   LiveViewersPostBodySchema,
  },
  responses: {
    200: { description: "Visita registrada o degradada silenciosamente", schema: LiveViewersPostResponseSchema },
    400: { description: "Slug inválido",                                 schema: ErrorResponseSchema },
  },
  security: "none",
});
