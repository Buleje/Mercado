/**
 * cacao-asesor-informe.ts — informe profesional del Asesor de cacao: imprimible
 * (PDF vía diálogo de impresión) y texto para compartir por WhatsApp. Client-safe:
 * usa openPrintable (iframe) — NO importa prisma/llm.
 */
import type { AdvisorResult } from "./cacao-advisor";
import { mesNombre } from "./cacao-advisor";
import { openPrintable } from "./cacao-print";

export interface AsesorLocal {
  miPrecioKg: number | null;
  refKg: number | null;
  spreadPct: number | null;
  stockKg: number;
}

const SIGNAL_LABEL: Record<AdvisorResult["signal"], string> = {
  vender: "VENDER",
  aguantar: "AGUANTAR",
  neutral: "NEUTRAL",
};
const fmtPct = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v}%`);
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

/** Texto compacto del asesor para compartir por WhatsApp / copiar. */
export function asesorTexto(a: AdvisorResult, local: AsesorLocal | null): string {
  const L: string[] = [];
  L.push(`*Asesor de cacao — ${SIGNAL_LABEL[a.signal]} (${a.fuerza}, confianza ${a.confianza}%)*`);
  L.push(a.resumen);
  if (a.metrics.pos52 != null)
    L.push(`Rango 52s: ${a.metrics.pos52}% · semana ${fmtPct(a.metrics.trend7)} · mes ${fmtPct(a.metrics.trend30)} · 3m ${fmtPct(a.metrics.trend90)}`);
  if (a.tecnico.rsi != null)
    L.push(`RSI ${a.tecnico.rsi}${a.tecnico.rsiZona && a.tecnico.rsiZona !== "neutral" ? ` (${a.tecnico.rsiZona})` : ""} · soporte ${a.tecnico.soporte ?? "—"} / resistencia ${a.tecnico.resistencia ?? "—"} · R² ${a.tecnico.trendR2 ?? "—"}`);
  if (a.forecast[1]) L.push(`Proyección 30d: USD ${a.forecast[1].mid}/t (${fmtPct(a.forecast[1].pct)})`);
  if (a.estacionalidad?.desviacionPct != null)
    L.push(`Estacionalidad: ${mesNombre(a.estacionalidad.mesActual)} suele estar ${fmtPct(a.estacionalidad.desviacionPct)} vs. el año`);
  if (local && local.stockKg > 0) L.push(`Tu stock: ${local.stockKg} kg`);
  L.push(`Cuándo: ${a.cuando}`);
  return L.join("\n");
}

/** Informe de 1 página imprimible (PDF) del análisis del asesor. */
export function printCacaoAsesor(a: AdvisorResult, local: AsesorLocal | null, narrative: string | null) {
  const m = a.metrics;
  const t = a.tecnico;
  const li = (arr: string[]) => arr.map((x) => `<li>${esc(x)}</li>`).join("");
  const row = (k: string, v: string) => `<tr><td class="k">${k}</td><td class="v">${v}</td></tr>`;
  const fecha = new Date().toLocaleString("es-PE", { dateStyle: "long", timeStyle: "short" });

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Asesor de cacao</title>
<style>
  *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a1a1a;margin:0;padding:28px 34px;font-size:12px;line-height:1.45}
  h1{font-size:20px;margin:0 0 2px} .sub{color:#666;font-size:11px;margin:0 0 16px}
  .signal{display:inline-block;padding:6px 14px;border-radius:10px;font-weight:800;font-size:15px;letter-spacing:.5px;border:2px solid #166534;color:#166534}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:16px}
  h2{font-size:12px;text-transform:uppercase;letter-spacing:.6px;color:#166534;border-bottom:1px solid #ddd;padding-bottom:4px;margin:0 0 8px}
  table{width:100%;border-collapse:collapse} td{padding:3px 0;vertical-align:top} td.k{color:#666} td.v{text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
  ul{margin:0;padding-left:16px} li{margin:2px 0}
  .box{border:1px solid #e5e5e5;border-radius:10px;padding:12px 14px}
  .foot{margin-top:22px;font-size:10px;color:#999;text-align:center;border-top:1px solid #eee;padding-top:8px}
  @media print{body{padding:0}@page{margin:14mm}}
</style></head><body>
  <h1>Asesor de cacao — informe</h1>
  <p class="sub">Generado el ${esc(fecha)} · señal y estadística calculadas; narrativa por IA</p>

  <div class="box">
    <span class="signal">${SIGNAL_LABEL[a.signal]} · ${esc(a.fuerza)}</span>
    <span style="margin-left:12px;color:#666">Confianza ${a.confianza}%</span>
    <p style="margin:8px 0 0;font-weight:700">${esc(a.titulo)}</p>
    <p style="margin:4px 0 0;color:#333">${esc(a.resumen)}</p>
    ${narrative ? `<p style="margin:8px 0 0;color:#166534"><b>IA:</b> ${esc(narrative)}</p>` : ""}
  </div>

  <div class="grid">
    <div>
      <h2>Métricas de mercado</h2>
      <table>
        ${row("Posición en rango 52 sem", m.pos52 != null ? `${m.pos52}%` : "—")}
        ${row("Tendencia semana", fmtPct(m.trend7))}
        ${row("Tendencia mes", fmtPct(m.trend30))}
        ${row("Tendencia 3 meses", fmtPct(m.trend90))}
        ${row("Velocidad", m.velocidadDia != null ? `${fmtPct(m.velocidadDia)}/día` : "—")}
        ${row("Volatilidad", m.volatilidad != null ? `${m.volatilidad}%/día` : "—")}
      </table>
    </div>
    <div>
      <h2>Indicadores técnicos</h2>
      <table>
        ${row("RSI (14)", t.rsi != null ? `${t.rsi}${t.rsiZona && t.rsiZona !== "neutral" ? ` (${t.rsiZona})` : ""}` : "—")}
        ${row("Bollinger %B", t.bollingerPctB != null ? `${t.bollingerPctB}%` : "—")}
        ${row("Soporte / Resistencia", t.soporte != null && t.resistencia != null ? `USD ${t.soporte.toLocaleString("es-PE")} / ${t.resistencia.toLocaleString("es-PE")}` : "—")}
        ${row("Drawdown 52 sem", t.drawdownPct != null ? `${t.drawdownPct}%` : "—")}
        ${row("Calidad tendencia (R²)", t.trendR2 != null ? `${t.trendR2}` : "—")}
      </table>
    </div>
  </div>

  <div class="grid">
    <div>
      <h2>Proyección</h2>
      <table>${a.forecast.map((f) => row(`En ${f.dias} días`, `USD ${f.mid.toLocaleString("es-PE")} (${fmtPct(f.pct)}) · ${f.low.toLocaleString("es-PE")}–${f.high.toLocaleString("es-PE")}`)).join("")}</table>
      ${a.estacionalidad?.desviacionPct != null ? `<h2 style="margin-top:12px">Estacionalidad</h2><p style="margin:0">En ${esc(mesNombre(a.estacionalidad.mesActual))} el cacao suele estar ${fmtPct(a.estacionalidad.desviacionPct)} vs. el promedio del año. Más caro: ${esc(mesNombre(a.estacionalidad.mejorMes))} · más barato: ${esc(mesNombre(a.estacionalidad.peorMes))}.</p>` : ""}
    </div>
    <div>
      <h2>Por qué</h2>
      <ul>${li(a.motivos)}</ul>
    </div>
  </div>

  <div class="grid">
    <div><h2>Riesgos</h2><ul>${li(a.riesgos)}</ul></div>
    <div>
      <h2>Acción</h2>
      <p style="margin:0 0 6px"><b>¿Cuándo?</b> ${esc(a.cuando)}</p>
      <p style="margin:0 0 6px"><b>Acopiar:</b> ${esc(a.compra)}</p>
      ${local && local.stockKg > 0 ? `<p style="margin:0"><b>Tu stock:</b> ${local.stockKg} kg${local.miPrecioKg != null ? ` · costo S/ ${local.miPrecioKg}/kg` : ""}</p>` : ""}
    </div>
  </div>

  <div class="foot">Orientativo — no es asesoría financiera. Fuente de precio: ICE (Yahoo Finance). Decidí según tu caja, la calidad de tu lote y tus compromisos de venta.</div>
  <script>window.onload=function(){window.print()}</script>
</body></html>`;
  openPrintable(html);
}
