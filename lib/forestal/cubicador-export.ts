/**
 * cubicador-export.ts — exporta el lote cubicado a PDF (jsPDF + autotable) y
 * Excel (.xlsx, exceljs). Client-only con imports dinámicos (fuera del bundle
 * inicial). PURO respecto a UI: recibe filas + opciones, devuelve/descarga.
 */
import type { PiezaCubicada } from "./cubicacion";
import { PT_POR_M3 } from "./cubicacion";

export interface ExportOpts {
  precioPt: number;      // S/ por pie tablar (0 = sin precio)
  especieGlobal?: string;
}

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
  const conPrecio = opts.precioPt > 0;

  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text("Cubicación de madera", 40, 44);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(110);
  doc.text(`Fecha: ${fecha()}${opts.especieGlobal ? ` · Especie: ${opts.especieGlobal}` : ""}${conPrecio ? ` · Precio: S/ ${opts.precioPt.toFixed(2)}/PT` : ""}`, 40, 62);

  const head = [["Cant.", "Espesor", "Ancho", "Largo", "Especie", "Pie tablar", "m³", ...(conPrecio ? ["Valor S/"] : [])]];
  const body = rows.map((r) => [
    String(r.cantidad),
    `${r.espesor} ${r.uEspesor}`,
    `${r.ancho} ${r.uAncho}`,
    `${r.largo} ${r.uLargo}`,
    r.especie ?? "—",
    r.pieTablar.toFixed(2),
    r.m3.toFixed(4),
    ...(conPrecio ? [(r.pieTablar * opts.precioPt).toFixed(2)] : []),
  ]);
  const foot = [["", "", "", "", `Total · ${t.piezas} pzas`, `${t.pt.toFixed(2)} PT`, t.m3.toFixed(4), ...(conPrecio ? [`S/ ${(t.pt * opts.precioPt).toFixed(2)}`] : [])]];

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

/** Excel (.xlsx): una hoja con las filas, totales y formato numérico. */
export async function exportarExcel(rows: PiezaCubicada[], opts: ExportOpts): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Cubicación");
  const conPrecio = opts.precioPt > 0;

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
      ...(conPrecio ? { val: r.pieTablar * opts.precioPt } : {}),
    });
  }
  const t = totales(rows);
  const totalRow = ws.addRow({ esp2: `Total · ${t.piezas} pzas`, pt: t.pt, m3: t.m3, ...(conPrecio ? { val: t.pt * opts.precioPt } : {}) });
  totalRow.font = { bold: true };

  ws.getColumn("pt").numFmt = "0.00";
  ws.getColumn("m3").numFmt = "0.0000";
  if (conPrecio) ws.getColumn("val").numFmt = "0.00";

  const buf = await wb.xlsx.writeBuffer();
  descargar(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `cubicacion-${fecha()}.xlsx`);
}
