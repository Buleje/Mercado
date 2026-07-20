/**
 * loth-export.ts — Generación del Libro LO-TH en Excel (.xlsx) formato oficial
 * SERFOR (RDE 264-2019). Server-only: usa exceljs (import dinámico).
 *
 * Estructura del workbook:
 *  - Hoja "Carátula" (Anexo 1): datos del titular + título habilitante.
 *  - Una hoja por sección (1 Tala … 6 Despacho PT) con columnas oficiales.
 *  - Hoja "Resumen": conteo + volumen por sección.
 * Cada hoja marca anuladas (tachado) y registro fuera de plazo (15 días).
 */
import {
  LOTH_SECTIONS,
  diasDeRegistro,
  estaFueraDePlazo,
  type LothSection,
} from "@/lib/forestal/loth-constants";

type AnyEntry = Record<string, unknown>;
type AnyCaratula = Record<string, unknown> | null;

const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
const dateOnly = (v: unknown) => (v ? new Date(v as string) : null);

/** Días de registro / fuera de plazo — predicado ÚNICO (loth-constants). */
const lateDays = (e: AnyEntry): number | null =>
  diasDeRegistro(e.entryDate as string | null, e.createdAt as string | null);
const isLate = (e: AnyEntry): boolean =>
  estaFueraDePlazo(e.entryDate as string | null, e.createdAt as string | null);

const SECTION_TITLE: Record<LothSection, string> = {
  tala: "1. Tala (volteo)",
  trozado: "2. Trozado",
  despacho_troza: "3. Despacho de trozas",
  consumo_troza: "4. Consumo de trozas",
  producto_terminado: "5. Producto terminado",
  despacho_producto: "6. Despacho de producto terminado",
};

type ColDef = { header: string; width: number; get: (e: AnyEntry) => unknown; numFmt?: string };

const COMMON_HEAD: ColDef[] = [
  { header: "N°", width: 6, get: (e) => e.lineNo },
  { header: "Fecha actividad", width: 16, get: (e) => dateOnly(e.entryDate), numFmt: "dd/mm/yyyy" },
  { header: "Fecha registro", width: 16, get: (e) => dateOnly(e.createdAt), numFmt: "dd/mm/yyyy" },
];
const COMMON_TAIL: ColDef[] = [
  { header: "Observaciones", width: 30, get: (e) => e.observations ?? "" },
  { header: "Estado", width: 12, get: (e) => (e.status === "anulado" ? "ANULADO" : "Registrado") },
  { header: "Días registro", width: 12, get: (e) => lateDays(e) ?? "" },
];
const SP = (e: AnyEntry) => e.speciesCommon ?? "";
const SC = (e: AnyEntry) => e.speciesScientific ?? "";
const CITES = (e: AnyEntry) => (e.cites ? "SÍ" : "");
const VOL: ColDef = { header: "Volumen (m³)", width: 14, get: (e) => num(e.volumeM3), numFmt: "0.0000" };

const SECTION_COLS: Record<LothSection, ColDef[]> = {
  tala: [
    { header: "Cód. árbol", width: 14, get: (e) => `${e.treeCode ?? ""}${e.isRama ? " (R)" : ""}` },
    { header: "Especie", width: 18, get: SP }, { header: "Nombre científico", width: 24, get: SC }, { header: "CITES", width: 8, get: CITES },
    { header: "Ø mayor (m)", width: 12, get: (e) => num(e.diamMayorM), numFmt: "0.00" },
    { header: "Ø menor (m)", width: 12, get: (e) => num(e.diamMenorM), numFmt: "0.00" },
    { header: "Longitud (m)", width: 12, get: (e) => num(e.lengthM), numFmt: "0.00" },
    VOL,
  ],
  trozado: [
    { header: "Cód. troza", width: 14, get: (e) => `${e.trozaCode ?? ""}${e.isRama ? " (R)" : ""}` },
    { header: "Especie", width: 18, get: SP }, { header: "Nombre científico", width: 24, get: SC }, { header: "CITES", width: 8, get: CITES },
    { header: "Ø mayor (m)", width: 12, get: (e) => num(e.diamMayorM), numFmt: "0.00" },
    { header: "Ø menor (m)", width: 12, get: (e) => num(e.diamMenorM), numFmt: "0.00" },
    { header: "Longitud (m)", width: 12, get: (e) => num(e.lengthM), numFmt: "0.00" },
    VOL,
  ],
  despacho_troza: [
    { header: "Cód. troza", width: 14, get: (e) => e.trozaCode ?? "" },
    { header: "Cód. despacho", width: 16, get: (e) => e.despachoCode ?? "" },
    { header: "N° GTF", width: 18, get: (e) => e.gtfNumber ?? "" },
  ],
  consumo_troza: [
    { header: "Cód. troza", width: 14, get: (e) => e.trozaCode ?? "" },
    { header: "Especie", width: 18, get: SP }, { header: "Nombre científico", width: 24, get: SC },
    VOL,
    { header: "Consumo interno", width: 14, get: (e) => (e.consumoInterno ? "SÍ" : "") },
  ],
  producto_terminado: [
    { header: "Producto", width: 20, get: (e) => e.productType ?? "" },
    { header: "Especie", width: 18, get: SP }, { header: "Nombre científico", width: 24, get: SC },
    { header: "Cantidad", width: 12, get: (e) => num(e.quantity), numFmt: "0.0000" },
    { header: "Unidad", width: 10, get: (e) => unitLabel(e.unit) },
  ],
  despacho_producto: [
    { header: "N° GTF", width: 18, get: (e) => e.gtfNumber ?? "" },
    { header: "Producto", width: 20, get: (e) => e.productType ?? "" },
    { header: "Especie", width: 18, get: SP }, { header: "Nombre científico", width: 24, get: SC },
    { header: "Piezas", width: 10, get: (e) => e.pieces ?? "" },
    { header: "Cantidad", width: 12, get: (e) => num(e.quantity), numFmt: "0.0000" },
    { header: "Unidad", width: 10, get: (e) => unitLabel(e.unit) },
  ],
};

function unitLabel(u: unknown) {
  return u === "m3" ? "m³" : u === "kg" ? "Kg" : u === "unidad" ? "Unidad" : (u as string) ?? "";
}

const CARATULA_FIELDS: [string, string][] = [
  ["registroNumber", "N° de Registro (ARFFS)"], ["tomo", "N° de Tomo"],
  ["titularName", "Titular"], ["representanteLegal", "Representante legal"],
  ["tituloHabilitante", "N° Título Habilitante"], ["ruc", "RUC"], ["dni", "DNI"],
  ["domicilio", "Domicilio"], ["departamento", "Departamento"], ["provincia", "Provincia"], ["distrito", "Distrito"],
  ["telefono", "Teléfono"], ["email", "Correo"],
  ["docGestionType", "Documento de gestión"], ["docGestionName", "Nombre del documento"],
  ["resolucionNumber", "N° Resolución"],
];

const HEADER_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF14532D" } };
const HEADER_FONT = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };

/** Construye el workbook Excel del Libro LO-TH. Devuelve un Buffer .xlsx. */
export async function buildLothWorkbook(opts: {
  caratula: AnyCaratula;
  entries: AnyEntry[];
  generatedAtISO: string;
}): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Buleje — Libro LO-TH";
  wb.created = new Date(opts.generatedAtISO);

  // ── Carátula ──
  const cs = wb.addWorksheet("Carátula", { properties: { tabColor: { argb: "FF14532D" } } });
  cs.mergeCells("A1:B1");
  cs.getCell("A1").value = "LIBRO DE OPERACIONES — TÍTULOS HABILITANTES";
  cs.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF14532D" } };
  cs.mergeCells("A2:B2");
  cs.getCell("A2").value = "Anexo 1 · RDE N° 264-2019-MINAGRI-SERFOR-DE";
  cs.getCell("A2").font = { italic: true, size: 10, color: { argb: "FF6B7280" } };
  let row = 4;
  for (const [key, label] of CARATULA_FIELDS) {
    cs.getCell(`A${row}`).value = label;
    cs.getCell(`A${row}`).font = { bold: true };
    cs.getCell(`B${row}`).value = (opts.caratula?.[key] as string) ?? "—";
    row++;
  }
  cs.getColumn(1).width = 28;
  cs.getColumn(2).width = 44;

  // ── Una hoja por sección ──
  for (const section of LOTH_SECTIONS) {
    const cols = [...COMMON_HEAD, ...SECTION_COLS[section], ...COMMON_TAIL];
    const ws = wb.addWorksheet(SECTION_TITLE[section].slice(0, 28));
    ws.mergeCells(1, 1, 1, cols.length);
    ws.getCell(1, 1).value = SECTION_TITLE[section];
    ws.getCell(1, 1).font = { bold: true, size: 12, color: { argb: "FF14532D" } };

    const headerRow = ws.getRow(2);
    cols.forEach((c, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = c.header;
      cell.fill = HEADER_FILL; cell.font = HEADER_FONT;
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      ws.getColumn(i + 1).width = c.width;
    });
    headerRow.height = 24;

    const rows = opts.entries.filter((e) => e.section === section);
    rows.forEach((e) => {
      const r = ws.addRow(cols.map((c) => c.get(e) ?? ""));
      cols.forEach((c, i) => { if (c.numFmt) r.getCell(i + 1).numFmt = c.numFmt; });
      const annulled = e.status === "anulado";
      const late = isLate(e);
      if (annulled) r.font = { strike: true, color: { argb: "FF9CA3AF" } };
      if (late && !annulled) {
        // resalta la celda de "Días registro" en ámbar
        r.getCell(cols.length).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE68A" } };
      }
    });
    ws.views = [{ state: "frozen", ySplit: 2 }];
    if (rows.length === 0) {
      ws.getCell(3, 1).value = "Sin registros en esta sección.";
      ws.getCell(3, 1).font = { italic: true, color: { argb: "FF9CA3AF" } };
    }
  }

  // ── Resumen ──
  const rs = wb.addWorksheet("Resumen");
  rs.getCell("A1").value = "RESUMEN POR SECCIÓN";
  rs.getCell("A1").font = { bold: true, size: 12, color: { argb: "FF14532D" } };
  const head = rs.getRow(2);
  ["Sección", "Líneas", "Anuladas", "Fuera de plazo", "Volumen (m³)"].forEach((h, i) => {
    const cell = head.getCell(i + 1); cell.value = h; cell.fill = HEADER_FILL; cell.font = HEADER_FONT;
  });
  LOTH_SECTIONS.forEach((section) => {
    const rows = opts.entries.filter((e) => e.section === section);
    const reg = rows.filter((e) => e.status !== "anulado");
    const r = rs.addRow([
      SECTION_TITLE[section],
      reg.length,
      rows.length - reg.length,
      reg.filter((e) => isLate(e)).length,
      Math.round(reg.reduce((a, e) => a + (num(e.volumeM3) ?? 0), 0) * 10000) / 10000,
    ]);
    r.getCell(5).numFmt = "0.0000";
  });
  rs.columns.forEach((c, i) => { c.width = i === 0 ? 34 : 14; });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
