/**
 * Reporte de campaña de cacao imprimible (ADR-128). Client-safe (window.print).
 * Resume acopio + calidad + productores para imprimir/compartir/archivar.
 */
export interface ReporteStats {
  lotes: number; productoresActivos: number; kgAcopiados: number; valorPagado: number;
  indiceFermentacionProm: number; pctHumedadEnNorma: number;
  porVariedad: { variedad: string; kg: number }[]; porGrado: { grado: string; count: number }[];
}
export interface ReporteTrends {
  topProductores: { nombre: string; kg: number; pagado: number; lotes: number }[];
  calidad: { bien: number; violeta: number; pizarroso: number; mohoso: number; muestras: number } | null;
  humedadFueraCount: number;
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const n2 = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const GRADO: Record<string, string> = { I: "Grado I", II: "Grado II", fuera_norma: "Fuera de norma", sin_clasificar: "Sin clasificar" };

export function printCacaoReporte(stats: ReporteStats, trends: ReporteTrends | null, acopiador = "Acopio de Cacao") {
  if (typeof window === "undefined") return;
  const fecha = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
  const row = (k: string, v: string) => `<tr><td>${esc(k)}</td><td class="r">${esc(v)}</td></tr>`;
  const variedad = stats.porVariedad.map((x) => row(x.variedad || "—", `${n2(x.kg)} kg`)).join("");
  const grado = stats.porGrado.map((x) => row(GRADO[x.grado] ?? x.grado, String(x.count))).join("");
  const top = (trends?.topProductores ?? []).map((p, i) => `<tr><td>${i + 1}. ${esc(p.nombre)}</td><td class="r">${n2(p.kg)} kg</td><td class="r">S/ ${n2(p.pagado)}</td></tr>`).join("");
  const cal = trends?.calidad;

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"/>
<title>Reporte de campaña — Cacao</title>
<style>
  *{box-sizing:border-box} body{font-family:-apple-system,system-ui,"Segoe UI",Roboto,Arial,sans-serif;color:#1a1a1a;margin:0;padding:32px}
  .doc{max-width:760px;margin:0 auto}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #166534;padding-bottom:14px;margin-bottom:18px}
  .brand{font-size:20px;font-weight:800;color:#166534}.brand small{display:block;font-size:11px;font-weight:500;color:#555;letter-spacing:.08em;text-transform:uppercase}
  .date{font-size:13px;color:#666}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}
  .kpi{border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px}
  .kpi .l{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#888}
  .kpi .v{font-size:18px;font-weight:800;font-variant-numeric:tabular-nums}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#166534;margin:18px 0 8px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  td{padding:6px 8px;border-bottom:1px solid #eee}.r{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:24px}
  .cal{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
  .cal div{border:1px solid #e5e7eb;border-radius:8px;padding:8px;text-align:center}
  .cal .l{font-size:10px;color:#888;text-transform:uppercase}.cal .v{font-size:16px;font-weight:800}
  .foot{margin-top:28px;font-size:11px;color:#999;text-align:center}
  @media print{body{padding:0}@page{margin:14mm}}
</style></head><body><div class="doc">
  <div class="head"><div class="brand">${esc(acopiador)}<small>Reporte de campaña · Cacao</small></div><div class="date">${fecha}</div></div>
  <div class="kpis">
    <div class="kpi"><div class="l">Kg acopiados</div><div class="v">${n2(stats.kgAcopiados)}</div></div>
    <div class="kpi"><div class="l">Pagado</div><div class="v">S/ ${n2(stats.valorPagado)}</div></div>
    <div class="kpi"><div class="l">Lotes / Productores</div><div class="v">${stats.lotes} / ${stats.productoresActivos}</div></div>
    <div class="kpi"><div class="l">Humedad en norma</div><div class="v">${stats.pctHumedadEnNorma}%</div></div>
  </div>
  <div class="two">
    <div><h2>Kg por variedad</h2><table>${variedad || '<tr><td>Sin datos</td></tr>'}</table></div>
    <div><h2>Lotes por grado</h2><table>${grado || '<tr><td>Sin datos</td></tr>'}</table></div>
  </div>
  ${top ? `<h2>Top productores</h2><table>${top}</table>` : ""}
  ${cal ? `<h2>Calidad promedio — prueba de corte (${cal.muestras} muestras)</h2><div class="cal">
    <div><div class="l">Bien ferm.</div><div class="v">${cal.bien}%</div></div>
    <div><div class="l">Violeta</div><div class="v">${cal.violeta}%</div></div>
    <div><div class="l">Pizarroso</div><div class="v">${cal.pizarroso}%</div></div>
    <div><div class="l">Mohoso</div><div class="v">${cal.mohoso}%</div></div></div>` : ""}
  ${trends && trends.humedadFueraCount > 0 ? `<p style="margin-top:14px;color:#b45309;font-size:13px">⚠ ${trends.humedadFueraCount} lote(s) con humedad fuera de norma (&gt;7%).</p>` : ""}
  <div class="foot">Índice de fermentación promedio: ${stats.indiceFermentacionProm}% · Reporte interno de acopio.</div>
</div><script>window.onload=function(){window.print()}</script></body></html>`;

  const w = window.open("", "_blank", "width=860,height=900");
  if (!w) return;
  w.document.write(html); w.document.close(); w.focus();
}
