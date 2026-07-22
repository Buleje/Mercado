"use client";

/**
 * loth-poa-print — ANEXO DEL PLAN OPERATIVO imprimible: el cuadro que acompaña
 * al POA cuando se presenta a la ARFFS y el que revisa OSINFOR en campo.
 *
 * Tres cuadros, en el orden en que se leen:
 *   1. resumen del aprovechamiento (árboles, volumen, intensidad por hectárea),
 *   2. cuadro por especie: DMC aplicado, censados, ≥DMC, semilleros,
 *      aprovechables, volumen y lo autorizado en el plan,
 *   3. padrón de árboles semilleros — los que quedan en pie, con su código y DAP,
 *      que es lo que se verifica en el monte.
 *
 * Documento de referencia interno: no reemplaza el plan aprobado ni sus anexos
 * oficiales.
 */

import type { PoaAnalisis } from "./loth-poa";

export interface PoaPrintMeta {
  titular: string | null;
  tituloHabilitante: string | null;
  planNumber: string | null;
  planType: string | null;
  resolucion: string | null;
  arffs: string | null;
  parcelaCorta: string | null;
  vigencia: string | null;
}

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const dash = (v: unknown): string => {
  const s = String(v ?? "").trim();
  return s ? esc(s) : "—";
};

export function printLothPoa(analisis: PoaAnalisis, meta: PoaPrintMeta): void {
  const { especies, totales, intensidad, config } = analisis;
  const fecha = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });

  const filas = especies
    .map(
      (e) => `<tr${e.fueraDelPlan ? ' class="alerta"' : e.autorizadoSinRespaldo ? ' class="aviso"' : ""}>
      <td><b>${esc(e.especie)}</b>${e.fueraDelPlan ? ' <span class="tag">NO EN PLAN</span>' : ""}</td>
      <td class="num">${e.dmcCm} <span class="fuente">${e.dmcFuente === "plan" ? "plan" : e.dmcFuente === "oficial" ? "norma" : "gral."}</span></td>
      <td class="num">${e.censados}</td>
      <td class="num">${e.sobreDmc}</td>
      <td class="num">${e.bajoDmc || "—"}</td>
      <td class="num">${e.semilleros || "—"}</td>
      <td class="num"><b>${e.aprovechables}</b></td>
      <td class="num"><b>${e.volumenAprovechableM3.toFixed(4)}</b></td>
      <td class="num">${e.volumenAutorizadoM3 != null ? e.volumenAutorizadoM3.toFixed(2) : "—"}</td>
    </tr>`,
    )
    .join("");

  const semilleros = analisis.arboles
    .filter((a) => a.categoria === "semillero")
    .sort((a, b) => a.speciesCommon.localeCompare(b.speciesCommon) || a.treeCode.localeCompare(b.treeCode))
    .map(
      (a) =>
        `<tr><td><b>${esc(a.treeCode)}</b></td><td>${esc(a.speciesCommon)}</td><td class="num">${a.dapCm != null ? a.dapCm.toFixed(1) : "—"}</td><td class="num">${
          a.volumenEstimadoM3 != null ? a.volumenEstimadoM3.toFixed(4) : "—"
        }</td></tr>`,
    )
    .join("");

  const alertas = analisis.alertas
    .filter((a) => a.nivel !== "info")
    .map((a) => `<li class="${a.nivel}"><b>${esc(a.titulo)}.</b> ${esc(a.detalle)}</li>`)
    .join("");

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Anexo del Plan Operativo — ${esc(meta.planNumber ?? "POA")}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, Arial, sans-serif; color: #111827; margin: 0; padding: 16px; font-size: 12px; }
  h1 { font-size: 17px; margin: 0 0 2px; text-transform: uppercase; letter-spacing: .3px; }
  .sub { color: #4b5563; font-size: 11px; margin: 0 0 14px; }
  h2 { font-size: 12px; margin: 18px 0 6px; text-transform: uppercase; letter-spacing: .6px; border-bottom: 2px solid #111827; padding-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: .5px solid #cbd5e1; padding: 4px 6px; text-align: left; }
  thead th { background: #f1f5f9; font-size: 9.5px; text-transform: uppercase; letter-spacing: .3px; color: #334155; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  tfoot td { background: #f8fafc; font-weight: 700; }
  tr.alerta { background: #fee2e2; } tr.aviso { background: #fef3c7; }
  .tag { background: #dc2626; color: #fff; font-size: 8px; padding: 1px 4px; border-radius: 3px; }
  .fuente { color: #64748b; font-size: 8.5px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 6px; }
  .kpi { border: 1.5px solid #111827; padding: 6px 8px; }
  .kpi span { display: block; font-size: 8.5px; text-transform: uppercase; letter-spacing: .4px; color: #475569; }
  .kpi b { font-size: 17px; font-variant-numeric: tabular-nums; }
  .kpi i { font-style: normal; font-size: 9px; color: #64748b; }
  ul.alertas { margin: 6px 0 0; padding-left: 16px; font-size: 10.5px; }
  ul.alertas li.error { color: #b91c1c; } ul.alertas li.warning { color: #b45309; }
  .firma { display: flex; gap: 20px; margin-top: 36px; font-size: 11px; }
  .firma div { flex: 1; border-top: 1px solid #94a3b8; padding-top: 5px; text-align: center; color: #475569; }
  .nota { margin-top: 14px; font-size: 9px; color: #64748b; line-height: 1.5; border-top: .5px solid #e2e8f0; padding-top: 8px; }
  @media print { body { padding: 0; } }
</style></head><body>
  <h1>Anexo del Plan Operativo — aprovechamiento por especie</h1>
  <p class="sub">
    ${dash(meta.titular)}${meta.tituloHabilitante ? ` · Título habilitante ${esc(meta.tituloHabilitante)}` : ""}
    ${meta.planNumber ? ` · ${esc(meta.planType ?? "Plan")} ${esc(meta.planNumber)}` : ""}
    ${meta.parcelaCorta ? ` · Parcela de corta ${esc(meta.parcelaCorta)}` : ""} · Generado ${esc(fecha)}
  </p>

  <h2>1. Resumen del aprovechamiento</h2>
  <div class="kpis">
    <div class="kpi"><span>Árboles aprovechables</span><b>${totales.aprovechables}</b><i>de ${totales.censados} censados</i></div>
    <div class="kpi"><span>Volumen aprovechable</span><b>${totales.volumenAprovechableM3.toFixed(3)}</b><i>m³ · autorizado ${totales.volumenAutorizadoM3.toFixed(2)} m³</i></div>
    <div class="kpi"><span>Semilleros en pie</span><b>${totales.semilleros}</b><i>${config.semillerosPct}% de los ≥ DMC</i></div>
    <div class="kpi"><span>Intensidad</span><b>${intensidad.m3PorHa != null ? intensidad.m3PorHa.toFixed(2) : "—"}</b><i>${
      intensidad.m3PorHa != null
        ? `m³/ha · ${intensidad.arbolesPorHa?.toFixed((intensidad.arbolesPorHa ?? 0) < 0.01 ? 4 : 2)} árb/ha sobre ${intensidad.areaHa} ha`
        : "sin área declarada"
    }</i></div>
  </div>

  <h2>2. Cuadro por especie</h2>
  <table>
    <thead><tr>
      <th>Especie</th><th class="num">DMC (cm)</th><th class="num">Censados</th><th class="num">≥ DMC</th>
      <th class="num">Bajo DMC</th><th class="num">Semilleros</th><th class="num">Aprovech.</th>
      <th class="num">Vol. aprovechable (m³)</th><th class="num">Autorizado (m³)</th>
    </tr></thead>
    <tbody>${filas || '<tr><td colspan="9" style="text-align:center;color:#94a3b8">Sin censo cargado.</td></tr>'}</tbody>
    ${
      especies.length
        ? `<tfoot><tr><td>Total</td><td class="num">—</td><td class="num">${totales.censados}</td><td class="num">${
            totales.aprovechables + totales.semilleros
          }</td><td class="num">${totales.bajoDmc}</td><td class="num">${totales.semilleros}</td><td class="num">${
            totales.aprovechables
          }</td><td class="num">${totales.volumenAprovechableM3.toFixed(4)}</td><td class="num">${totales.volumenAutorizadoM3.toFixed(2)}</td></tr></tfoot>`
        : ""
    }
  </table>
  ${alertas ? `<ul class="alertas">${alertas}</ul>` : ""}

  <h2>3. Padrón de árboles semilleros (quedan en pie)</h2>
  <table>
    <thead><tr><th>Código</th><th>Especie</th><th class="num">DAP (cm)</th><th class="num">Vol. est. (m³)</th></tr></thead>
    <tbody>${semilleros || '<tr><td colspan="4" style="text-align:center;color:#94a3b8">Sin semilleros asignados (configurá el % en el panel del POA).</td></tr>'}</tbody>
  </table>

  <div class="firma">
    <div>Titular del título habilitante</div>
    <div>Regente forestal (firma y sello)</div>
    <div>Recepción ARFFS / OSINFOR</div>
  </div>

  <p class="nota">
    El diámetro mínimo de corta (DMC) aplicado sale de la RJ N° 458-2002-INRENA — vigente vía SERFOR — salvo donde el plan
    declare otro valor aprobado por la ${dash(meta.arffs)}${meta.resolucion ? ` (${esc(meta.resolucion)})` : ""}. Los árboles por
    debajo del DMC de su especie NO son aprovechables. Los semilleros se reservan entre los árboles de mayor DAP que superan el
    DMC, criterio estándar de porta-semillas. El volumen sale del censo (Smalian con factor de forma) y es una estimación previa
    a la tala. Documento de referencia interno generado desde el Libro de Operaciones del Titular: no reemplaza el plan de manejo
    aprobado ni sus anexos oficiales.
  </p>
  <script>setTimeout(function(){ window.print(); }, 300);</script>
</body></html>`;

  const w = window.open("", "_blank", "width=1000,height=900");
  if (!w) throw new Error("El navegador bloqueó la ventana. Permití pop-ups para imprimir el anexo del POA.");
  w.document.write(html);
  w.document.close();
  w.focus();
}
