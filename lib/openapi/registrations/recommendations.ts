/**
 * Registration: GET /api/marketplace/recommendations/for-me
 *
 * Schema espejado desde app/api/marketplace/recommendations/for-me/route.ts
 * NO modificar el route.ts original — solo registrar aquí.
 */
import { z } from "zod";
import { registerEndpoint } from "../registry";
import { ErrorResponseSchema } from "../common";

// Espejo del QuerySchema del route (sin .transform para que sea ZodObject puro)
const RecommendationsQuerySchema = z
  .object({
    limit: z.string().optional().openapi({ example: "5", description: "Máximo 20" }),
  });

const ProductRecommendationSchema = z
  .object({
    id:          z.number().int(),
    name:        z.string(),
    price:       z.number(),
    imageUrl:    z.string().nullable(),
    slug:        z.string().nullable(),
    storeSlug:   z.string(),
    similarity:  z.number(),
  })
  .openapi("ProductRecommendation");

const RecommendationsResponseSchema = z
  .object({
    products: z.array(ProductRecommendationSchema),
  })
  .openapi("RecommendationsResponse");

registerEndpoint({
  method:  "get",
  path:    "/marketplace/recommendations/for-me",
  summary: "Recomendaciones personalizadas para el customer autenticado",
  tags:    ["Marketplace", "Recommendations"],
  request: {
    query: RecommendationsQuerySchema,
  },
  responses: {
    200: { description: "Lista de productos recomendados", schema: RecommendationsResponseSchema },
    400: { description: "Parámetros inválidos",            schema: ErrorResponseSchema },
    401: { description: "Sesión de customer requerida",    schema: ErrorResponseSchema },
  },
  security: "bearer",
});
