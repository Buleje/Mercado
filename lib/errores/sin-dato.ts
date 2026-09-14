"use client";

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
 * | Pedido de red que puede fallar         | `sinDato(contexto)`  | Sí (warn)  |
 * | Cuerpo de una respuesta que no es JSON | `leerJson(res)`      | No         |
 * | Fallar ES el camino esperado           | `descartarEsperado`  | No         |
 */

import { logger } from "@/lib/logger";
import { laPaginaSeEstaYendo } from "@/lib/navegacion";

/**
 * Para `.catch(sinDato("CRM /api/orders"))`: registra un warn con el contexto
 * y devuelve `null`.
 *
 * No registra dos casos que no son fallas: un pedido abortado a propósito
 * (`AbortError`) y el corte que hace el navegador al irse de la página
 * (`laPaginaSeEstaYendo()`, ver `lib/navegacion.ts`).
 */
export function sinDato(contexto: string): (err: unknown) => null {
  return (err: unknown) => {
    const abortado = err instanceof DOMException && err.name === "AbortError";
    if (!abortado && !laPaginaSeEstaYendo()) {
      logger.warn(`[${contexto}] no respondió`, { error: String(err) });
    }
    return null;
  };
}

/**
 * Lee el cuerpo como JSON; si no se puede, `null`.
 *
 * Un cuerpo que no es JSON (p. ej. un 502 del proxy en HTML, o un 204 vacío)
 * es un dato ausente, no una falla que registrar: el llamador ya mira
 * `res.ok` y arma su propio mensaje con el status.
 */
export async function leerJson<T = unknown>(res: Response): Promise<T | null> {
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
