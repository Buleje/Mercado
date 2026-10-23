/**
 * cacao-asesor-pdf.ts — descarga un PDF profesional del análisis del asesor con
 * jsPDF (import dinámico → fuera del bundle inicial). Client-only. A diferencia
 * del informe imprimible, esto DESCARGA un archivo .pdf directamente.
 */
import type { AdvisorResult } from "./cacao-advisor";
import { mesNombre } from "./cacao-advisor";
import { membreteDelDocumento } from "@/lib/documentos/membrete-cargar";
import { altoDelPie, datosDelMembrete, dibujarMembrete, dibujarPies, fechaDelDocumento, margenDelMembrete } from "@/lib/documentos/membrete-pdf";
import type { AsesorLocal } from "./cacao-asesor-informe";

const SIGNAL_LABEL: Record<AdvisorResult["signal"], string> = {
  vender: "VENDER",
  aguantar: "AGUANTAR",
  neutral: "NEUTRAL",
};
const fmtPct = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v}%`);
const num = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("es-PE"));

export async function downloadCacaoAsesorPDF(
  a: AdvisorResult,
  local: AsesorLocal | null,
  narrative: string | null,
) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const PT = 0.3528; // mm por punto
  const mbr = datosDelMembrete(await membreteDelDocumento(), { tipo: "Asesor de cacao", fecha: fechaDelDocumento(new Date().toISOString()) });
  const GREEN: [number, number, number] = [...mbr.acento];
  const M = margenDelMembrete();
  const W = doc.internal.pageSize.getWidth() - M * 2;
  let y = dibujarMembrete(doc, mbr);
  const limite = doc.internal.pageSize.getHeight() - altoDelPie() - 4;
  const hay = (alto: number) => { if (y + alto > limite) { doc.addPage(); y = M; } };
  const finalY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const wrap = (text: string, size: number, color: [number, number, number] = [40, 40, 40]) => {
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, W) as string[];
    hay(lines.length * (size + 3) * PT);
    y += size * PT;
    doc.text(lines, M, y);
    y += (lines.length * (size + 3) - size) * PT;
  };
  const t = a.tecnico;
  const m = a.metrics;
  const d = a.direccion;

  wrap("Señal y estadística calculadas; narrativa por IA", 9, [107, 114, 128]);
  y += 2;

  doc.setFontSize(13);
  doc.setTextColor(...GREEN);
  doc.text(
    `${SIGNAL_LABEL[a.signal]} · ${a.fuerza}   |   Confianza ${a.confianza}%   |   Suba ${d.probabilidadSuba}% / Baja ${100 - d.probabilidadSuba}%`,
    M,
    y,
  );
  y += 6;
  wrap(a.titulo, 12, [20, 20, 20]);
  wrap(a.resumen, 10);
  if (narrative) wrap(`IA: ${narrative}`, 10, GREEN);
  y += 3;

  const tbl = (head: string[], body: (string | number)[][]) => {
    autoTable(doc, {
      startY: y,
      head: [head],
      body,
      theme: "grid",
      headStyles: { fillColor: GREEN, fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 3 },
      margin: { left: M, right: M, bottom: altoDelPie() + 2 },
    });
    y = finalY() + 5;
  };

  tbl(
    ["Métrica de mercado", "Valor"],
    [
      ["Posición rango 52 sem", m.pos52 != null ? `${m.pos52}%` : "—"],
      ["Tendencia semana / mes / 3m", `${fmtPct(m.trend7)} / ${fmtPct(m.trend30)} / ${fmtPct(m.trend90)}`],
      ["Velocidad", m.velocidadDia != null ? `${fmtPct(m.velocidadDia)}/día` : "—"],
      ["Volatilidad", m.volatilidad != null ? `${m.volatilidad}%/día` : "—"],
    ],
  );

  tbl(
    ["Indicador técnico", "Valor"],
    [
      ["RSI (14)", t.rsi != null ? `${t.rsi}${t.rsiZona && t.rsiZona !== "neutral" ? ` (${t.rsiZona})` : ""}` : "—"],
      ["MACD", t.macdHist != null ? `${t.macdHist} (${t.macdHist > 0 ? "alcista" : "bajista"})${t.macdCruce ? `, cruce ${t.macdCruce}` : ""}` : "—"],
      ["Cruce de medias (EMA)", t.emaCruce ? (t.emaCruce === "golden" ? "golden (alcista)" : "death (bajista)") : "—"],
      ["Divergencia RSI/precio", t.divergencia ?? "no"],
      ["Bollinger %B", t.bollingerPctB != null ? `${t.bollingerPctB}%` : "—"],
      ["Soporte / Resistencia", t.soporte != null && t.resistencia != null ? `${num(t.soporte)} / ${num(t.resistencia)}` : "—"],
      ["Drawdown 52 sem", t.drawdownPct != null ? `${t.drawdownPct}%` : "—"],
      ["Calidad tendencia (R²)", t.trendR2 != null ? `${t.trendR2}` : "—"],
    ],
  );

  tbl(
    [`Dirección probable — suba ${d.probabilidadSuba}%`, "Voto", "Detalle"],
    d.factores.map((f) => [f.nombre, f.voto, f.detalle]),
  );

  if (a.forecast.length)
    tbl(
      ["Proyección", "Valor"],
      a.forecast.map((f) => [`En ${f.dias} días`, `USD ${num(f.mid)} (${fmtPct(f.pct)}) · ${num(f.low)}–${num(f.high)}`]),
    );

  if (a.estacionalidad?.desviacionPct != null)
    wrap(
      `Estacionalidad: en ${mesNombre(a.estacionalidad.mesActual)} el cacao suele estar ${fmtPct(a.estacionalidad.desviacionPct)} vs. el promedio del año (más caro: ${mesNombre(a.estacionalidad.mejorMes)}, más barato: ${mesNombre(a.estacionalidad.peorMes)}).`,
      9,
    );

  y += 2;
  hay(14);
  doc.setFontSize(11);
  doc.setTextColor(...GREEN);
  doc.text("Por qué", M, y);
  y += 5;
  a.motivos.forEach((mv) => wrap(`• ${mv}`, 9));
  y += 2;
  hay(14);
  doc.setFontSize(11);
  doc.setTextColor(...GREEN);
  doc.text("Riesgos", M, y);
  y += 5;
  a.riesgos.forEach((r) => wrap(`• ${r}`, 9));

  if (local && local.stockKg > 0) {
    y += 2;
    wrap(`Tu stock: ${local.stockKg} kg${local.miPrecioKg != null ? ` · costo S/ ${local.miPrecioKg}/kg` : ""}.`, 9, [20, 20, 20]);
  }

  y += 3;
  wrap(
    "Orientativo — no es asesoría financiera. Fuente de precio: ICE (Yahoo Finance). Decide según tu caja, la calidad de tu lote y tus compromisos de venta.",
    8,
    [150, 150, 150],
  );

  dibujarPies(doc, mbr);
  doc.save(`asesor-cacao-${new Date().toISOString().slice(0, 10)}.pdf`);
}
