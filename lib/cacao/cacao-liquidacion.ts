/**
 * Reportes imprimibles del módulo Cacao (ADR-128 v4). Client-safe (window.print).
 *  - printCacaoVentasReporte: reporte de ventas por período (con cobros/saldos).
 *  - printCacaoLiquidacion: comprobante de liquidación/pago al productor.
 * Mismo lenguaje visual que cacao-reporte.ts (verde #166534, tabular-nums).
 */
import { ESTADO_PAGO_LABEL, type CacaoEstadoPago } from "./cacao-quality";

const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
const n2 = (v: number) =>
  v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v: string | number | null | undefined) => (v == null || v === "" ? 0 : Number(v));
const fdate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso;
  }
};

const HEAD_STYLE = `
  *{box-sizing:border-box} body{font-family:-apple-system,system-ui,"Segoe UI",Roboto,Arial,sans-serif;color:#1a1a1a;margin:0;padding:32px}
  .doc{max-width:760px;margin:0 auto}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #166534;padding-bottom:14px;margin-bottom:18px}
  .brand{font-size:20px;font-weight:800;color:#166534}.brand small{display:block;font-size:11px;font-weight:500;color:#555;letter-spacing:.08em;text-transform:uppercase}
  .date{font-size:13px;color:#666;text-align:right}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}
  .kpi{border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px}
  .kpi .l{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#888}
  .kpi .v{font-size:17px;font-weight:800;font-variant-numeric:tabular-nums}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#166534;margin:18px 0 8px}
  table{width:100%;border-collapse:collapse;font-size:12.5px}
  th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#888;border-bottom:1px solid #ddd;padding:6px 8px}
  td{padding:6px 8px;border-bottom:1px solid #eee}.r{text-align:right;font-variant-numeric:tabular-nums}
  tfoot td{font-weight:800;border-top:2px solid #166534;border-bottom:none}
  .sign{margin-top:44px;display:grid;grid-template-columns:1fr 1fr;gap:40px}
  .sign div{border-top:1px solid #999;padding-top:6px;font-size:12px;color:#666;text-align:center}
  .foot{margin-top:28px;font-size:11px;color:#999;text-align:center}
  @media print{body{padding:0}@page{margin:14mm}}`;

function openPrint(html: string) {
  if (typeof window === "undefined") return;
  const w = window.open("", "_blank", "width=860,height=900");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
}

export interface VentaReporteRow {
  ventaCode: string;
  fecha: string;
  compradorNombre: string | null;
  canal: string | null;
  pesoKg: string | number;
  totalPen: string | number | null;
  estadoPago: string;
  montoCobrado: string | number | null;
  esFob: boolean;
}
export interface VentaReporteStats {
  ingresos: number;
  cobrado: number;
  saldoPendiente: number;
  kgVendido: number;
  ventas: number;
}

/** Reporte de ventas por período (imprimible). Usa las ventas ya filtradas de la vista. */
export function printCacaoVentasReporte(
  ventas: VentaReporteRow[],
  stats: VentaReporteStats,
  acopiador = "Acopio de Cacao",
) {
  if (typeof window === "undefined") return;
  const fecha = new Date().toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const fechas = ventas.map((v) => v.fecha).sort();
  const periodo = fechas.length ? `${fdate(fechas[0])} – ${fdate(fechas[fechas.length - 1])}` : "—";
  const rows = ventas
    .map(
      (v) => `<tr>
    <td><b>${esc(v.ventaCode)}</b>${v.esFob ? ' <span style="color:#166534;font-size:10px">FOB</span>' : ""}</td>
    <td>${fdate(v.fecha)}</td>
    <td>${esc(v.compradorNombre ?? "—")}</td>
    <td class="r">${n2(num(v.pesoKg))}</td>
    <td class="r">S/ ${n2(num(v.totalPen))}</td>
    <td>${esc(ESTADO_PAGO_LABEL[v.estadoPago as CacaoEstadoPago] ?? v.estadoPago)}</td>
  </tr>`,
    )
    .join("");

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"/><title>Reporte de ventas — Cacao</title><style>${HEAD_STYLE}</style></head><body><div class="doc">
    <div class="head"><div class="brand">${esc(acopiador)}<small>Reporte de ventas · Cacao</small></div><div class="date">${fecha}<br/><b>Período:</b> ${periodo}</div></div>
    <div class="kpis">
      <div class="kpi"><div class="l">Ingresos</div><div class="v">S/ ${n2(stats.ingresos)}</div></div>
      <div class="kpi"><div class="l">Cobrado</div><div class="v">S/ ${n2(stats.cobrado)}</div></div>
      <div class="kpi"><div class="l">Saldo por cobrar</div><div class="v">S/ ${n2(stats.saldoPendiente)}</div></div>
      <div class="kpi"><div class="l">Kg vendidos</div><div class="v">${n2(stats.kgVendido)}</div></div>
    </div>
    <h2>Detalle de ventas (${ventas.length})</h2>
    <table><thead><tr><th>Venta</th><th>Fecha</th><th>Comprador</th><th class="r">Kg</th><th class="r">Total</th><th>Pago</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6">Sin ventas en el período.</td></tr>'}</tbody>
      <tfoot><tr><td colspan="3">Total</td><td class="r">${n2(stats.kgVendido)}</td><td class="r">S/ ${n2(stats.ingresos)}</td><td></td></tr></tfoot>
    </table>
    <div class="foot">Reporte interno de ventas de cacao. Los montos en soles incluyen conversión de ventas FOB (US$).</div>
  </div><script>window.onload=function(){window.print()}</script></body></html>`;
  openPrint(html);
}

export interface LiquidacionProducer {
  nombre: string;
  codigo: string | null;
  dni: string | null;
  sector: string | null;
}
export interface LiquidacionLote {
  loteCode: string;
  fecha: string;
  variedad: string | null;
  pesoKg: string | number;
  grado: string | null;
  humedadPct: string | number | null;
  totalPagado: string | number | null;
}

/** Comprobante de liquidación (pago) al productor por sus lotes acopiados. */
export function printCacaoLiquidacion(
  producer: LiquidacionProducer,
  lotes: LiquidacionLote[],
  acopiador = "Acopio de Cacao",
) {
  if (typeof window === "undefined") return;
  const fecha = new Date().toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const totalKg = lotes.reduce((s, l) => s + num(l.pesoKg), 0);
  const totalPagado = lotes.reduce((s, l) => s + num(l.totalPagado), 0);
  const rows = lotes
    .map(
      (l) => `<tr>
    <td><b>${esc(l.loteCode)}</b></td>
    <td>${fdate(l.fecha)}</td>
    <td>${esc(l.variedad ?? "—")}</td>
    <td class="r">${n2(num(l.pesoKg))}</td>
    <td class="r">${l.grado ? esc(l.grado === "fuera_norma" ? "F/N" : `G-${l.grado}`) : "—"}</td>
    <td class="r">S/ ${n2(num(l.totalPagado))}</td>
  </tr>`,
    )
    .join("");

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"/><title>Liquidación al productor — Cacao</title><style>${HEAD_STYLE}</style></head><body><div class="doc">
    <div class="head"><div class="brand">${esc(acopiador)}<small>Comprobante de liquidación · Cacao</small></div><div class="date">${fecha}</div></div>
    <table style="margin-bottom:6px"><tbody>
      <tr><td style="border:none;padding:2px 8px"><b>Productor:</b> ${esc(producer.nombre)}${producer.codigo ? ` (${esc(producer.codigo)})` : ""}</td><td style="border:none;padding:2px 8px" class="r">${producer.dni ? `<b>DNI:</b> ${esc(producer.dni)}` : ""}</td></tr>
      <tr><td style="border:none;padding:2px 8px" colspan="2">${producer.sector ? `<b>Sector:</b> ${esc(producer.sector)}` : ""}</td></tr>
    </tbody></table>
    <h2>Lotes acopiados (${lotes.length})</h2>
    <table><thead><tr><th>Lote</th><th>Fecha</th><th>Variedad</th><th class="r">Kg</th><th class="r">Grado</th><th class="r">Pagado</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6">Sin lotes.</td></tr>'}</tbody>
      <tfoot><tr><td colspan="3">Total pagado</td><td class="r">${n2(totalKg)} kg</td><td></td><td class="r">S/ ${n2(totalPagado)}</td></tr></tfoot>
    </table>
    <div class="sign"><div>Firma del productor</div><div>Firma del acopiador</div></div>
    <div class="foot">Comprobante interno de pago por acopio de cacao en grano. Conservar para el registro del productor.</div>
  </div><script>window.onload=function(){window.print()}</script></body></html>`;
  openPrint(html);
}
