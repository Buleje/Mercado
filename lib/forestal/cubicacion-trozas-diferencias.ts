/**
 * cubicacion-trozas-diferencias — dos cubicaciones de TROZAS guardadas lado a
 * lado (Brandon 24-10: «trozas igual que madera»; ejemplo: lo que midió el
 * monte contra lo que mediste en el patio). Hermano de `cubicacion-diferencias`
 * (la aserrada, en pies tablares).
 *
 * El volumen es el de la fórmula del lote: m³ Smalian o PT Oxapampa. Dos lotes
 * de fórmulas distintas NO se comparan (424 PT por m³ no es una conversión de
 * trozas: la Oxapampina mide otra cosa): `mismaFormula` lo decide y la pantalla
 * lo dice. Los deltas se leen «B − A».
 *
 * Troza por troza: la misma troza se reconoce por su CÓDIGO (`codigo`, el que
 * viaja de la GTF al patio). Sin códigos en común no se inventa pareja por
 * posición: se compara por grupo.
 *
 * PURO y client-safe.
 */
import { ORDEN_TIPO_TROZA, type TrozaCubicada } from "./cubicacion-trozas";
import { agruparTrozasPor, type DimensionTrozas } from "./cubicacion-trozas-resumen";
import { UNIDADES_FORMULA, type FormulaTrozas } from "./cubicacion-trozas-formula";
import type { TrozaCongelada } from "./cubicacion-cuenta";

export type { DimensionTrozas } from "./cubicacion-trozas-resumen";
/** Las lecturas que ofrece el comparador, en el orden de los chips. */
export const DIMENSIONES_COMPARAR_TROZAS = ["especie", "tipo", "largo"] as const satisfies readonly DimensionTrozas[];

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
/** Decimales con que se compara el volumen: m³ a 4 (se muestra a 3), PT a 2. */
const redondeo = (f: FormulaTrozas) => (f === "oxapampina" ? r2 : r4);

/** Lo mínimo de una cubicación que hace falta para compararla. */
export interface CubicacionComparable {
  id: string;
  codigo: string;
  fecha: string;
  formula: string;
  nTrozas: number;
  volumen: number;
  monto: number | null;
  gtfNumber: string | null;
  personaNombre: string | null;
  trozas?: readonly TrozaCongelada[];
}

/** ¿Es una fórmula de trozas (y no la tablar de la aserrada)? */
export const esDeTrozas = (formula: string): formula is FormulaTrozas => formula === "smalian" || formula === "oxapampina";

/** Sólo se comparan dos de la MISMA fórmula (y de trozas). */
export const mismaFormula = (a: Pick<CubicacionComparable, "formula">, b: Pick<CubicacionComparable, "formula">): boolean =>
  a.formula === b.formula && esDeTrozas(a.formula);

/** La troza congelada con la forma que usan los resúmenes: m³ en Smalian, PT en Oxapampina. */
export function trozaACubicada(t: TrozaCongelada, formula: FormulaTrozas): TrozaCubicada {
  const base = { id: t.codigo?.trim() || `n${t.n}`, d1: t.d1, d2: t.d2, largo: t.largo, especie: t.especie };
  return formula === "oxapampina" ? { ...base, m3: 0, pt: t.volumen } : { ...base, m3: t.volumen };
}

// ── Por grupo ───────────────────────────────────────────────────────────────

export interface FilaDiferenciaTrozas {
  clave: string;
  label: string;
  trozasA: number; trozasB: number; deltaTrozas: number;
  volA: number; volB: number; deltaVol: number;
  /** Está en una sola de las dos: `"A"`, `"B"`; `null` = en las dos. */
  soloEn: "A" | "B" | null;
}

export interface DiferenciasTrozasPor {
  filas: FilaDiferenciaTrozas[];
  total: FilaDiferenciaTrozas;
  /** Grupos con las MISMAS trozas y el mismo volumen en las dos. */
  iguales: number;
}

/** ¿Este grupo cambió? (trozas o volumen). */
export const cambioTrozas = (f: FilaDiferenciaTrozas): boolean => f.deltaTrozas !== 0 || f.deltaVol !== 0;

function fila(
  formula: FormulaTrozas, clave: string, label: string,
  ga: { trozas: number; vol: number } | undefined, gb: { trozas: number; vol: number } | undefined,
): FilaDiferenciaTrozas {
  const rd = redondeo(formula);
  const trozasA = ga?.trozas ?? 0, trozasB = gb?.trozas ?? 0;
  const volA = rd(ga?.vol ?? 0), volB = rd(gb?.vol ?? 0);
  return {
    clave, label,
    trozasA, trozasB, deltaTrozas: trozasB - trozasA,
    volA, volB, deltaVol: rd(volB - volA),
    soloEn: ga && !gb ? "A" : gb && !ga ? "B" : null,
  };
}

/** El orden natural de cada lectura: especie A→Z, tipo Delgada→Gruesa, largo de menor a mayor. */
function ordenNatural(dim: DimensionTrozas) {
  if (dim === "tipo") return (x: FilaDiferenciaTrozas, y: FilaDiferenciaTrozas) => ORDEN_TIPO_TROZA.indexOf(x.label as never) - ORDEN_TIPO_TROZA.indexOf(y.label as never);
  if (dim === "largo") return (x: FilaDiferenciaTrozas, y: FilaDiferenciaTrozas) => Number(x.clave) - Number(y.clave);
  return (x: FilaDiferenciaTrozas, y: FilaDiferenciaTrozas) => x.label.localeCompare(y.label, "es");
}

/**
 * Las diferencias de `b` respecto de `a` por la dimensión pedida. Un grupo que
 * está en una sola aparece igual, con 0 del otro lado (que un largo haya
 * desaparecido es justo lo que se busca).
 */
export function diferenciasTrozasPor(
  a: readonly TrozaCongelada[], b: readonly TrozaCongelada[], formula: FormulaTrozas, dim: DimensionTrozas,
): DiferenciasTrozasPor {
  const ox = formula === "oxapampina";
  const leer = (ts: readonly TrozaCongelada[]) => agruparTrozasPor(ts.map((t) => trozaACubicada(t, formula)), dim, formula);
  const ra = leer(a), rb = leer(b);
  const vol = (g: { m3: number; pt: number }) => (ox ? g.pt : g.m3);
  const mapA = new Map(ra.grupos.map((g) => [g.clave, g]));
  const mapB = new Map(rb.grupos.map((g) => [g.clave, g]));
  const filas = [...new Set([...mapA.keys(), ...mapB.keys()])].map((k) => {
    const ga = mapA.get(k), gb = mapB.get(k);
    return fila(formula, k, (ga ?? gb)?.label ?? k,
      ga && { trozas: ga.trozas, vol: vol(ga) }, gb && { trozas: gb.trozas, vol: vol(gb) });
  });
  filas.sort(ordenNatural(dim));
  return {
    filas,
    total: fila(formula, "total", "TOTAL", { trozas: ra.total.trozas, vol: vol(ra.total) }, { trozas: rb.total.trozas, vol: vol(rb.total) }),
    iguales: filas.filter((f) => !cambioTrozas(f)).length,
  };
}

// ── Totales guardados ───────────────────────────────────────────────────────

/**
 * El cuadro de arriba: los totales GUARDADOS de cada una (los del servidor), no
 * la suma de los grupos. Sin precio (`monto` null) no hay soles que comparar:
 * ese lado y la diferencia salen `null`, nunca un «−2 568» contra una que nunca
 * se valorizó.
 */
export interface TotalesTrozasComparados {
  trozasA: number; trozasB: number; deltaTrozas: number;
  volA: number; volB: number; deltaVol: number;
  montoA: number | null; montoB: number | null; deltaMonto: number | null;
}

export function totalesTrozasComparados(
  a: Pick<CubicacionComparable, "nTrozas" | "volumen" | "monto">,
  b: Pick<CubicacionComparable, "nTrozas" | "volumen" | "monto">,
  formula: FormulaTrozas,
): TotalesTrozasComparados {
  const rd = redondeo(formula);
  const volA = rd(a.volumen), volB = rd(b.volumen);
  return {
    trozasA: a.nTrozas, trozasB: b.nTrozas, deltaTrozas: b.nTrozas - a.nTrozas,
    volA, volB, deltaVol: rd(volB - volA),
    montoA: a.monto, montoB: b.monto,
    deltaMonto: a.monto !== null && b.monto !== null ? r2(b.monto - a.monto) : null,
  };
}

// ── Troza por troza ─────────────────────────────────────────────────────────

const num = (v: number) => v.toLocaleString("es-PE", { maximumFractionDigits: 2 });

/** «Ø 40/42 cm × 5 m» o «Ø 20″ × 16 pies» (un solo Ø si los dos son iguales). */
export function medidaDeTroza(t: Pick<TrozaCongelada, "d1" | "d2" | "largo">, formula: FormulaTrozas): string {
  const u = UNIDADES_FORMULA[formula];
  const d = t.d1 === t.d2 ? num(t.d1) : `${num(t.d1)}/${num(t.d2)}`;
  return `Ø ${d}${u.diametroCorto} × ${num(t.largo)} ${u.largo}`;
}

export interface CambioDeTroza {
  codigo: string;
  nA: number | null;
  nB: number | null;
  tipo: "cambiada" | "soloA" | "soloB";
  especie: string;
  antes: string | null;
  despues: string | null;
  /** Qué cambió, en palabras: «Ø menor 40 → 42 cm», «largo 5 → 4,8 m». */
  detalle: string[];
  deltaVol: number;
}

export interface CambiosPorTroza {
  cambios: CambioDeTroza[];
  /** Códigos que están en las dos (si es 0, no se compara troza a troza). */
  enComun: number;
  iguales: number;
  /** Trozas sin código: no se pueden emparejar. */
  sinCodigoA: number;
  sinCodigoB: number;
}

const claveCodigo = (t: Pick<TrozaCongelada, "codigo">) => (t.codigo ?? "").trim().toLowerCase();

/**
 * Qué trozas cambiaron entre `a` y `b`, por código. `null` si no comparten
 * ninguno: la pantalla compara sólo por grupo. Un código repetido en un lote
 * se toma la primera vez (el servidor no los repite; es defensa).
 */
export function cambiosPorTroza(
  a: readonly TrozaCongelada[], b: readonly TrozaCongelada[], formula: FormulaTrozas,
): CambiosPorTroza | null {
  const rd = redondeo(formula);
  const u = UNIDADES_FORMULA[formula];
  const indice = (ts: readonly TrozaCongelada[]) => {
    const m = new Map<string, TrozaCongelada>();
    for (const t of ts) { const k = claveCodigo(t); if (k && !m.has(k)) m.set(k, t); }
    return m;
  };
  const ma = indice(a), mb = indice(b);
  const enComun = [...ma.keys()].filter((k) => mb.has(k)).length;
  if (enComun === 0) return null;
  const cambios: CambioDeTroza[] = [];
  let iguales = 0;
  for (const [k, ta] of ma) {
    const tb = mb.get(k);
    if (!tb) {
      cambios.push({ codigo: ta.codigo ?? k, nA: ta.n, nB: null, tipo: "soloA", especie: ta.especie, antes: medidaDeTroza(ta, formula), despues: null, detalle: ["Sólo está en A"], deltaVol: rd(-ta.volumen) });
      continue;
    }
    const detalle: string[] = [];
    if (ta.d1 !== tb.d1) detalle.push(`Ø menor ${num(ta.d1)} → ${num(tb.d1)} ${u.diametro}`);
    if (ta.d2 !== tb.d2) detalle.push(`Ø mayor ${num(ta.d2)} → ${num(tb.d2)} ${u.diametro}`);
    if (ta.largo !== tb.largo) detalle.push(`largo ${num(ta.largo)} → ${num(tb.largo)} ${u.largo}`);
    if ((ta.especie ?? "").trim().toLowerCase() !== (tb.especie ?? "").trim().toLowerCase()) detalle.push(`${ta.especie || "sin especie"} → ${tb.especie || "sin especie"}`);
    const deltaVol = rd(tb.volumen - ta.volumen);
    if (detalle.length === 0 && deltaVol === 0) { iguales += 1; continue; }
    if (detalle.length === 0) detalle.push("Cambió el descuento");
    cambios.push({ codigo: ta.codigo ?? k, nA: ta.n, nB: tb.n, tipo: "cambiada", especie: tb.especie || ta.especie, antes: medidaDeTroza(ta, formula), despues: medidaDeTroza(tb, formula), detalle, deltaVol });
  }
  for (const [k, tb] of mb) {
    if (ma.has(k)) continue;
    cambios.push({ codigo: tb.codigo ?? k, nA: null, nB: tb.n, tipo: "soloB", especie: tb.especie, antes: null, despues: medidaDeTroza(tb, formula), detalle: ["Sólo está en B"], deltaVol: rd(tb.volumen) });
  }
  /* Lo que más se movió primero. */
  cambios.sort((x, y) => Math.abs(y.deltaVol) - Math.abs(x.deltaVol) || x.codigo.localeCompare(y.codigo, "es", { numeric: true }));
  return {
    cambios, enComun, iguales,
    sinCodigoA: a.filter((t) => !claveCodigo(t)).length,
    sinCodigoB: b.filter((t) => !claveCodigo(t)).length,
  };
}

// ── Para la pantalla ────────────────────────────────────────────────────────

/** El número del volumen: m³ SIEMPRE con 3 decimales, PT con 2. */
export function numeroVolumen(v: number, formula: FormulaTrozas): string {
  const dec = formula === "oxapampina" ? 2 : 3;
  return v.toLocaleString("es-PE", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

/** Volumen con la unidad de su fórmula: «12.345 m³» o «2,140.50 PT». */
export const textoVolumen = (v: number, formula: FormulaTrozas): string => `${numeroVolumen(v, formula)} ${UNIDADES_FORMULA[formula].volumen}`;

/** Una línea en criollo para arriba del cuadro: cuánto más (o menos) tiene B y qué grupo lo explica. */
export function lecturaDiferenciasTrozas(d: DiferenciasTrozasPor, nombreA: string, nombreB: string, formula: FormulaTrozas): string {
  const t = d.total;
  if (!cambioTrozas(t) && d.filas.every((f) => !cambioTrozas(f))) return `«${nombreB}» y «${nombreA}» tienen las mismas trozas y el mismo volumen.`;
  const base = t.deltaVol === 0
    ? "Mismo volumen, pero la mezcla cambia"
    : `«${nombreB}» tiene ${textoVolumen(Math.abs(t.deltaVol), formula)} ${t.deltaVol > 0 ? "más" : "menos"} que «${nombreA}» (${t.deltaTrozas >= 0 ? "+" : "−"}${Math.abs(t.deltaTrozas)} trozas)`;
  const mov = [...d.filas].filter(cambioTrozas).sort((x, y) => Math.abs(y.deltaVol) - Math.abs(x.deltaVol))[0];
  return mov ? `${base}; lo que más se movió: ${mov.label}.` : `${base}.`;
}

/** La más reciente primero: por la fecha del trabajo y, el mismo día, la última tocada. */
export const ordenRecientesTrozas = <T extends { fecha: string; updatedAt?: string }>(lista: readonly T[]): T[] =>
  [...lista].sort((x, y) => (y.fecha ?? "").localeCompare(x.fecha ?? "") || (y.updatedAt ?? "").localeCompare(x.updatedAt ?? ""));

/**
 * Con cuál comparar `a` si nadie eligió: de su misma fórmula, la de la misma
 * guía (lo del monte contra lo del patio), si no la de la misma persona, si no
 * la más reciente. `null` si no hay otra de esa fórmula.
 */
export function parejaPorDefectoTrozas<T extends Pick<CubicacionComparable, "id" | "formula" | "gtfNumber" | "personaNombre" | "fecha"> & { updatedAt?: string }>(
  lista: readonly T[], a: T,
): T | null {
  const otras = ordenRecientesTrozas(lista.filter((c) => c.id !== a.id && mismaFormula(c, a)));
  const gtf = a.gtfNumber?.trim();
  const persona = a.personaNombre?.trim().toLowerCase();
  return (gtf ? otras.find((c) => c.gtfNumber?.trim() === gtf) : undefined)
    ?? (persona ? otras.find((c) => c.personaNombre?.trim().toLowerCase() === persona) : undefined)
    ?? otras[0] ?? null;
}
