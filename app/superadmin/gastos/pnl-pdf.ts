/**
 * pnl-pdf.ts — exporta el Estado de resultados de la plataforma (P&L) a un PDF de
 * una página: ingresos (MRR) vs gasto real → utilidad, margen, proyección anual y
 * break-even, más el desglose por categoría y la tendencia. Client-side con jsPDF
 * (dynamic import para no pesar el bundle). Brandon 2026-06-30.
 */

import { CAT_META, computePnl, fmtPen, type Summary } from "./gastos-helpers";

export interface PnlPdfInput {
  mrrPen: number;
  payingTenants: number;
  summary: Summary | null;
  fxRate: number;
  dateStr: string; // fecha de emisión ya formateada (evita Date.now en módulos)
}

const TEAL: [number, number, number] = [0, 160, 160];
const GREEN: [number, number, number] = [5, 150, 105];
const RED: [number, number, number] = [220, 38, 38];
const GREY: [number, number, number] = [120, 120, 120];

export async function generatePnlPDF(input: PnlPdfInput): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const runRate = input.summary?.monthlyRunRatePen ?? 0;
  const avgRevenue = input.payingTenants > 0 ? input.mrrPen / input.payingTenants : null;
  const pnl = computePnl(input.mrrPen, runRate, avgRevenue);
  const profitable = pnl.profitPen >= 0;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 14;
  let y = 20;

  // Encabezado
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(20, 20, 20);
  doc.text("Buleje SaaS", M, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GREY);
  doc.text(input.dateStr, W - M, y, { align: "right" });
  y += 6;
  doc.setFontSize(11);
  doc.setTextColor(...TEAL);
  doc.setFont("helvetica", "bold");
  doc.text("Estado de resultados — plataforma", M, y);
  y += 4;
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(0.6);
  doc.line(M, y, W - M, y);
  y += 10;

  // Fila de 3 métricas (MRR / gasto / utilidad)
  const col = (W - M * 2) / 3;
  const metric = (i: number, label: string, value: string, color: [number, number, number]) => {
    const x = M + col * i;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...GREY);
    doc.text(label.toUpperCase(), x, y);
    doc.setFontSize(15);
    doc.setTextColor(...color);
    doc.text(value, x, y + 8);
  };
  metric(0, "Ingresos (MRR)", fmtPen(input.mrrPen), TEAL);
  metric(1, "Gasto real / mes", fmtPen(runRate), [40, 40, 40]);
  metric(2, "Utilidad / mes", `${profitable ? "+" : "−"}${fmtPen(Math.abs(pnl.profitPen))}`, profitable ? GREEN : RED);
  y += 16;

  // Línea de contexto (margen · anual · break-even)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(70, 70, 70);
  const marginTxt = pnl.marginPct === null ? "sin ingresos" : `Margen ${pnl.marginPct.toFixed(0)}%`;
  const annualTxt = `${profitable ? "Gana" : "Pierde"} ${fmtPen(Math.abs(pnl.annualProfitPen))}/año`;
  const beTxt =
    pnl.breakEvenTenants === null
      ? "break-even: falta ticket"
      : `Break-even: ${pnl.breakEvenTenants} tiendas que pagan (hoy ${input.payingTenants})`;
  doc.text(`${marginTxt}  ·  ${annualTxt}  ·  ${beTxt}`, M, y);
  y += 8;

  // Tabla: gasto por categoría
  const byCat = input.summary?.byCategory ?? [];
  const catTotal = byCat.reduce((s, c) => s + c.amountPen, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...TEAL);
  doc.text("GASTO POR CATEGORÍA", M, y);
  y += 2;
  autoTable(doc, {
    startY: y,
    head: [["Categoría", "Monto / mes", "%"]],
    body:
      byCat.length > 0
        ? byCat.map((c) => [
            CAT_META[c.category]?.label ?? c.category,
            fmtPen(c.amountPen),
            catTotal > 0 ? `${Math.round((c.amountPen / catTotal) * 100)}%` : "—",
          ])
        : [["Sin gastos registrados", "—", "—"]],
    headStyles: { fillColor: TEAL, textColor: 255, fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    alternateRowStyles: { fillColor: [240, 249, 249] },
    margin: { left: M, right: M },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // Tabla: tendencia 6 meses
  const trend = input.summary?.trend ?? [];
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...TEAL);
  doc.text("TENDENCIA (6 MESES)", M, y);
  y += 2;
  autoTable(doc, {
    startY: y,
    head: [["Mes", "Total", "Tipo"]],
    body: trend.map((t) => [t.label, fmtPen(t.totalPen), t.real ? "cierre real" : "estimado"]),
    headStyles: { fillColor: TEAL, textColor: 255, fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "center" } },
    alternateRowStyles: { fillColor: [240, 249, 249] },
    margin: { left: M, right: M },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // Pie
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GREY);
  doc.text(
    `Montos en USD normalizados a PEN al cambio S/ ${input.fxRate.toFixed(2)}. Documento interno — generado el ${input.dateStr}.`,
    M,
    y,
  );

  doc.save(`pnl-plataforma-${input.dateStr.replace(/[^0-9a-z]+/gi, "-").toLowerCase()}.pdf`);
}
