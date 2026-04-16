"use client";

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
      <div className="bg-white dark:bg-gray-900 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-4" id="oc-print-area">
          {/* Header */}
          <div className="flex items-center justify-between border-b dark:border-gray-700 pb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">ORDEN DE COMPRA</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Buleje</p>
            </div>
            <div className="text-right text-sm text-gray-500 dark:text-gray-400">
              <p className="font-bold text-gray-900 dark:text-white">N° {lastOCId || "---"}</p>
              <p>Fecha: {new Date().toLocaleDateString("es-PE")}</p>
              {deliveryDate && <p>Entrega: {new Date(deliveryDate).toLocaleDateString("es-PE")}</p>}
            </div>
          </div>

          {/* Proveedor */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Proveedor</p>
            <p className="font-bold text-gray-900 dark:text-white">{selectedSupplier?.name || "---"}</p>
            {selectedSupplier?.ruc && <p className="text-sm text-gray-600 dark:text-gray-400">RUC: {selectedSupplier.ruc}</p>}
            {selectedSupplier?.phone && <p className="text-sm text-gray-600 dark:text-gray-400">Tel: {selectedSupplier.phone}</p>}
          </div>

          {/* Tabla de items */}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200 dark:border-gray-700">
                <th className="text-left py-2 font-semibold text-gray-700 dark:text-gray-300">Producto</th>
                <th className="text-right py-2 font-semibold text-gray-700 dark:text-gray-300">Cant.</th>
                <th className="text-right py-2 font-semibold text-gray-700 dark:text-gray-300">P.Unit</th>
                <th className="text-right py-2 font-semibold text-gray-700 dark:text-gray-300">Total</th>
              </tr>
            </thead>
            <tbody>
              {cart.map((item, idx) => (
                <tr key={idx} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2 text-gray-800 dark:text-gray-200">{item.product.name}</td>
                  <td className="py-2 text-right text-gray-600 dark:text-gray-400">
                    {item.quantity} {item.product.unit}
                  </td>
                  <td className="py-2 text-right font-mono text-gray-600 dark:text-gray-400">
                    S/{(item.product.costPrice ?? item.product.price).toFixed(2)}
                  </td>
                  <td className="py-2 text-right font-mono font-bold text-gray-900 dark:text-white">
                    S/{((item.product.costPrice ?? item.product.price) * item.quantity).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totales */}
          <div className="border-t-2 border-gray-200 dark:border-gray-700 pt-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Subtotal</span>
              <span className="font-mono dark:text-gray-200">S/{subtotal.toFixed(2)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm text-red-600">
                <span>Descuento {discount}%</span>
                <span className="font-mono">-S/{discountAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold border-t dark:border-gray-700 pt-2 dark:text-white">
              <span>TOTAL</span>
              <span className="font-mono text-[#00B4A6]">S/{total.toFixed(2)}</span>
            </div>
          </div>

          {/* Condiciones */}
          <div className="text-xs text-gray-500 dark:text-gray-400 border-t dark:border-gray-700 pt-3 space-y-1">
            <p><strong>Pago:</strong> {paymentMethod.replace("_", " ")}</p>
            {notes && <p><strong>Notas:</strong> {notes}</p>}
          </div>

          {/* Firma */}
          <div className="flex justify-between pt-6 mt-4 border-t dark:border-gray-700">
            <div className="text-center">
              <div className="w-40 border-b border-gray-400 dark:border-gray-600 mb-1"></div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Firma autorizada</p>
            </div>
            <div className="text-center">
              <div className="w-40 border-b border-gray-400 dark:border-gray-600 mb-1"></div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Proveedor</p>
            </div>
          </div>
        </div>

        {/* Botones del modal */}
        <div className="flex gap-2 p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-b-2xl">
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
            className="flex-1 py-2 bg-[#00B4A6] text-white rounded-lg text-sm font-medium hover:bg-[#009690] transition-colors"
          >
            Imprimir
          </button>
          <button
            type="button"
            onClick={handleDownloadPDF}
            className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            Descargar PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
