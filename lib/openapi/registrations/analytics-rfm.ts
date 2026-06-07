/**
 * Registration: GET /api/analytics/rfm
 *
 * Schema espejado desde app/api/analytics/rfm/route.ts
 * NO modificar el route.ts original — solo registrar aquí.
 */
import { z } from "zod";
import { registerEndpoint } from "../registry";
import { ErrorResponseSchema } from "../common";

// Espejo del querySchema del route
const RFMQuerySchema = z
  .object({
    days: z.string().optional().openapi({ example: "90", description: "Período en días (7-365, default: 90)" }),
  });

// NOTE: mirror of inline schema in route file
const RFMCustomerSchema = z
  .object({
    phone:       z.string(),
    name:        z.string(),
    recencyDays: z.number().int(),
    frequency:   z.number().int(),
    monetary:    z.number(),
    rScore:      z.number().int().min(1).max(3),
    fScore:      z.number().int().min(1).max(3),
    mScore:      z.number().int().min(1).max(3),
    segment:     z.enum(["Champions", "Loyal", "New", "AtRisk", "Lost", "Regular"]),
  })
  .openapi("RFMCustomer");

const RFMSegmentSchema = z
  .object({
    segment:       z.string(),
    count:         z.number().int(),
    avgMonetary:   z.number(),
    avgFrequency:  z.number(),
    color:         z.string().openapi({ example: "#00A0A0" }),
    action:        z.string().openapi({ example: "Recompensar lealtad, ofrecer exclusividades" }),
  })
  .openapi("RFMSegment");

const RFMResponseSchema = z
  .object({
    customers: z.array(RFMCustomerSchema),
    segments:  z.array(RFMSegmentSchema),
    total:     z.number().int(),
    message:   z.string().optional(),
  })
  .openapi("RFMResponse");

registerEndpoint({
  method:  "get",
  path:    "/analytics/rfm",
  summary: "Análisis RFM de clientes con segmentación percentil (Champions, Loyal, AtRisk…)",
  tags:    ["Analytics"],
  request: {
    query: RFMQuerySchema,
  },
  responses: {
    200: { description: "Clientes segmentados por RFM", schema: RFMResponseSchema },
    401: { description: "Requiere autenticación",        schema: ErrorResponseSchema },
    403: { description: "Rol insuficiente",              schema: ErrorResponseSchema },
    503: { description: "Error de base de datos",        schema: ErrorResponseSchema },
  },
  security: "bearer",
});
