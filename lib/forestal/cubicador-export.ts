/**
 * cubicador-export.ts — exporta el lote cubicado a PDF (jsPDF + autotable) y
 * Excel (.xlsx, exceljs). Client-only con imports dinámicos (fuera del bundle
 * inicial). PURO respecto a UI: recibe filas + opciones, devuelve/descarga.
 */
import type { PiezaCubicada } from "./cubicacion";
import { PT_POR_M3 } from "./cubicacion";
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

function totales(rows: PiezaCubicada[]) {
  return {
    piezas: rows.reduce((a, r) => a + r.cantidad, 0),
    pt: r2(rows.reduce((a, r) => a + r.pieTablar, 0)),
    m3: Math.round(rows.reduce((a, r) => a + r.m3, 0) * 10000) / 10000,
  };
}

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** PDF: título + tabla (medidas, especie, PT, m³, valor) + totales. */
export async function exportarPDF(rows: PiezaCubicada[], opts: ExportOpts): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const t = totales(rows);
  const conPrecio = tieneValor(rows, opts);
  const totalValor = rows.reduce((a, r) => a + r.pieTablar * precioPieza(r, opts), 0);
  const precioTxt = opts.precioDe ? "por especie" : `S/ ${opts.precioPt.toFixed(2)}/PT`;

  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text("Cubicación de madera", 40, 44);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(110);
  doc.text(`Fecha: ${fecha()}${opts.especieGlobal ? ` · Especie: ${opts.especieGlobal}` : ""}${conPrecio ? ` · Precio: ${precioTxt}` : ""}`, 40, 62);

  const head = [["Cant.", "Espesor", "Ancho", "Largo", "Especie", "Pie tablar", "m³", ...(conPrecio ? ["Valor S/"] : [])]];
  const body = rows.map((r) => [
    String(r.cantidad),
    `${r.espesor} ${r.uEspesor}`,
    `${r.ancho} ${r.uAncho}`,
    `${r.largo} ${r.uLargo}`,
    r.especie ?? "—",
    r.pieTablar.toFixed(2),
    r.m3.toFixed(4),
    ...(conPrecio ? [(r.pieTablar * precioPieza(r, opts)).toFixed(2)] : []),
  ]);
  const foot = [["", "", "", "", `Total · ${t.piezas} pzas`, `${t.pt.toFixed(2)} PT`, t.m3.toFixed(4), ...(conPrecio ? [`S/ ${r2(totalValor).toFixed(2)}`] : [])]];

  autoTable(doc, {
    head, body, foot,
    startY: 78,
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [0, 128, 96], textColor: 255 },
    footStyles: { fillColor: [230, 244, 240], textColor: 20, fontStyle: "bold" },
    columnStyles: { 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" } },
  });
  const y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 100;
  doc.setFontSize(9); doc.setTextColor(120);
  doc.text(`1 m³ = ${PT_POR_M3} pie tablar · documento generado por el cubicador de Buleje.`, 40, y + 20);

  doc.save(`cubicacion-${fecha()}.pdf`);
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

/** Excel (.xlsx): una hoja con las filas, totales y formato numérico. */
export async function exportarExcel(rows: PiezaCubicada[], opts: ExportOpts): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Cubicación");
  const conPrecio = tieneValor(rows, opts);

  ws.columns = [
    { header: "Cantidad", key: "cant", width: 10 },
    { header: "Espesor", key: "esp", width: 10 },
    { header: "u.Esp", key: "uesp", width: 8 },
    { header: "Ancho", key: "anc", width: 10 },
    { header: "u.Anc", key: "uanc", width: 8 },
    { header: "Largo", key: "lar", width: 10 },
    { header: "u.Lar", key: "ular", width: 8 },
    { header: "Especie", key: "esp2", width: 16 },
    { header: "Pie tablar", key: "pt", width: 12 },
    { header: "m³", key: "m3", width: 12 },
    ...(conPrecio ? [{ header: "Valor S/", key: "val", width: 14 }] : []),
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF008060" } };
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

  for (const r of rows) {
    ws.addRow({
      cant: r.cantidad, esp: r.espesor, uesp: r.uEspesor, anc: r.ancho, uanc: r.uAncho,
      lar: r.largo, ular: r.uLargo, esp2: r.especie ?? "", pt: r.pieTablar, m3: r.m3,
      ...(conPrecio ? { val: r.pieTablar * precioPieza(r, opts) } : {}),
    });
  }
  const t = totales(rows);
  const totalValor = r2(rows.reduce((a, r) => a + r.pieTablar * precioPieza(r, opts), 0));
  const totalRow = ws.addRow({ esp2: `Total · ${t.piezas} pzas`, pt: t.pt, m3: t.m3, ...(conPrecio ? { val: totalValor } : {}) });
  totalRow.font = { bold: true };

  ws.getColumn("pt").numFmt = "0.00";
  ws.getColumn("m3").numFmt = "0.0000";
  if (conPrecio) ws.getColumn("val").numFmt = "0.00";

  const buf = await wb.xlsx.writeBuffer();
  descargar(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `cubicacion-${fecha()}.xlsx`);
}
