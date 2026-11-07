/**
 * C20 · Aceptación y cuarentena separadas (noche 17-10, sin schema): de lo que
 * llegó en una línea «En buen estado», cuánto queda DISPONIBLE (entra a stock
 * vendible), cuánto queda EN REVISIÓN (apartado, no se vende) y cuánto se
 * RECHAZA (no entra; se reclama al proveedor). Viaja en `itemsJson` de la
 * recepción (`enRevision`, `rechazado`, `motivoRevision`).
 *
 * Liberar lo que quedó en revisión es una decisión registrada: se hace con el
 * ajuste de stock de Inventario, que exige motivo (7f6e70643).
 */

export type LineaConAceptacion = {
  receivedQty: number;
  condition: string;
  enRevision?: number;
  rechazado?: number;
};

export type PartesDeLaLinea = { disponible: number; enRevision: number; rechazado: number };

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/**
 * Parte lo que llegó. Una línea dañada o vencida no tiene disponible (ya no
 * entra a stock); una «faltante» entra entera, como antes (sólo se parte una
 * línea en buen estado). El rechazo manda sobre la revisión si entre los dos
 * pasan de lo que llegó: nunca sale un disponible negativo.
 */
export function partirLinea(item: LineaConAceptacion): PartesDeLaLinea {
  const llego = n(item.receivedQty);
  if (item.condition === "dañado" || item.condition === "vencido") return { disponible: 0, enRevision: 0, rechazado: 0 };
  if (item.condition !== "ok") return { disponible: llego, enRevision: 0, rechazado: 0 };
  const rechazado = Math.min(llego, n(item.rechazado));
  const enRevision = Math.min(llego - rechazado, n(item.enRevision));
  return { disponible: llego - rechazado - enRevision, enRevision, rechazado };
}

/** ¿La línea tiene algo apartado o rechazado? (cuenta como no conforme). */
export const tieneApartado = (item: LineaConAceptacion): boolean => {
  const p = partirLinea(item);
  return p.enRevision > 0 || p.rechazado > 0;
};

/** Error para el formulario/servidor, o null si las cantidades cierran. */
export function errorDeAceptacion(item: LineaConAceptacion & { product?: string }): string | null {
  if (item.condition !== "ok") return null;
  const suma = n(item.enRevision) + n(item.rechazado);
  if (suma > n(item.receivedQty)) {
    return `${item.product ?? "La línea"}: en revisión más rechazado (${suma}) pasa de lo que llegó (${n(item.receivedQty)}).`;
  }
  return null;
}
