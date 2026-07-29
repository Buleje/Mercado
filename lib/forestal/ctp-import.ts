"use client";

/**
 * ctp-import — parseo client-side del Excel LO-CTP para importar Ingresos (ADR-138).
 *
 * Acepta el formato OFICIAL (hoja «1. Ingreso», RDE D000025-2023) y el INTERNO
 * (hoja «Ingresos» del export «Exportar libro»), tolerante a variantes de cabecera
 * (normaliza acentos/puntuación). Devuelve las filas mapeadas + los problemas de
 * parseo por fila; el server (`/wood-entries/import`) re-valida y decide crear/saltar.
 *
 * El titular sale de la columna «Titular» (interno) o del 1er segmento de
 * «Observaciones» (oficial, donde el export mete «titular · notas»).
 */

import ExcelJS from "exceljs";
import {
  detectarMapeo,
  normalizarCabecera,
  type MapeoIngreso,
} from "./ctp-import-mapeo";

export interface ImportedIngreso {
  /** Fila del Excel (1-indexed) — para reportar errores contra el archivo. */
  row: number;
  gtfNumber: string;
  gtfDate: string | null;
  entryDate: string | null; // ISO date-only (medianoche UTC)
  providerName: string;
  originType: string; // enum WoodOriginType, o "otro"
  originRegion: string | null;
  speciesCommonName: string;
  speciesScientificName: string | null;
  speciesCites: boolean;
  citesPermiso: string | null;
  productType: string; // enum WoodProductType, o "otro"
  volumeM3: number;
  notes: string | null;
  /** Problemas de parseo (faltan campos obligatorios, etc.). */
  issues: string[];
}

export interface ParseResult {
  ok: boolean;
  format: "oficial" | "interno" | "desconocido";
  sheet: string | null;
  ingresos: ImportedIngreso[];
  error?: string;
  /** Cabeceras crudas del Excel (1-based, [0] vacío) — para el ajuste manual. */
  cabeceras?: string[];
  /** Filas crudas con su número: permiten re-mapear sin volver a leer el archivo. */
  filas?: FilaCruda[];
  /** El mapeo que se usó (el detectado). El operador puede cambiarlo y re-mapear. */
  mapeo?: MapeoIngreso;
}

/** Una fila del Excel tal cual, con su número visible para el operador. */
export interface FilaCruda {
  row: number;
  valores: unknown[];
}

/** Alias corto para el uso interno del módulo (se llama en ~8 lugares). */
const norm = normalizarCabecera;

const ORIGIN_MAP: Record<string, string> = {
  "concesion forestal": "concesion", concesion: "concesion",
  "predio privado": "predio_privado",
  "comunidad nativa": "comunidad_nativa", "comunidad campesina": "comunidad_nativa",
  reforestacion: "reforestacion", plantacion: "reforestacion",
  "re entrada ctp": "retroaserradero", "re entrada de otro ctp": "retroaserradero", retroaserradero: "retroaserradero",
  otro: "otro",
};
const PRODUCT_VALUES = new Set(["rolliza", "aserrada", "tablones", "listones", "durmientes", "pulgada", "carbon", "lena", "otro"]);
const PRODUCT_MAP: Record<string, string> = {
  "rolliza troncos": "rolliza", troncos: "rolliza",
  tablon: "tablones", liston: "listones", durmiente: "durmientes",
  "en pulgadas": "pulgada", "carbon vegetal": "carbon",
};

function mapOrigin(cell: string): { type: string; region: string | null } {
  const parts = cell.split(/·|\||\t/).map((p) => p.trim()).filter(Boolean);
  const type = ORIGIN_MAP[norm(parts[0])] ?? "otro";
  const region = parts.length > 1 ? parts.slice(1).join(" ") : null;
  return { type, region };
}
function mapProduct(cell: string): string {
  const n = norm(cell);
  if (PRODUCT_VALUES.has(n)) return n;
  return PRODUCT_MAP[n] ?? "otro";
}

/** Celda-fecha (Date de ExcelJS, o texto dd/mm/yyyy · yyyy-mm-dd) → ISO date-only. */
function toISODate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())).toISOString();
  const s = String(v).trim();
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const yy = y.length === 2 ? 2000 + Number(y) : Number(y);
    const dt = new Date(Date.UTC(yy, Number(m) - 1, Number(d)));
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate())).toISOString();
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[^\d.,-]/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function cellText(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as { text?: string }[]).map((r) => r.text ?? "").join("");
    if ("text" in o) return String(o.text ?? "");
    if ("result" in o) return String(o.result ?? "");
    if ("hyperlink" in o) return String(o.text ?? o.hyperlink ?? "");
  }
  return String(v).trim();
}

/**
 * `strict` = solo la hoja NOMBRADA, sin fallback por contenido. Lo usa el modo
 * «Libro completo» (que parsea las 3 hojas del mismo archivo): sin strict, el
 * fallback de una hoja ausente matchea una hoja de OTRO registro por columnas
 * en común (ej. «Tipo de Producto»+«Cantidad» del Ingreso disparaban una corrida
 * fantasma). En modo un-registro sí se permite el fallback (el operador eligió).
 */
export async function parseWoodEntriesXlsx(buffer: ArrayBuffer, opts?: { strict?: boolean }): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch (e) {
    return { ok: false, format: "desconocido", sheet: null, ingresos: [], error: `No se pudo leer el Excel: ${e instanceof Error ? e.message : String(e)}` };
  }

  // Hoja de ingresos: por nombre, o (no-strict) la primera con cabecera de GTF + especie.
  const byName = wb.worksheets.find((w) => /1\.?\s*ingreso|^ingresos?$/i.test(w.name.trim()));
  const ws = byName ?? (opts?.strict ? undefined : wb.worksheets.find((w) => {
    const hdr = (w.getRow(1).values as unknown[]).map(norm).join(" ");
    return /gtf|documento/.test(hdr) && /especie/.test(hdr);
  }));
  if (!ws) return { ok: false, format: "desconocido", sheet: null, ingresos: [], error: "No se encontró una hoja de Ingresos (esperada «1. Ingreso» o «Ingresos»)." };

  const cabeceras: string[] = [];
  ws.getRow(1).eachCell((cell, col) => { cabeceras[col] = cellText(cell.value); });

  // Qué columna es cada campo: lo decide `detectarMapeo` (single source con el
  // ajuste manual del modal). Antes esta función tenía su propio `findCol` y el
  // operador no tenía forma de corregirlo cuando su planilla no matcheaba.
  const mapeo = detectarMapeo(cabeceras);

  const format: ParseResult["format"] = /1\.?\s*ingreso/i.test(ws.name) ? "oficial" : "interno";

  const filas: FilaCruda[] = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const valores: unknown[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => { valores[col] = cell.value; });
    filas.push({ row: rowNum, valores });
  });

  return { ok: true, format, sheet: ws.name, ingresos: filasAIngresos(filas, mapeo), cabeceras, filas, mapeo };
}

/**
 * Construye los ingresos desde las filas crudas y un mapeo de columnas.
 *
 * Es el mismo camino para el mapeo AUTOMÁTICO y para el que corrige el operador
 * a mano: si fueran dos, la previsualización mostraría una cosa y la importación
 * escribiría otra.
 */
export function filasAIngresos(filas: FilaCruda[], mapeo: MapeoIngreso): ImportedIngreso[] {
  const get = (f: FilaCruda, campo: keyof MapeoIngreso): unknown => {
    const c = mapeo[campo];
    return c ? f.valores[c] : null;
  };

  const ingresos: ImportedIngreso[] = [];
  for (const f of filas) {
    const gtf = cellText(get(f, "gtfNumber")).trim();
    const especie = cellText(get(f, "speciesCommonName")).trim();
    const cantidad = toNumber(get(f, "volumeM3"));
    if (!gtf && !especie && cantidad === 0) continue; // fila vacía

    const obs = cellText(get(f, "notes")).trim();
    let provider = cellText(get(f, "providerName")).trim();
    let notes: string | null = obs || null;
    // Formato oficial: «Observaciones» trae «titular · notas» y no hay columna
    // de titular. Se parte sólo si el titular no vino por su cuenta.
    if (!provider && obs) {
      const segs = obs.split("·").map((x) => x.trim());
      provider = segs[0] ?? "";
      notes = segs.slice(1).join(" · ") || null;
    }

    const citesRaw = normalizarCabecera(get(f, "speciesCites"));
    const cites = /(^|\s)(si|s|x|true)(\s|$)/.test(citesRaw);
    const permiso = cellText(get(f, "citesPermiso")).trim();
    const origenCell = cellText(get(f, "originCode")).trim();
    const { type: originType, region: originRegion } = origenCell
      ? mapOrigin(origenCell)
      : { type: "otro", region: null };
    const productType = mapProduct(cellText(get(f, "productType")));

    const issues: string[] = [];
    if (!gtf) issues.push("Sin N° de GTF (origen legal obligatorio)");
    if (!especie) issues.push("Sin especie");
    if (!(cantidad > 0)) issues.push("Cantidad/volumen inválido (≤ 0)");

    ingresos.push({
      row: f.row,
      gtfNumber: gtf,
      gtfDate: null,
      entryDate: toISODate(get(f, "entryDate")),
      providerName: provider || "—",
      originType,
      originRegion,
      speciesCommonName: especie,
      speciesScientificName: cellText(get(f, "speciesScientificName")).trim() || null,
      speciesCites: cites,
      citesPermiso: permiso || null,
      productType,
      volumeM3: cantidad,
      notes: [notes, cites && permiso ? `Permiso CITES: ${permiso}` : ""].filter(Boolean).join(" · ") || null,
      issues,
    });
  }
  return ingresos;
}

// ─── Etapa 2: Producción + Consumos (ADR-138) ────────────────────────────────

export interface ImportedConsumo { gtfIngreso: string; volumeM3: number }
export interface ImportedProduccion {
  row: number;
  sourceLineNo: number | null; // «N°» de la corrida en el archivo (para matchear consumos)
  entryDate: string | null;
  productType: string;
  speciesCommon: string;
  gtfIngreso: string | null;
  unit: string; // m3 · pt · kg · unidad
  quantity: number;
  rendimientoPct: number | null;
  consumos: ImportedConsumo[]; // matcheados de la hoja «2. Consumos» por lineNo
  issues: string[];
}
export interface ProduccionParseResult {
  ok: boolean;
  produccion: ImportedProduccion[];
  error?: string;
}

const UNIT_MAP: Record<string, string> = { m3: "m3", "m 3": "m3", pt: "pt", "pie tablar": "pt", "pies tablares": "pt", kg: "kg", unidad: "unidad", unid: "unidad", und: "unidad" };
function mapUnit(cell: string): string {
  const n = norm(cell);
  return UNIT_MAP[n] ?? (n.includes("m3") || n.includes("m 3") ? "m3" : n.includes("pt") || n.includes("tabla") ? "pt" : "m3");
}

/** Header→columna finder con prioridad por keyword (mismo criterio que ingresos). */
function makeFinder(ws: ExcelJS.Worksheet) {
  const headers: string[] = [];
  ws.getRow(1).eachCell((cell, col) => { headers[col] = norm(cell.value); });
  const find = (...keys: string[]): number | null => {
    for (const k of keys) for (let c = 1; c < headers.length; c++) if (headers[c]?.includes(k)) return c;
    return null;
  };
  const get = (row: ExcelJS.Row, c: number | null): unknown => (c ? row.getCell(c).value : null);
  return { find, get, headers };
}

export async function parseProduccionXlsx(buffer: ArrayBuffer, opts?: { strict?: boolean }): Promise<ProduccionParseResult> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch (e) {
    return { ok: false, produccion: [], error: `No se pudo leer el Excel: ${e instanceof Error ? e.message : String(e)}` };
  }

  // Fallback SOLO por señal propia de producción (rendimiento/producido) + cantidad:
  // «producto» a secas colisiona con «Tipo de Producto» del Ingreso (corrida fantasma).
  const wProd = wb.worksheets.find((w) => /3\.?\s*produccion|^produccion$/i.test(norm(w.name).replace(/\s+/g, " ")))
    ?? (opts?.strict ? undefined : wb.worksheets.find((w) => { const h = (w.getRow(1).values as unknown[]).map(norm).join(" "); return /rendimiento|producido/.test(h) && /cantidad/.test(h); }));
  if (!wProd) return { ok: false, produccion: [], error: "No se encontró una hoja de Producción (esperada «3. Producción»)." };

  // Consumos (opcional): matchea GTF ingreso → corrida por su lineNo.
  const wCons = wb.worksheets.find((w) => /2\.?\s*consumo/i.test(norm(w.name)));
  const consumosByCorrida = new Map<number, ImportedConsumo[]>();
  if (wCons) {
    const { find, get } = makeFinder(wCons);
    const cG = find("n fuente", "gtf ingreso", "gtf");
    const cDest = find("produccion destino", "destino", "corrida");
    const cVol = find("cantidad consumida", "cantidad", "volumen", "m3");
    wCons.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const gtf = cellText(get(row, cG)).trim();
      const vol = toNumber(get(row, cVol));
      const destTxt = cellText(get(row, cDest));
      const m = destTxt.match(/#\s*(\d+)/); // «Corrida #3 · …» → 3
      if (!gtf || !(vol > 0) || !m) return;
      const lineNo = Number(m[1]);
      const arr = consumosByCorrida.get(lineNo) ?? [];
      arr.push({ gtfIngreso: gtf, volumeM3: vol });
      consumosByCorrida.set(lineNo, arr);
    });
  }

  const { find, get } = makeFinder(wProd);
  const cN = find("n", "numero", "linea");
  const cFecha = find("fecha");
  const cProd = find("tipo de producto", "producto");
  const cEsp = find("especie");
  const cGtf = find("n fuente", "gtf ingreso", "gtf");
  const cUnit = find("unidad");
  const cCant = find("cantidad", "producido");
  const cRend = find("rendimiento");

  const produccion: ImportedProduccion[] = [];
  wProd.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const producto = cellText(get(row, cProd)).trim();
    const especie = cellText(get(row, cEsp)).trim();
    const cantidad = toNumber(get(row, cCant));
    if (!producto && !especie && cantidad === 0) return;

    const sourceLineNo = cN ? (Number(String(cellText(get(row, cN))).replace(/[^\d]/g, "")) || null) : null;
    const consumos = sourceLineNo != null ? (consumosByCorrida.get(sourceLineNo) ?? []) : [];
    const rendCell = cRend ? toNumber(get(row, cRend)) : 0;

    const issues: string[] = [];
    if (!(cantidad > 0)) issues.push("Cantidad producida inválida (≤ 0)");
    if (consumos.length === 0) issues.push("Sin materia prima atribuida (revisá la hoja «2. Consumos»)");

    produccion.push({
      row: rowNum,
      sourceLineNo,
      entryDate: toISODate(get(row, cFecha)),
      productType: producto || "—",
      speciesCommon: especie || "—",
      gtfIngreso: cellText(get(row, cGtf)).trim() || null,
      unit: mapUnit(cellText(get(row, cUnit))),
      quantity: cantidad,
      rendimientoPct: rendCell > 0 ? rendCell : null,
      consumos,
      issues,
    });
  });

  return { ok: true, produccion };
}

// ─── Etapa 2b: Salida (despachos) ────────────────────────────────────────────

export interface ImportedSalida {
  row: number;
  entryDate: string | null;
  gtfNumber: string | null; // GTF de salida (puede faltar si no se emitió)
  productType: string;
  speciesCommon: string;
  unit: string;
  quantity: number;
  destino: string | null;
  issues: string[];
}
export interface SalidaParseResult {
  ok: boolean;
  salida: ImportedSalida[];
  error?: string;
}

export async function parseSalidaXlsx(buffer: ArrayBuffer, opts?: { strict?: boolean }): Promise<SalidaParseResult> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch (e) {
    return { ok: false, salida: [], error: `No se pudo leer el Excel: ${e instanceof Error ? e.message : String(e)}` };
  }

  const ws = wb.worksheets.find((w) => /4\.?\s*salida|^salida$|^despachos?$/i.test(norm(w.name).replace(/\s+/g, " ")))
    ?? (opts?.strict ? undefined : wb.worksheets.find((w) => { const h = (w.getRow(1).values as unknown[]).map(norm).join(" "); return /destino/.test(h) && /cantidad/.test(h); }));
  if (!ws) return { ok: false, salida: [], error: "No se encontró una hoja de Salida (esperada «4. Salida»)." };

  const { find, get } = makeFinder(ws);
  const cGtf = find("n de documento", "gtf salida", "gtf");
  const cFecha = find("fecha");
  const cProd = find("tipo de producto", "producto");
  const cEsp = find("especie");
  const cUnit = find("unidad");
  const cCant = find("cantidad");
  const cDest = find("destino");

  const salida: ImportedSalida[] = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const producto = cellText(get(row, cProd)).trim();
    const especie = cellText(get(row, cEsp)).trim();
    const cantidad = toNumber(get(row, cCant));
    if (!producto && !especie && cantidad === 0) return;

    const issues: string[] = [];
    if (!(cantidad > 0)) issues.push("Cantidad despachada inválida (≤ 0)");
    if (!producto) issues.push("Sin tipo de producto");

    salida.push({
      row: rowNum,
      entryDate: toISODate(get(row, cFecha)),
      gtfNumber: cellText(get(row, cGtf)).trim() || null,
      productType: producto || "—",
      speciesCommon: especie || "—",
      unit: mapUnit(cellText(get(row, cUnit))),
      quantity: cantidad,
      destino: cellText(get(row, cDest)).trim() || null,
      issues,
    });
  });

  return { ok: true, salida };
}

// ─── Plantilla descargable (ADR-138) ─────────────────────────────────────────
// El Excel LO-CTP vacío para arrancar SIN el export SNIFFS. Mismas cabeceras que
// `exportarLibroCtpOficial` (ctp-export) → una plantilla llena importa 1:1. Trae
// una fila de ejemplo por hoja (en gris) que muestra cómo se enlazan las hojas.

function styleTemplateHead(ws: ExcelJS.Worksheet): void {
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F5132" } };
  head.height = 22;
  ws.views = [{ state: "frozen", ySplit: 1 }];
}
function markExample(row: ExcelJS.Row): void {
  row.eachCell((c) => { c.font = { italic: true, color: { argb: "FF9CA3AF" } }; });
}

export async function descargarPlantillaLoCtp(): Promise<void> {
  const wb = new ExcelJS.Workbook();

  // Hoja guía (el parser la ignora: solo lee «1. Ingreso» … «4. Salida»).
  const wIns = wb.addWorksheet("Instrucciones");
  wIns.getColumn(1).width = 96;
  const lines: [string, boolean][] = [
    ["Plantilla — Libro de Operaciones del CTP (LO-CTP · SERFOR, RDE D000025-2023)", true],
    ["", false],
    ["Completá las 4 hojas y subila con «Importar libro» → «Libro completo».", false],
    ["Cada hoja trae UNA fila de ejemplo (en gris): reemplazala por tus datos y borrala si no la usás.", false],
    ["", false],
    ["1. Ingreso — materia prima que entra al CTP. La GTF (N° de Documento) es el origen legal: obligatoria.", false],
    ["2. Consumos — qué GTF de ingreso alimenta cada corrida. «Producción destino» debe decir «Corrida #N» (N = fila de la hoja 3).", false],
    ["3. Producción — la transformación: producto terminado + rendimiento. Se importa DESPUÉS de los ingresos.", false],
    ["4. Salida — los despachos. Se validan contra lo producido (no se despacha más de lo transformado).", false],
    ["", false],
    ["Orden de importación (automático en «Libro completo»): Ingreso → Producción → Salida.", false],
    ["Las filas que ya existan se saltan; las que difieran se marcan (no se sobrescriben).", false],
  ];
  for (const [t, bold] of lines) {
    const r = wIns.addRow([t]);
    if (bold) r.font = { bold: true, size: 13 };
  }

  // 1. Ingreso
  const w1 = wb.addWorksheet("1. Ingreso");
  w1.columns = [
    { header: "N° Registro", key: "n", width: 11 }, { header: "Fecha", key: "f", width: 13 },
    { header: "Tipo de Documento", key: "td", width: 16 }, { header: "N° de Documento", key: "nd", width: 16 },
    { header: "N° Fuente de Origen/Procedencia", key: "fo", width: 22 },
    { header: "Código de Origen/Procedencia", key: "co", width: 22 },
    { header: "Código de CTP", key: "cc", width: 14 }, { header: "Tipo de Producto", key: "tp", width: 14 },
    { header: "Especie", key: "e", width: 16 }, { header: "Nombre científico", key: "sc", width: 20 },
    { header: "CITES", key: "ci", width: 7 }, { header: "N° Permiso CITES", key: "cp", width: 18 },
    { header: "Unidad de Medida", key: "u", width: 14 },
    { header: "Cantidad", key: "q", width: 12 }, { header: "Observaciones", key: "o", width: 30 },
  ];
  styleTemplateHead(w1);
  markExample(w1.addRow({ n: 1, f: "01/06/2026", td: "GTF", nd: "GTF-EJEMPLO-001", fo: "CONC-001", co: "Concesión forestal · Ucayali", cc: "CTP-XX-000000", tp: "rolliza", e: "Tornillo", sc: "Cedrelinga cateniformis", ci: "", cp: "", u: "m³", q: 20, o: "Proveedor Ejemplo SAC" }));

  // 2. Consumos
  const wco = wb.addWorksheet("2. Consumos");
  wco.columns = [
    { header: "N°", key: "n", width: 6 }, { header: "N° Fuente (GTF ingreso)", key: "g", width: 24 },
    { header: "Especie", key: "e", width: 18 }, { header: "Producción destino", key: "c", width: 30 },
    { header: "Unidad de Medida", key: "u", width: 14 }, { header: "Cantidad consumida", key: "q", width: 16 },
  ];
  styleTemplateHead(wco);
  markExample(wco.addRow({ n: 1, g: "GTF-EJEMPLO-001", e: "Tornillo", c: "Corrida #1 · Madera aserrada · Tornillo", u: "m³", q: 20 }));

  // 3. Producción
  const w2 = wb.addWorksheet("3. Producción");
  w2.columns = [
    { header: "N°", key: "n", width: 6 }, { header: "Fecha", key: "f", width: 13 },
    { header: "Código de CTP", key: "cc", width: 14 }, { header: "Tipo de Producto", key: "tp", width: 16 },
    { header: "Especie", key: "e", width: 16 }, { header: "N° Fuente (GTF ingreso)", key: "fo", width: 24 },
    { header: "Unidad de Medida", key: "u", width: 14 }, { header: "Cantidad", key: "q", width: 12 },
    { header: "Rendimiento %", key: "r", width: 13 }, { header: "Observaciones", key: "o", width: 30 },
  ];
  styleTemplateHead(w2);
  markExample(w2.addRow({ n: 1, f: "03/06/2026", cc: "CTP-XX-000000", tp: "Madera aserrada", e: "Tornillo", fo: "GTF-EJEMPLO-001", u: "m3", q: 12, r: 60, o: "" }));

  // 4. Salida
  const w3 = wb.addWorksheet("4. Salida");
  w3.columns = [
    { header: "N°", key: "n", width: 6 }, { header: "Fecha", key: "f", width: 13 },
    { header: "Tipo de Documento", key: "td", width: 16 }, { header: "N° de Documento (GTF)", key: "nd", width: 18 },
    { header: "Código de CTP", key: "cc", width: 14 }, { header: "Tipo de Producto", key: "tp", width: 16 },
    { header: "Especie", key: "e", width: 16 }, { header: "Unidad de Medida", key: "u", width: 14 },
    { header: "Cantidad", key: "q", width: 12 }, { header: "Destino", key: "de", width: 24 },
    { header: "Observaciones", key: "o", width: 24 },
  ];
  styleTemplateHead(w3);
  markExample(w3.addRow({ n: 1, f: "05/06/2026", td: "GTF", nd: "GTF-SAL-EJEMPLO-001", cc: "CTP-XX-000000", tp: "Madera aserrada", e: "Tornillo", u: "m3", q: 10, de: "Cliente Ejemplo SAC", o: "" }));

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla-LO-CTP.xlsx";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
