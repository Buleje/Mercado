"use client";

import { FileText, MessageCircle } from "@buleje/design-system/icons";
import type { DbPurchaseOrder, DbSupplier } from "@/lib/jsondb";
import { printPurchaseOrder } from "../PurchaseOrderPDF";

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

    const subtotal = oc.items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
    const igv = subtotal * 0.18;
    const total = subtotal + igv;

    const message = encodeURIComponent(
      `*ORDEN DE COMPRA #${oc.id.slice(-8).toUpperCase()}*\n\n` +
      `Proveedor: ${supplier?.name ?? oc.supplierName}\n` +
      `Fecha: ${new Date(oc.createdAt).toLocaleDateString("es-PE")}\n\n` +
      `*Productos:*\n${items}\n\n` +
      `Subtotal: S/ ${subtotal.toFixed(2)}\n` +
      `IGV (18%): S/ ${igv.toFixed(2)}\n` +
      `*TOTAL: S/ ${total.toFixed(2)}*\n\n` +
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
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)] hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)] text-xs font-bold transition-colors"
        title="Enviar por WhatsApp"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        WhatsApp
      </button>
    </div>
  );
}
