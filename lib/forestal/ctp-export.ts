/**
 * ctp-export.ts — exporta el Libro de Operaciones CTP a Excel (.xlsx):
 * hojas Resumen · Ingresos · Producción · Despacho · Balance por especie ·
 * Saldos. Client-only con import dinámico de exceljs. Trae los datos de los
 * endpoints del CTP y arma el workbook para presentar/archivar (interno, no
 * oficial SERFOR).
 *
 * Exporta el PERÍODO seleccionado en el módulo, no el histórico completo: un
 * libro se presenta por período, y un Excel que no dice de qué lapso habla no
 * sirve para archivar.
 */
import {
  applyCtpPeriodParams,
  ctpPeriodFileSuffix,
  type CtpPeriod,
} from "./ctp-period";
import { PLAZO_REGISTRO_DIAS, diasDeRegistro, estaFueraDePlazo, parseCitesPermiso } from "./ctp-compliance";
import { especieCoincide } from "./ctp-ficha-types";
import { RENDIMIENTO_REF_ASERRADA, evaluarRendimiento } from "./ctp-rendimiento";
import {
  faltantesIngreso,
  faltantesProduccion,
  faltantesSalida,
  resumenFaltantes,
  unidadOficial,
} from "./loctp-campos";
import { claveProducto, cuadrosResumen, type StockInicial } from "./loctp-resumenes";
import { calcularMetaEspecies } from "./ctp-cadena-lote";
import { filasConsumo } from "./loctp-consumos";
import { loteAserrioPorCorrida } from "./lotes-aserrio";
import {
  derivarFuentes,
  filasRetrozado,
  retrozadoPorEspecie,
  type RetrozoParaApartado,
} from "./loctp-apartados";

interface Ingreso {
  entryDate: string; gtfNumber: string; gtfDate: string | null; providerName: string;
  speciesCommonName: string; speciesScientificName: string | null; speciesCites: boolean;
  productType: string; volumeM3: string; pieces: number; status: string; createdAt: string;
  notes: string | null;
}
interface WoodEntryStats {
  totalCount: number; totalVolumeM3: number; totalPieces: number; speciesCount: number;
  citesCount: number; citesVolumeM3: number; lateCount: number;
  byStatus: Record<string, number>;
}
interface CtpRow {
  id?: string;
  lineNo: number; entryDate: string; gtfIngreso: string | null; speciesCommon: string | null;
  speciesScientific: string | null; cites: boolean; productType: string | null;
  volumeInputM3: string | null; rendimientoPct: string | null; quantity: string | null;
  unit: string | null; pieces: number | null; gtfNumber: string | null; destino: string | null;
  status: string;
  /** Casilleros del formato oficial (ADR-311) + el lote, que se deriva. */
  docType?: string | null; codigoProducto?: string | null; observations?: string | null;
  lote?: string | null; lineaProduccion?: string | null;
}
interface SpeciesBalance {
  especie: string; scientific: string | null; cites: boolean;
  ingresoM3: number; pendienteM3: number; consumidoM3: number; saldoM3: number; ingresosCount: number;
}
interface Saldos {
  materiaPrima: {
    ingresoM3: number; ingresosCount: number; consumidoM3: number; saldoM3: number;
    pendienteM3: number; especiesEnNegativo: number;
  };
  porEspecie: SpeciesBalance[];
  productos: { producto: string; producido: number; despachado: number; stock: number }[];
}

const day = (v: string | null) => (v ? new Date(v) : null);

async function getJson<T>(url: string, fallback: T): Promise<T> {
  try { const r = await fetch(url, { credentials: "include" }); return r.ok ? await r.json() : fallback; }
  catch { return fallback; }
}

/** `/api/admin/forestal/...?<base>&from=&to=` acotado al período. */
const withPeriod = (path: string, base: Record<string, string>, period: CtpPeriod) =>
  `${path}?${applyCtpPeriodParams(new URLSearchParams(base), period)}`;

export async function exportarLibroCtp(period: CtpPeriod): Promise<void> {
  const [ing, prod, desp, sal, trz, fic, lot, gra] = await Promise.all([
    getJson<{ entries?: Ingreso[]; stats?: WoodEntryStats }>(
      withPeriod("/api/admin/forestal/wood-entries", { limit: "1000", stats: "1" }, period),
      {},
    ),
    getJson<{ entries?: CtpRow[] }>(withPeriod("/api/admin/forestal/ctp", { section: "produccion" }, period), {}),
    getJson<{ entries?: CtpRow[] }>(withPeriod("/api/admin/forestal/ctp", { section: "despacho" }, period), {}),
    getJson<{ saldos?: Saldos }>(withPeriod("/api/admin/forestal/ctp", { saldos: "1" }, period), {}),
    getJson<{ traza?: { total: number; incompletos: number; lineas: number[] } }>(
      withPeriod("/api/admin/forestal/ctp", { traza: "1" }, period),
      {},
    ),
    getJson<{ ficha?: CtpFichaLite }>("/api/admin/forestal/ctp-ficha", {}),
    // Para la hoja "Meta por lote": qué corridas arma cada lote y de qué
    // ingreso salió cada una.
    getJson<{ lotes?: LoteLite[] }>("/api/admin/forestal/lotes", {}),
    getJson<{ grafo?: GrafoLite }>(withPeriod("/api/admin/forestal/ctp", { grafo: "1" }, period), {}),
  ]);
  const ingresos = ing.entries ?? [];
  const stats = ing.stats ?? null;
  const produccion = prod.entries ?? [];
  const despacho = desp.entries ?? [];
  const saldos = sal.saldos ?? null;
  const traza = trz.traza ?? null;
  const ficha = fic.ficha ?? null;

  // Señales informativas (mismas que el panel Cumplimiento — consistencia panel↔Excel).
  // El criterio de "esta especie tiene su permiso" es el de `especieCoincide`, el
  // mismo que autollena el N° de permiso en la guía de salida.
  const citesSinPermiso = (saldos?.porEspecie ?? [])
    .filter((e) => e.cites)
    .filter((e) => !(ficha?.citesPermisos ?? []).some((p) => especieCoincide(p.especie, e.especie)))
    .map((e) => e.especie);
  const rendimientoAltoLineas = produccion
    .filter((e) => e.status === "registrado")
    .filter((e) => evaluarRendimiento(e.productType, e.rendimientoPct != null ? Number(e.rendimientoPct) : null).estado === "alto")
    .map((e) => e.lineNo);


  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const GREEN = "FF14532D";
  const styleHead = (ws: import("exceljs").Worksheet) => {
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
  };

  // ── Resumen ──
  // Los conteos salen de `stats` (agregado en DB sobre TODO el período) y no
  // de filtrar `ingresos`: ese array viene acotado a 1000 filas para el
  // detalle de la hoja "Ingresos", así que contarlo/sumarlo acá mentiría en
  // cuanto el período tenga más de 1000 registros. Mismo criterio que usa el
  // panel de Cumplimiento del módulo (single source: WoodEntriesDB.stats()).
  const rs = wb.addWorksheet("Resumen", { properties: { tabColor: { argb: GREEN } } });
  const totalIngresos = stats?.totalCount ?? ingresos.length;
  const ingVol = stats?.totalVolumeM3 ?? ingresos.reduce((a, e) => a + Number(e.volumeM3 ?? 0), 0);
  const fueraPlazo = stats?.lateCount ?? ingresos.filter((e) => estaFueraDePlazo(e)).length;
  const pendientes = stats?.byStatus?.pendiente ?? ingresos.filter((e) => e.status === "pendiente").length;
  const citesN = stats?.citesCount ?? ingresos.filter((e) => e.speciesCites).length;
  const stockNeg = (saldos?.productos ?? []).filter((p) => p.stock < 0).length;
  rs.columns = [{ width: 34 }, { width: 22 }];
  rs.addRow(["LIBRO DE OPERACIONES CTP", ""]);
  rs.getRow(1).font = { bold: true, size: 14 };
  const per = rs.addRow(["Período", period.label]);
  per.getCell(1).font = { bold: true };
  per.getCell(2).font = { bold: true };
  rs.addRow(["Generado", new Date().toLocaleString("es-PE")]);
  rs.addRow(["Interno · no reemplaza el LOE-CTP oficial SERFOR", ""]);
  rs.addRow([]);
  const kv = (k: string, v: string | number) => { const r = rs.addRow([k, v]); r.getCell(1).font = { bold: true }; };
  kv("Ingresos registrados", totalIngresos);
  kv("Volumen ingresado (m³)", Math.round(ingVol * 10000) / 10000);
  kv("Líneas de producción", produccion.filter((e) => e.status === "registrado").length);
  kv("Líneas de despacho", despacho.filter((e) => e.status === "registrado").length);
  if (saldos) {
    kv("Materia prima consumida (m³)", Math.round(saldos.materiaPrima.consumidoM3 * 10000) / 10000);
    kv("Saldo materia prima (m³)", Math.round(saldos.materiaPrima.saldoM3 * 10000) / 10000);
    kv("Pendiente de validar (m³, no computa)", Math.round(saldos.materiaPrima.pendienteM3 * 10000) / 10000);
  }
  rs.addRow([]);
  const al = rs.addRow(["ALERTAS DE CUMPLIMIENTO", ""]);
  al.getCell(1).font = { bold: true, color: { argb: "FFB91C1C" } };
  kv("Ingresos pendientes de validar", pendientes);
  kv(`Registros fuera de plazo (>${PLAZO_REGISTRO_DIAS} días hábiles)`, fueraPlazo);
  kv("Especies CITES (requieren permiso)", citesN);
  kv("Productos con stock negativo (sobre-despacho)", stockNeg);
  kv("Especies con saldo negativo (sobre-consumo)", saldos?.materiaPrima.especiesEnNegativo ?? 0);
  // ADR-135 D3: despachos que no podrían emitir certificado de trazabilidad.
  kv(
    "Despachos sin cadena de custodia completa",
    traza ? `${traza.incompletos}${traza.incompletos > 0 ? ` (línea${traza.lineas.length === 1 ? "" : "s"} #${traza.lineas.join(", #")})` : ""}` : 0,
  );
  // Informativas (no restan score): mismas señales que el panel de Cumplimiento.
  kv(
    "Especies CITES sin permiso en la Ficha",
    citesSinPermiso.length > 0 ? `${citesSinPermiso.length} (${citesSinPermiso.join(", ")})` : 0,
  );
  kv(
    "Corridas con rendimiento sobre referencial SERFOR",
    rendimientoAltoLineas.length > 0
      ? `${rendimientoAltoLineas.length} (línea${rendimientoAltoLineas.length === 1 ? "" : "s"} #${rendimientoAltoLineas.join(", #")})`
      : 0,
  );

  // ── Ingresos ──
  const wi = wb.addWorksheet("Ingresos");
  wi.columns = [
    { header: "Fecha ingreso", key: "f", width: 14 }, { header: "N° GTF", key: "g", width: 16 },
    { header: "Titular", key: "t", width: 26 }, { header: "Especie", key: "e", width: 16 },
    { header: "Científico", key: "sc", width: 22 }, { header: "CITES", key: "c", width: 7 },
    { header: "Permiso CITES", key: "cp", width: 18 },
    { header: "Producto", key: "p", width: 14 }, { header: "Volumen m³", key: "v", width: 12 },
    { header: "Piezas", key: "pz", width: 9 }, { header: "Estado", key: "st", width: 12 },
    { header: "Días registro", key: "d", width: 12 },
  ];
  styleHead(wi);
  for (const e of ingresos) {
    const late = diasDeRegistro(e);
    // Permiso CITES vinculado (de notes) — vacío si no es CITES, "—" si es CITES sin permiso.
    const permisoCites = e.speciesCites ? (parseCitesPermiso(e.notes) ?? "—") : "";
    const row = wi.addRow({
      f: day(e.entryDate), g: e.gtfNumber, t: e.providerName, e: e.speciesCommonName,
      sc: e.speciesScientificName ?? "", c: e.speciesCites ? "SÍ" : "", cp: permisoCites, p: e.productType,
      v: Number(e.volumeM3 ?? 0), pz: e.pieces ?? 0, st: e.status, d: late,
    });
    row.getCell("f").numFmt = "dd/mm/yyyy";
    row.getCell("v").numFmt = "0.0000";
    // `late` es el número que se MUESTRA (floored); el rojo lo decide el
    // predicado único, que matchea el lateCount del Resumen y del panel.
    if (estaFueraDePlazo(e)) row.getCell("d").font = { color: { argb: "FFB91C1C" }, bold: true };
    if (e.speciesCites) row.getCell("c").font = { color: { argb: "FFB91C1C" }, bold: true };
    // CITES sin permiso vinculado → rojo: es lo que un fiscalizador marca primero.
    if (e.speciesCites && permisoCites === "—") row.getCell("cp").font = { color: { argb: "FFB91C1C" }, bold: true };
  }

  // ── Producción ──
  const wp = wb.addWorksheet("Producción");
  wp.columns = [
    { header: "N°", key: "n", width: 6 }, { header: "Fecha", key: "f", width: 14 },
    { header: "GTF ingreso", key: "g", width: 16 }, { header: "Especie", key: "e", width: 16 },
    { header: "Producto", key: "p", width: 16 }, { header: "Consumido m³", key: "c", width: 13 },
    { header: "Producido", key: "q", width: 12 }, { header: "Unidad", key: "u", width: 8 },
    { header: "Rendimiento %", key: "r", width: 13 }, { header: "Estado", key: "st", width: 12 },
  ];
  styleHead(wp);
  for (const e of produccion) {
    const row = wp.addRow({
      n: e.lineNo, f: day(e.entryDate), g: e.gtfIngreso ?? "", e: e.speciesCommon ?? "",
      p: e.productType ?? "", c: e.volumeInputM3 != null ? Number(e.volumeInputM3) : null,
      q: e.quantity != null ? Number(e.quantity) : null, u: e.unit ?? "",
      r: e.rendimientoPct != null ? Number(e.rendimientoPct) : null, st: e.status,
    });
    row.getCell("f").numFmt = "dd/mm/yyyy"; row.getCell("c").numFmt = "0.0000"; row.getCell("q").numFmt = "0.0000"; row.getCell("r").numFmt = "0.0";
  }

  // ── Despacho ──
  const wd = wb.addWorksheet("Despacho");
  wd.columns = [
    { header: "N°", key: "n", width: 6 }, { header: "Fecha", key: "f", width: 14 },
    { header: "Especie", key: "e", width: 16 }, { header: "Producto", key: "p", width: 16 },
    { header: "Cantidad", key: "q", width: 12 }, { header: "Unidad", key: "u", width: 8 },
    { header: "Piezas", key: "pz", width: 9 }, { header: "GTF salida", key: "g", width: 16 },
    { header: "Destino", key: "de", width: 22 }, { header: "Estado", key: "st", width: 12 },
  ];
  styleHead(wd);
  for (const e of despacho) {
    const row = wd.addRow({
      n: e.lineNo, f: day(e.entryDate), e: e.speciesCommon ?? "", p: e.productType ?? "",
      q: e.quantity != null ? Number(e.quantity) : null, u: e.unit ?? "", pz: e.pieces ?? null,
      g: e.gtfNumber ?? "", de: e.destino ?? "", st: e.status,
    });
    row.getCell("f").numFmt = "dd/mm/yyyy"; row.getCell("q").numFmt = "0.0000";
  }

  // ── Balance por especie ── (el que se fiscaliza; el global solo resume)
  if (saldos?.porEspecie?.length) {
    const wbe = wb.addWorksheet("Balance por especie");
    wbe.columns = [
      { header: "Especie", key: "e", width: 20 }, { header: "Científico", key: "sc", width: 22 },
      { header: "CITES", key: "c", width: 7 }, { header: "Ingresado m³", key: "i", width: 13 },
      { header: "Consumido m³", key: "co", width: 13 }, { header: "Saldo m³", key: "s", width: 12 },
      { header: "Sin validar m³", key: "p", width: 13 }, { header: "Ingresos", key: "n", width: 10 },
    ];
    styleHead(wbe);
    for (const s of saldos.porEspecie) {
      const row = wbe.addRow({
        e: s.especie, sc: s.scientific ?? "", c: s.cites ? "SÍ" : "",
        i: s.ingresoM3, co: s.consumidoM3, s: s.saldoM3, p: s.pendienteM3, n: s.ingresosCount,
      });
      ["i", "co", "s", "p"].forEach((k) => (row.getCell(k).numFmt = "0.0000"));
      if (s.saldoM3 < 0) row.getCell("s").font = { color: { argb: "FFB91C1C" }, bold: true };
      if (s.cites) row.getCell("c").font = { color: { argb: "FFB91C1C" }, bold: true };
    }
  }

  // ── Saldos ──
  if (saldos) {
    const wsal = wb.addWorksheet("Saldos");
    wsal.columns = [
      { header: "Producto · Especie", key: "p", width: 30 }, { header: "Producido", key: "prod", width: 12 },
      { header: "Despachado", key: "desp", width: 12 }, { header: "Stock", key: "st", width: 12 },
    ];
    styleHead(wsal);
    for (const p of saldos.productos) {
      const row = wsal.addRow({ p: p.producto, prod: p.producido, desp: p.despachado, st: p.stock });
      ["prod", "desp", "st"].forEach((k) => (row.getCell(k).numFmt = "0.00"));
      if (p.stock < 0) row.getCell("st").font = { color: { argb: "FFB91C1C" }, bold: true };
    }
  }

  // ── Meta por lote ──
  // La cuenta que el jefe de planta hacía a mano: cuánta troza entró, cuánto
  // debería salir al rendimiento de referencia y cuánto falta — en m³ y en pie
  // tablar, que es como se vende la madera aserrada acá.
  //
  // Va en el export INTERNO y no en el oficial: el formato del SERFOR no pide
  // esta hoja, y agregarle al libro oficial una que no pide es ruido para el
  // fiscalizador. Acá conviven con los costos y el resto del análisis.
  const lotes = lot.lotes ?? [];
  if (lotes.length > 0) {
    const wm = wb.addWorksheet("Meta por lote");
    wm.columns = [
      { header: "Lote", key: "l", width: 14 },
      { header: "Especie", key: "e", width: 20 },
      { header: "Trozas m³", key: "t", width: 14 },
      { header: `Meta ${RENDIMIENTO_REF_ASERRADA}% m³`, key: "m", width: 16 },
      { header: "Meta pt", key: "mp", width: 14 },
      { header: "Producido m³", key: "p", width: 16 },
      { header: "Producido pt", key: "pp", width: 16 },
      { header: "Saldo meta m³", key: "s", width: 16 },
      { header: "Saldo meta pt", key: "sp", width: 16 },
      { header: "Rendimiento", key: "r", width: 14 },
      { header: "Aviso", key: "a", width: 34 },
    ];
    styleHead(wm);
    const especiePorIngreso = new Map((gra.grafo?.ingresos ?? []).map((i) => [i.id, i.species]));
    const corridaPorId = new Map(produccion.filter((e) => e.id).map((e) => [e.id as string, e]));
    for (const l of lotes) {
      const ids = new Set(l.corridaIds ?? []);
      if (ids.size === 0) continue;
      const consumos = (gra.grafo?.consumos ?? [])
        .filter((c) => ids.has(c.to))
        .map((c) => ({
          produccionEntryId: c.to,
          especie: especiePorIngreso.get(c.from) ?? "—",
          volumeM3: c.volumeM3,
        }));
      const corridas = [...ids]
        .map((id) => corridaPorId.get(id))
        .filter((c): c is CtpRow => Boolean(c))
        .map((c) => ({
          produccionEntryId: c.id as string,
          especie: c.speciesCommon,
          quantity: Number(c.quantity ?? 0),
          unit: c.unit,
        }));
      for (const m of calcularMetaEspecies(consumos, corridas)) {
        const row = wm.addRow({
          l: l.loteCode, e: m.especie, t: m.trozasM3, m: m.metaM3, mp: m.metaPt,
          p: m.producidoM3, pp: m.producidoPt, s: m.saldoM3, sp: m.saldoPt,
          r: m.rendimientoPct != null ? `${m.rendimientoPct}%` : "—",
          // Sin trozas y con producción, el saldo sale negativo y se leería como
          // "superó la meta" cuando en realidad no hay contra qué compararlo: el
          // consumo puede haber pasado ANTES del período que exporta esta hoja.
          a: [
            m.trozasM3 === 0 && m.producidoM3 > 0
              ? "Sin consumo en el período: la materia prima entró antes o no está atribuida"
              : "",
            m.unidadesMezcladas ? "Hay corridas en una unidad que no convierte a m³" : "",
          ]
            .filter(Boolean)
            .join(" · "),
        });
        ["t", "m", "p", "s"].forEach((k) => (row.getCell(k).numFmt = "0.0000"));
        ["mp", "pp", "sp"].forEach((k) => (row.getCell(k).numFmt = "#,##0"));
        // Falta producir contra la meta: se marca el saldo, no el rendimiento.
        if (m.saldoM3 > 0) row.getCell("s").font = { color: { argb: "FFB45309" }, bold: true };
        if (m.unidadesMezcladas || m.trozasM3 === 0) row.getCell("a").font = { color: { argb: "FFB45309" } };
      }
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `libro-ctp-${ctpPeriodFileSuffix(period)}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ─── Export OFICIAL: formato Libro de Operaciones de CTP (LO-CTP) ─────────────
//
// A diferencia del export interno de arriba, este espeja la ESTRUCTURA del
// formato oficial aprobado por SERFOR (RDE N° D000025-2023-MIDAGRI-SERFOR-DE):
// una portada con los datos del CTP + los tres registros (Ingreso,
// Transformación, Salida) con los nombres de columna oficiales, más las
// Existencias. Sirve para presentar ante un fiscalizador o para volcar al
// MC-SNIFFS. Los campos que faltan en la ficha se marcan; nunca se inventan.

/** Ficha del CTP tal como la sirve /api/admin/forestal/ctp-ficha (client-safe). */
interface CtpFichaLite {
  nombreCtp: string; codigoCtp: string; ruc: string; razonSocial: string;
  arffs: string; registroArffs: string; registroArffsFecha: string;
  titulos: { tipo: string; codigo: string; vencimiento: string }[];
  citesPermisos: { especie: string; numero: string; vencimiento: string }[];
  representante: string; representanteDni: string;
  direccion: string; region: string; provincia: string; distrito: string;
  telefono: string; email: string; gtfSerie: string;
}
/** Grafo de cadena de custodia (para armar la sección Consumos del export). */
interface GrafoLite {
  ingresos: { id: string; gtf: string; species: string | null }[];
  corridas: { id: string; lineNo: number; label: string; unit: string | null; fecha?: string }[];
  consumos: { from: string; to: string; volumeM3: number }[];
  /** corrida → despacho (ADR-135): de acá sale el lote que respalda cada salida. */
  origenes?: { from: string; to: string; quantity: number }[];
}

/** Ingreso con los campos de origen que el formato oficial necesita (superset del interno). */
interface IngresoOficial extends Ingreso {
  id: string;
  gtfSeries: string | null; originType: string; originCode: string | null; originRegion: string | null;
  providerDocument: string | null; notes: string | null;
  /** Casilleros del formato oficial (ADR-311). */
  libroNro: number | null; docType: string | null; originSourceNumber: string | null;
  ctpProductCode: string | null; unit: string | null;
  /** Ficha oficial de SERFOR — de acá sale el titular real del Apartado 1. */
  serforGtf?: unknown; originDistrict?: string | null;
}

/** Un lote con las corridas que lo arman — para el casillero (8) de secciones 3 y 4. */
interface LoteLite { loteCode: string; corridaIds: string[] }

/**
 * Un lote de ASERRÍO con la corrida que se comió — para el casillero (10) de la
 * Sección 2. Es el lote de la materia prima, no el comercial del producto.
 */
interface LoteAserrioLite {
  code: string;
  produccionEntryId: string | null;
  produccion?: { viva: boolean } | null;
}

const ORIGIN_OFICIAL: Record<string, string> = {
  concesion: "Concesión forestal", predio_privado: "Predio privado", comunidad_nativa: "Comunidad nativa",
  reforestacion: "Reforestación", retroaserradero: "Re-entrada CTP", otro: "Otro",
};
const TITULO_OFICIAL: Record<string, string> = {
  concesion: "Concesión forestal", permiso: "Permiso forestal", autorizacion: "Autorización",
  plantacion: "Plantación registrada", dema: "DEMA", predio: "Predio privado", otro: "Otro",
};
const originOf = (t: string) => ORIGIN_OFICIAL[t] ?? t ?? "—";

export async function exportarLibroCtpOficial(period: CtpPeriod): Promise<void> {
  const [ing, prod, desp, sal, fic, gra, lot, ret, loteAs] = await Promise.all([
    getJson<{ entries?: IngresoOficial[] }>(
      withPeriod("/api/admin/forestal/wood-entries", { limit: "5000" }, period), {},
    ),
    getJson<{ entries?: CtpRow[] }>(withPeriod("/api/admin/forestal/ctp", { section: "produccion" }, period), {}),
    getJson<{ entries?: CtpRow[] }>(withPeriod("/api/admin/forestal/ctp", { section: "despacho" }, period), {}),
    getJson<{ saldos?: Saldos }>(withPeriod("/api/admin/forestal/ctp", { saldos: "1" }, period), {}),
    getJson<{ ficha?: CtpFichaLite }>("/api/admin/forestal/ctp-ficha", {}),
    getJson<{ grafo?: GrafoLite }>(withPeriod("/api/admin/forestal/ctp", { grafo: "1" }, period), {}),
    getJson<{ lotes?: LoteLite[] }>("/api/admin/forestal/lotes", {}),
    // Apartado 2: los cortes de patio del período (ADR-313).
    getJson<{ retrozos?: RetrozoParaApartado[] }>(
      withPeriod("/api/admin/forestal/trozas", { retrozos: "1" }, period), {},
    ),
    // Los lotes de ASERRÍO (ADR-334): el casillero (10) de la Sección 2 pide el
    // lote CONSUMIDO, que es éste y no el comercial de la corrida producida.
    getJson<{ lotes?: LoteAserrioLite[] }>("/api/admin/forestal/lotes-aserrio?limite=500", {}),
  ]);
  // Rechazados y anulados NO forman parte del libro oficial (QA 2026-07-17).
  const ingresos = (ing.entries ?? []).filter((e) => e.status !== "anulado" && e.status !== "rechazado");
  const produccion = (prod.entries ?? []).filter((e) => e.status === "registrado");
  const despacho = (desp.entries ?? []).filter((e) => e.status === "registrado");
  const saldos = sal.saldos ?? null;
  const ficha = fic.ficha ?? null;
  const codigoCtp = ficha?.codigoCtp || "—";
  const grafo = gra.grafo ?? null;
  const retrozos = ret.retrozos ?? [];

  // Apartado 1: el registro numerado de fuentes de origen. Se deriva de los
  // ingresos del período —de la ficha oficial de cada guía— porque es ahí donde
  // consta el titular real de la concesión; la Ficha del CTP sólo tiene los
  // títulos del propio centro.
  const registroFuentes = derivarFuentes(ingresos);

  // (F) Consumos como sección propia (RDE D000025-2023: ingresos, CONSUMOS,
  // producción, salidas). Se arman del grafo: cada consumo = GTF de ingreso →
  // corrida, con el volumen atribuido.
  // Corrida → N° de lote (casillero 8 de las secciones 3 y 4).
  const loteDeCorrida = new Map<string, string>();
  for (const l of lot.lotes ?? []) {
    for (const cid of l.corridaIds ?? []) loteDeCorrida.set(cid, l.loteCode);
  }
  // La fila de la sección la arma `filasConsumo()`, la misma que dibuja la vista
  // de Consumos del módulo: pantalla y libro presentado no pueden declarar
  // consumos distintos del mismo período — incluido el casillero (10), que sale
  // del MISMO mapa de lotes de aserrío en los dos lados.
  const consumos = filasConsumo(grafo, ingresos, loteAserrioPorCorrida(loteAs.lotes ?? []));

  // m³ ya consumidos de cada ingreso — el casillero (11) del Cuadro Resumen 1.
  const consumidoPorIngreso = new Map<string, number>();
  for (const c of grafo?.consumos ?? []) {
    consumidoPorIngreso.set(c.from, (consumidoPorIngreso.get(c.from) ?? 0) + c.volumeM3);
  }

  // El lote de cada despacho sale de las corridas que lo respaldan (ADR-135).
  const lotesDeDespacho = new Map<string, string[]>();
  for (const o of grafo?.origenes ?? []) {
    const lote = loteDeCorrida.get(o.from);
    if (!lote) continue;
    const previos = lotesDeDespacho.get(o.to) ?? [];
    if (!previos.includes(lote)) lotesDeDespacho.set(o.to, [...previos, lote]);
  }

  /**
   * "Stock inicial" de los cuadros resumen = el saldo al cierre del período
   * ANTERIOR. Se pide como un período que va desde el inicio del histórico hasta
   * el instante previo al `from` actual; sin `from` (histórico completo) no hay
   * período anterior y el inicial es cero por definición.
   */
  const inicial: StockInicial | undefined = await (async () => {
    if (!period.from) return undefined;
    const anterior: CtpPeriod = {
      key: "custom",
      from: null,
      to: new Date(new Date(period.from).getTime() - 1).toISOString(),
      label: "hasta el período anterior",
    };
    const previo = await getJson<{ saldos?: Saldos }>(
      withPeriod("/api/admin/forestal/ctp", { saldos: "1" }, anterior), {},
    );
    if (!previo.saldos) return undefined;
    const trozasM3: Record<string, number> = {};
    for (const e of previo.saldos.porEspecie) trozasM3[e.especie] = e.saldoM3;
    const productos: Record<string, number> = {};
    for (const pr of previo.saldos.productos) {
      // `producto` viene como "tipo · especie" del backend; el cuadro necesita la
      // clave especie|tipo|unidad, así que se parte por el separador que usa.
      const [tipo, especie] = pr.producto.split("·").map((x) => x.trim());
      productos[claveProducto(especie ?? null, tipo ?? null, "m3")] = pr.stock;
    }
    return { trozasM3, productos };
  })();

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const INK = "FF14532D";
  const styleHead = (ws: import("exceljs").Worksheet) => {
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
  };

  // ── Portada: Datos del CTP ──
  const wc = wb.addWorksheet("Datos del CTP", { properties: { tabColor: { argb: INK } } });
  wc.columns = [{ width: 40 }, { width: 46 }];
  const title = wc.addRow(["LIBRO DE OPERACIONES DE CENTRO DE TRANSFORMACIÓN PRIMARIA (LO-CTP)"]);
  title.font = { bold: true, size: 13 };
  wc.mergeCells("A1:B1");
  wc.addRow(["Formato conforme RDE N° D000025-2023-MIDAGRI-SERFOR-DE · Ley 29763", ""]);
  wc.addRow([]);
  const kv = (k: string, v: string) => { const r = wc.addRow([k, v || "—"]); r.getCell(1).font = { bold: true }; };
  kv("Nombre del CTP", ficha?.nombreCtp ?? "");
  kv("Código de CTP", codigoCtp);
  kv("RUC del titular", ficha?.ruc ?? "");
  kv("Razón social", ficha?.razonSocial ?? "");
  kv("ARFFS competente", ficha?.arffs ?? "");
  kv("Registro ARFFS", [ficha?.registroArffs, ficha?.registroArffsFecha].filter(Boolean).join(" · "));
  kv("Representante legal", [ficha?.representante, ficha?.representanteDni].filter(Boolean).join(" · "));
  kv("Dirección", [ficha?.direccion, ficha?.distrito, ficha?.provincia, ficha?.region].filter(Boolean).join(", "));
  kv("Serie GTF autorizada", ficha?.gtfSerie ?? "");
  kv("Período del libro", period.label);
  kv("Generado", new Date().toLocaleString("es-PE"));
  // Apartado 2 (RDE): se declara acá el resumen y el detalle va en su hoja.
  kv(
    "Retrozado (Apartado 2)",
    retrozos.length === 0
      ? "Sin cortes registrados en el período"
      : `${retrozos.length} pedazo(s) registrados — ver hoja "Apartado 2 · Retrozado"`,
  );
  kv(
    "Fuentes de origen (Apartado 1)",
    registroFuentes.fuentes.length === 0
      ? "Sin fuentes identificables en los ingresos del período"
      : `${registroFuentes.fuentes.length} fuente(s) — ver hoja "Apartado 1 · Fuentes"`,
  );
  wc.addRow([]);
  const th = wc.addRow(["TÍTULOS HABILITANTES (origen de la materia prima)", ""]);
  th.getCell(1).font = { bold: true };
  if (ficha?.titulos?.length) {
    for (const t of ficha.titulos) wc.addRow([TITULO_OFICIAL[t.tipo] ?? t.tipo, [t.codigo || "—", t.vencimiento && `vence ${t.vencimiento}`].filter(Boolean).join(" · ")]);
  } else {
    wc.addRow(["Sin títulos habilitantes cargados en la ficha", ""]);
  }
  if (ficha?.citesPermisos?.length) {
    wc.addRow([]);
    const ct = wc.addRow(["PERMISOS CITES (especies protegidas)", ""]);
    ct.getCell(1).font = { bold: true };
    for (const p of ficha.citesPermisos) {
      wc.addRow([p.especie || "—", [p.numero, p.vencimiento && `vence ${p.vencimiento}`].filter(Boolean).join(" · ") || "—"]);
    }
  }
  if (!ficha || !ficha.codigoCtp || !ficha.ruc) {
    const warn = wc.addRow(["⚠ Ficha del CTP incompleta — completá 'Ficha CTP' antes de presentar este libro.", ""]);
    warn.getCell(1).font = { bold: true, color: { argb: "FFB45309" } };
  }

  // ── Registro 1: Ingreso ──
  // Las columnas van en el ORDEN y con la NUMERACIÓN del formato oficial (los 13
  // casilleros de la Sección 1, transcriptos en `loctp-campos.ts`). Las columnas
  // propias —CITES, proveedor— van DESPUÉS de la 13 para no correr la numeración
  // que el fiscalizador está buscando (ADR-311).
  const w1 = wb.addWorksheet("1. Ingresos");
  w1.columns = [
    { header: "(1) N° Registro", key: "n", width: 11 },
    { header: "(2) Fecha", key: "f", width: 13 },
    { header: "(3) Tipo de Documento", key: "td", width: 18 },
    { header: "(4) N° de Documento", key: "nd", width: 18 },
    { header: "(5) N° Fuente de Origen/Procedencia", key: "fo", width: 24 },
    { header: "(6) Tipo de Producto", key: "tp", width: 18 },
    { header: "(7) Especie (nombre común)", key: "e", width: 20 },
    { header: "(8) Nombre científico", key: "sc", width: 22 },
    { header: "(9) Código de Origen/Procedencia", key: "co", width: 22 },
    { header: "(10) Código asignado por el CTP", key: "cc", width: 20 },
    { header: "(11) Unidad de Medida", key: "u", width: 16 },
    { header: "(12) Cantidad", key: "q", width: 12 },
    { header: "(13) Observaciones", key: "o", width: 30 },
    { header: "CITES", key: "ci", width: 7 },
    { header: "N° Permiso CITES", key: "cp", width: 18 },
    // Puente al Apartado 1. Va DESPUÉS de la 13 para no correr la numeración
    // oficial: el casillero (5) sigue siendo el N° que declara la guía.
    { header: "Apartado 1 · N° de fuente", key: "a1", width: 22 },
  ];
  styleHead(w1);
  for (const e of ingresos) {
    const permisoCites = e.speciesCites ? (parseCitesPermiso(e.notes) ?? "—") : "";
    const row = w1.addRow({
      // (1) el FOLIO del libro, no la posición en esta hoja: el período filtra
      // filas y numerar de nuevo cambiaría el N° de un registro ya presentado.
      n: e.libroNro ?? "",
      f: day(e.entryDate),
      td: e.docType || "GTF",
      nd: [e.gtfSeries, e.gtfNumber].filter(Boolean).join("-") || e.gtfNumber,
      fo: e.originSourceNumber ?? "",
      tp: e.productType,
      e: e.speciesCommonName,
      sc: e.speciesScientificName ?? "",
      co: e.originCode ?? "",
      cc: e.ctpProductCode ?? "",
      u: unidadOficial(e.unit),
      q: Number(e.volumeM3 ?? 0),
      // El proveedor y el tipo de origen no son casilleros del formato, pero el
      // fiscalizador los busca: van en observaciones, que es donde la guía dice
      // que se consigna "información adicional".
      o: [e.notes, e.providerName, originOf(e.originType), e.originRegion].filter(Boolean).join(" · "),
      ci: e.speciesCites ? "SÍ" : "",
      cp: permisoCites,
      a1: (e.id && registroFuentes.numeroPorIngreso.get(e.id)) ?? "",
    });
    row.getCell("f").numFmt = "dd/mm/yyyy"; row.getCell("q").numFmt = "0.0000";
    if (e.speciesCites) row.getCell("ci").font = { color: { argb: "FFB91C1C" }, bold: true };
    if (e.speciesCites && permisoCites === "—") row.getCell("cp").font = { color: { argb: "FFB91C1C" }, bold: true };
    // Lo que le falta para presentarse se marca en la fila, no en un informe
    // aparte: así el que arma el libro ve dónde tiene el hueco.
    const faltan = faltantesIngreso(e as unknown as Record<string, unknown>);
    if (faltan.length > 0) {
      row.getCell("o").note = resumenFaltantes(faltan);
      row.getCell("n").font = { color: { argb: "FFB45309" }, bold: true };
    }
  }

  // ── Registro 2: Consumos (sección propia, RDE D000025-2023) ──
  // Sección 2 del formato (11 casilleros). Un consumo no es una fila propia en el
  // código sino el puente ingreso → corrida, así que sus casilleros se derivan
  // del ingreso consumido y de la corrida destino.
  const wco = wb.addWorksheet("2. Consumos");
  wco.columns = [
    { header: "(1) N° Registro", key: "n", width: 11 },
    { header: "(2) Fecha de consumo", key: "f", width: 16 },
    { header: "(3) Tipo de Producto", key: "tp", width: 18 },
    { header: "(4) Especie (nombre común)", key: "e", width: 20 },
    { header: "(5) Nombre científico", key: "sc", width: 22 },
    { header: "(6) Código de Origen/Procedencia/CTP", key: "co", width: 24 },
    { header: "(7) N° Fuente de Origen/Procedencia", key: "fo", width: 24 },
    { header: "(8) Unidad de Medida", key: "u", width: 16 },
    { header: "(9) Cantidad consumida", key: "q", width: 18 },
    { header: "(10) N° de Lote consumido", key: "l", width: 18 },
    { header: "(11) Observaciones", key: "o", width: 28 },
  ];
  styleHead(wco);
  for (const c of consumos) {
    const row = wco.addRow({
      n: c.nro, f: c.fecha ? day(c.fecha) : "", tp: c.tipoProducto, e: c.especieComun,
      sc: c.especieCientifica, co: c.codigoOrigen, fo: c.fuenteOrigen,
      u: unidadOficial(c.unidad), q: c.cantidad, l: c.lote,
      o: [c.gtf && c.gtf !== "—" ? `Doc. de ingreso: ${c.gtf}` : "", c.observaciones !== "—" ? `Consumido en ${c.observaciones}` : ""].filter(Boolean).join(" · "),
    });
    if (c.fecha) row.getCell("f").numFmt = "dd/mm/yyyy";
    row.getCell("q").numFmt = "0.0000";
  }
  if (consumos.length === 0) wco.addRow({ o: "Sin consumos atribuidos en el período" });

  // ── Registro 3: Producción (transformación) ──
  // Sección 3 del formato (9 casilleros). NO lleva columnas de origen: la
  // trazabilidad hacia atrás la dan la Sección 2 y el lote. El rendimiento no es
  // un casillero de esta sección (va en el Cuadro Resumen 3), pero se agrega al
  // final porque es el número que el CTP mira todos los días.
  const w2 = wb.addWorksheet("3. Producción");
  w2.columns = [
    { header: "(1) N° Registro", key: "n", width: 11 },
    { header: "(2) Fecha", key: "f", width: 13 },
    { header: "(3) Tipo de Producto", key: "tp", width: 18 },
    { header: "(4) Especie (nombre común)", key: "e", width: 20 },
    { header: "(5) Nombre científico", key: "sc", width: 22 },
    { header: "(6) Unidad de Medida", key: "u", width: 16 },
    { header: "(7) Cantidad producida", key: "q", width: 18 },
    { header: "(8) N° de Lote", key: "l", width: 16 },
    { header: "(9) Observaciones", key: "o", width: 28 },
    { header: "Rendimiento % (Resumen 3)", key: "r", width: 22 },
  ];
  styleHead(w2);
  for (const e of produccion) {
    const row = w2.addRow({
      n: e.lineNo, f: day(e.entryDate), tp: e.productType ?? "", e: e.speciesCommon ?? "",
      sc: e.speciesScientific ?? "", u: unidadOficial(e.unit), q: e.quantity != null ? Number(e.quantity) : null,
      l: (e.id ? loteDeCorrida.get(e.id) : null) ?? e.lote ?? "",
      o: [e.gtfIngreso ? `Materia prima: ${e.gtfIngreso}` : "", e.observations ?? ""].filter(Boolean).join(" · "),
      r: e.rendimientoPct != null ? Number(e.rendimientoPct) : null,
    });
    row.getCell("f").numFmt = "dd/mm/yyyy"; row.getCell("q").numFmt = "0.0000"; row.getCell("r").numFmt = "0.0";
    const faltan = faltantesProduccion({ ...e, lote: row.getCell("l").value ?? null } as unknown as Record<string, unknown>);
    if (faltan.length > 0) {
      row.getCell("o").note = resumenFaltantes(faltan);
      row.getCell("n").font = { color: { argb: "FFB45309" }, bold: true };
    }
  }

  // ── Registro 4: Salida ──
  // Sección 4 del formato (12 casilleros). El destino no es un casillero: la guía
  // pide el MOTIVO de la salida en observaciones ("VENTA", "TRASLADO", "USO
  // INTERNO", "BAJA DE INVENTARIO"), así que el destino viaja ahí.
  const w3 = wb.addWorksheet("4. Salidas");
  w3.columns = [
    { header: "(1) N° Registro", key: "n", width: 11 },
    { header: "(2) Fecha de salida", key: "f", width: 16 },
    { header: "(3) Tipo de Documento", key: "td", width: 18 },
    { header: "(4) N° de Documento", key: "nd", width: 18 },
    { header: "(5) Tipo de Producto", key: "tp", width: 18 },
    { header: "(6) Especie (nombre común)", key: "e", width: 20 },
    { header: "(7) Nombre científico", key: "sc", width: 22 },
    { header: "(8) N° de Lote", key: "l", width: 16 },
    { header: "(9) Código del Producto", key: "cp", width: 20 },
    { header: "(10) Unidad de Medida", key: "u", width: 16 },
    { header: "(11) Cantidad", key: "q", width: 12 },
    { header: "(12) Observaciones", key: "o", width: 30 },
  ];
  styleHead(w3);
  for (const e of despacho) {
    const row = w3.addRow({
      n: e.lineNo, f: day(e.entryDate), td: e.docType || "GTF", nd: e.gtfNumber ?? "",
      tp: e.productType ?? "", e: e.speciesCommon ?? "", sc: e.speciesScientific ?? "",
      l: (e.id ? lotesDeDespacho.get(e.id)?.join(", ") : null) ?? e.lote ?? "",
      cp: e.codigoProducto ?? "", u: unidadOficial(e.unit),
      q: e.quantity != null ? Number(e.quantity) : null,
      o: [e.destino ? `VENTA/TRASLADO a ${e.destino}` : "", e.observations ?? ""].filter(Boolean).join(" · "),
    });
    row.getCell("f").numFmt = "dd/mm/yyyy"; row.getCell("q").numFmt = "0.0000";
    const faltan = faltantesSalida({ ...e, lote: row.getCell("l").value ?? null } as unknown as Record<string, unknown>);
    if (faltan.length > 0) {
      row.getCell("o").note = resumenFaltantes(faltan);
      row.getCell("n").font = { color: { argb: "FFB45309" }, bold: true };
    }
  }

  // ── Registro 5: Existencias (saldo del libro por especie + stock de productos) ──
  if (saldos) {
    const w4 = wb.addWorksheet("5. Existencias");
    w4.columns = [
      { header: "Especie / Producto", key: "e", width: 30 }, { header: "Nombre científico", key: "sc", width: 20 },
      { header: "CITES", key: "ci", width: 7 }, { header: "Ingresado/Producido", key: "i", width: 18 },
      { header: "Consumido/Despachado", key: "c", width: 20 }, { header: "Existencia", key: "s", width: 13 },
      { header: "Unidad", key: "u", width: 10 },
    ];
    styleHead(w4);
    const secMP = w4.addRow({ e: "MATERIA PRIMA (por especie)" });
    secMP.getCell("e").font = { bold: true };
    for (const s of saldos.porEspecie) {
      const row = w4.addRow({
        e: s.especie, sc: s.scientific ?? "", ci: s.cites ? "SÍ" : "",
        i: s.ingresoM3, c: s.consumidoM3, s: s.saldoM3, u: "m³",
      });
      ["i", "c", "s"].forEach((k) => (row.getCell(k).numFmt = "0.0000"));
      if (s.saldoM3 < 0) row.getCell("s").font = { color: { argb: "FFB91C1C" }, bold: true };
    }
    const secPR = w4.addRow({ e: "PRODUCTOS TRANSFORMADOS" });
    secPR.getCell("e").font = { bold: true };
    for (const p of saldos.productos) {
      const row = w4.addRow({ e: p.producto, i: p.producido, c: p.despachado, s: p.stock });
      ["i", "c", "s"].forEach((k) => (row.getCell(k).numFmt = "0.0000"));
      if (p.stock < 0) row.getCell("s").font = { color: { argb: "FFB91C1C" }, bold: true };
    }
  }

  // ── Apartado 1: Fuente de origen o procedencia de la madera (7 casilleros) ──
  // Sale de los INGRESOS del período: el titular, el título y la resolución de
  // cada guía son los que amparan la madera que entró. Los títulos de la Ficha
  // del CTP son los del propio centro y van al final, como respaldo.
  const wa1 = wb.addWorksheet("Apartado 1 · Fuentes");
  wa1.columns = [
    { header: "(1) N° de registro", key: "n", width: 14 },
    { header: "(2) Fuente de origen/procedencia", key: "fu", width: 30 },
    { header: "(3) Titular de la fuente", key: "ti", width: 30 },
    { header: "(4) Código del título habilitante", key: "co", width: 26 },
    { header: "(5) N° de resolución (PO/PMFI/DEMA)", key: "re", width: 28 },
    { header: "(6) RUC del titular", key: "ru", width: 16 },
    { header: "(7) Procedencia (línea de recuperación)", key: "pr", width: 28 },
    { header: "N° declarado en la guía", key: "nd", width: 22 },
    { header: "Ingresos", key: "ni", width: 10 },
    { header: "Volumen m³", key: "v", width: 14 },
  ];
  styleHead(wa1);
  if (registroFuentes.fuentes.length === 0) {
    const vacia = wa1.addRow({
      fu: "Ningún ingreso del período identifica su fuente (falta titular, título o resolución).",
    });
    vacia.font = { bold: true, color: { argb: "FFB45309" } };
  } else {
    for (const f of registroFuentes.fuentes) {
      const row = wa1.addRow({
        n: f.nro, fu: f.fuente || "", ti: f.titular || "", co: f.codigoTitulo || "",
        re: f.resolucion || "", ru: f.ruc || "", pr: f.procedencia || "",
        nd: f.numeroDeclarado || "", ni: f.ingresos, v: f.volumenM3,
      });
      row.getCell("v").numFmt = "0.0000";
    }
  }
  // Los títulos del propio CTP: no son fuentes de origen de la madera ajena,
  // pero el fiscalizador los pide en el mismo apartado.
  const titulos = ficha?.titulos ?? [];
  if (titulos.length > 0) {
    wa1.addRow({});
    const cab = wa1.addRow({ fu: "TÍTULOS HABILITANTES DEL PROPIO CTP (Ficha)" });
    cab.font = { bold: true };
    for (const t of titulos) {
      wa1.addRow({ fu: TITULO_OFICIAL[t.tipo] ?? t.tipo, co: t.codigo || "", pr: t.vencimiento ? `vence ${t.vencimiento}` : "" });
    }
  }

  // ── Apartado 2: Retrozado (11 casilleros) ──
  // El seccionado de trozas dentro del CTP (ADR-313). Los diámetros van en cm,
  // que es como los publica SERFOR en la guía; el volumen se calcula por Huber
  // sobre el diámetro medio —la fórmula que reproduce lo que declara el
  // documento—, salvo que el operador haya medido y escrito el suyo.
  const wa2 = wb.addWorksheet("Apartado 2 · Retrozado");
  wa2.columns = [
    { header: "(1) N°", key: "n", width: 6 },
    { header: "(2) Fecha", key: "f", width: 13 },
    { header: "(3) Código de Origen/Procedencia/CTP", key: "co", width: 28 },
    { header: "(4) Volumen inicial m³", key: "vi", width: 18 },
    { header: "(5) Código de retrozado", key: "cr", width: 20 },
    { header: "(6) Nombre común", key: "e", width: 18 },
    { header: "(7) Nombre científico", key: "sc", width: 22 },
    { header: "(8) Diámetro mayor (cm)", key: "d1", width: 18 },
    { header: "(9) Diámetro menor (cm)", key: "d2", width: 18 },
    { header: "(10) Longitud (m)", key: "l", width: 14 },
    { header: "(11) Volumen final m³", key: "vf", width: 18 },
    { header: "Observaciones", key: "o", width: 30 },
    { header: "GTF de la troza", key: "g", width: 18 },
  ];
  styleHead(wa2);
  const apartado2 = filasRetrozado(retrozos);
  if (apartado2.length === 0) {
    wa2.addRow({ co: "Sin retrozado registrado en el período." });
  } else {
    for (const r of apartado2) {
      const row = wa2.addRow({
        n: r.nro, f: r.fecha ?? "", co: r.codigoOrigen, vi: r.volumenInicial ?? "",
        cr: r.codigoRetrozado, e: r.nombreComun, sc: r.nombreCientifico,
        d1: r.diametroMayorCm ?? "", d2: r.diametroMenorCm ?? "", l: r.longitudM ?? "",
        vf: r.volumenFinal ?? "",
        // El descarte se declara en observaciones: un pedazo que no es producto
        // pero ocupó volumen de la madre es justo lo que un fiscalizador cruza.
        o: [r.descarte ? "DESCARTE" : "", r.observaciones].filter(Boolean).join(" · "),
        g: r.gtf,
      });
      row.getCell("f").numFmt = "dd/mm/yyyy";
      ["vi", "vf"].forEach((k) => (row.getCell(k).numFmt = "0.0000"));
      if (r.descarte) row.getCell("o").font = { color: { argb: "FFB45309" }, bold: true };
    }
  }

  // ── Cuadros resumen 1, 2 y 3 (formato oficial) ──
  const { resumen1, resumen2, resumen3 } = cuadrosResumen({
    ingresos: ingresos.map((e) => ({
      especie: e.speciesCommonName,
      cientifico: e.speciesScientificName ?? null,
      cites: e.speciesCites,
      volumenM3: Number(e.volumeM3 ?? 0),
      piezas: e.pieces ?? 0,
      tipoProducto: e.productType,
      consumidoM3: consumidoPorIngreso.get(e.id ?? "") ?? 0,
    })),
    produccion: produccion.map((e) => ({
      especie: e.speciesCommon,
      cientifico: e.speciesScientific,
      tipoProducto: e.productType,
      unidad: e.unit,
      cantidad: e.quantity != null ? Number(e.quantity) : 0,
      consumidoM3: e.volumeInputM3 != null ? Number(e.volumeInputM3) : 0,
      lineaProduccion: e.lineaProduccion ?? "LP",
      lote: (e.id ? loteDeCorrida.get(e.id) : null) ?? null,
    })),
    salidas: despacho.map((e) => ({
      especie: e.speciesCommon,
      cientifico: e.speciesScientific,
      tipoProducto: e.productType,
      unidad: e.unit,
      cantidad: e.quantity != null ? Number(e.quantity) : 0,
      lote: (e.id ? lotesDeDespacho.get(e.id)?.join(", ") : null) ?? null,
    })),
    inicial,
    retrozados: retrozadoPorEspecie(retrozos),
  });

  const num = (row: import("exceljs").Row, keys: string[], fmt = "0.0000") => {
    for (const k of keys) row.getCell(k).numFmt = fmt;
  };

  const wr1 = wb.addWorksheet("Resumen 1 · Trozas");
  wr1.columns = [
    { header: "(1) Especie", key: "e", width: 20 },
    { header: "(2) Nombre científico", key: "sc", width: 24 },
    { header: "(3) Stock inicial m³", key: "i1", width: 16 },
    { header: "(4) Stock inicial N° trozas", key: "i2", width: 20 },
    { header: "(5) Ingresó m³", key: "g1", width: 14 },
    { header: "(6) Ingresó N° trozas", key: "g2", width: 18 },
    { header: "(7) Retrozado m³", key: "r1", width: 16 },
    { header: "(8) Retrozado N° trozas", key: "r2", width: 20 },
    { header: "(9) De retrozado m³", key: "d1", width: 18 },
    { header: "(10) De retrozado N° trozas", key: "d2", width: 22 },
    { header: "(11) Consumido m³", key: "c1", width: 16 },
    { header: "(12) Consumido N° trozas", key: "c2", width: 20 },
    { header: "(13) Salió m³", key: "s1", width: 14 },
    { header: "(14) Salió N° trozas", key: "s2", width: 18 },
    { header: "(15) Saldo final m³", key: "f1", width: 16 },
    { header: "(16) Saldo final N° trozas", key: "f2", width: 20 },
    { header: "CITES", key: "ci", width: 7 },
  ];
  styleHead(wr1);
  for (const f of resumen1) {
    const row = wr1.addRow({
      e: f.especie, sc: f.cientifico ?? "",
      i1: f.inicial.volumen, i2: f.inicial.piezas ?? "",
      g1: f.ingresado.volumen, g2: f.ingresado.piezas ?? "",
      r1: f.retrozado.volumen || "", r2: f.retrozado.piezas ?? "",
      d1: f.deRetrozado.volumen || "", d2: f.deRetrozado.piezas ?? "",
      c1: f.consumido.volumen, c2: f.consumido.piezas ?? "",
      s1: f.salido.volumen, s2: f.salido.piezas ?? "",
      f1: f.saldo.volumen, f2: f.saldo.piezas ?? "",
      ci: f.cites ? "SÍ" : "",
    });
    num(row, ["i1", "g1", "r1", "d1", "c1", "s1", "f1"]);
    if (f.saldo.volumen < 0) row.getCell("f1").font = { color: { argb: "FFB91C1C" }, bold: true };
  }

  const wr2 = wb.addWorksheet("Resumen 2 · Transformados");
  wr2.columns = [
    { header: "(1) Especie", key: "e", width: 20 },
    { header: "(2) Nombre científico", key: "sc", width: 24 },
    { header: "(3) Tipo de producto", key: "tp", width: 22 },
    { header: "(4) Unidad de medida", key: "u", width: 16 },
    { header: "(5) Stock inicial", key: "i", width: 14 },
    { header: "(6) Ingresó", key: "g", width: 12 },
    { header: "(7) Consumido", key: "c", width: 14 },
    { header: "(8) Producido", key: "p", width: 14 },
    { header: "(9) Salió", key: "s", width: 12 },
    { header: "(10) Saldo final", key: "f", width: 14 },
  ];
  styleHead(wr2);
  for (const f of resumen2) {
    const row = wr2.addRow({
      e: f.especie, sc: f.cientifico ?? "", tp: f.tipoProducto, u: unidadOficial(f.unidad),
      i: f.inicial, g: f.ingresado, c: f.consumido, p: f.producido, s: f.salido, f: f.saldo,
    });
    num(row, ["i", "g", "c", "p", "s", "f"]);
    if (f.saldo < 0) row.getCell("f").font = { color: { argb: "FFB91C1C" }, bold: true };
  }

  const wr3 = wb.addWorksheet("Resumen 3 · Balance");
  wr3.columns = [
    { header: "(1) N° de lote consumido", key: "l", width: 20 },
    { header: "(2) Tipo de producto del lote", key: "tp", width: 24 },
    { header: "(3) Especie", key: "e", width: 20 },
    { header: "(4) Nombre científico", key: "sc", width: 24 },
    { header: "(5) Unidad de medida", key: "uc", width: 16 },
    { header: "(6) Cantidad consumida", key: "qc", width: 18 },
    { header: "(7) Línea de producción", key: "lp", width: 18 },
    { header: "(8) Unidad del producto", key: "up", width: 18 },
    { header: "(9) Cantidad producida", key: "qp", width: 18 },
    { header: "(10) Consumido por reproceso", key: "rp", width: 22 },
    { header: "(11) Salió", key: "s", width: 12 },
    { header: "(12) Stock final", key: "st", width: 14 },
    { header: "(13) Rendimiento % / factor", key: "r", width: 22 },
  ];
  styleHead(wr3);
  for (const f of resumen3) {
    const row = wr3.addRow({
      l: f.lote, tp: f.tipoProducto, e: f.especie, sc: f.cientifico ?? "",
      uc: unidadOficial(f.unidadConsumo), qc: f.cantidadConsumida, lp: f.lineaProduccion,
      up: unidadOficial(f.unidadProducto), qp: f.cantidadProducida,
      rp: f.consumidoReproceso ?? "", s: f.salido, st: f.stock,
      r: f.rendimientoPct != null ? `${f.rendimientoPct}%` : (f.factorConversion ?? ""),
    });
    num(row, ["qc", "qp", "s", "st"]);
    if (f.stock < 0) row.getCell("st").font = { color: { argb: "FFB91C1C" }, bold: true };
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `lo-ctp-oficial-${ctpPeriodFileSuffix(period)}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
