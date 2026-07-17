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
import { PLAZO_REGISTRO_DIAS, diasDeRegistro, estaFueraDePlazo } from "./ctp-compliance";
import { evaluarRendimiento } from "./ctp-rendimiento";

interface Ingreso {
  entryDate: string; gtfNumber: string; gtfDate: string | null; providerName: string;
  speciesCommonName: string; speciesScientificName: string | null; speciesCites: boolean;
  productType: string; volumeM3: string; pieces: number; status: string; createdAt: string;
}
interface WoodEntryStats {
  totalCount: number; totalVolumeM3: number; totalPieces: number; speciesCount: number;
  citesCount: number; citesVolumeM3: number; lateCount: number;
  byStatus: Record<string, number>;
}
interface CtpRow {
  lineNo: number; entryDate: string; gtfIngreso: string | null; speciesCommon: string | null;
  speciesScientific: string | null; cites: boolean; productType: string | null;
  volumeInputM3: string | null; rendimientoPct: string | null; quantity: string | null;
  unit: string | null; pieces: number | null; gtfNumber: string | null; destino: string | null;
  status: string;
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
  const [ing, prod, desp, sal, trz, fic] = await Promise.all([
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
  ]);
  const ingresos = ing.entries ?? [];
  const stats = ing.stats ?? null;
  const produccion = prod.entries ?? [];
  const despacho = desp.entries ?? [];
  const saldos = sal.saldos ?? null;
  const traza = trz.traza ?? null;
  const ficha = fic.ficha ?? null;

  // Señales informativas (mismas que el panel Cumplimiento — consistencia panel↔Excel).
  const normEsp = (x: string | null | undefined) => (x ?? "").trim().toLowerCase();
  const permisosCites = (ficha?.citesPermisos ?? []).map((p) => normEsp(p.especie)).filter(Boolean);
  const citesSinPermiso = (saldos?.porEspecie ?? [])
    .filter((e) => e.cites)
    .filter((e) => { const s = normEsp(e.especie); return !permisosCites.some((p) => s.includes(p) || p.includes(s)); })
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
    { header: "Producto", key: "p", width: 14 }, { header: "Volumen m³", key: "v", width: 12 },
    { header: "Piezas", key: "pz", width: 9 }, { header: "Estado", key: "st", width: 12 },
    { header: "Días registro", key: "d", width: 12 },
  ];
  styleHead(wi);
  for (const e of ingresos) {
    const late = diasDeRegistro(e);
    const row = wi.addRow({
      f: day(e.entryDate), g: e.gtfNumber, t: e.providerName, e: e.speciesCommonName,
      sc: e.speciesScientificName ?? "", c: e.speciesCites ? "SÍ" : "", p: e.productType,
      v: Number(e.volumeM3 ?? 0), pz: e.pieces ?? 0, st: e.status, d: late,
    });
    row.getCell("f").numFmt = "dd/mm/yyyy";
    row.getCell("v").numFmt = "0.0000";
    // `late` es el número que se MUESTRA (floored); el rojo lo decide el
    // predicado único, que matchea el lateCount del Resumen y del panel.
    if (estaFueraDePlazo(e)) row.getCell("d").font = { color: { argb: "FFB91C1C" }, bold: true };
    if (e.speciesCites) row.getCell("c").font = { color: { argb: "FFB91C1C" }, bold: true };
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
/** Ingreso con los campos de origen que el formato oficial necesita (superset del interno). */
interface IngresoOficial extends Ingreso {
  gtfSeries: string | null; originType: string; originCode: string | null; originRegion: string | null;
  providerDocument: string | null; notes: string | null;
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
  const [ing, prod, desp, sal, fic] = await Promise.all([
    getJson<{ entries?: IngresoOficial[] }>(
      withPeriod("/api/admin/forestal/wood-entries", { limit: "5000" }, period), {},
    ),
    getJson<{ entries?: CtpRow[] }>(withPeriod("/api/admin/forestal/ctp", { section: "produccion" }, period), {}),
    getJson<{ entries?: CtpRow[] }>(withPeriod("/api/admin/forestal/ctp", { section: "despacho" }, period), {}),
    getJson<{ saldos?: Saldos }>(withPeriod("/api/admin/forestal/ctp", { saldos: "1" }, period), {}),
    getJson<{ ficha?: CtpFichaLite }>("/api/admin/forestal/ctp-ficha", {}),
  ]);
  const ingresos = (ing.entries ?? []).filter((e) => e.status !== "anulado");
  const produccion = (prod.entries ?? []).filter((e) => e.status === "registrado");
  const despacho = (desp.entries ?? []).filter((e) => e.status === "registrado");
  const saldos = sal.saldos ?? null;
  const ficha = fic.ficha ?? null;
  const codigoCtp = ficha?.codigoCtp || "—";

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
  const w1 = wb.addWorksheet("1. Ingreso");
  w1.columns = [
    { header: "N° Registro", key: "n", width: 11 }, { header: "Fecha", key: "f", width: 13 },
    { header: "Tipo de Documento", key: "td", width: 16 }, { header: "N° de Documento", key: "nd", width: 16 },
    { header: "N° Fuente de Origen/Procedencia", key: "fo", width: 22 },
    { header: "Código de Origen/Procedencia", key: "co", width: 22 },
    { header: "Código de CTP", key: "cc", width: 14 }, { header: "Tipo de Producto", key: "tp", width: 14 },
    { header: "Especie", key: "e", width: 16 }, { header: "Nombre científico", key: "sc", width: 20 },
    { header: "CITES", key: "ci", width: 7 }, { header: "Unidad de Medida", key: "u", width: 14 },
    { header: "Cantidad", key: "q", width: 12 }, { header: "Observaciones", key: "o", width: 30 },
  ];
  styleHead(w1);
  ingresos.forEach((e, i) => {
    const row = w1.addRow({
      n: i + 1, f: day(e.entryDate), td: "GTF", nd: [e.gtfSeries, e.gtfNumber].filter(Boolean).join("-") || e.gtfNumber,
      fo: e.originCode ?? "", co: [originOf(e.originType), e.originRegion].filter(Boolean).join(" · "),
      cc: codigoCtp, tp: e.productType, e: e.speciesCommonName, sc: e.speciesScientificName ?? "",
      ci: e.speciesCites ? "SÍ" : "", u: "m³", q: Number(e.volumeM3 ?? 0),
      o: [e.providerName, e.notes].filter(Boolean).join(" · "),
    });
    row.getCell("f").numFmt = "dd/mm/yyyy"; row.getCell("q").numFmt = "0.0000";
    if (e.speciesCites) row.getCell("ci").font = { color: { argb: "FFB91C1C" }, bold: true };
  });

  // ── Registro 2: Transformación ──
  const w2 = wb.addWorksheet("2. Transformación");
  w2.columns = [
    { header: "N°", key: "n", width: 6 }, { header: "Fecha", key: "f", width: 13 },
    { header: "Código de CTP", key: "cc", width: 14 }, { header: "Tipo de Producto", key: "tp", width: 16 },
    { header: "Especie", key: "e", width: 16 }, { header: "N° Fuente (GTF ingreso)", key: "fo", width: 24 },
    { header: "Unidad de Medida", key: "u", width: 14 }, { header: "Cantidad", key: "q", width: 12 },
    { header: "Rendimiento %", key: "r", width: 13 }, { header: "Observaciones", key: "o", width: 30 },
  ];
  styleHead(w2);
  for (const e of produccion) {
    const row = w2.addRow({
      n: e.lineNo, f: day(e.entryDate), cc: codigoCtp, tp: e.productType ?? "", e: e.speciesCommon ?? "",
      fo: e.gtfIngreso ?? "", u: e.unit ?? "", q: e.quantity != null ? Number(e.quantity) : null,
      r: e.rendimientoPct != null ? Number(e.rendimientoPct) : null, o: "",
    });
    row.getCell("f").numFmt = "dd/mm/yyyy"; row.getCell("q").numFmt = "0.0000"; row.getCell("r").numFmt = "0.0";
  }

  // ── Registro 3: Salida ──
  const w3 = wb.addWorksheet("3. Salida");
  w3.columns = [
    { header: "N°", key: "n", width: 6 }, { header: "Fecha", key: "f", width: 13 },
    { header: "Tipo de Documento", key: "td", width: 16 }, { header: "N° de Documento (GTF)", key: "nd", width: 18 },
    { header: "Código de CTP", key: "cc", width: 14 }, { header: "Tipo de Producto", key: "tp", width: 16 },
    { header: "Especie", key: "e", width: 16 }, { header: "Unidad de Medida", key: "u", width: 14 },
    { header: "Cantidad", key: "q", width: 12 }, { header: "Destino", key: "de", width: 24 },
    { header: "Observaciones", key: "o", width: 24 },
  ];
  styleHead(w3);
  for (const e of despacho) {
    const row = w3.addRow({
      n: e.lineNo, f: day(e.entryDate), td: "GTF", nd: e.gtfNumber ?? "", cc: codigoCtp,
      tp: e.productType ?? "", e: e.speciesCommon ?? "", u: e.unit ?? "",
      q: e.quantity != null ? Number(e.quantity) : null, de: e.destino ?? "", o: "",
    });
    row.getCell("f").numFmt = "dd/mm/yyyy"; row.getCell("q").numFmt = "0.0000";
  }

  // ── Registro 4: Existencias (saldo del libro por especie + stock de productos) ──
  if (saldos) {
    const w4 = wb.addWorksheet("4. Existencias");
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

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `lo-ctp-oficial-${ctpPeriodFileSuffix(period)}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
