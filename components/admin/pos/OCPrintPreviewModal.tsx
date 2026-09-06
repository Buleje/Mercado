"use client";

import { DataTable, SectionTitle } from "@buleje/design-system";
import { AlertTriangle } from "@buleje/design-system/icons";
import { useCallback } from "react";

interface OCPrintPreviewModalProps {
  cart: Array<{
    product: {
      name: string;
      costPrice?: number | null;
      price: number;
      unit: string;
    };
    quantity: number;
  }>;
  subtotal: number;
  discount: number;
  discountAmount: number;
  total: number;
  selectedSupplier: { name: string; ruc?: string | null; phone?: string | null } | null;
  deliveryDate: string;
  paymentMethod: string;
  notes: string;
  lastOCId?: string;
  onClose: () => void;
}

export default function OCPrintPreviewModal({
  cart,
  subtotal,
  discount,
  discountAmount,
  total,
  selectedSupplier,
  deliveryDate,
  paymentMethod,
  notes,
  lastOCId,
  onClose,
}: OCPrintPreviewModalProps) {
  const handleDownloadPDF = useCallback(async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a4" });

    const LEFT = 15;
    const RIGHT = 195;
    const pageWidth = 210;
    let y = 20;

    // Header
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("ORDEN DE COMPRA", LEFT, y);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Buleje", LEFT, (y += 7));

    // OC number & dates (right side)
    const ocNum = lastOCId ? `N° ${lastOCId}` : "---";
    doc.setFont("helvetica", "bold");
    doc.text(ocNum, RIGHT, 20, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.text(`Fecha: ${new Date().toLocaleDateString("es-PE")}`, RIGHT, 27, { align: "right" });
    if (deliveryDate) {
      doc.text(`Entrega: ${new Date(deliveryDate).toLocaleDateString("es-PE")}`, RIGHT, 34, { align: "right" });
    }

    // Divider
    y += 6;
    doc.setLineWidth(0.3);
    doc.line(LEFT, y, RIGHT, y);
    y += 6;

    // Supplier
    doc.setFont("helvetica", "bold");
    doc.text("Proveedor", LEFT, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.text(selectedSupplier?.name ?? "---", LEFT, y);
    if (selectedSupplier?.ruc) { y += 5; doc.text(`RUC: ${selectedSupplier.ruc}`, LEFT, y); }
    if (selectedSupplier?.phone) { y += 5; doc.text(`Tel: ${selectedSupplier.phone}`, LEFT, y); }

    // Items table header
    y += 8;
    doc.setFillColor(240, 240, 240);
    doc.rect(LEFT, y - 4, pageWidth - 30, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Producto", LEFT + 1, y);
    doc.text("Cant.", 130, y, { align: "right" });
    doc.text("P.Unit", 160, y, { align: "right" });
    doc.text("Total", RIGHT, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += 2;
    doc.line(LEFT, y, RIGHT, y);
    y += 5;

    // Items rows
    for (const item of cart) {
      const unitPrice = item.product.costPrice ?? item.product.price;
      const lineTotal = unitPrice * item.quantity;
      doc.text(`${item.product.name}`, LEFT + 1, y);
      doc.text(`${item.quantity} ${item.product.unit}`, 130, y, { align: "right" });
      doc.text(`S/${unitPrice.toFixed(2)}`, 160, y, { align: "right" });
      doc.text(`S/${lineTotal.toFixed(2)}`, RIGHT, y, { align: "right" });
      y += 6;
      if (y > 260) { doc.addPage(); y = 20; }
    }

    // Totals
    doc.setLineWidth(0.5);
    doc.line(LEFT, y, RIGHT, y);
    y += 5;
    doc.setFontSize(9);
    doc.text("Subtotal:", 155, y);
    doc.text(`S/${subtotal.toFixed(2)}`, RIGHT, y, { align: "right" });
    if (discount > 0) {
      y += 5;
      doc.setTextColor(200, 0, 0);
      doc.text(`Descuento ${discount}%:`, 155, y);
      doc.text(`-S/${discountAmount.toFixed(2)}`, RIGHT, y, { align: "right" });
      doc.setTextColor(0, 0, 0);
    }
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("TOTAL:", 150, y);
    doc.setTextColor(45, 106, 79);
    doc.text(`S/${total.toFixed(2)}`, RIGHT, y, { align: "right" });
    doc.setTextColor(0, 0, 0);

    // Conditions
    y += 8;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Pago: ${paymentMethod.replace(/_/g, " ")}`, LEFT, y);
    if (notes) { y += 5; doc.text(`Notas: ${notes}`, LEFT, y); }

    // Signatures
    y += 15;
    doc.line(LEFT, y, LEFT + 50, y);
    doc.line(RIGHT - 50, y, RIGHT, y);
    y += 4;
    doc.setFontSize(8);
    doc.text("Firma autorizada", LEFT + 25, y, { align: "center" });
    doc.text("Proveedor", RIGHT - 25, y, { align: "center" });

    doc.save(`OC-${lastOCId ?? Date.now()}.pdf`);
  }, [cart, subtotal, discount, discountAmount, total, selectedSupplier, deliveryDate, paymentMethod, notes, lastOCId]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--surface-raised)] rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-4" id="oc-print-area">
          {/* Header */}
          <div className="flex items-center justify-between border-b dark:border-[var(--rule-base)] pb-4">
            <div>
              <SectionTitle className="text-lg font-bold text-[var(--text-primary)]">ORDEN DE COMPRA</SectionTitle>
              <p className="text-sm text-[var(--text-tertiary)]">Buleje</p>
            </div>
            <div className="text-right text-sm text-[var(--text-tertiary)]">
              <p className="font-bold text-[var(--text-primary)]">N° {lastOCId || "---"}</p>
              <p>Fecha: {new Date().toLocaleDateString("es-PE")}</p>
              {deliveryDate && <p>Entrega: {new Date(deliveryDate).toLocaleDateString("es-PE")}</p>}
            </div>
          </div>

          {/* Proveedor */}
          <div className="bg-[var(--surface-sunken)] rounded-xl p-3">
            <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase">Proveedor</p>
            {/* Reporte QA Compras 2026-08-12: el papel salía con "PROVEEDOR: ---"
                aunque crear la orden sí exige proveedor. Un documento a medias que
                se imprime y se manda es peor que uno que no se deja generar. */}
            <p className={selectedSupplier ? "font-bold text-[var(--text-primary)]" : "font-bold text-[var(--data-error-500)]"}>
              {selectedSupplier?.name || "Falta elegir el proveedor"}
            </p>
            {selectedSupplier?.ruc && <p className="text-sm text-[var(--text-secondary)]">RUC: {selectedSupplier.ruc}</p>}
            {selectedSupplier?.phone && <p className="text-sm text-[var(--text-secondary)]">Tel: {selectedSupplier.phone}</p>}
          </div>

          {/* Tabla de items */}
          <DataTable className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-[var(--rule-base)]">
                <th className="text-left py-2 font-semibold text-[var(--text-secondary)]">Producto</th>
                <th className="text-right py-2 font-semibold text-[var(--text-secondary)]">Cant.</th>
                <th className="text-right py-2 font-semibold text-[var(--text-secondary)]">P.Unit</th>
                <th className="text-right py-2 font-semibold text-[var(--text-secondary)]">Total</th>
              </tr>
            </thead>
            <tbody>
              {cart.map((item, idx) => (
                <tr key={idx} className="border-b border-[var(--rule-base)]">
                  <td className="py-2 text-[var(--text-primary)]">{item.product.name}</td>
                  <td className="py-2 text-right text-[var(--text-secondary)]">
                    {item.quantity} {item.product.unit}
                  </td>
                  <td className="py-2 text-right font-mono text-[var(--text-secondary)]">
                    S/{(item.product.costPrice ?? item.product.price).toFixed(2)}
                  </td>
                  <td className="py-2 text-right font-mono font-bold text-[var(--text-primary)]">
                    S/{((item.product.costPrice ?? item.product.price) * item.quantity).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>

          {/* Totales */}
          <div className="border-t-2 border-[var(--rule-base)] pt-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-tertiary)]">Subtotal</span>
              <span className="font-mono dark:text-gray-200">S/{subtotal.toFixed(2)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm text-[var(--data-error-500)]">
                <span>Descuento {discount}%</span>
                <span className="font-mono">-S/{discountAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold border-t dark:border-[var(--rule-base)] pt-2 dark:text-white">
              <span>TOTAL</span>
              <span className="font-mono text-primary">S/{total.toFixed(2)}</span>
            </div>
          </div>

          {/* Condiciones */}
          <div className="text-xs text-[var(--text-tertiary)] border-t dark:border-[var(--rule-base)] pt-3 space-y-1">
            <p><strong>Pago:</strong> {paymentMethod.replace("_", " ")}</p>
            {notes && <p><strong>Notas:</strong> {notes}</p>}
          </div>

          {/* Firma */}
          <div className="flex justify-between pt-6 mt-4 border-t dark:border-[var(--rule-base)]">
            <div className="text-center">
              <div className="w-40 border-b border-gray-400 dark:border-gray-600 mb-1"></div>
              <p className="text-xs text-[var(--text-tertiary)]">Firma autorizada</p>
            </div>
            <div className="text-center">
              <div className="w-40 border-b border-gray-400 dark:border-gray-600 mb-1"></div>
              <p className="text-xs text-[var(--text-tertiary)]">Proveedor</p>
            </div>
          </div>
        </div>

        {/* Mismo criterio que crear la orden: sin proveedor no hay documento. */}
        {!selectedSupplier && (
          <div role="alert" className="mx-4 mb-1 flex items-start gap-2 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-3 py-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-[var(--data-warning-500)]" aria-hidden />
            <p className="text-sm text-[var(--text-secondary)]">
              Elegí el proveedor para imprimir o descargar. Sin él es una lista de precios,
              no una orden de compra que alguien pueda aceptar.
            </p>
          </div>
        )}

        {/* Botones del modal */}
        <div className="flex gap-2 p-4 border-t dark:border-[var(--rule-base)] bg-[var(--surface-sunken)] rounded-b-2xl">
          <button
            type="button"
            onClick={() => {
              const printArea = document.getElementById("oc-print-area");
              if (printArea) {
                const w = window.open("", "_blank");
                if (w) {
                  w.document.write(
                    "<html><head><title>OC</title><style>" +
                      "body{font-family:system-ui;margin:2rem}" +
                      "table{width:100%;border-collapse:collapse}" +
                      "th,td{padding:8px;text-align:left}" +
                      "th{border-bottom:2px solid #ddd}" +
                      "td{border-bottom:1px solid #eee}" +
                      ".text-right{text-align:right}" +
                      ".font-mono{font-family:monospace}" +
                      ".font-bold{font-weight:bold}" +
                      "</style></head><body>"
                  );
                  w.document.write(printArea.innerHTML);
                  w.document.write("</body></html>");
                  w.document.close();
                  w.print();
                }
              }
            }}
            disabled={!selectedSupplier}
            className="flex-1 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Imprimir
          </button>
          <button
            type="button"
            onClick={handleDownloadPDF}
            disabled={!selectedSupplier}
            className="flex-1 py-2 bg-primary/10 text-white rounded-lg text-sm font-medium hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Descargar PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-[var(--text-primary)] rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
