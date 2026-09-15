import { NextResponse } from "next/server";
import type { z } from "zod";
import { CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";
import { logger } from "@/lib/logger";

/**
 * 400 de schema CON `message` legible.
 *
 * El shape `{ error, issues }` a secas dejaba a la UI mostrando "undefined"
 * (lee `message` para los 422 de invariante y no lo encontraba). `issues` se
 * mantiene para debug; `message` es lo que ve el operador.
 */
export function ctpValidationResponse(error: z.ZodError): NextResponse {
  const primero = error.issues[0];
  const campo = primero?.path.join(".");
  return NextResponse.json(
    {
      error: "validation_error",
      message: primero
        ? `Dato inválido${campo ? ` en "${campo}"` : ""}: ${primero.message}`
        : "Los datos enviados no son válidos.",
      issues: error.issues,
    },
    { status: 400 },
  );
}

/**
 * Mapea los errores del Libro CTP a HTTP.
 *
 * Una invariante violada (I1/I2/tenant/congelado) NO es un fallo del servidor:
 * es el dato del usuario que no cuadra. Va 422 con el mensaje en español, para
 * que la UI pueda decir "la guía 001-0000120 sólo tiene 3 m³ sin consumir" en
 * vez de un "error interno" que no le enseña nada al operador.
 *
 * Cualquier otra excepción sí es 500 y se loguea (nunca se filtra al cliente).
 *
 * Vive en `lib/` y no en el route: importar desde `../route` acopla los
 * endpoints entre sí y los route de Next son módulos con semántica especial.
 */
export function ctpErrorResponse(err: unknown, ctx: string, tenantId: string): NextResponse {
  if (err instanceof CtpInvariantError) {
    return NextResponse.json(
      { error: err.code, message: err.message, detail: err.detail },
      { status: 422 },
    );
  }
  logger.error(`[${ctx}] failed`, { error: String(err), tenantId });
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}
