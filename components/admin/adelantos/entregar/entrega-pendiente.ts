/**
 * La entrega que quedó SIN CONFIRMAR (se cortó la red o el servidor dio 5xx):
 * puede que la plata ya esté registrada. Se recuerda en `sessionStorage` con su
 * clave de idempotencia para que, si se cierra la pantalla y se vuelve a abrir,
 * el reintento use la MISMA clave y no cree otro adelanto con otro egreso de
 * caja (revisión del camino del dinero, 10-10).
 *
 * `sessionStorage` y no `localStorage`: la clave sirve en esta pestaña y en
 * esta sesión; mañana, en otra computadora, ya no hay respuesta que esperar.
 */

import type { MetodoEntrega, PersonaEntregar } from "@/lib/adelantos/entregar-tipos";
import { logger } from "@/lib/logger";

const LLAVE = "bsm-entregar-adelanto-pendiente";
/** Más viejo que esto, ya no se espera nada de esa respuesta. */
const MS_VIGENCIA = 12 * 3_600_000;

export interface EntregaPendiente {
  clave: string;
  persona: PersonaEntregar;
  montoTexto: string;
  metodo: MetodoEntrega | null;
  /** Se mandó con «Entregar y mandar a firmar» (sin firma). */
  sinFirma: boolean;
  /** ms */
  en: number;
}

export function leerEntregaPendiente(ahora = Date.now()): EntregaPendiente | null {
  try {
    const raw = typeof window === "undefined" ? null : window.sessionStorage.getItem(LLAVE);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<EntregaPendiente>;
    const valida =
      typeof p.clave === "string" && p.clave.length >= 8 && typeof p.persona?.id === "string" && typeof p.montoTexto === "string" && typeof p.en === "number";
    if (!valida || ahora - (p.en as number) > MS_VIGENCIA) {
      window.sessionStorage.removeItem(LLAVE);
      return null;
    }
    return { ...(p as EntregaPendiente), metodo: p.metodo ?? null, sinFirma: !!p.sinFirma };
  } catch (e) {
    logger.warn("[adelantos] no se pudo leer la entrega pendiente", { error: String(e) });
    return null;
  }
}

/** `null` = resuelta (confirmada, rechazada o descartada a propósito). */
export function guardarEntregaPendiente(p: EntregaPendiente | null): void {
  try {
    if (p) window.sessionStorage.setItem(LLAVE, JSON.stringify(p));
    else window.sessionStorage.removeItem(LLAVE);
  } catch (e) {
    /* Modo privado o almacenamiento lleno: el estado bloqueado en pantalla sigue protegiendo mientras no se cierre. */
    logger.warn("[adelantos] no se pudo recordar la entrega pendiente", { error: String(e) });
  }
}
