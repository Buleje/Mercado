/**
 * cubicador-export.ts — exporta el lote cubicado a PDF (jsPDF + autotable) y
 * Excel (.xlsx, exceljs). Client-only con imports dinámicos (fuera del bundle
 * inicial). PURO respecto a UI: recibe filas + opciones, devuelve/descarga.
 */
import type { Workbook, Worksheet } from "exceljs";
import type { PiezaCubicada } from "./cubicacion";
import { PT_POR_M3, toInches, toFeet } from "./cubicacion";
import type { TipoComercial } from "./cubicacion-tipo";
import { clasificarTipo, ordenTipo } from "./cubicacion-tipo";
import type { PrecioPt, ResumenLote } from "./cubicacion-resumen";
import { agruparPor } from "./cubicacion-resumen";
import type { DatosLiquidacion, Liquidacion } from "./cubicacion-liquidacion";
import { fechaLarga } from "./cubicacion-liquidacion";

export interface ExportOpts {
  precioPt: number;      // S/ por pie tablar (0 = sin precio)
  especieGlobal?: string;
  /** Precio por pieza (para precio por especie). Si falta, se usa precioPt. */
  precioDe?: (r: PiezaCubicada) => number;
}

/** Precio por PT de una pieza: resolver por especie si existe, si no el global. */
const precioPieza = (r: PiezaCubicada, opts: ExportOpts) => opts.precioDe?.(r) ?? opts.precioPt;
/** Hay valores que mostrar si el global > 0 o algún resolver da > 0. */
const tieneValor = (rows: PiezaCubicada[], opts: ExportOpts) =>
  opts.precioPt > 0 || rows.some((r) => precioPieza(r, opts) > 0);

const fecha = () => new Date().toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

function totales(rows: PiezaCubicada[]) {
  return {
    piezas: rows.reduce((a, r) => a + r.cantidad, 0),
    pt: r2(rows.reduce((a, r) => a + r.pieTablar, 0)),
    m3: Math.round(rows.reduce((a, r) => a + r.m3, 0) * 10000) / 10000,
  };
}

// ─── Agrupación por tipo (single source para el detalle de PDF y Excel) ──────
interface SubTot { piezas: number; pt: number; m3: number; valor: number; }
interface GrupoDetalle { tipo: TipoComercial; piezas: PiezaCubicada[]; sub: SubTot; }

/** Precio como resolver único (por especie si existe, si no el global). */
const precioResolver = (opts: ExportOpts): PrecioPt => opts.precioDe ?? opts.precioPt;

/**
 * Ordena las piezas por tipo comercial (comercial primero, orden canónico) y las
 * agrupa con su subtotal, conservando el orden de carga dentro de cada tipo.
 */
function agruparDetallePorTipo(rows: PiezaCubicada[], opts: ExportOpts): { grupos: GrupoDetalle[]; total: SubTot } {
  const orden = rows
    .map((r, i) => ({ r, tipo: clasificarTipo(r), i }))
    .sort((a, b) => ordenTipo(a.tipo) - ordenTipo(b.tipo) || a.i - b.i);
  const grupos: GrupoDetalle[] = [];
  const total: SubTot = { piezas: 0, pt: 0, m3: 0, valor: 0 };
  for (const { r, tipo } of orden) {
    let g = grupos[grupos.length - 1];
    if (!g || g.tipo !== tipo) { g = { tipo, piezas: [], sub: { piezas: 0, pt: 0, m3: 0, valor: 0 } }; grupos.push(g); }
    const valor = r.pieTablar * precioPieza(r, opts);
    g.piezas.push(r);
    g.sub.piezas += r.cantidad; g.sub.pt += r.pieTablar; g.sub.m3 += r.m3; g.sub.valor += valor;
    total.piezas += r.cantidad; total.pt += r.pieTablar; total.m3 += r.m3; total.valor += valor;
  }
  return { grupos, total };
}

/** Medidas en unidad de comercio: espesor/ancho en pulgadas, largo en pies. */
const espPulg = (v: number, u: PiezaCubicada["uEspesor"]) => r2(toInches(v, u));
const larPies = (v: number, u: PiezaCubicada["uLargo"]) => r2(toFeet(v, u));

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * PDF: título + tabla del lote ORDENADA por tipo (N° · medidas · tipo · especie ·
 * PT · m³ · valor) con subtotal por tipo y total general.
 */
export async function exportarPDF(rows: PiezaCubicada[], opts: ExportOpts): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const t = totales(rows);
  const conPrecio = tieneValor(rows, opts);
  const totalValor = rows.reduce((a, r) => a + r.pieTablar * precioPieza(r, opts), 0);
  const precioTxt = opts.precioDe ? "por especie" : `S/ ${opts.precioPt.toFixed(2)}/PT`;
  const { grupos } = agruparDetallePorTipo(rows, opts);

  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text("Cubicación de madera", 40, 44);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(110);
  doc.text(`Fecha: ${fecha()}${opts.especieGlobal ? ` · Especie: ${opts.especieGlobal}` : ""}${conPrecio ? ` · Precio: ${precioTxt}` : ""}`, 40, 62);

  const val = (v: number) => (conPrecio ? [v.toFixed(2)] : []);
  const head = [['N°', 'Cant.', 'Esp. "', 'Anc. "', "Largo '", "Tipo", "Especie", "Pie tablar", "m³", ...(conPrecio ? ["Valor S/"] : [])]];
  const body: (string | number)[][] = [];
  const subtotalRows = new Set<number>();
  let n = 0;
  for (const g of grupos) {
    for (const r of g.piezas) {
      body.push([
        String(++n), String(r.cantidad),
        String(espPulg(r.espesor, r.uEspesor)), String(espPulg(r.ancho, r.uAncho)), String(larPies(r.largo, r.uLargo)),
        g.tipo, r.especie ?? "—",
        r.pieTablar.toFixed(2), r.m3.toFixed(4), ...val(r.pieTablar * precioPieza(r, opts)),
      ]);
    }
    subtotalRows.add(body.length);
    body.push(["", String(g.sub.piezas), "", "", "", `Subtotal ${g.tipo}`, "", r2(g.sub.pt).toFixed(2), r4(g.sub.m3).toFixed(4), ...val(r2(g.sub.valor))]);
  }
  const foot = [["", String(t.piezas), "", "", "", "TOTAL GENERAL", "", `${t.pt.toFixed(2)} PT`, t.m3.toFixed(4), ...val(r2(totalValor))]];

  autoTable(doc, {
    head, body, foot,
    startY: 78,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [0, 128, 96], textColor: 255 },
    footStyles: { fillColor: [0, 128, 96], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { halign: "center" }, 1: { halign: "center" },
      2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" },
      7: { halign: "right" }, 8: { halign: "right" }, 9: { halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && subtotalRows.has(data.row.index)) {
        data.cell.styles.fillColor = [230, 244, 240];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });
  const y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 100;
  doc.setFontSize(9); doc.setTextColor(120);
  doc.text(`1 m³ = ${PT_POR_M3} pie tablar · medidas en pulgadas y pies · generado por el cubicador de Buleje.`, 40, y + 20);

  doc.save(`cubicacion-${fecha()}.pdf`);
}

/**
 * Plantilla de importación como .xlsx REAL — cada columna en su propia celda.
 * Un CSV se abre en una sola celda cuando el Excel del usuario usa ";" de
 * separador (locale es-PE); el .xlsx no depende del separador. Sin filas de
 * datos: solo los encabezados, listos para llenar.
 */
export async function descargarPlantillaImport(headers: string[]): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Cubicación");
  ws.columns = headers.map((h) => ({ header: h, key: h.toLowerCase(), width: Math.max(12, h.length + 6) }));
  const hdr = ws.getRow(1);
  hdr.font = { bold: true, color: { argb: "FFFFFFFF" } };
  hdr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF008060" } };
  hdr.alignment = { vertical: "middle", horizontal: "center" };
  hdr.height = 22;
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const buf = await wb.xlsx.writeBuffer();
  descargar(new Blob([buf], { type: MIME_XLSX }), "plantilla-cubicacion.xlsx");
}

/** PDF de la liquidación por especie (comprobante para el comprador). */
export async function exportarLiquidacionPDF(datos: DatosLiquidacion, liq: Liquidacion): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const conValor = liq.total > 0;
  const s = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  doc.setFont("helvetica", "bold"); doc.setFontSize(18);
  doc.text("Liquidación de madera", 40, 46);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(110);
  if (datos.emisor) doc.text(datos.emisor, 40, 62);
  doc.text(`Cliente: ${datos.cliente || "—"}${datos.documento ? ` · ${datos.documento}` : ""}`, 40, datos.emisor ? 78 : 62);
  doc.text(`Fecha: ${fechaLarga(datos.fecha)}`, 400, datos.emisor ? 78 : 62);

  const head = [["Especie", "Piezas", "Pie tablar", ...(conValor ? ["S/ / PT", "Subtotal"] : [])]];
  const body = liq.lineas.map((l) => [
    l.especie, String(l.piezas), s(l.pieTablar),
    ...(conValor ? [`S/ ${s(l.precioPt)}`, `S/ ${s(l.subtotal)}`] : []),
  ]);
  const foot = [[`Total · ${liq.totalPiezas} pzas`, String(liq.totalPiezas), `${s(liq.totalPt)} PT`, ...(conValor ? ["", `S/ ${s(liq.total)}`] : [])]];

  autoTable(doc, {
    head, body, foot,
    startY: datos.emisor ? 92 : 78,
    styles: { fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: [0, 128, 96], textColor: 255 },
    footStyles: { fillColor: [230, 244, 240], textColor: 20, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
  });
  let y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 120;
  if (datos.nota) {
    doc.setFontSize(10); doc.setTextColor(80);
    doc.text(doc.splitTextToSize(datos.nota, 515), 40, y + 22); y += 22 + datos.nota.split("\n").length * 12;
  }
  doc.setFontSize(9); doc.setTextColor(120);
  doc.text(`${s(liq.totalM3)} m³ · documento generado por el cubicador de Buleje.`, 40, y + 24);
  doc.save(`liquidacion-${datos.cliente ? datos.cliente.toLowerCase().replace(/\s+/g, "-").slice(0, 24) : fecha()}.pdf`);
}

// ─── Excel ──────────────────────────────────────────────────────────────────
const TEAL = "FF008060";        // header / total general
const TEAL_SOFT = "FFE6F4F0";   // subtotal por tipo
const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Encabezado (fila 1) teal con texto blanco centrado + congelado. */
function estilarHeader(ws: Worksheet): void {
  const head = ws.getRow(1);
  head.height = 22;
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
    c.alignment = { vertical: "middle", horizontal: "center" };
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

/** Pinta una fila completa con un fondo sólido (subtotal/total). */
function pintarFila(ws: Worksheet, row: ReturnType<Worksheet["addRow"]>, argb: string, blanco: boolean): void {
  row.font = { bold: true, ...(blanco ? { color: { argb: "FFFFFFFF" } } : {}) };
  const nCols = ws.columnCount;
  for (let i = 1; i <= nCols; i++) {
    row.getCell(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
  }
}

/**
 * Hoja de resumen: una fila por grupo (label · piezas · PT · m³ · % del PT · valor)
 * ordenada como venga `resumen.grupos`, con fila TOTAL al pie.
 */
function hojaResumen(wb: Workbook, nombre: string, etiqueta: string, resumen: ResumenLote, conPrecio: boolean): void {
  const ws = wb.addWorksheet(nombre);
  ws.columns = [
    { header: etiqueta, key: "g", width: 22 },
    { header: "Piezas", key: "cant", width: 10 },
    { header: "Pie tablar", key: "pt", width: 13 },
    { header: "m³", key: "m3", width: 11 },
    { header: "% PT", key: "pct", width: 9 },
    ...(conPrecio ? [{ header: "Valor S/", key: "val", width: 14 }] : []),
  ];
  estilarHeader(ws);
  for (const g of resumen.grupos) {
    ws.addRow({ g: g.label, cant: g.cantidad, pt: g.pieTablar, m3: g.m3, pct: g.pctPt / 100, ...(conPrecio ? { val: g.valor } : {}) });
  }
  const tot = ws.addRow({
    g: "TOTAL", cant: resumen.total.cantidad, pt: resumen.total.pieTablar, m3: resumen.total.m3, pct: 1,
    ...(conPrecio ? { val: resumen.total.valor } : {}),
  });
  pintarFila(ws, tot, TEAL, true);
  ws.getColumn("pt").numFmt = "#,##0.00";
  ws.getColumn("m3").numFmt = "#,##0.0000";
  ws.getColumn("pct").numFmt = "0.0%";
  if (conPrecio) ws.getColumn("val").numFmt = "#,##0.00";
}

/**
 * Excel (.xlsx) con 3 hojas: "Detalle" (piezas numeradas, ORDENADAS por tipo —
 * comercial primero — con subtotal por tipo y total general), "Resumen por tipo"
 * y "Por especie". Espesor/ancho en pulgadas y largo en pies (unidad de comercio).
 */
export async function exportarExcel(rows: PiezaCubicada[], opts: ExportOpts): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Cubicador de Buleje";
  const conPrecio = tieneValor(rows, opts);
  const { grupos, total } = agruparDetallePorTipo(rows, opts);
  const precio = precioResolver(opts);

  // ── Hoja 1: Detalle por tipo ──
  const ws = wb.addWorksheet("Detalle");
  ws.columns = [
    { header: "N°", key: "n", width: 6 },
    { header: "Cantidad", key: "cant", width: 10 },
    { header: "Espesor (pulg)", key: "esp", width: 14 },
    { header: "Ancho (pulg)", key: "anc", width: 13 },
    { header: "Largo (pies)", key: "lar", width: 13 },
    { header: "Tipo", key: "tipo", width: 18 },
    { header: "Especie", key: "especie", width: 16 },
    { header: "Pie tablar", key: "pt", width: 12 },
    { header: "m³", key: "m3", width: 11 },
    ...(conPrecio ? [{ header: "Valor S/", key: "val", width: 14 }] : []),
  ];
  estilarHeader(ws);

  let n = 0;
  for (const g of grupos) {
    for (const r of g.piezas) {
      ws.addRow({
        n: ++n, cant: r.cantidad,
        esp: espPulg(r.espesor, r.uEspesor), anc: espPulg(r.ancho, r.uAncho), lar: larPies(r.largo, r.uLargo),
        tipo: g.tipo, especie: r.especie ?? "",
        pt: r.pieTablar, m3: r.m3,
        ...(conPrecio ? { val: r.pieTablar * precioPieza(r, opts) } : {}),
      });
    }
    const sub = ws.addRow({
      cant: g.sub.piezas, tipo: `Subtotal ${g.tipo}`, pt: r2(g.sub.pt), m3: r4(g.sub.m3),
      ...(conPrecio ? { val: r2(g.sub.valor) } : {}),
    });
    pintarFila(ws, sub, TEAL_SOFT, false);
  }
  const totalRow = ws.addRow({
    cant: total.piezas, tipo: "TOTAL GENERAL", pt: r2(total.pt), m3: r4(total.m3),
    ...(conPrecio ? { val: r2(total.valor) } : {}),
  });
  pintarFila(ws, totalRow, TEAL, true);

  ws.getColumn("esp").numFmt = "0.##";
  ws.getColumn("anc").numFmt = "0.##";
  ws.getColumn("lar").numFmt = "0.##";
  ws.getColumn("pt").numFmt = "#,##0.00";
  ws.getColumn("m3").numFmt = "#,##0.0000";
  if (conPrecio) ws.getColumn("val").numFmt = "#,##0.00";

  // ── Hoja 2: Resumen por tipo (mismo orden canónico que el detalle) ──
  const porTipo = agruparPor(rows, "tipo", precio);
  porTipo.grupos.sort((a, b) => ordenTipo(a.clave as TipoComercial) - ordenTipo(b.clave as TipoComercial));
  hojaResumen(wb, "Resumen por tipo", "Tipo", porTipo, conPrecio);

  // ── Hoja 3: Por especie (ordenada por pie tablar, la que más pesa arriba) ──
  hojaResumen(wb, "Por especie", "Especie", agruparPor(rows, "especie", precio), conPrecio);

  const buf = await wb.xlsx.writeBuffer();
  descargar(new Blob([buf], { type: MIME_XLSX }), `cubicacion-${fecha()}.xlsx`);
}
