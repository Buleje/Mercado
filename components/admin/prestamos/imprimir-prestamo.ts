/**
 * Los dos papeles que se imprimen de un préstamo (Cronograma de amortización y
 * Resumen de deuda), sobre el membrete común del negocio (ADR-514): logo, nombre,
 * RUC, tipo del documento y hora de emisión. Mismos datos que antes; sólo se
 * mudó el armado HTML fuera de `PrestamosModule`, y lo que viene del usuario sale
 * escapado.
 */

import { formatCurrency, formatDate, formatDateLong, formatDateNumeric } from "@/lib/format";
import { imprimirHoja } from "@/lib/documentos/membrete-imprimir";
import { PALETA } from "@/lib/documentos/membrete-pdf";
import { escapeHtml } from "@/lib/safe-html";
import type { Prestamo, SistemaAmortizacion } from "./tipos";

const a = `rgb(${PALETA.acento.join(" ")})`;
const gris = `rgb(${PALETA.secundario.join(" ")})`;
const regla = `rgb(${PALETA.regla.join(" ")})`;
const fondo = `rgb(${PALETA.fondo.join(" ")})`;
const coral = "rgb(176 52 38)";
const simbolo = (p: Prestamo) => (p.moneda === "USD" ? "$" : "S/");
const cliente = (p: Prestamo) => escapeHtml(String(p.customerId || p.entidadNombre || "—"));

const ESTILOS_COMUNES = `
.info{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;font-size:13px}
.info b{color:${a}}
table{width:100%;border-collapse:collapse;font-size:11px}
th{background:${a};color:rgb(255 255 255);padding:8px;text-align:left}
td{padding:6px 8px;border-bottom:1px solid ${regla}}
tr:nth-child(even){background:${fondo}}
.paid{color:${a};font-weight:bold}
.pending{color:${coral}}
.right{text-align:right}
.total-row{background:${fondo};font-weight:bold}
.footer{margin-top:40px;border-top:1px solid ${regla};padding-top:20px;display:flex;justify-content:space-between;font-size:12px}
.firma{border-top:1px solid ${gris};width:200px;text-align:center;padding-top:4px;margin-top:40px}
.section{border-top:1px dashed ${regla};padding:12px 0;font-size:13px}
.row{display:flex;justify-content:space-between;margin:4px 0}
.row b{color:${a}}
`;

export function imprimirCronograma(p: Prestamo, sistemas: Record<SistemaAmortizacion, string>, nombreRespaldo?: string | null): Promise<void> {
  let saldo = p.monto;
  const totalPagar = p.cuotas.reduce((s, c) => s + c.monto, 0);
  const filas = p.cuotas
    .map((c) => {
      saldo = Math.max(0, saldo - c.capital);
      return `<tr><td>${c.numeroCuota}</td><td>${formatDateNumeric(c.fechaVence)}</td><td class="right">${formatCurrency(c.capital)}</td><td class="right">${formatCurrency(c.interes)}</td><td class="right"><b>${formatCurrency(c.monto)}</b></td><td class="right">${formatCurrency(saldo)}</td><td class="${c.pagadoEn ? "paid" : "pending"}">${c.pagadoEn ? "Pagado" : "Pendiente"}</td><td>${formatDateNumeric(c.pagadoEn)}</td></tr>`;
    })
    .join("");
  const cuerpo = `<div class="info">
  <div><b>Cliente:</b> ${cliente(p)}</div>
  <div><b>Monto:</b> ${simbolo(p)}${Number(p.monto).toFixed(2)}</div>
  <div><b>Tasa:</b> ${p.tasaInteres}% mensual${p.tea ? ` (TEA ${p.tea}%)` : ""}</div>
  <div><b>Sistema:</b> ${escapeHtml(sistemas[p.sistemaAmortizacion])}</div>
  <div><b>N° Cuotas:</b> ${p.numeroCuotas}</div>
  <div><b>Fecha:</b> ${formatDate(p.createdAt)}</div>
  ${p.entidadNombre ? `<div><b>Entidad:</b> ${escapeHtml(String(p.entidadNombre))}</div>` : ""}
  <div><b>Estado:</b> ${escapeHtml(String(p.status ?? ""))}</div>
</div>
<table><thead><tr><th>#</th><th>Fecha vence</th><th class="right">Capital</th><th class="right">Interés</th><th class="right">Cuota</th><th class="right">Saldo</th><th>Estado</th><th>Pago</th></tr></thead><tbody>
${filas}
<tr class="total-row"><td colspan="2"><b>TOTAL</b></td><td class="right"><b>${formatCurrency(p.cuotas.reduce((s, c) => s + c.capital, 0))}</b></td><td class="right"><b>${formatCurrency(p.cuotas.reduce((s, c) => s + c.interes, 0))}</b></td><td class="right"><b>${formatCurrency(totalPagar)}</b></td><td colspan="3"></td></tr>
</tbody></table>
<div class="footer"><div class="firma">Firma del deudor</div><div class="firma">Firma de la bodega</div></div>`;
  return imprimirHoja({ titulo: "Cronograma de amortización", tipo: "Cronograma de amortización", extra: p.nroOperacion ? `Operación ${p.nroOperacion}` : null, estilos: ESTILOS_COMUNES, cuerpo, nombreRespaldo });
}

export function imprimirResumenDeuda(p: Prestamo, sistemas: Record<SistemaAmortizacion, string>, nombreRespaldo?: string | null): Promise<void> {
  const pagadas = p.cuotas.filter((c) => c.pagadoEn);
  const pendientes = p.cuotas.filter((c) => !c.pagadoEn);
  const saldoPendiente = pendientes.reduce((s, c) => s + c.monto, 0);
  const s = simbolo(p);
  const cuerpo = `<div class="section">
  <div class="row"><span>Cliente:</span><b>${cliente(p)}</b></div>
  <div class="row"><span>Fecha del documento:</span><b>${escapeHtml(formatDateLong(new Date()))}</b></div>
  ${p.entidadNombre ? `<div class="row"><span>Entidad:</span><b>${escapeHtml(String(p.entidadNombre))}</b></div>` : ""}
  ${p.nroOperacion ? `<div class="row"><span>N° Operación:</span><b>${escapeHtml(String(p.nroOperacion))}</b></div>` : ""}
</div>
<div class="section">
  <div class="row"><span>Monto prestado:</span><b>${s} ${Number(p.monto).toFixed(2)}</b></div>
  <div class="row"><span>Tasa de interés:</span><b>${p.tasaInteres}% mensual</b></div>
  ${p.tea ? `<div class="row"><span>TEA:</span><b>${p.tea}%</b></div>` : ""}
  <div class="row"><span>Amortización:</span><b>${escapeHtml(sistemas[p.sistemaAmortizacion])}</b></div>
  <div class="row"><span>Número de cuotas:</span><b>${p.numeroCuotas}</b></div>
  <div class="row"><span>Cuotas pagadas:</span><b>${pagadas.length}</b></div>
  <div class="row"><span>Cuotas pendientes:</span><b>${pendientes.length}</b></div>
  <div class="row" style="font-size:15px;margin-top:8px"><span>Monto pendiente:</span><b style="color:${coral}">${s} ${saldoPendiente.toFixed(2)}</b></div>
</div>
<div class="section"><p style="font-weight:bold;margin-bottom:8px">TABLA DE CUOTAS</p>
<table><thead><tr><th>#</th><th>Fecha vence</th><th class="right">Capital</th><th class="right">Interés</th><th class="right">Monto</th><th>Estado</th><th>Fecha pago</th></tr></thead><tbody>
${p.cuotas.map((c) => `<tr><td>${c.numeroCuota}</td><td>${formatDateNumeric(c.fechaVence)}</td><td class="right">${formatCurrency(c.capital)}</td><td class="right">${formatCurrency(c.interes)}</td><td class="right"><b>${formatCurrency(c.monto)}</b></td><td class="${c.pagadoEn ? "paid" : "pending"}">${c.pagadoEn ? "PAGADO" : "PEND."}</td><td>${formatDateNumeric(c.pagadoEn)}</td></tr>`).join("")}
</tbody></table></div>
<div class="firma">Firma del deudor</div>`;
  return imprimirHoja({ titulo: "Resumen de deuda", tipo: "Resumen de deuda", extra: p.nroOperacion ? `Operación ${p.nroOperacion}` : null, estilos: ESTILOS_COMUNES, cuerpo, nombreRespaldo });
}
