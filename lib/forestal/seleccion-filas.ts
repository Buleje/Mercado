/**
 * Marcar filas enteras del cubicador de madera y saber qué se marcó
 * (Brandon, 2026-10-19).
 *
 * Tres gestos llegan al MISMO conjunto de filas marcadas (el tilde que ya
 * decidía qué va al PDF, al Excel y al Anexo 04):
 *   - Shift+clic en la casilla: el tramo entre la última casilla clicada y
 *     ésta, de arriba hacia abajo o al revés (`idsEntre`).
 *   - «De la fila 50 a la 80» (o 80 a 50): por el N° que se ve en la tabla
 *     (`validarRangoDeFilas` + `idsPorNumero`).
 *   - La cuenta de lo marcado: filas, piezas, pie tablar y m³, y por especie
 *     (`resumenDeMarcadas`).
 *
 * PURO: sin React ni DOM, para que la cuenta se pruebe sola.
 */

import { m3DesdePt } from "./cubicacion";

/** Lo mínimo de una pieza para contarla. */
export interface FilaContable {
  id: string;
  cantidad: number;
  pieTablar: number;
  especie?: string;
}

/**
 * Los ids entre `anclaId` y `id`, ambos incluidos, en el orden de `ids`
 * (las filas como se ven). Sirve en los dos sentidos: de la 3 a la 8 y de
 * la 8 a la 3 dan lo mismo. Sin ancla (o si el ancla ya no se ve por un
 * filtro), sólo la fila clicada.
 */
export function idsEntre(ids: readonly string[], anclaId: string | null, id: string): string[] {
  const fin = ids.indexOf(id);
  if (fin < 0) return [];
  const ini = anclaId == null ? -1 : ids.indexOf(anclaId);
  if (ini < 0) return [id];
  const [a, b] = ini <= fin ? [ini, fin] : [fin, ini];
  return ids.slice(a, b + 1);
}

export type RangoDeFilas =
  | { ok: true; desde: number; hasta: number }
  | { ok: false; error: string };

/**
 * Valida «de la fila X a la Y» contra las filas de la tabla. Devuelve el
 * tramo ya ordenado (80→50 = 50→80). `total` = filas del lote entero: el N°
 * de la tabla va de 1 a `total` aunque haya un filtro puesto.
 */
export function validarRangoDeFilas(desde: number | null, hasta: number | null, total: number): RangoDeFilas {
  if (total <= 0) return { ok: false, error: "La tabla no tiene filas todavía." };
  if (desde == null || hasta == null || !Number.isFinite(desde) || !Number.isFinite(hasta)) {
    return { ok: false, error: "Escribe las dos filas: desde cuál y hasta cuál." };
  }
  if (!Number.isInteger(desde) || !Number.isInteger(hasta)) {
    return { ok: false, error: "Las filas van en números enteros, como en la columna N°." };
  }
  const [a, b] = desde <= hasta ? [desde, hasta] : [hasta, desde];
  if (a < 1 || b > total) {
    return { ok: false, error: `La tabla tiene ${total} ${total === 1 ? "fila" : "filas"}: elige entre la 1 y la ${total}.` };
  }
  return { ok: true, desde: a, hasta: b };
}

/** Los ids cuyo N° cae en el tramo [desde, hasta] (ya validado y ordenado). */
export function idsPorNumero(filas: readonly { id: string; numero: number }[], desde: number, hasta: number): string[] {
  return filas.filter((f) => f.numero >= desde && f.numero <= hasta).map((f) => f.id);
}

export interface CuentaDeFilas {
  filas: number;
  piezas: number;
  pt: number;
  m3: number;
}

export interface CuentaDeEspecie extends CuentaDeFilas {
  /** La especie como está escrita, o `null` si la fila no la tiene. */
  especie: string | null;
}

export interface ResumenDeMarcadas extends CuentaDeFilas {
  /** De la que más m³ tiene a la que menos; «Sin especie» al final. */
  especies: CuentaDeEspecie[];
}

/* El pie tablar de cada fila ya viene a 2 decimales (`cubicarPieza`): se
   suma en centésimas ENTERAS para que 300 filas no dejen «89,99999999».
   El m³ sale del pie tablar total (÷424), igual que el total de la tabla. */
const centesimas = (pt: number) => Math.round(pt * 100);

function cerrar(filas: number, piezas: number, cent: number): CuentaDeFilas {
  const pt = cent / 100;
  return { filas, piezas, pt, m3: m3DesdePt(pt) };
}

export function resumenDeMarcadas(rows: readonly FilaContable[], marcadas: ReadonlySet<string>): ResumenDeMarcadas {
  let filas = 0;
  let piezas = 0;
  let cent = 0;
  const porEspecie = new Map<string, { especie: string | null; filas: number; piezas: number; cent: number }>();
  for (const r of rows) {
    if (!marcadas.has(r.id)) continue;
    const c = centesimas(r.pieTablar);
    filas += 1;
    piezas += r.cantidad;
    cent += c;
    const nombre = r.especie?.trim() || null;
    /* «TORNILLO» y «Tornillo» son la misma madera en la cuenta rápida; se
       muestra la primera grafía que aparece. */
    const clave = nombre?.toLocaleLowerCase("es") ?? "";
    const g = porEspecie.get(clave) ?? { especie: nombre, filas: 0, piezas: 0, cent: 0 };
    g.filas += 1;
    g.piezas += r.cantidad;
    g.cent += c;
    porEspecie.set(clave, g);
  }
  const especies = [...porEspecie.values()]
    .map((g) => ({ especie: g.especie, ...cerrar(g.filas, g.piezas, g.cent) }))
    .sort((a, b) => (a.especie == null ? 1 : b.especie == null ? -1 : b.pt - a.pt));
  return { ...cerrar(filas, piezas, cent), especies };
}

/**
 * Quita las filas marcadas y recuerda dónde estaba cada una, para que
 * «Deshacer» las devuelva a su lugar aunque se haya dictado algo después.
 */
export function quitarFilas<T extends { id: string }>(rows: readonly T[], ids: ReadonlySet<string>): {
  quedan: T[];
  quitadas: { fila: T; indice: number }[];
} {
  const quedan: T[] = [];
  const quitadas: { fila: T; indice: number }[] = [];
  rows.forEach((fila, indice) => {
    if (ids.has(fila.id)) quitadas.push({ fila, indice });
    else quedan.push(fila);
  });
  return { quedan, quitadas };
}

/** La vuelta de `quitarFilas`: cada fila a su índice de antes (de menor a mayor). */
export function devolverFilas<T extends { id: string }>(actuales: readonly T[], quitadas: readonly { fila: T; indice: number }[]): T[] {
  const yaEstan = new Set(actuales.map((r) => r.id));
  const next = [...actuales];
  for (const { fila, indice } of [...quitadas].sort((a, b) => a.indice - b.indice)) {
    if (yaEstan.has(fila.id)) continue;
    next.splice(Math.min(indice, next.length), 0, fila);
  }
  return next;
}
