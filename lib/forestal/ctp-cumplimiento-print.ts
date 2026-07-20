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
 * Se abre en una ventana imprimible (guardar como PDF) siguiendo el mismo patrón
 * que `planta-plano-print.ts`: los tokens `--data-*` del DS no resuelven en la
 * ventana de print, así que acá los colores van en hex.
 */

import { GEO_PLACENAME } from "@/lib/geo";

export type ReportReadiness = "ready" | "warning" | "error";

export interface CumplimientoCheckLine {
  severity: "error" | "warning";
  title: string;
  description: string;
  action: string;
}

export interface CumplimientoReportFicha {
  razonSocial?: string;
  ruc?: string;
  nombreCtp?: string;
  codigoCtp?: string;
  registroArffs?: string;
  direccion?: string;
  region?: string;
  provincia?: string;
  distrito?: string;
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
  ficha?: CumplimientoReportFicha | null;
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

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/** Fila "etiqueta: valor" del bloque de identidad; se omite si el valor está vacío. */
function idRow(label: string, value?: string): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  return `<div><span class="k">${esc(label)}</span> ${esc(v)}</div>`;
}

export function printCumplimiento(d: CumplimientoReportData): void {
  const r = READINESS[d.readiness];
  const f = d.ficha ?? {};
  const fecha = new Date().toLocaleString("es-PE", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const ubic = [f.distrito, f.provincia, f.region].map((x) => (x ?? "").trim()).filter(Boolean).join(", ");
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
      <td style="text-align:right">${b.puntos > 0 ? `<b style="color:#b91c1c">−${b.puntos} pts</b>` : '<span style="color:#16a34a">sin restar</span>'}</td>
      <td style="text-align:right;color:#666">${b.puntos > 0 ? `${b.casos}${b.topeAlcanzado ? "+" : ""} ${b.casos === 1 ? "caso" : "casos"}` : "—"}</td>
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

  const enOrdenItems = d.enOrden.map((t) => `<li>${esc(t)}</li>`).join("");

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte de cumplimiento CTP</title>
<style>
  *{box-sizing:border-box} body{font-family:'Segoe UI',system-ui,Arial,sans-serif;color:#1a1a1a;max-width:900px;margin:0 auto;padding:32px;font-size:13px;line-height:1.5}
  h1{font-size:20px;margin:0 0 2px;color:#0f5132} h2{font-size:13px;text-transform:uppercase;letter-spacing:.4px;color:#555;margin:22px 0 8px;border-bottom:1px solid #eee;padding-bottom:4px}
  .sub{color:#666;font-size:12px;margin:0 0 14px}
  .id{display:grid;grid-template-columns:1fr 1fr;gap:2px 20px;background:#f6f8f7;border:1px solid #e4e8e6;border-radius:8px;padding:12px 14px;font-size:12px}
  .id .k{color:#888;display:inline-block;min-width:118px}
  .verdict{display:flex;align-items:center;justify-content:space-between;gap:16px;border:2px solid ${r.border};background:${r.bg};border-radius:10px;padding:14px 16px;margin:16px 0}
  .verdict .t{font-size:15px;font-weight:700;color:${r.fg}} .verdict .d{font-size:12px;color:#444;margin-top:2px}
  .score{font-size:34px;font-weight:800;color:${r.fg};line-height:1;text-align:center} .score small{display:block;font-size:10px;letter-spacing:1px;color:#999;font-weight:600;margin-top:2px}
  .chips{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 2px}
  .chip{font-size:12px;font-weight:700;border-radius:999px;padding:5px 12px}
  table{width:100%;border-collapse:collapse;margin-top:6px} th,td{padding:7px 9px;border:1px solid #e0e0e0;text-align:left;vertical-align:top}
  th{background:#f6f8f7;font-size:11px;text-transform:uppercase;letter-spacing:.3px;color:#444}
  .badge{display:inline-block;font-size:11px;font-weight:700;border-radius:6px;padding:2px 8px;white-space:nowrap}
  .muted{color:#666;font-size:11.5px;margin-top:3px}
  ul.ok{columns:2;column-gap:28px;margin:6px 0 0;padding-left:18px} ul.ok li{margin-bottom:4px;break-inside:avoid}
  .firma{display:flex;justify-content:space-between;margin-top:44px;font-size:12px} .firma div{border-top:1px solid #999;padding-top:6px;width:44%;text-align:center;color:#555}
  .foot{margin-top:22px;color:#999;font-size:10.5px;border-top:1px solid #eee;padding-top:10px}
  @media print{body{padding:12px} h2{page-break-after:avoid} tr{page-break-inside:avoid}}
</style></head><body>
  <h1>Reporte de Cumplimiento — Libro de Operaciones CTP</h1>
  <p class="sub">${esc(f.nombreCtp || "Centro de Transformación Primaria")} · Período: ${esc(d.periodLabel)} · Generado: ${esc(fecha)}</p>

  <div class="id">
    ${idRow("Razón social:", f.razonSocial) || idRow("Establecimiento:", GEO_PLACENAME)}
    ${idRow("RUC:", f.ruc)}
    ${idRow("Nombre del CTP:", f.nombreCtp)}
    ${idRow("Código de CTP:", f.codigoCtp)}
    ${idRow("Registro ARFFS:", f.registroArffs)}
    ${idRow("Ubicación:", ubic)}
    ${idRow("Dirección:", f.direccion)}
    ${idRow("Ingresos evaluados:", `${d.totalIngresos.toLocaleString("es-PE")} en el período`)}
  </div>

  <div class="verdict">
    <div>
      <div class="t">${esc(READINESS[d.readiness].title)}</div>
      <div class="d">${esc(detalleVeredicto)}</div>
    </div>
    <div class="score">${d.score}<small>DE 100 · ${esc(d.toneLabel).toUpperCase()}</small></div>
  </div>

  <div class="chips">
    <span class="chip" style="color:${SEV.error.fg};background:${d.bloqueos > 0 ? SEV.error.bg : "#f1f1f1"}">${d.bloqueos} ${d.bloqueos === 1 ? "bloqueo" : "bloqueos"}</span>
    <span class="chip" style="color:${SEV.warning.fg};background:${d.advertencias > 0 ? SEV.warning.bg : "#f1f1f1"}">${d.advertencias} ${d.advertencias === 1 ? "advertencia" : "advertencias"}</span>
    <span class="chip" style="color:#0f5132;background:#d1e7dd">${d.enOrdenCount} en orden</span>
  </div>

  <h2>Índice de cumplimiento — cómo se compone</h2>
  <table>
    <thead><tr><th>Concepto</th><th style="text-align:right">Puntos</th><th style="text-align:right">Casos</th></tr></thead>
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
      ? `<h2>Verificaciones en orden (${d.enOrden.length})</h2><ul class="ok">${enOrdenItems}</ul>`
      : ""
  }

  <div class="firma"><div>Responsable del CTP</div><div>Sello y recepción ARFFS</div></div>
  <p class="foot">Reporte generado desde el panel Cumplimiento del Libro de Operaciones del CTP. Los números coinciden con el libro y con su exportación a Excel (misma fuente de datos). Documento de referencia para inspección — no reemplaza el registro oficial en el MC-SNIFFS de SERFOR.</p>
  <script>setTimeout(function(){ window.print(); }, 300);</script>
</body></html>`;

  const w = window.open("", "_blank", "width=980,height=760");
  if (!w) throw new Error("El navegador bloqueó la ventana. Permití pop-ups para descargar el reporte.");
  w.document.write(html);
  w.document.close();
  w.focus();
}
