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

/** Lo que ve el operador cuando Postgres cortó su pedido por un choque de locks. */
export const MENSAJE_CHOQUE_DE_LOCKS = "Otra persona estaba moviendo las mismas trozas: vuelve a intentar.";

/**
 * Códigos de «dos transacciones se pisaron; reintentar sirve»: el deadlock de
 * Postgres (40P01), la falla de serialización (40001) y el P2034 con que Prisma
 * nombra a las dos.
 */
const CODIGOS_CHOQUE = new Set(["40P01", "40001", "P2034"]);

/**
 * ¿El error es un choque de locks entre dos transacciones?
 *
 * Repartir un mixto (mixto → trozas → lotes) y vincular una corrida (corrida →
 * lotes → trozas) toman los locks en orden inverso: si los dos caen a la vez
 * sobre las mismas trozas, Postgres aborta a uno con 40P01. No es un error del
 * servidor ni del dato: es un turno perdido.
 *
 * Con `@prisma/adapter-pg` el código llega por tres caminos según quién tomó el
 * lock (medido 26-09 contra la base real en `__tests__/forestal-choque-de-locks.test.ts`):
 *  · `$queryRaw … FOR UPDATE` → P2010 «Raw query failed. Code: `40P01`», con el
 *    original en `meta.driverAdapterError.cause.originalCode`;
 *  · una consulta del modelo → el `DriverAdapterError` sin envolver, con
 *    `cause.originalCode` y sin `code` propio;
 *  · 40001 → P2034 directo (lo dice el código del adaptador; éste no se provocó).
 * Se recorre la cadena (`cause`, `meta.driverAdapterError`) con un tope, y el
 * texto de Postgres queda de último recurso.
 */
export function esChoqueDeLocks(err: unknown): boolean {
  const pendientes: unknown[] = [err];
  for (let paso = 0; paso < 8 && pendientes.length > 0; paso++) {
    const e = pendientes.shift();
    if (!e || typeof e !== "object") continue;
    const o = e as { code?: unknown; originalCode?: unknown; message?: unknown; cause?: unknown; meta?: unknown };
    if (typeof o.code === "string" && CODIGOS_CHOQUE.has(o.code)) return true;
    if (typeof o.originalCode === "string" && CODIGOS_CHOQUE.has(o.originalCode)) return true;
    if (typeof o.message === "string" && /deadlock detected|could not serialize access|Code: `40P01`/i.test(o.message)) {
      return true;
    }
    pendientes.push(o.cause);
    if (o.meta && typeof o.meta === "object") pendientes.push((o.meta as { driverAdapterError?: unknown }).driverAdapterError);
  }
  return false;
}

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
          err.code === "FOTO_NO_VALIDA" ? 400 : err.code === "PAQUETE_YA_DESPACHADO" ? 409 : 422,
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
