/**
 * loth-trace — motor de trazabilidad del Libro TH: agrupa las líneas del libro
 * por ÁRBOL y calcula, para cada uno, la cadena completa (tala → trozado →
 * despacho/consumo → producto → despacho PT) + métricas (rendimiento, merma,
 * etapas alcanzadas, estado de cadena) + alertas por árbol (invariantes visibles).
 *
 * PURO y client-safe. Lo consumen `LothTraceView`/`LothTraceCard` (UI) y
 * `loth-pasaporte-print` (el pasaporte imprimible por árbol para OSINFOR).
 */

import type { LothEntryDTO } from "./loth-constants";

const n = (v: string | null | undefined): number => (v == null ? 0 : Number(v) || 0);
const sumVol = (rows: LothEntryDTO[], key: "volumeM3" | "quantity") => rows.reduce((a, r) => a + n(r[key]), 0);

export type ChainStatus = "completa" | "parcial" | "iniciada";

export interface TraceAlert {
  level: "error" | "warn";
  message: string;
}

export interface TraceOperation {
  tree: string;
  species: string | null;
  scientific: string | null;
  cites: boolean;
  /** Líneas crudas por sección (para el timeline de detalle). */
  tala: LothEntryDTO[];
  trozado: LothEntryDTO[];
  despachoTroza: LothEntryDTO[];
  consumo: LothEntryDTO[];
  producto: LothEntryDTO[];
  despachoPT: LothEntryDTO[];
  // ── métricas ──
  talaVolM3: number;
  trozadoVolM3: number;
  consumoVolM3: number;
  trozasCount: number;
  trozasDespachadas: number;
  productoQty: number;
  despachoPtCount: number;
  /** Rendimiento de aprovechamiento (trozado / talado) en %. */
  rendimientoPct: number;
  mermaVolM3: number;
  /** Etapas de las 6 SERFOR con al menos un registro (0-6). */
  stagesReached: number;
  chain: ChainStatus;
  /** La madera salió del bosque (despacho de troza o de producto). */
  movilizada: boolean;
  alerts: TraceAlert[];
  gps: { lat: number; lng: number } | null;
  firstDate: string | null;
  lastDate: string | null;
}

const validGps = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);

function gpsOf(rows: LothEntryDTO[]): { lat: number; lng: number } | null {
  for (const r of rows) {
    if (r.gpsLat != null && r.gpsLng != null) {
      const lat = Number(r.gpsLat);
      const lng = Number(r.gpsLng);
      if (validGps(lat, lng)) return { lat, lng };
    }
  }
  return null;
}

function dateRange(rows: LothEntryDTO[]): { first: string | null; last: string | null } {
  const dates = rows.map((r) => r.entryDate).filter(Boolean).sort();
  return { first: dates[0] ?? null, last: dates[dates.length - 1] ?? null };
}

const clampPct = (x: number) => Math.max(0, Math.min(999, Math.round(x)));

/**
 * Arma la operación de cada árbol a partir de todas las líneas del libro.
 * Enlaces: tala/trozado por `treeCode`; despacho/consumo por `trozaCode` que
 * pertenece al árbol; producto/despacho PT por la troza de origen (fallback a
 * especie para líneas viejas sin trozaCode).
 */
export function buildTraceOperations(entries: LothEntryDTO[]): TraceOperation[] {
  const reg = entries.filter((e) => e.status !== "anulado");
  const trees = Array.from(new Set(reg.filter((e) => e.section === "tala" && e.treeCode).map((e) => e.treeCode as string)));

  return trees
    .map((tree): TraceOperation => {
      const tala = reg.filter((e) => e.section === "tala" && e.treeCode === tree);
      const trozado = reg.filter((e) => e.section === "trozado" && e.treeCode === tree);
      const trozaCodes = new Set(trozado.map((t) => t.trozaCode).filter(Boolean));
      const belongs = (c: string | null) => !!c && (trozaCodes.has(c) || c.startsWith(`${tree}-`) || c === tree);
      const bySpeciesFallback = (e: LothEntryDTO, species: string | null) =>
        e.trozaCode ? belongs(e.trozaCode) : !!species && e.speciesCommon === species;

      const species = tala[0]?.speciesCommon ?? trozado[0]?.speciesCommon ?? null;
      const despachoTroza = reg.filter((e) => e.section === "despacho_troza" && belongs(e.trozaCode));
      const consumo = reg.filter((e) => e.section === "consumo_troza" && belongs(e.trozaCode));
      const producto = reg.filter((e) => e.section === "producto_terminado" && bySpeciesFallback(e, species));
      const despachoPT = reg.filter((e) => e.section === "despacho_producto" && bySpeciesFallback(e, species));

      const talaVolM3 = sumVol(tala, "volumeM3");
      const trozadoVolM3 = sumVol(trozado, "volumeM3");
      const consumoVolM3 = sumVol(consumo, "volumeM3");
      const rendimientoPct = talaVolM3 > 0 ? clampPct((trozadoVolM3 / talaVolM3) * 100) : 0;
      const mermaVolM3 = Math.max(0, talaVolM3 - trozadoVolM3);

      const stagesReached = [tala, trozado, despachoTroza, consumo, producto, despachoPT].filter((s) => s.length > 0).length;
      const movilizada = despachoTroza.length > 0 || despachoPT.length > 0;
      const chain: ChainStatus = movilizada ? "completa" : trozado.length > 0 || consumo.length > 0 || producto.length > 0 ? "parcial" : "iniciada";

      const alerts: TraceAlert[] = [];
      if (talaVolM3 > 0 && trozadoVolM3 > talaVolM3 * 1.005) {
        alerts.push({ level: "error", message: `El trozado (${trozadoVolM3.toFixed(3)} m³) supera lo talado (${talaVolM3.toFixed(3)} m³).` });
      }
      if (trozadoVolM3 > 0 && rendimientoPct < 40) {
        alerts.push({ level: "warn", message: `Rendimiento bajo (${rendimientoPct}%) — merma de ${mermaVolM3.toFixed(3)} m³.` });
      }

      const gps = gpsOf([...tala, ...trozado]);
      const { first, last } = dateRange([...tala, ...trozado, ...despachoTroza, ...consumo, ...producto, ...despachoPT]);

      return {
        tree,
        species,
        scientific: tala[0]?.speciesScientific ?? trozado[0]?.speciesScientific ?? null,
        cites: tala[0]?.cites ?? trozado[0]?.cites ?? false,
        tala,
        trozado,
        despachoTroza,
        consumo,
        producto,
        despachoPT,
        talaVolM3,
        trozadoVolM3,
        consumoVolM3,
        trozasCount: trozado.length,
        trozasDespachadas: despachoTroza.length,
        productoQty: sumVol(producto, "quantity"),
        despachoPtCount: despachoPT.length,
        rendimientoPct,
        mermaVolM3,
        stagesReached,
        chain,
        movilizada,
        alerts,
        gps,
        firstDate: first,
        lastDate: last,
      };
    })
    .sort((a, b) => b.talaVolM3 - a.talaVolM3);
}

export interface TraceSummary {
  totalTrees: number;
  talaVolM3: number;
  trozadoVolM3: number;
  rendimientoGlobalPct: number;
  completas: number;
  parciales: number;
  conAlertas: number;
  citesCount: number;
  conGps: number;
  species: string[];
}

export function buildTraceSummary(ops: TraceOperation[]): TraceSummary {
  const talaVolM3 = ops.reduce((a, o) => a + o.talaVolM3, 0);
  const trozadoVolM3 = ops.reduce((a, o) => a + o.trozadoVolM3, 0);
  return {
    totalTrees: ops.length,
    talaVolM3,
    trozadoVolM3,
    rendimientoGlobalPct: talaVolM3 > 0 ? clampPct((trozadoVolM3 / talaVolM3) * 100) : 0,
    completas: ops.filter((o) => o.chain === "completa").length,
    parciales: ops.filter((o) => o.chain === "parcial").length,
    conAlertas: ops.filter((o) => o.alerts.length > 0).length,
    citesCount: ops.filter((o) => o.cites).length,
    conGps: ops.filter((o) => o.gps != null).length,
    species: Array.from(new Set(ops.map((o) => o.species).filter((s): s is string => !!s))).sort(),
  };
}
