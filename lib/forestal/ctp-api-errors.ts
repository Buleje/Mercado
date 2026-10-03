import { NextResponse } from "next/server";
import type { z } from "zod";
import { CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";
import { logger } from "@/lib/logger";
import { esChoqueDeLocks } from "@/lib/forestal/choque-de-locks";

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

/** Lo que ve el operador cuando Postgres cortó su pedido por un choque de locks. */
export const MENSAJE_CHOQUE_DE_LOCKS = "Otra persona estaba moviendo las mismas trozas: vuelve a intentar.";

export { esChoqueDeLocks } from "@/lib/forestal/choque-de-locks";

/**
 * Mapea los errores del Libro CTP a HTTP.
 *
 * Una invariante violada (I1/I2/tenant/congelado) NO es un fallo del servidor:
 * es el dato del usuario que no cuadra. Va 422 con el mensaje en español, para
 * que la UI pueda decir "la guía 001-0000120 sólo tiene 3 m³ sin consumir" en
 * vez de un "error interno" que no le enseña nada al operador.
 *
 * Un choque de locks (`esChoqueDeLocks`) va 409: la transacción se deshizo
 * entera, así que reintentar es seguro, y eso es lo que el mensaje dice.
 *
 * Cualquier otra excepción sí es 500 y se loguea (nunca se filtra al cliente).
 *
 * Vive en `lib/` y no en el route: importar desde `../route` acopla los
 * endpoints entre sí y los route de Next son módulos con semántica especial.
 */
export function ctpErrorResponse(err: unknown, ctx: string, tenantId: string): NextResponse {
  if (err instanceof CtpInvariantError) {
    /* Una foto rechazada es un pedido mal formado (firma que no cuadra, foto de
       otra guía), no un dato del libro que no cuadra: 400, como el Zod. Un
       paquete que ya viaja en otra guía choca con un recurso que existe: 409
       (ADR-444) — reintentar el mismo pedido no lo arregla, anular esa guía sí. */
    return NextResponse.json(
      { error: err.code, message: err.message, detail: err.detail },
      {
        status:
          err.code === "FOTO_NO_VALIDA"
            ? 400
            : err.code === "PAQUETE_YA_DESPACHADO" || err.code === "TROZA_NO_RETROZABLE"
              ? 409
              : 422,
      },
    );
  }
  if (esChoqueDeLocks(err)) {
    /* `warn`, no `error`: es un turno perdido, no una falla. Se loguea igual
       para poder contar cuántas veces pasa. */
    logger.warn(`[${ctx}] choque de locks: se pidió reintentar`, { error: String(err), tenantId });
    return NextResponse.json({ error: "CHOQUE_DE_LOCKS", message: MENSAJE_CHOQUE_DE_LOCKS }, { status: 409 });
  }
  logger.error(`[${ctx}] failed`, { error: String(err), tenantId });
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}
