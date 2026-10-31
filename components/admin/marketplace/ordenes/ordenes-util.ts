/**
 * Lo que la vista Órdenes del Marketplace hace sin pantalla: las transiciones
 * de estado (espejo del backend), el mensaje de WhatsApp y el CSV.
 */

import type { MarketplaceOrder, OrderTargetStatus } from "@/components/admin/marketplace/hooks/use-marketplace-orders";
import { ORDER_STATUS_CONFIG } from "@/components/admin/marketplace/shared";
import { formatCurrency, formatDateNumeric, formatTime } from "@/lib/format";

/** Mismas transiciones que el backend: si las rechaza se muestra su error, pero así no se ofrecen las imposibles. */
export const SIGUIENTES: Record<string, OrderTargetStatus[]> = {
  pendiente: ["confirmado", "cancelado"],
  confirmado: ["preparando", "en_camino", "cancelado"],
  preparando: ["en_camino", "cancelado"],
  en_camino: ["entregado", "cancelado"],
};

/** Cómo se lee cada cambio en un menú. */
export const ACCION_DE_ESTADO: Record<OrderTargetStatus, string> = {
  confirmado: "Confirmar",
  preparando: "Marcar preparando",
  en_camino: "Marcar en camino",
  entregado: "Marcar entregado",
  cancelado: "Cancelar el pedido",
};

/** El rótulo corto del botón de la fila (la columna no da para «Marcar en camino»). */
export const BOTON_DE_ESTADO: Record<OrderTargetStatus, string> = {
  confirmado: "Confirmar",
  preparando: "Preparar",
  en_camino: "Enviar",
  entregado: "Entregado",
  cancelado: "Cancelar",
};

/** El paso siguiente normal (no cancelar): el botón a la vista de cada fila. */
export function pasoSiguiente(status: string): OrderTargetStatus | null {
  return (SIGUIENTES[status] ?? []).find((s) => s !== "cancelado") ?? null;
}

export const idCorto = (id: string) => id.slice(-8).toUpperCase();

/** El link de WhatsApp con el estado del pedido; `null` si el teléfono no da para un número. */
export function linkWhatsApp(o: { id: string; customerName: string; status: string; total: number }, telefono: string | null | undefined): string | null {
  const digitos = (telefono ?? "").replace(/\D/g, "");
  if (digitos.length < 8) return null;
  // wa.me pide E.164 sin «+»; 9 dígitos = celular peruano sin código de país.
  const intl = digitos.length === 9 ? `51${digitos}` : digitos;
  const estado = ORDER_STATUS_CONFIG[o.status]?.label ?? o.status;
  const mensaje =
    `Hola ${o.customerName}, te escribo de la tienda. ` +
    `Tu pedido #${idCorto(o.id)} está actualmente *${estado}*. ` +
    `Total: ${formatCurrency(o.total)}. ¿Te confirmamos los detalles?`;
  return `https://wa.me/${intl}?text=${encodeURIComponent(mensaje)}`;
}

/** Descarga las órdenes que se ven (con sus filtros) en CSV para Excel. */
export function exportarOrdenesCsv(ordenes: readonly MarketplaceOrder[]): void {
  const filas = ordenes.map((o) => {
    const d = new Date(o.createdAt);
    return [
      `#${idCorto(o.id)}`,
      formatDateNumeric(d),
      formatTime(d),
      o.customerName,
      o.customerPhone ?? "",
      o.customerLocation ?? "",
      String(o.itemsCount),
      o.total.toFixed(2),
      ORDER_STATUS_CONFIG[o.status]?.label ?? o.status,
    ];
  });
  const cabecera = ["Orden", "Fecha", "Hora", "Cliente", "Tel", "Direccion", "Items", "Total (S/)", "Estado"];
  const lineas = [cabecera, ...filas].map((r) =>
    r.map((celda) => (/[",\n]/.test(celda) ? `"${celda.replace(/"/g, '""')}"` : celda)).join(","),
  );
  const blob = new Blob(["﻿" + lineas.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `marketplace-ordenes-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
