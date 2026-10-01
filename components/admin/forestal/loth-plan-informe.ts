/**
 * Informe de ejecución del POA — documento consolidado para ARFFS/SERFOR/OSINFOR
 * al cierre. Abre una ventana con el HTML y la manda a imprimir.
 */

import type { Balance, CensusStat, Plan, Species } from "./loth-plan-shared";

const SECTION_LABEL: Record<string, string> = {
  tala: "Tala", trozado: "Trozado", despacho_troza: "Despacho de trozas",
  consumo_troza: "Consumo de trozas", producto_terminado: "Producto terminado", despacho_producto: "Despacho de PT",
};
export async function printInforme(plan: Plan, species: Species[], censusStat: CensusStat[]) {
  // Datos frescos: balance + totales por sección del libro
  let balance: Balance | null = null;
  let lothStats: Array<{ section: string; count: number; totalVolumeM3: number; totalQuantity: number }> = [];
  try {
    const [bRes, sRes] = await Promise.all([
      fetch(`/api/admin/forestal/plan?balance=${plan.id}`, { credentials: "include" }),
      fetch(`/api/admin/forestal/loth?stats=1`, { credentials: "include" }),
    ]);
    if (bRes.ok) balance = (await bRes.json()).balance ?? null;
    if (sRes.ok) lothStats = (await sRes.json()).stats ?? [];
  } catch { /* el informe se imprime con lo disponible */ }

  const d = (x: string | null) => (x ? new Date(x).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }) : "—");
  const balRows = (balance?.rows ?? []).map((r) => `<tr><td>${r.species}${r.cites ? " <b>(CITES)</b>" : ""}</td><td style="text-align:right">${r.autorizado.toFixed(2)}</td><td style="text-align:right">${r.movilizado.toFixed(2)}</td><td style="text-align:right"><b>${r.saldo.toFixed(2)}</b></td><td style="text-align:right">${r.pctMovilizado.toFixed(0)}%</td></tr>`).join("");
  const censoRows = censusStat.map((c) => `<tr><td>${c.estado === "en_pie" ? "En pie" : c.estado === "talado" ? "Talado" : "Descartado"}</td><td style="text-align:right">${c.count}</td><td style="text-align:right">${c.volumenEstimadoM3.toFixed(2)}</td></tr>`).join("");
  const secRows = lothStats.map((s) => `<tr><td>${SECTION_LABEL[s.section] ?? s.section}</td><td style="text-align:right">${s.count}</td><td style="text-align:right">${s.totalVolumeM3.toFixed(2)}</td></tr>`).join("");
  const autorizadoTotal = species.reduce((a, s) => a + Number(s.volumenAutorizadoM3 ?? 0), 0);

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Informe de ejecución — ${plan.planNumber ?? plan.planType}</title>
  <style>body{font-family:Arial,sans-serif;color:#111;padding:30px;font-size:12px}h1{font-size:16px;margin:0}h2{font-size:13px;border-bottom:1px solid #999;padding-bottom:3px;margin:18px 0 6px}.sub{color:#555;font-size:11px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:3px 24px;margin-top:8px}.k{color:#666}.v{font-weight:bold}table{width:100%;border-collapse:collapse;margin-top:6px;font-size:11px}th,td{border:1px solid #ccc;padding:4px 7px}th{background:#f0f0f0;text-align:left}.tot{text-align:right;margin-top:6px;font-size:12px}</style>
  </head><body onload="window.print()">
  <h1>INFORME DE EJECUCIÓN DEL PLAN DE MANEJO</h1>
  <div class="sub">Documento interno de gestión — base para el informe a ARFFS / SERFOR / OSINFOR al cierre del POA</div>
  <h2>Datos del título habilitante</h2>
  <div class="grid">
    <div><span class="k">Titular:</span> <span class="v">${plan.titularName}</span></div>
    <div><span class="k">Documento de gestión:</span> <span class="v">${plan.planType} ${plan.planNumber ?? ""}</span></div>
    <div><span class="k">Título habilitante:</span> <span class="v">${plan.tituloHabilitante ?? "—"}</span></div>
    <div><span class="k">Resolución:</span> <span class="v">${plan.resolucionNumber ?? "—"}</span></div>
    <div><span class="k">Parcela de corta:</span> <span class="v">${plan.parcelaCorta ?? "—"}</span></div>
    <div><span class="k">Área (ha):</span> <span class="v">${plan.areaHa ? Number(plan.areaHa).toFixed(2) : "—"}</span></div>
    <div><span class="k">Región / ARFFS:</span> <span class="v">${plan.region ?? "—"} / ${plan.arffs ?? "—"}</span></div>
    <div><span class="k">Vigencia:</span> <span class="v">${d(plan.vigenciaDesde)} → ${d(plan.vigenciaHasta)}</span></div>
  </div>
  <h2>Balance de extracción por especie</h2>
  <table><thead><tr><th>Especie</th><th>Autorizado m³</th><th>Movilizado m³</th><th>Saldo m³</th><th>% mov.</th></tr></thead><tbody>${balRows || '<tr><td colspan="5">Sin especies</td></tr>'}</tbody></table>
  ${balance ? `<div class="tot">Pago por área (0.01% UIT × ha): <b>S/ ${balance.pagoArea.toFixed(2)}</b> · Pago derecho total: <b>S/ ${balance.pagoDerechoTotal.toFixed(2)}</b> · Valor movilizado: <b>S/ ${balance.valorTotal.toFixed(2)}</b></div>` : ""}
  <h2>Resumen del censo</h2>
  <table><thead><tr><th>Estado del árbol</th><th>N° árboles</th><th>Vol. estimado m³</th></tr></thead><tbody>${censoRows || '<tr><td colspan="3">Sin censo</td></tr>'}</tbody></table>
  <h2>Movimientos registrados en el libro</h2>
  <table><thead><tr><th>Sección</th><th>N° líneas</th><th>Volumen m³</th></tr></thead><tbody>${secRows || '<tr><td colspan="3">Sin movimientos</td></tr>'}</tbody></table>
  <div class="tot">Volumen total autorizado en el plan: <b>${autorizadoTotal.toFixed(2)} m³</b></div>
  <div style="margin-top:34px;display:flex;justify-content:space-between"><div>______________________<br>Titular / Regente forestal</div><div>______________________<br>Fecha</div></div>
  </body></html>`;
  const w = window.open("", "_blank", "width=860,height=950");
  if (w) { w.document.write(html); w.document.close(); }
}
