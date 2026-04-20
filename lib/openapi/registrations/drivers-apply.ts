/**
 * Registration: POST /api/marketplace/drivers/apply
 *
 * Schema espejado desde app/api/marketplace/drivers/apply/route.ts
 * NO modificar el route.ts original — solo registrar aquí.
 */
import { z } from "zod";
import { registerEndpoint } from "../registry";
import { ErrorResponseSchema } from "../common";

// Espejo del DriverApplySchema del route
const DriverApplyBodySchema = z
  .object({
    name:         z.string().min(2).max(100).openapi({ example: "Juan Pérez" }),
    phone:        z.string().min(6).max(20).openapi({ example: "51987654321" }),
    zone:         z.string().min(1).max(50).openapi({ example: "Pucallpa Centro" }),
    vehicleType:  z.enum(["moto", "bicicleta", "auto", "a_pie"]).openapi({ example: "moto" }),
    availability: z.enum(["manana", "tarde", "noche", "full", "fines"]).openapi({ example: "full" }),
  })
  .openapi("DriverApplyBody");

const DriverApplyResponseSchema = z
  .object({
    success: z.literal(true),
  })
  .openapi("DriverApplyResponse");

registerEndpoint({
  method:  "post",
  path:    "/marketplace/drivers/apply",
  summary: "Postular como repartidor",
  tags:    ["Marketplace", "Drivers"],
  request: {
    body: DriverApplyBodySchema,
  },
  responses: {
    200: { description: "Solicitud registrada",   schema: DriverApplyResponseSchema },
    400: { description: "Datos inválidos",         schema: ErrorResponseSchema },
    500: { description: "Error de servidor",       schema: ErrorResponseSchema },
  },
  security: "none",
});
