/**
 * loth-trace — motor de trazabilidad del Libro TH: agrupa las líneas del libro
 * por ÁRBOL y calcula, para cada uno, la cadena completa (tala → trozado →
 * despacho/consumo → producto → despacho PT) + métricas (rendimiento, merma,
 * etapas alcanzadas, estado de cadena) + alertas por árbol (invariantes visibles).
 *
 * PURO y client-safe. Lo consumen `LothTraceView`/`LothTraceCard` (UI) y
 * `loth-pasaporte-print` (el pasaporte imprimible por árbol para OSINFOR).
 */

import { diasDeRegistro, PLAZO_REGISTRO_DIAS, type LothEntryDTO } from "./loth-constants";
import { DIAS_SIN_TROZAR } from "./loth-arbol";
import { umbralDe, veredictoMerma, UMBRALES_DEFAULT, type UmbralesMerma, type VeredictoMerma } from "./loth-trace-umbrales";

const n = (v: string | null | undefined): number => (v == null ? 0 : Number(v) || 0);
const sumVol = (rows: LothEntryDTO[], key: "volumeM3" | "quantity") => rows.reduce((a, r) => a + n(r[key]), 0);

/**
 * Día calendario UTC de una fecha. Las fechas del libro son date-only y Lima es
 * UTC−5: restar milisegundos en hora local da un día de diferencia según la hora
 * a la que se mire la pantalla.
 */
const diaUtc = (iso: string | Date): number | null => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86_400_000);
};

/** Días calendario entre dos fechas del libro (b − a). null si falta alguna. */
const diasEntre = (a: string | Date | null | undefined, b: string | Date | null | undefined): number | null => {
  if (!a || !b) return null;
  const da = diaUtc(a);
  const db = diaUtc(b);
  return da == null || db == null ? null : db - da;
};

/** La fecha más temprana de un grupo de líneas. */
const primeraFecha = (rows: LothEntryDTO[]): string | null => {
  const fechas = rows.map((r) => r.entryDate).filter(Boolean).sort();
  return fechas[0] ?? null;
};

export type ChainStatus = "completa" | "parcial" | "iniciada";

/** Las 6 etapas SERFOR, en orden, tal como se recorren en la pantalla. */
export const TRACE_ETAPAS = ["Tala", "Trozado", "Desp. troza", "Consumo", "Producto", "Desp. PT"] as const;

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
  /** Merma sobre lo talado, en % con un decimal (la otra cara del rendimiento). */
  mermaPct: number;
  /** Dónde cae esa merma contra el umbral de SU especie. */
  mermaVeredicto: VeredictoMerma;
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
  // ── tiempo (el recorrido no es sólo qué pasó, también cuándo) ──
  /** Fecha de la primera línea de cada una de las 6 etapas (misma posición que `TRACE_ETAPAS`). */
  etapaFechas: (string | null)[];
  /** Días entre la tala y el primer trozado. */
  diasTalaTrozado: number | null;
  /** Días entre la tala y la primera salida (despacho de troza o de producto). */
  diasTalaSalida: number | null;
  /**
   * Días desde la última actividad, con la cadena todavía abierta. Sólo se
   * calcula si quien llama pasa `hoy`: sin esa fecha explícita el resultado
   * dependería del reloj y los tests dejarían de ser deterministas.
   */
  diasParado: number | null;
  /** Líneas asentadas fuera del plazo de registro (15 días, RDE 264-2019). */
  tardias: number;
  /** El peor atraso de registro del árbol, en días. */
  maxDiasRegistro: number | null;
  // ── huecos de atribución (lo que impide trazar hasta la pieza) ──
  /**
   * Guías declaradas en el libro que no existen entre las GTF emitidas. Sólo se
   * puede saber si quien llama pasa `gtfEmitidas`; sin esa lista queda vacío,
   * porque «no la encontré» y «no la busqué» no son lo mismo.
   */
  gtfsFantasma: string[];
  /**
   * Líneas de producto terminado / despacho de PT que no dicen de qué troza
   * salieron. Sin ese dato la atribución cae al fallback por ESPECIE: el mismo
   * volumen se le cuenta a todos los árboles de esa especie.
   */
  productoSinTroza: number;
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
export function buildTraceOperations(
  entries: LothEntryDTO[],
  opts: {
    /** Fecha de referencia para «hace cuántos días». Sin ella no hay alertas de tiempo. */
    hoy?: Date;
    /** Umbrales de merma por especie (default: los generales). */
    umbrales?: UmbralesMerma;
    /** N° de las GTF realmente emitidas, para detectar las que el libro inventa. */
    gtfEmitidas?: Set<string>;
  } = {},
): TraceOperation[] {
  const umbrales = opts.umbrales ?? UMBRALES_DEFAULT;
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

      // ── tiempo: cuándo pasó cada etapa y cuánto tardó en moverse ──
      const etapas = [tala, trozado, despachoTroza, consumo, producto, despachoPT];
      const etapaFechas = etapas.map(primeraFecha);
      const fechaTala = etapaFechas[0];
      const fechaSalida = [etapaFechas[2], etapaFechas[5]].filter(Boolean).sort()[0] ?? null;
      const diasTalaTrozado = diasEntre(fechaTala, etapaFechas[1]);
      const diasTalaSalida = diasEntre(fechaTala, fechaSalida);

      const todas = [...tala, ...trozado, ...despachoTroza, ...consumo, ...producto, ...despachoPT];
      const atrasos = todas
        .map((e) => diasDeRegistro(e.entryDate, e.createdAt ?? null))
        .filter((d): d is number => d != null);
      const tardias = atrasos.filter((d) => d > PLAZO_REGISTRO_DIAS).length;
      const maxDiasRegistro = atrasos.length > 0 ? Math.max(...atrasos) : null;

      const gps = gpsOf([...tala, ...trozado]);
      const { first, last } = dateRange(todas);
      // Parado = la cadena sigue abierta y nadie la tocó desde `last`.
      const diasParado = opts.hoy && !movilizada ? diasEntre(last, opts.hoy) : null;

      const mermaPct = talaVolM3 > 0 ? Math.round((mermaVolM3 / talaVolM3) * 1000) / 10 : 0;
      const umbral = umbralDe(umbrales, species);
      const mermaVeredicto = trozadoVolM3 > 0 ? veredictoMerma(mermaPct, umbral) : "ok";

      const alerts: TraceAlert[] = [];
      if (talaVolM3 > 0 && trozadoVolM3 > talaVolM3 * 1.005) {
        alerts.push({ level: "error", message: `El trozado (${trozadoVolM3.toFixed(3)} m³) supera lo talado (${talaVolM3.toFixed(3)} m³).` });
      }
      // La merma se mide contra el umbral de SU especie: un 52% que antes pasaba
      // en silencio (porque el rendimiento no bajaba de 40%) ahora se ve.
      if (mermaVeredicto !== "ok") {
        alerts.push({
          level: mermaVeredicto === "grave" ? "error" : "warn",
          message: `Merma del ${mermaPct.toFixed(1)}% (${mermaVolM3.toFixed(3)} m³ de ${talaVolM3.toFixed(3)}) — el umbral de ${species ?? "la especie"} avisa desde ${umbral.aviso}%.`,
        });
      }
      if (tardias > 0) {
        alerts.push({
          level: "warn",
          message: `${tardias} línea(s) asentada(s) fuera del plazo de ${PLAZO_REGISTRO_DIAS} días — la peor, ${maxDiasRegistro} días después de la actividad.`,
        });
      }
      // Una guía que el libro declara pero que nadie emitió: o salió fuera del
      // sistema, o el número está mal tipeado. Las dos cosas se explican ante
      // una fiscalización, y ninguna se ve si no se cruzan las dos listas.
      const gtfsFantasma = opts.gtfEmitidas ? gtfs.filter((g) => !opts.gtfEmitidas!.has(g)) : [];
      if (gtfsFantasma.length > 0) {
        alerts.push({
          level: "error",
          message: `${gtfsFantasma.join(", ")} ${gtfsFantasma.length === 1 ? "está declarada" : "están declaradas"} en el libro pero no figura${gtfsFantasma.length === 1 ? "" : "n"} entre las guías emitidas.`,
        });
      }

      const productoSinTroza = [...producto, ...despachoPT].filter((e) => !e.trozaCode).length;
      if (productoSinTroza > 0) {
        alerts.push({
          level: "warn",
          message: `${productoSinTroza} línea(s) de producto no declaran de qué troza salieron: ese volumen se atribuye por especie y se le cuenta a todos los árboles de ${species ?? "la especie"}.`,
        });
      }

      if (diasParado != null && diasParado > DIAS_SIN_TROZAR) {
        alerts.push({
          level: "warn",
          message:
            trozasEnPatio > 0
              ? `${trozasEnPatio} troza(s) llevan ${diasParado} días en patio sin salir (${patioVolM3.toFixed(3)} m³).`
              : `Sin movimiento hace ${diasParado} días: el árbol quedó en la etapa «${TRACE_ETAPAS[stagesReached - 1] ?? "Tala"}».`,
        });
      }

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
        mermaPct,
        mermaVeredicto,
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
        etapaFechas,
        diasTalaTrozado,
        diasTalaSalida,
        diasParado,
        tardias,
        maxDiasRegistro,
        gtfsFantasma,
        productoSinTroza,
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
  /** Volumen que se perdió entre el tocón y las trozas. */
  mermaVolM3: number;
  /** Árboles con merma por encima del escalón grave de su especie. */
  mermaGrave: number;
  /** Árboles con al menos una línea asentada fuera del plazo de registro. */
  conTardias: number;
  /** Guías declaradas en el libro que no existen entre las emitidas (sin repetir). */
  gtfsFantasma: string[];
  /** Árboles cuyo producto no dice de qué troza salió. */
  conProductoSinTroza: number;
  /** Mediana de días entre la tala y la primera salida (sólo los que salieron). */
  diasTalaSalidaMediana: number | null;
}

export function buildTraceSummary(ops: TraceOperation[]): TraceSummary {
  const talaVolM3 = ops.reduce((a, o) => a + o.talaVolM3, 0);
  const trozadoVolM3 = ops.reduce((a, o) => a + o.trozadoVolM3, 0);
  const tiempos = ops.map((o) => o.diasTalaSalida).filter((d): d is number => d != null).sort((a, b) => a - b);
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
    mermaVolM3: ops.reduce((a, o) => a + o.mermaVolM3, 0),
    mermaGrave: ops.filter((o) => o.mermaVeredicto === "grave").length,
    conTardias: ops.filter((o) => o.tardias > 0).length,
    gtfsFantasma: Array.from(new Set(ops.flatMap((o) => o.gtfsFantasma))).sort(),
    conProductoSinTroza: ops.filter((o) => o.productoSinTroza > 0).length,
    diasTalaSalidaMediana: tiempos.length > 0 ? tiempos[Math.floor((tiempos.length - 1) / 2)] : null,
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
