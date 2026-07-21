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
  /** Estado de cada troza del árbol: despachada, consumida o en patio (sin salir). */
  trozaEstado: Record<string, "despachada" | "consumida" | "patio">;
  /** Trozas trozadas que aún no se despacharon ni consumieron (inventario en patio). */
  trozasEnPatio: number;
  patioVolM3: number;
  /** N° de GTF que tocaron a este árbol (despacho de troza + de producto). */
  gtfs: string[];
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

      // Estado de cada troza: despachada (salió con GTF), consumida (al aserrío)
      // o en patio (trozada pero sin destino aún = inventario).
      const despachadasCodes = new Set(despachoTroza.map((d) => d.trozaCode).filter(Boolean));
      const consumidasCodes = new Set(consumo.map((c) => c.trozaCode).filter(Boolean));
      const trozaEstado: Record<string, "despachada" | "consumida" | "patio"> = {};
      let patioVolM3 = 0;
      for (const t of trozado) {
        if (!t.trozaCode) continue;
        const estado = despachadasCodes.has(t.trozaCode) ? "despachada" : consumidasCodes.has(t.trozaCode) ? "consumida" : "patio";
        trozaEstado[t.trozaCode] = estado;
        if (estado === "patio") patioVolM3 += n(t.volumeM3);
      }
      const trozasEnPatio = Object.values(trozaEstado).filter((e) => e === "patio").length;
      const gtfs = Array.from(new Set([...despachoTroza, ...despachoPT].map((e) => e.gtfNumber).filter((g): g is string => !!g))).sort();

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
        trozaEstado,
        trozasEnPatio,
        patioVolM3,
        gtfs,
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
  conPatio: number;
  patioVolM3: number;
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
    conPatio: ops.filter((o) => o.trozasEnPatio > 0).length,
    patioVolM3: ops.reduce((a, o) => a + o.patioVolM3, 0),
    species: Array.from(new Set(ops.map((o) => o.species).filter((s): s is string => !!s))).sort(),
  };
}

export interface TraceMatch {
  matched: boolean;
  /** Por qué coincidió (para el hint de búsqueda inversa). */
  via: "código" | "especie" | "troza" | "gtf" | null;
  hint: string | null;
}

/**
 * Búsqueda inversa: ¿este árbol coincide con la consulta? Matchea código de
 * árbol, especie, código de TROZA o N° de GTF — la pregunta que hace OSINFOR
 * ("¿de qué árbol salió esta troza / este GTF?").
 */
export function matchesTrace(op: TraceOperation, query: string): TraceMatch {
  const q = query.trim().toLowerCase();
  if (!q) return { matched: true, via: null, hint: null };
  if (op.tree.toLowerCase().includes(q)) return { matched: true, via: "código", hint: null };
  if ((op.species ?? "").toLowerCase().includes(q) || (op.scientific ?? "").toLowerCase().includes(q)) return { matched: true, via: "especie", hint: null };
  const troza = op.trozado.find((t) => t.trozaCode?.toLowerCase().includes(q));
  if (troza) return { matched: true, via: "troza", hint: `coincide la troza ${troza.trozaCode}` };
  const gtf = op.gtfs.find((g) => g.toLowerCase().includes(q));
  if (gtf) return { matched: true, via: "gtf", hint: `coincide la GTF ${gtf}` };
  return { matched: false, via: null, hint: null };
}

/** CSV del resumen de trazabilidad (una fila por árbol). Sin BOM (lo agrega el descargador). */
export function buildTraceCsv(ops: TraceOperation[]): string {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["Árbol", "Especie", "Científico", "CITES", "Talado m³", "Trozado m³", "Rendimiento %", "Merma m³", "Trozas", "Despachadas", "Consumidas", "En patio", "Patio m³", "Estado cadena", "Etapas", "GTFs", "Alertas"];
  const estados = (o: TraceOperation) => Object.values(o.trozaEstado);
  const rows = ops.map((o) => [
    o.tree, o.species ?? "", o.scientific ?? "", o.cites ? "Sí" : "No",
    o.talaVolM3.toFixed(4), o.trozadoVolM3.toFixed(4), o.rendimientoPct, o.mermaVolM3.toFixed(4),
    o.trozasCount, estados(o).filter((e) => e === "despachada").length, estados(o).filter((e) => e === "consumida").length, o.trozasEnPatio, o.patioVolM3.toFixed(4),
    o.chain, `${o.stagesReached}/6`, o.gtfs.join(" | "), o.alerts.map((a) => a.message).join(" | "),
  ]);
  return [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}
