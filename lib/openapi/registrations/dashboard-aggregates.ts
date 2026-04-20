/**
 * Registration: GET /api/admin/dashboard/aggregates
 *
 * Schema espejado desde app/api/admin/dashboard/aggregates/route.ts
 * NOTE: mirror of inline schema in route file (sin Zod en el route — devuelve shape directo)
 * NO modificar el route.ts original — solo registrar aquí.
 */
import { z } from "zod";
import { registerEndpoint } from "../registry";
import { ErrorResponseSchema } from "../common";

// NOTE: mirror of inline schema in route file
const DashboardAggregatesPeriodSchema = z
  .object({
    salesCount: z.number().int(),
    revenue:    z.number(),
  })
  .openapi("DashboardAggregatesPeriod");

const DashboardAggregatesResponseSchema = z
  .object({
    today: DashboardAggregatesPeriodSchema,
    week:  DashboardAggregatesPeriodSchema,
    activeCarts:   z.number().int().openapi({ description: "Pedidos en vuelo" }),
    lowStockCount: z.number().int().openapi({ description: "Productos en/bajo stockMin" }),
  })
  .openapi("DashboardAggregatesResponse");

registerEndpoint({
  method:  "get",
  path:    "/admin/dashboard/aggregates",
  summary: "KPIs pre-agregados del dashboard admin (hoy + semana + alertas)",
  tags:    ["Admin", "Dashboard"],
  responses: {
    200: { description: "Agregados del dashboard",   schema: DashboardAggregatesResponseSchema },
    401: { description: "Requiere autenticación",     schema: ErrorResponseSchema },
    403: { description: "Rol insuficiente",           schema: ErrorResponseSchema },
    500: { description: "Error de base de datos",     schema: ErrorResponseSchema },
  },
  security: "bearer",
});
