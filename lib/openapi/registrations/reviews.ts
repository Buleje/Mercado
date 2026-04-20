/**
 * Registration: GET + POST /api/marketplace/reviews
 *
 * Schema espejado desde app/api/marketplace/reviews/route.ts
 * NO modificar el route.ts original — solo registrar aquí.
 */
import { z } from "zod";
import { registerEndpoint } from "../registry";
import { ErrorResponseSchema } from "../common";

// Espejo del CreateBody del route
const ReviewCreateBodySchema = z
  .object({
    storeSlug:      z.string().min(1).max(200).openapi({ example: "bodega-san-martin" }),
    productId:      z.number().int().positive().optional().openapi({ example: 42 }),
    orderId:        z.string().min(1).max(100).openapi({ example: "ord_abc123" }),
    name:           z.string().min(1).max(150).openapi({ example: "María García" }),
    phone:          z.string().min(6).max(20).openapi({ example: "51987654321" }),
    text:           z.string().min(1).max(2000).openapi({ example: "Excelente servicio y entrega rápida." }),
    rating:         z.number().int().min(1).max(5).openapi({ example: 5 }),
    qualityRating:  z.number().int().min(1).max(5).optional(),
    priceRating:    z.number().int().min(1).max(5).optional(),
    deliveryRating: z.number().int().min(1).max(5).optional(),
    photosJson:     z.string().max(2000).optional(),
  })
  .openapi("ReviewCreateBody");

const ReviewItemSchema = z
  .object({
    id:               z.number().int(),
    rating:           z.number().int(),
    text:             z.string(),
    name:             z.string(),
    verified:         z.boolean(),
    helpfulUpvotes:   z.number().int(),
    helpfulDownvotes: z.number().int(),
    adminReply:       z.string().nullable(),
    adminReplyDate:   z.string().datetime().nullable(),
    date:             z.string().datetime(),
    qualityRating:    z.number().int().nullable(),
    priceRating:      z.number().int().nullable(),
    deliveryRating:   z.number().int().nullable(),
  })
  .openapi("ReviewItem");

const ReviewCreatedSchema = z
  .object({
    data: z.object({
      id:        z.number().int(),
      rating:    z.number().int(),
      text:      z.string(),
      name:      z.string(),
      verified:  z.boolean(),
      status:    z.string(),
      storeName: z.string(),
      date:      z.string().datetime(),
    }),
  })
  .openapi("ReviewCreated");

const ReviewListResponseSchema = z
  .object({
    data:      z.array(ReviewItemSchema),
    aggregate: z.record(z.string(), z.unknown()),
  })
  .openapi("ReviewListResponse");

const ReviewQuerySchema = z
  .object({
    storeSlug:    z.string().openapi({ example: "bodega-san-martin" }),
    productId:    z.string().optional().openapi({ example: "42" }),
    limit:        z.string().optional().openapi({ example: "50" }),
    verifiedOnly: z.string().optional().openapi({ example: "true" }),
  });

// POST — crear review
registerEndpoint({
  method:  "post",
  path:    "/marketplace/reviews",
  summary: "Crear review verificada",
  tags:    ["Marketplace", "Reviews"],
  request: {
    body: ReviewCreateBodySchema,
  },
  responses: {
    201: { description: "Review creada exitosamente",    schema: ReviewCreatedSchema },
    400: { description: "Datos inválidos",               schema: ErrorResponseSchema },
    422: { description: "Validación de orden fallida",   schema: ErrorResponseSchema },
    503: { description: "Feature flag deshabilitado",    schema: ErrorResponseSchema },
  },
  security: "none",
});

// GET — listar reviews
registerEndpoint({
  method:  "get",
  path:    "/marketplace/reviews",
  summary: "Listar reviews aprobadas de una tienda",
  tags:    ["Marketplace", "Reviews"],
  request: {
    query: ReviewQuerySchema,
  },
  responses: {
    200: { description: "Lista de reviews",           schema: ReviewListResponseSchema },
    400: { description: "storeSlug requerido",        schema: ErrorResponseSchema },
    404: { description: "Tienda no disponible",       schema: ErrorResponseSchema },
    503: { description: "Feature flag deshabilitado", schema: ErrorResponseSchema },
  },
  security: "none",
});
