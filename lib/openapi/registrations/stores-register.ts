/**
 * Registration: POST /api/marketplace/stores/register
 *
 * Schema espejado desde app/api/marketplace/stores/register/route.ts
 * NO modificar el route.ts original — solo registrar aquí.
 */
import { z } from "zod";
import { registerEndpoint } from "../registry";
import { ErrorResponseSchema } from "../common";

// Espejo del BodySchema del route
const StoreRegisterBodySchema = z
  .object({
    name:        z.string().min(2).max(80).openapi({ example: "Bodega Las Flores" }),
    description: z.string().max(500).optional().openapi({ example: "Bodega familiar con productos frescos" }),
    logo:        z.string().url().optional(),
    banner:      z.string().url().optional(),
    category:    z.string().max(50).optional().openapi({ example: "abarrotes" }),
    zone:        z.string().max(80).optional().openapi({ example: "Pucallpa Centro" }),
    commission:  z.number().min(0).max(30).optional().openapi({ example: 10 }),
  })
  .openapi("StoreRegisterBody");

const StoreResponseSchema = z
  .object({
    data: z.object({
      id:          z.number().int(),
      slug:        z.string(),
      name:        z.string(),
      isPublished: z.boolean(),
      tenantId:    z.string(),
    }),
  })
  .openapi("StoreRegisterResponse");

registerEndpoint({
  method:  "post",
  path:    "/marketplace/stores/register",
  summary: "Registrar nueva tienda en el marketplace",
  tags:    ["Marketplace", "Stores"],
  request: {
    body: StoreRegisterBodySchema,
  },
  responses: {
    201: { description: "Tienda registrada (pendiente de aprobación)", schema: StoreResponseSchema },
    400: { description: "Datos inválidos",                             schema: ErrorResponseSchema },
    401: { description: "Requiere rol admin u owner",                  schema: ErrorResponseSchema },
    409: { description: "Tenant ya tiene tienda registrada",           schema: ErrorResponseSchema },
  },
  security: "bearer",
});
