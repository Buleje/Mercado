"use client";

import { FileText, MessageCircle } from "@buleje/design-system/icons";
import type { DbPurchaseOrder, DbSupplier } from "@/lib/jsondb";
import { printPurchaseOrder } from "../PurchaseOrderPDF";
import { totalesOC } from "@/lib/compras/totales-oc";

interface OCPDFExportProps {
  oc: DbPurchaseOrder;
  supplier?: DbSupplier;
}

export default function OCPDFExport({ oc, supplier }: OCPDFExportProps) {
  const handlePrint = () => {
    printPurchaseOrder(oc, supplier);
  };

  const handleWhatsApp = () => {
    const items = oc.items
      .map((i, idx) => `${idx + 1}. ${i.name} x${i.quantity} ${i.unit} @ S/${Number(i.unitCost).toFixed(2)} = S/${(i.quantity * i.unitCost).toFixed(2)}`)
      .join("\n");

    // El monto que se le manda al proveedor es el de la orden. Antes se le
    // sumaba 18% encima y se ignoraba el descuento: el mensaje prometía hasta
    // S/89.70 más de lo pactado.
    const t = totalesOC(oc);

    const message = encodeURIComponent(
      `*ORDEN DE COMPRA #${oc.id.slice(-8).toUpperCase()}*\n\n` +
      `Proveedor: ${supplier?.name ?? oc.supplierName}\n` +
      `Fecha: ${new Date(oc.createdAt).toLocaleDateString("es-PE")}\n\n` +
      `*Productos:*\n${items}\n\n` +
      (t.descuentoPct > 0
        ? `Subtotal: S/ ${t.subtotalBruto.toFixed(2)}\n` +
          `Descuento (${t.descuentoPct}%): -S/ ${t.descuentoMonto.toFixed(2)}\n`
        : "") +
      `*TOTAL: S/ ${t.total.toFixed(2)}*\n` +
      `(incluye IGV S/ ${t.igvContenido.toFixed(2)})\n\n` +
      `Buleje - Pucallpa`,
    );

    const phone = supplier?.phone?.replace(/\D/g, "") ?? "";
    const url = phone
      ? `https://wa.me/${phone.length === 9 ? "51" + phone : phone}?text=${message}`
      : `https://wa.me/?text=${message}`;

    window.open(url, "_blank");
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={handlePrint}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--data-warning-50)] dark:bg-amber-950/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] hover:bg-[var(--data-warning-100)] dark:hover:bg-[var(--data-warning-500)]/30 text-xs font-bold transition-colors"
        title="Descargar / Imprimir PDF"
      >
        <FileText className="h-3.5 w-3.5" />
        PDF
      </button>
      <button
        type="button"
        onClick={handleWhatsApp}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/10 dark:bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:text-[var(--data-success-500)] hover:bg-primary/10 dark:hover:bg-primary/15 text-xs font-bold transition-colors"
        title="Enviar por WhatsApp"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        WhatsApp
      </button>
    </div>
  );
}
