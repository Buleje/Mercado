/**
 * Registration: POST /api/marketplace/coupons/validate
 *
 * Schema espejado desde app/api/marketplace/coupons/validate/route.ts
 * NO modificar el route.ts original — solo registrar aquí.
 */
import { z } from "zod";
import { registerEndpoint } from "../registry";
import { ErrorResponseSchema } from "../common";

// Espejo del ValidateSchema del route
const CouponValidateBodySchema = z
  .object({
    code:      z.string().min(1).openapi({ example: "BIENVENIDO10" }),
    storeSlug: z.string().min(1).openapi({ example: "bodega-san-martin" }),
    cartTotal: z.number().positive().openapi({ example: 45.5 }),
  })
  .openapi("CouponValidateBody");

const CouponValidResponseSchema = z
  .object({
    valid:         z.literal(true),
    couponId:      z.number().int(),
    code:          z.string(),
    description:   z.string().nullable(),
    discountType:  z.enum(["percent", "fixed"]),
    discountValue: z.number(),
    discount:      z.number(),
  })
  .openapi("CouponValidResponse");

const CouponInvalidResponseSchema = z
  .object({
    valid:  z.literal(false),
    reason: z.string().openapi({ example: "Cupón expirado" }),
  })
  .openapi("CouponInvalidResponse");

registerEndpoint({
  method:  "post",
  path:    "/marketplace/coupons/validate",
  summary: "Validar cupón de descuento",
  tags:    ["Marketplace", "Coupons"],
  request: {
    body: CouponValidateBodySchema,
  },
  responses: {
    200: {
      description: "Resultado de validación (válido o inválido con razón)",
      schema:      z.union([CouponValidResponseSchema, CouponInvalidResponseSchema]),
    },
    400: {
      description: "Parámetros inválidos",
      schema:      ErrorResponseSchema,
    },
    404: {
      description: "Tienda no encontrada",
      schema:      ErrorResponseSchema,
    },
  },
  security: "none",
});
