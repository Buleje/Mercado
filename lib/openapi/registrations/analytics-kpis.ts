/**
 * Registration: GET /api/analytics/kpis
 *
 * Schema espejado desde app/api/analytics/kpis/route.ts
 * NOTE: mirror of inline schema in route file (sin Zod explícito en el route)
 * NO modificar el route.ts original — solo registrar aquí.
 */
import { z } from "zod";
import { registerEndpoint } from "../registry";
import { ErrorResponseSchema } from "../common";

// NOTE: mirror of inline schema in route file
const KPIMetricSchema = z
  .object({
    valor:  z.number(),
    cambio: z.number().openapi({ description: "Variación % vs período anterior" }),
  })
  .openapi("KPIMetric");

const KPICountMetricSchema = z
  .object({
    valor: z.number().int(),
  })
  .openapi("KPICountMetric");

const FiadoKPISchema = z
  .object({
    valor: z.number(),
    count: z.number().int(),
  })
  .openapi("FiadoKPI");

const AnalyticsKPIsResponseSchema = z
  .object({
    ingresosHoy:        KPIMetricSchema,
    ticketPromedio:     KPIMetricSchema,
    transaccionesHoy:   KPIMetricSchema,
    margenOperativo:    KPIMetricSchema,
    fiadoPendiente:     FiadoKPISchema,
    stockCritico:       KPICountMetricSchema,
  })
  .openapi("AnalyticsKPIsResponse");

registerEndpoint({
  method:  "get",
  path:    "/analytics/kpis",
  summary: "6 KPIs de negocio en tiempo real (ingresos, margen, fiados, stock)",
  tags:    ["Analytics"],
  responses: {
    200: { description: "KPIs calculados",        schema: AnalyticsKPIsResponseSchema },
    401: { description: "Requiere autenticación",  schema: ErrorResponseSchema },
    403: { description: "Rol insuficiente",        schema: ErrorResponseSchema },
    503: { description: "Error de base de datos",  schema: ErrorResponseSchema },
  },
  security: "bearer",
});
