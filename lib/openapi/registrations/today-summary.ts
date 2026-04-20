/**
 * Registration: GET /api/admin/today-summary
 *
 * Schema espejado desde app/api/admin/today-summary/route.ts
 * NOTE: mirror of inline schema in route file (sin Zod en el route)
 * NO modificar el route.ts original — solo registrar aquí.
 */
import { z } from "zod";
import { registerEndpoint } from "../registry";
import { ErrorResponseSchema } from "../common";

// NOTE: mirror of inline schema in route file
const TodaySummaryResponseSchema = z
  .object({
    ventas: z.object({
      total:            z.number(),
      ventasMostrador:  z.number(),
      ventasOnline:     z.number(),
      cantidadVentas:   z.number().int(),
      cambioVsAyer:     z.number().int().openapi({ description: "Variación % vs ayer" }),
    }),
    pedidos: z.object({
      hoy:        z.number().int(),
      pendientes: z.number().int(),
    }),
    alertas: z.object({
      stockBajo:    z.number().int(),
      sinStock:     z.number().int(),
      porVencer:    z.number().int().openapi({ description: "Lotes por vencer en 7 días" }),
      totalAlertas: z.number().int(),
    }),
    topProducto: z
      .object({
        nombre:   z.string(),
        cantidad: z.number().int(),
      })
      .nullable(),
    generadoA: z.string().datetime(),
  })
  .openapi("TodaySummaryResponse");

registerEndpoint({
  method:  "get",
  path:    "/admin/today-summary",
  summary: "Resumen ejecutivo del día: ventas, pedidos, alertas, stock",
  tags:    ["Admin", "Dashboard"],
  responses: {
    200: { description: "Resumen del día (caché 2 min)", schema: TodaySummaryResponseSchema },
    401: { description: "Requiere autenticación",         schema: ErrorResponseSchema },
    403: { description: "Rol insuficiente",               schema: ErrorResponseSchema },
  },
  security: "bearer",
});
