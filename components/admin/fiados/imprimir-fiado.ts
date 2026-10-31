/**
 * La ficha de un fiado en papel, sobre el membrete común del negocio. Antes el
 * botón «Imprimir» llamaba `window.print()` sobre el panel lateral, que el CSS de
 * impresión esconde (`.fixed`): salía una hoja sin la ficha. Ahora arma el papel
 * con lo que ya muestra la ficha (cliente, total, pagado, saldo, pagos).
 */

import { formatCurrency, formatDate, formatDateNumeric, formatTime } from "@/lib/format";
import { imprimirHoja } from "@/lib/documentos/membrete-imprimir";
import { PALETA } from "@/lib/documentos/membrete-pdf";
import { escaparHtml } from "@/lib/documentos/membrete-html";
import { STATUS_META, type Fiado } from "./tipos";

const rgb = (c: readonly number[]) => `rgb(${c.join(" ")})`;

export function imprimirFiado(f: Fiado): Promise<void> {
  const pagos = [...f.cuotas].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const cuerpo = `<div class="info">
  <div><b>Cliente:</b> ${escaparHtml(f.customerName || f.customerId)}</div>
  <div><b>Estado:</b> ${escaparHtml(STATUS_META[f.status].label)}</div>
  <div><b>Creado:</b> ${escaparHtml(formatDate(f.createdAt))}</div>
  ${f.fechaVence ? `<div><b>Vence:</b> ${escaparHtml(formatDate(f.fechaVence))}</div>` : ""}
  ${f.descripcion ? `<div style="grid-column:1/-1"><b>Detalle:</b> ${escaparHtml(f.descripcion)}</div>` : ""}
</div>
<table><tbody>
<tr><td>Total fiado</td><td class="r">${formatCurrency(f.total)}</td></tr>
<tr><td>Pagado</td><td class="r">${formatCurrency(f.total - f.saldo)}</td></tr>
<tr class="t"><td>Saldo pendiente</td><td class="r">${formatCurrency(f.saldo)}</td></tr>
</tbody></table>
<p style="font-weight:bold;margin:18px 0 6px">Pagos</p>
${
  pagos.length === 0
    ? `<p style="color:${rgb(PALETA.secundario)}">Todavía no hay pagos.</p>`
    : `<table><thead><tr><th>Fecha</th><th>Nota</th><th class="r">Monto</th></tr></thead><tbody>${pagos
        .map((c) => `<tr><td>${escaparHtml(`${formatDateNumeric(c.createdAt)} ${formatTime(c.createdAt)}`)}</td><td>${escaparHtml(c.notas ?? "")}</td><td class="r">${formatCurrency(c.monto)}</td></tr>`)
        .join("")}</tbody></table>`
}`;
  const estilos = `
.info{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;font-size:13px}
table{width:100%;border-collapse:collapse;font-size:12px}
th{background:${rgb(PALETA.fondo)};text-align:left;padding:6px 8px;border-bottom:1px solid ${rgb(PALETA.regla)}}
td{padding:6px 8px;border-bottom:1px solid ${rgb(PALETA.regla)}}
.r{text-align:right}
.t td{font-weight:bold;font-size:14px}`;
  return imprimirHoja({ titulo: "Detalle del fiado", tipo: "Detalle de fiado", estilos, cuerpo });
}
