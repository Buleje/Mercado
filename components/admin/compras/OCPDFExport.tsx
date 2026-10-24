import type { DbPurchaseOrder, DbSupplier } from "@/lib/jsondb";
import { printPurchaseOrder } from "../PurchaseOrderPDF";
import { totalesOC } from "@/lib/compras/totales-oc";
import { formatCurrency, formatDateNumeric } from "@/lib/format";
import type { Membrete } from "@/lib/admin/membrete";

/**
 * PDF y WhatsApp de una orden de compra. Antes eran dos botones de 28 px en cada
 * tarjeta; desde 10-10 son acciones del «⋯» de la fila (Órdenes de compra).
 * Las dos firman con el negocio de la sesión (`useMembrete`), no con «Buleje».
 */
export function imprimirOC(oc: DbPurchaseOrder, supplier?: DbSupplier, membrete?: Membrete | null): void {
  printPurchaseOrder(oc, supplier, membrete);
}

export function enviarOCPorWhatsApp(oc: DbPurchaseOrder, supplier?: DbSupplier, membrete?: Membrete | null): void {
  const items = oc.items
    .map((i, idx) => `${idx + 1}. ${i.name} x${i.quantity} ${i.unit} @ ${formatCurrency(Number(i.unitCost))} = ${formatCurrency(i.quantity * i.unitCost)}`)
    .join("\n");

  // El monto que se le manda al proveedor es el de la orden. Antes se le
  // sumaba 18% encima y se ignoraba el descuento: el mensaje prometía hasta
  // S/89.70 más de lo pactado.
  const t = totalesOC(oc);
  // Quién hace el pedido. El pie de los tickets no va: esto no es un comprobante.
  const quienPide = [membrete?.nombre, membrete?.direccion].filter(Boolean).join(" — ");

  const message = encodeURIComponent(
    `*ORDEN DE COMPRA #${oc.id.slice(-8).toUpperCase()}*\n\n` +
    `Proveedor: ${supplier?.name ?? oc.supplierName}\n` +
    `Fecha: ${formatDateNumeric(oc.createdAt)}\n\n` +
    `*Productos:*\n${items}\n\n` +
    (t.descuentoPct > 0
      ? `Subtotal: ${formatCurrency(t.subtotalBruto)}\n` +
        `Descuento (${t.descuentoPct}%): -${formatCurrency(t.descuentoMonto)}\n`
      : "") +
    `*TOTAL: ${formatCurrency(t.total)}*\n` +
    `(incluye IGV ${formatCurrency(t.igvContenido)})` +
    (quienPide ? `\n\n${quienPide}` : ""),
  );

  const phone = supplier?.phone?.replace(/\D/g, "") ?? "";
  const url = phone
    ? `https://wa.me/${phone.length === 9 ? "51" + phone : phone}?text=${message}`
    : `https://wa.me/?text=${message}`;

  window.open(url, "_blank");
}
