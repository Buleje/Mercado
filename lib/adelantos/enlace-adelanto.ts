/**
 * A dónde lleva el nombre de UN adelanto o de UNA liquidación.
 *
 * Antes el Resultado del negocio mandaba `?adelanto=` y `?liquidacion=` y no
 * los leía nadie: el clic caía en la lista de Adelantos sin que nada se
 * marcara. Acá vive el contrato entre quien arma el enlace (el servidor, el
 * detalle de un renglón) y quien lo lee (la lista de Adelantos y Liquidar):
 *
 *  - adelanto: Mi Plata › Adelantos › lista, con su ficha abierta y la fila
 *    resaltada (`?adelanto=<código o id>`, lo lee `use-adelanto-en-url`);
 *  - liquidación: la cuenta de esa persona con Liquidar abierto y la
 *    liquidación resaltada en su historial (`?accion=liquidar&persona=…&liquidacion=<código>`,
 *    lo lee `liquidar-por-url`). Sin persona no hay a dónde ir: texto.
 *
 * Sin `window` ni React: lo usa el servidor.
 */

import { destinoDe, type DestinoPanel } from "@/lib/admin/enlaces-panel";

/** La ficha de UN adelanto: su código de operación (`ADL-2026-0007`) o su id. */
export const PARAM_ADELANTO = "adelanto";
/** La liquidación a resaltar en el historial de Liquidar: su código (`LIQ-2026-0001`). */
export const PARAM_LIQUIDACION = "liquidacion";

/** Mi Plata › Adelantos › lista con la ficha de ese adelanto. `null` si no hay con qué ubicarlo. */
export function destinoDelAdelanto(ref: string | null | undefined): DestinoPanel | null {
  const limpio = ref?.trim();
  if (!limpio) return null;
  return { tab: "plata", params: { vista: "adelantos", sub: "lista", [PARAM_ADELANTO]: limpio } };
}

/** La lista de Adelantos, sin ficha: para cuando no se sabe cuál. */
export const DESTINO_ADELANTOS: DestinoPanel = { tab: "plata", params: { vista: "adelantos" } };

/**
 * La cuenta de la persona con Liquidar abierto y ESA liquidación resaltada.
 * `persona`: el `beneficiarioId` o el `parteId` de la liquidación (Liquidar
 * acepta cualquiera de los dos).
 *
 * Sin persona, `null`: el historial de liquidaciones vive en la cuenta de cada
 * una, así que no hay pantalla que la muestre y el nombre queda como texto
 * (antes caía en Adelantos › Resumen sin marcar nada).
 */
export function destinoDeLaLiquidacion(codigo: string, persona: string | null | undefined): DestinoPanel | null {
  const cuenta = destinoDe("cuenta-adelantos", persona);
  return cuenta ? { tab: cuenta.tab, params: { ...cuenta.params, [PARAM_LIQUIDACION]: codigo } } : null;
}

/** ¿`ref` (lo que vino en la URL) nombra a este adelanto? Por código (sin importar mayúsculas) o por id. */
export function esElAdelanto(a: { id: string; codigoOperacion?: string | null }, ref: string): boolean {
  const r = ref.trim();
  if (!r) return false;
  if (a.id === r) return true;
  const codigo = a.codigoOperacion?.trim();
  return !!codigo && codigo.toUpperCase() === r.toUpperCase();
}
