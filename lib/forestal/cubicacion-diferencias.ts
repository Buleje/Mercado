/**
 * cubicacion-diferencias — dos cubicaciones GUARDADAS lado a lado (Brandon
 * 24-10: «comparar con otro guardado y que salga un cuadro de diferencia en
 * pies, m³, piezas y diferencias en medidas, cada uno con su dato de cliente»).
 *
 * Distinto de `compararLotes` (Resúmenes: el lote en pantalla contra otro, por
 * mezcla y precio): acá las dos están guardadas y se mide CADA grupo en
 * piezas, PT, m³ y soles, con el volumen OFICIAL de cada una
 * (`agruparOficial`, el mismo que imprimen sus tablas) y el precio con que se
 * guardó cada pieza (`precioDeCubicacion`). Los deltas se leen «B − A».
 *
 * Además, pieza por pieza: si B se duplicó de A (las piezas conservan su id),
 * dice qué medida cambió, cuáles se agregaron y cuáles se quitaron.
 *
 * PURO y client-safe.
 */
import { m3DesdePt, type PiezaCubicada } from "./cubicacion";
import { agruparOficial, type DimensionResumen, type GrupoResumen } from "./cubicacion-resumen";
import { precioDeCubicacion, type CubicacionRegistro } from "./cubicacion-registro";
import { tipoDePieza } from "./cubicacion-tipo";
import { celdaCsv, sinFormula } from "@/lib/csv/celda";

export interface FilaDiferencia {
  clave: string;
  label: string;
  piezasA: number; piezasB: number; deltaPiezas: number;
  ptA: number; ptB: number; deltaPt: number;
  m3A: number; m3B: number; deltaM3: number;
  valorA: number; valorB: number; deltaValor: number;
  /** Está en una sola de las dos: `"A"`, `"B"`; `null` = en las dos. */
  soloEn: "A" | "B" | null;
}

/** Las lecturas que ofrece el comparador, en el orden de los chips. */
export const DIMENSIONES_COMPARAR = ["especie", "tipo", "medida", "seccion", "largo", "dueno"] as const satisfies readonly DimensionResumen[];
export type DimensionComparar = (typeof DIMENSIONES_COMPARAR)[number];

export interface DiferenciasPor {
  filas: FilaDiferencia[];
  total: FilaDiferencia;
  /** Grupos con la MISMA cantidad de piezas y PT en las dos. */
  iguales: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function fila(clave: string, label: string, ga: Pick<GrupoResumen, "cantidad" | "pieTablar" | "m3" | "valor"> | undefined, gb: typeof ga): FilaDiferencia {
  const piezasA = ga?.cantidad ?? 0, piezasB = gb?.cantidad ?? 0;
  const ptA = r2(ga?.pieTablar ?? 0), ptB = r2(gb?.pieTablar ?? 0);
  const m3A = r3(ga?.m3 ?? 0), m3B = r3(gb?.m3 ?? 0);
  const valorA = r2(ga?.valor ?? 0), valorB = r2(gb?.valor ?? 0);
  return {
    clave, label,
    piezasA, piezasB, deltaPiezas: piezasB - piezasA,
    ptA, ptB, deltaPt: r2(ptB - ptA),
    m3A, m3B, deltaM3: r3(m3B - m3A),
    valorA, valorB, deltaValor: r2(valorB - valorA),
    soloEn: ga && !gb ? "A" : gb && !ga ? "B" : null,
  };
}

/** ¿Este grupo cambió? (piezas o PT; el m³ y el valor salen de ellos). */
export const cambio = (f: FilaDiferencia): boolean => f.deltaPiezas !== 0 || f.deltaPt !== 0;

/**
 * Las diferencias de `b` respecto de `a` por la dimensión pedida. Un grupo que
 * está en una sola aparece igual, con 0 del otro lado (que una medida haya
 * desaparecido es justo lo que se busca). Orden: lo que más se movió en PT
 * arriba; los iguales al final.
 */
export function diferenciasPor(a: CubicacionRegistro, b: CubicacionRegistro, dim: DimensionComparar): DiferenciasPor {
  const ra = agruparOficial(a.piezas, dim, precioDeCubicacion(a));
  const rb = agruparOficial(b.piezas, dim, precioDeCubicacion(b));
  const mapA = new Map(ra.grupos.map((g) => [g.clave, g]));
  const mapB = new Map(rb.grupos.map((g) => [g.clave, g]));
  const claves = [...new Set([...mapA.keys(), ...mapB.keys()])];
  const filas = claves.map((k) => {
    const ga = mapA.get(k), gb = mapB.get(k);
    return fila(k, (ga ?? gb)?.label ?? k, ga, gb);
  });
  filas.sort((x, y) =>
    Number(cambio(y)) - Number(cambio(x)) || Math.abs(y.deltaPt) - Math.abs(x.deltaPt) || x.label.localeCompare(y.label, "es"));
  return {
    filas,
    total: fila("total", "TOTAL", ra.total, rb.total),
    iguales: filas.filter((f) => !cambio(f)).length,
  };
}

// ── Pieza por pieza ─────────────────────────────────────────────────────────

/** «2×8×10 · Tornillo» con sus unidades si no son las de siempre (pulg × pulg × pies). */
export function medidaDePieza(p: PiezaCubicada): string {
  const u = (v: number, unidad: string, comun: string) => `${v}${unidad === comun ? "" : ` ${unidad}`}`;
  return `${u(p.espesor, p.uEspesor, "pulg")}×${u(p.ancho, p.uAncho, "pulg")}×${u(p.largo, p.uLargo, "pies")}`;
}

export interface CambioDePieza {
  id: string;
  /** N° de la fila en el papel de cada una (1-based); `null` si no está. */
  nA: number | null;
  nB: number | null;
  tipo: "cambiada" | "agregada" | "quitada";
  antes: string | null;
  despues: string | null;
  /** Qué cambió, en palabras: «largo 10 → 9», «2 → 3 piezas», «Tornillo → Cedro». */
  detalle: string[];
  deltaPt: number;
}

export interface CambiosPorPieza {
  cambios: CambioDePieza[];
  /** Piezas con el mismo id en las dos (si es 0, no se compara pieza a pieza). */
  enComun: number;
  iguales: number;
}

const DIMS: { k: "espesor" | "ancho" | "largo"; u: "uEspesor" | "uAncho" | "uLargo" }[] = [
  { k: "espesor", u: "uEspesor" }, { k: "ancho", u: "uAncho" }, { k: "largo", u: "uLargo" },
];

/**
 * Qué piezas cambiaron entre `a` y `b`, por id. Sólo tiene sentido cuando una
 * salió de la otra (Duplicar conserva los ids): si no comparten ninguna,
 * devuelve `null` y la pantalla compara sólo por grupos.
 */
export function cambiosPorPieza(a: CubicacionRegistro, b: CubicacionRegistro): CambiosPorPieza | null {
  const posA = new Map(a.piezas.map((p, i) => [p.id, i]));
  const posB = new Map(b.piezas.map((p, i) => [p.id, i]));
  const enComun = a.piezas.filter((p) => posB.has(p.id)).length;
  if (enComun === 0) return null;
  const cambios: CambioDePieza[] = [];
  let iguales = 0;
  for (const pa of a.piezas) {
    const ib = posB.get(pa.id);
    const ia = posA.get(pa.id) ?? 0;
    if (ib === undefined) {
      cambios.push({ id: pa.id, nA: ia + 1, nB: null, tipo: "quitada", antes: medidaDePieza(pa), despues: null, detalle: [`${pa.cantidad} ${pa.cantidad === 1 ? "pieza" : "piezas"}`], deltaPt: r2(-pa.pieTablar) });
      continue;
    }
    const pb = b.piezas[ib];
    if (!pb) continue;
    const detalle: string[] = [];
    for (const { k, u } of DIMS) {
      if (pa[k] !== pb[k] || pa[u] !== pb[u]) detalle.push(`${k} ${pa[k]}${pa[u] === pb[u] ? "" : ` ${pa[u]}`} → ${pb[k]}${pa[u] === pb[u] ? "" : ` ${pb[u]}`}`);
    }
    if (pa.cantidad !== pb.cantidad) detalle.push(`${pa.cantidad} → ${pb.cantidad} piezas`);
    const ea = pa.especie?.trim() || "", eb = pb.especie?.trim() || "";
    if (ea !== eb) detalle.push(`${ea || "sin especie"} → ${eb || "sin especie"}`);
    if (tipoDePieza(pa) !== tipoDePieza(pb)) detalle.push(`tipo ${tipoDePieza(pa)} → ${tipoDePieza(pb)}`);
    if ((pa.dueno ?? "") !== (pb.dueno ?? "")) detalle.push(`dueño ${pa.dueno || "—"} → ${pb.dueno || "—"}`);
    if (detalle.length === 0) { iguales += 1; continue; }
    cambios.push({ id: pa.id, nA: ia + 1, nB: ib + 1, tipo: "cambiada", antes: medidaDePieza(pa), despues: medidaDePieza(pb), detalle, deltaPt: r2(pb.pieTablar - pa.pieTablar) });
  }
  b.piezas.forEach((pb, ib) => {
    if (posA.has(pb.id)) return;
    cambios.push({ id: pb.id, nA: null, nB: ib + 1, tipo: "agregada", antes: null, despues: medidaDePieza(pb), detalle: [`${pb.cantidad} ${pb.cantidad === 1 ? "pieza" : "piezas"}`], deltaPt: r2(pb.pieTablar) });
  });
  return { cambios, enComun, iguales };
}

/**
 * Una línea en criollo para arriba del cuadro: cuánto más (o menos) tiene B y
 * qué grupo lo explica. El PT entero, como en las tablas.
 */
export function lecturaDiferencias(d: DiferenciasPor, nombreA: string, nombreB: string): string {
  const t = d.total;
  if (!cambio(t) && d.filas.every((f) => !cambio(f))) return `«${nombreB}» y «${nombreA}» tienen las mismas piezas y el mismo volumen.`;
  /* Entero como en las tablas; bajo medio PT, con sus decimales (no «0 PT más»). */
  const abs = Math.abs(t.deltaPt);
  const pt = abs >= 0.5 ? Math.round(abs).toLocaleString("es-PE") : abs.toLocaleString("es-PE", { maximumFractionDigits: 2 });
  const base = t.deltaPt === 0
    ? `Mismo pie tablar, pero la mezcla cambia`
    : `«${nombreB}» tiene ${pt} PT ${t.deltaPt > 0 ? "más" : "menos"} que «${nombreA}» (${t.deltaPiezas >= 0 ? "+" : "−"}${Math.abs(t.deltaPiezas)} piezas)`;
  const mov = d.filas.find(cambio);
  return mov ? `${base}; lo que más se movió: ${mov.label}.` : `${base}.`;
}

// ── Para la pantalla: con cuál comparar y el cuadro para Excel ──────────────

const distintos = (xs: readonly (string | null | undefined)[]): string[] =>
  [...new Set(xs.map((x) => (x ?? "").trim()).filter(Boolean))];

/** Las especies del lote: las de sus piezas; si ninguna la tiene, la del lote. */
export function especiesDeCubicacion(c: Pick<CubicacionRegistro, "piezas" | "especie">): string[] {
  const dePiezas = distintos(c.piezas.map((p) => p.especie));
  return dePiezas.length ? dePiezas : distintos([c.especie]);
}

/** La más reciente primero: por la fecha del trabajo y, el mismo día, la última tocada. */
export const ordenRecientes = <T extends Pick<CubicacionRegistro, "fecha" | "updatedAt">>(lista: readonly T[]): T[] =>
  [...lista].sort((x, y) => (y.fecha ?? "").localeCompare(x.fecha ?? "") || (y.updatedAt ?? "").localeCompare(x.updatedAt ?? ""));

/**
 * Con cuál comparar `a` si nadie eligió: la más reciente que comparte alguna
 * especie (comparar Tornillo contra Cedro casi nunca es la pregunta); si
 * ninguna, la más reciente. `null` si no hay otra guardada.
 */
export function parejaPorDefecto(lista: readonly CubicacionRegistro[], a: CubicacionRegistro): CubicacionRegistro | null {
  const otras = ordenRecientes(lista.filter((c) => c.id !== a.id));
  const suyas = new Set(especiesDeCubicacion(a));
  return otras.find((c) => especiesDeCubicacion(c).some((e) => suyas.has(e))) ?? otras[0] ?? null;
}

/**
 * El cuadro de diferencias como planilla: `;` + BOM para abrir en Excel es-PE
 * (`celdaCsv`), o tabuladores para pegarlo en una hoja. Precisión completa
 * (PT a 2, m³ a 3): el contador recalcula. Al final, quién es A y quién B.
 */
export function diferenciasACsv(d: DiferenciasPor, primeraCol: string, nombreA: string, nombreB: string, separador: ";" | "\t" = ";"): string {
  const celda = separador === ";" ? celdaCsv : (v: unknown) => sinFormula(String(v ?? "")).replace(/[\t\r\n]+/g, " ");
  const cab = [primeraCol, "Piezas A", "Piezas B", "Dif. piezas", "PT A", "PT B", "Dif. PT", "m3 A", "m3 B", "Dif. m3", "S/ A", "S/ B", "Dif. S/", "Está en"];
  const linea = (f: FilaDiferencia, estaEn: string) => [
    f.label, f.piezasA, f.piezasB, f.deltaPiezas,
    f.ptA.toFixed(2), f.ptB.toFixed(2), f.deltaPt.toFixed(2),
    f.m3A.toFixed(3), f.m3B.toFixed(3), f.deltaM3.toFixed(3),
    f.valorA.toFixed(2), f.valorB.toFixed(2), f.deltaValor.toFixed(2),
    estaEn,
  ].map(celda).join(separador);
  const estaEn = (f: FilaDiferencia) => (f.soloEn === "A" ? "Sólo en A" : f.soloEn === "B" ? "Sólo en B" : "Las dos");
  const filas = [
    cab.map(celda).join(separador),
    ...d.filas.map((f) => linea(f, estaEn(f))),
    linea(d.total, ""),
    "",
    ["A", nombreA].map(celda).join(separador),
    ["B", nombreB].map(celda).join(separador),
  ];
  return `${separador === ";" ? "﻿" : ""}${filas.join("\n")}`;
}

/**
 * El cuadro de arriba del comparador: los totales GUARDADOS de cada una (los
 * que se vieron en el cubicador al guardar: m³ = PT ÷ 424), no la suma de los
 * grupos. Las tablas por grupo redondean cada fila como la guía y su total
 * puede correr una milésima; este no, porque es el dato de la cubicación.
 *
 * Sin precio (`valor` 0) no hay soles que comparar: ese lado y la diferencia
 * salen `null`, nunca un «−386.66» contra una que nunca tuvo precio.
 */
export interface TotalesComparados {
  piezasA: number; piezasB: number; deltaPiezas: number;
  ptA: number; ptB: number; deltaPt: number;
  m3A: number; m3B: number; deltaM3: number;
  valorA: number | null; valorB: number | null; deltaValor: number | null;
}

export function totalesComparados(
  a: Pick<CubicacionRegistro, "totales" | "valor">,
  b: Pick<CubicacionRegistro, "totales" | "valor">,
): TotalesComparados {
  const ptA = r2(a.totales.pieTablar), ptB = r2(b.totales.pieTablar);
  const m3A = r3(m3DesdePt(ptA)), m3B = r3(m3DesdePt(ptB));
  const valorA = a.valor > 0 ? r2(a.valor) : null, valorB = b.valor > 0 ? r2(b.valor) : null;
  return {
    piezasA: a.totales.piezas, piezasB: b.totales.piezas, deltaPiezas: b.totales.piezas - a.totales.piezas,
    ptA, ptB, deltaPt: r2(ptB - ptA),
    m3A, m3B, deltaM3: r3(m3B - m3A),
    valorA, valorB, deltaValor: valorA !== null && valorB !== null ? r2(valorB - valorA) : null,
  };
}
