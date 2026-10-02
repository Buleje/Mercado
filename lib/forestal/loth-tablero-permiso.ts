/**
 * El permiso que se está controlando (ADR-459): de qué plan de manejo son las
 * trozas, con qué datos se presenta y cuánto le queda de vigencia.
 *
 * Antes la banda del Control del permiso mostraba la CARÁTULA del libro: un
 * libro con tres planes vivos (Blas, 2-10-2026) decía el mismo título para
 * las tres operaciones. Con un plan elegido, la banda habla de ESE plan.
 *
 * Vocabulario (contrato ADR-459): en una plantación no se dice «autorizado»
 * sino «registrado» — su base es lo inscrito en el registro, no un censo.
 *
 * PURO: sin React ni fetch.
 */

import { formatDate } from "@/lib/format";
import { limaDateKey } from "@/lib/utils";
import { esPlanDePlantacion } from "./loth-poa";
import { diaDelLibro, diasEntre } from "./loth-tablero-trozas";
import { metaDe } from "./loth-tipos-plan";

/** Lo que el tablero usa de una fila de `GET /api/admin/forestal/plan`. */
export interface PlanTablero {
  id: string;
  planType: string | null;
  planNumber: string | null;
  alias: string | null;
  tituloHabilitante: string | null;
  titularName: string | null;
  resolucionNumber: string | null;
  resolucionDate: string | null;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
  estado: string | null;
  isActive: boolean;
}

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** De la fila cruda de la API a `PlanTablero`; `null` si no trae id. */
export function planDesdeJson(raw: unknown): PlanTablero | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = texto(r.id);
  if (!id) return null;
  return {
    id,
    planType: texto(r.planType),
    planNumber: texto(r.planNumber),
    alias: texto(r.alias),
    tituloHabilitante: texto(r.tituloHabilitante),
    titularName: texto(r.titularName),
    resolucionNumber: texto(r.resolucionNumber),
    resolucionDate: texto(r.resolucionDate),
    vigenciaDesde: texto(r.vigenciaDesde),
    vigenciaHasta: texto(r.vigenciaHasta),
    estado: texto(r.estado),
    isActive: r.isActive === true,
  };
}

/** Cómo se nombra el plan en el selector y en los reportes. */
export function nombreDelPlan(p: Pick<PlanTablero, "planNumber" | "alias" | "titularName">): string {
  return p.planNumber ?? p.alias ?? p.titularName ?? "Plan sin número";
}

export type TonoVigencia = "ok" | "atencion" | "vencida" | "sin-fecha";

export interface VigenciaPlan {
  /** «Faltan 104 días», «Vence hoy», «Vencida hace 3 días», «Sin vencimiento». */
  texto: string;
  /** «15 ene. 2026 → 14 ene. 2027», si hay fechas. */
  rango: string | null;
  /** «14 ene. 2027»: el último día, si lo hay. */
  hasta: string | null;
  tono: TonoVigencia;
  diasQueFaltan: number | null;
}

/** Desde cuántos días antes del vencimiento la vigencia se pinta en ámbar. */
export const AVISO_VIGENCIA_DIAS = 30;

const ESTADOS_CERRADOS: Record<string, string> = { vencido: "Vencido", cerrado: "Cerrado", suspendido: "Suspendido" };

export function vigenciaDelPlan(
  p: Pick<PlanTablero, "vigenciaDesde" | "vigenciaHasta" | "estado" | "planType" | "planNumber" | "tituloHabilitante">,
  hoyKey: string = limaDateKey(),
): VigenciaPlan {
  const desde = diaDelLibro(p.vigenciaDesde);
  const hasta = diaDelLibro(p.vigenciaHasta);
  const rango =
    desde || hasta
      ? `${desde ? formatDate(desde, { soloFecha: true }) : "?"} → ${hasta ? formatDate(hasta, { soloFecha: true }) : "?"}`
      : null;
  const fin = hasta ? formatDate(hasta, { soloFecha: true }) : null;
  const base = { rango, hasta: fin };
  const cerrado = ESTADOS_CERRADOS[(p.estado ?? "").toLowerCase()];
  if (cerrado) return { ...base, texto: cerrado, tono: "vencida", diasQueFaltan: null };
  if (!hasta) {
    /* El registro de una plantación no vence: se inscribe y queda. */
    return {
      ...base,
      texto: esPlanDePlantacion(p) ? "Sin vencimiento" : "Sin fecha de fin",
      tono: "sin-fecha",
      diasQueFaltan: null,
    };
  }
  const dias = diasEntre(hoyKey, hasta);
  if (dias < 0) {
    const n = -dias;
    return { ...base, texto: `Vencida hace ${n} ${n === 1 ? "día" : "días"}`, tono: "vencida", diasQueFaltan: dias };
  }
  if (dias === 0) return { ...base, texto: "Vence hoy", tono: "atencion", diasQueFaltan: 0 };
  return {
    ...base,
    texto: `Faltan ${dias} ${dias === 1 ? "día" : "días"}`,
    tono: dias <= AVISO_VIGENCIA_DIAS ? "atencion" : "ok",
    diasQueFaltan: dias,
  };
}

export interface BandaPermiso {
  nombre: string;
  /** «PO», «Plantación», «PGMF»… */
  tipo: string;
  esPlantacion: boolean;
  /** Cómo se llama la base del volumen: «Registrado» (plantación) o «Autorizado». */
  baseLabel: "Registrado" | "Autorizado";
  tituloHabilitante: string | null;
  titular: string | null;
  /** «RDF N° 001-2026 · 15 ene. 2026». */
  resolucion: string | null;
  vigencia: VigenciaPlan;
}

/** Los datos de la banda de arriba para un plan. */
export function bandaDelPlan(p: PlanTablero, hoyKey: string = limaDateKey()): BandaPermiso {
  const plantacion = esPlanDePlantacion(p);
  const fechaRes = diaDelLibro(p.resolucionDate);
  const resolucion =
    [p.resolucionNumber, fechaRes ? formatDate(fechaRes, { soloFecha: true }) : null].filter(Boolean).join(" · ") || null;
  return {
    nombre: nombreDelPlan(p),
    tipo: plantacion ? metaDe("PLANTACION").sigla : metaDe(p.planType).sigla,
    esPlantacion: plantacion,
    baseLabel: plantacion ? "Registrado" : "Autorizado",
    tituloHabilitante: p.tituloHabilitante,
    titular: p.titularName,
    resolucion,
    vigencia: vigenciaDelPlan(p, hoyKey),
  };
}
