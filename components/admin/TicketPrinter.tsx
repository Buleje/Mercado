"use client";

import { useCallback } from "react";
import { Printer } from "lucide-react";
import { cn } from "@/lib/utils";

interface TicketItem {
  name: string;
  qty: number;
  price: number;
}

interface TicketData {
  orderId: string;
  customerName?: string;
  items: TicketItem[];
  subtotal: number;
  total: number;
  paymentMethod?: string;
  date?: string;
  changeAmount?: number;
  cashReceived?: number;
}

interface TicketPrinterProps {
  data: TicketData;
  className?: string;
  variant?: "icon" | "button";
}

/**
 * Generates a printable thermal ticket (58mm/80mm) using window.print().
 * Opens a new window with the receipt styled for thermal printers.
 */
export default function TicketPrinter({ data, className, variant = "button" }: TicketPrinterProps) {
  const fmt = (n: number) => `S/${n.toFixed(2)}`;

  const handlePrint = useCallback(() => {
    const now = data.date ? new Date(data.date) : new Date();
    const dateStr = now.toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const itemsHTML = data.items
      .map(
        (item) => `
        <tr>
          <td style="text-align:left">${item.qty}x ${item.name}</td>
          <td style="text-align:right">${fmt(item.price * item.qty)}</td>
        </tr>`
      )
      .join("");

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Ticket #${data.orderId.slice(0, 8)}</title>
  <style>
    @page { margin: 0; size: 80mm auto; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', monospace;
      font-size: 12px;
      width: 80mm;
      padding: 4mm;
      color: #000;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .line { border-top: 1px dashed #000; margin: 4px 0; }
    .store-name { font-size: 16px; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 1px 0; vertical-align: top; }
    .total-row td { font-weight: bold; font-size: 14px; padding-top: 4px; }
  </style>
</head>
<body>
  <div class="center">
    <div class="store-name">MI TIENDA</div>
    <div>Powered by Buleje</div>
    <div style="font-size:10px">RUC: ${process.env.NEXT_PUBLIC_RUC ?? "----------"}</div>
  </div>
  <div class="line"></div>
  <div>
    <div><strong>Ticket:</strong> #${data.orderId.slice(0, 8)}</div>
    <div><strong>Fecha:</strong> ${dateStr}</div>
    ${data.customerName ? `<div><strong>Cliente:</strong> ${data.customerName}</div>` : ""}
  </div>
  <div class="line"></div>
  <table>
    <thead>
      <tr>
        <td style="text-align:left"><strong>Producto</strong></td>
        <td style="text-align:right"><strong>Total</strong></td>
      </tr>
    </thead>
    <tbody>
      ${itemsHTML}
    </tbody>
  </table>
  <div class="line"></div>
  <table>
    <tr class="total-row">
      <td>TOTAL</td>
      <td style="text-align:right">${fmt(data.total)}</td>
    </tr>
    ${data.paymentMethod ? `<tr><td>Pago</td><td style="text-align:right">${data.paymentMethod}</td></tr>` : ""}
    ${data.cashReceived ? `<tr><td>Recibido</td><td style="text-align:right">${fmt(data.cashReceived)}</td></tr>` : ""}
    ${data.changeAmount ? `<tr><td>Vuelto</td><td style="text-align:right">${fmt(data.changeAmount)}</td></tr>` : ""}
  </table>
  <div class="line"></div>
  <div class="center" style="font-size:10px; margin-top:4px">
    Gracias por su compra
    <br>Buleje - Pucallpa
  </div>
  <script>window.onload=function(){window.print();setTimeout(function(){window.close()},500)}</script>
</body>
</html>`;

    const printWindow = window.open("", "_blank", "width=320,height=600");
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
    }
  }, [data]);

  if (variant === "icon") {
    return (
      <button
        onClick={handlePrint}
        className={cn("p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors", className)}
        title="Imprimir ticket"
      >
        <Printer className="h-4 w-4 text-gray-500 dark:text-muted" />
      </button>
    );
  }

  return (
    <button
      onClick={handlePrint}
      className={cn(
        "flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 dark:bg-surface text-gray-700 dark:text-foreground text-xs font-bold hover:bg-gray-200 dark:hover:bg-accent transition-colors",
        className
      )}
    >
      <Printer className="h-3.5 w-3.5" /> Imprimir ticket
    </button>
  );
}
