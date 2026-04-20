/**
 * Registration: GET /api/admin/stats
 *
 * Schema espejado desde app/api/admin/stats/route.ts
 * NOTE: mirror of inline schema in route file (sin Zod en el route — devuelve shape directo)
 * NO modificar el route.ts original — solo registrar aquí.
 */
import { z } from "zod";
import { registerEndpoint } from "../registry";
import { ErrorResponseSchema } from "../common";

// NOTE: mirror of inline schema in route file
const AdminStatsResponseSchema = z
  .object({
    pendingOrders:    z.number().int().openapi({ description: "Pedidos en estado pendiente" }),
    oldPendingOrders: z.number().int().openapi({ description: "Pedidos pendientes hace más de 30 min" }),
    todayOrders:      z.number().int().openapi({ description: "Pedidos creados hoy" }),
    todayRevenue:     z.number().openapi({ description: "Ingresos hoy (pedidos no cancelados)" }),
    lowStockProducts: z.number().int().openapi({ description: "Productos en o bajo su stockMin" }),
    weekOrders:       z.number().int().openapi({ description: "Pedidos en los últimos 7 días" }),
    totalCustomers:   z.number().int(),
    overduePayables:  z.number().int().openapi({ description: "Cuentas por cobrar vencidas" }),
    generatedAt:      z.string().datetime(),
  })
  .openapi("AdminStatsResponse");

registerEndpoint({
  method:  "get",
  path:    "/admin/stats",
  summary: "Stats ligeros en tiempo real para el widget del header admin",
  tags:    ["Admin"],
  responses: {
    200: { description: "Estadísticas del negocio",  schema: AdminStatsResponseSchema },
    401: { description: "Requiere autenticación",     schema: ErrorResponseSchema },
    403: { description: "Rol insuficiente",           schema: ErrorResponseSchema },
    503: { description: "Error de base de datos",     schema: ErrorResponseSchema },
  },
  security: "bearer",
});
