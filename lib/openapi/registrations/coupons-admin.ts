/**
 * Registration: GET + POST /api/marketplace/coupons
 *
 * Schema espejado desde app/api/marketplace/coupons/route.ts
 * NOTE: mirror of inline schema in route file
 * NO modificar el route.ts original — solo registrar aquí.
 */
import { z } from "zod";
import { registerEndpoint } from "../registry";
import { ErrorResponseSchema } from "../common";

// NOTE: mirror of CreateCouponSchema del route (sin .transform para OpenAPI)
const CreateCouponBodySchema = z
  .object({
    code:          z.string().min(3).max(30).openapi({ example: "VERANO20", description: "Se convierte a mayúsculas" }),
    description:   z.string().max(200).optional().openapi({ example: "20% descuento en verano" }),
    discountType:  z.enum(["percent", "fixed"]).openapi({ example: "percent" }),
    discountValue: z.number().positive().openapi({ example: 20 }),
    minPurchase:   z.number().min(0).optional().nullable().openapi({ example: 50 }),
    maxUses:       z.number().int().positive().optional().nullable().openapi({ example: 100 }),
    expiresAt:     z.string().datetime().optional().nullable().openapi({ example: "2026-12-31T23:59:59Z" }),
    storeId:       z.string().optional().nullable(),
  })
  .openapi("CreateCouponBody");

const CouponItemSchema = z
  .object({
    id:            z.number().int(),
    code:          z.string(),
    description:   z.string().nullable(),
    discountType:  z.enum(["percent", "fixed"]),
    discountValue: z.number(),
    minPurchase:   z.number().nullable(),
    maxUses:       z.number().int().nullable(),
    usedCount:     z.number().int(),
    expiresAt:     z.string().datetime().nullable(),
    isActive:      z.boolean(),
    storeId:       z.string().nullable(),
    createdAt:     z.string().datetime(),
  })
  .openapi("CouponItem");

const CouponListResponseSchema = z
  .object({
    data: z.array(CouponItemSchema),
  })
  .openapi("CouponListResponse");

const CouponCreatedResponseSchema = z
  .object({
    data: CouponItemSchema,
  })
  .openapi("CouponCreatedResponse");

const CouponQuerySchema = z
  .object({
    storeId: z.string().optional().openapi({ example: "store_abc123", description: "Filtrar por tienda específica" }),
  });

// GET — listar cupones del tenant
registerEndpoint({
  method:  "get",
  path:    "/marketplace/coupons",
  summary: "Listar cupones del tenant (admin/manager/cajero)",
  tags:    ["Admin", "Coupons"],
  request: {
    query: CouponQuerySchema,
  },
  responses: {
    200: { description: "Lista de cupones",      schema: CouponListResponseSchema },
    401: { description: "Requiere autenticación", schema: ErrorResponseSchema },
    403: { description: "Rol insuficiente",       schema: ErrorResponseSchema },
  },
  security: "bearer",
});

// POST — crear cupón
registerEndpoint({
  method:  "post",
  path:    "/marketplace/coupons",
  summary: "Crear cupón de descuento (admin/manager)",
  tags:    ["Admin", "Coupons"],
  request: {
    body: CreateCouponBodySchema,
  },
  responses: {
    201: { description: "Cupón creado",            schema: CouponCreatedResponseSchema },
    400: { description: "Datos inválidos",          schema: ErrorResponseSchema },
    401: { description: "Requiere autenticación",   schema: ErrorResponseSchema },
    403: { description: "Rol insuficiente",         schema: ErrorResponseSchema },
    404: { description: "Tienda no encontrada",     schema: ErrorResponseSchema },
    409: { description: "Código de cupón duplicado", schema: ErrorResponseSchema },
  },
  security: "bearer",
});
