/**
 * «Corte de turno»: el mismo resumen en tres salidas que usa una bodega —
 * ticket de 80 mm (cualquier ticketera instalada como impresora), WhatsApp
 * (el dueño lo recibe en el celular) y texto plano.
 *
 * Antes el botón «Imprimir resumen» llamaba `window.print()` sobre el panel
 * entero: salía el menú lateral, la barra y el modal recortado en A4.
 */
import { formatCurrency, formatTime } from "@/lib/format";
import { diaConFecha, type TurnoSummary } from "./tipos";

const ANCHO = 32; // columnas de una ticketera de 80 mm con letra normal

function columnas(izq: string, der: string): string {
  const hueco = ANCHO - izq.length - der.length;
  return `${izq}${" ".repeat(Math.max(1, hueco))}${der}`;
}

function signo(n: number): string {
  if (Math.abs(n) < 0.005) return formatCurrency(0);
  return `${n > 0 ? "+" : "−"}${formatCurrency(Math.abs(n))}`;
}

/** Las líneas del corte. Cada cifra sale del resumen del servidor (ninguna se recalcula aquí). */
export function lineasCorteTurno(r: TurnoSummary): string[] {
  const raya = "-".repeat(ANCHO);
  const lineas = [
    "CORTE DE TURNO",
    `${r.cajeroNombre}`,
    `${diaConFecha(r.abrioEn)} ${formatTime(r.abrioEn)}${r.cerroEn ? ` a ${formatTime(r.cerroEn)}` : " (abierto)"}`,
    raya,
    columnas("Ventas", String(r.cantidadVentas)),
    columnas("Total vendido", formatCurrency(r.totalVentas)),
    columnas("Ticket promedio", formatCurrency(r.ticketPromedio)),
  ];
  if (r.metodosPago.length > 0) {
    lineas.push(raya, "POR MEDIO DE PAGO");
    for (const m of r.metodosPago) lineas.push(columnas(m.metodo, formatCurrency(m.total)));
  }
  lineas.push(
    raya,
    columnas("Efectivo inicial", formatCurrency(r.inicioEfectivo)),
    columnas("Efectivo contado", r.cierreEfectivo == null ? "sin conteo" : formatCurrency(r.cierreEfectivo)),
    columnas("Diferencia", r.diferencia == null ? "sin dato" : signo(r.diferencia)),
  );
  if (r.totalDescuentos > 0) lineas.push(columnas("Descuentos", formatCurrency(r.totalDescuentos)));
  if (r.topProductos.length > 0) {
    lineas.push(raya, "MÁS VENDIDOS");
    for (const p of r.topProductos.slice(0, 3)) lineas.push(columnas(p.nombre.slice(0, ANCHO - 6), `x${p.cantidad}`));
  }
  return lineas;
}

/** Texto para WhatsApp: el ticket entre ``` para que se lea en columnas. */
export function textoWhatsAppCorte(r: TurnoSummary): string {
  return "```\n" + lineasCorteTurno(r).join("\n") + "\n```";
}

export function enviarCortePorWhatsApp(r: TurnoSummary): void {
  // Sin número: WhatsApp abre la lista de contactos y eliges a quién (el dueño, el grupo de la bodega).
  window.open(`https://wa.me/?text=${encodeURIComponent(textoWhatsAppCorte(r))}`, "_blank", "noopener,noreferrer");
}

function escaparHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Abre la hoja de 80 mm y lanza el diálogo de impresión. false si el navegador bloqueó la ventana. */
export function imprimirCorte80mm(r: TurnoSummary): boolean {
  const w = window.open("", "_blank", "width=420,height=720");
  if (!w) return false;
  const cuerpo = escaparHtml(lineasCorteTurno(r).join("\n"));
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Corte de turno</title>
<style>@page{size:80mm auto;margin:3mm}body{margin:0;font:12px/1.35 ui-monospace,Menlo,Consolas,monospace}
pre{margin:0;white-space:pre-wrap}</style></head><body><pre>${cuerpo}</pre>
<script>window.onload=function(){window.focus();window.print();}</script></body></html>`);
  w.document.close();
  return true;
}
