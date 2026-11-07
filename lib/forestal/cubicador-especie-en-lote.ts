/**
 * Poner una especie a muchas filas del cubicador de una vez (Brandon,
 * 2026-10-24: «seleccionando una especie, ponerlo a todos los registros esa
 * especie; también de rango a tal rango irá esta especie»).
 *
 * Tres blancos, una sola cuenta: todas las filas que se ven, un tramo por el
 * N° de la tabla (el del papel) o las filas marcadas. Antes de aplicar se dice
 * cuántas cambian y qué especie se pisa («12 filas tenían Cumala»); después,
 * «Deshacer» devuelve a cada fila SU especie de antes, aunque en el medio se
 * haya dictado algo más.
 *
 * PURO: sin React ni DOM, para que la cuenta se pruebe sola.
 */

import { idsPorNumero, validarRangoDeFilas } from "./seleccion-filas";

/** Lo mínimo de una fila para cambiarle la especie. */
export interface FilaConEspecie {
  id: string;
  especie?: string;
}

export interface EspeciePisada {
  especie: string;
  filas: number;
}

export interface PlanDeEspecie {
  /** Las filas a las que se apunta (todas, el tramo o las marcadas). */
  filas: number;
  /** Las que cambian: las que ya tienen esa especie quedan como están. */
  ids: string[];
  /** Las que tenían OTRA especie y se pisa, de la más repetida a la menos. */
  pisadas: EspeciePisada[];
  /** Las que no tenían especie. */
  sinEspecie: number;
}

const especieDe = (f: FilaConEspecie): string => f.especie?.trim() ?? "";

export function planDeEspecie(objetivo: readonly FilaConEspecie[], especie: string): PlanDeEspecie {
  const nueva = especie.trim();
  const ids: string[] = [];
  const pisadas = new Map<string, number>();
  let sinEspecie = 0;
  for (const f of objetivo) {
    const antes = especieDe(f);
    if (antes === nueva) continue;
    ids.push(f.id);
    if (antes === "") sinEspecie += 1;
    else pisadas.set(antes, (pisadas.get(antes) ?? 0) + 1);
  }
  return {
    filas: objetivo.length,
    ids,
    pisadas: [...pisadas].map(([e, filas]) => ({ especie: e, filas })).sort((a, b) => b.filas - a.filas || a.especie.localeCompare(b.especie)),
    sinEspecie,
  };
}

/** «12 filas tenían Cumala y 3 Tornillo» — `null` si no se pisa nada. */
export function textoPisadas(pisadas: readonly EspeciePisada[]): string | null {
  if (pisadas.length === 0) return null;
  const partes = pisadas.map((p, i) => (i === 0 ? `${p.filas} ${p.filas === 1 ? "fila tenía" : "filas tenían"} ${p.especie}` : `${p.filas} ${p.especie}`));
  return partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

/**
 * Pone `especie` a las filas de `ids`. Las demás vuelven como el MISMO objeto
 * (la fila memoizada de la tabla no se repinta). La especie de antes de cada
 * una sale en `antes`, para el «Deshacer».
 */
export function ponerEspecie<T extends FilaConEspecie>(
  rows: readonly T[],
  ids: ReadonlySet<string>,
  especie: string,
): { filas: T[]; antes: Map<string, string | undefined> } {
  const nueva = especie.trim() || undefined;
  const antes = new Map<string, string | undefined>();
  const filas = rows.map((r) => {
    if (!ids.has(r.id) || r.especie === nueva) return r;
    antes.set(r.id, r.especie);
    return { ...r, especie: nueva };
  });
  return { filas, antes };
}

/**
 * El «Deshacer»: cada fila vuelve a SU especie de antes. Las que se borraron
 * en el medio no vuelven (eso es otro deshacer) y las dictadas después no se
 * tocan: no se restaura una foto entera del lote.
 */
export function devolverEspecies<T extends FilaConEspecie>(rows: readonly T[], antes: ReadonlyMap<string, string | undefined>): T[] {
  return rows.map((r) => (antes.has(r.id) ? { ...r, especie: antes.get(r.id) } : r));
}

export type TramoDeEspecie =
  | { ok: true; ids: string[]; desde: number; hasta: number }
  | { ok: false; error: string };

/**
 * Las filas «de la N° tal a la N° tal», por el N° que se VE (el del papel; con
 * «más nuevas primero» va al revés de la posición). Misma regla que «Marcar
 * filas»: sirve en los dos sentidos y sólo cuenta lo que se ve con el filtro.
 */
export function tramoDeEspecie(
  filas: readonly { id: string; numero: number }[],
  desde: number | null,
  hasta: number | null,
  total: number,
): TramoDeEspecie {
  const v = validarRangoDeFilas(desde, hasta, total);
  if (!v.ok) return v;
  const ids = idsPorNumero(filas, v.desde, v.hasta);
  if (ids.length === 0) return { ok: false, error: `Ninguna fila de la ${v.desde} a la ${v.hasta} se ve con el filtro puesto.` };
  return { ok: true, ids, desde: v.desde, hasta: v.hasta };
}
