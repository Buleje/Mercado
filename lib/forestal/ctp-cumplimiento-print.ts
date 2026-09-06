"use client";

/**
 * ctp-cumplimiento-print.ts — genera un REPORTE DE CUMPLIMIENTO imprimible del
 * Libro de Operaciones CTP para adjuntar a una fiscalización de la ARFFS/SERFOR.
 *
 * Mismos números que el panel Cumplimiento y que el Excel del libro (la fuente
 * es la misma: `useCtpCompliance` → `WoodEntriesDB.stats()` + `ForestCtpDB`).
 * El documento resume: identidad del CTP, veredicto de cierre, índice de
 * cumplimiento con su desglose, los puntos que requieren atención (bloqueos y
 * advertencias) y las verificaciones en orden. No reemplaza el registro oficial
 * en el MC-SNIFFS; es un documento de referencia para inspección.
 *
 * Primitivos comunes (esc, ventana, identidad, CSS base) en `ctp-print-shared`.
 */

import { esc, ctpIdentityBlock, ctpReportFooter, openCtpReport, type CtpReportFicha } from "./ctp-print-shared";

export type ReportReadiness = "ready" | "warning" | "error";

export interface CumplimientoCheckLine {
  severity: "error" | "warning";
  title: string;
  description: string;
  action: string;
}

export interface CumplimientoReportData {
  periodLabel: string;
  score: number;
  toneLabel: string;
  totalIngresos: number;
  readiness: ReportReadiness;
  bloqueos: number;
  advertencias: number;
  enOrdenCount: number;
  breakdown: { label: string; puntos: number; casos: number; topeAlcanzado: boolean }[];
  problemas: CumplimientoCheckLine[];
  enOrden: string[];
  ficha?: CtpReportFicha | null;
}

const READINESS: Record<ReportReadiness, { title: string; fg: string; bg: string; border: string }> = {
  ready: { title: "Listo para cerrar el período", fg: "#0f5132", bg: "#d1e7dd", border: "#a3cfbb" },
  warning: { title: "Podés cerrar el período", fg: "#664d03", bg: "#fff3cd", border: "#ffe69c" },
  error: { title: "Aún no conviene cerrar el período", fg: "#842029", bg: "#f8d7da", border: "#f1aeb5" },
};

const SEV = {
  error: { label: "Bloqueo", fg: "#842029", bg: "#f8d7da" },
  warning: { label: "Advertencia", fg: "#664d03", bg: "#fff3cd" },
} as const;

const CSS = `
  .verdict{display:flex;align-items:center;justify-content:space-between;gap:16px;border-radius:10px;padding:14px 16px;margin:16px 0}
  .verdict .t{font-size:15px;font-weight:700} .verdict .d{font-size:12px;color:#444;margin-top:2px}
  .score{font-size:34px;font-weight:800;line-height:1;text-align:center} .score small{display:block;font-size:10px;letter-spacing:1px;color:#999;font-weight:600;margin-top:2px}
  .chips{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 2px} .chip{font-size:12px;font-weight:700;border-radius:999px;padding:5px 12px}
  ul.ok{columns:2;column-gap:28px;margin:6px 0 0;padding-left:18px} ul.ok li{margin-bottom:4px;break-inside:avoid}
`;

export function printCumplimiento(d: CumplimientoReportData): void {
  const r = READINESS[d.readiness];
  const fecha = new Date().toLocaleString("es-PE", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const detalleVeredicto =
    d.readiness === "error"
      ? `${d.bloqueos} ${d.bloqueos === 1 ? "bloqueo debe resolverse" : "bloqueos deben resolverse"} antes de cerrar${d.advertencias > 0 ? ` · ${d.advertencias} ${d.advertencias === 1 ? "advertencia" : "advertencias"} por revisar` : ""}.`
      : d.readiness === "warning"
        ? `Sin bloqueos en ${d.periodLabel} · ${d.advertencias} ${d.advertencias === 1 ? "advertencia por revisar" : "advertencias por revisar"}.`
        : `${d.periodLabel} sin bloqueos ni advertencias — el libro está al día.`;

  const breakdownRows = d.breakdown
    .map(
      (b) => `<tr>
      <td><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${b.puntos > 0 ? "#dc2626" : "#16a34a"};margin-right:7px"></span>${esc(b.label)}</td>
      <td class="num">${b.puntos > 0 ? `<b style="color:#b91c1c">−${b.puntos} pts</b>` : '<span style="color:#16a34a">sin restar</span>'}</td>
      <td class="num" style="color:#666">${b.puntos > 0 ? `${b.casos}${b.topeAlcanzado ? "+" : ""} ${b.casos === 1 ? "caso" : "casos"}` : "—"}</td>
    </tr>`,
    )
    .join("");

  const problemaRows = d.problemas
    .map((p) => {
      const s = SEV[p.severity];
      return `<tr>
      <td><span class="badge" style="color:${s.fg};background:${s.bg}">${s.label}</span></td>
      <td><b>${esc(p.title)}</b><div class="muted">${esc(p.description)} <b>${esc(p.action)}</b></div></td>
    </tr>`;
    })
    .join("");

  const body = `
  <h1>Reporte de Cumplimiento — Libro de Operaciones CTP</h1>
  <p class="sub">${esc(d.ficha?.nombreCtp || "Centro de Transformación Primaria")} · Período: ${esc(d.periodLabel)} · Generado: ${esc(fecha)}</p>

  ${ctpIdentityBlock(d.ficha, [`<div><span class="k">Ingresos evaluados:</span> ${esc(`${d.totalIngresos.toLocaleString("es-PE")} en el período`)}</div>`])}

  <div class="verdict" style="border:2px solid ${r.border};background:${r.bg}">
    <div>
      <div class="t" style="color:${r.fg}">${esc(r.title)}</div>
      <div class="d">${esc(detalleVeredicto)}</div>
    </div>
    <div class="score" style="color:${r.fg}">${d.score}<small>DE 100 · ${esc(d.toneLabel).toUpperCase()}</small></div>
  </div>

  <div class="chips">
    <span class="chip" style="color:${SEV.error.fg};background:${d.bloqueos > 0 ? SEV.error.bg : "#f1f1f1"}">${d.bloqueos} ${d.bloqueos === 1 ? "bloqueo" : "bloqueos"}</span>
    <span class="chip" style="color:${SEV.warning.fg};background:${d.advertencias > 0 ? SEV.warning.bg : "#f1f1f1"}">${d.advertencias} ${d.advertencias === 1 ? "advertencia" : "advertencias"}</span>
    <span class="chip" style="color:#0f5132;background:#d1e7dd">${d.enOrdenCount} en orden</span>
  </div>

  <h2>Índice de cumplimiento — cómo se compone</h2>
  <table>
    <thead><tr><th>Concepto</th><th class="num">Puntos</th><th class="num">Casos</th></tr></thead>
    <tbody>${breakdownRows}</tbody>
  </table>

  ${
    d.problemas.length > 0
      ? `<h2>Requiere atención (${d.problemas.length})</h2>
  <table>
    <thead><tr><th style="width:110px">Severidad</th><th>Hallazgo y acción recomendada</th></tr></thead>
    <tbody>${problemaRows}</tbody>
  </table>`
      : `<h2>Requiere atención</h2><p style="color:#0f5132">Sin bloqueos ni advertencias en el período.</p>`
  }

  ${
    d.enOrden.length > 0
      ? `<h2>Verificaciones en orden (${d.enOrden.length})</h2><ul class="ok">${d.enOrden.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`
      : ""
  }

  ${ctpReportFooter(
    "Reporte generado desde el panel Cumplimiento del Libro de Operaciones del CTP. Los números coinciden con el libro y con su exportación a Excel (misma fuente de datos). Documento de referencia para inspección — no reemplaza el registro oficial en el MC-SNIFFS de SERFOR.",
  )}`;

  openCtpReport({ title: "Reporte de cumplimiento CTP", css: CSS, body });
}
