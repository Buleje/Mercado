/**
 * cubicacion-uso — QUÉ PARTE del lote cubicado se usa en Resúmenes y en la
 * Distribución (Brandon 2026-10-27: «de esa cubicación total usar sólo una
 * parte… si va toda la comercial, si va sólo paquetería, si va paquetería y
 * corta… también por especie… y lo que no se escoja que no se use»).
 *
 * Reglas:
 *
 * 1. **Lo desmarcado no se borra.** El lote del cubicador queda entero; sólo
 *    los lectores (Resúmenes, Distribución, Metas, Producción al Libro) ven la
 *    parte elegida. El filtro se aplica en UN lugar —donde Resúmenes lee el
 *    lote— con `filtrarPorUso`, nunca en cada tabla.
 * 2. **Se guarda lo que queda FUERA**, no lo que entra: un tipo o una especie
 *    nueva que aparece en el lote entra sola, y «nada guardado» = todo el lote.
 * 3. **Las dimensiones se combinan con «y»**: una pieza entra si su tipo, su
 *    especie, su dueño, su espesor y su largo están todos marcados.
 * 4. **La elección es del lote que la tomó.** Se guarda con una muestra de los
 *    ids de sus piezas; si el lote cambió entero (se vació, se abrió otra
 *    guardada) ninguna está y la elección deja de valer: un lote nuevo nunca
 *    sale recortado sin que nadie lo haya pedido.
 *
 * Las claves son las de `claveYLabel` (la misma identidad que las tablas de
 * Resúmenes): «Paquetería larga», «tornillo», «2pulg»…
 *
 * PURO y client-safe: sin React ni almacenamiento (eso es `use-uso-del-lote`).
 */
import { m3DesdePt, type PiezaCubicada } from "./cubicacion";
import { claveYLabel } from "./cubicacion-resumen";
import { ordenTipo, type TipoComercial } from "./cubicacion-tipo";

export const DIMENSIONES_USO = ["tipo", "especie", "dueno", "espesor", "largo"] as const;
export type DimensionUso = (typeof DIMENSIONES_USO)[number];

export const ETIQUETA_USO: Record<DimensionUso, string> = {
  tipo: "Tipo",
  especie: "Especie",
  dueno: "Dueño",
  espesor: "Espesor",
  largo: "Largo",
};

/** Lo que queda FUERA, por dimensión. `{}` = se usa todo el lote. */
export type FueraDelLote = Partial<Record<DimensionUso, string[]>>;

/** Lo que se guarda: lo de afuera + de qué lote es (muestra de ids). */
export interface UsoGuardado {
  fuera: FueraDelLote;
  muestra: string[];
}

export const TODO_EL_LOTE: FueraDelLote = Object.freeze({}) as FueraDelLote;

export interface TotalesUso {
  piezas: number;
  pt: number;
  m3: number;
}

/** Una fila del cuadro: un tipo, una especie, un largo… del lote ENTERO. */
export interface FilaUso extends TotalesUso {
  clave: string;
  label: string;
  /** % del pie tablar del lote (0-100). */
  pct: number;
  /** Está marcada (no figura en lo de afuera). */
  usada: boolean;
}

const MUESTRA_MAX = 40;

/** ¿Hay algo fuera? */
export function esUsoParcial(fuera: FueraDelLote): boolean {
  return DIMENSIONES_USO.some((d) => (fuera[d]?.length ?? 0) > 0);
}

/** Una pieza entra si ninguna de sus claves está fuera (regla 3). */
export function piezaSeUsa(r: PiezaCubicada, fuera: FueraDelLote): boolean {
  for (const d of DIMENSIONES_USO) {
    const lista = fuera[d];
    if (lista && lista.length > 0 && lista.includes(claveYLabel(r, d).clave)) return false;
  }
  return true;
}

/**
 * La parte del lote que se usa. Sin nada fuera devuelve EL MISMO arreglo: los
 * `useMemo` de abajo no se recalculan para quien nunca tocó la elección.
 */
export function filtrarPorUso<T extends PiezaCubicada>(rows: T[], fuera: FueraDelLote): T[];
export function filtrarPorUso<T extends PiezaCubicada>(
  rows: readonly T[],
  fuera: FueraDelLote,
): readonly T[];
export function filtrarPorUso<T extends PiezaCubicada>(
  rows: readonly T[],
  fuera: FueraDelLote,
): readonly T[] {
  if (!esUsoParcial(fuera)) return rows;
  return rows.filter((r) => piezaSeUsa(r, fuera));
}

/** Piezas · PT · m³ (el m³ SALE del PT total, ÷424). */
export function totalesUso(rows: readonly PiezaCubicada[]): TotalesUso {
  let piezas = 0;
  let pt = 0;
  for (const r of rows) {
    piezas += r.cantidad;
    pt += r.pieTablar ?? 0;
  }
  return { piezas, pt, m3: m3DesdePt(pt) };
}

/** Valor para ordenar espesores y largos de menor a mayor («2pulg» → 2). */
const numeroDe = (clave: string): number => {
  const n = Number.parseFloat(clave);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
};

/**
 * El cuadro de una dimensión, sobre el lote ENTERO (lo de afuera también se ve,
 * desmarcado: si no, no habría cómo volver a marcarlo). Orden: el tipo, el del
 * módulo; espesor y largo, de menor a mayor; especie y dueño, por PT.
 */
export function cuadroDeUso(
  rows: readonly PiezaCubicada[],
  dim: DimensionUso,
  fuera: FueraDelLote,
): FilaUso[] {
  const grupos = new Map<string, { label: string; piezas: number; pt: number }>();
  let ptTotal = 0;
  for (const r of rows) {
    const { clave, label } = claveYLabel(r, dim);
    const g = grupos.get(clave) ?? { label, piezas: 0, pt: 0 };
    g.piezas += r.cantidad;
    g.pt += r.pieTablar ?? 0;
    grupos.set(clave, g);
    ptTotal += r.pieTablar ?? 0;
  }
  const afuera = new Set(fuera[dim] ?? []);
  const filas: FilaUso[] = [...grupos.entries()].map(([clave, g]) => ({
    clave,
    label: g.label,
    piezas: g.piezas,
    pt: g.pt,
    m3: m3DesdePt(g.pt),
    pct: ptTotal > 0 ? (g.pt / ptTotal) * 100 : 0,
    usada: !afuera.has(clave),
  }));
  if (dim === "tipo")
    return filas.sort(
      (a, b) => ordenTipo(a.clave as TipoComercial) - ordenTipo(b.clave as TipoComercial),
    );
  if (dim === "espesor" || dim === "largo")
    return filas.sort(
      (a, b) => numeroDe(a.clave) - numeroDe(b.clave) || a.label.localeCompare(b.label),
    );
  return filas.sort((a, b) => b.pt - a.pt || a.label.localeCompare(b.label));
}

/** Cuántos valores distintos tiene el lote en una dimensión. */
export function valoresDistintos(rows: readonly PiezaCubicada[], dim: DimensionUso): number {
  return new Set(rows.map((r) => claveYLabel(r, dim).clave)).size;
}

/**
 * Las dimensiones que vale la pena ofrecer: las que tienen 2+ valores en el
 * lote, y siempre las que ya tienen algo fuera (para poder deshacerlo). Tipo y
 * especie, aunque tengan uno solo: son las que Brandon nombró.
 */
export function dimensionesOfrecidas(
  rows: readonly PiezaCubicada[],
  fuera: FueraDelLote,
): DimensionUso[] {
  return DIMENSIONES_USO.filter(
    (d) =>
      d === "tipo" ||
      d === "especie" ||
      valoresDistintos(rows, d) > 1 ||
      (fuera[d]?.length ?? 0) > 0,
  );
}

/** Marca o desmarca claves de una dimensión. Devuelve un objeto nuevo, sin listas vacías. */
export function ponerUso(
  fuera: FueraDelLote,
  dim: DimensionUso,
  claves: readonly string[],
  usar: boolean,
): FueraDelLote {
  const actual = new Set(fuera[dim] ?? []);
  for (const c of claves) {
    if (usar) actual.delete(c);
    else actual.add(c);
  }
  const next: FueraDelLote = { ...fuera };
  if (actual.size > 0) next[dim] = [...actual].sort();
  else delete next[dim];
  return next;
}

/** Ids espaciados del lote: alcanzan para reconocerlo aunque se borren o sumen piezas. */
export function muestraDelLote(rows: readonly PiezaCubicada[]): string[] {
  if (rows.length <= MUESTRA_MAX) return rows.map((r) => r.id).filter(Boolean);
  const paso = rows.length / MUESTRA_MAX;
  const ids: string[] = [];
  for (let i = 0; i < MUESTRA_MAX; i++) {
    const id = rows[Math.floor(i * paso)]?.id;
    if (id) ids.push(id);
  }
  return ids;
}

/** Lo que se guarda al elegir. Sin nada fuera, nada que recordar: `null`. */
export function armarUsoGuardado(
  fuera: FueraDelLote,
  rows: readonly PiezaCubicada[],
): UsoGuardado | null {
  if (!esUsoParcial(fuera)) return null;
  return { fuera, muestra: muestraDelLote(rows) };
}

/**
 * La elección que vale para ESTE lote (regla 4): si ninguna pieza de la
 * muestra sigue en el lote, era de otro lote y se usa todo. Sin muestra (lote
 * sin ids) se respeta lo guardado.
 */
export function usoVigente(
  guardado: UsoGuardado | null,
  rows: readonly PiezaCubicada[],
): FueraDelLote {
  if (!guardado || !esUsoParcial(guardado.fuera)) return TODO_EL_LOTE;
  if (guardado.muestra.length === 0) return guardado.fuera;
  const muestra = new Set(guardado.muestra);
  return rows.some((r) => muestra.has(r.id)) ? guardado.fuera : TODO_EL_LOTE;
}

/** Lee lo guardado sin confiar en la forma (viene del navegador). */
export function leerUsoGuardado(raw: string | null): UsoGuardado | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const fueraRaw =
    o.fuera && typeof o.fuera === "object" && !Array.isArray(o.fuera)
      ? (o.fuera as Record<string, unknown>)
      : {};
  const fuera: FueraDelLote = {};
  for (const d of DIMENSIONES_USO) {
    const lista = fueraRaw[d];
    if (Array.isArray(lista)) {
      const claves = lista.filter((x): x is string => typeof x === "string" && x !== "");
      if (claves.length > 0) fuera[d] = claves;
    }
  }
  const muestra = Array.isArray(o.muestra)
    ? o.muestra.filter((x): x is string => typeof x === "string")
    : [];
  return esUsoParcial(fuera) ? { fuera, muestra } : null;
}

/**
 * Cómo se dice la parte en una línea: las dimensiones recortadas con lo que
 * QUEDA marcado («Comercial + Paquetería larga · Tornillo»). Con más de tres
 * valores marcados en una dimensión, la cuenta («5 especies»).
 */
export function fraseDelUso(rows: readonly PiezaCubicada[], fuera: FueraDelLote): string {
  const partes: string[] = [];
  for (const d of DIMENSIONES_USO) {
    if ((fuera[d]?.length ?? 0) === 0) continue;
    const marcadas = cuadroDeUso(rows, d, fuera).filter((f) => f.usada);
    if (marcadas.length === 0) partes.push(NINGUNO[d]);
    else if (marcadas.length <= 3) partes.push(marcadas.map((f) => f.label).join(" + "));
    else partes.push(`${marcadas.length} ${PLURAL_USO[d]}`);
  }
  return partes.join(" · ");
}

const NINGUNO: Record<DimensionUso, string> = {
  tipo: "ningún tipo",
  especie: "ninguna especie",
  dueno: "ningún dueño",
  espesor: "ningún espesor",
  largo: "ningún largo",
};

const PLURAL_USO: Record<DimensionUso, string> = {
  tipo: "tipos",
  especie: "especies",
  dueno: "dueños",
  espesor: "espesores",
  largo: "largos",
};
