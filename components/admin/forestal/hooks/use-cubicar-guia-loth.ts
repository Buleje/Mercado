"use client";

/**
 * «Cubicar en Oxapampina» de una GTF del Libro TH (K7 · ADR-483; Brandon 08-10:
 * «en Smalian es según SERFOR, pero como yo compro es en Oxapampina
 * descontando huecos y demás»).
 *
 * El servidor manda las trozas de la guía ya pasadas a pulgadas y pies (1
 * decimal, con las DOS puntas: D10). Cada fórmula lleva su propia planilla:
 * cambiar de fórmula no convierte lo tipeado, abre la otra (como el Cubicador
 * de trozas). Las cuentas son las MISMAS del servidor (`cubicacion-comercial`):
 * acá sólo se muestran; lo que se paga lo congela el servidor al guardar.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { GtfItem } from "@/lib/db/forest-gtf.db";
import { agruparPorEspecie, type LineaEspecie, type TrozaCongelada } from "@/lib/forestal/cubicacion-cuenta";
import { aplicarDescuentoLote, trozaNeta } from "@/lib/forestal/cubicacion-comercial";
import {
  PCT_DESCUENTO_MAX, type DescuentoLote, type DescuentoTroza, type PrefillOrigenLoth, type PrefillTrozaGtf,
} from "@/lib/forestal/cubicacion-comercial-tipos";
import { RANGO_FORMULA, UNIDADES_FORMULA, redondearVolumen, type FormulaTrozas } from "@/lib/forestal/cubicacion-trozas-formula";
import { leerDecimal, textoDeMedida } from "@/lib/forestal/planilla-oxapampa";
import type { FilaTroza } from "../cubicador-trozas-tabla";
import { RUTA_CUBICACIONES_TROZAS } from "./use-cubicaciones-trozas";

export const CAMPOS_MEDIDA = ["d1", "d2", "largo"] as const;
export const CAMPOS_DESCUENTO = ["hueco", "menosLargo", "pct"] as const;
type CampoMedida = (typeof CAMPOS_MEDIDA)[number];
export type CampoCubicar = CampoMedida | (typeof CAMPOS_DESCUENTO)[number];

export interface FilaCubicar extends Record<CampoCubicar, string> {
  codigo: string | null;
  especie: string;
  m3Guia: number | null;
  /** Lo que dice la guía, en la unidad de la fórmula: mientras la celda sea igual, se ve gris «de la guía». */
  guia: Record<CampoMedida, string>;
}
export interface LoteTexto {
  pct: string;
  porEspecie: Record<string, { pct: string; menos: string }>;
}
export interface Planilla {
  filas: FilaCubicar[];
  lote: LoteTexto;
}

/** «1 234,56»: como `fmtVolumen`, sin la unidad y con los decimales fijos (columnas alineadas). */
export function fmtNum(v: number, decimales: number): string {
  const [ent, frac] = v.toFixed(decimales).split(".");
  return `${ent.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}${frac ? `,${frac}` : ""}`;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Smalian va en cm y m SIN convertir: lo de la guía (`items`), por código; si no casa, de vuelta desde las pulgadas. */
function medidasSmalian(t: PrefillTrozaGtf, items: readonly GtfItem[] | null): Record<CampoMedida, number> {
  const it = t.codigo ? items?.find((i) => i.code === t.codigo || i.codigoGuia === t.codigo) : undefined;
  if (it?.diamMayorM && it.diamMenorM && it.lengthM) {
    return { d1: r1(it.diamMayorM * 100), d2: r1(it.diamMenorM * 100), largo: r2(it.lengthM) };
  }
  return { d1: r1(t.d1 * 2.54), d2: r1(t.d2 * 2.54), largo: r2(t.largo * 0.3048) };
}

export function planillaInicial(prefill: PrefillOrigenLoth, items: readonly GtfItem[] | null, formula: FormulaTrozas): Planilla {
  const filas = prefill.trozas.map((t): FilaCubicar => {
    const m = formula === "oxapampina" ? { d1: t.d1, d2: t.d2, largo: t.largo } : medidasSmalian(t, items);
    const guia = { d1: textoDeMedida(m.d1), d2: textoDeMedida(m.d2), largo: textoDeMedida(m.largo) };
    return { codigo: t.codigo, especie: t.especie, m3Guia: t.m3Guia, guia, ...guia, hueco: "", menosLargo: "", pct: "" };
  });
  return { filas, lote: { pct: "", porEspecie: {} } };
}

/* ── Las cuentas (las del servidor) ─────────────────────────────────────── */

export interface TrozaACubicar {
  especie: string;
  d1: number;
  d2: number;
  largo: number;
  descuento?: DescuentoTroza | null;
}
export interface CubicadoConDescuentos {
  porTroza: Array<{ bruto: number; neto: number } | { error: string }>;
  /** Por especie, con el descuento de cada troza (antes del lote). */
  especies: LineaEspecie[];
  /** Por especie, con el del lote. */
  lineas: LineaEspecie[];
  bruto: number;
  neto: number;
  errorLote: string | null;
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : "Un descuento no cuadra.");

/** Troza por troza (`trozaNeta`) y después el lote (`aplicarDescuentoLote`): lo mismo que congela el servidor. */
export function cubicarConDescuentos(
  formula: FormulaTrozas,
  trozas: readonly TrozaACubicar[],
  lote: DescuentoLote | null | undefined,
): CubicadoConDescuentos {
  const congeladas: TrozaCongelada[] = [];
  let bruto = 0;
  const porTroza = trozas.map((t, i) => {
    try {
      const r = trozaNeta(formula, t.d1, t.d2, t.largo, t.descuento ?? null, i + 1);
      bruto += r.bruto;
      congeladas.push({ n: i + 1, especie: t.especie.trim() || "sin especie", d1: t.d1, d2: t.d2, largo: t.largo, volumen: r.neto });
      return r;
    } catch (e) {
      return { error: mensaje(e) };
    }
  });
  const especies = agruparPorEspecie(congeladas, formula);
  const sinLote = redondearVolumen(especies.reduce((s, l) => s + l.volumen, 0), formula);
  try {
    const r = aplicarDescuentoLote(especies, lote ?? null, formula);
    return { porTroza, especies, lineas: r.lineas, bruto: redondearVolumen(bruto, formula), neto: r.neto, errorLote: null };
  } catch (e) {
    return { porTroza, especies, lineas: especies, bruto: redondearVolumen(bruto, formula), neto: sinLote, errorLote: mensaje(e) };
  }
}

/** Una celda de descuento: vacía o 0 = sin descuento. */
const positivo = (texto: string): number | null | "invalido" => {
  const v = leerDecimal(texto);
  return v === 0 ? null : v;
};

function descuentoDeFila(f: FilaCubicar): { d: DescuentoTroza | null; error: string | null } {
  const hueco = positivo(f.hueco);
  const menosLargo = positivo(f.menosLargo);
  const pct = positivo(f.pct);
  if (hueco === "invalido" || menosLargo === "invalido" || pct === "invalido") return { d: null, error: "Un descuento no es un número." };
  if (pct != null && pct > PCT_DESCUENTO_MAX) return { d: null, error: `Un descuento no pasa del ${PCT_DESCUENTO_MAX} %.` };
  const d: DescuentoTroza = { ...(hueco ? { hueco } : {}), ...(menosLargo ? { menosLargo } : {}), ...(pct ? { pct } : {}) };
  return { d: Object.keys(d).length ? d : null, error: null };
}

/** El descuento del lote como lo pide el servidor; `error` si un campo no es un número o pasa del tope. */
export function descuentoDelLote(lote: LoteTexto): { d: DescuentoLote | null; error: string | null } {
  const general = positivo(lote.pct);
  if (general === "invalido") return { d: null, error: "El descuento general no es un número." };
  const porEspecie: NonNullable<DescuentoLote["porEspecie"]> = [];
  for (const [clave, v] of Object.entries(lote.porEspecie)) {
    const pct = positivo(v.pct);
    const menos = positivo(v.menos);
    if (pct === "invalido" || menos === "invalido") return { d: null, error: "Un descuento por especie no es un número." };
    if (pct != null && pct > PCT_DESCUENTO_MAX) return { d: null, error: `Un descuento no pasa del ${PCT_DESCUENTO_MAX} %.` };
    if (pct || menos) porEspecie.push({ clave, ...(pct ? { pct } : {}), ...(menos ? { menos } : {}) });
  }
  if (general != null && general > PCT_DESCUENTO_MAX) return { d: null, error: `Un descuento no pasa del ${PCT_DESCUENTO_MAX} %.` };
  const d: DescuentoLote = { ...(general ? { pct: general } : {}), ...(porEspecie.length ? { porEspecie } : {}) };
  return { d: Object.keys(d).length ? d : null, error: null };
}

export interface CalculoFila {
  bruto: number | null;
  neto: number | null;
  /** Falta una medida: la troza todavía no cuenta (no es un error). */
  falta: boolean;
  error: string | null;
  medidas: Record<CampoMedida, number> | null;
  descuento: DescuentoTroza | null;
}
export interface CalculoPlanilla extends Omit<CubicadoConDescuentos, "porTroza"> {
  filas: CalculoFila[];
  descuentoLote: DescuentoLote | null;
  completas: number;
  conError: number;
}

export function calcularPlanilla(p: Planilla, formula: FormulaTrozas): CalculoPlanilla {
  const u = UNIDADES_FORMULA[formula];
  const rango = RANGO_FORMULA[formula];
  const filas: CalculoFila[] = p.filas.map((f) => {
    const v = CAMPOS_MEDIDA.map((c) => leerDecimal(f[c]));
    const { d, error } = descuentoDeFila(f);
    if (v.includes("invalido") || v.includes(0)) return { bruto: null, neto: null, falta: false, error: "Una medida no es un número.", medidas: null, descuento: d };
    if (v.includes(null)) return { bruto: null, neto: null, falta: true, error, medidas: null, descuento: d };
    const [d1, d2, largo] = v as number[];
    const fuera =
      Math.max(d1, d2) > rango.diametroMax ? `Ø de ${Math.max(d1, d2)} ${u.diametro}: pasa del tope de ${rango.diametroMax}.`
      : largo > rango.largoMax ? `Largo de ${largo} ${u.largo}: pasa del tope de ${rango.largoMax}.`
      : null;
    return { bruto: null, neto: null, falta: false, error: fuera ?? error, medidas: { d1, d2, largo }, descuento: d };
  });
  const validas = filas.map((c, i) => ({ c, f: p.filas[i] })).filter(({ c }) => c.medidas && !c.error);
  const { d: descuentoLote, error: errorTextoLote } = descuentoDelLote(p.lote);
  const r = cubicarConDescuentos(
    formula,
    validas.map(({ c, f }) => ({ especie: f.especie, ...c.medidas!, descuento: c.descuento })),
    descuentoLote,
  );
  validas.forEach(({ c }, i) => {
    const t = r.porTroza[i];
    if ("error" in t) c.error = t.error;
    else { c.bruto = t.bruto; c.neto = t.neto; }
  });
  return {
    ...r,
    filas,
    descuentoLote,
    errorLote: errorTextoLote ?? r.errorLote,
    completas: filas.filter((c) => c.neto != null).length,
    conError: filas.filter((c) => c.error).length,
  };
}

/** Las filas para «Guardar en la cuenta» y los descuentos de cada una, alineados por índice. */
export function paraGuardar(
  p: Planilla,
  calculo: CalculoPlanilla,
  formula: FormulaTrozas,
): { rows: Array<FilaTroza & { codigo?: string }>; descuentosPorTroza: Array<DescuentoTroza | null> } {
  const rows: Array<FilaTroza & { codigo?: string }> = [];
  const descuentosPorTroza: Array<DescuentoTroza | null> = [];
  calculo.filas.forEach((c, i) => {
    if (c.neto == null || !c.medidas) return;
    const f = p.filas[i];
    rows.push({
      id: f.codigo ?? `troza-${i + 1}`,
      ...(f.codigo ? { codigo: f.codigo } : {}),
      especie: f.especie,
      ...c.medidas,
      m3: formula === "smalian" ? c.neto : 0,
      ...(formula === "oxapampina" ? { pt: c.neto } : {}),
    });
    descuentosPorTroza.push(c.descuento);
  });
  return { rows, descuentosPorTroza };
}

/* ── El hook ─────────────────────────────────────────────────────────────── */

/** Lo que el servidor sabe de la guía: trozas en pulgadas/pies, lo declarado y las CUB que ya salieron de ella. */
export function usePrefillLoth(gtfId: string) {
  const [prefill, setPrefill] = useState<PrefillOrigenLoth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    let vivo = true;
    setError(null);
    fetch(`${RUTA_CUBICACIONES_TROZAS}/origen?tipo=loth&id=${encodeURIComponent(gtfId)}`, { credentials: "include" })
      .then(async (res) => {
        const j = (await res.json().catch(() => null)) as { prefill?: PrefillOrigenLoth; message?: string } | null;
        if (!vivo) return;
        if (res.ok && j?.prefill) setPrefill(j.prefill);
        else setError(j?.message || (res.status === 403 ? "Tu rol no puede cubicar guías." : `No se pudo leer la guía (${res.status}).`));
      })
      .catch(() => vivo && setError("Sin conexión: no se pudo leer la guía. Prueba de nuevo."));
    return () => { vivo = false; };
  }, [gtfId, vuelta]);
  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  return { prefill, error, cargando: !prefill && !error, recargar };
}

/** La planilla de cada fórmula (por separado) y sus cuentas en vivo. */
export function usePlanillaGuia(prefill: PrefillOrigenLoth | null, items: readonly GtfItem[] | null) {
  const [formula, setFormula] = useState<FormulaTrozas>("oxapampina");
  const [planillas, setPlanillas] = useState<Partial<Record<FormulaTrozas, Planilla>>>({});
  const planilla = planillas[formula] ?? (prefill ? planillaInicial(prefill, items, formula) : null);

  const cambiar = useCallback(
    (fn: (p: Planilla) => Planilla) =>
      setPlanillas((prev) => {
        const base = prev[formula] ?? (prefill ? planillaInicial(prefill, items, formula) : null);
        return base ? { ...prev, [formula]: fn(base) } : prev;
      }),
    [formula, prefill, items],
  );
  const set = useCallback(
    (i: number, campo: CampoCubicar, texto: string) =>
      cambiar((p) => ({ ...p, filas: p.filas.map((f, j) => (j === i ? { ...f, [campo]: texto } : f)) })),
    [cambiar],
  );
  /** `clave` null = el % general del lote. */
  const setLote = useCallback(
    (clave: string | null, campo: "pct" | "menos", texto: string) =>
      cambiar((p) => {
        if (clave == null) return { ...p, lote: { ...p.lote, pct: texto } };
        const previo = p.lote.porEspecie[clave] ?? { pct: "", menos: "" };
        return { ...p, lote: { ...p.lote, porEspecie: { ...p.lote.porEspecie, [clave]: { ...previo, [campo]: texto } } } };
      }),
    [cambiar],
  );

  const calculo = useMemo(() => (planilla ? calcularPlanilla(planilla, formula) : null), [planilla, formula]);
  /* Lo tipeado en cualquiera de las dos: cerrar lo pierde. */
  const tocadas = useMemo(
    () =>
      Object.values(planillas).reduce(
        (n, p) =>
          n +
          (p?.filas.filter((f) => CAMPOS_MEDIDA.some((c) => f[c] !== f.guia[c]) || CAMPOS_DESCUENTO.some((c) => f[c].trim())).length ?? 0) +
          (p && (p.lote.pct.trim() || Object.values(p.lote.porEspecie).some((v) => v.pct.trim() || v.menos.trim())) ? 1 : 0),
        0,
      ),
    [planillas],
  );
  return { formula, setFormula, planilla, calculo, set, setLote, tocadas };
}
