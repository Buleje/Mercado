"use client";

import type { DbPurchaseOrder, DbSupplier } from "@/lib/jsondb";

interface PurchaseOrderPDFProps {
  order: DbPurchaseOrder;
  supplier?: DbSupplier;
}

export function printPurchaseOrder(order: DbPurchaseOrder, supplier?: DbSupplier) {
  const subtotal = order.items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
  const igv = subtotal * 0.18;
  const total = subtotal + igv;

  const orderDate = (() => {
    try {
      return new Date(order.createdAt).toLocaleDateString("es-PE", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    } catch {
      return order.createdAt;
    }
  })();

  const itemsHtml = order.items
    .map(
      (item, i) => `
      <tr style="background:${i % 2 === 0 ? "#f9fafb" : "#ffffff"}">
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#111827">${item.name}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:center;color:#374151">${item.quantity} ${item.unit}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;color:#374151">S/${item.unitCost.toFixed(2)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;font-weight:600;color:#111827">S/${(item.quantity * item.unitCost).toFixed(2)}</td>
      </tr>`
    )
    .join("");

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Orden de Compra ${order.id.slice(-8).toUpperCase()}</title>
  <style>
    @media print {
      @page { margin: 20mm; size: A4; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; background: #fff; }
    .container { max-width: 800px; margin: 0 auto; padding: 32px; }

    /* Header */
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 3px solid #00B4A6; }
    .brand-name { font-size: 24px; font-weight: 900; color: #00B4A6; }
    .brand-sub  { font-size: 11px; color: #6b7280; margin-top: 2px; }
    .brand-info { font-size: 11px; color: #6b7280; margin-top: 4px; line-height: 1.5; }
    .oc-badge   { background: #00B4A6; color: #fff; font-size: 22px; font-weight: 900; padding: 10px 20px; border-radius: 10px; text-align: right; }
    .oc-num     { font-size: 12px; font-weight: 400; margin-bottom: 2px; }

    /* Info grid */
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 28px; }
    .info-box   { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; }
    .info-box h3 { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #6b7280; letter-spacing: .05em; margin-bottom: 8px; }
    .info-row   { font-size: 13px; color: #374151; margin-bottom: 3px; }
    .info-row strong { color: #111827; }

    /* Status badge */
    .status-pendiente { background:#fef3c7; color:#92400e; }
    .status-recibido  { background:#d1fae5; color:#065f46; }
    .status-parcial   { background:#dbeafe; color:#1e40af; }
    .status-cancelado { background:#fee2e2; color:#991b1b; }
    .status-badge { display:inline-block; padding:2px 10px; border-radius:20px; font-size:11px; font-weight:700; }

    /* Table */
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    thead tr { background: #00B4A6; }
    thead th { padding: 10px 10px; text-align: left; font-size: 11px; font-weight: 700; color: #fff; text-transform: uppercase; letter-spacing: .05em; }
    thead th:not(:first-child) { text-align: right; }
    thead th:nth-child(2) { text-align: center; }

    /* Totals */
    .totals { display: flex; justify-content: flex-end; margin-bottom: 32px; }
    .totals-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; min-width: 260px; }
    .totals-row { display: flex; justify-content: space-between; font-size: 13px; color: #374151; margin-bottom: 6px; }
    .totals-row.total { border-top: 2px solid #00B4A6; margin-top: 8px; padding-top: 8px; font-size: 16px; font-weight: 900; color: #00B4A6; }

    /* Footer */
    .footer { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-top: 40px; padding-top: 24px; border-top: 1px solid #e5e7eb; }
    .sign-box { text-align: center; }
    .sign-line { border-top: 1px solid #374151; margin-bottom: 6px; margin-top: 40px; }
    .sign-label { font-size: 11px; color: #6b7280; font-weight: 600; }

    /* Conditions */
    .conditions { margin-top: 20px; padding: 12px 16px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; }
    .conditions h4 { font-size: 11px; font-weight: 700; color: #166534; margin-bottom: 6px; text-transform: uppercase; }
    .conditions ul { list-style: disc; padding-left: 16px; font-size: 11px; color: #374151; line-height: 1.6; }
  </style>
</head>
<body>
<div class="container">

  <!-- Header -->
  <div class="header">
    <div>
      <div class="brand-name">Buleje</div>
      <div class="brand-sub">Abarrotes y Delivery - Pucallpa, Peru</div>
      <div class="brand-info">
        Jr. Los Pinos 123, Pucallpa<br>
        RUC: 10XXXXXXXXXX<br>
        Tel: 061-XXXXXX
      </div>
    </div>
    <div>
      <div class="oc-badge">
        <div class="oc-num">ORDEN DE COMPRA</div>
        #${order.id.slice(-8).toUpperCase()}
      </div>
    </div>
  </div>

  <!-- Info Grid -->
  <div class="info-grid">
    <div class="info-box">
      <h3>Datos de la Orden</h3>
      <div class="info-row"><strong>N. Orden:</strong> ${order.id.slice(-8).toUpperCase()}</div>
      <div class="info-row"><strong>Fecha:</strong> ${orderDate}</div>
      <div class="info-row"><strong>Estado:</strong>
        <span class="status-badge status-${order.status}">${order.status.charAt(0).toUpperCase() + order.status.slice(1)}</span>
      </div>
      ${order.notes ? `<div class="info-row" style="margin-top:6px;font-style:italic;color:#6b7280">"${order.notes}"</div>` : ""}
    </div>
    <div class="info-box">
      <h3>Proveedor</h3>
      <div class="info-row"><strong>${supplier?.name ?? order.supplierName}</strong></div>
      ${supplier?.ruc ? `<div class="info-row">RUC: ${supplier.ruc}</div>` : ""}
      ${supplier?.address ? `<div class="info-row">${supplier.address}</div>` : ""}
      ${supplier?.phone ? `<div class="info-row">Tel: ${supplier.phone}</div>` : ""}
      ${supplier?.email ? `<div class="info-row">${supplier.email}</div>` : ""}
    </div>
  </div>

  <!-- Items Table -->
  <table>
    <thead>
      <tr>
        <th style="width:45%">Producto / Descripcion</th>
        <th style="width:18%;text-align:center">Cantidad</th>
        <th style="width:18%;text-align:right">Precio Unitario</th>
        <th style="width:19%;text-align:right">Subtotal</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>

  <!-- Totals -->
  <div class="totals">
    <div class="totals-box">
      <div class="totals-row">
        <span>Subtotal (sin IGV)</span>
        <span>S/${subtotal.toFixed(2)}</span>
      </div>
      <div class="totals-row">
        <span>IGV (18%)</span>
        <span>S/${igv.toFixed(2)}</span>
      </div>
      <div class="totals-row total">
        <span>TOTAL</span>
        <span>S/${total.toFixed(2)}</span>
      </div>
    </div>
  </div>

  <!-- Conditions -->
  <div class="conditions">
    <h4>Condiciones de la Orden</h4>
    <ul>
      <li>La mercaderia debe entregarse en las instalaciones de la bodega.</li>
      <li>El pago se realizara segun los terminos acordados con el proveedor.</li>
      <li>Cualquier discrepancia en cantidades o precios debe notificarse antes de la entrega.</li>
      <li>Esta orden tiene validez de 30 dias desde la fecha de emision.</li>
    </ul>
  </div>

  <!-- Footer / Signatures -->
  <div class="footer">
    <div class="sign-box">
      <div class="sign-line"></div>
      <div class="sign-label">Elaborado por</div>
    </div>
    <div class="sign-box">
      <div class="sign-line"></div>
      <div class="sign-label">Autorizado por</div>
    </div>
    <div class="sign-box">
      <div class="sign-line"></div>
      <div class="sign-label">Recibido / Proveedor</div>
    </div>
  </div>

</div>
</body>
</html>`;

  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) return;

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.onload = () => {
    printWindow.print();
  };
}

export default function PurchaseOrderPDF({ order, supplier }: PurchaseOrderPDFProps) {
  return (
    <button
      type="button"
      onClick={() => printPurchaseOrder(order, supplier)}
      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--data-warning-50)] text-[var(--data-warning)] hover:bg-[var(--data-warning-100)] text-xs font-bold transition-colors"
      title="Descargar / Imprimir PDF"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
      PDF
    </button>
  );
}
