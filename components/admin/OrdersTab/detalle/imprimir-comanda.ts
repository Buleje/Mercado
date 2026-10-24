/**
 * La COMANDA del pedido (ticket de cocina/armado), distinta de la boleta SUNAT.
 * Antes «Imprimir» y «Generar boleta» abrían el MISMO endpoint (/api/invoices):
 * botón duplicado. Ventana nueva, todos los datos escapados (Brandon 2026-06-04).
 * Salió de `OrdersDetailPanel.tsx` al partirlo (10-10).
 */
import { formatCurrency, formatDateTime } from "@/lib/format";
import type { DbOrder } from "@/lib/jsondb";

// Escapa para inyección segura en la ventana de impresión (datos internos del
// pedido, pero escapamos igual — nunca interpolar sin escapar).
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

export function printComanda(order: DbOrder): void {
  const w = window.open("", "_blank", "width=360,height=640");
  if (!w) return;
  const rows = order.items
    .map(
      (i) =>
        `<tr><td class="q">${i.quantity}×</td><td class="n">${escapeHtml(i.name)}${
          i.note ? `<div class="note">${escapeHtml(i.note)}</div>` : ""
        }</td></tr>`,
    )
    .join("");
  const ref = order.customer.reference
    ? `<br><i>Ref: ${escapeHtml(order.customer.reference)}</i>`
    : "";
  const when = escapeHtml(formatDateTime(order.createdAt));
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>Comanda #${escapeHtml(order.id.slice(-8))}</title>` +
      `<style>*{font-family:ui-monospace,Menlo,monospace;margin:0}body{padding:12px;font-size:13px;color:#000}` +
      `h1{font-size:16px;text-align:center;letter-spacing:2px}.meta{text-align:center;font-size:11px;color:#444;margin:2px 0 8px}` +
      `hr{border:0;border-top:1px dashed #000;margin:8px 0}table{width:100%;border-collapse:collapse}` +
      `td{padding:3px 0;vertical-align:top}.q{width:36px;font-weight:700}.note{font-size:11px;color:#444;font-style:italic}` +
      `.cust{font-size:12px;line-height:1.5}.total{display:flex;justify-content:space-between;font-weight:800;font-size:16px;margin-top:6px}</style>` +
      `</head><body><h1>COMANDA</h1><div class="meta">#${escapeHtml(order.id.slice(-8))} · ${when}</div><hr>` +
      `<div class="cust"><b>${escapeHtml(order.customer.name)}</b><br>${escapeHtml(order.customer.phone ?? "")}<br>` +
      `${escapeHtml(order.customer.location ?? "")}${ref}</div><hr><table>${rows}</table><hr>` +
      `<div class="total"><span>TOTAL</span><span>${formatCurrency(Number(order.total))}</span></div></body></html>`,
  );
  w.document.close();
  w.focus();
  w.print();
}
