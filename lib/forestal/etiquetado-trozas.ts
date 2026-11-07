/**
 * etiquetado-trozas.ts — qué pasa con cada pieza al imprimir su etiqueta (ADR-436).
 *
 * El servidor sella la impresión (`etiquetadaEn`, `etiquetasImpresas`) y, si se
 * pide, le da a la pieza sin código de planta su correlativo — la marca que se
 * pinta en el palo. Esto decide, sin tocar la base, **qué pieza entra a cuál de
 * esos tres destinos**; `WoodEntriesDB.marcarEtiquetadas` lo ejecuta.
 *
 * La regla de «está en el patio» es la MISMA que la pantalla
 * (`trozasEtiquetables` → `motivoBloqueo`): si divergieran, el botón ofrecería
 * imprimir una etiqueta que el servidor después se niega a sellar.
 *
 * PURO y client-safe.
 */

import { LABEL_BLOQUEO, motivoBloqueo, type TrozaConsumible } from "./consumo-trozas";

/** Una pieza que se omite o que se etiqueta sin código nuevo, con el porqué. */
export interface PiezaConMotivo {
  id: string;
  motivo: string;
}

export interface PlanDeEtiquetado {
  /** Las que se sellan como etiquetadas (con o sin código nuevo). */
  etiquetar: string[];
  /** Las que NO se etiquetan: no están en el patio, o no son de este negocio. */
  omitidas: PiezaConMotivo[];
  /** Las que reciben correlativo, en el orden en que se numeran. */
  aNumerar: string[];
  /**
   * Se etiquetan igual, pero con el código del bosque: su período está cerrado
   * y darles un código de planta sería escribir en un mes ya presentado.
   */
  sinCodigoNuevo: PiezaConMotivo[];
}

/** La pieza tiene su código de planta — vacío o sólo espacios no cuenta. */
export function tieneCodigoPlanta(codigo: string | null | undefined): boolean {
  return typeof codigo === "string" && codigo.trim() !== "";
}

export const MOTIVO_NO_ENCONTRADA =
  "No está en el patio de este negocio (o su guía está anulada o rechazada).";

/**
 * Reparte las piezas pedidas entre los destinos.
 *
 * - `pedidos` manda el orden (y se deduplican): el correlativo sigue el orden en
 *   que el operador las eligió, que es el orden en que salen del rollo.
 * - `periodoCerrado(t)` devuelve el rótulo del período cerrado o `null`; sólo
 *   se consulta para las que se van a numerar.
 */
export function planearEtiquetado(
  pedidos: readonly string[],
  piezas: readonly TrozaConsumible[],
  opts: { asignarCodigo: boolean; periodoCerrado?: (t: TrozaConsumible) => string | null },
): PlanDeEtiquetado {
  const porId = new Map(piezas.map((p) => [p.id, p]));
  const plan: PlanDeEtiquetado = { etiquetar: [], omitidas: [], aNumerar: [], sinCodigoNuevo: [] };
  const vistos = new Set<string>();

  for (const id of pedidos) {
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    const t = porId.get(id);
    if (!t) {
      plan.omitidas.push({ id, motivo: MOTIVO_NO_ENCONTRADA });
      continue;
    }
    const bloqueo = motivoBloqueo(t);
    if (bloqueo) {
      plan.omitidas.push({ id, motivo: LABEL_BLOQUEO[bloqueo] });
      continue;
    }
    plan.etiquetar.push(id);
    if (!opts.asignarCodigo || tieneCodigoPlanta(t.codigoPlanta)) continue;

    const cerrado = opts.periodoCerrado?.(t) ?? null;
    if (cerrado) {
      plan.sinCodigoNuevo.push({
        id,
        motivo: `El período ${cerrado} está cerrado: se etiquetó con el código del bosque. Reabrilo para darle código de planta.`,
      });
      continue;
    }
    plan.aNumerar.push(id);
  }
  return plan;
}

/**
 * El correlativo: `desde`, `desde + 1`, … en el orden de `ids`. `desde` es
 * `MAX(código numérico del negocio) + 1` — el mismo criterio que
 * `siguienteCodigoPlanta` y `renumerarCodigosPlanta`.
 */
export function asignarCorrelativos(
  ids: readonly string[],
  desde: number,
): { id: string; codigo: string }[] {
  if (!Number.isSafeInteger(desde) || desde < 1) throw new Error(`correlativo inválido: ${desde}`);
  return ids.map((id, i) => ({ id, codigo: String(desde + i) }));
}
