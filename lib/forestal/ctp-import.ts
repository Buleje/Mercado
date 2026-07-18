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
}

/** Normaliza una cabecera: minúsculas, sin acentos, sin puntuación. */
const norm = (s: unknown): string =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

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

export async function parseWoodEntriesXlsx(buffer: ArrayBuffer): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch (e) {
    return { ok: false, format: "desconocido", sheet: null, ingresos: [], error: `No se pudo leer el Excel: ${e instanceof Error ? e.message : String(e)}` };
  }

  // Hoja de ingresos: por nombre, o la primera con cabecera de GTF + especie.
  const byName = wb.worksheets.find((w) => /1\.?\s*ingreso|^ingresos?$/i.test(w.name.trim()));
  const ws = byName ?? wb.worksheets.find((w) => {
    const hdr = (w.getRow(1).values as unknown[]).map(norm).join(" ");
    return /gtf|documento/.test(hdr) && /especie/.test(hdr);
  });
  if (!ws) return { ok: false, format: "desconocido", sheet: null, ingresos: [], error: "No se encontró una hoja de Ingresos (esperada «1. Ingreso» o «Ingresos»)." };

  const headers: string[] = [];
  ws.getRow(1).eachCell((cell, col) => { headers[col] = norm(cell.value); });
  // Prioridad POR KEYWORD: prueba la 1ª keyword en todas las columnas, luego la
  // 2ª, etc. Así «codigo de origen» gana sobre «n fuente de origen» (ambas tienen
  // «origen»); si buscara por columna, agarraría la primera que matchee cualquiera.
  const findCol = (...keys: string[]): number | null => {
    for (const k of keys) {
      for (let c = 1; c < headers.length; c++) {
        if (headers[c]?.includes(k)) return c;
      }
    }
    return null;
  };

  const cGtf = findCol("n de documento", "n gtf", "gtf");
  const cFecha = findCol("fecha de ingreso", "fecha ingreso", "fecha");
  const cTitular = findCol("titular");
  const cEspecie = findCol("especie");
  const cCientifico = findCol("cientifico");
  const cPermiso = findCol("permiso cites", "n permiso");
  const cCites = findCol("cites"); // el 1º con "cites" = la col booleana (antes que "n permiso cites")
  const cProducto = findCol("tipo de producto", "producto");
  const cCantidad = findCol("cantidad", "volumen");
  const cOrigen = findCol("codigo de origen", "origen procedencia", "origen");
  const cObs = findCol("observaciones", "notas");

  const format: ParseResult["format"] = /1\.?\s*ingreso/i.test(ws.name) ? "oficial" : "interno";
  const get = (row: ExcelJS.Row, c: number | null): unknown => (c ? row.getCell(c).value : null);

  const ingresos: ImportedIngreso[] = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const gtf = cellText(get(row, cGtf)).trim();
    const especie = cellText(get(row, cEspecie)).trim();
    const cantidad = toNumber(get(row, cCantidad));
    if (!gtf && !especie && cantidad === 0) return; // fila vacía

    const obs = cellText(get(row, cObs)).trim();
    let provider = cellText(get(row, cTitular)).trim();
    let notes: string | null = obs || null;
    if (!provider && obs) {
      const segs = obs.split("·").map((s) => s.trim());
      provider = segs[0] ?? "";
      notes = segs.slice(1).join(" · ") || null;
    }

    const citesRaw = cCites && cCites !== cPermiso ? norm(get(row, cCites)) : "";
    const cites = /(^|\s)(si|s|x|true)(\s|$)/.test(citesRaw);
    const permiso = cellText(get(row, cPermiso)).trim();
    const origenCell = cellText(get(row, cOrigen)).trim();
    const { type: originType, region: originRegion } = origenCell ? mapOrigin(origenCell) : { type: "otro", region: null };
    const productType = mapProduct(cellText(get(row, cProducto)));

    const issues: string[] = [];
    if (!gtf) issues.push("Sin N° de GTF (origen legal obligatorio)");
    if (!especie) issues.push("Sin especie");
    if (!(cantidad > 0)) issues.push("Cantidad/volumen inválido (≤ 0)");

    const fecha = toISODate(get(row, cFecha));
    ingresos.push({
      row: rowNum,
      gtfNumber: gtf,
      gtfDate: null,
      entryDate: fecha,
      providerName: provider || "—",
      originType,
      originRegion,
      speciesCommonName: especie,
      speciesScientificName: cellText(get(row, cCientifico)).trim() || null,
      speciesCites: cites,
      citesPermiso: permiso || null,
      productType,
      volumeM3: cantidad,
      notes: [notes, cites && permiso ? `Permiso CITES: ${permiso}` : ""].filter(Boolean).join(" · ") || null,
      issues,
    });
  });

  return { ok: true, format, sheet: ws.name, ingresos };
}
