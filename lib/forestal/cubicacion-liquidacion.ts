/**
 * cubicacion-liquidacion — arma el comprobante de liquidación del lote para un
 * comprador: desglose POR ESPECIE (piezas, pie tablar, precio y subtotal) + total.
 *
 * PURO: recibe piezas + precio (número o resolver por especie) + datos del
 * cliente, y devuelve la estructura, el texto de WhatsApp y el HTML imprimible.
 * El precio por especie se deriva del valor del grupo (valor / pie tablar), así
 * que funciona igual con precio global o por especie.
 */
import type { PiezaCubicada } from "./cubicacion";
import { agruparPor, type PrecioPt } from "./cubicacion-resumen";

export interface DatosLiquidacion {
  cliente: string;
  /** RUC o DNI del comprador (opcional). */
  documento?: string;
  /** Fecha ISO (YYYY-MM-DD). */
  fecha: string;
  nota?: string;
  /** Nombre de la tienda/aserradero que emite. */
  emisor?: string;
}

export interface LineaLiquidacion {
  especie: string;
  piezas: number;
  pieTablar: number;
  /** S/ por pie tablar aplicado a esta especie (derivado). */
  precioPt: number;
  subtotal: number;
}

export interface Liquidacion {
  lineas: LineaLiquidacion[];
  totalPiezas: number;
  totalPt: number;
  totalM3: number;
  total: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const soles = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPt = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Arma la liquidación agrupando por especie con su precio y subtotal. */
export function construirLiquidacion(rows: PiezaCubicada[], precio: PrecioPt): Liquidacion {
  const r = agruparPor(rows, "especie", precio);
  const lineas: LineaLiquidacion[] = r.grupos.map((g) => ({
    especie: g.label,
    piezas: g.cantidad,
    pieTablar: g.pieTablar,
    precioPt: g.pieTablar > 0 ? r2(g.valor / g.pieTablar) : 0,
    subtotal: g.valor,
  }));
  return {
    lineas,
    totalPiezas: r.total.cantidad,
    totalPt: r.total.pieTablar,
    totalM3: r.total.m3,
    total: r.total.valor,
  };
}

/** Fecha ISO → dd/mm/aaaa (UTC, para no correr un día en Lima). */
export function fechaLarga(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

/** Texto para pegar en WhatsApp. */
export function liquidacionAWhatsApp(datos: DatosLiquidacion, liq: Liquidacion): string {
  const conValor = liq.total > 0;
  const lineas = liq.lineas.map((l) =>
    conValor
      ? `• ${l.especie}: ${fmtPt(l.pieTablar)} PT × S/ ${soles(l.precioPt)} = S/ ${soles(l.subtotal)}`
      : `• ${l.especie}: ${l.piezas} pzas · ${fmtPt(l.pieTablar)} PT`,
  );
  return [
    "*LIQUIDACIÓN*",
    datos.emisor ? datos.emisor : "",
    `Cliente: ${datos.cliente || "—"}${datos.documento ? ` (${datos.documento})` : ""}`,
    `Fecha: ${fechaLarga(datos.fecha)}`,
    "",
    ...lineas,
    "",
    conValor
      ? `*Total: ${fmtPt(liq.totalPt)} PT · S/ ${soles(liq.total)}*`
      : `*Total: ${liq.totalPiezas} piezas · ${fmtPt(liq.totalPt)} PT*`,
    datos.nota ? `\n${datos.nota}` : "",
  ].filter(Boolean).join("\n");
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/** HTML imprimible A4 (documento independiente, se abre en un iframe para print). */
export function liquidacionAHtml(datos: DatosLiquidacion, liq: Liquidacion): string {
  const conValor = liq.total > 0;
  const filas = liq.lineas.map((l) => `
    <tr>
      <td>${esc(l.especie)}</td>
      <td class="n">${l.piezas}</td>
      <td class="n">${fmtPt(l.pieTablar)}</td>
      ${conValor ? `<td class="n">S/ ${soles(l.precioPt)}</td><td class="n">S/ ${soles(l.subtotal)}</td>` : ""}
    </tr>`).join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Liquidación ${esc(datos.cliente || "")}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #14201c; margin: 32px; }
    h1 { font-size: 22px; margin: 0 0 2px; color: #00695c; }
    .sub { color: #667; font-size: 13px; margin-bottom: 18px; }
    .meta { display: flex; justify-content: space-between; gap: 16px; font-size: 13px; margin-bottom: 16px; }
    .meta b { color: #14201c; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #00806011; text-align: left; padding: 8px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #556; border-bottom: 2px solid #00806033; }
    td { padding: 8px 10px; border-bottom: 1px solid #e6efec; }
    td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
    tfoot td { font-weight: 700; border-top: 2px solid #00806055; font-size: 14px; }
    .total { color: #00695c; }
    .nota { margin-top: 16px; font-size: 12px; color: #556; white-space: pre-wrap; }
    .pie { margin-top: 28px; font-size: 11px; color: #99a; border-top: 1px solid #eee; padding-top: 8px; }
    @media print { body { margin: 0; padding: 24px; } }
  </style></head><body>
    <h1>Liquidación de madera</h1>
    <div class="sub">${datos.emisor ? esc(datos.emisor) : "Comprobante de venta"}</div>
    <div class="meta">
      <div><b>Cliente:</b> ${esc(datos.cliente || "—")}${datos.documento ? ` · ${esc(datos.documento)}` : ""}</div>
      <div><b>Fecha:</b> ${fechaLarga(datos.fecha)}</div>
    </div>
    <table>
      <thead><tr><th>Especie</th><th class="n">Piezas</th><th class="n">Pie tablar</th>${conValor ? `<th class="n">S/ / PT</th><th class="n">Subtotal</th>` : ""}</tr></thead>
      <tbody>${filas}</tbody>
      <tfoot><tr>
        <td>Total · ${liq.totalPiezas} piezas</td>
        <td class="n">${liq.totalPiezas}</td>
        <td class="n">${fmtPt(liq.totalPt)} PT</td>
        ${conValor ? `<td></td><td class="n total">S/ ${soles(liq.total)}</td>` : ""}
      </tr></tfoot>
    </table>
    ${datos.nota ? `<div class="nota">${esc(datos.nota)}</div>` : ""}
    <div class="pie">${fmtPt(liq.totalM3)} m³ · documento generado por el cubicador de Buleje.</div>
  </body></html>`;
}
