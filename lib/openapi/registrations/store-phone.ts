/**
 * Registration: GET /api/marketplace/stores/{slug}/phone
 *
 * Schema espejado desde app/api/marketplace/stores/[slug]/phone/route.ts
 * NOTE: mirror of inline schema in route file (sin Zod explícito en el route)
 * NO modificar el route.ts original — solo registrar aquí.
 */
import { z } from "zod";
import { registerEndpoint } from "../registry";
import { ErrorResponseSchema } from "../common";

// NOTE: mirror of inline schema in route file
const StorePhoneParamsSchema = z
  .object({
    slug: z.string().openapi({ example: "bodega-san-martin", description: "Slug de la tienda" }),
  });

const StorePhoneResponseSchema = z
  .object({
    phone: z.string().nullable().openapi({ example: "51987654321", description: "WhatsApp de la tienda. null si no configurado o tienda inactiva." }),
  })
  .openapi("StorePhoneResponse");

// Degradación elegante: siempre 200 incluso si tienda no existe
registerEndpoint({
  method:  "get",
  path:    "/marketplace/stores/{slug}/phone",
  summary: "Obtener número WhatsApp público de una tienda",
  tags:    ["Marketplace", "Stores"],
  request: {
    params: StorePhoneParamsSchema,
  },
  responses: {
    200: {
      description: "Número WhatsApp o null si no está configurado / tienda inactiva",
      schema:      StorePhoneResponseSchema,
    },
  },
  security: "none",
});
