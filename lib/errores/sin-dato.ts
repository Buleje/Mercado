/**
 * sin-dato.ts — cuando un pedido no responde, dejarlo dicho y seguir.
 *
 * El panel tenía cuarenta `.catch(() => null)`: el `null` era la intención
 * (la pantalla sigue sin ese dato), pero no quedaba rastro de que algo había
 * fallado. Estos tres helpers dejan la intención escrita en el nombre y el
 * rastro en la consola, sin cambiar lo que el llamador recibe: donde antes
 * había `null`, sigue habiendo `null`.
 *
 * | Caso                                   | Helper               | ¿Registra? |
 * |----------------------------------------|----------------------|------------|
 * | Pedido de red / consulta que puede fallar | `sinDato(contexto)` | Sí (warn)  |
 * | Cuerpo que no es JSON (Response o Request) | `leerJson(res)`  | No         |
 * | Fallar ES el camino esperado           | `descartarEsperado`  | No         |
 *
 * Sirve en los dos lados. Sin `"use client"` a propósito: con la directiva, una
 * ruta de `app/api` recibe referencias de cliente y `sinDato(...)` revienta en
 * vez de devolver `null`. Nada acá toca el navegador fuera de guardas
 * (`lib/navegacion.ts` mira `typeof window`; `DOMException` existe en Node).
 * Los componentes cliente lo siguen importando igual.
 */

import { logger } from "@/lib/logger";
import { laPaginaSeEstaYendo } from "@/lib/navegacion";

/**
 * Para `.catch(sinDato("CRM /api/orders"))`: registra un warn con el contexto
 * y devuelve `null`.
 *
 * No registra dos casos que no son fallas: un pedido abortado a propósito
 * (`AbortError`) y el corte que hace el navegador al irse de la página
 * (`laPaginaSeEstaYendo()`, ver `lib/navegacion.ts`; en el servidor siempre es
 * `false`).
 */
export function sinDato(contexto: string): (err: unknown) => null {
  return (err: unknown) => {
    const abortado = err instanceof DOMException && err.name === "AbortError";
    if (!abortado && !laPaginaSeEstaYendo()) {
      logger.warn(`[${contexto}] no respondió`, { error: describirError(err) });
    }
    return null;
  };
}

/**
 * Lo que se registra de un error.
 *
 * Un error de Prisma trae en el mensaje los valores de la consulta (un
 * teléfono, un usuario): de esos sólo va el nombre y el código. El resto va con
 * el mensaje recortado a 200 caracteres. (Ley 29733, auditoría 2026-09-14.)
 */
export function describirError(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    const codigo = typeof code === "string" ? ` ${code}` : "";
    if (err.name.startsWith("Prisma")) return `${err.name}${codigo}`;
    return `${err.name}${codigo}: ${err.message.slice(0, 200)}`;
  }
  return String(err).slice(0, 200);
}

/**
 * Lee el cuerpo como JSON; si no se puede, `null`.
 *
 * Del lado del cliente, un cuerpo que no es JSON (p. ej. un 502 del proxy en
 * HTML, o un 204 vacío) es un dato ausente, no una falla que registrar: el
 * llamador ya mira `res.ok` y arma su propio mensaje con el status.
 *
 * Del lado del servidor recibe el `Request`: un cuerpo inválido es error de
 * quien llama, no del sistema, y la ruta ya responde 400 cuando el schema
 * rechaza el `null`.
 */
export async function leerJson<T = unknown>(res: { json(): Promise<unknown> }): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Para `.catch(descartarEsperado)` donde fallar es parte del plan: por ejemplo,
 * probar tres parsers sobre el mismo archivo y quedarse con el que entienda.
 * No se registra porque el rechazo no indica nada roto — registrarlo llenaría
 * la consola de avisos falsos que enseñan a ignorar los verdaderos.
 */
export function descartarEsperado(): null {
  return null;
}
