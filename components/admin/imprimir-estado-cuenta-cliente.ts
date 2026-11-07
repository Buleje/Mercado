/**
 * El estado de cuenta de un cliente (fiados, préstamos, últimas compras) en
 * papel, sobre el membrete común del negocio. Antes el botón «Imprimir» llamaba
 * `window.print()` sobre el modal, que el CSS de impresión esconde (`.fixed`).
 */

import { formatCurrency, formatDate } from "@/lib/format";
import { imprimirHoja } from "@/lib/documentos/membrete-imprimir";
import { PALETA } from "@/lib/documentos/membrete-pdf";
import { escaparHtml } from "@/lib/documentos/membrete-html";

export interface EstadoCuentaClienteImpreso {
  cliente: { name: string; phone: string };
  resumen: { totalFiados: number; totalPrestamos: number; puntosLealtad: number; tierLealtad: string };
  fiados: { descripcion?: string | null; total: number; saldo: number; fechaCreacion: string; fechaVence: string | null }[];
  prestamos: { monto: number; saldoPendiente: number; fechaCreacion: string; cuotasPendientes: { número: number; monto: number; fechaVence: string }[] }[];
  ultimasCompras: { total: number; status: string; metodoPago: string; fecha: string }[];
}

const rgb = (c: readonly number[]) => `rgb(${c.join(" ")})`;
const dia = (iso: string) => {
  try {
    return formatDate(iso);
  } catch {
    return iso;
  }
};

export function imprimirEstadoCuentaCliente(d: EstadoCuentaClienteImpreso, estados: Record<string, string>): Promise<void> {
  const e = escaparHtml;
  const fiados = d.fiados.length
    ? `<h2>Fiados pendientes</h2><table><thead><tr><th>Descripción</th><th class="r">Total</th><th class="r">Saldo</th><th>Fecha</th><th>Vence</th></tr></thead><tbody>${d.fiados
        .map((f) => `<tr><td>${e(f.descripcion || "Sin descripción")}</td><td class="r">${formatCurrency(f.total)}</td><td class="r">${formatCurrency(f.saldo)}</td><td>${e(dia(f.fechaCreacion))}</td><td>${f.fechaVence ? e(dia(f.fechaVence)) : "—"}</td></tr>`)
        .join("")}<tr class="t"><td>Total</td><td class="r">${formatCurrency(d.fiados.reduce((s, f) => s + f.total, 0))}</td><td class="r">${formatCurrency(d.resumen.totalFiados)}</td><td colspan="2"></td></tr></tbody></table>`
    : "";
  const prestamos = d.prestamos.length
    ? `<h2>Préstamos activos</h2>${d.prestamos
        .map(
          (p) =>
            `<p><b>Préstamo ${formatCurrency(p.monto)}</b> — saldo ${formatCurrency(p.saldoPendiente)} (${e(dia(p.fechaCreacion))})</p>${
              p.cuotasPendientes.length
                ? `<table><tbody>${p.cuotasPendientes.map((c) => `<tr><td>Cuota ${c.número}</td><td>${e(dia(c.fechaVence))}</td><td class="r">${formatCurrency(c.monto)}</td></tr>`).join("")}</tbody></table>`
                : ""
            }`,
        )
        .join("")}`
    : "";
  const compras = d.ultimasCompras.length
    ? `<h2>Últimas compras</h2><table><tbody>${d.ultimasCompras
        .map((c) => `<tr><td>${e(dia(c.fecha))}</td><td>${e(c.metodoPago ?? "efectivo")}</td><td>${e(estados[c.status] ?? c.status)}</td><td class="r">${formatCurrency(c.total)}</td></tr>`)
        .join("")}</tbody></table>`
    : "";
  const cuerpo = `<p style="font-size:14px"><b>${e(d.cliente.name)}</b> · ${e(d.cliente.phone)}</p>${fiados}${prestamos}${compras}<p style="margin-top:14px;color:${rgb(PALETA.secundario)}">Puntos de lealtad: ${d.resumen.puntosLealtad} · Nivel: ${e(d.resumen.tierLealtad)}</p>`;
  const estilos = `
h2{font-size:13px;margin:18px 0 6px}
table{width:100%;border-collapse:collapse;font-size:12px}
th{background:${rgb(PALETA.fondo)};text-align:left;padding:6px 8px;border-bottom:1px solid ${rgb(PALETA.regla)}}
td{padding:5px 8px;border-bottom:1px solid ${rgb(PALETA.regla)}}
.r{text-align:right}
.t td{font-weight:bold}`;
  return imprimirHoja({ titulo: "Estado de cuenta", tipo: "Estado de cuenta", estilos, cuerpo });
}
