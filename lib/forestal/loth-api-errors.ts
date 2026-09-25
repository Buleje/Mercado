import { NextResponse } from "next/server";
import type { z } from "zod";
import { LothInvariantError } from "@/lib/db/forest-loth.db";
import { logger } from "@/lib/logger";

/**
 * 400 de schema CON `message` legible (gemelo de `ctpValidationResponse`).
 * El shape `{ error, issues }` a secas dejaba a la UI mostrando "undefined";
 * la UI lee `message`.
 */
export function lothValidationResponse(error: z.ZodError): NextResponse {
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
 * Mapea los errores del Libro TH a HTTP (gemelo de `ctpErrorResponse`).
 *
 * Una invariante violada (T1–T5) NO es un fallo del servidor: es el dato del
 * operador que no cuadra con la cadena de custodia. Va 422 con el mensaje en
 * español, para que la UI diga "la troza 85-TOR-A ya fue despachada" en vez de
 * un "error interno" que no le enseña nada. Cualquier otra excepción es 500.
 */
export function lothErrorResponse(err: unknown, ctx: string, tenantId: string): NextResponse {
  if (err instanceof LothInvariantError) {
    return NextResponse.json(
      { error: err.code, message: err.message, detail: err.detail },
      { status: 422 },
    );
  }
  logger.error(`[${ctx}] failed`, { error: String(err), tenantId });
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}
